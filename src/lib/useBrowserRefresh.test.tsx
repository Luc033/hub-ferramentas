import { act, render, screen } from '@testing-library/react'
import { useBrowserRefresh } from './useBrowserRefresh'

function Harness() {
  const { todayKey, revision } = useBrowserRefresh()
  return <span>{todayKey}:{revision}</span>
}

afterEach(() => vi.useRealTimers())

test('atualiza a data local automaticamente depois da meia-noite', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 23, 59, 59, 900))
  render(<Harness />)
  expect(screen.getByText('2026-10-15:0')).toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(200) })
  expect(screen.getByText('2026-10-16:1')).toBeInTheDocument()
})
