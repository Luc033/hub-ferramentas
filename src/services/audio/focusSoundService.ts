export type FocusSound = 'white' | 'rain' | 'waves'
export type SoundStatus = 'stopped' | 'playing' | 'paused'
interface SoundState { sound: FocusSound | null; status: SoundStatus; volume: number }

class FocusSoundService {
  private state: SoundState = { sound: null, status: 'stopped', volume: 30 }
  private listeners = new Set<() => void>()
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private master: GainNode | null = null
  private extras: AudioNode[] = []
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  async play(sound: FocusSound) {
    this.stopNodes()
    if (!this.context) this.context = new AudioContext()
    if (this.context.state === 'suspended') await this.context.resume()
    const length = this.context.sampleRate * 2
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1
    this.source = this.context.createBufferSource(); this.source.buffer = buffer; this.source.loop = true
    this.master = this.context.createGain(); this.master.gain.value = this.state.volume / 100
    if (sound === 'white') this.source.connect(this.master)
    else {
      const filter = this.context.createBiquadFilter(); filter.type = sound === 'rain' ? 'bandpass' : 'lowpass'; filter.frequency.value = sound === 'rain' ? 1800 : 500; filter.Q.value = sound === 'rain' ? .7 : 1.2
      this.source.connect(filter).connect(this.master); this.extras.push(filter)
      if (sound === 'waves') {
        const lfo = this.context.createOscillator(); const depth = this.context.createGain(); lfo.frequency.value = .12; depth.gain.value = .18; lfo.connect(depth).connect(this.master.gain); lfo.start(); this.extras.push(lfo, depth)
      }
    }
    this.master.connect(this.context.destination); this.source.start()
    this.state = { ...this.state, sound, status: 'playing' }; this.emit()
  }
  async pause() { if (this.context && this.state.status === 'playing') { await this.context.suspend(); this.state = { ...this.state, status: 'paused' }; this.emit() } }
  async resume() { if (this.context && this.state.status === 'paused') { await this.context.resume(); this.state = { ...this.state, status: 'playing' }; this.emit() } }
  stop() { this.stopNodes(); this.state = { ...this.state, sound: null, status: 'stopped' }; this.emit() }
  setVolume(volume: number) { const safe = Math.min(100, Math.max(0, volume)); this.state = { ...this.state, volume: safe }; if (this.master && this.context) this.master.gain.setTargetAtTime(safe / 100, this.context.currentTime, .03); this.emit() }
  private stopNodes() { try { this.source?.stop() } catch { /* já encerrado */ } this.source?.disconnect(); this.master?.disconnect(); this.extras.forEach((node) => node.disconnect()); this.source = null; this.master = null; this.extras = [] }
  private emit() { this.listeners.forEach((listener) => listener()) }
}

export const focusSoundService = new FocusSoundService()
