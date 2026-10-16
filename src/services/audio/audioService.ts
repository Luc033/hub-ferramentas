import { alarmSoundsRepository } from '../db/alarmSoundsRepository'
import { NATIVE_ALARM_SOUNDS, type AlarmSoundId, type CustomAlarmSound, type NativeAlarmSoundId } from './alarmSounds'

type AudioSource = OscillatorNode | AudioBufferSourceNode
type Listener = () => void

interface Tone {
  at: number
  frequency: number
  duration: number
  type: OscillatorType
  gain?: number
  attack?: number
  filter?: number
}

const PATTERNS: Record<NativeAlarmSoundId, { duration: number; tones: Tone[] }> = {
  original: { duration: 1.25, tones: [659.25, 783.99, 987.77, 783.99, 987.77].map((frequency, index) => ({ at: index * .22, frequency, duration: .18, type: 'sine', gain: .32 })) },
  aurora: { duration: 2.25, tones: [261.63, 329.63, 392, 523.25].map((frequency, index) => ({ at: index * .42, frequency, duration: .9, type: 'triangle', gain: .18, attack: .08, filter: 1800 })) },
  'digital-pulse': { duration: 1.55, tones: [440, 880, 554.37, 1108.73, 659.25, 1318.51].map((frequency, index) => ({ at: index * .19, frequency, duration: .11, type: index % 2 ? 'square' : 'sawtooth', gain: .12, attack: .008, filter: 2400 })) },
  'zen-bell': { duration: 3.4, tones: [392, 587.33, 493.88].flatMap((frequency, index) => [
    { at: index * .82, frequency, duration: 1.45, type: 'sine' as const, gain: .17, attack: .012 },
    { at: index * .82, frequency: frequency * 2.01, duration: 1.05, type: 'sine' as const, gain: .055, attack: .008 },
  ]) },
  retro: { duration: 1.45, tones: [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51].map((frequency, index) => ({ at: index * .135, frequency, duration: .105, type: 'square', gain: .095, attack: .004 })) },
  crystal: { duration: 2.65, tones: [1318.51, 1046.5, 880, 659.25].flatMap((frequency, index) => [
    { at: index * .42, frequency, duration: 1.1, type: 'sine' as const, gain: .13, attack: .009 },
    { at: index * .42, frequency: frequency * 2, duration: .72, type: 'sine' as const, gain: .035, attack: .006 },
  ]) },
}

export class AudioService {
  private context: AudioContext | null = null
  private sources = new Set<AudioSource>()
  private handledAlarmRunId: string | null = null
  private enabled = true
  private alarmVolume = .6
  private selectedSoundId: AlarmSoundId = 'original'
  private generation = 0
  private repeatTimer: ReturnType<typeof setTimeout> | null = null
  private previewTimer: ReturnType<typeof setTimeout> | null = null
  private previewSoundId: AlarmSoundId | null = null
  private lastError: string | null = null
  private listeners = new Set<Listener>()
  private customBuffer: { updatedAt: number; buffer: AudioBuffer } | null = null

  configure(enabled: boolean, alarmVolume: number, selectedSoundId: AlarmSoundId = 'original') {
    this.enabled = enabled
    this.alarmVolume = Math.min(1, Math.max(0, alarmVolume / 100))
    this.selectedSoundId = selectedSoundId
    if (selectedSoundId !== 'custom') this.lastError = null
    if (!enabled || this.alarmVolume === 0) this.stopAlarm()
  }

  listSounds() { return NATIVE_ALARM_SOUNDS }
  getPreviewSoundId() { return this.previewSoundId }
  getLastError() { return this.lastError }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  async unlock() {
    try {
      const AudioContextClass = window.AudioContext
      if (!AudioContextClass) return false
      if (!this.context) this.context = new AudioContextClass()
      if (this.context.state === 'suspended') await this.context.resume()
      return this.context.state === 'running'
    } catch (reason) {
      if (import.meta.env.DEV) console.warn('Não foi possível preparar o áudio do Hub.', reason)
      return false
    }
  }

  playCheck(complete = false) {
    if (!this.enabled) return
    void this.unlock().then((ready) => {
      if (!ready) return
      const frequencies = complete ? [523.25, 659.25, 783.99, 1046.5] : [600, 1200]
      frequencies.forEach((frequency, index) => this.scheduleTone({ at: index * .1, frequency, duration: .12, type: complete ? 'triangle' : 'sine', gain: .14 }, false))
    })
  }

  async importCustomSound(file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo excede o limite de 10 MB.')
    if (!file.size || file.type && !file.type.startsWith('audio/')) throw new Error('Não foi possível utilizar esse arquivo. Selecione um áudio válido e compatível.')
    if (!await this.unlock() || !this.context) throw new Error('O navegador não conseguiu preparar a validação do áudio.')
    let buffer: AudioBuffer
    try { buffer = await this.context.decodeAudioData(await file.arrayBuffer()) }
    catch { throw new Error('Não foi possível utilizar esse arquivo. Selecione um áudio válido e compatível.') }
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Não foi possível utilizar esse arquivo. Selecione um áudio válido e compatível.')
    const record = await alarmSoundsRepository.saveCustom(file)
    this.customBuffer = { updatedAt: record.updatedAt, buffer }
    this.lastError = null
    return record
  }

