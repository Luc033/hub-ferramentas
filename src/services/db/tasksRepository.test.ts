import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import { closeDatabase, DB_NAME } from './indexedDb'
import { tasksRepository } from './tasksRepository'

beforeEach(async () => {
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  await tasksRepository.enable()
})

test('cria, move e reabre uma tarefa sem perder os demais registros', async () => {
  const first = await tasksRepository.add('Primeira', 'Descrição segura')
  const second = await tasksRepository.add('Segunda')
  await tasksRepository.move(first, 'done')
  const tasks = await tasksRepository.getAll()
  expect(tasks).toHaveLength(2)
  expect(tasks.find((task) => task.id === first.id)).toMatchObject({ status: 'done', description: 'Descrição segura' })
  expect(tasks.find((task) => task.id === second.id)).toMatchObject({ status: 'todo' })
  await tasksRepository.move({ ...first, status: 'done' }, 'todo')
  expect((await tasksRepository.getAll()).find((task) => task.id === first.id)?.completedAt).toBeUndefined()
})

test('registra somente metadados de focos concluídos sem concluir a tarefa', async () => {
  const task = await tasksRepository.add('Preparar relatório')
  expect(await tasksRepository.recordFocus(task.id, 25)).toBe(true)
  expect(await tasksRepository.recordFocus(task.id, 15)).toBe(true)
  expect((await tasksRepository.getAll()).find((item) => item.id === task.id)).toMatchObject({ status: 'todo', pomodoroCount: 2, focusMinutes: 40 })
  expect(await tasksRepository.recordFocus('removida', 25)).toBe(false)
})

test('reordena e move em uma única atualização com posições normalizadas', async () => {
  const first = await tasksRepository.add('Primeira')
  const second = await tasksRepository.add('Segunda')
  const third = await tasksRepository.add('Terceira')
  const listener = vi.fn(); const unsubscribe = tasksRepository.subscribe(listener)
  await tasksRepository.moveTo(third.id, 'todo', 0)
  expect((await tasksRepository.getAll()).filter((task) => task.status === 'todo').map((task) => [task.title, task.position])).toEqual([['Terceira', 0], ['Primeira', 1], ['Segunda', 2]])
  expect(listener).toHaveBeenCalledOnce()
  await tasksRepository.moveTo(first.id, 'done', 0)
  expect((await tasksRepository.getAll()).find((task) => task.id === first.id)?.completedAt).toEqual(expect.any(Number))
  await tasksRepository.moveTo(first.id, 'todo', 1)
  expect((await tasksRepository.getAll()).find((task) => task.id === first.id)?.completedAt).toBeUndefined()
  await tasksRepository.remove(first.id)
  expect((await tasksRepository.getAll()).filter((task) => task.status === 'todo').map((task) => task.position)).toEqual([0, 1])
  unsubscribe()
  expect(second.id).toBeTruthy()
})
