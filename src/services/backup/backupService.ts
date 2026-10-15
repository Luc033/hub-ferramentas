import type { Habit, HabitCheckin } from '../../features/habits/types'
import { BOARDS_STORE, CHECKINS_STORE, EDGES_STORE, FOCUS_PLAYLISTS_STORE, HABITS_STORE, MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE, MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE, NODES_STORE, NOTES_STORE, openDatabase, requestResult, transactionDone } from '../db/indexedDb'
import { TASKS_STORE } from '../db/indexedDb'
import type { Task } from '../../features/tasks/types'
import type { Board, MindEdge, MindNode, Note } from '../../features/notes/types'
import type { FocusPlaylist } from '../../features/focus-sounds/types'
import type { MindMap, MindMapAsset, MindMapConnection, MindMapTopic } from '../../features/mind-maps/types'
import { validateMindMapDocument } from '../../features/mind-maps/tree'
import { applyStoredSettings, normalizeImportedSettings, readStoredSettings, type Settings } from '../settings/settingsStorage'

export interface HubBackup {
  schemaVersion: number
  exportedAt: string
  appVersion: string
  records: { habits: Habit[]; habitCheckins?: HabitCheckin[]; [storeName: string]: unknown[] | undefined }
  preferences?: { settings?: Settings }
}

export interface ImportReport { imported: number; ignored: number; preferencesImported: boolean; preferencesError?: string }
export type ImportMode = 'merge' | 'replace'

const isHabit = (value: unknown): value is Habit => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Habit>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.createdAt === 'number' && Array.isArray(item.days) && item.days.length === 7 && item.days.every((day) => typeof day === 'boolean')
}

const isCheckin = (value: unknown): value is HabitCheckin => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<HabitCheckin>
  return typeof item.id === 'string' && typeof item.habitId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date)) && typeof item.completedAt === 'number'
}

