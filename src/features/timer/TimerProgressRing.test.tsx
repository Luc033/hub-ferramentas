import { act, render, screen } from '@testing-library/react'
import { calculateTimerProgress, TIMER_RING_CIRCUMFERENCE, TIMER_RING_CLOCKWISE_PATH, TimerProgressRing } from './TimerProgressRing'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

test.each([10_000, 60_000, 25 * 60_000])('calcula progresso preciso para duração de %i ms', (duration) => {
  expect(calculateTimerProgress('running', duration, duration * .625)).toBeCloseTo(.375)
  expect(calculateTimerProgress('paused', duration, duration / 2)).toBeCloseTo(.5)
})

test('usa requestAnimationFrame para avançar o SVG e cancela o loop ao pausar', () => {
  let frameCallback: FrameRequestCallback | null = null
  const requestFrame = vi.fn((callback: FrameRequestCallback) => { frameCallback = callback; return 7 })
  const cancelFrame = vi.fn()
  vi.stubGlobal('requestAnimationFrame', requestFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelFrame)
  const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1_000)
  const performanceNow = vi.spyOn(performance, 'now').mockReturnValue(0)

  const view = render(<TimerProgressRing status="running" durationMs={10_000} remainingMs={10_000} endAt={11_000} reducedMotion />)
  expect(requestFrame).toHaveBeenCalledOnce()
  dateNow.mockReturnValue(6_000)
  act(() => { frameCallback?.(5_000) })
  expect(Number(screen.getByTestId('timer-progress').style.strokeDashoffset)).toBeCloseTo(TIMER_RING_CIRCUMFERENCE / 2)

  view.rerender(<TimerProgressRing status="paused" durationMs={10_000} remainingMs={5_000} endAt={null} reducedMotion />)
  expect(cancelFrame).toHaveBeenCalledWith(7)
  expect(Number(screen.getByTestId('timer-progress').style.strokeDashoffset)).toBeCloseTo(TIMER_RING_CIRCUMFERENCE / 2)
  performanceNow.mockRestore(); dateNow.mockRestore()
})

test('congela em cem por cento quando o temporizador encerra', () => {
  render(<TimerProgressRing status="alarming" durationMs={10_000} remainingMs={0} endAt={null} reducedMotion />)
  expect(screen.getByTestId('timer-progress')).toHaveAttribute('stroke', 'var(--timer-expired)')
  expect(screen.getByTestId('timer-progress')).toHaveAttribute('stroke-dashoffset', '0')
})

test('usa um caminho explícito que começa em doze horas e avança no sentido horário', () => {
  render(<TimerProgressRing status="running" durationMs={10_000} remainingMs={7_500} endAt={Date.now() + 7_500} reducedMotion />)
  const progress = screen.getByTestId('timer-progress')
  expect(progress.closest('svg')).toHaveAttribute('data-direction', 'clockwise')
  expect(progress).toHaveAttribute('d', TIMER_RING_CLOCKWISE_PATH)
  expect(TIMER_RING_CLOCKWISE_PATH).toMatch(/^M 50 4 A 46 46 0 0 1 96 50/)
})
