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

test('organiza, arquiva, envia à lixeira e restaura sem apagar conteúdo', async () => {
  const folder = await notesRepository.saveFolder({ id: 'work', name: 'Trabalho' })
  const tag = await notesRepository.createTag('Urgente')
  let note = await notesRepository.createNote('Plano', 'Conteúdo preservado')
  note = await notesRepository.saveNote({ ...note, folderId: folder.id, tagIds: [tag.id], favorite: true })
  note = await notesRepository.archiveNote(note.id, true)
  expect(note).toMatchObject({ archivedAt: expect.any(Number), content: 'Conteúdo preservado' })
  note = await notesRepository.moveToTrash(note.id)
  expect(note.deletedAt).toEqual(expect.any(Number))
  note = await notesRepository.restoreNote(note.id)
  expect(note).toMatchObject({ archivedAt: null, deletedAt: null, folderId: 'work', tagIds: [tag.id], favorite: true })
  await notesRepository.deleteFolder(folder.id)
  expect(await notesRepository.getNote(note.id)).toMatchObject({ folderId: null, content: 'Conteúdo preservado' })
})

test('impede que uma revisão antiga sobrescreva alteração mais recente', async () => {
  const original = await notesRepository.createNote('Concorrência', 'Inicial')
  const latest = await notesRepository.saveNote({ ...original, title: 'Atualizada' })
  expect(latest.revision).toBeGreaterThan(original.revision)
  await expect(notesRepository.saveNote({ ...original, title: 'Versão antiga' })).rejects.toThrow('outra aba')
  expect(await notesRepository.getNote(original.id)).toMatchObject({ title: 'Atualizada', revision: latest.revision })
})

test('mantém snapshots recuperáveis e rejeita links de bloco inseguros', async () => {
  const note = await notesRepository.createNote('Histórico', 'Antes')
  const after = await notesRepository.saveNote({ ...note, content: 'Depois' })
  const snapshots = await notesRepository.getSnapshots(note.id)
  expect(snapshots).toEqual(expect.arrayContaining([expect.objectContaining({ content: 'Antes' })]))
  const restored = await notesRepository.restoreSnapshot(snapshots.find((item) => item.content === 'Antes')!)
  expect(restored.content).toBe('Antes')
  await expect(notesRepository.saveNote({ ...after, revision: restored.revision, blocks: [{ type: 'image', props: { url: 'javascript:alert(1)' } }], content: '' })).rejects.toThrow('segurança')
})
