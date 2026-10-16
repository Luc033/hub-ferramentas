import { blocksToText, normalizeNote, textToBlocks, type Board, type MindEdge, type MindNode, type Note, type NoteAsset, type NoteFolder, type NoteMeta, type NoteSnapshot, type NoteTag } from '../../features/notes/types'
import { blocksAreSafe } from '../../features/notes/noteSecurity'
import { BOARDS_STORE, EDGES_STORE, NODES_STORE, NOTE_ASSETS_STORE, NOTE_FOLDERS_STORE, NOTE_META_STORE, NOTE_SNAPSHOTS_STORE, NOTE_TAGS_STORE, NOTES_STORE, openDatabase, requestResult, transactionDone, upgradeToCreativeSchema, upgradeToNotesProSchema } from './indexedDb'

const EVENT = 'notes:changed'
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hub-notes') : null
const emit = () => { window.dispatchEvent(new Event(EVENT)); channel?.postMessage({ type: EVENT, at: Date.now() }) }
channel?.addEventListener('message', () => window.dispatchEvent(new Event(EVENT)))
const BOARD_ID = 'main'
const SNAPSHOT_LIMIT = 20

async function hasExpectedImageSignature(file: File) {
  const chunk = file.slice(0, 12)
  const buffer = typeof chunk.arrayBuffer === 'function' ? await chunk.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(chunk) })
  const bytes = new Uint8Array(buffer)
  if (file.type === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  if (file.type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (file.type === 'image/gif') return String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a' || String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a'
  if (file.type === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}

async function canDecodeImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    try { const bitmap = await createImageBitmap(file); const valid = bitmap.width > 0 && bitmap.height > 0; bitmap.close(); return valid } catch { return false }
  }
  if (typeof Image !== 'undefined' && 'decode' in Image.prototype) {
    const url = URL.createObjectURL(file)
    try { const image = new Image(); image.src = url; await image.decode(); return image.naturalWidth > 0 && image.naturalHeight > 0 } catch { return false } finally { URL.revokeObjectURL(url) }
  }
  return true
}

async function pruneSnapshots(noteId: string) {
  const db = await openDatabase(); const tx = db.transaction(NOTE_SNAPSHOTS_STORE, 'readwrite'); const store = tx.objectStore(NOTE_SNAPSHOTS_STORE)
  const records = await requestResult(store.index('noteId').getAll(noteId)) as NoteSnapshot[]
  records.sort((a, b) => b.createdAt - a.createdAt).slice(SNAPSHOT_LIMIT).forEach((snapshot) => store.delete(snapshot.id))
  await transactionDone(tx)
}

function collectAssetReferences(value: unknown, result = new Set<string>()) {
  if (typeof value === 'string' && value.startsWith('hub-note-asset:')) result.add(value.slice('hub-note-asset:'.length))
  else if (Array.isArray(value)) value.forEach((item) => collectAssetReferences(item, result))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectAssetReferences(item, result))
  return result
}

async function removeUnreferencedAssets() {
  const db = await openDatabase(); const tx = db.transaction([NOTES_STORE, NOTE_SNAPSHOTS_STORE, NOTE_ASSETS_STORE], 'readwrite')
  const [notes, snapshots, assets] = await Promise.all([
    requestResult(tx.objectStore(NOTES_STORE).getAll()) as Promise<Note[]>,
    requestResult(tx.objectStore(NOTE_SNAPSHOTS_STORE).getAll()) as Promise<NoteSnapshot[]>,
    requestResult(tx.objectStore(NOTE_ASSETS_STORE).getAll()) as Promise<NoteAsset[]>,
  ])
  const used = collectAssetReferences(notes.map((note) => note.blocks)); collectAssetReferences(snapshots.map((snapshot) => snapshot.blocks), used)
  const gracePeriod = Date.now() - 24 * 60 * 60_000
  assets.filter((asset) => asset.createdAt < gracePeriod && !used.has(asset.id)).forEach((asset) => tx.objectStore(NOTE_ASSETS_STORE).delete(asset.id))
  await transactionDone(tx)
}

