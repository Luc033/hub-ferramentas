export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  position: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}
