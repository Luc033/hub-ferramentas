import type { Task, TaskStatus } from '../../features/tasks/types'
import { openDatabase, requestResult, TASKS_STORE, transactionDone, upgradeToProductivitySchema } from './indexedDb'

const CHANGE_EVENT = 'tasks:changed'
const emitChange = () => window.dispatchEvent(new Event(CHANGE_EVENT))
const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']

export function normalizedTaskOrder(tasks: Task[]) {
  return STATUSES.flatMap((status) => tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position).map((task, position) => ({ ...task, position })))
}

async function writeTaskOrder(transform: (tasks: Task[]) => Task[]) {
  const db = await openDatabase()
  const transaction = db.transaction(TASKS_STORE, 'readwrite')
  const store = transaction.objectStore(TASKS_STORE)
  const current = await requestResult(store.getAll()) as Task[]
  const next = normalizedTaskOrder(transform(current))
  next.forEach((task) => store.put(task))
  await transactionDone(transaction); emitChange(); return next
}

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
    const db = await openDatabase(); const transaction = db.transaction(TASKS_STORE, 'readwrite'); const store = transaction.objectStore(TASKS_STORE)
    const current = await requestResult(store.getAll()) as Task[]
    store.delete(id); normalizedTaskOrder(current.filter((task) => task.id !== id)).forEach((task) => store.put(task))
    await transactionDone(transaction); emitChange()
  },
  async move(task: Task, status: TaskStatus) {
    const tasks = await this.getAll(); await this.moveTo(task.id, status, tasks.filter((item) => item.status === status && item.id !== task.id).length)
  },
  async moveTo(id: string, status: TaskStatus, targetIndex: number) {
    await writeTaskOrder((tasks) => {
      const task = tasks.find((item) => item.id === id); if (!task) throw new Error('A tarefa não existe mais.')
      const now = Date.now(); const remaining = tasks.filter((item) => item.id !== id)
      const target = remaining.filter((item) => item.status === status).sort((a, b) => a.position - b.position)
      const safeIndex = Math.max(0, Math.min(target.length, targetIndex))
      target.splice(safeIndex, 0, { ...task, status, completedAt: status === 'done' ? task.completedAt ?? now : undefined, updatedAt: now })
      return [...remaining.filter((item) => item.status !== status), ...target.map((item, position) => ({ ...item, position }))]
    })
  },
  async reorder(task: Task, direction: -1 | 1) {
    const siblings = (await this.getAll()).filter((item) => item.status === task.status)
    const index = siblings.findIndex((item) => item.id === task.id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return
    await this.moveTo(task.id, task.status, targetIndex)
  },
  async recordFocus(id: string, minutes: number) {
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('A duração do foco é inválida.')
    const db = await openDatabase()
    if (!db.objectStoreNames.contains(TASKS_STORE)) return false
    const transaction = db.transaction(TASKS_STORE, 'readwrite')
    const store = transaction.objectStore(TASKS_STORE)
    const task = await requestResult(store.get(id)) as Task | undefined
    if (!task) { await transactionDone(transaction); return false }
    store.put({ ...task, pomodoroCount: (task.pomodoroCount ?? 0) + 1, focusMinutes: (task.focusMinutes ?? 0) + Math.round(minutes), updatedAt: Date.now() })
    await transactionDone(transaction); emitChange(); return true
  },
}
