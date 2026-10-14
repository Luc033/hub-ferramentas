import type { Habit, HabitCheckin } from './types'

export function legacyStats(days: boolean[]) {
  const completed = days.filter(Boolean).length
  let current = 0
  let longest = 0
  days.forEach((done) => { current = done ? current + 1 : 0; longest = Math.max(longest, current) })
  return { completed, percentage: Math.round((completed / 7) * 100), longest }
}

export function datedTotals(habits: Habit[], checkins: HabitCheckin[], weekKeys: string[]) {
  const ids = new Set(habits.map((habit) => habit.id))
  return weekKeys.map((date) => checkins.filter((checkin) => checkin.date === date && ids.has(checkin.habitId)).length)
}

export function weeklyPercentage(habitCount: number, totals: number[]) {
  if (!habitCount) return 0
  return Math.round((totals.reduce((sum, value) => sum + value, 0) / (habitCount * 7)) * 100)
}
