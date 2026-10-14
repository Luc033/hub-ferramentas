import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { CHECKINS_STORE, DB_NAME, closeDatabase, inspectDatabase, openDatabase, transactionDone, upgradeToDatedCheckins } from './indexedDb'

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
