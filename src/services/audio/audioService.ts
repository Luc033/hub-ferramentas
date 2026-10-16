export class AudioService {
  private context: AudioContext | null = null
  private alarmOscillators = new Set<OscillatorNode>()
  private handledAlarmRunId: string | null = null
  private enabled = true
  private alarmVolume = .6

  configure(enabled: boolean, alarmVolume: number) {
    this.enabled = enabled
    this.alarmVolume = Math.min(1, Math.max(0, alarmVolume / 100))
    if (!enabled || this.alarmVolume === 0) this.stopAlarm()
  }

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
    try {
      void this.unlock().then((ready) => {
        if (!ready) return
        const frequencies = complete ? [523.25, 659.25, 783.99, 1046.5] : [600, 1200]
        frequencies.forEach((frequency, index) => this.tone(frequency, index * .1, complete ? 'triangle' : 'sine', .12))
      })
    } catch { /* A gravação nunca depende do áudio. */ }
  }

  async startAlarm(runId: string) {
    if (!this.enabled || this.alarmVolume === 0 || this.handledAlarmRunId === runId) return false
    this.handledAlarmRunId = runId
    try {
      if (!await this.unlock()) return false
      const notes = [659.25, 783.99, 987.77, 783.99, 987.77]
      notes.forEach((frequency, index) => this.tone(frequency, index * .22, 'sine', .18, .32 * this.alarmVolume, true))
      return true
    } catch (reason) {
      if (import.meta.env.DEV) console.warn('Não foi possível reproduzir o alerta do temporizador.', reason)
      return false
    }
  }

  stopAlarm() {
    this.alarmOscillators.forEach((oscillator) => { try { oscillator.stop() } catch { /* O nó já pode ter terminado. */ } })
    this.alarmOscillators.clear()
  }

  private tone(frequency: number, offset: number, type: OscillatorType, duration: number, volume = .14, alarm = false) {
    if (!this.context) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const start = this.context.currentTime + offset
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(.001, start + duration)
    oscillator.connect(gain).connect(this.context.destination)
    if (alarm) { this.alarmOscillators.add(oscillator); oscillator.onended = () => this.alarmOscillators.delete(oscillator) }
    oscillator.start(start)
    oscillator.stop(start + duration)
  }
}

export const audioService = new AudioService()
