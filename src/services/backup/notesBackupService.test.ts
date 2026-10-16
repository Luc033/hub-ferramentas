import 'fake-indexeddb/auto'
import { notesBackupService } from './notesBackupService'
import { closeDatabase, DB_NAME } from '../db/indexedDb'
import { notesRepository } from '../db/notesRepository'
import { vi } from 'vitest'

const toArrayBuffer = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob) })

beforeEach(async () => {
  closeDatabase()
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
  await notesRepository.enable()
})

test('faz round-trip de notas, organização, histórico e imagem em um ZIP íntegro', async () => {
  const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'pixel.png', { type: 'image/png' })
  const asset = await notesRepository.saveAsset(png)
  const folder = await notesRepository.saveFolder({ id: 'folder', name: 'Projetos' })
  const tag = await notesRepository.createTag('Referência')
  let note = await notesRepository.createNote('Com mídia', '')
  note = await notesRepository.saveNote({ ...note, folderId: folder.id, tagIds: [tag.id], blocks: [{ type: 'image', props: { url: `hub-note-asset:${asset.id}`, name: 'pixel.png' } }], content: '' })
  await notesRepository.createSnapshot(note.id, 'teste de backup')

  // fake-indexeddb does not preserve jsdom's File prototype across structured clone;
  // keep the original object here while exercising the real ZIP/import path.
  const assets = vi.spyOn(notesRepository, 'getAssets').mockResolvedValue([asset])
  const blob = await notesBackupService.createBlob()
  assets.mockRestore()
  const preview = await notesBackupService.preview(new File([await toArrayBuffer(blob)], 'backup.zip', { type: 'application/zip' }))
  expect(preview).toMatchObject({ notes: 1, folders: 1, tags: 1, assets: 1, conflicts: 1 })
  await notesBackupService.import(preview, 'replace')
  expect(await notesRepository.getNote(note.id)).toMatchObject({ title: 'Com mídia', folderId: 'folder', tagIds: [tag.id] })
  expect(await notesRepository.getAsset(asset.id)).toMatchObject({ mimeType: 'image/png', bytes: png.size })
  expect(await notesRepository.getSnapshots(note.id)).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'teste de backup' })]))
})

test('rejeita pacote alterado antes de iniciar a importação', async () => {
  await notesRepository.createNote('Íntegra', 'Texto')
  const blob = await notesBackupService.createBlob()
  const bytes = new Uint8Array(await toArrayBuffer(blob)); bytes[Math.floor(bytes.length / 2)] ^= 0xff
  await expect(notesBackupService.preview(new File([bytes], 'alterado.zip', { type: 'application/zip' }))).rejects.toThrow()
  expect(await notesRepository.getNotes()).toHaveLength(1)
})
