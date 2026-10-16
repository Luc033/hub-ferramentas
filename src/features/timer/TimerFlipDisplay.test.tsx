import { act, fireEvent, render, screen } from '@testing-library/react'
import { TimerFlipDisplay } from './TimerFlipDisplay'

const values = (hours: number, minutes: number, seconds: number) => ({ hours, minutes, seconds })

afterEach(() => { vi.useRealTimers() })

test('preserva edição por teclado e controles independentes de cada unidade', () => {
  const onChange = vi.fn()
  render(<TimerFlipDisplay values={values(0, 5, 9)} disabled={false} reducedMotion transitionKey="ready" onChange={onChange} />)
  expect(screen.getByLabelText('HRS')).toHaveValue('00')
  expect(screen.getByLabelText('MIN')).toHaveValue('05')
  expect(screen.getByLabelText('SEG')).toHaveValue('09')
  fireEvent.change(screen.getByLabelText('HRS'), { target: { value: '12' } })
  expect(onChange).toHaveBeenCalledWith('hours', 12)
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar SEG' }))
  expect(onChange).toHaveBeenCalledWith('seconds', 10)
  fireEvent.click(screen.getByRole('button', { name: 'Diminuir MIN' }))
  expect(onChange).toHaveBeenCalledWith('minutes', 4)
})

test.each([
  [values(0, 0, 59), values(0, 0, 58), 1, '59 para 58 segundos'],
  [values(0, 1, 0), values(0, 0, 59), 3, '01:00 para 00:59'],
  [values(1, 0, 0), values(0, 59, 59), 5, '01:00:00 para 00:59:59'],
])('anima somente os dígitos alterados em %s → %s (%s, %s)', (before, after, changedDigits) => {
  vi.useFakeTimers()
  const view = render(<TimerFlipDisplay values={before} disabled reducedMotion={false} transitionKey="running-run" onChange={vi.fn()} />)
  act(() => { vi.runAllTimers() })
  view.rerender(<TimerFlipDisplay values={after} disabled reducedMotion={false} transitionKey="running-run" onChange={vi.fn()} />)
  const flippingTops = Array.from(view.container.querySelectorAll<HTMLElement>('div')).filter((element) => element.style.animation.includes('flip-top'))
  expect(flippingTops).toHaveLength(changedDigits)
  expect(screen.getByLabelText('HRS')).toHaveValue(String(after.hours).padStart(2, '0'))
  expect(screen.getByLabelText('MIN')).toHaveValue(String(after.minutes).padStart(2, '0'))
  expect(screen.getByLabelText('SEG')).toHaveValue(String(after.seconds).padStart(2, '0'))
  view.unmount()
})

test('finaliza a virada pendente ao mudar o estado do temporizador', () => {
  vi.useFakeTimers()
  const view = render(<TimerFlipDisplay values={values(1, 0, 0)} disabled reducedMotion={false} transitionKey="running-run" onChange={vi.fn()} />)
  act(() => { vi.runAllTimers() })
  view.rerender(<TimerFlipDisplay values={values(0, 59, 59)} disabled reducedMotion={false} transitionKey="running-run" onChange={vi.fn()} />)
  expect(Array.from(view.container.querySelectorAll<HTMLElement>('div')).some((element) => element.style.animation.includes('flip-top'))).toBe(true)
  view.rerender(<TimerFlipDisplay values={values(0, 59, 59)} disabled reducedMotion={false} transitionKey="paused-run" onChange={vi.fn()} />)
  act(() => { vi.runAllTimers() })
  expect(Array.from(view.container.querySelectorAll<HTMLElement>('div')).some((element) => element.style.animation.includes('flip-top'))).toBe(false)
  view.unmount()
})
