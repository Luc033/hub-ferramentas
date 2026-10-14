export type ClockStatus = 'idle' | 'ready' | 'running' | 'paused' | 'alarming'

export interface ClockState {
  status: ClockStatus
  durationMs: number
  remainingMs: number
  startedAt: number | null
  endAt: number | null
  finishedAt: number | null
}

const STORAGE_KEY = 'hub.timer.session.v1'
const EMPTY_STATE: ClockState = { status: 'idle', durationMs: 0, remainingMs: 0, startedAt: null, endAt: null, finishedAt: null }

export function formatDuration(milliseconds: number) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export class ClockService {
  private state: ClockState
  private listeners = new Set<() => void>()
  private interval: ReturnType<typeof setInterval> | null = null
  private now: () => number
  private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null

  constructor(options: { now?: () => number; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null } = {}) {
    this.now = options.now ?? Date.now
    this.storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage
    this.state = this.restore()
    if (this.state.status === 'running') { this.sync(); this.startTicker() }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  setDuration(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error('Informe um tempo maior que zero.')
    this.state = { status: 'ready', durationMs: milliseconds, remainingMs: milliseconds, startedAt: null, endAt: null, finishedAt: null }
    this.commit()
  }

  start() {
    if (!['ready', 'paused'].includes(this.state.status) || this.state.remainingMs <= 0) return
    const now = this.now()
    this.state = { ...this.state, status: 'running', startedAt: now, endAt: now + this.state.remainingMs, finishedAt: null }
    this.commit()
    this.startTicker()
  }

  pause() {
    if (this.state.status !== 'running') return
    this.sync()
    if (this.state.status !== 'running') return
    this.state = { ...this.state, status: 'paused', endAt: null }
    this.stopTicker()
    this.commit()
  }

  reset() { this.stopTicker(); this.state = { ...EMPTY_STATE }; this.commit() }
  stopAlarm() { if (this.state.status === 'alarming') this.reset() }
  sync = () => {
    if (this.state.status !== 'running' || this.state.endAt === null) return
    const remainingMs = Math.max(0, this.state.endAt - this.now())
    if (remainingMs === 0) {
      this.stopTicker()
      this.state = { ...this.state, status: 'alarming', remainingMs: 0, endAt: null, finishedAt: this.now() }
      this.commit()
      window.dispatchEvent(new CustomEvent('timer:finished'))
    } else {
      this.state = { ...this.state, remainingMs }
      this.emit()
    }
  }

  destroy() { this.stopTicker(); this.listeners.clear() }
  private startTicker() { if (!this.interval) this.interval = setInterval(this.sync, 250) }
  private stopTicker() { if (this.interval) { clearInterval(this.interval); this.interval = null } }
  private emit() { this.listeners.forEach((listener) => listener()) }
  private commit() {
    if (this.state.status === 'idle') this.storage?.removeItem(STORAGE_KEY)
    else this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state))
    this.emit()
  }
  private restore(): ClockState {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (!raw) return { ...EMPTY_STATE }
      const parsed = JSON.parse(raw) as ClockState
      if (!['idle', 'ready', 'running', 'paused', 'alarming'].includes(parsed.status) || !Number.isFinite(parsed.remainingMs)) return { ...EMPTY_STATE }
      if (parsed.status === 'running' && parsed.endAt !== null && parsed.endAt <= this.now()) return { ...parsed, status: 'alarming', remainingMs: 0, endAt: null, finishedAt: this.now() }
      return parsed
    } catch { return { ...EMPTY_STATE } }
  }
}

export const clockService = new ClockService()
