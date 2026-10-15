import type { FocusPlaylist } from '../../features/focus-sounds/types'

export type FocusSound = 'white' | 'rain' | 'waves'
export type SoundStatus = 'stopped' | 'loading' | 'playing' | 'paused' | 'error'
export type FocusSource =
  | { kind: 'ambient'; id: FocusSound; title: string; provider: 'Web Audio' }
  | { kind: 'radio'; id: 'fluxfm-chillhop'; title: string; provider: 'FluxFM'; url: string }
  | { kind: 'soundcloud'; id: string; title: string; provider: 'SoundCloud'; url: string; author: string }

export interface FocusAudioState { source: FocusSource | null; status: SoundStatus; volume: number; muted: boolean; error: string | null; attempt: number; desiredPlaying: boolean; controllerReady: boolean }
export interface SoundCloudController { play(): void; pause(): void; next(): void; prev(): void; setVolume(volume: number): void }

const ambientTitles: Record<FocusSound, string> = { white: 'Ruído Branco', rain: 'Chuva Sintética', waves: 'Ondas Sintéticas' }
export const FLUXFM_STREAM = 'https://channels.fluxfm.de/chillhop/externalembedflxhp/stream.mp3'
const AMBIENT_FADE_SECONDS = .08

class FocusSoundService {
  private state: FocusAudioState = { source: null, status: 'stopped', volume: 30, muted: false, error: null, attempt: 0, desiredPlaying: false, controllerReady: false }
  private listeners = new Set<() => void>()
  private context: AudioContext | null = null
  private sourceNode: AudioBufferSourceNode | null = null
  private master: GainNode | null = null
  private extras: AudioNode[] = []
  private radio: HTMLAudioElement | null = null
  private soundCloud: SoundCloudController | null = null

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  async play(sound: FocusSound) { return this.playAmbient(sound) }
  async playAmbient(sound: FocusSound) {
    this.stopCurrent()
    try {
      if (!this.context) this.context = new AudioContext()
      if (this.context.state === 'suspended') await this.context.resume()
      const length = this.context.sampleRate * 2
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1
      this.sourceNode = this.context.createBufferSource(); this.sourceNode.buffer = buffer; this.sourceNode.loop = true
      this.master = this.context.createGain()
      this.master.gain.setValueAtTime(0, this.context.currentTime)
      if (sound === 'white') this.sourceNode.connect(this.master)
      else {
        const filter = this.context.createBiquadFilter(); filter.type = sound === 'rain' ? 'bandpass' : 'lowpass'; filter.frequency.value = sound === 'rain' ? 1800 : 500; filter.Q.value = sound === 'rain' ? .7 : 1.2
        if (sound === 'waves') {
          const textureGain = this.context.createGain(); textureGain.gain.value = .72
          const lfo = this.context.createOscillator(); const depth = this.context.createGain()
          lfo.frequency.value = .12; depth.gain.value = .18
          this.sourceNode.connect(filter).connect(textureGain).connect(this.master)
          lfo.connect(depth).connect(textureGain.gain); lfo.start(); this.extras.push(filter, textureGain, lfo, depth)
        } else { this.sourceNode.connect(filter).connect(this.master); this.extras.push(filter) }
      }
      this.master.connect(this.context.destination); this.sourceNode.start()
      this.master.gain.linearRampToValueAtTime(this.effectiveVolume() / 100, this.context.currentTime + AMBIENT_FADE_SECONDS)
      this.update({ source: { kind: 'ambient', id: sound, title: ambientTitles[sound], provider: 'Web Audio' }, status: 'playing', error: null, desiredPlaying: true, controllerReady: false })
    } catch { this.stopCurrent(); this.fail('O navegador bloqueou o áudio. Interaja com a página e tente novamente.') }
  }

  async playRadio() {
    this.stopCurrent()
    const audio = this.getRadio(); audio.src = FLUXFM_STREAM; audio.volume = this.effectiveVolume() / 100
    this.update({ source: { kind: 'radio', id: 'fluxfm-chillhop', title: 'FluxFM Chillhop', provider: 'FluxFM', url: FLUXFM_STREAM }, status: 'loading', error: null, desiredPlaying: true, controllerReady: false })
    try { await audio.play() } catch { this.fail('Não foi possível iniciar a FluxFM. Verifique a conexão ou a permissão de reprodução e tente novamente.') }
  }

  playSoundCloud(playlist: FocusPlaylist) {
    this.stopCurrent()
    this.update({ source: { kind: 'soundcloud', id: playlist.id, title: playlist.title, provider: 'SoundCloud', url: playlist.url, author: playlist.author }, status: 'loading', error: null, attempt: this.state.attempt + 1, desiredPlaying: true, controllerReady: false })
  }
  attachSoundCloud(controller: SoundCloudController, expectedUrl: string, expectedAttempt: number) {
    if (this.state.source?.kind !== 'soundcloud' || this.state.source.url !== expectedUrl || this.state.attempt !== expectedAttempt) return
    this.soundCloud = controller; controller.setVolume(this.effectiveVolume()); this.update({ controllerReady: true })
    if (this.state.desiredPlaying) controller.play(); else controller.pause()
  }
  detachSoundCloud(controller: SoundCloudController) { if (this.soundCloud === controller) { this.soundCloud = null; if (this.state.source?.kind === 'soundcloud') this.update({ controllerReady: false }) } }
  soundCloudPlaying(controller: SoundCloudController) { if (this.isCurrentSoundCloud(controller)) { if (!this.state.desiredPlaying) { controller.pause(); return } this.update({ status: 'playing', error: null }) } }
  soundCloudPaused(controller: SoundCloudController) { if (this.isCurrentSoundCloud(controller) && this.state.status !== 'stopped') this.update({ status: 'paused' }) }
  soundCloudFinished(controller: SoundCloudController) { if (this.isCurrentSoundCloud(controller)) this.update({ status: 'paused' }) }
  soundCloudError(controller?: SoundCloudController) { if (this.state.source?.kind === 'soundcloud' && (!controller || this.isCurrentSoundCloud(controller))) { this.update({ controllerReady: false }); this.fail('A playlist foi removida, não permite incorporação ou está temporariamente indisponível.') } }