  async preview(soundId: AlarmSoundId) {
    this.stopPlayback()
    if (!await this.unlock() || !this.context) return false
    const generation = this.generation
    this.previewSoundId = soundId
    this.emit()
    try {
      if (soundId === 'custom') {
        const custom = await alarmSoundsRepository.getCustom()
        if (!custom || generation !== this.generation) throw new Error('Importe um áudio personalizado antes de reproduzi-lo.')
        const buffer = await this.decodeCustom(custom)
        if (generation !== this.generation) return false
        this.playBuffer(buffer, false)
        this.previewTimer = setTimeout(() => this.stopPreview(), Math.min(5000, buffer.duration * 1000))
      } else {
        const duration = this.schedulePattern(soundId, false)
        this.previewTimer = setTimeout(() => this.stopPreview(), Math.min(5000, duration * 1000))
      }
      return true
    } catch (reason) {
      if (generation === this.generation) this.stopPreview()
      throw reason
    }
  }

  stopPreview() { this.stopPlayback() }

  async startAlarm(runId: string) {
    if (!this.enabled || this.alarmVolume === 0 || this.handledAlarmRunId === runId) return false
    this.handledAlarmRunId = runId
    this.stopPlayback()
    const generation = this.generation
    try {
      if (!await this.unlock() || !this.context || generation !== this.generation) return false
      if (this.selectedSoundId === 'custom') {
        try {
          const custom = await alarmSoundsRepository.getCustom()
          if (!custom) throw new Error('Áudio personalizado indisponível.')
          const buffer = await this.decodeCustom(custom)
          if (generation !== this.generation) return false
          this.playBuffer(buffer, true)
          return true
        } catch (reason) {
          this.lastError = 'O áudio personalizado não pôde ser carregado. O alarme original foi usado.'
          this.emit()
          if (import.meta.env.DEV) console.warn('O áudio personalizado falhou; usando o alarme original.', reason)
        }
      }
      if (generation !== this.generation) return false
      this.startNativeLoop(this.selectedSoundId === 'custom' ? 'original' : this.selectedSoundId, generation)
      return true
    } catch (reason) {
      if (import.meta.env.DEV) console.warn('Não foi possível reproduzir o alerta do temporizador.', reason)
      return false
    }
  }

  stopAlarm() { this.stopPlayback() }

  private startNativeLoop(soundId: NativeAlarmSoundId, generation: number) {
    if (generation !== this.generation) return
    const duration = this.schedulePattern(soundId, true)
    this.repeatTimer = setTimeout(() => this.startNativeLoop(soundId, generation), Math.max(100, duration * 1000 - 30))
  }

  private schedulePattern(soundId: NativeAlarmSoundId, alarm: boolean) {
    const pattern = PATTERNS[soundId]
    pattern.tones.forEach((tone) => this.scheduleTone(tone, alarm))
    return pattern.duration
  }

  private scheduleTone(tone: Tone, alarm: boolean) {
    if (!this.context) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const start = this.context.currentTime + tone.at
    const end = start + tone.duration
    oscillator.type = tone.type
    oscillator.frequency.setValueAtTime(tone.frequency, start)
    const level = (tone.gain ?? .14) * this.alarmVolume
    gain.gain.setValueAtTime(.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, level), start + (tone.attack ?? .015))
    gain.gain.exponentialRampToValueAtTime(.0001, end)
    if (tone.filter) {
      const filter = this.context.createBiquadFilter()
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(tone.filter, start)
      oscillator.connect(filter).connect(gain).connect(this.context.destination)
    } else oscillator.connect(gain).connect(this.context.destination)
    if (alarm || this.previewSoundId) this.track(oscillator)
    oscillator.start(start); oscillator.stop(end + .02)
  }

  private async decodeCustom(record: CustomAlarmSound) {
    if (this.customBuffer?.updatedAt === record.updatedAt) return this.customBuffer.buffer
    if (!this.context) throw new Error('Áudio indisponível.')
    const buffer = await this.context.decodeAudioData(record.data.slice(0))
    this.customBuffer = { updatedAt: record.updatedAt, buffer }
    return buffer
  }

  private playBuffer(buffer: AudioBuffer, loop: boolean) {
    if (!this.context) return
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    source.buffer = buffer; source.loop = loop
    gain.gain.setValueAtTime(this.alarmVolume, this.context.currentTime)
    source.connect(gain).connect(this.context.destination)
    this.track(source); source.start()
  }

  private track(source: AudioSource) {
    this.sources.add(source)
    source.onended = () => { this.sources.delete(source); try { source.disconnect() } catch { /* Já desconectado. */ } }
  }

  private stopPlayback() {
    this.generation++
    if (this.repeatTimer) clearTimeout(this.repeatTimer)
    if (this.previewTimer) clearTimeout(this.previewTimer)
    this.repeatTimer = null; this.previewTimer = null
    this.sources.forEach((source) => { try { source.stop() } catch { /* O nó já pode ter terminado. */ } try { source.disconnect() } catch { /* Já desconectado. */ } })
    this.sources.clear()
    const hadPreview = this.previewSoundId !== null
    this.previewSoundId = null
    if (hadPreview) this.emit()
  }

  private emit() { this.listeners.forEach((listener) => listener()) }
}

export const audioService = new AudioService()
