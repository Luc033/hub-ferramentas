import 'fake-indexeddb/auto'
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
