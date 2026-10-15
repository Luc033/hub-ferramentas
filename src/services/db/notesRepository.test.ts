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
  await expect(notesRepository.connect(first.id, second.id)).rejects.toThrow('não existe')
})

test('substitui o grafo em uma única operação para desfazer e refazer', async () => {
  const first = await notesRepository.createNode('Original', 10, 20)
  const second = await notesRepository.createNode('Temporário', 100, 120)
  await notesRepository.connect(first.id, second.id)
  await notesRepository.replaceGraph([{ ...first, text: 'Restaurado' }], [])
  expect(await notesRepository.getNodes()).toEqual([expect.objectContaining({ id: first.id, text: 'Restaurado' })])
  expect(await notesRepository.getEdges()).toEqual([])
})

test('cria nota preenchida em uma única operação pública', async () => {
  const note = await notesRepository.createNote('Tópico', 'Detalhes em texto simples')
  expect(note).toMatchObject({ title: 'Tópico', content: 'Detalhes em texto simples' }); expect(await notesRepository.getNotes()).toEqual([expect.objectContaining({ id: note.id, title: 'Tópico' })])
})
