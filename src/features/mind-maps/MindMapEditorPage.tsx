import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Copy, Download, Focus, HelpCircle, LayoutTemplate, ListTree, Map, Move, Network, NotebookPen, Palette, Pencil, Plus, Redo2, RotateCcw, Scissors, Search, Trash2, Undo2, Unlink, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/Modal'
import { downloadBackup } from '../../services/backup/backupService'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import { notesRepository } from '../../services/db/notesRepository'
import { calculateRadialLayout, connectionPath, findDirectionalTopic, transverseConnectionPath, type NavigationDirection } from './layout'
import { addTopic, canMoveTopic, descendantIds, duplicateTopicBranch, moveTopic, moveTopicAmongSiblings, pasteTopicBranch, removeTopicBranches, removeTopicKeepChildren } from './tree'
import type { MindMapAsset, MindMapConnection, MindMapDocument, MindMapLayout, MindMapTopic, MindMapViewport } from './types'
import { createMindMapFile, downloadBlob, renderMindMapPng, renderMindMapSvg, safeFileName } from './mindMapTransfer'
import { MindMapOutline } from './MindMapOutline'
import { MindMapPropertiesPanel } from './MindMapPropertiesPanel'
import { MindMapShortcutsDialog } from './MindMapShortcutsDialog'
import { formatImageBytes, prepareMindMapImage } from './imageProcessing'
import { hasConnectionBetween } from './connectionRules'
import { clampMindMapZoom, zoomViewportAtPoint } from './viewport'
import type { NewMindMapLink } from './linkValidation'

