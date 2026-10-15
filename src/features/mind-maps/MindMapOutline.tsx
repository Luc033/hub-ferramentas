import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { canMoveTopic } from './tree'
import type { MindMapTopic } from './types'

interface Props {
  topics: MindMapTopic[]
  rootId: string
  selectedId: string | null
  busy: boolean
  onClose: () => void
  onSelect: (id: string) => void
  onRename: (id: string, text: string) => void
  onCreateChild: (id: string) => void
  onMove: (id: string, parentId: string | null, index?: number) => void
  onReorder: (id: string, direction: -1 | 1) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function MindMapOutline({ topics, rootId, selectedId, busy, onClose, onSelect, onRename, onCreateChild, onMove, onReorder, onToggle, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const treeRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (editingId && !topics.some(({ id }) => id === editingId)) setEditingId(null) }, [editingId, topics])
  useEffect(() => { if (selectedId) treeRef.current?.querySelector<HTMLElement>(`[data-outline-id="${selectedId}"]`)?.scrollIntoView?.({ block: 'nearest' }) }, [selectedId])
  const ordered = useMemo(() => {
    const result: Array<{ topic: MindMapTopic; depth: number }> = []
    const visit = (parentId: string | null, depth: number) => topics.filter((topic) => topic.parentId === parentId).sort((a, b) => a.order - b.order).forEach((topic) => { result.push({ topic, depth }); if (!topic.collapsed) visit(topic.id, depth + 1) })
    const root = topics.find(({ id }) => id === rootId); if (root) { result.push({ topic: root, depth: 0 }); if (!root.collapsed) visit(root.id, 1) }
    topics.filter((topic) => topic.parentId === null && topic.id !== rootId).sort((a, b) => a.order - b.order).forEach((topic) => { result.push({ topic, depth: 0 }); if (!topic.collapsed) visit(topic.id, 1) })
    return result
  }, [rootId, topics])
  const saveRename = (topic: MindMapTopic) => { const text = draft.trim(); if (text && text !== topic.text) onRename(topic.id, text.slice(0, 500)); setEditingId(null) }
  return <aside className="absolute bottom-3 left-3 top-3 z-30 w-[min(27rem,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl" aria-label="Outline do mapa">
    <div className="mb-3 flex items-center gap-2"><strong className="text-sm text-strong">Outline editável</strong><button className="ml-auto rounded-lg p-2 text-slate-400" aria-label="Fechar Outline" onClick={onClose}><X size={17} /></button></div>
    <p className="mb-3 text-xs text-slate-500">Edite, reordene ou troque o tópico pai sem depender do canvas.</p>
    <div ref={treeRef} role="tree" aria-label="Estrutura do mapa" className="space-y-1">{ordered.map(({ topic, depth }) => {
      const children = topics.filter((item) => item.parentId === topic.id); const selected = topic.id === selectedId
      return <div key={topic.id} data-outline-id={topic.id} role="treeitem" aria-level={depth + 1} aria-selected={selected} className={`rounded-xl border ${selected ? 'border-violet-500/50 bg-violet-500/10' : 'border-transparent hover:bg-slate-800/70'}`} style={{ marginLeft: Math.min(depth, 7) * 14 }}>
        <div className="flex min-h-11 items-center gap-1 p-1">
          <button aria-label={children.length ? topic.collapsed ? `Expandir ${topic.text}` : `Recolher ${topic.text}` : `Sem subtópicos em ${topic.text}`} disabled={!children.length || busy} className="grid min-h-9 min-w-9 place-items-center rounded-lg text-slate-400 disabled:opacity-30" onClick={() => onToggle(topic.id)}>{topic.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
          {editingId === topic.id ? <input autoFocus aria-label={`Editar ${topic.text} no Outline`} maxLength={500} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => saveRename(topic)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setEditingId(null) }} className="min-h-9 min-w-0 flex-1 rounded-lg border border-violet-500 bg-slate-950 px-2 text-sm text-white" /> : <button className="min-h-9 min-w-0 flex-1 truncate rounded-lg px-2 text-left text-sm text-slate-200" onClick={() => onSelect(topic.id)} onDoubleClick={() => { setEditingId(topic.id); setDraft(topic.text) }}>{topic.icon} {topic.text}</button>}
          <button aria-label={`Adicionar subtópico a ${topic.text}`} disabled={busy} className="grid min-h-9 min-w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-700" onClick={() => onCreateChild(topic.id)}><Plus size={15} /></button>
        </div>
        {selected && <div className="grid grid-cols-4 gap-1 border-t border-slate-700/60 p-2 sm:grid-cols-5">
          <button className="topic-action justify-center" disabled={busy || topic.id === rootId} onClick={() => onReorder(topic.id, -1)} aria-label="Mover para cima"><ArrowUp size={14} /></button>
          <button className="topic-action justify-center" disabled={busy || topic.id === rootId} onClick={() => onReorder(topic.id, 1)} aria-label="Mover para baixo"><ArrowDown size={14} /></button>
          <select aria-label="Novo tópico pai" disabled={busy || topic.id === rootId} value={topic.parentId ?? ''} onChange={(event) => onMove(topic.id, event.target.value || null)} className="col-span-2 min-h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300">
            <option value="">Independente</option>{topics.filter((candidate) => candidate.id !== topic.id && canMoveTopic(topics, topic.id, candidate.id, rootId)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.text}</option>)}
          </select>
          <button className="topic-action justify-center text-red-300" disabled={busy || topic.id === rootId} onClick={() => onDelete(topic.id)} aria-label={`Excluir ${topic.text}`}><Trash2 size={14} /></button>
        </div>}
      </div>
    })}</div>
  </aside>
}
