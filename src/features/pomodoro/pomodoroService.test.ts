import { clockService } from '../../services/clock/ClockService'
import { pomodoroService } from './pomodoroService'

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
