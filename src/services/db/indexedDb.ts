import type { Habit, HabitCheckin, HabitDatabaseInfo } from '../../features/habits/types'

export const DB_NAME = 'HabitTrackerDB'
export const HABITS_STORE = 'habits'
export const CHECKINS_STORE = 'habitCheckins'
export const DATED_SCHEMA_VERSION = 2
export const TASKS_STORE = 'tasks'
export const PRODUCTIVITY_SCHEMA_VERSION = 3
export const NOTES_STORE = 'notes'
export const BOARDS_STORE = 'boards'
export const NODES_STORE = 'nodes'
export const EDGES_STORE = 'edges'
export const CREATIVE_SCHEMA_VERSION = 4
export const FOCUS_PLAYLISTS_STORE = 'focusPlaylists'
export const AUDIO_SCHEMA_VERSION = 5
export const MIND_MAPS_STORE = 'mindMaps'
export const MIND_MAP_TOPICS_STORE = 'mindMapTopics'
export const MIND_MAP_SCHEMA_VERSION = 6
export const MIND_MAP_CONNECTIONS_STORE = 'mindMapConnections'
export const MIND_MAP_ASSETS_STORE = 'mindMapAssets'
export const MIND_MAP_MEDIA_SCHEMA_VERSION = 7
export const ALARM_SOUNDS_STORE = 'alarmSounds'
export const ALARM_SCHEMA_VERSION = 8

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
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('database:versionchange'))
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

export async function upgradeToProductivitySchema(): Promise<HabitDatabaseInfo> {
  const current = await openDatabase()
  if (current.objectStoreNames.contains(TASKS_STORE)) return inspectDatabase()
  if (current.version > PRODUCTIVITY_SCHEMA_VERSION) throw new Error(`A base usa a versão ${current.version}, mais nova que esta aplicação.`)
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, PRODUCTIVITY_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CHECKINS_STORE)) {
        const checkins = db.createObjectStore(CHECKINS_STORE, { keyPath: 'id' })
        checkins.createIndex('habitId', 'habitId', { unique: false })
        checkins.createIndex('date', 'date', { unique: false })
      }
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const tasks = db.createObjectStore(TASKS_STORE, { keyPath: 'id' })
        tasks.createIndex('status', 'status', { unique: false })
        tasks.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    request.onsuccess = () => { configureConnection(request.result); resolve() }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível criar a área de tarefas.'))
    request.onblocked = () => reject(new Error('Outra aba está usando o Hub. Feche-a antes de habilitar o Kanban.'))
  })
  return inspectDatabase()
}

export async function upgradeToCreativeSchema(): Promise<HabitDatabaseInfo> {
  const current = await openDatabase()
  if ([NOTES_STORE, BOARDS_STORE, NODES_STORE, EDGES_STORE].every((name) => current.objectStoreNames.contains(name))) return inspectDatabase()
  if (current.version > CREATIVE_SCHEMA_VERSION) throw new Error(`A base usa a versão ${current.version}, mais nova que esta aplicação.`)
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, CREATIVE_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CHECKINS_STORE)) {
        const checkins = db.createObjectStore(CHECKINS_STORE, { keyPath: 'id' })
        checkins.createIndex('habitId', 'habitId', { unique: false }); checkins.createIndex('date', 'date', { unique: false })
      }
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const tasks = db.createObjectStore(TASKS_STORE, { keyPath: 'id' })
        tasks.createIndex('status', 'status', { unique: false }); tasks.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const notes = db.createObjectStore(NOTES_STORE, { keyPath: 'id' }); notes.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(BOARDS_STORE)) db.createObjectStore(BOARDS_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(NODES_STORE)) {
        const nodes = db.createObjectStore(NODES_STORE, { keyPath: 'id' }); nodes.createIndex('boardId', 'boardId', { unique: false })
      }
      if (!db.objectStoreNames.contains(EDGES_STORE)) {
        const edges = db.createObjectStore(EDGES_STORE, { keyPath: 'id' }); edges.createIndex('boardId', 'boardId', { unique: false })
      }
    }
    request.onsuccess = () => { configureConnection(request.result); resolve() }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível criar as stores criativas.'))
    request.onblocked = () => reject(new Error('Outra aba está usando o Hub. Feche-a antes de habilitar Anotações.'))
  })
  return inspectDatabase()
}

export async function upgradeToAudioSchema(): Promise<HabitDatabaseInfo> {
  const current = await openDatabase()
  if (current.objectStoreNames.contains(FOCUS_PLAYLISTS_STORE)) return inspectDatabase()
  if (current.version > AUDIO_SCHEMA_VERSION) throw new Error(`A base usa a versão ${current.version}, mais nova que esta aplicação.`)
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, AUDIO_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CHECKINS_STORE)) {
        const checkins = db.createObjectStore(CHECKINS_STORE, { keyPath: 'id' })
        checkins.createIndex('habitId', 'habitId', { unique: false }); checkins.createIndex('date', 'date', { unique: false })
      }
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const tasks = db.createObjectStore(TASKS_STORE, { keyPath: 'id' })
        tasks.createIndex('status', 'status', { unique: false }); tasks.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const notes = db.createObjectStore(NOTES_STORE, { keyPath: 'id' }); notes.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(BOARDS_STORE)) db.createObjectStore(BOARDS_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(NODES_STORE)) {
        const nodes = db.createObjectStore(NODES_STORE, { keyPath: 'id' }); nodes.createIndex('boardId', 'boardId', { unique: false })
      }
      if (!db.objectStoreNames.contains(EDGES_STORE)) {
        const edges = db.createObjectStore(EDGES_STORE, { keyPath: 'id' }); edges.createIndex('boardId', 'boardId', { unique: false })
      }
      if (!db.objectStoreNames.contains(FOCUS_PLAYLISTS_STORE)) {
        const playlists = db.createObjectStore(FOCUS_PLAYLISTS_STORE, { keyPath: 'id' })
        playlists.createIndex('url', 'url', { unique: true }); playlists.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => { configureConnection(request.result); resolve() }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível criar a biblioteca de playlists.'))
    request.onblocked = () => reject(new Error('Outra aba está usando o Hub. Feche-a antes de habilitar as playlists.'))
  })
  return inspectDatabase()
}

