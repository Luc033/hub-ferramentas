import type { Habit, HabitCheckin, HabitDatabaseInfo } from '../../features/habits/types'

export const DB_NAME = 'HabitTrackerDB'
export const HABITS_STORE = 'habits'
export const CHECKINS_STORE = 'habitCheckins'
export const DATED_SCHEMA_VERSION = 2

let connection: IDBDatabase | null = null
let opening: Promise<IDBDatabase> | null = null

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('Falha na operação do IndexedDB.'))
})

export const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve()
  transaction.onerror = () => reject(transaction.error ?? new Error('Falha na transação do IndexedDB.'))
  transaction.onabort = () => reject(transaction.error ?? new Error('A transação foi cancelada.'))
})

function configureConnection(db: IDBDatabase) {
  connection = db
  db.onversionchange = () => {
    db.close()
    if (connection === db) connection = null
  }
  return db
}

export async function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection
  if (opening) return opening

  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HABITS_STORE)) {
        const habits = db.createObjectStore(HABITS_STORE, { keyPath: 'id' })
        habits.createIndex('name', 'name', { unique: false })
        habits.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(configureConnection(request.result))
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o banco local.'))
    request.onblocked = () => reject(new Error('Outra aba está bloqueando a abertura do banco local. Feche-a e tente novamente.'))
  }).finally(() => { opening = null })
  return opening
}

export function closeDatabase() {
  connection?.close()
  connection = null
}

export async function inspectDatabase(): Promise<HabitDatabaseInfo> {
  const db = await openDatabase()
  if (!db.objectStoreNames.contains(HABITS_STORE)) throw new Error('A store legada de hábitos não foi encontrada.')
  const transaction = db.transaction(HABITS_STORE, 'readonly')
  const count = await requestResult(transaction.objectStore(HABITS_STORE).count())
  await transactionDone(transaction)
  return { version: db.version, supportsDatedCheckins: db.objectStoreNames.contains(CHECKINS_STORE), habitCount: count }
}

export async function upgradeToDatedCheckins(): Promise<HabitDatabaseInfo> {
  const current = await openDatabase()
  if (current.objectStoreNames.contains(CHECKINS_STORE)) return inspectDatabase()
  if (current.version > DATED_SCHEMA_VERSION) throw new Error(`A base usa a versão ${current.version}, mais nova que esta aplicação.`)
  closeDatabase()

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DATED_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CHECKINS_STORE)) {
        const checkins = db.createObjectStore(CHECKINS_STORE, { keyPath: 'id' })
        checkins.createIndex('habitId', 'habitId', { unique: false })
        checkins.createIndex('date', 'date', { unique: false })
      }
    }
    request.onsuccess = () => { configureConnection(request.result); resolve() }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível atualizar a base local.'))
    request.onblocked = () => reject(new Error('Outra aba está usando o Hub. Feche-a antes de habilitar as marcações por data.'))
  })
  return inspectDatabase()
}

export async function initializeDatabase(): Promise<HabitDatabaseInfo> {
  const info = await inspectDatabase()
  if (!info.supportsDatedCheckins && info.habitCount === 0) return upgradeToDatedCheckins()
  return info
}

export { requestResult }

export type KnownStoreRecords = { habits: Habit[]; habitCheckins?: HabitCheckin[] }
