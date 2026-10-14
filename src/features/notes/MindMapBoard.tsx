import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Focus, Link2, Maximize2, Pencil, Plus, Redo2, RotateCcw, Save, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { notesRepository } from '../../services/db/notesRepository'
import type { Board, MindEdge, MindNode } from './types'
import { fitGraph, screenToWorld } from './mindMapGeometry'

interface GraphSnapshot { nodes: MindNode[]; edges: MindEdge[] }
export interface GraphHistory { past: GraphSnapshot[]; future: GraphSnapshot[] }
interface Props { board: Board; nodes: MindNode[]; edges: MindEdge[]; reload: () => Promise<void>; history: MutableRefObject<GraphHistory> }

const cloneGraph = (nodes: MindNode[], edges: MindEdge[]): GraphSnapshot => ({ nodes: nodes.map((node) => ({ ...node })), edges: edges.map((edge) => ({ ...edge })) })
const ignoresShortcuts = (target: EventTarget | null) => target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)

export function MindMapBoard({ board, nodes, edges, reload, history }: Props) {
  const [newText, setNewText] = useState('')
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [viewport, setViewport] = useState(board)
  const [busy, setBusy] = useState(false)
  const [, refreshHistory] = useState(0)
  const canvas = useRef<HTMLDivElement>(null)
  const viewportRef = useRef(board)
  const saveTimer = useRef<number | null>(null)
  const dragging = useRef<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null)
  const panning = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null)
  const movedNode = useRef(false)

  useEffect(() => { if (!panning.current) { setViewport(board); viewportRef.current = board } }, [board])
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); void notesRepository.saveBoard(viewportRef.current) }, [])

  const persistViewport = (next: Board) => {
    viewportRef.current = next; setViewport(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void notesRepository.saveBoard(viewportRef.current) }, 250)
  }
  const positionOf = (node: MindNode) => positions[node.id] ?? { x: node.x, y: node.y }
  const pushHistory = () => { history.current.past.push(cloneGraph(nodes, edges)); if (history.current.past.length > 50) history.current.past.shift(); history.current.future = []; refreshHistory((value) => value + 1) }
  const commitGraph = async (action: () => Promise<unknown>) => {
    if (busy) return
    pushHistory(); setBusy(true)
    try { if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null } await notesRepository.saveBoard(viewportRef.current); await action(); await reload() } catch (reason) { history.current.past.pop(); refreshHistory((value) => value + 1); window.alert(reason instanceof Error ? reason.message : 'Não foi possível alterar o quadro.') }
    finally { setBusy(false) }
  }
  const undo = useCallback(async () => {
    if (busy) return
    const previous = history.current.past.pop(); if (!previous) return
    history.current.future.push(cloneGraph(nodes, edges)); refreshHistory((value) => value + 1); setBusy(true)
    try { await notesRepository.replaceGraph(previous.nodes, previous.edges); await reload() } catch (reason) { history.current.future.pop(); history.current.past.push(previous); refreshHistory((value) => value + 1); window.alert(reason instanceof Error ? reason.message : 'Não foi possível desfazer.') } finally { setBusy(false) }
  }, [busy, edges, history, nodes, reload])
  const redo = useCallback(async () => {
    if (busy) return
    const next = history.current.future.pop(); if (!next) return
    history.current.past.push(cloneGraph(nodes, edges)); refreshHistory((value) => value + 1); setBusy(true)
    try { await notesRepository.replaceGraph(next.nodes, next.edges); await reload() } catch (reason) { history.current.past.pop(); history.current.future.push(next); refreshHistory((value) => value + 1); window.alert(reason instanceof Error ? reason.message : 'Não foi possível refazer.') } finally { setBusy(false) }
  }, [busy, edges, history, nodes, reload])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (ignoresShortcuts(event.target) || !(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) void redo(); else void undo() }
      else if (event.key.toLowerCase() === 'y') { event.preventDefault(); void redo() }
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])

  const addNode = async (text: string, x?: number, y?: number) => {
    const clean = text.trim(); if (!clean) return
    const rect = canvas.current?.getBoundingClientRect()
    const center = rect ? screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, rect, viewport) : { x: 440, y: 252 }
    const centerX = center.x - 80; const centerY = center.y - 32
    await commitGraph(() => notesRepository.createNode(clean, x ?? centerX, y ?? centerY)); setNewText('')
  }
  const selectOrConnect = async (id: string) => {
    setSelectedId(id)
    if (!connectFrom) return
    if (connectFrom === id) { setConnectFrom(null); return }
    await commitGraph(() => notesRepository.connect(connectFrom, id)); setConnectFrom(null)
  }
  const saveEdit = async () => { const node = nodes.find((item) => item.id === editingId); const text = editingText.trim(); if (!node || !text) return; await commitGraph(() => notesRepository.saveNode({ ...node, text })); setEditingId(null) }
  const beginEdit = (node: MindNode) => { setSelectedId(node.id); setEditingId(node.id); setEditingText(node.text) }
  const removeNode = async (node: MindNode) => { if (window.confirm('Excluir o nó e suas conexões?')) await commitGraph(() => notesRepository.deleteNode(node.id)) }

  const fitAll = () => {
    const rect = canvas.current?.getBoundingClientRect(); if (!rect) return
    persistViewport(fitGraph(nodes, rect, viewport))
  }
  const focusNode = (node: MindNode) => { const rect = canvas.current?.getBoundingClientRect(); if (!rect) return; persistViewport({ ...viewport, panX: rect.width / 2 - (node.x + 80) * viewport.zoom, panY: rect.height / 2 - (node.y + 32) * viewport.zoom }); setSelectedId(node.id) }
  const zoomAt = (zoom: number, clientX?: number, clientY?: number) => {
    const rect = canvas.current?.getBoundingClientRect(); const nextZoom = Math.min(3, Math.max(.25, zoom)); if (!rect) return
    const sx = (clientX ?? rect.left + rect.width / 2) - rect.left; const sy = (clientY ?? rect.top + rect.height / 2) - rect.top
    const world = screenToWorld((clientX ?? rect.left + rect.width / 2), (clientY ?? rect.top + rect.height / 2), rect, viewport)
    persistViewport({ ...viewport, zoom: nextZoom, panX: sx - world.x * nextZoom, panY: sy - world.y * nextZoom })
  }
  const onWheel = (event: WheelEvent<HTMLDivElement>) => { if (!(event.ctrlKey || event.metaKey)) return; event.preventDefault(); zoomAt(viewport.zoom + (event.deltaY < 0 ? .1 : -.1), event.clientX, event.clientY) }
  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-mind-node],button,input,textarea')) return
    event.currentTarget.setPointerCapture(event.pointerId); panning.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: viewport.panX, panY: viewport.panY, moved: false }
  }
  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { const pan = panning.current; if (!pan || pan.pointerId !== event.pointerId) return; const dx = event.clientX - pan.startX; const dy = event.clientY - pan.startY; pan.moved ||= Math.abs(dx) + Math.abs(dy) > 3; viewportRef.current = { ...viewportRef.current, panX: pan.panX + dx, panY: pan.panY + dy }; setViewport(viewportRef.current) }
  const onCanvasPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { const pan = panning.current; if (!pan || pan.pointerId !== event.pointerId) return; panning.current = null; if (pan.moved) void notesRepository.saveBoard(viewportRef.current) }
  const onCanvasDoubleClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-mind-node],button,input,textarea') || panning.current?.moved) return
    const rect = canvas.current?.getBoundingClientRect(); if (!rect) return
    const text = window.prompt('Texto do novo nó')?.trim(); if (!text) return
    const point = screenToWorld(event.clientX, event.clientY, rect, viewport); void addNode(text, point.x - 80, point.y - 32)
  }

  return <div className="grid gap-5 xl:grid-cols-[1fr_290px]">
    <section className="app-card overflow-hidden"><header className="flex flex-wrap items-center gap-2 border-b border-slate-700 p-3"><input aria-label="Texto do novo nó" maxLength={200} value={newText} onChange={(event) => setNewText(event.target.value)} placeholder="Texto do novo nó" className="min-h-10 min-w-48 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white" /><Button disabled={!newText.trim() || busy} onClick={() => { void addNode(newText) }}><Plus size={16} />Nó</Button><Button variant="secondary" disabled={!selectedId} onClick={() => selectedId && setConnectFrom(connectFrom === selectedId ? null : selectedId)}><Link2 size={16} />Conectar</Button><Button variant="secondary" disabled={!history.current.past.length || busy} onClick={() => { void undo() }} aria-label="Desfazer"><Undo2 size={17} /></Button><Button variant="secondary" disabled={!history.current.future.length || busy} onClick={() => { void redo() }} aria-label="Refazer"><Redo2 size={17} /></Button><Button variant="secondary" onClick={() => zoomAt(viewport.zoom - .2)} aria-label="Diminuir zoom"><ZoomOut size={17} /></Button><span className="w-12 text-center text-xs text-slate-400">{Math.round(viewport.zoom * 100)}%</span><Button variant="secondary" onClick={() => zoomAt(viewport.zoom + .2)} aria-label="Aumentar zoom"><ZoomIn size={17} /></Button><Button variant="secondary" onClick={fitAll} aria-label="Enquadrar tudo"><Maximize2 size={17} /></Button><Button variant="secondary" onClick={() => persistViewport({ ...viewport, panX: 0, panY: 0, zoom: 1 })} aria-label="Centralizar quadro"><RotateCcw size={17} /></Button></header>
      {connectFrom && <p role="status" className="border-b border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-xs text-indigo-300">Origem selecionada. Escolha o nó de destino; selecione a origem novamente para cancelar.</p>}
      <div ref={canvas} onWheel={onWheel} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp} onPointerCancel={onCanvasPointerUp} onDoubleClick={onCanvasDoubleClick} className="relative h-[560px] touch-none overflow-hidden bg-slate-950" style={{ backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`, backgroundPosition: `${viewport.panX}px ${viewport.panY}px` }}>
        <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}>
          <svg className="pointer-events-none absolute inset-0 h-[1200px] w-[1600px] overflow-visible">{edges.map((edge) => { const source = nodes.find((node) => node.id === edge.sourceId); const target = nodes.find((node) => node.id === edge.targetId); if (!source || !target) return null; const a = positionOf(source); const b = positionOf(target); return <line key={edge.id} x1={a.x + 80} y1={a.y + 32} x2={b.x + 80} y2={b.y + 32} stroke="#6366f1" strokeWidth="2" /> })}</svg>
          {nodes.map((node) => { const pos = positionOf(node); return <button data-mind-node key={node.id} onClick={() => { if (movedNode.current) { movedNode.current = false; return } void selectOrConnect(node.id) }} onDoubleClick={(event) => { event.stopPropagation(); beginEdit(node) }} onPointerDown={(event) => { event.stopPropagation(); const rect = canvas.current?.getBoundingClientRect(); if (!rect) return; event.currentTarget.setPointerCapture(event.pointerId); movedNode.current = false; const point = screenToWorld(event.clientX, event.clientY, rect, viewport); dragging.current = { id: node.id, dx: point.x - pos.x, dy: point.y - pos.y, x: pos.x, y: pos.y } }} onPointerMove={(event) => { const rect = canvas.current?.getBoundingClientRect(); const drag = dragging.current; if (drag?.id === node.id && rect) { movedNode.current = true; const point = screenToWorld(event.clientX, event.clientY, rect, viewport); drag.x = point.x - drag.dx; drag.y = point.y - drag.dy; setPositions((current) => ({ ...current, [node.id]: { x: drag.x, y: drag.y } })) } }} onPointerUp={() => { const drag = dragging.current; if (drag?.id === node.id) { dragging.current = null; setPositions((current) => { const next = { ...current }; delete next[node.id]; return next }); if (movedNode.current) void commitGraph(() => notesRepository.saveNode({ ...node, x: drag.x, y: drag.y })) } }} className={`absolute min-h-16 w-40 touch-none whitespace-pre-wrap break-words rounded-2xl border p-3 text-left text-sm font-medium shadow-lg ${connectFrom === node.id ? 'border-indigo-400 bg-indigo-500/20 text-white' : selectedId === node.id ? 'border-violet-400 bg-slate-800 text-white' : 'border-slate-600 bg-slate-800 text-slate-200'}`} style={{ left: pos.x, top: pos.y }}>{node.text}</button> })}
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 px-4 py-2 text-xs text-slate-500"><span>Arraste o fundo para mover; Ctrl/Cmd + roda ajusta o zoom; duplo clique cria um nó.</span><span className="flex gap-1"><button onClick={() => persistViewport({ ...viewport, panX: viewport.panX - 60 })} aria-label="Mover quadro para a esquerda" className="p-1"><ArrowLeft size={15} /></button><button onClick={() => persistViewport({ ...viewport, panY: viewport.panY - 60 })} aria-label="Mover quadro para cima" className="p-1"><ArrowUp size={15} /></button><button onClick={() => persistViewport({ ...viewport, panY: viewport.panY + 60 })} aria-label="Mover quadro para baixo" className="p-1"><ArrowDown size={15} /></button><button onClick={() => persistViewport({ ...viewport, panX: viewport.panX + 60 })} aria-label="Mover quadro para a direita" className="p-1"><ArrowRight size={15} /></button></span></footer>
    </section>
    <aside className="app-card p-4"><h3 className="mb-2 font-semibold text-white">Nós do quadro</h3><p className="mb-4 text-xs text-slate-500">Use as ações abaixo sem depender de arraste ou duplo clique.</p><div className="space-y-3">{nodes.map((node) => <div key={node.id} className="rounded-xl border border-slate-700 bg-slate-900 p-2">{editingId === node.id ? <><textarea autoFocus maxLength={200} value={editingText} onChange={(event) => setEditingText(event.target.value)} aria-label={`Editar nó ${node.text}`} className="min-h-24 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" /><div className="mt-2 flex gap-2"><button disabled={!editingText.trim()} onClick={() => { void saveEdit() }} className="rounded-lg p-2 text-emerald-400" aria-label="Salvar edição"><Save size={16} /></button><button onClick={() => setEditingId(null)} className="rounded-lg p-2 text-slate-400" aria-label="Cancelar edição"><X size={16} /></button></div></> : <><button onClick={() => { void selectOrConnect(node.id) }} className="mb-2 block w-full whitespace-pre-wrap break-words text-left text-sm text-slate-300">{node.text}</button><div className="flex flex-wrap gap-1"><button onClick={() => beginEdit(node)} className="rounded-lg p-2 text-slate-400" aria-label={`Editar nó ${node.text}`}><Pencil size={15} /></button><button onClick={() => { setSelectedId(node.id); setConnectFrom(connectFrom === node.id ? null : node.id) }} className="rounded-lg p-2 text-indigo-400" aria-label={`Conectar a partir de ${node.text}`}><Link2 size={15} /></button><button onClick={() => focusNode(node)} className="rounded-lg p-2 text-violet-400" aria-label={`Focar nó ${node.text}`}><Focus size={15} /></button><button onClick={() => { void removeNode(node) }} className="rounded-lg p-2 text-red-400" aria-label={`Excluir nó ${node.text}`}><Trash2 size={15} /></button></div></>}</div>)}{!nodes.length && <p className="py-6 text-center text-sm text-slate-500">Nenhum nó</p>}</div></aside>
  </div>
}
