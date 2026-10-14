import type { Task, TaskStatus } from '../../features/tasks/types'
import { openDatabase, requestResult, TASKS_STORE, transactionDone, upgradeToProductivitySchema } from './indexedDb'

const CHANGE_EVENT = 'tasks:changed'
const emitChange = () => window.dispatchEvent(new Event(CHANGE_EVENT))

export const tasksRepository = {
  async isEnabled() { return (await openDatabase()).objectStoreNames.contains(TASKS_STORE) },
  enable: upgradeToProductivitySchema,
  subscribe(listener: () => void) { window.addEventListener(CHANGE_EVENT, listener); return () => window.removeEventListener(CHANGE_EVENT, listener) },
  async getAll(): Promise<Task[]> {
    const db = await openDatabase()
    if (!db.objectStoreNames.contains(TASKS_STORE)) return []
    const transaction = db.transaction(TASKS_STORE, 'readonly')
    const tasks = await requestResult(transaction.objectStore(TASKS_STORE).getAll()) as Task[]
    await transactionDone(transaction)
    return tasks.sort((a, b) => a.position - b.position)
  },
  async add(title: string, description = '') {
    const tasks = await this.getAll()
    const now = Date.now()
    const task: Task = { id: crypto.randomUUID(), title, description, status: 'todo', position: tasks.filter((item) => item.status === 'todo').length, createdAt: now, updatedAt: now }
    const db = await openDatabase()
    const transaction = db.transaction(TASKS_STORE, 'readwrite')
    transaction.objectStore(TASKS_STORE).add(task)
    await transactionDone(transaction); emitChange(); return task
  },
  async update(task: Task) {
    const db = await openDatabase()
    const transaction = db.transaction(TASKS_STORE, 'readwrite')
    transaction.objectStore(TASKS_STORE).put({ ...task, updatedAt: Date.now() })
    await transactionDone(transaction); emitChange()
  },
  async remove(id: string) {
    const db = await openDatabase()
    const transaction = db.transaction(TASKS_STORE, 'readwrite')
    transaction.objectStore(TASKS_STORE).delete(id)
    await transactionDone(transaction); emitChange()
  },
  async move(task: Task, status: TaskStatus) {
    const tasks = await this.getAll()
    const position = tasks.filter((item) => item.status === status).length
    await this.update({ ...task, status, position, completedAt: status === 'done' ? task.completedAt ?? Date.now() : undefined })
  },
  async reorder(task: Task, direction: -1 | 1) {
    const siblings = (await this.getAll()).filter((item) => item.status === task.status)
    const index = siblings.findIndex((item) => item.id === task.id)
    const swap = siblings[index + direction]
    if (!swap) return
    const oldPosition = task.position
    await Promise.all([this.update({ ...task, position: swap.position }), this.update({ ...swap, position: oldPosition })])
  },
}