export async function upgradeToMindMapSchema(): Promise<HabitDatabaseInfo> {
  const current = await openDatabase()
  if ([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE].every((name) => current.objectStoreNames.contains(name))) return inspectDatabase()
  if (current.version > MIND_MAP_SCHEMA_VERSION) throw new Error(`A base usa a versão ${current.version}, mais nova que esta aplicação.`)
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, MIND_MAP_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CHECKINS_STORE)) {
        const checkins = db.createObjectStore(CHECKINS_STORE, { keyPath: 'id' })
        checkins.createIndex('habitId', 'habitId', { unique: false }); checkins.createIndex('date', 'date', { unique: false })
      }
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const tasks = db.createObjectStore(TASKS_STORE, { keyPath: 'id' })
        tasks.createIndex('status', 'status', { unique: false }); tasks.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const notes = db.createObjectStore(NOTES_STORE, { keyPath: 'id' }); notes.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(BOARDS_STORE)) db.createObjectStore(BOARDS_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(NODES_STORE)) {
        const nodes = db.createObjectStore(NODES_STORE, { keyPath: 'id' }); nodes.createIndex('boardId', 'boardId', { unique: false })
      }
      if (!db.objectStoreNames.contains(EDGES_STORE)) {
        const edges = db.createObjectStore(EDGES_STORE, { keyPath: 'id' }); edges.createIndex('boardId', 'boardId', { unique: false })
      }
      if (!db.objectStoreNames.contains(FOCUS_PLAYLISTS_STORE)) {
        const playlists = db.createObjectStore(FOCUS_PLAYLISTS_STORE, { keyPath: 'id' })
        playlists.createIndex('url', 'url', { unique: true }); playlists.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(MIND_MAPS_STORE)) {
        const maps = db.createObjectStore(MIND_MAPS_STORE, { keyPath: 'id' })
        maps.createIndex('updatedAt', 'updatedAt', { unique: false }); maps.createIndex('name', 'name', { unique: false })
      }
      if (!db.objectStoreNames.contains(MIND_MAP_TOPICS_STORE)) {
        const topics = db.createObjectStore(MIND_MAP_TOPICS_STORE, { keyPath: 'id' })
        topics.createIndex('mapId', 'mapId', { unique: false }); topics.createIndex('parentId', 'parentId', { unique: false })
      }
    }
    request.onsuccess = () => { configureConnection(request.result); resolve() }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível criar a biblioteca de mapas mentais.'))
    request.onblocked = () => reject(new Error('Outra aba está usando o Hub. Feche-a antes de habilitar Mapas Mentais.'))
  })
  return inspectDatabase()
}

export async function upgradeToMindMapMediaSchema(): Promise<HabitDatabaseInfo> {
  const current = await openDatabase()
  if ([MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE].every((name) => current.objectStoreNames.contains(name))) return inspectDatabase()
  if (current.version > MIND_MAP_MEDIA_SCHEMA_VERSION) throw new Error(`A base usa a versão ${current.version}, mais nova que esta aplicação.`)
  if (![MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE].every((name) => current.objectStoreNames.contains(name))) await upgradeToMindMapSchema()
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, MIND_MAP_MEDIA_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MIND_MAP_CONNECTIONS_STORE)) {
        const store = db.createObjectStore(MIND_MAP_CONNECTIONS_STORE, { keyPath: 'id' })
        store.createIndex('mapId', 'mapId', { unique: false })
      }
      if (!db.objectStoreNames.contains(MIND_MAP_ASSETS_STORE)) {
        const store = db.createObjectStore(MIND_MAP_ASSETS_STORE, { keyPath: 'id' })
        store.createIndex('mapId', 'mapId', { unique: false })
      }
    }
    request.onsuccess = () => { configureConnection(request.result); resolve() }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível habilitar os recursos visuais dos mapas.'))
    request.onblocked = () => reject(new Error('Outra aba está usando o Hub. Feche-a antes de habilitar os recursos visuais.'))
  })
  return inspectDatabase()
}

export async function upgradeToAlarmSchema(): Promise<HabitDatabaseInfo> {
  let current = await openDatabase()
  if (current.objectStoreNames.contains(ALARM_SOUNDS_STORE)) return inspectDatabase()
  if (current.version > ALARM_SCHEMA_VERSION) throw new Error(`A base usa a versão ${current.version}, mais nova que esta aplicação.`)
  if (![MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE].every((name) => current.objectStoreNames.contains(name))) {
    await upgradeToMindMapMediaSchema()
    current = await openDatabase()
  }
  if (current.objectStoreNames.contains(ALARM_SOUNDS_STORE)) return inspectDatabase()
  closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, ALARM_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ALARM_SOUNDS_STORE)) db.createObjectStore(ALARM_SOUNDS_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => { configureConnection(request.result); resolve() }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível habilitar áudios personalizados.'))
    request.onblocked = () => reject(new Error('Outra aba está usando o Hub. Feche-a antes de importar um áudio.'))
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
