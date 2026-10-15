import type { MindMap, MindMapDocument, MindMapSummary, MindMapTopic, MindMapViewport } from '../../features/mind-maps/types'
import { normalizeTopicOrders, validateMindMapDocument } from '../../features/mind-maps/tree'
import { MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE, openDatabase, requestResult, transactionDone, upgradeToMindMapSchema } from './indexedDb'

const EVENT = 'mind-maps:changed'
const emit = () => window.dispatchEvent(new Event(EVENT))

const cleanName = (name?: string) => {
  const value = name?.trim() || 'Mapa sem título'
  if (value.length > 100) throw new Error('Use no máximo 100 caracteres no nome do mapa.')
  return value
}

export const mindMapsRepository = {
  async isEnabled() { const db = await openDatabase(); return db.objectStoreNames.contains(MIND_MAPS_STORE) && db.objectStoreNames.contains(MIND_MAP_TOPICS_STORE) },
  enable: upgradeToMindMapSchema,
  subscribe(listener: () => void) { window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener) },
  async list(): Promise<MindMapSummary[]> {
    const db = await openDatabase(); if (!db.objectStoreNames.contains(MIND_MAPS_STORE)) return []
    const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE], 'readonly')
    const [maps, topics] = await Promise.all([
      requestResult(tx.objectStore(MIND_MAPS_STORE).getAll()) as Promise<MindMap[]>,
      requestResult(tx.objectStore(MIND_MAP_TOPICS_STORE).getAll()) as Promise<MindMapTopic[]>,
    ])
    await transactionDone(tx)
    const counts = new Map<string, number>(); topics.forEach((topic) => counts.set(topic.mapId, (counts.get(topic.mapId) ?? 0) + 1))
    return maps.map((map) => ({ ...map, topicCount: counts.get(map.id) ?? 0 })).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async create(name?: string): Promise<MindMapDocument> {
    const now = Date.now(); const mapId = crypto.randomUUID(); const rootId = crypto.randomUUID()
    const map: MindMap = { id: mapId, schemaVersion: 1, name: cleanName(name), rootId, layout: 'radial', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: now, updatedAt: now }
    const root: MindMapTopic = { id: rootId, mapId, parentId: null, order: 0, text: map.name, collapsed: false, createdAt: now, updatedAt: now }
    const db = await openDatabase(); const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE], 'readwrite')
    tx.objectStore(MIND_MAPS_STORE).add(map); tx.objectStore(MIND_MAP_TOPICS_STORE).add(root); await transactionDone(tx); emit()
    return { map, topics: [root] }
  },
  async get(id: string): Promise<MindMapDocument | null> {
    const db = await openDatabase(); const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE], 'readonly')
    const [map, topics] = await Promise.all([
      requestResult(tx.objectStore(MIND_MAPS_STORE).get(id)) as Promise<MindMap | undefined>,
      requestResult(tx.objectStore(MIND_MAP_TOPICS_STORE).index('mapId').getAll(id)) as Promise<MindMapTopic[]>,
    ]); await transactionDone(tx)
    if (!map) return null
    validateMindMapDocument(map, topics); return { map, topics: normalizeTopicOrders(topics) }
  },
  async save(document: MindMapDocument) {
    const topics = normalizeTopicOrders(document.topics)
    const map = { ...document.map, name: cleanName(document.map.name), updatedAt: Date.now() }
    validateMindMapDocument(map, topics)
    const db = await openDatabase(); const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE], 'readwrite')
    const maps = tx.objectStore(MIND_MAPS_STORE); const topicStore = tx.objectStore(MIND_MAP_TOPICS_STORE)
    const current = await requestResult(maps.get(map.id)) as MindMap | undefined
    if (!current) { tx.abort(); throw new Error('Este mapa não existe mais.') }
    const existing = await requestResult(topicStore.index('mapId').getAll(map.id)) as MindMapTopic[]
    existing.forEach((topic) => topicStore.delete(topic.id)); topics.forEach((topic) => topicStore.put(topic))
    maps.put(map); await transactionDone(tx); emit(); return { map, topics }
  },
  async saveViewport(id: string, viewport: MindMapViewport) {
    const db = await openDatabase(); const tx = db.transaction(MIND_MAPS_STORE, 'readwrite'); const store = tx.objectStore(MIND_MAPS_STORE)
    const map = await requestResult(store.get(id)) as MindMap | undefined
    if (!map) { tx.abort(); throw new Error('Este mapa não existe mais.') }
    store.put({ ...map, viewport, updatedAt: Date.now() }); await transactionDone(tx); emit()
  },
  async rename(id: string, name: string) {
    const db = await openDatabase(); const tx = db.transaction(MIND_MAPS_STORE, 'readwrite'); const store = tx.objectStore(MIND_MAPS_STORE)
    const map = await requestResult(store.get(id)) as MindMap | undefined
    if (!map) { tx.abort(); throw new Error('Este mapa não existe mais.') }
    store.put({ ...map, name: cleanName(name), updatedAt: Date.now() }); await transactionDone(tx); emit()
  },
  async duplicate(id: string): Promise<MindMapDocument> {
    const source = await this.get(id); if (!source) throw new Error('Este mapa não existe mais.')
    const now = Date.now(); const mapId = crypto.randomUUID(); const ids = new Map(source.topics.map((topic) => [topic.id, crypto.randomUUID()]))
    const topics = source.topics.map((topic) => ({ ...topic, id: ids.get(topic.id)!, mapId, parentId: topic.parentId ? ids.get(topic.parentId)! : null, createdAt: now, updatedAt: now }))
    const suffix = ' (cópia)'; const copyName = `${source.map.name.slice(0, 100 - suffix.length)}${suffix}`
    const map: MindMap = { ...source.map, id: mapId, rootId: ids.get(source.map.rootId)!, name: cleanName(copyName), createdAt: now, updatedAt: now }
    validateMindMapDocument(map, topics)
    const db = await openDatabase(); const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE], 'readwrite'); tx.objectStore(MIND_MAPS_STORE).add(map); topics.forEach((topic) => tx.objectStore(MIND_MAP_TOPICS_STORE).add(topic)); await transactionDone(tx); emit(); return { map, topics }
  },
  async remove(id: string) {
    const db = await openDatabase(); const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE], 'readwrite'); const topicStore = tx.objectStore(MIND_MAP_TOPICS_STORE)
    const topics = await requestResult(topicStore.index('mapId').getAll(id)) as MindMapTopic[]
    topics.forEach((topic) => topicStore.delete(topic.id)); tx.objectStore(MIND_MAPS_STORE).delete(id); await transactionDone(tx); emit()
  },
}
