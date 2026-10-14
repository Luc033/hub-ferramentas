import type { Habit, HabitCheckin } from './types'

export function legacyStats(days: boolean[]) {
  const completed = days.filter(Boolean).length
  let current = 0
  let longest = 0
  days.forEach((done) => { current = done ? current + 1 : 0; longest = Math.max(longest, current) })
  return { completed, percentage: Math.round((completed / 7) * 100), longest }
}

export function datedTotals(habits: Habit[], checkins: HabitCheckin[], weekKeys: string[], todayKey?: string) {
  const ids = new Set(habits.map((habit) => habit.id))
  return weekKeys.map((date) => date > (todayKey ?? date) ? 0 : checkins.filter((checkin) => checkin.date === date && ids.has(checkin.habitId)).length)
}

function dayNumber(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
}

export function datedStreak(checkins: HabitCheckin[], habitId: string, todayKey: string) {
  const today = dayNumber(todayKey)
  if (today === null) return { current: 0, longest: 0 }
  const days = new Set(checkins.filter((item) => item.habitId === habitId).map((item) => dayNumber(item.date)).filter((day): day is number => day !== null && day <= today))
  let cursor = days.has(today) ? today : today - 1
  let current = 0
  while (days.has(cursor)) { current += 1; cursor -= 1 }
  let longest = 0
  let run = 0
  let previous: number | null = null
  Array.from(days).sort((a, b) => a - b).forEach((day) => {
    run = previous !== null && day === previous + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = day
  })
  return { current, longest }
}

export function weeklyPercentage(habitCount: number, totals: number[]) {
  if (!habitCount) return 0
  return Math.round((totals.reduce((sum, value) => sum + value, 0) / (habitCount * 7)) * 100)
}
