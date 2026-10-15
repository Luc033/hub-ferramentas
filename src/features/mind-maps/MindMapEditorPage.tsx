import { ArrowLeft, ChevronDown, ChevronRight, Focus, Map, Pencil, Plus, Redo2, RotateCcw, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/Modal'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import { calculateRadialLayout, connectionPath } from './layout'
import { addTopic, descendantIds, removeTopicBranch } from './tree'
import type { MindMapDocument, MindMapTopic, MindMapViewport } from './types'

type SaveState = 'saved' | 'saving' | 'error'
interface History { past: MindMapTopic[][]; future: MindMapTopic[][] }
const cloneTopics = (topics: MindMapTopic[]) => topics.map((topic) => ({ ...topic }))
const clampZoom = (zoom: number) => Math.min(3, Math.max(.25, Number(zoom.toFixed(2))))

export default function MindMapEditorPage() {
  const { mapId = '' } = useParams()
  const location = useLocation()
  const canvasRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<MindMapDocument | null>(null)
  const viewportTimer = useRef<number | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const initialEditRoot = useRef(Boolean((location.state as { editRoot?: boolean } | null)?.editRoot))
  const editCancelled = useRef(false)
  const editingIdRef = useRef<string | null>(null)
  const editingTextRef = useRef('')
  const [document, setDocument] = useState<MindMapDocument | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [history, setHistory] = useState<History>({ past: [], future: [] })
  const [deleteTarget, setDeleteTarget] = useState<MindMapTopic | null>(null)
  const [panning, setPanning] = useState<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null)

  useEffect(() => { documentRef.current = document }, [document])
  const load = useCallback(async () => {
    try {
      const found = await mindMapsRepository.get(mapId)
      if (!found) throw new Error('O mapa solicitado não foi encontrado.')
      setDocument(found); documentRef.current = found; setSelectedId(found.map.rootId); setLoadError(''); setHistory({ past: [], future: [] })
      if (initialEditRoot.current) { const text = found.topics.find((topic) => topic.id === found.map.rootId)?.text ?? found.map.name; editingIdRef.current = found.map.rootId; editingTextRef.current = text; setEditingId(found.map.rootId); setEditingText(text); initialEditRoot.current = false }
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Não foi possível abrir o mapa.') }
  }, [mapId])
  useEffect(() => { void load() }, [load])

  const queueSave = useCallback((next: MindMapDocument) => {
    documentRef.current = next; setSaveState('saving'); setSaveError('')
    const operation = saveQueue.current.catch(() => undefined).then(async () => { await mindMapsRepository.save(next) }).then(() => {
      if (documentRef.current === next) setSaveState('saved')
    }).catch((reason) => { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar o mapa.'); throw reason })
    saveQueue.current = operation; return operation
  }, [])

  const commitTopics = useCallback((topics: MindMapTopic[], recordHistory = true) => {
    const current = documentRef.current; if (!current) return
    if (recordHistory) setHistory((value) => ({ past: [...value.past.slice(-99), cloneTopics(current.topics)], future: [] }))
    const next = { map: current.map, topics }; setDocument(next); documentRef.current = next; void queueSave(next).catch(() => undefined)
  }, [queueSave])

  const queueViewportSave = useCallback((viewport: MindMapViewport) => {
    setSaveState('saving'); setSaveError('')
    const operation = saveQueue.current.catch(() => undefined).then(() => mindMapsRepository.saveViewport(mapId, viewport)).then(() => {
      if (documentRef.current?.map.viewport === viewport) setSaveState('saved')
    }).catch((reason) => { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar a posição do mapa.'); throw reason })
    saveQueue.current = operation; return operation
  }, [mapId])
  const scheduleViewportSave = useCallback((nextViewport: MindMapViewport) => {
    const current = documentRef.current; if (!current) return
    const next = { ...current, map: { ...current.map, viewport: nextViewport } }; setDocument(next); documentRef.current = next
    if (viewportTimer.current) window.clearTimeout(viewportTimer.current)
    viewportTimer.current = window.setTimeout(() => {
      viewportTimer.current = null; const latest = documentRef.current?.map.viewport ?? nextViewport; void queueViewportSave(latest).catch(() => undefined)
    }, 650)
  }, [queueViewportSave])
  useEffect(() => () => {
    if (viewportTimer.current) {
      window.clearTimeout(viewportTimer.current); viewportTimer.current = null; const viewport = documentRef.current?.map.viewport
      if (viewport) saveQueue.current = saveQueue.current.catch(() => undefined).then(() => mindMapsRepository.saveViewport(mapId, viewport)).then(() => undefined).catch(() => undefined)
    }
  }, [mapId])

  const pendingDocument = useCallback(() => {
    const current = documentRef.current; if (!current) return null
    const id = editingIdRef.current; const text = editingTextRef.current.trim()
    if (!id || !text) return current
    return { ...current, topics: current.topics.map((topic) => topic.id === id ? { ...topic, text: text.slice(0, 500), updatedAt: Date.now() } : topic) }
  }, [])
  useEffect(() => {
    const flush = () => {
      const latest = pendingDocument(); if (!latest) return
      documentRef.current = latest
      saveQueue.current = saveQueue.current.catch(() => undefined).then(() => mindMapsRepository.save(latest)).then(() => undefined).catch(() => undefined)
    }
    const onHidden = () => { if (globalThis.document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush); globalThis.document.addEventListener('visibilitychange', onHidden)
    return () => { window.removeEventListener('pagehide', flush); globalThis.document.removeEventListener('visibilitychange', onHidden); flush() }
  }, [pendingDocument])

  const layout = useMemo(() => document ? calculateRadialLayout(document.topics, document.map.rootId) : null, [document])
  const selected = document?.topics.find((topic) => topic.id === selectedId) ?? null
  const visibleIds = useMemo(() => new Set(layout ? [...layout.topics.keys()] : []), [layout])

  const beginEdit = (topic: MindMapTopic) => { editCancelled.current = false; editingIdRef.current = topic.id; editingTextRef.current = topic.text; setSelectedId(topic.id); setEditingId(topic.id); setEditingText(topic.text) }
  const finishEdit = () => {
    if (!document || !editingId) return
    if (editCancelled.current) { editCancelled.current = false; editingIdRef.current = null; return }
    const text = editingText.trim(); if (!text) { setEditingText(document.topics.find((topic) => topic.id === editingId)?.text ?? ''); setEditingId(null); editingIdRef.current = null; return }
    const now = Date.now(); commitTopics(document.topics.map((topic) => topic.id === editingId ? { ...topic, text: text.slice(0, 500), updatedAt: now } : topic)); setEditingId(null); editingIdRef.current = null
  }
  const createTopic = (placement: 'child' | 'after' | 'before') => {
    if (!document || !selectedId || saveState === 'saving') return
    try { const result = addTopic(document.topics, selectedId, placement); commitTopics(result.topics); setSelectedId(result.topic.id); editingIdRef.current = result.topic.id; editingTextRef.current = result.topic.text; setEditingId(result.topic.id); setEditingText(result.topic.text) }
    catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível criar o tópico.') }
  }
  const toggleCollapse = () => {
    if (!document || !selected) return; const now = Date.now(); commitTopics(document.topics.map((topic) => topic.id === selected.id ? { ...topic, collapsed: !topic.collapsed, updatedAt: now } : topic))
  }
  const requestDelete = () => { if (selected && document && selected.id !== document.map.rootId) setDeleteTarget(selected) }
  const removeSelected = () => {
    if (!document || !deleteTarget) return
    const parentId = deleteTarget.parentId; commitTopics(removeTopicBranch(document.topics, deleteTarget.id, document.map.rootId)); setSelectedId(parentId ?? document.map.rootId); setDeleteTarget(null)
  }
  const undo = () => {
    if (!document || !history.past.length) return
    const previous = history.past.at(-1)!; setHistory({ past: history.past.slice(0, -1), future: [cloneTopics(document.topics), ...history.future].slice(0, 100) }); commitTopics(cloneTopics(previous), false)
  }
  const redo = () => {
    if (!document || !history.future.length) return
    const nextTopics = history.future[0]; setHistory({ past: [...history.past, cloneTopics(document.topics)].slice(-100), future: history.future.slice(1) }); commitTopics(cloneTopics(nextTopics), false)
  }

  const center = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas || !document) return
    scheduleViewportSave({ ...document.map.viewport, panX: canvas.clientWidth / 2, panY: canvas.clientHeight / 2 })
  }, [document, scheduleViewportSave])
  const fit = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas || !document || !layout) return
    const padding = 90; const zoom = clampZoom(Math.min((canvas.clientWidth - padding) / Math.max(layout.width, 1), (canvas.clientHeight - padding) / Math.max(layout.height, 1), 1.4))
    scheduleViewportSave({ zoom, panX: canvas.clientWidth / 2 - ((layout.minX + layout.maxX) / 2) * zoom, panY: canvas.clientHeight / 2 - ((layout.minY + layout.maxY) / 2) * zoom })
  }, [document, layout, scheduleViewportSave])
  useEffect(() => { if (document && document.map.viewport.panX === 0 && document.map.viewport.panY === 0 && canvasRef.current) center() }, [document?.map.id, center])

  const zoomBy = (delta: number) => {
    if (!document) return; const canvas = canvasRef.current; const current = document.map.viewport; const zoom = clampZoom(current.zoom + delta); const cx = canvas ? canvas.clientWidth / 2 : 0; const cy = canvas ? canvas.clientHeight / 2 : 0; const factor = zoom / current.zoom
    scheduleViewportSave({ zoom, panX: cx - (cx - current.panX) * factor, panY: cy - (cy - current.panY) * factor })
  }
  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-topic]')) return
    event.currentTarget.setPointerCapture(event.pointerId); setPanning({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: document?.map.viewport.panX ?? 0, panY: document?.map.viewport.panY ?? 0 }); setSelectedId(null)
  }
  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panning || panning.pointerId !== event.pointerId || !document) return
    const viewport = { ...document.map.viewport, panX: panning.panX + event.clientX - panning.startX, panY: panning.panY + event.clientY - panning.startY }
    const next = { ...document, map: { ...document.map, viewport } }; setDocument(next); documentRef.current = next
  }
  const stopPanning = (event: ReactPointerEvent<HTMLDivElement>) => { const current = documentRef.current; if (panning?.pointerId === event.pointerId && current) { setPanning(null); scheduleViewportSave(current.map.viewport) } }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement; if (target.matches('input, textarea, select, [contenteditable="true"]') || !selectedId) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return }
    if ((event.ctrlKey && event.key.toLowerCase() === 'y')) { event.preventDefault(); redo(); return }
    if (event.key === 'Tab') { event.preventDefault(); createTopic('child') }
    else if (event.key === 'Enter') { event.preventDefault(); createTopic(event.shiftKey ? 'before' : 'after') }
    else if (event.key === 'F2') { event.preventDefault(); if (selected) beginEdit(selected) }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); requestDelete() }
    else if (event.key === ' ') { event.preventDefault(); toggleCollapse() }
    else if (event.key === 'Escape') { event.preventDefault(); setSelectedId(null) }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(.1) }
    else if (event.key === '-') { event.preventDefault(); zoomBy(-.1) }
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && layout) {
      event.preventDefault(); const ordered = [...layout.topics.values()].sort((a, b) => a.y - b.y || a.x - b.x); const index = ordered.findIndex((item) => item.id === selectedId); const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1; setSelectedId(ordered[(index + direction + ordered.length) % ordered.length]?.id ?? selectedId)
    }
  }
  const renameMap = () => {
    const current = documentRef.current; if (!current) return
    const name = current.map.name.trim(); if (!name) { setSaveState('error'); setSaveError('O nome do mapa não pode ficar vazio.'); return }
    const next = { ...current, map: { ...current.map, name: name.slice(0, 100) } }; setDocument(next); documentRef.current = next; void queueSave(next).catch(() => undefined)
  }

  if (loadError) return <main className="grid min-h-screen place-items-center p-6"><section className="app-card max-w-md p-7 text-center"><Map className="mx-auto mb-4 text-red-400" /><h1 className="text-xl font-bold text-strong">Falha ao abrir o mapa</h1><p role="alert" className="my-4 text-sm text-red-300">{loadError}</p><div className="flex justify-center gap-3"><Link to="/notes/maps" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 font-semibold text-slate-300">Biblioteca</Link><Button onClick={() => { void load() }}><RotateCcw size={16} />Tentar novamente</Button></div></section></main>
  if (!document || !layout) return <main className="grid min-h-screen place-items-center text-slate-400">Carregando mapa…</main>
  const viewport = document.map.viewport
  return <main className="mind-map-editor flex min-h-[100dvh] flex-col overflow-hidden bg-[var(--bg)]">
    <header className="z-20 flex min-h-16 flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900/95 px-3 py-2 shadow-lg md:px-5">
      <Link to="/notes/maps" aria-label="Voltar à biblioteca" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"><ArrowLeft size={18} /><span className="hidden sm:inline">Mapas mentais</span></Link>
      <Map size={18} className="hidden text-violet-400 sm:block" />
      <input aria-label="Nome do mapa" maxLength={100} value={document.map.name} onChange={(event) => { const next = { ...document, map: { ...document.map, name: event.target.value } }; setDocument(next); documentRef.current = next; setSaveState('saving') }} onBlur={renameMap} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} className="min-h-10 min-w-32 flex-1 rounded-lg border border-transparent bg-transparent px-2 font-semibold text-strong hover:border-slate-700 focus:border-violet-500 sm:max-w-md" />
      <span role="status" aria-live="polite" className={`text-xs ${saveState === 'error' ? 'text-red-400' : saveState === 'saving' ? 'text-amber-400' : 'text-emerald-400'}`}>{saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Falha ao salvar' : 'Salvo'}</span>
      {saveState === 'error' && <button className="rounded-lg px-2 py-1 text-xs font-semibold text-red-300 underline" onClick={() => { const current = documentRef.current; if (current) void queueSave(current).catch(() => undefined) }}>Tentar novamente</button>}
      <div className="ml-auto flex gap-1"><button disabled={!history.past.length || saveState === 'saving'} className="editor-icon-button" aria-label="Desfazer" onClick={undo}><Undo2 size={18} /></button><button disabled={!history.future.length || saveState === 'saving'} className="editor-icon-button" aria-label="Refazer" onClick={redo}><Redo2 size={18} /></button></div>
    </header>
    {saveError && saveState === 'error' && <p role="alert" className="z-20 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-xs text-red-200">{saveError}</p>}
    <section className="relative flex min-h-0 flex-1">
      <div ref={canvasRef} tabIndex={0} aria-label="Canvas do mapa mental" className={`mind-map-canvas relative min-h-0 flex-1 touch-none overflow-hidden outline-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={stopPanning} onPointerCancel={stopPanning} onKeyDown={onKeyDown} onWheel={(event) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); zoomBy(event.deltaY < 0 ? .1 : -.1) }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}>
          <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">{document.topics.filter((topic) => topic.parentId && visibleIds.has(topic.id) && visibleIds.has(topic.parentId)).map((topic) => { const parent = layout.topics.get(topic.parentId!); const child = layout.topics.get(topic.id); return parent && child ? <path key={topic.id} d={connectionPath(parent, child)} className="mind-map-connection" /> : null })}</svg>
          {[...layout.topics.values()].map((position) => { const topic = document.topics.find((item) => item.id === position.id)!; const children = document.topics.filter((item) => item.parentId === topic.id); const selectedTopic = selectedId === topic.id; const hiddenCount = topic.collapsed ? descendantIds(document.topics, topic.id).size : 0; return <div key={topic.id} data-topic className={`mind-map-topic absolute ${topic.id === document.map.rootId ? 'mind-map-topic-root' : ''} ${selectedTopic ? 'is-selected' : ''}`} style={{ left: position.x, top: position.y, width: position.width, height: position.height }} onPointerDown={(event) => event.stopPropagation()}>
            {editingId === topic.id ? <textarea autoFocus maxLength={500} value={editingText} aria-label={`Editar tópico ${topic.text}`} onChange={(event) => { editingTextRef.current = event.target.value; setEditingText(event.target.value) }} onBlur={finishEdit} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur() } else if (event.key === 'Escape') { event.preventDefault(); editCancelled.current = true; editingIdRef.current = null; setEditingId(null) } }} className="h-full min-h-14 w-full resize-none rounded-xl border border-violet-400 bg-slate-900 p-3 text-center text-white" /> : <button className="block min-h-full w-full whitespace-pre-wrap break-words rounded-[inherit] px-4 py-3 text-center" aria-label={`Tópico: ${topic.text}, ${children.length} filhos, ${topic.collapsed ? 'recolhido' : 'expandido'}`} aria-pressed={selectedTopic} onClick={() => setSelectedId(topic.id)} onDoubleClick={() => beginEdit(topic)}>{topic.text}</button>}
            {children.length > 0 && <button aria-label={topic.collapsed ? `Expandir ${topic.text}` : `Recolher ${topic.text}`} aria-expanded={!topic.collapsed} className={`mind-map-collapse ${position.side === -1 ? '-left-3' : '-right-3'}`} onClick={(event) => { event.stopPropagation(); setSelectedId(topic.id); const now = Date.now(); commitTopics(document.topics.map((item) => item.id === topic.id ? { ...item, collapsed: !item.collapsed, updatedAt: now } : item)) }}>{topic.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{hiddenCount > 0 && <span>{hiddenCount}</span>}</button>}
          </div> })}
        </div>
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-slate-700 bg-slate-900/95 p-1.5 shadow-xl"><button className="editor-icon-button" aria-label="Diminuir zoom" onClick={() => zoomBy(-.1)}><ZoomOut size={18} /></button><span className="w-14 text-center text-xs font-semibold text-slate-300">{Math.round(viewport.zoom * 100)}%</span><button className="editor-icon-button" aria-label="Aumentar zoom" onClick={() => zoomBy(.1)}><ZoomIn size={18} /></button><button className="editor-icon-button" aria-label="Enquadrar mapa" onClick={fit}><Focus size={18} /></button><button className="editor-icon-button" aria-label="Centralizar tópico central" onClick={center}><RotateCcw size={17} /></button></div>
      </div>
      {selected && <aside className="absolute bottom-20 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-2xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl md:bottom-auto md:left-4 md:top-4 md:translate-x-0" aria-label="Ações do tópico"><button className="topic-action" onClick={() => createTopic('child')} disabled={saveState === 'saving'}><Plus size={16} />Subtópico</button><button className="topic-action" onClick={() => createTopic('after')} disabled={saveState === 'saving'}><Plus size={16} />Irmão</button><button className="topic-action" onClick={() => beginEdit(selected)}><Pencil size={16} />Editar</button>{document.topics.some((topic) => topic.parentId === selected.id) && <button className="topic-action" onClick={toggleCollapse}>{selected.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}{selected.collapsed ? 'Expandir' : 'Recolher'}</button>}<button className="topic-action text-red-300" disabled={selected.id === document.map.rootId || saveState === 'saving'} onClick={requestDelete}><Trash2 size={16} />Excluir</button></aside>}
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-500"><span>Tab cria subtópico · Enter cria irmão · F2 edita · Espaço recolhe</span><span>{document.topics.length} {document.topics.length === 1 ? 'tópico' : 'tópicos'}</span></footer>
    <ConfirmModal open={Boolean(deleteTarget)} title="Excluir ramificação?" confirmLabel="Excluir tópico" onClose={() => setDeleteTarget(null)} onConfirm={removeSelected}><p>{deleteTarget && descendantIds(document.topics, deleteTarget.id).size ? `Este tópico e ${descendantIds(document.topics, deleteTarget.id).size} descendente(s) serão removidos.` : 'Este tópico será removido.'} Você pode desfazer enquanto o editor estiver aberto.</p></ConfirmModal>
  </main>
}