export const notesRepository = {
  async isEnabled() { return (await openDatabase()).objectStoreNames.contains(NOTES_STORE) },
  async isProEnabled() { const db = await openDatabase(); return [NOTE_FOLDERS_STORE, NOTE_TAGS_STORE, NOTE_ASSETS_STORE, NOTE_SNAPSHOTS_STORE, NOTE_META_STORE].every((name) => db.objectStoreNames.contains(name)) },
  async enable() { await upgradeToCreativeSchema(); return upgradeToNotesProSchema() },
  subscribe(listener: () => void) { window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener) },
  async getNotes(): Promise<Note[]> {
    const db = await openDatabase(); if (!db.objectStoreNames.contains(NOTES_STORE)) return []
    const tx = db.transaction(NOTES_STORE, 'readonly'); const records = await requestResult(tx.objectStore(NOTES_STORE).getAll()) as Array<Partial<Note> & Pick<Note, 'id'>>; await transactionDone(tx)
    return records.map(normalizeNote).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async getNote(id: string) { const db = await openDatabase(); const tx = db.transaction(NOTES_STORE, 'readonly'); const raw = await requestResult(tx.objectStore(NOTES_STORE).get(id)) as (Partial<Note> & Pick<Note, 'id'>) | undefined; await transactionDone(tx); return raw ? normalizeNote(raw) : null },
  async saveNote(note: Note): Promise<Note> {
    const db = await openDatabase(); const tx = db.transaction([NOTES_STORE, NOTE_SNAPSHOTS_STORE], 'readwrite'); const store = tx.objectStore(NOTES_STORE)
    const existingRaw = await requestResult(store.get(note.id)) as (Partial<Note> & Pick<Note, 'id'>) | undefined
    const existing = existingRaw ? normalizeNote(existingRaw) : null
    if (existing && existing.revision > note.revision) throw new Error('Esta anotação foi alterada em outra aba. Recarregue ou duplique sua versão antes de continuar.')
    const now = Date.now(); const currentProjection = Array.isArray(note.blocks) ? blocksToText(note.blocks) : ''
    // Keep compatibility with callers from the legacy text editor. The block editor
    // always submits the projection and blocks together; a differing projection means
    // an older caller intentionally changed only `content`.
    const blocks = note.content !== currentProjection ? textToBlocks(note.content) : Array.isArray(note.blocks) && note.blocks.length ? note.blocks : textToBlocks(note.content)
    if (!blocksAreSafe(blocks)) throw new Error('A anotação contém blocos ou endereços que não podem ser salvos com segurança.')
    const next = normalizeNote({ ...note, blocks, content: blocksToText(blocks), updatedAt: now, revision: Math.max(existing?.revision ?? 0, note.revision) + 1 })
    if (existing) {
      const snapshotStore = tx.objectStore(NOTE_SNAPSHOTS_STORE)
      const previousSnapshots = await requestResult(snapshotStore.index('noteId').getAll(note.id)) as NoteSnapshot[]
      const latestPeriodic = previousSnapshots.filter((item) => item.reason === 'salvamento periódico').reduce((latest, item) => Math.max(latest, item.createdAt), 0)
      if (!latestPeriodic || now - latestPeriodic >= 5 * 60_000) snapshotStore.put({ id: crypto.randomUUID(), noteId: note.id, title: existing.title, content: existing.content, blocks: existing.blocks, createdAt: now, reason: 'salvamento periódico' } satisfies NoteSnapshot)
    }
    store.put(next); await transactionDone(tx); void pruneSnapshots(note.id).then(removeUnreferencedAssets).catch(() => undefined); emit(); return next
  },
  async createNote(title = '', content = '') { const now = Date.now(); const note = normalizeNote({ id: crypto.randomUUID(), title: title.slice(0, 120), content, blocks: textToBlocks(content), createdAt: now, updatedAt: now, revision: 0 }); return this.saveNote(note) },
  async duplicateNote(id: string) { const source = await this.getNote(id); if (!source) throw new Error('A anotação não existe mais.'); const now = Date.now(); const copy = normalizeNote({ ...source, id: crypto.randomUUID(), title: `${source.title || 'Sem título'} (cópia)`, createdAt: now, updatedAt: now, revision: 0, deletedAt: null, archivedAt: null }); return this.saveNote(copy) },
  async archiveNote(id: string, archived: boolean) { const note = await this.getNote(id); if (!note) throw new Error('A anotação não existe mais.'); await this.createSnapshot(id, archived ? 'antes de arquivar' : 'antes de restaurar do arquivo'); return this.saveNote({ ...note, archivedAt: archived ? Date.now() : null }) },
  async moveToTrash(id: string) { const note = await this.getNote(id); if (!note) throw new Error('A anotação não existe mais.'); await this.createSnapshot(id, 'antes de mover para lixeira'); return this.saveNote({ ...note, deletedAt: Date.now() }) },
  async restoreNote(id: string) { const note = await this.getNote(id); if (!note) throw new Error('A anotação não existe mais.'); return this.saveNote({ ...note, deletedAt: null, archivedAt: null }) },
  async deleteNote(id: string) { const db = await openDatabase(); const tx = db.transaction([NOTES_STORE, NOTE_SNAPSHOTS_STORE], 'readwrite'); tx.objectStore(NOTES_STORE).delete(id); const snapshots = await requestResult(tx.objectStore(NOTE_SNAPSHOTS_STORE).index('noteId').getAllKeys(id)); snapshots.forEach((key) => tx.objectStore(NOTE_SNAPSHOTS_STORE).delete(key)); await transactionDone(tx); await removeUnreferencedAssets(); emit() },
  async cleanupUnusedAssets() { await removeUnreferencedAssets() },
  async createSnapshot(noteId: string, reason: string) { const note = await this.getNote(noteId); if (!note) return; const snapshot: NoteSnapshot = { id: crypto.randomUUID(), noteId, title: note.title, content: note.content, blocks: note.blocks, createdAt: Date.now(), reason }; const db = await openDatabase(); const tx = db.transaction(NOTE_SNAPSHOTS_STORE, 'readwrite'); tx.objectStore(NOTE_SNAPSHOTS_STORE).put(snapshot); await transactionDone(tx); await pruneSnapshots(noteId) },
  async getSnapshots(noteId: string) { const db = await openDatabase(); const tx = db.transaction(NOTE_SNAPSHOTS_STORE, 'readonly'); const records = await requestResult(tx.objectStore(NOTE_SNAPSHOTS_STORE).index('noteId').getAll(noteId)) as NoteSnapshot[]; await transactionDone(tx); return records.sort((a, b) => b.createdAt - a.createdAt) },
  async restoreSnapshot(snapshot: NoteSnapshot) { const note = await this.getNote(snapshot.noteId); if (!note) throw new Error('A anotação não existe mais.'); await this.createSnapshot(note.id, 'antes de restaurar versão'); return this.saveNote({ ...note, title: snapshot.title, content: snapshot.content, blocks: snapshot.blocks }) },
  async getFolders() { const db = await openDatabase(); const tx = db.transaction(NOTE_FOLDERS_STORE, 'readonly'); const records = await requestResult(tx.objectStore(NOTE_FOLDERS_STORE).getAll()) as NoteFolder[]; await transactionDone(tx); return records.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'pt-BR')) },
  async saveFolder(folder: Pick<NoteFolder, 'id' | 'name'> & Partial<NoteFolder>) { const clean = folder.name.trim().slice(0, 60); if (!clean) throw new Error('Informe o nome da pasta.'); const now = Date.now(); const record: NoteFolder = { id: folder.id, name: clean, order: folder.order ?? now, createdAt: folder.createdAt ?? now, updatedAt: now }; const db = await openDatabase(); const tx = db.transaction(NOTE_FOLDERS_STORE, 'readwrite'); tx.objectStore(NOTE_FOLDERS_STORE).put(record); await transactionDone(tx); emit(); return record },
  async deleteFolder(id: string) { const db = await openDatabase(); const tx = db.transaction([NOTE_FOLDERS_STORE, NOTES_STORE], 'readwrite'); tx.objectStore(NOTE_FOLDERS_STORE).delete(id); const notes = await requestResult(tx.objectStore(NOTES_STORE).getAll()) as Note[]; notes.filter((note) => note.folderId === id).forEach((note) => tx.objectStore(NOTES_STORE).put({ ...note, folderId: null, revision: note.revision + 1, updatedAt: Date.now() })); await transactionDone(tx); emit() },
  async getTags() { const db = await openDatabase(); const tx = db.transaction(NOTE_TAGS_STORE, 'readonly'); const records = await requestResult(tx.objectStore(NOTE_TAGS_STORE).getAll()) as NoteTag[]; await transactionDone(tx); return records.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) },
  async createTag(name: string, color = '#8b5cf6') { const clean = name.trim().slice(0, 32); if (!clean) throw new Error('Informe a etiqueta.'); const existing = (await this.getTags()).find((tag) => tag.name.localeCompare(clean, 'pt-BR', { sensitivity: 'base' }) === 0); if (existing) return existing; const tag: NoteTag = { id: crypto.randomUUID(), name: clean, color, createdAt: Date.now() }; const db = await openDatabase(); const tx = db.transaction(NOTE_TAGS_STORE, 'readwrite'); tx.objectStore(NOTE_TAGS_STORE).add(tag); await transactionDone(tx); emit(); return tag },
  async saveAsset(file: File) { if (file.size > 10 * 1024 * 1024) throw new Error('A imagem excede o limite de 10 MB.'); if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || !await hasExpectedImageSignature(file) || !await canDecodeImage(file)) throw new Error('Use um arquivo de imagem PNG, JPEG, WebP ou GIF válido.'); const asset: NoteAsset = { id: crypto.randomUUID(), blob: file, mimeType: file.type, bytes: file.size, name: file.name.slice(0, 180), alt: '', createdAt: Date.now() }; const db = await openDatabase(); const tx = db.transaction(NOTE_ASSETS_STORE, 'readwrite'); tx.objectStore(NOTE_ASSETS_STORE).add(asset); await transactionDone(tx); return asset },
  async getAsset(id: string) { const db = await openDatabase(); const tx = db.transaction(NOTE_ASSETS_STORE, 'readonly'); const asset = await requestResult(tx.objectStore(NOTE_ASSETS_STORE).get(id)) as NoteAsset | undefined; await transactionDone(tx); return asset ?? null },
  async getAssets() { const db = await openDatabase(); const tx = db.transaction(NOTE_ASSETS_STORE, 'readonly'); const assets = await requestResult(tx.objectStore(NOTE_ASSETS_STORE).getAll()) as NoteAsset[]; await transactionDone(tx); return assets },
  async getMeta<T>(id: string, fallback: T) { const db = await openDatabase(); const tx = db.transaction(NOTE_META_STORE, 'readonly'); const item = await requestResult(tx.objectStore(NOTE_META_STORE).get(id)) as NoteMeta | undefined; await transactionDone(tx); return item ? item.value as T : fallback },
  async setMeta(id: string, value: unknown) { const db = await openDatabase(); const tx = db.transaction(NOTE_META_STORE, 'readwrite'); tx.objectStore(NOTE_META_STORE).put({ id, value, updatedAt: Date.now() } satisfies NoteMeta); await transactionDone(tx) },
  async getBoard(): Promise<Board> {
    const db = await openDatabase(); const tx = db.transaction(BOARDS_STORE, 'readwrite'); const store = tx.objectStore(BOARDS_STORE)
    let board = await requestResult(store.get(BOARD_ID)) as Board | undefined
    if (!board) { board = { id: BOARD_ID, name: 'Quadro principal', panX: 0, panY: 0, zoom: 1, updatedAt: Date.now() }; store.add(board) }
    await transactionDone(tx); return board
  },
  async saveBoard(board: Board) { const db = await openDatabase(); const tx = db.transaction(BOARDS_STORE, 'readwrite'); tx.objectStore(BOARDS_STORE).put({ ...board, updatedAt: Date.now() }); await transactionDone(tx) },
  async getNodes(): Promise<MindNode[]> { const db = await openDatabase(); const tx = db.transaction(NODES_STORE, 'readonly'); const result = await requestResult(tx.objectStore(NODES_STORE).index('boardId').getAll(BOARD_ID)) as MindNode[]; await transactionDone(tx); return result },
  async saveNode(node: MindNode) { const db = await openDatabase(); const tx = db.transaction(NODES_STORE, 'readwrite'); tx.objectStore(NODES_STORE).put({ ...node, updatedAt: Date.now() }); await transactionDone(tx); emit() },
  async createNode(text: string, x: number, y: number) { const now = Date.now(); const node: MindNode = { id: crypto.randomUUID(), boardId: BOARD_ID, text, x, y, createdAt: now, updatedAt: now }; await this.saveNode(node); return node },
  async deleteNode(id: string) {
    const db = await openDatabase(); const tx = db.transaction([NODES_STORE, EDGES_STORE], 'readwrite'); tx.objectStore(NODES_STORE).delete(id)
    const edges = await requestResult(tx.objectStore(EDGES_STORE).index('boardId').getAll(BOARD_ID)) as MindEdge[]
    edges.filter((edge) => edge.sourceId === id || edge.targetId === id).forEach((edge) => tx.objectStore(EDGES_STORE).delete(edge.id))
    await transactionDone(tx); emit()
  },
  async getEdges(): Promise<MindEdge[]> { const db = await openDatabase(); const tx = db.transaction(EDGES_STORE, 'readonly'); const result = await requestResult(tx.objectStore(EDGES_STORE).index('boardId').getAll(BOARD_ID)) as MindEdge[]; await transactionDone(tx); return result },
  async replaceGraph(nodes: MindNode[], edges: MindEdge[]) {
    const db = await openDatabase(); const tx = db.transaction([NODES_STORE, EDGES_STORE], 'readwrite')
    const nodeStore = tx.objectStore(NODES_STORE); const edgeStore = tx.objectStore(EDGES_STORE)
    const [currentNodes, currentEdges] = await Promise.all([
      requestResult(nodeStore.index('boardId').getAll(BOARD_ID)) as Promise<MindNode[]>,
      requestResult(edgeStore.index('boardId').getAll(BOARD_ID)) as Promise<MindEdge[]>,
    ])
    currentNodes.forEach((node) => nodeStore.delete(node.id)); currentEdges.forEach((edge) => edgeStore.delete(edge.id))
    nodes.forEach((node) => nodeStore.put(node)); edges.forEach((edge) => edgeStore.put(edge))
    await transactionDone(tx); emit()
  },
  async connect(sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new Error('Escolha dois nós diferentes.')
    const [nodes, edges] = await Promise.all([this.getNodes(), this.getEdges()])
    const nodeIds = new Set(nodes.map((node) => node.id)); if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) throw new Error('Um dos nós da conexão não existe mais.')
    if (edges.some((edge) => edge.sourceId === sourceId && edge.targetId === targetId)) throw new Error('Esta conexão já existe.')
    const edge: MindEdge = { id: crypto.randomUUID(), boardId: BOARD_ID, sourceId, targetId }
    const db = await openDatabase(); const tx = db.transaction(EDGES_STORE, 'readwrite'); tx.objectStore(EDGES_STORE).add(edge); await transactionDone(tx); emit(); return edge
  },
}
