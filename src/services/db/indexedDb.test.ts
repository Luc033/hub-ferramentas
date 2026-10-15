import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { AUDIO_SCHEMA_VERSION, BOARDS_STORE, CHECKINS_STORE, DB_NAME, EDGES_STORE, FOCUS_PLAYLISTS_STORE, MIND_MAPS_STORE, MIND_MAP_SCHEMA_VERSION, MIND_MAP_TOPICS_STORE, MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE, MIND_MAP_MEDIA_SCHEMA_VERSION, NODES_STORE, NOTES_STORE, TASKS_STORE, closeDatabase, inspectDatabase, openDatabase, transactionDone, upgradeToAudioSchema, upgradeToCreativeSchema, upgradeToDatedCheckins, upgradeToMindMapMediaSchema, upgradeToMindMapSchema, upgradeToProductivitySchema } from './indexedDb'

async function deleteTestDatabase() {
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

beforeEach(deleteTestDatabase)

test('atualiza uma base nativa v1 preservando integralmente o hábito legado', async () => {
  const original = { id: 'legacy-1', name: 'Meditar', days: [true, false, true, false, true, false, true], createdAt: 123 }
  const db = await openDatabase()
  const transaction = db.transaction('habits', 'readwrite')
  transaction.objectStore('habits').add(original)
  await transactionDone(transaction)

  expect(await inspectDatabase()).toEqual({ version: 1, supportsDatedCheckins: false, habitCount: 1 })
  const migrated = await upgradeToDatedCheckins()
  expect(migrated).toEqual({ version: 2, supportsDatedCheckins: true, habitCount: 1 })

  const updated = await openDatabase()
  expect(updated.objectStoreNames.contains(CHECKINS_STORE)).toBe(true)
  const read = updated.transaction('habits', 'readonly').objectStore('habits').get('legacy-1')
  const record = await new Promise((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) })
  expect(record).toEqual(original)
})

test('adiciona a store de tarefas sem modificar os hábitos', async () => {
  const original = { id: 'habit-1', name: 'Ler', days: Array(7).fill(false), createdAt: 456 }
  const db = await openDatabase()
  const transaction = db.transaction('habits', 'readwrite')
  transaction.objectStore('habits').add(original)
  await transactionDone(transaction)
  await upgradeToProductivitySchema()
  const upgraded = await openDatabase()
  expect(upgraded.version).toBe(3)
  expect(upgraded.objectStoreNames.contains(CHECKINS_STORE)).toBe(true)
  expect(upgraded.objectStoreNames.contains(TASKS_STORE)).toBe(true)
  const request = upgraded.transaction('habits', 'readonly').objectStore('habits').get('habit-1')
  const record = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  expect(record).toEqual(original)
})

test('adiciona stores criativas preservando schemas anteriores', async () => {
  const db = await openDatabase(); const tx = db.transaction('habits', 'readwrite'); tx.objectStore('habits').add({ id: 'safe', name: 'Seguro', days: Array(7).fill(false), createdAt: 1 }); await transactionDone(tx)
  await upgradeToCreativeSchema()
  const upgraded = await openDatabase()
  expect(upgraded.version).toBe(4)
  for (const store of [CHECKINS_STORE, TASKS_STORE, NOTES_STORE, BOARDS_STORE, NODES_STORE, EDGES_STORE]) expect(upgraded.objectStoreNames.contains(store)).toBe(true)
  const request = upgraded.transaction('habits', 'readonly').objectStore('habits').get('safe')
  const record = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  expect(record).toMatchObject({ id: 'safe', name: 'Seguro' })
})

test('adiciona biblioteca de áudio preservando hábitos e stores anteriores', async () => {
  const db = await openDatabase(); const tx = db.transaction('habits', 'readwrite'); tx.objectStore('habits').add({ id: 'legacy', name: 'Legado', days: Array(7).fill(false), createdAt: 1 }); await transactionDone(tx)
  await upgradeToAudioSchema()
  const upgraded = await openDatabase()
  expect(upgraded.version).toBe(AUDIO_SCHEMA_VERSION)
  expect(upgraded.objectStoreNames.contains(FOCUS_PLAYLISTS_STORE)).toBe(true)
  expect(await new Promise((resolve, reject) => { const request = upgraded.transaction('habits').objectStore('habits').get('legacy'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })).toMatchObject({ name: 'Legado' })
})

test('adiciona mapas mentais em stores próprias sem reinterpretar o quadro livre', async () => {
  await upgradeToCreativeSchema()
  const before = await openDatabase(); const tx = before.transaction(NODES_STORE, 'readwrite'); tx.objectStore(NODES_STORE).add({ id: 'legacy-node', boardId: 'main', text: 'Livre', x: 10, y: 20, createdAt: 1, updatedAt: 1 }); await transactionDone(tx)
  await upgradeToMindMapSchema()
  const upgraded = await openDatabase()
  expect(upgraded.version).toBe(MIND_MAP_SCHEMA_VERSION)
  expect(upgraded.objectStoreNames.contains(MIND_MAPS_STORE)).toBe(true); expect(upgraded.objectStoreNames.contains(MIND_MAP_TOPICS_STORE)).toBe(true)
  expect(await new Promise((resolve, reject) => { const request = upgraded.transaction(NODES_STORE).objectStore(NODES_STORE).get('legacy-node'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })).toMatchObject({ text: 'Livre', boardId: 'main' })
})

test('habilita recursos visuais na v7 sem alterar mapas e nós existentes', async () => {
  await upgradeToMindMapSchema(); const before = await openDatabase(); const tx = before.transaction(MIND_MAPS_STORE, 'readwrite'); tx.objectStore(MIND_MAPS_STORE).add({ id: 'map', schemaVersion: 1, name: 'Seguro', rootId: 'root', layout: 'radial', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1 }); await transactionDone(tx)
  await upgradeToMindMapMediaSchema(); const upgraded = await openDatabase()
  expect(upgraded.version).toBe(MIND_MAP_MEDIA_SCHEMA_VERSION); expect(upgraded.objectStoreNames.contains(MIND_MAP_CONNECTIONS_STORE)).toBe(true); expect(upgraded.objectStoreNames.contains(MIND_MAP_ASSETS_STORE)).toBe(true)
  expect(await new Promise((resolve, reject) => { const request = upgraded.transaction(MIND_MAPS_STORE).objectStore(MIND_MAPS_STORE).get('map'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })).toMatchObject({ name: 'Seguro' })
})
