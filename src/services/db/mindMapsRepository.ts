import type { MindMap, MindMapAsset, MindMapConnection, MindMapDocument, MindMapSummary, MindMapTopic, MindMapViewport } from '../../features/mind-maps/types'
import { normalizeTopicOrders, validateMindMapDocument } from '../../features/mind-maps/tree'
import { MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE, MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE, openDatabase, requestResult, transactionDone, upgradeToMindMapSchema, upgradeToMindMapMediaSchema } from './indexedDb'

const EVENT = 'mind-maps:changed'
const emit = () => window.dispatchEvent(new Event(EVENT))
const cleanName = (name?: string) => {
  const value = name?.trim() || 'Mapa sem título'
  if (value.length > 100) throw new Error('Use no máximo 100 caracteres no nome do mapa.')
  return value
}
const hasAdvancedStores = (db: IDBDatabase) => db.objectStoreNames.contains(MIND_MAP_CONNECTIONS_STORE) && db.objectStoreNames.contains(MIND_MAP_ASSETS_STORE)
const sanitizeConnections = (document: MindMapDocument) => {
  const topicIds = new Set(document.topics.map(({ id }) => id)); const ids = new Set<string>()
  return (document.connections ?? []).filter((item) => {
    const valid = item.mapId === document.map.id && topicIds.has(item.sourceId) && topicIds.has(item.targetId) && item.sourceId !== item.targetId && !ids.has(item.id)
    if (valid) ids.add(item.id); return valid
  }).map((item) => ({ ...item, label: item.label.slice(0, 120), width: Math.min(6, Math.max(1, item.width || 2)) }))
}

