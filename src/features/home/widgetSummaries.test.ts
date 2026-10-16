import { countTasksCompletedToday, describeLastNoteUpdate } from './widgetSummaries'
import { normalizeNote } from '../notes/types'

test('conta somente tarefas concluídas na data local informada', () => {
  const today = new Date(2026, 9, 14, 10, 0).getTime()
  const yesterday = new Date(2026, 9, 13, 23, 59).getTime()
  const base = { description: '', position: 0, createdAt: today, updatedAt: today }
  const tasks = [
    { ...base, id: 'a', title: 'Hoje', status: 'done' as const, completedAt: today },
    { ...base, id: 'b', title: 'Ontem', status: 'done' as const, completedAt: yesterday },
    { ...base, id: 'c', title: 'Aberta', status: 'todo' as const },
  ]
  expect(countTasksCompletedToday(tasks, '2026-10-14')).toBe(1)
})

test('resume atualização da nota sem expor título ou conteúdo', () => {
  const updatedAt = new Date(2026, 9, 14, 9, 30).getTime()
  const summary = describeLastNoteUpdate([normalizeNote({ id: 'n', title: 'Segredo', content: 'Conteúdo privado', createdAt: updatedAt, updatedAt })], '2026-10-14')
  expect(summary).toContain('Atualizada hoje')
  expect(summary).not.toContain('Segredo')
  expect(summary).not.toContain('Conteúdo privado')
  expect(describeLastNoteUpdate([], '2026-10-14')).toBe('Comece uma anotação')
})
