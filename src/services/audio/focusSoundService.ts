import type { FocusPlaylist } from '../../features/focus-sounds/types'

export type FocusSound = 'white' | 'rain' | 'waves'
export type SoundStatus = 'stopped' | 'loading' | 'playing' | 'paused' | 'error'
export type FocusSource =
  | { kind: 'ambient'; id: FocusSound; title: string; provider: 'Web Audio' }
  | { kind: 'radio'; id: 'fluxfm-chillhop'; title: string; provider: 'FluxFM'; url: string }
  | { kind: 'soundcloud'; id: string; title: string; provider: 'SoundCloud'; url: string; author: string }

export interface FocusAudioState { source: FocusSource | null; status: SoundStatus; volume: number; muted: boolean; error: string | null; attempt: number }
export interface SoundCloudController { play(): void; pause(): void; next(): void; prev(): void; setVolume(volume: number): void }

const ambientTitles: Record<FocusSound, string> = { white: 'Ruído Branco', rain: 'Chuva Sintética', waves: 'Ondas Sintéticas' }
export const FLUXFM_STREAM = 'https://channels.fluxfm.de/chillhop/externalembedflxhp/stream.mp3'

class FocusSoundService {
  private state: FocusAudioState = { source: null, status: 'stopped', volume: 30, muted: false, error: null, attempt: 0 }
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
      this.master = this.context.createGain(); this.master.gain.value = this.effectiveVolume() / 100
      if (sound === 'white') this.sourceNode.connect(this.master)
      else {
        const filter = this.context.createBiquadFilter(); filter.type = sound === 'rain' ? 'bandpass' : 'lowpass'; filter.frequency.value = sound === 'rain' ? 1800 : 500; filter.Q.value = sound === 'rain' ? .7 : 1.2
        this.sourceNode.connect(filter).connect(this.master); this.extras.push(filter)
        if (sound === 'waves') { const lfo = this.context.createOscillator(); const depth = this.context.createGain(); lfo.frequency.value = .12; depth.gain.value = .12; lfo.connect(depth).connect(this.master.gain); lfo.start(); this.extras.push(lfo, depth) }
      }
      this.master.connect(this.context.destination); this.sourceNode.start()
      this.update({ source: { kind: 'ambient', id: sound, title: ambientTitles[sound], provider: 'Web Audio' }, status: 'playing', error: null })
    } catch { this.fail('O navegador bloqueou o áudio. Interaja com a página e tente novamente.') }
  }

  async playRadio() {
    this.stopCurrent()
    const audio = this.getRadio(); audio.src = FLUXFM_STREAM; audio.volume = this.effectiveVolume() / 100
    this.update({ source: { kind: 'radio', id: 'fluxfm-chillhop', title: 'FluxFM Chillhop', provider: 'FluxFM', url: FLUXFM_STREAM }, status: 'loading', error: null })
    try { await audio.play() } catch { this.fail('Não foi possível iniciar a FluxFM. Verifique a conexão ou a permissão de reprodução e tente novamente.') }
  }

  playSoundCloud(playlist: FocusPlaylist) {
    this.stopCurrent()
    this.update({ source: { kind: 'soundcloud', id: playlist.id, title: playlist.title, provider: 'SoundCloud', url: playlist.url, author: playlist.author }, status: 'loading', error: null, attempt: this.state.attempt + 1 })
  }
  attachSoundCloud(controller: SoundCloudController) { if (this.state.source?.kind === 'soundcloud') { this.soundCloud = controller; controller.setVolume(this.effectiveVolume()); controller.play() } }
  detachSoundCloud(controller: SoundCloudController) { if (this.soundCloud === controller) this.soundCloud = null }
  soundCloudPlaying() { if (this.state.source?.kind === 'soundcloud') this.update({ status: 'playing', error: null }) }
  soundCloudPaused() { if (this.state.source?.kind === 'soundcloud' && this.state.status !== 'stopped') this.update({ status: 'paused' }) }
  soundCloudFinished() { if (this.state.source?.kind === 'soundcloud') this.update({ status: 'paused' }) }
  soundCloudError() { if (this.state.source?.kind === 'soundcloud') this.fail('A playlist foi removida, não permite incorporação ou está temporariamente indisponível.') }

  async pause() {
    if (!['playing', 'loading'].includes(this.state.status)) return
    if (this.state.source?.kind === 'ambient') await this.context?.suspend()
    else if (this.state.source?.kind === 'radio') this.radio?.pause()
    else this.soundCloud?.pause()
    this.update({ status: 'paused' })
  }
  async resume() {
    if (!this.state.source || !['paused', 'error'].includes(this.state.status)) return
    try {
      if (this.state.source.kind === 'ambient') await this.context?.resume()
      else if (this.state.source.kind === 'radio') await this.getRadio().play()
      else this.soundCloud?.play()
      this.update({ status: this.state.source.kind === 'soundcloud' ? 'loading' : 'playing', error: null })
    } catch { this.fail('A reprodução foi bloqueada. Tente novamente após interagir com a página.') }
  }
  retry() {
    const current = this.state.source; if (!current) return
    if (current.kind === 'radio') void this.playRadio()
    else if (current.kind === 'ambient') void this.playAmbient(current.id)
    else { this.soundCloud?.pause(); this.soundCloud = null; this.update({ status: 'loading', error: null, attempt: this.state.attempt + 1 }) }
  }
  skip(direction: 'next' | 'previous') { if (this.state.source?.kind === 'soundcloud') direction === 'next' ? this.soundCloud?.next() : this.soundCloud?.prev() }
  stop() { this.stopCurrent(); this.update({ source: null, status: 'stopped', error: null }) }
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
  private effectiveVolume() { return this.state.muted ? 0 : this.state.volume }
  private applyVolume() { const effective = this.effectiveVolume(); if (this.master && this.context) this.master.gain.setTargetAtTime(effective / 100, this.context.currentTime, .03); if (this.radio) this.radio.volume = effective / 100; this.soundCloud?.setVolume(effective) }
  private stopCurrent() {
    try { this.sourceNode?.stop() } catch { /* nó já encerrado */ }
    this.sourceNode?.disconnect(); this.master?.disconnect(); this.extras.forEach((node) => node.disconnect()); this.sourceNode = null; this.master = null; this.extras = []
    if (this.radio) { this.radio.pause(); this.radio.removeAttribute('src'); this.radio.load() }
    this.soundCloud?.pause(); this.soundCloud = null
  }
  private fail(message: string) { this.update({ status: 'error', error: message }) }
  private update(change: Partial<FocusAudioState>) { this.state = { ...this.state, ...change }; this.listeners.forEach((listener) => listener()) }
}

export const focusSoundService = new FocusSoundService()
