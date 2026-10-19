import { fireEvent, render, screen } from '@testing-library/react'
import { clockService } from '../../services/clock/ClockService'
import { formatHistoryDuration, recordsForLocalDay, TimerHistoryPanel } from './TimerHistoryPanel'

beforeEach(() => {
  localStorage.clear()
  clockService.reset()
})

test('formata o total diário no padrão HH:MM', () => {
  expect(formatHistoryDuration(2 * 3_600_000 + 45 * 60_000)).toBe('02:45')
  expect(formatHistoryDuration(0)).toBe('00:00')
  expect(formatHistoryDuration(1_000)).toBe('00:01')
  expect(formatHistoryDuration(2 * 60_000 + 1_000)).toBe('00:03')
})

test('mostra estado vazio e impede avançar além de hoje', () => {
  render(<TimerHistoryPanel />)
  expect(screen.getByText('Não existem timers registrados nesta data.')).toBeInTheDocument()
  expect(screen.getByText('00:00')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Próximo dia' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Dia anterior' }))
  expect(screen.getByRole('button', { name: 'Próximo dia' })).toBeEnabled()
})

test('filtra pela data local e ordena registros do mais recente para o mais antigo', () => {
  const day = new Date(2026, 9, 19)
  const records = [
    { id: 'old', title: 'Primeiro', startedAt: new Date(2026, 9, 19, 8, 0).getTime(), finishedAt: new Date(2026, 9, 19, 8, 5).getTime(), durationMs: 300_000 },
    { id: 'new', title: 'Último', startedAt: new Date(2026, 9, 19, 10, 0).getTime(), finishedAt: new Date(2026, 9, 19, 10, 15).getTime(), durationMs: 900_000 },
    { id: 'other-day', title: 'Outro dia', startedAt: new Date(2026, 9, 18, 10, 0).getTime(), finishedAt: new Date(2026, 9, 18, 10, 5).getTime(), durationMs: 300_000 },
  ]
  expect(recordsForLocalDay(records, day).map((record) => record.id)).toEqual(['new', 'old'])
})