const isTask = (value: unknown): value is Task => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Task>
  return typeof item.id === 'string' && typeof item.title === 'string' && typeof item.description === 'string' && ['todo', 'doing', 'done'].includes(String(item.status)) && typeof item.position === 'number' && typeof item.createdAt === 'number' && typeof item.updatedAt === 'number' && (item.pomodoroCount === undefined || Number.isInteger(item.pomodoroCount) && item.pomodoroCount >= 0) && (item.focusMinutes === undefined || Number.isFinite(item.focusMinutes) && item.focusMinutes >= 0)
}
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isNote = (value: unknown): value is Note => Boolean(value && typeof value === 'object' && typeof (value as Note).id === 'string' && typeof (value as Note).title === 'string' && typeof (value as Note).content === 'string' && isFiniteNumber((value as Note).createdAt) && isFiniteNumber((value as Note).updatedAt))
const isBoard = (value: unknown): value is Board => Boolean(value && typeof value === 'object' && typeof (value as Board).id === 'string' && typeof (value as Board).name === 'string' && isFiniteNumber((value as Board).panX) && isFiniteNumber((value as Board).panY) && isFiniteNumber((value as Board).zoom) && (value as Board).zoom >= .25 && (value as Board).zoom <= 3 && isFiniteNumber((value as Board).updatedAt))
const isNode = (value: unknown): value is MindNode => Boolean(value && typeof value === 'object' && typeof (value as MindNode).id === 'string' && typeof (value as MindNode).boardId === 'string' && typeof (value as MindNode).text === 'string' && isFiniteNumber((value as MindNode).x) && isFiniteNumber((value as MindNode).y) && isFiniteNumber((value as MindNode).createdAt) && isFiniteNumber((value as MindNode).updatedAt))
const isEdge = (value: unknown): value is MindEdge => Boolean(value && typeof value === 'object' && typeof (value as MindEdge).id === 'string' && typeof (value as MindEdge).boardId === 'string' && typeof (value as MindEdge).sourceId === 'string' && typeof (value as MindEdge).targetId === 'string')
const hasSoundCloudPlaylistUrl = (value: unknown) => { try { const url = new URL(String(value)); const parts = url.pathname.split('/').filter(Boolean); return url.protocol === 'https:' && ['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname.toLowerCase()) && parts.length >= 3 && parts[1] === 'sets' } catch { return false } }
const isFocusPlaylist = (value: unknown): value is FocusPlaylist => Boolean(value && typeof value === 'object' && typeof (value as FocusPlaylist).id === 'string' && hasSoundCloudPlaylistUrl((value as FocusPlaylist).url) && typeof (value as FocusPlaylist).title === 'string' && typeof (value as FocusPlaylist).author === 'string' && ['Lo-fi', 'Chillhop', 'Jazzhop', 'Outro'].includes(String((value as FocusPlaylist).category)) && isFiniteNumber((value as FocusPlaylist).createdAt))
const isMindMap = (value: unknown): value is MindMap => {
  if (!value || typeof value !== 'object') return false
  const item = value as MindMap
  return typeof item.id === 'string' && item.schemaVersion === 1 && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 100 && typeof item.rootId === 'string' && ['radial', 'manual', 'right', 'orgchart'].includes(item.layout) && (item.theme === undefined || ['classic', 'minimal', 'colorful'].includes(item.theme)) && Boolean(item.viewport) && isFiniteNumber(item.viewport.panX) && isFiniteNumber(item.viewport.panY) && isFiniteNumber(item.viewport.zoom) && item.viewport.zoom >= .25 && item.viewport.zoom <= 3 && isFiniteNumber(item.createdAt) && isFiniteNumber(item.updatedAt)
}
const isMindMapTopic = (value: unknown): value is MindMapTopic => {
  if (!value || typeof value !== 'object') return false
  const item = value as MindMapTopic
  const positionValid = item.position === undefined || Boolean(item.position && isFiniteNumber(item.position.x) && isFiniteNumber(item.position.y))
  const linksValid = item.links === undefined || Array.isArray(item.links) && item.links.every((link) => typeof link.id === 'string' && typeof link.label === 'string' && (() => { try { return ['http:', 'https:'].includes(new URL(link.url).protocol) } catch { return false } })())
  return typeof item.id === 'string' && typeof item.mapId === 'string' && (item.parentId === null || typeof item.parentId === 'string') && Number.isInteger(item.order) && item.order >= 0 && typeof item.text === 'string' && item.text.length <= 500 && typeof item.collapsed === 'boolean' && positionValid && linksValid && (item.note === undefined || typeof item.note === 'string' && item.note.length <= 10000) && (item.imageAssetId === undefined || typeof item.imageAssetId === 'string') && (item.manualPosition === undefined || typeof item.manualPosition === 'boolean') && isFiniteNumber(item.createdAt) && isFiniteNumber(item.updatedAt)
}
const isMindMapConnection = (value: unknown): value is MindMapConnection => Boolean(value && typeof value === 'object' && typeof (value as MindMapConnection).id === 'string' && typeof (value as MindMapConnection).mapId === 'string' && typeof (value as MindMapConnection).sourceId === 'string' && typeof (value as MindMapConnection).targetId === 'string' && (value as MindMapConnection).sourceId !== (value as MindMapConnection).targetId && typeof (value as MindMapConnection).label === 'string' && typeof (value as MindMapConnection).color === 'string' && isFiniteNumber((value as MindMapConnection).width) && typeof (value as MindMapConnection).dashed === 'boolean' && typeof (value as MindMapConnection).directed === 'boolean')
type BackupAsset = Omit<MindMapAsset, 'blob'> & { dataUrl: string }
const isMindMapAsset = (value: unknown): value is BackupAsset => Boolean(value && typeof value === 'object' && typeof (value as BackupAsset).id === 'string' && typeof (value as BackupAsset).mapId === 'string' && typeof (value as BackupAsset).name === 'string' && ['image/png', 'image/jpeg', 'image/webp'].includes((value as BackupAsset).mimeType) && isFiniteNumber((value as BackupAsset).size) && (value as BackupAsset).size <= 5 * 1024 * 1024 && typeof (value as BackupAsset).dataUrl === 'string' && (value as BackupAsset).dataUrl.startsWith(`data:${(value as BackupAsset).mimeType};base64,`))

export function parseBackup(text: string): HubBackup {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('O arquivo não contém JSON válido.') }

  // Formato legado aceito: array direto de hábitos.
  if (Array.isArray(parsed)) {
    if (!parsed.every(isHabit)) throw new Error('O backup legado contém hábitos inválidos.')
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), appVersion: 'legacy', records: { habits: parsed } }
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('Formato de backup não reconhecido.')
  const backup = parsed as Partial<HubBackup>
  if (typeof backup.schemaVersion !== 'number' || typeof backup.exportedAt !== 'string' || typeof backup.appVersion !== 'string' || !backup.records) throw new Error('Metadados obrigatórios ausentes no backup.')
  if (!Array.isArray(backup.records.habits) || !backup.records.habits.every(isHabit)) throw new Error('A lista de hábitos do backup é inválida.')
  if (backup.records.habitCheckins && (!Array.isArray(backup.records.habitCheckins) || !backup.records.habitCheckins.every(isCheckin))) throw new Error('As marcações datadas do backup são inválidas.')
  if (backup.records.tasks && (!Array.isArray(backup.records.tasks) || !backup.records.tasks.every(isTask))) throw new Error('As tarefas do backup são inválidas.')
  if (backup.records.notes && (!Array.isArray(backup.records.notes) || !backup.records.notes.every(isNote))) throw new Error('As notas do backup são inválidas.')
  if (backup.records.boards && (!Array.isArray(backup.records.boards) || !backup.records.boards.every(isBoard))) throw new Error('Os quadros do backup são inválidos.')
  if (backup.records.nodes && (!Array.isArray(backup.records.nodes) || !backup.records.nodes.every(isNode))) throw new Error('Os nós do backup são inválidos.')
  if (backup.records.edges && (!Array.isArray(backup.records.edges) || !backup.records.edges.every(isEdge))) throw new Error('As conexões do backup são inválidas.')
  if (backup.records.focusPlaylists && (!Array.isArray(backup.records.focusPlaylists) || !backup.records.focusPlaylists.every(isFocusPlaylist))) throw new Error('As playlists do backup são inválidas.')
  if (backup.records.mindMaps && (!Array.isArray(backup.records.mindMaps) || !backup.records.mindMaps.every(isMindMap))) throw new Error('Os mapas mentais do backup são inválidos.')
  if (backup.records.mindMapTopics && (!Array.isArray(backup.records.mindMapTopics) || !backup.records.mindMapTopics.every(isMindMapTopic))) throw new Error('Os tópicos dos mapas mentais são inválidos.')
  if (backup.records.mindMapConnections && (!Array.isArray(backup.records.mindMapConnections) || !backup.records.mindMapConnections.every(isMindMapConnection))) throw new Error('As conexões dos mapas mentais são inválidas.')
  if (backup.records.mindMapAssets && (!Array.isArray(backup.records.mindMapAssets) || !backup.records.mindMapAssets.every(isMindMapAsset))) throw new Error('As imagens dos mapas mentais são inválidas.')
  if ((backup.records.mindMapConnections?.length || backup.records.mindMapAssets?.length) && !Array.isArray(backup.records.mindMaps)) throw new Error('Recursos visuais sem mapas no backup.')
  if (backup.records.mindMaps || backup.records.mindMapTopics) {
    const maps = (backup.records.mindMaps ?? []) as MindMap[]; const topics = (backup.records.mindMapTopics ?? []) as MindMapTopic[]
    if (topics.some((topic) => !maps.some((map) => map.id === topic.mapId))) throw new Error('Há tópicos sem mapa no backup.')
    maps.forEach((map) => validateMindMapDocument(map, topics.filter((topic) => topic.mapId === map.id)))
    const topicIds = new Set(topics.map(({ id }) => id)); const mapIds = new Set(maps.map(({ id }) => id)); const assetIds = new Set(((backup.records.mindMapAssets ?? []) as BackupAsset[]).map(({ id }) => id))
    if (((backup.records.mindMapConnections ?? []) as MindMapConnection[]).some((item) => !mapIds.has(item.mapId) || !topicIds.has(item.sourceId) || !topicIds.has(item.targetId))) throw new Error('Há conexões de mapas sem origem ou destino válido no backup.')
    if (((backup.records.mindMapAssets ?? []) as BackupAsset[]).some((item) => !mapIds.has(item.mapId)) || topics.some((topic) => topic.imageAssetId && !assetIds.has(topic.imageAssetId))) throw new Error('Há imagens sem mapa ou tópico válido no backup.')
  }
  if (Object.values(backup.records).some((records) => records !== undefined && !Array.isArray(records))) throw new Error('Uma store do backup possui formato inválido.')
  if (backup.preferences !== undefined) {
    if (!backup.preferences || typeof backup.preferences !== 'object') throw new Error('As preferências do backup são inválidas.')
    if (backup.preferences.settings !== undefined) {
      const settings = normalizeImportedSettings(backup.preferences.settings)
      if (!settings) throw new Error('As preferências do backup são inválidas.')
      backup.preferences.settings = settings
    }
  }
  return backup as HubBackup
}

export async function createBackup(): Promise<HubBackup> {
  const db = await openDatabase()
  const stores = Array.from(db.objectStoreNames)
  const transaction = db.transaction(stores, 'readonly')
  const records: HubBackup['records'] = { habits: [] }
  for (const storeName of stores) records[storeName] = await requestResult(transaction.objectStore(storeName).getAll()) as unknown[]
  await transactionDone(transaction)
  if (records[MIND_MAP_ASSETS_STORE]) records[MIND_MAP_ASSETS_STORE] = await Promise.all((records[MIND_MAP_ASSETS_STORE] as MindMapAsset[]).map(async ({ blob, ...asset }) => ({ ...asset, dataUrl: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob) }) })))
  return { schemaVersion: db.version, exportedAt: new Date().toISOString(), appVersion: '1.0.0', records, preferences: { settings: readStoredSettings() } }
}

