import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { closeDatabase, DB_NAME } from './indexedDb'
import { alarmSoundsRepository, MAX_CUSTOM_ALARM_SIZE } from './alarmSoundsRepository'
import { createBackup, importBackup, parseBackup } from '../backup/backupService'

async function deleteDatabase() {
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error)
  })
}

beforeEach(deleteDatabase)

test('persiste e recupera o arquivo personalizado em uma migração aditiva', async () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'alarme.mp3', { type: 'audio/mpeg' })
  await expect(alarmSoundsRepository.saveCustom(file)).resolves.toMatchObject({ id: 'custom', name: 'alarme.mp3', mimeType: 'audio/mpeg', size: 3 })
  const saved = await alarmSoundsRepository.getCustom()
  expect(saved).toMatchObject({ id: 'custom', name: 'alarme.mp3', size: 3 })
  expect(saved?.data.byteLength).toBe(3)
  expect(Array.from(new Uint8Array(saved!.data))).toEqual([1, 2, 3])
})

test('recusa arquivo inválido ou acima de 10 MB sem substituir o anterior', async () => {
  const original = new File(['ok'], 'ok.ogg', { type: 'audio/ogg' })
  await alarmSoundsRepository.saveCustom(original)
  await expect(alarmSoundsRepository.saveCustom(new File(['texto'], 'texto.txt', { type: 'text/plain' }))).rejects.toThrow('áudio válido')
  const oversized = { name: 'grande.wav', type: 'audio/wav', size: MAX_CUSTOM_ALARM_SIZE + 1 } as File
  await expect(alarmSoundsRepository.saveCustom(oversized)).rejects.toThrow('10 MB')
  await expect(alarmSoundsRepository.getCustom()).resolves.toMatchObject({ name: 'ok.ogg' })
})

test('inclui os bytes no backup e os restaura em outra base local', async () => {
  await alarmSoundsRepository.saveCustom(new File([new Uint8Array([7, 8, 9])], 'backup.ogg', { type: 'audio/ogg' }))
  const backup = await createBackup()
  expect(backup.records.alarmSounds).toEqual([expect.objectContaining({ name: 'backup.ogg', dataUrl: 'data:audio/ogg;base64,BwgJ' })])
  const parsed = parseBackup(JSON.stringify(backup))
  await deleteDatabase()
  await importBackup(parsed, 'merge')
  const restored = await alarmSoundsRepository.getCustom()
  expect(restored?.name).toBe('backup.ogg')
  expect(Array.from(new Uint8Array(restored!.data))).toEqual([7, 8, 9])
})
