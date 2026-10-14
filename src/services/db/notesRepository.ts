import type { Board, MindEdge, MindNode, Note } from '../../features/notes/types'
import { BOARDS_STORE, EDGES_STORE, NODES_STORE, NOTES_STORE, openDatabase, requestResult, transactionDone, upgradeToCreativeSchema } from './indexedDb'

const EVENT = 'notes:changed'
const emit = () => window.dispatchEvent(new Event(EVENT))
const BOARD_ID = 'main'

export const notesRepository = {
  async isEnabled() { return (await openDatabase()).objectStoreNames.contains(NOTES_STORE) },
  enable: upgradeToCreativeSchema,
  subscribe(listener: () => void) { window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener) },
  async getNotes(): Promise<Note[]> {
    const db = await openDatabase(); if (!db.objectStoreNames.contains(NOTES_STORE)) return []
    const tx = db.transaction(NOTES_STORE, 'readonly'); const records = await requestResult(tx.objectStore(NOTES_STORE).getAll()) as Note[]; await transactionDone(tx)
    return records.sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async saveNote(note: Note) { const db = await openDatabase(); const tx = db.transaction(NOTES_STORE, 'readwrite'); tx.objectStore(NOTES_STORE).put({ ...note, updatedAt: Date.now() }); await transactionDone(tx); emit() },
  async createNote() { const now = Date.now(); const note: Note = { id: crypto.randomUUID(), title: '', content: '', createdAt: now, updatedAt: now }; await this.saveNote(note); return note },
  async deleteNote(id: string) { const db = await openDatabase(); const tx = db.transaction(NOTES_STORE, 'readwrite'); tx.objectStore(NOTES_STORE).delete(id); await transactionDone(tx); emit() },
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