export async function downloadBackup() {
  const backup = await createBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `hub-ferramentas-backup-${backup.exportedAt.slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return backup
}

export async function importBackup(backup: HubBackup, mode: ImportMode): Promise<ImportReport> {
  const db = await openDatabase()
  if (backup.records.habitCheckins?.length && !db.objectStoreNames.contains(CHECKINS_STORE)) throw new Error('Habilite marcações por data antes de importar este backup.')
  if (backup.records.tasks?.length && !db.objectStoreNames.contains(TASKS_STORE)) throw new Error('Habilite o Kanban antes de importar tarefas.')
  if ([backup.records.notes, backup.records.boards, backup.records.nodes, backup.records.edges].some((records) => records?.length) && ![NOTES_STORE, BOARDS_STORE, NODES_STORE, EDGES_STORE].every((name) => db.objectStoreNames.contains(name))) throw new Error('Habilite Anotações antes de importar dados criativos.')
  if (backup.records.focusPlaylists?.length && !db.objectStoreNames.contains(FOCUS_PLAYLISTS_STORE)) throw new Error('Abra Sons de Foco antes de importar playlists.')
  if ([backup.records.mindMaps, backup.records.mindMapTopics].some((records) => records?.length) && ![MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE].every((name) => db.objectStoreNames.contains(name))) throw new Error('Habilite Mapas Mentais antes de importar esses dados.')
  if ([backup.records.mindMapConnections, backup.records.mindMapAssets].some((records) => records?.length) && ![MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE].every((name) => db.objectStoreNames.contains(name))) throw new Error('Habilite os recursos visuais dos mapas antes de importar conexões ou imagens.')
  const restoredAssets = await Promise.all(((backup.records.mindMapAssets ?? []) as BackupAsset[]).map(async ({ dataUrl, ...asset }) => ({ ...asset, blob: await (await fetch(dataUrl)).blob() })))
  const optionalStores = [CHECKINS_STORE, TASKS_STORE, NOTES_STORE, BOARDS_STORE, NODES_STORE, EDGES_STORE, FOCUS_PLAYLISTS_STORE, MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE, MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE].filter((name) => db.objectStoreNames.contains(name))
  const stores = [HABITS_STORE, ...optionalStores]
  const transaction = db.transaction(stores, 'readwrite')
  const habitsStore = transaction.objectStore(HABITS_STORE)
  const checkinsStore = stores.includes(CHECKINS_STORE) ? transaction.objectStore(CHECKINS_STORE) : null
  const tasksStore = stores.includes(TASKS_STORE) ? transaction.objectStore(TASKS_STORE) : null
  const notesStore = stores.includes(NOTES_STORE) ? transaction.objectStore(NOTES_STORE) : null
  const boardsStore = stores.includes(BOARDS_STORE) ? transaction.objectStore(BOARDS_STORE) : null
  const nodesStore = stores.includes(NODES_STORE) ? transaction.objectStore(NODES_STORE) : null
  const edgesStore = stores.includes(EDGES_STORE) ? transaction.objectStore(EDGES_STORE) : null
  const focusPlaylistsStore = stores.includes(FOCUS_PLAYLISTS_STORE) ? transaction.objectStore(FOCUS_PLAYLISTS_STORE) : null
  const mindMapsStore = stores.includes(MIND_MAPS_STORE) ? transaction.objectStore(MIND_MAPS_STORE) : null
  const mindMapTopicsStore = stores.includes(MIND_MAP_TOPICS_STORE) ? transaction.objectStore(MIND_MAP_TOPICS_STORE) : null
  const mindMapConnectionsStore = stores.includes(MIND_MAP_CONNECTIONS_STORE) ? transaction.objectStore(MIND_MAP_CONNECTIONS_STORE) : null
  const mindMapAssetsStore = stores.includes(MIND_MAP_ASSETS_STORE) ? transaction.objectStore(MIND_MAP_ASSETS_STORE) : null
  let imported = 0
  let ignored = 0

  if (mode === 'replace') {
    habitsStore.clear()
    checkinsStore?.clear()
    tasksStore?.clear()
    notesStore?.clear(); boardsStore?.clear(); nodesStore?.clear(); edgesStore?.clear(); focusPlaylistsStore?.clear(); mindMapsStore?.clear(); mindMapTopicsStore?.clear(); mindMapConnectionsStore?.clear(); mindMapAssetsStore?.clear()
    backup.records.habits.forEach((record) => { habitsStore.put(record); imported++ })
    backup.records.habitCheckins?.forEach((record) => { checkinsStore?.put(record); imported++ })
    backup.records.tasks?.forEach((record) => { tasksStore?.put(record); imported++ })
    backup.records.notes?.forEach((record) => { notesStore?.put(record); imported++ })
    backup.records.boards?.forEach((record) => { boardsStore?.put(record); imported++ })
    backup.records.nodes?.forEach((record) => { nodesStore?.put(record); imported++ })
    backup.records.edges?.forEach((record) => { edgesStore?.put(record); imported++ })
    backup.records.focusPlaylists?.forEach((record) => { focusPlaylistsStore?.put(record); imported++ })
    backup.records.mindMaps?.forEach((record) => { mindMapsStore?.put(record); imported++ })
    backup.records.mindMapTopics?.forEach((record) => { mindMapTopicsStore?.put(record); imported++ })
    backup.records.mindMapConnections?.forEach((record) => { mindMapConnectionsStore?.put(record); imported++ })
    restoredAssets.forEach((record) => { mindMapAssetsStore?.put(record); imported++ })
  } else {
    for (const record of backup.records.habits) {
      const existing = await requestResult(habitsStore.get(record.id))
      if (existing) ignored++
      else { habitsStore.add(record); imported++ }
    }
    for (const record of backup.records.habitCheckins ?? []) {
      const existing = checkinsStore ? await requestResult(checkinsStore.get(record.id)) : true
      if (existing) ignored++
      else { checkinsStore!.add(record); imported++ }
    }
    for (const record of backup.records.tasks ?? []) {
      const existing = tasksStore ? await requestResult(tasksStore.get((record as Task).id)) : true
      if (existing) ignored++
      else { tasksStore!.add(record); imported++ }
    }
    for (const [records, store] of [[backup.records.notes, notesStore], [backup.records.boards, boardsStore], [backup.records.nodes, nodesStore], [backup.records.edges, edgesStore], [backup.records.focusPlaylists, focusPlaylistsStore]] as const) {
      for (const record of records ?? []) {
        const id = (record as { id: string }).id
        const existing = store ? await requestResult(store.get(id)) : true
        if (existing) ignored++
        else { store!.add(record); imported++ }
      }
    }
    for (const map of (backup.records.mindMaps ?? []) as MindMap[]) {
      const mapTopics = ((backup.records.mindMapTopics ?? []) as MindMapTopic[]).filter((topic) => topic.mapId === map.id)
      const existing = mindMapsStore ? await requestResult(mindMapsStore.get(map.id)) : true
      if (existing) ignored += 1 + mapTopics.length
      else {
        mindMapsStore!.add(map); mapTopics.forEach((topic) => mindMapTopicsStore!.add(topic)); imported += 1 + mapTopics.length
      }
    }
    for (const [records, store] of [[backup.records.mindMapConnections, mindMapConnectionsStore], [restoredAssets, mindMapAssetsStore]] as const) for (const record of records ?? []) { const existing = store ? await requestResult(store.get((record as { id: string }).id)) : true; if (existing) ignored++; else { store!.add(record); imported++ } }
  }
  await transactionDone(transaction)
  window.dispatchEvent(new Event('habits:changed'))
  window.dispatchEvent(new Event('tasks:changed'))
  window.dispatchEvent(new Event('notes:changed'))
  window.dispatchEvent(new Event('focus-playlists:changed'))
  window.dispatchEvent(new Event('mind-maps:changed'))
  let preferencesImported = false
  let preferencesError: string | undefined
  if (backup.preferences?.settings) {
    try { applyStoredSettings(backup.preferences.settings); preferencesImported = true }
    catch (reason) { preferencesError = reason instanceof Error ? reason.message : 'Não foi possível aplicar as preferências.' }
  }
  return { imported, ignored, preferencesImported, preferencesError }
}