  async pause() {
    if (!['playing', 'loading'].includes(this.state.status)) return
    this.update({ desiredPlaying: false })
    if (this.state.source?.kind === 'ambient') {
      const source = this.sourceNode; this.fadeAmbientToZero()
      await new Promise((resolve) => globalThis.setTimeout(resolve, AMBIENT_FADE_SECONDS * 1_000))
      if (source !== this.sourceNode || this.state.source?.kind !== 'ambient') return
      await this.context?.suspend()
    } else if (this.state.source?.kind === 'radio') this.radio?.pause()
    else this.soundCloud?.pause()
    this.update({ status: 'paused' })
  }
  async resume() {
    if (!this.state.source || !['paused', 'error'].includes(this.state.status)) return
    try {
      this.update({ desiredPlaying: true })
      if (this.state.source.kind === 'ambient') { await this.context?.resume(); this.fadeAmbientToVolume() }
      else if (this.state.source.kind === 'radio') await this.getRadio().play()
      else this.soundCloud?.play()
      this.update({ status: this.state.source.kind === 'soundcloud' ? 'loading' : 'playing', error: null })
    } catch { this.fail('A reprodução foi bloqueada. Tente novamente após interagir com a página.') }
  }
  retry() {
    const current = this.state.source; if (!current) return
    if (current.kind === 'radio') void this.playRadio()
    else if (current.kind === 'ambient') void this.playAmbient(current.id)
    else { this.soundCloud?.pause(); this.soundCloud = null; this.update({ status: 'loading', error: null, attempt: this.state.attempt + 1, desiredPlaying: true, controllerReady: false }) }
  }
  skip(direction: 'next' | 'previous') { if (this.state.source?.kind === 'soundcloud' && this.state.controllerReady) direction === 'next' ? this.soundCloud?.next() : this.soundCloud?.prev() }
  stop() { this.stopCurrent(); this.update({ source: null, status: 'stopped', error: null, desiredPlaying: false, controllerReady: false }) }
  setVolume(volume: number) { const safe = Math.min(100, Math.max(0, volume)); if (safe !== this.state.volume) this.update({ volume: safe }); this.applyVolume() }
  setMuted(muted: boolean) { if (muted !== this.state.muted) this.update({ muted }); this.applyVolume() }

  private getRadio() {
    if (this.radio) return this.radio
    const audio = new Audio(); audio.preload = 'none'
    audio.addEventListener('playing', () => { if (this.state.source?.kind === 'radio') this.update({ status: 'playing', error: null }) })
    audio.addEventListener('waiting', () => { if (this.state.source?.kind === 'radio') this.update({ status: 'loading' }) })
    audio.addEventListener('error', () => { if (this.state.source?.kind === 'radio') this.fail('A rádio está indisponível ou a conexão foi interrompida.') })
    this.radio = audio; return audio
  }
  private isCurrentSoundCloud(controller: SoundCloudController) { return this.state.source?.kind === 'soundcloud' && this.soundCloud === controller }
  private effectiveVolume() { return this.state.muted ? 0 : this.state.volume }
  private applyVolume() { const effective = this.effectiveVolume(); if (this.master && this.context) { this.master.gain.cancelScheduledValues(this.context.currentTime); this.master.gain.setTargetAtTime(effective / 100, this.context.currentTime, .03) } if (this.radio) this.radio.volume = effective / 100; this.soundCloud?.setVolume(effective) }
  private fadeAmbientToZero() {
    if (!this.master || !this.context) return
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now); this.master.gain.setValueAtTime(this.master.gain.value, now); this.master.gain.linearRampToValueAtTime(0, now + AMBIENT_FADE_SECONDS)
  }
  private fadeAmbientToVolume() {
    if (!this.master || !this.context) return
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now); this.master.gain.setValueAtTime(this.master.gain.value, now); this.master.gain.linearRampToValueAtTime(this.effectiveVolume() / 100, now + AMBIENT_FADE_SECONDS)
  }
  private stopCurrent() {
    const source = this.sourceNode; const master = this.master; const extras = this.extras; const context = this.context
    this.sourceNode = null; this.master = null; this.extras = []
    if (source) {
      const stopAt = context ? context.currentTime + AMBIENT_FADE_SECONDS : 0
      if (master && context) {
        const now = context.currentTime
        master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(0, stopAt)
      }
      try { source.stop(stopAt) } catch { /* nó já encerrado */ }
      extras.forEach((node) => { try { (node as AudioNode & { stop?: (when?: number) => void }).stop?.(stopAt) } catch { /* nó já encerrado */ } })
      globalThis.setTimeout(() => { source.disconnect(); master?.disconnect(); extras.forEach((node) => node.disconnect()) }, AMBIENT_FADE_SECONDS * 1_000 + 20)
    } else { master?.disconnect(); extras.forEach((node) => node.disconnect()) }
    if (this.radio) { this.radio.pause(); this.radio.removeAttribute('src'); this.radio.load() }
    this.soundCloud?.pause(); this.soundCloud = null
  }
  private fail(message: string) { this.update({ status: 'error', error: message }) }
  private update(change: Partial<FocusAudioState>) { this.state = { ...this.state, ...change }; this.listeners.forEach((listener) => listener()) }
}

export const focusSoundService = new FocusSoundService()
