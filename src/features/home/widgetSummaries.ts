import type { Note } from '../notes/types'
import type { Task } from '../tasks/types'
import { toLocalDateKey } from '../../lib/date'

export function countTasksCompletedToday(tasks: Task[], todayKey: string) {
  return tasks.filter((task) => task.completedAt !== undefined && toLocalDateKey(new Date(task.completedAt)) === todayKey).length
}

export function describeLastNoteUpdate(notes: Note[], todayKey: string) {
  if (!notes.length) return 'Comece uma anotação'
  const latest = Math.max(...notes.map((note) => note.updatedAt))
  const date = new Date(latest)
  if (toLocalDateKey(date) === todayKey) return `Atualizada hoje às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return `Última atualização: ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).replace('.', '')}`
}
