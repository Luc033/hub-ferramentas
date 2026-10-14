export interface Habit {
  id: string
  name: string
  days: boolean[]
  createdAt: number
  updatedAt?: number
}

export interface HabitCheckin {
  id: string
  habitId: string
  date: string
  completedAt: number
}

export interface HabitDatabaseInfo {
  version: number
  supportsDatedCheckins: boolean
  habitCount: number
}
