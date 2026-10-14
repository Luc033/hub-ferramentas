import 'fake-indexeddb/auto'
import { closeDatabase, DB_NAME } from './indexedDb'
import { notesRepository } from './notesRepository'

beforeEach(async () => {
  closeDatabase()
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
  await notesRepository.enable()
})

test('persiste notas, nós e remove conexões órfãs', async () => {
  const note = await notesRepository.createNote()
  await notesRepository.saveNote({ ...note, title: 'Ideia', content: '<img onerror=alert(1)>' })
  expect(await notesRepository.getNotes()).toEqual([expect.objectContaining({ title: 'Ideia', content: '<img onerror=alert(1)>' })])
  const first = await notesRepository.createNode('A', 10, 20); const second = await notesRepository.createNode('B', 100, 120)
  await notesRepository.connect(first.id, second.id)
  expect(await notesRepository.getEdges()).toHaveLength(1)
  await notesRepository.deleteNode(first.id)
  expect(await notesRepository.getEdges()).toHaveLength(0)
})