export const mindMapsRepository = {
  async isEnabled() { const db = await openDatabase(); return db.objectStoreNames.contains(MIND_MAPS_STORE) && db.objectStoreNames.contains(MIND_MAP_TOPICS_STORE) },
  async isAdvancedEnabled() { return hasAdvancedStores(await openDatabase()) },
  enable: upgradeToMindMapSchema,
  enableAdvanced: upgradeToMindMapMediaSchema,
  subscribe(listener: () => void) { window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener) },
  async list(): Promise<MindMapSummary[]> {
    const db = await openDatabase(); if (!db.objectStoreNames.contains(MIND_MAPS_STORE)) return []
    const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE], 'readonly')
    const [maps, topics] = await Promise.all([requestResult(tx.objectStore(MIND_MAPS_STORE).getAll()) as Promise<MindMap[]>, requestResult(tx.objectStore(MIND_MAP_TOPICS_STORE).getAll()) as Promise<MindMapTopic[]>])
    await transactionDone(tx); const counts = new Map<string, number>(); topics.forEach((topic) => counts.set(topic.mapId, (counts.get(topic.mapId) ?? 0) + 1))
    return maps.map((map) => ({ ...map, topicCount: counts.get(map.id) ?? 0 })).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async create(name?: string): Promise<MindMapDocument> {
    const now = Date.now(); const mapId = crypto.randomUUID(); const rootId = crypto.randomUUID()
    const map: MindMap = { id: mapId, schemaVersion: 1, name: cleanName(name), rootId, layout: 'radial', theme: 'classic', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: now, updatedAt: now }
    const root: MindMapTopic = { id: rootId, mapId, parentId: null, order: 0, text: map.name, collapsed: false, createdAt: now, updatedAt: now }
    const db = await openDatabase(); const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE], 'readwrite')
    tx.objectStore(MIND_MAPS_STORE).add(map); tx.objectStore(MIND_MAP_TOPICS_STORE).add(root); await transactionDone(tx); emit(); return { map, topics: [root], connections: [] }
  },
  async get(id: string): Promise<MindMapDocument | null> {
    const db = await openDatabase(); const advanced = hasAdvancedStores(db); const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE, ...(advanced ? [MIND_MAP_CONNECTIONS_STORE] : [])], 'readonly')
    const [map, topics, connections] = await Promise.all([
      requestResult(tx.objectStore(MIND_MAPS_STORE).get(id)) as Promise<MindMap | undefined>,
      requestResult(tx.objectStore(MIND_MAP_TOPICS_STORE).index('mapId').getAll(id)) as Promise<MindMapTopic[]>,
      advanced ? requestResult(tx.objectStore(MIND_MAP_CONNECTIONS_STORE).index('mapId').getAll(id)) as Promise<MindMapConnection[]> : Promise.resolve([]),
    ]); await transactionDone(tx); if (!map) return null
    validateMindMapDocument(map, topics); return { map, topics: normalizeTopicOrders(topics), connections }
  },
  async save(document: MindMapDocument): Promise<MindMapDocument> {
    const topics = normalizeTopicOrders(document.topics); const map = { ...document.map, name: cleanName(document.map.name), updatedAt: Date.now() }; validateMindMapDocument(map, topics)
    const connections = sanitizeConnections({ ...document, map, topics }); const db = await openDatabase(); const advanced = hasAdvancedStores(db)
    if (connections.length && !advanced) throw new Error('Habilite os recursos visuais antes de criar conexões.')
    const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE, ...(advanced ? [MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE] : [])], 'readwrite')
    const maps = tx.objectStore(MIND_MAPS_STORE); const topicStore = tx.objectStore(MIND_MAP_TOPICS_STORE); const current = await requestResult(maps.get(map.id)) as MindMap | undefined
    if (!current) { tx.abort(); throw new Error('Este mapa não existe mais.') }
    const existing = await requestResult(topicStore.index('mapId').getAll(map.id)) as MindMapTopic[]; existing.forEach(({ id }) => topicStore.delete(id)); topics.forEach((topic) => topicStore.put(topic)); maps.put(map)
    if (advanced) {
      const store = tx.objectStore(MIND_MAP_CONNECTIONS_STORE); const old = await requestResult(store.index('mapId').getAll(map.id)) as MindMapConnection[]; old.forEach(({ id }) => store.delete(id)); connections.forEach((item) => store.put(item))
      const assetStore = tx.objectStore(MIND_MAP_ASSETS_STORE); const assets = await requestResult(assetStore.index('mapId').getAll(map.id)) as MindMapAsset[]; const used = new Set(topics.map(({ imageAssetId }) => imageAssetId).filter(Boolean)); assets.filter(({ id }) => !used.has(id)).forEach(({ id }) => assetStore.delete(id))
    }
    await transactionDone(tx); emit(); return { map, topics, connections }
  },
  async saveViewport(id: string, viewport: MindMapViewport) {
    const db = await openDatabase(); const tx = db.transaction(MIND_MAPS_STORE, 'readwrite'); const store = tx.objectStore(MIND_MAPS_STORE); const map = await requestResult(store.get(id)) as MindMap | undefined
    if (!map) { tx.abort(); throw new Error('Este mapa não existe mais.') }; store.put({ ...map, viewport, updatedAt: Date.now() }); await transactionDone(tx); emit()
  },
  async rename(id: string, name: string) {
    const db = await openDatabase(); const tx = db.transaction(MIND_MAPS_STORE, 'readwrite'); const store = tx.objectStore(MIND_MAPS_STORE); const map = await requestResult(store.get(id)) as MindMap | undefined
    if (!map) { tx.abort(); throw new Error('Este mapa não existe mais.') }; store.put({ ...map, name: cleanName(name), updatedAt: Date.now() }); await transactionDone(tx); emit()
  },
  async saveAsset(mapId: string, file: File): Promise<MindMapAsset> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Use uma imagem PNG, JPEG ou WebP.')
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.')
    const db = await openDatabase(); if (!hasAdvancedStores(db)) throw new Error('Habilite os recursos visuais antes de adicionar imagens.')
    const asset: MindMapAsset = { id: crypto.randomUUID(), mapId, name: file.name.slice(0, 180), mimeType: file.type as MindMapAsset['mimeType'], size: file.size, blob: file, createdAt: Date.now() }
    const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_ASSETS_STORE], 'readwrite'); const map = await requestResult(tx.objectStore(MIND_MAPS_STORE).get(mapId))
    if (!map) { tx.abort(); throw new Error('Este mapa não existe mais.') }
    tx.objectStore(MIND_MAP_ASSETS_STORE).add(asset); await transactionDone(tx); return asset
  },
  async getAssets(mapId: string): Promise<MindMapAsset[]> { const db = await openDatabase(); if (!hasAdvancedStores(db)) return []; const tx = db.transaction(MIND_MAP_ASSETS_STORE, 'readonly'); const assets = await requestResult(tx.objectStore(MIND_MAP_ASSETS_STORE).index('mapId').getAll(mapId)) as MindMapAsset[]; await transactionDone(tx); return assets },
  async duplicate(id: string): Promise<MindMapDocument> {
    const source = await this.get(id); if (!source) throw new Error('Este mapa não existe mais.')
    const now = Date.now(); const mapId = crypto.randomUUID(); const topicIds = new Map(source.topics.map(({ id }) => [id, crypto.randomUUID()])); const db = await openDatabase(); const advanced = hasAdvancedStores(db); const sourceAssets = advanced ? await this.getAssets(id) : []; const assetIds = new Map(sourceAssets.map(({ id }) => [id, crypto.randomUUID()]))
    const topics = source.topics.map((topic) => ({ ...topic, id: topicIds.get(topic.id)!, mapId, parentId: topic.parentId ? topicIds.get(topic.parentId)! : null, imageAssetId: topic.imageAssetId ? assetIds.get(topic.imageAssetId) : undefined, createdAt: now, updatedAt: now }))
    const suffix = ' (cópia)'; const map: MindMap = { ...source.map, id: mapId, rootId: topicIds.get(source.map.rootId)!, name: cleanName(`${source.map.name.slice(0, 100 - suffix.length)}${suffix}`), createdAt: now, updatedAt: now }
    const connections = (source.connections ?? []).map((item) => ({ ...item, id: crypto.randomUUID(), mapId, sourceId: topicIds.get(item.sourceId)!, targetId: topicIds.get(item.targetId)!, createdAt: now, updatedAt: now }))
    validateMindMapDocument(map, topics); const tx = db.transaction([MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE, ...(advanced ? [MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE] : [])], 'readwrite'); tx.objectStore(MIND_MAPS_STORE).add(map); topics.forEach((topic) => tx.objectStore(MIND_MAP_TOPICS_STORE).add(topic))
    if (advanced) { connections.forEach((item) => tx.objectStore(MIND_MAP_CONNECTIONS_STORE).add(item)); sourceAssets.forEach((asset) => tx.objectStore(MIND_MAP_ASSETS_STORE).add({ ...asset, id: assetIds.get(asset.id)!, mapId })) }; await transactionDone(tx); emit(); return { map, topics, connections }
  },
  async remove(id: string) {
    const db = await openDatabase(); const advanced = hasAdvancedStores(db); const stores = [MIND_MAPS_STORE, MIND_MAP_TOPICS_STORE, ...(advanced ? [MIND_MAP_CONNECTIONS_STORE, MIND_MAP_ASSETS_STORE] : [])]; const tx = db.transaction(stores, 'readwrite')
    for (const name of stores.slice(1)) { const store = tx.objectStore(name); const records = await requestResult(store.index('mapId').getAll(id)) as Array<{ id: string }>; records.forEach(({ id: recordId }) => store.delete(recordId)) }
    tx.objectStore(MIND_MAPS_STORE).delete(id); await transactionDone(tx); emit()
  },
}
