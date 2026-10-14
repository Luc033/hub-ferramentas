import { Link2, NotebookPen, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { downloadBackup } from '../../services/backup/backupService'
import { notesRepository } from '../../services/db/notesRepository'
import type { Board, MindEdge, MindNode, Note } from './types'
import { MindMapBoard, type GraphHistory } from './MindMapBoard'

function NotesView({ notes, reload }: { notes: Note[]; reload: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null)
  const selected = notes.find((note) => note.id === selectedId) ?? null
  const [draft, setDraft] = useState<Note | null>(selected)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  useEffect(() => { setDraft(selected) }, [selected?.id])
  useEffect(() => {
    if (!draft || (selected && draft.title === selected.title && draft.content === selected.content)) return
    setSaveState('saving')
    const timer = setTimeout(() => { notesRepository.saveNote(draft).then(() => { setSaveState('saved'); void reload() }).catch(() => setSaveState('error')) }, 500)
    return () => clearTimeout(timer)
  }, [draft, selected, reload])

  const create = async () => { const note = await notesRepository.createNote(); await reload(); setSelectedId(note.id); setDraft(note) }
  return <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
    <aside className="app-card p-4"><Button className="mb-4 w-full" onClick={() => { void create() }}><Plus size={17} />Nova nota</Button><div className="space-y-2">{notes.map((note) => <button key={note.id} onClick={() => setSelectedId(note.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === note.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-900/60'}`}><strong className="block truncate text-sm text-white">{note.title || 'Sem título'}</strong><span className="mt-1 block truncate text-xs text-slate-500">{note.content || 'Nota vazia'}</span></button>)}{!notes.length && <p className="py-8 text-center text-sm text-slate-500">Comece uma anotação</p>}</div></aside>
    <section className="app-card min-h-[520px] p-5">{draft ? <><div className="mb-4 flex flex-wrap items-center gap-3"><input aria-label="Título da nota" maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Título opcional" className="min-h-11 min-w-48 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 text-lg font-semibold text-white" /><button title="Criar nó no mapa" onClick={() => { const text = (draft.title || draft.content).trim().slice(0, 200); if (text) void notesRepository.createNode(text, 360, 220).then(() => window.alert('Nó criado no mapa sem apagar a nota.')) }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 text-sm font-semibold text-violet-300"><Link2 size={16} />Criar nó</button><button aria-label="Excluir nota" onClick={() => { if (window.confirm('Excluir esta nota?')) void notesRepository.deleteNote(draft.id).then(async () => { setSelectedId(null); await reload() }) }} className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400"><Trash2 size={18} /></button></div><textarea aria-label="Conteúdo da nota" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Escreva em texto simples…" className="min-h-[390px] w-full resize-y rounded-xl border border-slate-700 bg-slate-900 p-4 leading-relaxed text-white" /><p className={`mt-3 text-xs ${saveState === 'error' ? 'text-red-400' : 'text-slate-500'}`}>{saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Falha ao salvar' : 'Salvo'}</p></> : <div className="grid h-full min-h-[460px] place-items-center text-center text-slate-500"><div><NotebookPen className="mx-auto mb-3" size={36} /><p>Crie ou selecione uma nota.</p></div></div>}</section>
  </div>
}

export default function NotesPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'notes' | 'board'>('notes')
  const [notes, setNotes] = useState<Note[]>([]); const [nodes, setNodes] = useState<MindNode[]>([]); const [edges, setEdges] = useState<MindEdge[]>([]); const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const graphHistory = useRef<GraphHistory>({ past: [], future: [] })
  const load = useCallback(async () => { try { const active = await notesRepository.isEnabled(); setEnabled(active); if (active) { const [nextNotes, nextNodes, nextEdges, nextBoard] = await Promise.all([notesRepository.getNotes(), notesRepository.getNodes(), notesRepository.getEdges(), notesRepository.getBoard()]); setNotes(nextNotes); setNodes(nextNodes); setEdges(nextEdges); setBoard(nextBoard) } } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao abrir Anotações.') } }, [])
  useEffect(() => { void load(); return notesRepository.subscribe(() => { void load() }) }, [load])
  const enable = async () => { try { await downloadBackup(); if (!window.confirm('Backup baixado. Criar as stores de notas e mapa sem alterar seus dados atuais?')) return; await notesRepository.enable(); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível habilitar Anotações.') } }
  return <PageShell><BackToHub aside={<span className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-400"><NotebookPen size={17} />Anotações</span>} /><header className="app-card mb-6 flex flex-wrap items-center justify-between gap-4 p-6"><div><h1 className="text-2xl font-bold text-white md:text-3xl">Anotações e Mapa Mental</h1><p className="mt-1 text-sm text-slate-400">Texto simples e conexões visuais persistidas localmente.</p></div>{enabled && <div className="flex rounded-xl border border-slate-700 bg-slate-900 p-1"><button onClick={() => setTab('notes')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'notes' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Notas</button><button onClick={() => setTab('board')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Mapa</button></div>}</header>{error && <p role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</p>}{enabled === false ? <section className="app-card mx-auto max-w-2xl p-8 text-center"><Save className="mx-auto mb-4 text-violet-400" size={36} /><h2 className="mb-2 text-xl font-bold text-white">Habilitar área criativa</h2><p className="mb-6 text-sm text-slate-400">Um backup será baixado antes da criação das stores `notes`, `boards`, `nodes` e `edges`.</p><Button onClick={() => { void enable() }}><Save size={17} />Backup e habilitar</Button></section> : enabled ? tab === 'notes' ? <NotesView notes={notes} reload={load} /> : board && <MindMapBoard board={board} nodes={nodes} edges={edges} reload={load} history={graphHistory} /> : <p className="text-center text-slate-400">Carregando…</p>}</PageShell>
}
