class AudioService {
  private context: AudioContext | null = null
  private alarmInterval: ReturnType<typeof setInterval> | null = null
  private alarmTimeout: ReturnType<typeof setTimeout> | null = null
  private enabled = true
  private alarmVolume = .6

  configure(enabled: boolean, alarmVolume: number) {
    this.enabled = enabled
    this.alarmVolume = Math.min(1, Math.max(0, alarmVolume / 100))
    if (!enabled || this.alarmVolume === 0) this.stopAlarm()
  }

  unlock() {
    const AudioContextClass = window.AudioContext
    if (!this.context) this.context = new AudioContextClass()
    if (this.context.state === 'suspended') void this.context.resume()
  }

  playCheck(complete = false) {
    if (!this.enabled) return
    try {
      this.unlock()
      const frequencies = complete ? [523.25, 659.25, 783.99, 1046.5] : [600, 1200]
      frequencies.forEach((frequency, index) => this.tone(frequency, index * .1, complete ? 'triangle' : 'sine', .12))
    } catch { /* A gravação nunca depende do áudio. */ }
  }

  startAlarm() {
    if (!this.enabled || this.alarmVolume === 0) return
    try {
      this.unlock()
      if (this.alarmInterval) return
      const pattern = () => [0, .15, .3, .45].forEach((offset) => this.tone(880, offset, 'square', .1, .36 * this.alarmVolume))
      pattern()
      this.alarmInterval = setInterval(pattern, 1000)
      this.alarmTimeout = setTimeout(() => this.stopAlarm(), 60_000)
    } catch { /* A indicação visual continua disponível. */ }
  }

  stopAlarm() {
    if (this.alarmInterval) clearInterval(this.alarmInterval)
    if (this.alarmTimeout) clearTimeout(this.alarmTimeout)
    this.alarmInterval = null
    this.alarmTimeout = null
  }

  private tone(frequency: number, offset: number, type: OscillatorType, duration: number, volume = .14) {
    if (!this.context) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const start = this.context.currentTime + offset
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(.001, start + duration)
    oscillator.connect(gain).connect(this.context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration)
  }
}

export const audioService = new AudioService()
