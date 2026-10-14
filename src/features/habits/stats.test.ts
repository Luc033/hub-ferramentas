import { datedTotals, legacyStats, weeklyPercentage } from './stats'
import type { Habit, HabitCheckin } from './types'

const habits: Habit[] = [
  { id: 'a', name: 'Ler', days: [true, false, true, false, false, false, false], createdAt: 1 },
  { id: 'b', name: 'Caminhar', days: Array(7).fill(false), createdAt: 2 },
]

test('calcula o legado sem transformar índices em datas', () => {
  expect(legacyStats(habits[0].days)).toEqual({ completed: 2, percentage: 29, longest: 1 })
})

test('conta somente check-ins datados da semana e de hábitos existentes', () => {
  const week = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']
  const checkins: HabitCheckin[] = [
    { id: 'a:2026-10-14', habitId: 'a', date: '2026-10-14', completedAt: 1 },
    { id: 'b:2026-10-14', habitId: 'b', date: '2026-10-14', completedAt: 1 },
    { id: 'deleted:2026-10-14', habitId: 'deleted', date: '2026-10-14', completedAt: 1 },
  ]
  const totals = datedTotals(habits, checkins, week)
  expect(totals).toEqual([0, 0, 0, 2, 0, 0, 0])
  expect(weeklyPercentage(habits.length, totals)).toBe(14)
})
