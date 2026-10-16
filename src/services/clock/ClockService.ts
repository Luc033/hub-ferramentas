export type ClockStatus = 'idle' | 'ready' | 'running' | 'paused' | 'alarming'
export type ClockMode = 'timer' | 'pomodoro'

export interface ClockState {
  status: ClockStatus
  mode: ClockMode
  durationMs: number
  remainingMs: number
  startedAt: number | null
  endAt: number | null
  finishedAt: number | null
  notificationSent: boolean
  runId: string | null
  taskId: string | null
  taskTitle: string | null
}

export function shouldConfirmClockReplacement(state: ClockState, nextMode: ClockMode) {
  if (state.status === 'idle') return false
  if (state.mode !== nextMode) return true
  return state.status === 'running' || state.status === 'paused'
}

export function hasConfiguredClockSession(state: ClockState) { return state.status !== 'idle' }

const STORAGE_KEY = 'hub.timer.session.v1'
const EMPTY_STATE: ClockState = { status: 'idle', mode: 'timer', durationMs: 0, remainingMs: 0, startedAt: null, endAt: null, finishedAt: null, notificationSent: false, runId: null, taskId: null, taskTitle: null }

function createRunId(now: number) {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`
}

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
    if (this.state.status === 'alarming') this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state))
    if (this.state.status === 'running') { this.sync(); this.startTicker() }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  setDuration(milliseconds: number, mode: ClockMode = 'timer') {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error('Informe um tempo maior que zero.')
    this.configureDuration(milliseconds, mode)
  }

  configureDuration(milliseconds: number, mode: ClockMode = 'timer') {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Informe uma duração válida.')
    this.stopTicker()
    const keepTask = this.state.mode === mode
    this.state = { status: milliseconds > 0 ? 'ready' : 'idle', mode, durationMs: milliseconds, remainingMs: milliseconds, startedAt: null, endAt: null, finishedAt: null, notificationSent: false, runId: null, taskId: keepTask ? this.state.taskId : null, taskTitle: keepTask ? this.state.taskTitle : null }
    this.commit()
  }

  start() {
    if (!['ready', 'paused'].includes(this.state.status) || this.state.remainingMs <= 0) return
    const now = this.now()
    this.state = { ...this.state, status: 'running', startedAt: this.state.startedAt ?? now, endAt: now + this.state.remainingMs, finishedAt: null, notificationSent: false, runId: this.state.status === 'paused' && this.state.runId ? this.state.runId : createRunId(now) }
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
  restoreConfiguredDuration() {
    if (this.state.durationMs <= 0) { this.reset(); return }
    this.stopTicker()
    this.state = { ...this.state, status: 'ready', remainingMs: this.state.durationMs, startedAt: null, endAt: null, finishedAt: null, notificationSent: false, runId: null }
    this.commit()
  }
  stopAlarm() { if (this.state.status === 'alarming') this.restoreConfiguredDuration() }
  associateTask(mode: ClockMode, taskId: string, taskTitle: string) {
    this.stopTicker()
    this.state = { ...EMPTY_STATE, mode, taskId, taskTitle }
    this.commit()
  }
  renameAssociatedTask(taskId: string, taskTitle: string) {
    if (this.state.taskId !== taskId) return
    this.state = { ...this.state, taskTitle }
    this.commit()
  }
  clearTask(taskId?: string) {
    if (taskId && this.state.taskId !== taskId) return
    this.state = { ...this.state, taskId: null, taskTitle: null }
    this.commit()
  }
  markNotificationSent() {
    if (this.state.status !== 'alarming' || this.state.notificationSent) return
    this.state = { ...this.state, notificationSent: true }
    this.commit()
  }
  sync = () => {
    if (this.state.status !== 'running' || this.state.endAt === null) return
    const remainingMs = Math.max(0, this.state.endAt - this.now())
    if (remainingMs === 0) {
      this.stopTicker()
      this.state = { ...this.state, status: 'alarming', remainingMs: 0, endAt: null, finishedAt: this.now(), notificationSent: false }
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
    if (this.state.status === 'idle' && !this.state.taskId) this.storage?.removeItem(STORAGE_KEY)
    else this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state))
    this.emit()
  }
  private restore(): ClockState {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (!raw) return { ...EMPTY_STATE }
      const parsed = JSON.parse(raw) as ClockState
      if (!['idle', 'ready', 'running', 'paused', 'alarming'].includes(parsed.status) || !Number.isFinite(parsed.remainingMs)) return { ...EMPTY_STATE }
      const mode: ClockMode = parsed.mode === 'pomodoro' ? 'pomodoro' : 'timer'
      const legacyRunId = parsed.status === 'running' || parsed.status === 'paused' || parsed.status === 'alarming' ? `legacy-${mode}-${parsed.startedAt ?? 'unknown'}-${parsed.durationMs}` : null
      const normalized = { ...parsed, mode, notificationSent: Boolean(parsed.notificationSent), runId: typeof parsed.runId === 'string' ? parsed.runId : legacyRunId, taskId: typeof parsed.taskId === 'string' ? parsed.taskId : null, taskTitle: typeof parsed.taskTitle === 'string' ? parsed.taskTitle : null }
      if (normalized.status === 'running' && normalized.endAt !== null && normalized.endAt <= this.now()) return { ...normalized, status: 'alarming', remainingMs: 0, endAt: null, finishedAt: this.now(), notificationSent: false }
      return normalized
    } catch { return { ...EMPTY_STATE } }
  }
}

export const clockService = new ClockService()