type SaveState = 'saved' | 'saving' | 'error'
interface History { past: MindMapDocument[]; future: MindMapDocument[] }
interface BranchClipboard { topics: MindMapTopic[]; rootId: string }
interface TopicDrag { id: string; pointerId: number; startX: number; startY: number; dx: number; dy: number; source: MindMapTopic[] }
interface DropTarget { id: string; placement: 'child' | 'before' | 'after' }
interface PinchGesture { distance: number; centerX: number; centerY: number; viewport: MindMapViewport }
interface SelectionBox { pointerId: number; startX: number; startY: number; x: number; y: number; additive: boolean }
interface FocusSnapshot { viewport: MindMapViewport; selectedId: string | null; selectedIds: Set<string> }
const cloneTopics = (topics: MindMapTopic[]) => topics.map((topic) => ({ ...topic }))
const cloneDocument = (document: MindMapDocument): MindMapDocument => ({ map: { ...document.map, viewport: { ...document.map.viewport } }, topics: cloneTopics(document.topics), connections: (document.connections ?? []).map((item) => ({ ...item })) })
const saveMessage = (reason: unknown) => reason instanceof DOMException && reason.name === 'QuotaExceededError' ? 'O armazenamento local está cheio. Exporte este mapa e remova arquivos que não usa.' : reason instanceof Error ? reason.message : 'Não foi possível salvar o mapa.'

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [history, setHistory] = useState<History>({ past: [], future: [] })
  const [deleteTargets, setDeleteTargets] = useState<string[]>([])
  const [panning, setPanning] = useState<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null)
  const [topicDrag, setTopicDrag] = useState<TopicDrag | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveSearch, setMoveSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [clipboardReady, setClipboardReady] = useState(false)
  const [advancedEnabled, setAdvancedEnabled] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [focusRootId, setFocusRootId] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [assets, setAssets] = useState<MindMapAsset[]>([])
  const [assetUrls, setAssetUrls] = useState<globalThis.Map<string, string>>(new globalThis.Map())
  const [exportOpen, setExportOpen] = useState(false)
  const [remoteChanged, setRemoteChanged] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [imageMessage, setImageMessage] = useState('')
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [noteBusy, setNoteBusy] = useState(false)
  const [integrationNotice, setIntegrationNotice] = useState<{ error: boolean; text: string } | null>(null)
  const remoteChangedRef = useRef(false)
  const clipboard = useRef<BranchClipboard[]>([])
  const canvasPointers = useRef(new globalThis.Map<number, { x: number; y: number }>())
  const pinchGesture = useRef<PinchGesture | null>(null)
  const focusSnapshot = useRef<FocusSnapshot | null>(null)

  useEffect(() => { documentRef.current = document }, [document])
  const load = useCallback(async () => {
    try {
      const found = await mindMapsRepository.get(mapId)
      if (!found) throw new Error('O mapa solicitado não foi encontrado.')
      const advanced = await mindMapsRepository.isAdvancedEnabled().catch(() => false); const loadedAssets = advanced ? await mindMapsRepository.getAssets(mapId).catch(() => []) : []
      setAdvancedEnabled(advanced); setAssets(loadedAssets); setDocument(found); documentRef.current = found; setSelectedId(found.map.rootId); setSelectedIds(new Set([found.map.rootId])); setSelectedConnectionId(null); setFocusRootId(null); focusSnapshot.current = null; setLoadError(''); setHistory({ past: [], future: [] }); remoteChangedRef.current = false; setRemoteChanged(false)
      if (initialEditRoot.current) { const text = found.topics.find((topic) => topic.id === found.map.rootId)?.text ?? found.map.name; editingIdRef.current = found.map.rootId; editingTextRef.current = text; setEditingId(found.map.rootId); setEditingText(text); initialEditRoot.current = false }
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Não foi possível abrir o mapa.') }
  }, [mapId])
  useEffect(() => { void load() }, [load])
  useEffect(() => mindMapsRepository.subscribeExternal(mapId, () => { remoteChangedRef.current = true; setRemoteChanged(true) }), [mapId])
  useEffect(() => { const changed = () => { remoteChangedRef.current = true; setRemoteChanged(true) }; window.addEventListener('database:versionchange', changed); return () => window.removeEventListener('database:versionchange', changed) }, [])
  useEffect(() => { const showShortcuts = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; if (event.key === '?' && !target?.matches('input, textarea, select, [contenteditable="true"]')) { event.preventDefault(); setShortcutsOpen(true) } }; window.addEventListener('keydown', showShortcuts); return () => window.removeEventListener('keydown', showShortcuts) }, [])
  useEffect(() => {
    const urls = new globalThis.Map<string, string>(); assets.forEach((asset) => urls.set(asset.id, URL.createObjectURL(asset.blob))); setAssetUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [assets])
  useEffect(() => { setImageMessage('') }, [selectedId])
  useEffect(() => { if (selectedConnectionId && !document?.connections?.some(({ id }) => id === selectedConnectionId)) setSelectedConnectionId(null) }, [document?.connections, selectedConnectionId])

  const queueSave = useCallback((next: MindMapDocument) => {
    documentRef.current = next; setSaveState('saving'); setSaveError('')
    const operation = saveQueue.current.catch(() => undefined).then(async () => { if (remoteChangedRef.current) throw new Error('Este mapa mudou em outra aba. Recarregue antes de continuar editando.'); await mindMapsRepository.save(next) }).then(() => {
      if (documentRef.current === next) setSaveState('saved')
    }).catch((reason) => { setSaveState('error'); setSaveError(saveMessage(reason)); throw reason })
    saveQueue.current = operation; return operation
  }, [])

  const commitDocument = useCallback((next: MindMapDocument, recordHistory = true, previous?: MindMapDocument) => {
    const current = documentRef.current; if (!current) return
    if (recordHistory) setHistory((value) => ({ past: [...value.past.slice(-99), cloneDocument(previous ?? current)], future: [] }))
    setDocument(next); documentRef.current = next; void queueSave(next).catch(() => undefined)
  }, [queueSave])
  const commitTopics = useCallback((topics: MindMapTopic[], recordHistory = true, previous?: MindMapDocument) => {
    const current = documentRef.current; if (current) { const ids = new Set(topics.map(({ id }) => id)); commitDocument({ map: current.map, topics, connections: (current.connections ?? []).filter((item) => ids.has(item.sourceId) && ids.has(item.targetId)) }, recordHistory, previous) }
  }, [commitDocument])

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

  const activeFocusRootId = focusRootId && document?.topics.some(({ id }) => id === focusRootId) ? focusRootId : null
  const displayTopics = useMemo(() => {
    if (!document || !activeFocusRootId) return document?.topics ?? []
    const ids = descendantIds(document.topics, activeFocusRootId); ids.add(activeFocusRootId)
    return document.topics.filter((topic) => ids.has(topic.id)).map((topic) => topic.id === activeFocusRootId ? { ...topic, parentId: null } : topic)
  }, [document, activeFocusRootId])
  const layout = useMemo(() => document ? calculateRadialLayout(displayTopics, activeFocusRootId ?? document.map.rootId, document.map.layout) : null, [document, displayTopics, activeFocusRootId])
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
    try {
      const result = addTopic(document.topics, selectedId, placement); const selectedPosition = layout?.topics.get(selectedId)
      const topics = document.map.layout === 'manual' ? result.topics.map((topic) => topic.id === result.topic.id ? { ...topic, position: { x: (selectedPosition?.x ?? 0) + 260, y: (selectedPosition?.y ?? 0) + (placement === 'before' ? -80 : 80) }, manualPosition: true } : topic) : result.topics
      commitTopics(topics); selectTopic(result.topic.id); editingIdRef.current = result.topic.id; editingTextRef.current = result.topic.text; setEditingId(result.topic.id); setEditingText(result.topic.text)
    }
    catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível criar o tópico.') }
  }
  const createChildFor = (parentId: string) => {
    if (!document || saveState === 'saving') return
    try { const result = addTopic(document.topics, parentId, 'child'); commitTopics(result.topics); selectTopic(result.topic.id); beginEdit(result.topic) }
    catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível criar o tópico.') }
  }
  const createFloatingTopic = () => {
    if (!document || saveState === 'saving') return
    const canvas = canvasRef.current; const viewport = document.map.viewport; const now = Date.now()
    const topic: MindMapTopic = { id: crypto.randomUUID(), mapId: document.map.id, parentId: null, order: document.topics.filter((item) => item.parentId === null).length, text: 'Novo tópico', collapsed: false, position: { x: ((canvas?.clientWidth ?? 800) / 2 - viewport.panX) / viewport.zoom - 90, y: ((canvas?.clientHeight ?? 600) / 2 - viewport.panY) / viewport.zoom - 28 }, manualPosition: true, createdAt: now, updatedAt: now }
    commitTopics([...document.topics, topic]); selectTopic(topic.id); beginEdit(topic)
  }
  const renameTopic = (id: string, text: string) => { if (document) commitTopics(document.topics.map((topic) => topic.id === id ? { ...topic, text, updatedAt: Date.now() } : topic)) }
  const toggleTopic = (id: string) => { if (document) commitTopics(document.topics.map((topic) => topic.id === id ? { ...topic, collapsed: !topic.collapsed, updatedAt: Date.now() } : topic)) }
  const moveTopicFromOutline = (id: string, parentId: string | null, index?: number) => {
    if (!document) return
    try { commitTopics(moveTopic(document.topics, id, parentId, index, document.map.rootId)); selectTopic(id) }
    catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível mover o tópico.') }
  }
  const reorderTopicFromOutline = (id: string, direction: -1 | 1) => { if (document) { commitTopics(moveTopicAmongSiblings(document.topics, id, direction, document.map.rootId)); selectTopic(id) } }
  const toggleCollapse = () => {
    if (!document || !selected) return; const now = Date.now(); commitTopics(document.topics.map((topic) => topic.id === selected.id ? { ...topic, collapsed: !topic.collapsed, updatedAt: now } : topic))
  }
  const requestDelete = () => {
    if (!document) return
    const ids = [...selectedIds].filter((id) => id !== document.map.rootId)
    if (ids.length) setDeleteTargets(ids)
  }
  const removeSelected = () => {
    if (!document || !deleteTargets.length) return
    commitTopics(removeTopicBranches(document.topics, deleteTargets, document.map.rootId)); setSelectedId(document.map.rootId); setSelectedIds(new Set([document.map.rootId])); setDeleteTargets([])
  }
  const removeSelectedKeepingChildren = () => {
    if (!document || deleteTargets.length !== 1) return
    try { commitTopics(removeTopicKeepChildren(document.topics, deleteTargets[0], document.map.rootId)); setSelectedId(document.map.rootId); setSelectedIds(new Set([document.map.rootId])); setDeleteTargets([]) }
    catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível excluir o tópico.') }
  }
  const createNoteFromSelected = async () => {
    if (!document || !selected || noteBusy) return
    try {
      setNoteBusy(true); setIntegrationNotice(null)
      if (!await notesRepository.isEnabled()) throw new Error('Habilite Anotações antes de criar uma nota a partir do mapa.')
      const lines: string[] = []; const visit = (parentId: string, depth: number) => document.topics.filter((topic) => topic.parentId === parentId).sort((a, b) => a.order - b.order).forEach((topic) => { lines.push(`${'  '.repeat(depth)}- ${topic.text}`); visit(topic.id, depth + 1) })
      visit(selected.id, 0)
      const sections = [selected.note?.trim(), lines.length ? `Subtópicos:\n${lines.join('\n')}` : '', selected.links?.length ? `Links:\n${selected.links.map((link) => `- ${link.label}: ${link.url}`).join('\n')}` : ''].filter(Boolean)
      await notesRepository.createNote(selected.text, sections.join('\n\n')); setIntegrationNotice({ error: false, text: 'Anotação criada sem alterar o mapa.' })
    } catch (reason) { setIntegrationNotice({ error: true, text: reason instanceof Error ? reason.message : 'Não foi possível criar a anotação.' }) }
    finally { setNoteBusy(false) }
  }
  const undo = () => {
    if (!document || !history.past.length) return
    const previous = history.past.at(-1)!; setHistory({ past: history.past.slice(0, -1), future: [cloneDocument(document), ...history.future].slice(0, 100) }); commitDocument(cloneDocument(previous), false)
  }
  const redo = () => {
    if (!document || !history.future.length) return
    const nextDocument = history.future[0]; setHistory({ past: [...history.past, cloneDocument(document)].slice(-100), future: history.future.slice(1) }); commitDocument(cloneDocument(nextDocument), false)
  }

  const selectTopic = (id: string, additive = false) => {
    setSelectedConnectionId(null)
    if (!additive) { setSelectedId(id); setSelectedIds(new Set([id])); return }
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) { next.delete(id); setSelectedId([...next].at(-1) ?? null) } else { next.add(id); setSelectedId(id) }
      return next
    })
  }
  const moveSelected = (parentId: string | null, index?: number) => {
    if (!document || !selected || selected.id === document.map.rootId) return
    try { commitTopics(moveTopic(document.topics, selected.id, parentId, index, document.map.rootId)); setMoveOpen(false) }
    catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível mover o tópico.') }
  }
  const reorderSelected = (direction: -1 | 1) => {
    if (!document || !selected || selected.id === document.map.rootId) return
    commitTopics(moveTopicAmongSiblings(document.topics, selected.id, direction, document.map.rootId))
  }
  const detachSelected = () => {
    if (!document || !selected || selected.id === document.map.rootId || !layout) return
    const position = layout.topics.get(selected.id)
    const moved = moveTopic(document.topics, selected.id, null, undefined, document.map.rootId).map((topic) => topic.id === selected.id ? { ...topic, position: position ? { x: position.x, y: position.y } : { x: 300, y: 0 }, manualPosition: true } : topic)
    commitTopics(moved); setMoveOpen(false)
  }
  const duplicateSelected = () => {
    if (!document || !selected) return
    const result = duplicateTopicBranch(document.topics, selected.id); commitTopics(result.topics); selectTopic(result.rootId)
  }
  const copySelection = (cut = false) => {
    if (!document || !selectedIds.size) return
    const topLevel = [...selectedIds].filter((id) => ![...selectedIds].some((other) => other !== id && descendantIds(document.topics, other).has(id)))
    clipboard.current = topLevel.map((rootId) => { const ids = descendantIds(document.topics, rootId); ids.add(rootId); return { rootId, topics: cloneTopics(document.topics.filter((topic) => ids.has(topic.id))) } })
    setClipboardReady(clipboard.current.length > 0)
    const labels = topLevel.map((id) => document.topics.find((topic) => topic.id === id)?.text ?? '').filter(Boolean).join('\n')
    void navigator.clipboard?.writeText(labels).catch(() => undefined)
    if (cut) { const removable = topLevel.filter((id) => id !== document.map.rootId); if (removable.length) { commitTopics(removeTopicBranches(document.topics, removable, document.map.rootId)); selectTopic(document.map.rootId) } }
  }
  const pasteSelection = () => {
    if (!document || !selected || !clipboard.current.length) return
    let topics = document.topics; const pastedIds: string[] = []
    clipboard.current.forEach((branch) => { const pasted = pasteTopicBranch(topics, branch.topics, branch.rootId, selected.id, document.map.id); topics = pasted.topics; pastedIds.push(pasted.rootId) })
    commitTopics(topics); setSelectedId(pastedIds.at(-1) ?? selected.id); setSelectedIds(new Set(pastedIds))
  }
  const normalizedSearch = searchText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
  const normalizedMoveSearch = moveSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
  const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  const searchResults = document?.topics.filter((topic) => !normalizedSearch || normalizeText(`${topic.text} ${topic.note ?? ''}`).includes(normalizedSearch)).slice(0, 30) ?? []
  const searchMatchSource = (topic: MindMapTopic) => normalizeText(topic.text).includes(normalizedSearch) ? 'Tópico' : 'Nota'
  const searchMatchIds = useMemo(() => new Set(normalizedSearch ? searchResults.map(({ id }) => id) : []), [normalizedSearch, searchResults])
  const topicPath = (topic: MindMapTopic) => { const parts = [topic.text]; let current = topic; while (current.parentId) { const parent = document?.topics.find((item) => item.id === current.parentId); if (!parent) break; parts.unshift(parent.text); current = parent } return parts.join(' › ') }
  const focusTopic = (id: string) => {
    if (!document) return
    const ancestors = new Set<string>(); let current = document.topics.find((topic) => topic.id === id)
    while (current?.parentId) { ancestors.add(current.parentId); current = document.topics.find((topic) => topic.id === current?.parentId) }
    const topics = document.topics.map((topic) => ancestors.has(topic.id) ? { ...topic, collapsed: false } : topic)
    const nextLayout = calculateRadialLayout(topics, document.map.rootId, document.map.layout); const position = nextLayout.topics.get(id); const canvas = canvasRef.current
    if (position && canvas) { const viewport = { ...document.map.viewport, panX: canvas.clientWidth / 2 - (position.x + position.width / 2) * document.map.viewport.zoom, panY: canvas.clientHeight / 2 - (position.y + position.height / 2) * document.map.viewport.zoom }; const next = { map: { ...document.map, viewport }, topics, connections: document.connections }; commitDocument(next); selectTopic(id) }
    setSearchIndex(Math.max(0, searchResults.findIndex((topic) => topic.id === id)))
  }

  const center = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas || !document) return
    scheduleViewportSave({ ...document.map.viewport, panX: canvas.clientWidth / 2, panY: canvas.clientHeight / 2 })
  }, [document, scheduleViewportSave])
  const fit = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas || !document || !layout) return
    const padding = 90; const zoom = clampMindMapZoom(Math.min((canvas.clientWidth - padding) / Math.max(layout.width, 1), (canvas.clientHeight - padding) / Math.max(layout.height, 1), 1.4))
    scheduleViewportSave({ zoom, panX: canvas.clientWidth / 2 - ((layout.minX + layout.maxX) / 2) * zoom, panY: canvas.clientHeight / 2 - ((layout.minY + layout.maxY) / 2) * zoom })
  }, [document, layout, scheduleViewportSave])
  useEffect(() => { if (document && document.map.viewport.panX === 0 && document.map.viewport.panY === 0 && canvasRef.current) center() }, [document?.map.id, center])

  const zoomBy = (delta: number) => {
    if (!document) return; const canvas = canvasRef.current; const current = document.map.viewport; const cx = canvas ? canvas.clientWidth / 2 : 0; const cy = canvas ? canvas.clientHeight / 2 : 0
    scheduleViewportSave(zoomViewportAtPoint(current, current.zoom + delta, cx, cy))
  }
  const resetZoom = () => {
    if (!document) return; const canvas = canvasRef.current; const current = document.map.viewport; const cx = canvas ? canvas.clientWidth / 2 : 0; const cy = canvas ? canvas.clientHeight / 2 : 0
    scheduleViewportSave(zoomViewportAtPoint(current, 1, cx, cy))
  }
  const enterFocus = () => {
    if (!document || !selectedId) return
    focusSnapshot.current = { viewport: { ...document.map.viewport }, selectedId, selectedIds: new Set(selectedIds) }; setFocusRootId(selectedId)
  }
  const exitFocus = () => {
    if (!document) return
    const snapshot = focusSnapshot.current; focusSnapshot.current = null; setFocusRootId(null)
    if (!snapshot) return
    const available = new Set(document.topics.map(({ id }) => id)); const restoredIds = new Set([...snapshot.selectedIds].filter((id) => available.has(id))); const restoredId = snapshot.selectedId && available.has(snapshot.selectedId) ? snapshot.selectedId : [...restoredIds].at(-1) ?? document.map.rootId
    if (!restoredIds.size) restoredIds.add(restoredId)
    setSelectedId(restoredId); setSelectedIds(restoredIds); scheduleViewportSave({ ...snapshot.viewport })
  }
  const toggleFocus = () => { if (focusRootId) exitFocus(); else enterFocus() }
  useEffect(() => { if (focusRootId && document && !document.topics.some(({ id }) => id === focusRootId)) exitFocus() }, [document?.topics, focusRootId])
  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-topic]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.shiftKey) { const x = event.clientX - rect.left; const y = event.clientY - rect.top; setSelectionBox({ pointerId: event.pointerId, startX: x, startY: y, x, y, additive: event.ctrlKey || event.metaKey }); setPanning(null); return }
    canvasPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...canvasPointers.current.values()]
    if (points.length === 2 && document) {
      const [first, second] = points; pinchGesture.current = { distance: Math.hypot(second.x - first.x, second.y - first.y), centerX: (first.x + second.x) / 2, centerY: (first.y + second.y) / 2, viewport: document.map.viewport }; setPanning(null)
    } else setPanning({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: document?.map.viewport.panX ?? 0, panY: document?.map.viewport.panY ?? 0 })
    setSelectedId(null); setSelectedIds(new Set())
  }
  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (selectionBox?.pointerId === event.pointerId) { const rect = event.currentTarget.getBoundingClientRect(); setSelectionBox({ ...selectionBox, x: event.clientX - rect.left, y: event.clientY - rect.top }); return }
    if (canvasPointers.current.has(event.pointerId)) canvasPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const pinch = pinchGesture.current; const points = [...canvasPointers.current.values()]
    if (pinch && points.length >= 2 && document) {
      const [first, second] = points; const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)); const centerX = (first.x + second.x) / 2; const centerY = (first.y + second.y) / 2; const canvas = canvasRef.current; if (!canvas) return
      const rect = canvas.getBoundingClientRect(); const zoom = pinch.viewport.zoom * distance / Math.max(1, pinch.distance)
      const viewport = zoomViewportAtPoint(pinch.viewport, zoom, pinch.centerX - rect.left, pinch.centerY - rect.top, centerX - rect.left, centerY - rect.top); const next = { ...document, map: { ...document.map, viewport } }; setDocument(next); documentRef.current = next; return
    }
    if (!panning || panning.pointerId !== event.pointerId || !document) return
    const viewport = { ...document.map.viewport, panX: panning.panX + event.clientX - panning.startX, panY: panning.panY + event.clientY - panning.startY }
    const next = { ...document, map: { ...document.map, viewport } }; setDocument(next); documentRef.current = next
  }
  const stopPanning = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (selectionBox?.pointerId === event.pointerId) {
      const left = Math.min(selectionBox.startX, selectionBox.x); const right = Math.max(selectionBox.startX, selectionBox.x); const top = Math.min(selectionBox.startY, selectionBox.y); const bottom = Math.max(selectionBox.startY, selectionBox.y); const current = documentRef.current
      if (current && layout && right - left >= 4 && bottom - top >= 4) {
        const viewport = current.map.viewport; const ids = [...layout.topics.values()].filter((item) => { const itemLeft = viewport.panX + item.x * viewport.zoom; const itemTop = viewport.panY + item.y * viewport.zoom; const itemRight = itemLeft + item.width * viewport.zoom; const itemBottom = itemTop + item.height * viewport.zoom; return itemLeft < right && itemRight > left && itemTop < bottom && itemBottom > top }).map(({ id }) => id)
        setSelectedIds((existing) => { const next = selectionBox.additive ? new Set(existing) : new Set<string>(); ids.forEach((id) => next.add(id)); setSelectedId(ids.at(-1) ?? [...next].at(-1) ?? null); return next })
      } else if (!selectionBox.additive) { setSelectedId(null); setSelectedIds(new Set()) }
      setSelectionBox(null); return
    }
    canvasPointers.current.delete(event.pointerId); const current = documentRef.current
    if (pinchGesture.current) { pinchGesture.current = null; setPanning(null); if (current) scheduleViewportSave(current.map.viewport); return }
    if (panning?.pointerId === event.pointerId && current) { setPanning(null); scheduleViewportSave(current.map.viewport) }
  }
  const startTopicDrag = (event: ReactPointerEvent<HTMLDivElement>, topic: MindMapTopic) => {
    event.stopPropagation()
    if (editingId || saveState === 'saving' || document?.map.layout === 'radial' && topic.id === document.map.rootId) return
    event.currentTarget.setPointerCapture(event.pointerId); if (event.ctrlKey || event.metaKey) setSelectedId(topic.id); else selectTopic(topic.id)
    setTopicDrag({ id: topic.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, source: cloneTopics(document?.topics ?? []) })
  }
  const moveTopicDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!topicDrag || topicDrag.pointerId !== event.pointerId || !document) return
    const dx = event.clientX - topicDrag.startX; const dy = event.clientY - topicDrag.startY
    setTopicDrag({ ...topicDrag, dx, dy })
    if (document.map.layout === 'manual' || Math.hypot(dx, dy) < 8) { setDropTarget(null); return }
    const targetElement = globalThis.document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-topic-id]')
    const id = targetElement?.dataset.topicId
    if (!id || !canMoveTopic(document.topics, topicDrag.id, id, document.map.rootId)) { setDropTarget(null); return }
    const targetTopic = document.topics.find((topic) => topic.id === id); const rect = targetElement.getBoundingClientRect(); const relativeY = (event.clientY - rect.top) / Math.max(rect.height, 1)
    const placement = targetTopic?.parentId !== null && relativeY < .25 ? 'before' : targetTopic?.parentId !== null && relativeY > .75 ? 'after' : 'child'
    setDropTarget({ id, placement })
  }
  const finishTopicDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!topicDrag || topicDrag.pointerId !== event.pointerId || !document || !layout) return
    const moved = Math.hypot(topicDrag.dx, topicDrag.dy) >= 8
    if (moved && document.map.layout === 'manual') {
      const position = layout.topics.get(topicDrag.id)
      if (position) {
        const topics = document.topics.map((topic) => topic.id === topicDrag.id ? { ...topic, position: { x: position.x + topicDrag.dx / document.map.viewport.zoom, y: position.y + topicDrag.dy / document.map.viewport.zoom }, manualPosition: true, updatedAt: Date.now() } : topic)
        commitTopics(topics, true, { map: document.map, topics: topicDrag.source, connections: document.connections })
      }
    } else if (moved && dropTarget) {
      try {
        const target = document.topics.find((topic) => topic.id === dropTarget.id)!
        if (dropTarget.placement === 'child') commitTopics(moveTopic(document.topics, topicDrag.id, target.id, undefined, document.map.rootId), true, { map: document.map, topics: topicDrag.source, connections: document.connections })
        else {
          const siblings = document.topics.filter((topic) => topic.parentId === target.parentId && topic.id !== topicDrag.id).sort((a, b) => a.order - b.order)
          const targetIndex = siblings.findIndex((topic) => topic.id === target.id); const index = targetIndex + (dropTarget.placement === 'after' ? 1 : 0)
          commitTopics(moveTopic(document.topics, topicDrag.id, target.parentId, index, document.map.rootId), true, { map: document.map, topics: topicDrag.source, connections: document.connections })
        }
      } catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível reorganizar a ramificação.') }
    }
    setTopicDrag(null); setDropTarget(null)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement; if (target.matches('input, textarea, select, [contenteditable="true"]')) return
    if (event.key === '?') { event.preventDefault(); setShortcutsOpen(true); return }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (connectingFrom) { setConnectingFrom(null); return }
      if (topicDrag || selectionBox || panning || pinchGesture.current) { setTopicDrag(null); setDropTarget(null); setSelectionBox(null); setPanning(null); pinchGesture.current = null; canvasPointers.current.clear(); return }
      if (detailsOpen || outlineOpen || searchOpen || moveOpen || exportOpen) { setDetailsOpen(false); setOutlineOpen(false); setSearchOpen(false); setMoveOpen(false); setExportOpen(false); return }
      if (focusRootId) { exitFocus(); return }
      if (selectedConnectionId) { setSelectedConnectionId(null); return }
      setSelectedId(null); setSelectedIds(new Set()); return
    }
    if (!selectedId) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return }
    if ((event.ctrlKey && event.key.toLowerCase() === 'y')) { event.preventDefault(); redo(); return }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); return }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') { event.preventDefault(); copySelection(true); return }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteSelection(); return }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); const ids = new Set(layout ? [...layout.topics.keys()] : []); setSelectedIds(ids); setSelectedId([...ids].at(-1) ?? null); return }
    if (event.key === 'Tab') { event.preventDefault(); createTopic('child') }
    else if (event.key === 'Enter') { event.preventDefault(); createTopic(event.shiftKey ? 'before' : 'after') }
    else if (event.key === 'F2') { event.preventDefault(); if (selected) beginEdit(selected) }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (selectedConnectionId) removeConnection(selectedConnectionId); else requestDelete() }
    else if (event.key === ' ') { event.preventDefault(); toggleCollapse() }
    else if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); reorderSelected(-1) }
    else if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); reorderSelected(1) }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(.1) }
    else if (event.key === '-') { event.preventDefault(); zoomBy(-.1) }
    else if (event.key === '0') { event.preventDefault(); resetZoom() }
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && layout) {
      event.preventDefault(); const direction = event.key.replace('Arrow', '').toLocaleLowerCase() as NavigationDirection; const id = findDirectionalTopic(layout.topics.values(), selectedId, direction); setSelectedId(id); setSelectedIds(new Set([id]))
    }
  }
  const enableAdvanced = async () => {
    try {
      await downloadBackup()
      if (!window.confirm('Backup baixado. Habilitar conexões, estilos e imagens sem alterar os mapas existentes?')) return
      await mindMapsRepository.enableAdvanced(); setAdvancedEnabled(true); setSaveError('')
    } catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível habilitar os recursos visuais.') }
  }
  const setLayout = (layoutMode: MindMapLayout) => {
    if (!document || !layout) return
    let topics = document.topics
    if (layoutMode === 'manual') topics = topics.map((topic) => { const position = layout.topics.get(topic.id); return position ? { ...topic, position: { x: position.x, y: position.y }, manualPosition: true } : topic })
    else topics = topics.map((topic) => ({ ...topic, manualPosition: false }))
    commitDocument({ ...document, map: { ...document.map, layout: layoutMode }, topics })
  }
  const updateSelectedTopics = (changes: Partial<MindMapTopic>) => {
    if (!document || !selectedIds.size) return
    const now = Date.now(); commitTopics(document.topics.map((topic) => selectedIds.has(topic.id) ? { ...topic, ...changes, updatedAt: now } : topic))
  }
  const createConnection = (targetId: string) => {
    if (!document || !connectingFrom) return
    if (connectingFrom === targetId) { setIntegrationNotice({ error: true, text: 'Escolha outro tópico para criar a conexão.' }); setConnectingFrom(null); return }
    if (hasConnectionBetween(document.connections ?? [], connectingFrom, targetId)) { setIntegrationNotice({ error: true, text: 'Já existe uma conexão entre esses tópicos.' }); setConnectingFrom(null); return }
    const now = Date.now(); const connection: MindMapConnection = { id: crypto.randomUUID(), mapId: document.map.id, sourceId: connectingFrom, targetId, label: '', color: '#a78bfa', width: 2, dashed: false, directed: false, createdAt: now, updatedAt: now }; commitDocument({ ...document, connections: [...(document.connections ?? []), connection] }); setIntegrationNotice({ error: false, text: 'Conexão criada.' })
    setConnectingFrom(null)
  }
  const addLink = (link: NewMindMapLink) => { if (selected) updateSelectedTopics({ links: [...(selected.links ?? []), { id: crypto.randomUUID(), ...link }] }) }
  const uploadImage = async (file?: File) => {
    if (!file || !document || !selected) return
    try { setImageMessage('Otimizando imagem…'); const processed = await prepareMindMapImage(file); const asset = await mindMapsRepository.saveAsset(document.map.id, processed.file); setAssets((current) => [...current, asset]); updateSelectedTopics({ imageAssetId: asset.id }); setImageMessage(processed.resized ? `Imagem otimizada de ${formatImageBytes(processed.originalSize)} para ${formatImageBytes(processed.finalSize)}.` : `Imagem preservada com ${formatImageBytes(processed.finalSize)}.`) } catch (reason) { setImageMessage(''); setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar a imagem.') }
  }
  const updateConnection = (id: string, changes: Partial<MindMapConnection>) => { if (document) commitDocument({ ...document, connections: (document.connections ?? []).map((item) => item.id === id ? { ...item, ...changes, updatedAt: Date.now() } : item) }) }
  const removeConnection = (id: string) => {
    if (!document) return
    commitDocument({ ...document, connections: (document.connections ?? []).filter((item) => item.id !== id) }); setSelectedConnectionId(null)
  }
  const selectConnection = (connection: MindMapConnection) => {
    setSelectedConnectionId(connection.id); setSelectedId(connection.sourceId); setSelectedIds(new Set([connection.sourceId])); setDetailsOpen(true)
  }
  const exportMap = async (kind: 'json' | 'svg' | 'png') => {
    const current = documentRef.current; if (!current) return
    try {
      setExportOpen(false); const name = safeFileName(current.map.name)
      if (kind === 'json') { const file = await createMindMapFile(current, assets); downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${name}.hubmap.json`) }
      else if (kind === 'svg') downloadBlob(new Blob([await renderMindMapSvg(current, assets)], { type: 'image/svg+xml;charset=utf-8' }), `${name}.svg`)
      else downloadBlob(await renderMindMapPng(current, assets), `${name}.png`)
    } catch (reason) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível exportar o mapa.') }
  }
  const renameMap = () => {
    const current = documentRef.current; if (!current) return
    const name = current.map.name.trim(); if (!name) { setSaveState('error'); setSaveError('O nome do mapa não pode ficar vazio.'); return }
    const next = { ...current, map: { ...current.map, name: name.slice(0, 100) } }; setDocument(next); documentRef.current = next; void queueSave(next).catch(() => undefined)
  }

  if (loadError) return <main className="grid min-h-screen place-items-center p-6"><section className="app-card max-w-md p-7 text-center"><Map className="mx-auto mb-4 text-red-400" /><h1 className="text-xl font-bold text-strong">Falha ao abrir o mapa</h1><p role="alert" className="my-4 text-sm text-red-300">{loadError}</p><div className="flex justify-center gap-3"><Link to="/notes/maps" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 font-semibold text-slate-300">Biblioteca</Link><Button onClick={() => { void load() }}><RotateCcw size={16} />Tentar novamente</Button></div></section></main>
  if (!document || !layout) return <main className="grid min-h-screen place-items-center text-slate-400">Carregando mapa…</main>
  const viewport = document.map.viewport
  const connectionPadding = 280
  return <main className={`mind-map-editor mind-map-theme-${document.map.theme ?? 'classic'} flex min-h-[100dvh] flex-col overflow-hidden bg-[var(--bg)]`}>
    <header className="z-20 flex min-h-16 flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900/95 px-3 py-2 shadow-lg md:px-5">
      <Link to="/notes/maps" aria-label="Voltar à biblioteca" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"><ArrowLeft size={18} /><span className="hidden sm:inline">Mapas mentais</span></Link>
      <Map size={18} className="hidden text-violet-400 sm:block" />
      <input aria-label="Nome do mapa" maxLength={100} value={document.map.name} onChange={(event) => { const next = { ...document, map: { ...document.map, name: event.target.value } }; setDocument(next); documentRef.current = next; setSaveState('saving') }} onBlur={renameMap} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} className="min-h-10 min-w-32 flex-1 rounded-lg border border-transparent bg-transparent px-2 font-semibold text-strong hover:border-slate-700 focus:border-violet-500 sm:max-w-md" />
      <span role="status" aria-live="polite" className={`text-xs ${saveState === 'error' ? 'text-red-400' : saveState === 'saving' ? 'text-amber-400' : 'text-emerald-400'}`}>{saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Falha ao salvar' : 'Salvo'}</span>
      {saveState === 'error' && <button className="rounded-lg px-2 py-1 text-xs font-semibold text-red-300 underline" onClick={() => { const current = documentRef.current; if (current) void queueSave(current).catch(() => undefined) }}>Tentar novamente</button>}
      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1"><select aria-label="Organização do mapa" value={document.map.layout} onChange={(event) => setLayout(event.target.value as MindMapLayout)} className="min-h-10 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-300"><option value="radial">Radial</option><option value="right">À direita</option><option value="orgchart">Organograma</option><option value="manual">Manual</option></select><button className="editor-icon-button" aria-label="Criar tópico flutuante no centro" onClick={createFloatingTopic}><Plus size={18} /></button><button className="editor-icon-button" aria-label={document.map.layout === 'manual' ? 'Usar organização automática' : 'Usar posição manual'} onClick={() => setLayout(document.map.layout === 'manual' ? 'radial' : 'manual')}><LayoutTemplate size={18} /></button><button className="editor-icon-button" aria-label="Exportar mapa" aria-expanded={exportOpen} onClick={() => setExportOpen((value) => !value)}><Download size={18} /></button><button className="editor-icon-button" aria-label="Buscar tópicos" aria-pressed={searchOpen} onClick={() => setSearchOpen((value) => !value)}><Search size={18} /></button><button className="editor-icon-button" aria-label="Alternar Outline" aria-pressed={outlineOpen} onClick={() => setOutlineOpen((value) => !value)}><ListTree size={18} /></button><button className="editor-icon-button" aria-label="Propriedades" aria-pressed={detailsOpen} onClick={() => setDetailsOpen((value) => !value)}><Palette size={18} /></button><button className="editor-icon-button" aria-label="Ajuda de atalhos" onClick={() => setShortcutsOpen(true)}><HelpCircle size={18} /></button><button disabled={!history.past.length || saveState === 'saving'} className="editor-icon-button" aria-label="Desfazer" onClick={undo}><Undo2 size={18} /></button><button disabled={!history.future.length || saveState === 'saving'} className="editor-icon-button" aria-label="Refazer" onClick={redo}><Redo2 size={18} /></button></div>
    </header>
    {saveError && saveState === 'error' && <div role="alert" className="z-20 flex flex-wrap items-center justify-center gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-xs text-red-200"><span>{saveError}</span><button className="font-semibold underline" onClick={() => { void exportMap('json') }}>Exportar recuperação</button></div>}
    {remoteChanged && <div role="alert" className="z-30 flex flex-wrap items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100"><span>Este mapa foi alterado em outra aba. As edições locais foram pausadas.</span><button className="font-semibold underline" onClick={() => { void load() }}>Recarregar mapa</button><button className="font-semibold underline" onClick={() => { void exportMap('json') }}>Exportar cópia local</button></div>}
    {integrationNotice && <div role={integrationNotice.error ? 'alert' : 'status'} className={`z-20 flex items-center justify-center gap-3 border-b px-4 py-2 text-xs ${integrationNotice.error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}><span>{integrationNotice.text}</span><button aria-label="Fechar aviso" onClick={() => setIntegrationNotice(null)}><X size={15} /></button></div>}
    {!advancedEnabled && <div className="z-20 flex flex-wrap items-center justify-center gap-3 border-b border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs text-violet-100"><span>Conexões, estilos e imagens usam uma expansão local e segura do banco.</span><button className="font-semibold underline" onClick={() => { void enableAdvanced() }}>Baixar backup e habilitar</button></div>}
    <section className="relative flex min-h-0 flex-1">
      {exportOpen && <aside className="absolute right-3 top-3 z-40 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl" aria-label="Opções de exportação"><button className="topic-action w-full" onClick={() => { void exportMap('json') }}>JSON editável</button><button className="topic-action mt-1 w-full" onClick={() => { void exportMap('svg') }}>SVG autocontido</button><button className="topic-action mt-1 w-full" onClick={() => { void exportMap('png') }}>PNG</button></aside>}
      <div ref={canvasRef} tabIndex={0} aria-label="Canvas do mapa mental" className={`mind-map-canvas relative min-h-0 flex-1 touch-none overflow-hidden outline-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={stopPanning} onPointerCancel={stopPanning} onKeyDown={onKeyDown} onWheel={(event) => { if ((!event.ctrlKey && !event.metaKey) || !document) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const anchorX = event.clientX - rect.left; const anchorY = event.clientY - rect.top; scheduleViewportSave(zoomViewportAtPoint(document.map.viewport, document.map.viewport.zoom + (event.deltaY < 0 ? .1 : -.1), anchorX, anchorY)) }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}>
          <svg aria-label="Conexões do mapa" className="absolute overflow-visible" width={Math.max(1, layout.width + connectionPadding * 2)} height={Math.max(1, layout.height + connectionPadding * 2)} viewBox={`${layout.minX - connectionPadding} ${layout.minY - connectionPadding} ${Math.max(1, layout.width + connectionPadding * 2)} ${Math.max(1, layout.height + connectionPadding * 2)}`} style={{ left: layout.minX - connectionPadding, top: layout.minY - connectionPadding }}>
            <defs><marker id="mind-map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
            {document.topics.filter((topic) => topic.parentId && visibleIds.has(topic.id) && visibleIds.has(topic.parentId)).map((topic) => { const parent = layout.topics.get(topic.parentId!); const child = layout.topics.get(topic.id); return parent && child ? <path aria-hidden="true" key={topic.id} d={connectionPath(parent, child)} className="mind-map-connection pointer-events-none" /> : null })}
            {(document.connections ?? []).filter((item) => visibleIds.has(item.sourceId) && visibleIds.has(item.targetId)).map((item) => {
              const source = layout.topics.get(item.sourceId); const target = layout.topics.get(item.targetId); if (!source || !target) return null
              const sourceTopic = document.topics.find((topic) => topic.id === item.sourceId); const targetTopic = document.topics.find((topic) => topic.id === item.targetId); const path = transverseConnectionPath(source, target, item.shape, item.curveOffset); const x1 = source.x + source.width / 2; const y1 = source.y + source.height / 2; const x2 = target.x + target.width / 2; const y2 = target.y + target.height / 2; const label = `Conexão de ${sourceTopic?.text ?? 'tópico'} para ${targetTopic?.text ?? 'tópico'}`
              return <g key={item.id} className={selectedConnectionId === item.id ? 'is-selected' : undefined}>
                <path aria-hidden="true" className="mind-map-transverse" d={path} fill="none" stroke={item.color} strokeWidth={item.width} strokeDasharray={item.dashed ? '7 5' : undefined} markerStart={item.startMarker ? 'url(#mind-map-arrow)' : undefined} markerEnd={(item.endMarker ?? item.directed) ? 'url(#mind-map-arrow)' : undefined} />
                <path role="button" tabIndex={0} aria-label={label} aria-pressed={selectedConnectionId === item.id} className="mind-map-connection-hit" d={path} fill="none" stroke="transparent" strokeWidth={Math.max(18, item.width + 14)} vectorEffect="non-scaling-stroke" onPointerDown={(event) => { event.stopPropagation(); selectConnection(item); event.currentTarget.focus() }} onClick={(event) => { event.stopPropagation(); selectConnection(item) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectConnection(item) } }} />
                <text aria-hidden="true" className="pointer-events-none" x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 12} textAnchor="middle" fill={item.color} fontSize="12">{item.label}</text>
              </g>
            })}
          </svg>
          {[...layout.topics.values()].map((position) => { const topic = document.topics.find((item) => item.id === position.id)!; const children = document.topics.filter((item) => item.parentId === topic.id); const selectedTopic = selectedIds.has(topic.id); const dragging = topicDrag?.id === topic.id; const validDrop = dropTarget?.id === topic.id; const hiddenCount = topic.collapsed ? descendantIds(document.topics, topic.id).size : 0; const imageUrl = topic.imageAssetId ? assetUrls.get(topic.imageAssetId) : undefined; return <div key={topic.id} data-topic data-topic-id={topic.id} className={`mind-map-topic absolute ${topic.id === document.map.rootId ? 'mind-map-topic-root' : ''} ${topic.parentId === null && topic.id !== document.map.rootId ? 'is-floating' : ''} ${selectedTopic ? 'is-selected' : ''} ${searchMatchIds.has(topic.id) ? 'is-search-match' : ''} ${dragging ? 'is-dragging' : ''} ${validDrop ? `is-drop-target drop-${dropTarget.placement}` : ''}`} style={{ left: position.x, top: position.y, width: position.width, height: position.height, background: topic.style?.background, color: topic.style?.color, borderColor: topic.style?.borderColor, borderWidth: topic.style?.borderWidth, borderRadius: topic.style?.borderRadius, textAlign: topic.style?.textAlign, fontWeight: topic.style?.bold ? 700 : undefined, fontStyle: topic.style?.italic ? 'italic' : undefined, fontSize: topic.style?.fontScale ? `${topic.style.fontScale}em` : undefined, transform: dragging ? `translate(${topicDrag.dx / viewport.zoom}px, ${topicDrag.dy / viewport.zoom}px)` : undefined }} onPointerDown={(event) => startTopicDrag(event, topic)} onPointerMove={moveTopicDrag} onPointerUp={finishTopicDrag} onPointerCancel={() => { setTopicDrag(null); setDropTarget(null) }}>
            {editingId === topic.id ? <textarea autoFocus maxLength={500} value={editingText} aria-label={`Editar tópico ${topic.text}`} onChange={(event) => { editingTextRef.current = event.target.value; setEditingText(event.target.value) }} onBlur={finishEdit} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur() } else if (event.key === 'Escape') { event.preventDefault(); editCancelled.current = true; editingIdRef.current = null; setEditingId(null) } }} className="h-full min-h-14 w-full resize-none rounded-xl border border-violet-400 bg-slate-900 p-3 text-center text-white" /> : <button className="block min-h-full w-full whitespace-pre-wrap break-words rounded-[inherit] px-4 py-3" style={{ textAlign: topic.style?.textAlign ?? 'center' }} aria-label={`Tópico: ${topic.text}, ${children.length} filhos, ${topic.collapsed ? 'recolhido' : 'expandido'}`} aria-pressed={selectedTopic} onClick={(event) => connectingFrom ? createConnection(topic.id) : selectTopic(topic.id, event.ctrlKey || event.metaKey)} onDoubleClick={() => beginEdit(topic)}>{imageUrl && <img src={imageUrl} alt="" className="mx-auto mb-1 max-h-8 max-w-full rounded object-contain" />}{topic.icon && <span aria-hidden="true" className="mr-1">{topic.icon}</span>}{topic.text}{(topic.note || topic.links?.length) && <span aria-label="Possui detalhes" className="ml-1 text-xs opacity-70">●</span>}</button>}
            {children.length > 0 && <button aria-label={topic.collapsed ? `Expandir ${topic.text}` : `Recolher ${topic.text}`} aria-expanded={!topic.collapsed} className={`mind-map-collapse ${position.side === -1 ? '-left-3' : '-right-3'}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectTopic(topic.id); const now = Date.now(); commitTopics(document.topics.map((item) => item.id === topic.id ? { ...item, collapsed: !item.collapsed, updatedAt: now } : item)) }}>{topic.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{hiddenCount > 0 && <span>{hiddenCount}</span>}</button>}
          </div> })}
        </div>
        {selectionBox && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-violet-400 bg-violet-400/15" style={{ left: Math.min(selectionBox.startX, selectionBox.x), top: Math.min(selectionBox.startY, selectionBox.y), width: Math.abs(selectionBox.x - selectionBox.startX), height: Math.abs(selectionBox.y - selectionBox.startY) }} />}
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-slate-700 bg-slate-900/95 p-1.5 shadow-xl"><button className="editor-icon-button" aria-label="Diminuir zoom" onClick={() => zoomBy(-.1)}><ZoomOut size={18} /></button><span className="w-14 text-center text-xs font-semibold text-slate-300">{Math.round(viewport.zoom * 100)}%</span><button className="editor-icon-button" aria-label="Aumentar zoom" onClick={() => zoomBy(.1)}><ZoomIn size={18} /></button><button className="editor-icon-button" aria-label="Enquadrar mapa" onClick={fit}><Focus size={18} /></button><button className="editor-icon-button" aria-label="Centralizar tópico central" onClick={center}><RotateCcw size={17} /></button></div>
      </div>
      {selected && <aside className="absolute bottom-20 left-1/2 z-10 flex max-h-32 max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap justify-center gap-1 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl md:bottom-auto md:left-4 md:top-4 md:max-h-none md:translate-x-0" aria-label="Ações do tópico"><span className="self-center px-2 text-xs text-slate-500">{connectingFrom ? 'Selecione o destino' : selectedIds.size > 1 ? `${selectedIds.size} selecionados` : document.map.layout === 'manual' ? 'Arraste para posicionar' : 'Arraste para reorganizar'}</span><button className="topic-action" onClick={() => createTopic('child')} disabled={saveState === 'saving' || selectedIds.size > 1}><Plus size={16} />Subtópico</button><button className="topic-action" onClick={() => createTopic('after')} disabled={saveState === 'saving' || selectedIds.size > 1}><Plus size={16} />Irmão</button><button className="topic-action" onClick={() => beginEdit(selected)} disabled={selectedIds.size > 1}><Pencil size={16} />Editar</button><button className="topic-action" onClick={duplicateSelected} disabled={selectedIds.size > 1}><Copy size={16} />Duplicar</button><button className="topic-action" onClick={() => copySelection()}><Copy size={16} />Copiar</button><button className="topic-action" onClick={() => copySelection(true)} disabled={selectedIds.size === 1 && selected.id === document.map.rootId}><Scissors size={16} />Recortar</button><button className="topic-action" disabled={!clipboardReady || selectedIds.size > 1} onClick={pasteSelection}><Plus size={16} />Colar</button><button className="topic-action" disabled={selected.id === document.map.rootId || selectedIds.size > 1} onClick={() => setMoveOpen(true)}><Move size={16} />Mover para</button><button className="topic-action" onClick={() => setDetailsOpen(true)}><Palette size={16} />Detalhes</button><button className="topic-action" disabled={selectedIds.size > 1 || noteBusy} onClick={() => { void createNoteFromSelected() }}><NotebookPen size={16} />{noteBusy ? 'Criando…' : 'Criar nota'}</button><button className="topic-action" disabled={!advancedEnabled || selectedIds.size > 1} onClick={() => setConnectingFrom(connectingFrom ? null : selected.id)}><Network size={16} />{connectingFrom ? 'Cancelar conexão' : 'Conectar'}</button><button className="topic-action" onClick={toggleFocus}><Focus size={16} />{focusRootId ? 'Sair do foco' : 'Focar'}</button>{document.topics.some((topic) => topic.parentId === selected.id) && <button className="topic-action" onClick={toggleCollapse} disabled={selectedIds.size > 1}>{selected.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}{selected.collapsed ? 'Expandir' : 'Recolher'}</button>}<button className="topic-action text-red-300" disabled={!selectedIds.size || (selectedIds.size === 1 && selected.id === document.map.rootId) || saveState === 'saving'} onClick={requestDelete}><Trash2 size={16} />Excluir</button></aside>}
      {outlineOpen && <MindMapOutline topics={document.topics} rootId={document.map.rootId} selectedId={selectedId} busy={saveState === 'saving'} onClose={() => setOutlineOpen(false)} onSelect={(id) => { selectTopic(id); focusTopic(id) }} onRename={renameTopic} onCreateChild={createChildFor} onMove={moveTopicFromOutline} onReorder={reorderTopicFromOutline} onToggle={toggleTopic} onDelete={(id) => setDeleteTargets([id])} />}
      {detailsOpen && selected && <MindMapPropertiesPanel document={document} selected={selected} selectedConnectionId={selectedConnectionId} advancedEnabled={advancedEnabled} imageUrl={selected.imageAssetId ? assetUrls.get(selected.imageAssetId) : undefined} imageMessage={imageMessage} onClose={() => setDetailsOpen(false)} onTheme={(theme) => commitDocument({ ...document, map: { ...document.map, theme } })} onTopic={updateSelectedTopics} onConnection={updateConnection} onRemoveConnection={removeConnection} onAddLink={addLink} onUploadImage={(file) => { void uploadImage(file) }} />}
      {searchOpen && <aside className="absolute right-3 top-3 z-20 w-[min(24rem,calc(100%-1.5rem))] rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl" aria-label="Buscar no mapa"><div className="mb-3 flex items-center gap-2"><Search size={17} className="text-violet-400" /><strong className="text-sm text-strong">Buscar tópicos e notas</strong><button className="ml-auto rounded-lg p-2 text-slate-400" aria-label="Fechar busca" onClick={() => { setSearchOpen(false); setSearchText('') }}><X size={17} /></button></div><input autoFocus value={searchText} onChange={(event) => { setSearchText(event.target.value); setSearchIndex(0) }} placeholder="Digite um termo" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white" />{normalizedSearch && searchResults.length > 0 && <div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>{searchIndex + 1} de {searchResults.length}</span><div><button className="rounded p-2 hover:bg-slate-800" aria-label="Resultado anterior" onClick={() => { const next = (searchIndex - 1 + searchResults.length) % searchResults.length; setSearchIndex(next); focusTopic(searchResults[next].id) }}>↑</button><button className="rounded p-2 hover:bg-slate-800" aria-label="Próximo resultado" onClick={() => { const next = (searchIndex + 1) % searchResults.length; setSearchIndex(next); focusTopic(searchResults[next].id) }}>↓</button></div></div>}<div className="mt-3 max-h-72 space-y-1 overflow-y-auto">{searchResults.map((topic, index) => <button key={topic.id} className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800 ${index === searchIndex ? 'bg-violet-500/10' : ''}`} onClick={() => { setSearchIndex(index); focusTopic(topic.id) }}><span className="block truncate text-sm text-slate-300">{topicPath(topic)}</span>{normalizedSearch && <span className="text-xs text-violet-300">{searchMatchSource(topic)} · correspondência encontrada</span>}</button>)}{normalizedSearch && !searchResults.length && <p className="py-5 text-center text-sm text-slate-500">Nenhum tópico ou nota encontrado.</p>}</div></aside>}
      {moveOpen && selected && <aside className="absolute inset-x-3 bottom-3 z-30 mx-auto max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:w-96" aria-label="Mover tópico"><div className="mb-3 flex items-center gap-2"><Move size={17} className="text-violet-400" /><strong className="truncate text-sm text-strong">Mover “{selected.text}”</strong><button className="ml-auto rounded-lg p-2 text-slate-400" aria-label="Fechar mover para" onClick={() => setMoveOpen(false)}><X size={17} /></button></div><div className="mb-3 grid grid-cols-3 gap-2"><button className="topic-action bg-slate-800" onClick={() => reorderSelected(-1)}><ArrowUp size={15} />Acima</button><button className="topic-action bg-slate-800" onClick={() => reorderSelected(1)}><ArrowDown size={15} />Abaixo</button><button className="topic-action bg-slate-800" onClick={detachSelected}><Unlink size={15} />Independente</button></div><label className="mb-2 block text-xs text-slate-500">Novo tópico pai<input value={moveSearch} onChange={(event) => setMoveSearch(event.target.value)} placeholder="Pesquisar destino" className="mt-2 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" /></label><div className="max-h-60 space-y-1 overflow-y-auto">{document.topics.filter((topic) => topic.id !== selected.id && canMoveTopic(document.topics, selected.id, topic.id, document.map.rootId) && (!normalizedMoveSearch || topic.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedMoveSearch))).map((topic) => <button key={topic.id} className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800" onClick={() => moveSelected(topic.id)}>{topic.text}</button>)}</div></aside>}
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-500"><span>Tab cria · Enter cria irmão · Shift+arraste seleciona · Alt+↑/↓ reordena</span><span>{document.map.layout === 'manual' ? 'Posição manual' : 'Organização automática'} · {document.topics.length} {document.topics.length === 1 ? 'tópico' : 'tópicos'}</span></footer>
    <MindMapShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    <ConfirmModal open={deleteTargets.length > 0} title={deleteTargets.length > 1 ? 'Excluir ramificações?' : 'Excluir ramificação?'} confirmLabel={deleteTargets.length > 1 ? 'Excluir selecionados' : document.topics.some((topic) => topic.parentId === deleteTargets[0]) ? 'Excluir tópico e filhos' : 'Excluir tópico'} onClose={() => setDeleteTargets([])} onConfirm={removeSelected}><p>{deleteTargets.length > 1 ? `${deleteTargets.length} tópicos selecionados e seus descendentes serão removidos.` : deleteTargets[0] && descendantIds(document.topics, deleteTargets[0]).size ? `Este tópico e ${descendantIds(document.topics, deleteTargets[0]).size} descendente(s) serão removidos.` : 'Este tópico será removido.'} Você pode desfazer enquanto o editor estiver aberto.</p>{deleteTargets.length === 1 && document.topics.some((topic) => topic.parentId === deleteTargets[0]) && <button className="mt-4 min-h-10 w-full rounded-lg border border-amber-500/30 px-3 text-sm font-semibold text-amber-300" onClick={removeSelectedKeepingChildren}>Excluir tópico e manter filhos</button>}</ConfirmModal>
  </main>
}
