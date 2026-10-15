import { ClockService, clockService } from '../../services/clock/ClockService'
import { PomodoroService, pomodoroService } from './pomodoroService'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem('hub.settings.v1', JSON.stringify({ pomodoroAutoStart: false, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 }))
  pomodoroService.endCycle()
})

afterEach(() => {
  clockService.reset()
  vi.useRealTimers()
})

test('alterna foco e pausa usando o mesmo relógio', () => {
  pomodoroService.start()
  expect(clockService.getSnapshot()).toMatchObject({ mode: 'pomodoro', status: 'running' })
  window.dispatchEvent(new CustomEvent('timer:finished'))
  expect(pomodoroService.getSnapshot()).toMatchObject({ phase: 'short-break', completedInCycle: 1 })
  vi.advanceTimersByTime(1500)
  expect(clockService.getSnapshot()).toMatchObject({ mode: 'pomodoro', status: 'ready' })
})

test('leva à pausa longa depois de quatro focos concluídos', () => {
  const finishPhase = () => {
    pomodoroService.start()
    window.dispatchEvent(new CustomEvent('timer:finished'))
    vi.advanceTimersByTime(1500)
  }
  for (let cycle = 0; cycle < 3; cycle += 1) {
    finishPhase()
    expect(pomodoroService.getSnapshot().phase).toBe('short-break')
    finishPhase()
    expect(pomodoroService.getSnapshot().phase).toBe('focus')
  }
  finishPhase()
  expect(pomodoroService.getSnapshot()).toMatchObject({ phase: 'long-break', completedInCycle: 4 })
})

test('respeita a quantidade configurada de focos por ciclo', () => {
  localStorage.setItem('hub.settings.v1', JSON.stringify({ pomodoroAutoStart: false, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, focusesPerCycle: 2 }))
  const finishPhase = () => { pomodoroService.start(); window.dispatchEvent(new CustomEvent('timer:finished')); vi.advanceTimersByTime(1500) }
  finishPhase()
  expect(pomodoroService.getSnapshot().phase).toBe('short-break')
  finishPhase()
  expect(pomodoroService.getSnapshot().phase).toBe('focus')
  finishPhase()
  expect(pomodoroService.getSnapshot()).toMatchObject({ phase: 'long-break', completedInCycle: 2 })
})

test('reconcilia uma fase vencida durante a recarga uma única vez', () => {
  const clockData = new Map<string, string>()
  const pomodoroData = new Map<string, string>()
  const clockStorage = { getItem: (key: string) => clockData.get(key) ?? null, setItem: (key: string, value: string) => { clockData.set(key, value) }, removeItem: (key: string) => { clockData.delete(key) } }
  const pomodoroStorage = { getItem: (key: string) => pomodoroData.get(key) ?? null, setItem: (key: string, value: string) => { pomodoroData.set(key, value) } }
  clockData.set('hub.timer.session.v1', JSON.stringify({ status: 'running', mode: 'pomodoro', durationMs: 60_000, remainingMs: 60_000, startedAt: 1_000, endAt: 61_000, finishedAt: null, notificationSent: false, taskId: null, taskTitle: null }))
  const restoredClock = new ClockService({ now: () => 120_000, storage: clockStorage })
  const firstLoad = new PomodoroService({ clock: restoredClock, storage: pomodoroStorage, listen: false })
  firstLoad.reconcileClock()
  expect(firstLoad.getSnapshot()).toMatchObject({ phase: 'short-break', completedInCycle: 1, lastHandledFinishAt: 120_000 })

  const reloadedClock = new ClockService({ now: () => 180_000, storage: clockStorage })
  const secondLoad = new PomodoroService({ clock: reloadedClock, storage: pomodoroStorage, listen: false })
  secondLoad.reconcileClock()
  expect(secondLoad.getSnapshot()).toMatchObject({ phase: 'short-break', completedInCycle: 1, lastHandledFinishAt: 120_000 })
  restoredClock.destroy()
  reloadedClock.destroy()
})
