import { readStoredSettings } from '../../services/settings/settingsStorage'
import { toLocalDateKey } from '../../lib/date'
import { clockService, type ClockService } from '../../services/clock/ClockService'

export type PomodoroPhase = 'focus' | 'short-break' | 'long-break'

export interface PomodoroState {
  phase: PomodoroPhase
  completedInCycle: number
  completedByDate: Record<string, number>
  transitionMessage: string | null
  taskRecordError: string | null
  lastHandledFinishAt: number | null
}

const STORAGE_KEY = 'hub.pomodoro.v1'
const INITIAL_STATE: PomodoroState = { phase: 'focus', completedInCycle: 0, completedByDate: {}, transitionMessage: null, taskRecordError: null, lastHandledFinishAt: null }

const phaseMinutes = (phase: PomodoroPhase) => {
  const settings = readStoredSettings()
  if (phase === 'focus') return settings.focusMinutes
  if (phase === 'short-break') return settings.shortBreakMinutes
  return settings.longBreakMinutes
}

export class PomodoroService {
  private state: PomodoroState
  private listeners = new Set<() => void>()
  private transitionTimer: ReturnType<typeof setTimeout> | null = null
  private clock: ClockService
  private storage: Pick<Storage, 'getItem' | 'setItem'>

  constructor(options: { clock?: ClockService; storage?: Pick<Storage, 'getItem' | 'setItem'>; listen?: boolean } = {}) {
    this.clock = options.clock ?? clockService
    this.storage = options.storage ?? localStorage
    this.state = this.restore()
    if (options.listen !== false && typeof window !== 'undefined') window.addEventListener('timer:finished', this.handleClockFinished)
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  completedToday = () => this.state.completedByDate[toLocalDateKey()] ?? 0

  prepare(startImmediately = false) {
    this.clock.setDuration(phaseMinutes(this.state.phase) * 60_000, 'pomodoro')
    if (startImmediately) this.clock.start()
  }

  start() {
    const clock = this.clock.getSnapshot()
    if (clock.mode !== 'pomodoro' || clock.status === 'idle' || clock.status === 'alarming') this.prepare(false)
    this.clock.start()
  }

  pause() { if (this.clock.getSnapshot().mode === 'pomodoro') this.clock.pause() }
  restart() { this.prepare(true) }
  dismissTaskRecordError() { if (this.state.taskRecordError) { this.state = { ...this.state, taskRecordError: null }; this.commit() } }

  skipBreak() {
    if (this.state.phase === 'focus') return
    this.state = { ...this.state, phase: 'focus', transitionMessage: null }
    this.commit()
    this.prepare(readStoredSettings().pomodoroAutoStart)
  }

  endCycle() {
    if (this.transitionTimer) clearTimeout(this.transitionTimer)
    this.transitionTimer = null
    if (this.clock.getSnapshot().mode === 'pomodoro') this.clock.reset()
    this.state = { ...INITIAL_STATE, completedByDate: this.state.completedByDate }
    this.commit()
  }

  reconcileClock() {
    const clock = this.clock.getSnapshot()
    if (clock.mode !== 'pomodoro' || clock.status !== 'alarming') return
    if (clock.finishedAt !== null && this.state.lastHandledFinishAt === clock.finishedAt) this.scheduleNextPhase()
    else this.handleClockFinished()
  }

  private handleClockFinished = () => {
    const clock = this.clock.getSnapshot()
    if (clock.mode !== 'pomodoro' || this.transitionTimer) return
    if (clock.finishedAt !== null && this.state.lastHandledFinishAt === clock.finishedAt) { this.scheduleNextPhase(); return }
    const current = this.state.phase
    let next: PomodoroPhase
    let message: string
    let completedInCycle = this.state.completedInCycle
    const completedByDate = { ...this.state.completedByDate }

    if (current === 'focus') {
      const focusesPerCycle = readStoredSettings().focusesPerCycle
      completedInCycle += 1
      const today = toLocalDateKey()
      completedByDate[today] = (completedByDate[today] ?? 0) + 1
      next = completedInCycle >= focusesPerCycle ? 'long-break' : 'short-break'
      message = next === 'long-break' ? `${focusesPerCycle} foco(s) concluído(s). Hora da pausa longa.` : 'Foco concluído. Hora de uma pausa curta.'
      if (clock.taskId) this.recordTaskFocus(clock.taskId, clock.durationMs / 60_000)
    } else {
      next = 'focus'
      message = current === 'long-break' ? 'Pausa longa concluída. Um novo ciclo pode começar.' : 'Pausa concluída. Hora de focar.'
      if (current === 'long-break') completedInCycle = 0
    }

    this.state = { phase: next, completedInCycle, completedByDate, transitionMessage: message, taskRecordError: null, lastHandledFinishAt: clock.finishedAt }
    this.commit()
    this.scheduleNextPhase()
  }

  private scheduleNextPhase() {
    if (this.transitionTimer) return
    this.transitionTimer = setTimeout(() => {
      this.transitionTimer = null
      this.state = { ...this.state, transitionMessage: null }
      this.commit()
      this.prepare(readStoredSettings().pomodoroAutoStart)
    }, 1500)
  }

  private commit() {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    this.listeners.forEach((listener) => listener())
  }
  private recordTaskFocus(taskId: string, minutes: number) {
    void import('../../services/db/tasksRepository').then(({ tasksRepository }) => tasksRepository.recordFocus(taskId, minutes)).catch((reason) => {
      this.state = { ...this.state, taskRecordError: reason instanceof Error ? reason.message : 'Não foi possível registrar o foco na tarefa.' }
      this.commit()
    })
  }
  private restore(): PomodoroState {
    try {
      const value = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '') as Partial<PomodoroState>
      return {
        phase: ['focus', 'short-break', 'long-break'].includes(String(value.phase)) ? value.phase as PomodoroPhase : 'focus',
        completedInCycle: Number.isInteger(value.completedInCycle) ? Math.min(readStoredSettings().focusesPerCycle, Math.max(0, value.completedInCycle!)) : 0,
        completedByDate: value.completedByDate && typeof value.completedByDate === 'object' ? value.completedByDate : {},
        transitionMessage: null,
        taskRecordError: null,
        lastHandledFinishAt: typeof value.lastHandledFinishAt === 'number' && Number.isFinite(value.lastHandledFinishAt) ? value.lastHandledFinishAt : null,
      }
    } catch { return { ...INITIAL_STATE } }
  }
}

export const pomodoroService = new PomodoroService()
