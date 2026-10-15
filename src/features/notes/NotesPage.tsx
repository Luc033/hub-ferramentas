import { Link2, Map, NotebookPen, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { downloadBackup } from '../../services/backup/backupService'
import { notesRepository } from '../../services/db/notesRepository'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import type { MindMapSummary } from '../mind-maps/types'
import type { Board, MindEdge, MindNode, Note } from './types'
import { MindMapBoard, type GraphHistory } from './MindMapBoard'

const noteContentKey = (note: Note | null) => note ? `${note.id}\u0000${note.title}\u0000${note.content}` : ''

export function NotesView({ notes, reload, active = true }: { notes: Note[]; reload: () => Promise<void>; active?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null)
  const selected = notes.find((note) => note.id === selectedId) ?? null
  const [draft, setDraft] = useState<Note | null>(selected)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [saveError, setSaveError] = useState('')
  const [mapTargets, setMapTargets] = useState<MindMapSummary[] | null>(null)
  const [targetMapId, setTargetMapId] = useState('')
  const [mapNotice, setMapNotice] = useState('')
  const draftRef = useRef<Note | null>(selected)
  const persistedKey = useRef(noteContentKey(selected))
  const pendingKey = useRef('')
  const saveTimer = useRef<number | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(true)

  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => {
    if (!selectedId && notes[0]) setSelectedId(notes[0].id)
  }, [notes, selectedId])
  useEffect(() => {
    setDraft(selected); draftRef.current = selected; persistedKey.current = noteContentKey(selected); pendingKey.current = ''; setSaveState('saved'); setSaveError('')
  }, [selected?.id])

  const queueSave = useCallback((note: Note | null) => {
    if (!note) return saveQueue.current
    const key = noteContentKey(note)
    if (key === persistedKey.current || key === pendingKey.current) return saveQueue.current
    pendingKey.current = key
    if (mounted.current) { setSaveState('saving'); setSaveError('') }
    const operation = saveQueue.current.catch(() => undefined).then(async () => {
      await notesRepository.saveNote(note)
      persistedKey.current = key
      if (pendingKey.current === key) pendingKey.current = ''
      if (mounted.current) {
        if (noteContentKey(draftRef.current) === key) setSaveState('saved')
        else setSaveState('saving')
      }
    }).catch((reason) => {
      if (pendingKey.current === key) pendingKey.current = ''
      if (mounted.current) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar a nota.') }
      throw reason
    })
    saveQueue.current = operation
    return operation
  }, [])

  const flush = useCallback(() => {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null }
    return queueSave(draftRef.current)
  }, [queueSave])

  useEffect(() => {
    if (!draft || noteContentKey(draft) === persistedKey.current) return
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { saveTimer.current = null; void queueSave(draft).then(reload).catch(() => undefined) }, 500)
    return () => { if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null } }
  }, [draft, queueSave, reload])
  useEffect(() => { if (!active) void flush().catch(() => undefined) }, [active, flush])
  useEffect(() => {
    mounted.current = true
    const saveWhenHidden = () => { if (document.visibilityState === 'hidden') void flush().catch(() => undefined) }
    const saveOnPageHide = () => { void flush().catch(() => undefined) }
    document.addEventListener('visibilitychange', saveWhenHidden); window.addEventListener('pagehide', saveOnPageHide)
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', saveWhenHidden); window.removeEventListener('pagehide', saveOnPageHide); void flush().catch(() => undefined) }
  }, [flush])

  const selectNote = async (id: string) => { try { await flush(); setSelectedId(id) } catch { /* mantém o rascunho para nova tentativa */ } }
  const create = async () => { try { await flush(); const note = await notesRepository.createNote(); await reload(); setSelectedId(note.id); setDraft(note) } catch { /* erro já apresentado pelo flush */ } }
  const remove = async () => {
    if (!draft || !window.confirm('Excluir esta nota?')) return
    try { await flush(); await notesRepository.deleteNote(draft.id); setSelectedId(null); setDraft(null); await reload() }
    catch (reason) { if (mounted.current) { setSaveState('error'); setSaveError(reason instanceof Error ? reason.message : 'Não foi possível excluir a nota.') } }
  }
  const chooseMap = async () => {
    try { await flush(); if (!await mindMapsRepository.isEnabled()) throw new Error('Habilite Mapas Mentais e crie um mapa primeiro.'); const maps = await mindMapsRepository.list(); if (!maps.length) throw new Error('Crie um mapa mental antes de transformar esta nota em tópico.'); setMapTargets(maps); setTargetMapId(maps[0].id); setMapNotice('') }
    catch (reason) { setMapNotice(reason instanceof Error ? reason.message : 'Não foi possível abrir os mapas.') }
  }
  const createTopicFromNote = async () => {
    if (!draft || !targetMapId) return
    try { await flush(); await mindMapsRepository.addTopicFromNote(targetMapId, draft.title, draft.content); setMapTargets(null); setMapNotice('Tópico criado sem alterar a nota original.') }
    catch (reason) { setMapNotice(reason instanceof Error ? reason.message : 'Não foi possível criar o tópico.') }
  }
  return <><div className="grid gap-5 lg:grid-cols-[280px_1fr]">
    <aside className="app-card p-4"><Button className="mb-4 w-full" onClick={() => { void create() }}><Plus size={17} />Nova nota</Button><div className="space-y-2">{notes.map((note) => <button key={note.id} onClick={() => { void selectNote(note.id) }} className={`w-full rounded-xl border p-3 text-left ${selectedId === note.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-900/60'}`}><strong className="block truncate text-sm text-white">{note.title || 'Sem título'}</strong><span className="mt-1 block truncate text-xs text-slate-500">{note.content || 'Nota vazia'}</span></button>)}{!notes.length && <p className="py-8 text-center text-sm text-slate-500">Comece uma anotação</p>}</div></aside>
    <section className="app-card min-h-[520px] p-5">{draft ? <><div className="mb-4 flex flex-wrap items-center gap-3"><input aria-label="Título da nota" maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Título opcional" className="min-h-11 min-w-48 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 text-lg font-semibold text-white" /><button title="Criar nó no quadro livre" onClick={() => { const text = (draft.title || draft.content).trim().slice(0, 200); if (text) void notesRepository.createNode(text, 360, 220).then(() => setMapNotice('Nó criado no quadro livre sem alterar a nota.')).catch((reason: Error) => setMapNotice(reason.message)) }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-300"><Link2 size={16} />Quadro livre</button><button title="Criar tópico em um mapa mental" onClick={() => { void chooseMap() }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 text-sm font-semibold text-violet-300"><Map size={16} />Criar tópico</button><button aria-label="Excluir nota" onClick={() => { void remove() }} className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400"><Trash2 size={18} /></button></div>{mapNotice && <p role="status" className="mb-3 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">{mapNotice}</p>}<textarea aria-label="Conteúdo da nota" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Escreva em texto simples…" className="min-h-[390px] w-full resize-y rounded-xl border border-slate-700 bg-slate-900 p-4 leading-relaxed text-white" /><div className={`mt-3 flex items-center gap-3 text-xs ${saveState === 'error' ? 'text-red-400' : 'text-slate-500'}`}><span>{saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? `Falha ao salvar${saveError ? `: ${saveError}` : ''}` : 'Salvo'}</span>{saveState === 'error' && <button className="font-semibold underline" onClick={() => { void flush().then(reload).catch(() => undefined) }}>Tentar novamente</button>}</div></> : <div className="grid h-full min-h-[460px] place-items-center text-center text-slate-500"><div><NotebookPen className="mx-auto mb-3" size={36} /><p>Crie ou selecione uma nota.</p></div></div>}</section>
  </div>
  {mapTargets && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="note-map-title" className="app-card w-full max-w-md p-6"><h2 id="note-map-title" className="text-xl font-bold text-strong">Criar tópico a partir da nota</h2><p className="mt-2 text-sm text-slate-400">O título e o conteúdo serão copiados. A nota original permanecerá intacta.</p><label className="mt-5 block text-sm text-slate-400">Mapa de destino<select autoFocus value={targetMapId} onChange={(event) => setTargetMapId(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-white">{mapTargets.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => setMapTargets(null)}>Cancelar</Button><Button onClick={() => { void createTopicFromNote() }}>Criar tópico</Button></div></section></div>}
  </>
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
  return <PageShell><BackToHub aside={<span className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-400"><NotebookPen size={17} />Anotações</span>} /><header className="app-card mb-6 flex flex-wrap items-center justify-between gap-4 p-6"><div><h1 className="text-2xl font-bold text-white md:text-3xl">Anotações e Mapa Mental</h1><p className="mt-1 text-sm text-slate-400">Notas, mapas hierárquicos e o quadro livre legado, armazenados localmente.</p></div><div className="flex flex-wrap rounded-xl border border-slate-700 bg-slate-900 p-1"><button disabled={!enabled} onClick={() => setTab('notes')} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${tab === 'notes' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Notas</button><Link to="/notes/maps" className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white"><Map size={15} />Mapas mentais</Link><button disabled={!enabled} onClick={() => setTab('board')} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${tab === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Quadro livre</button></div></header>{error && <p role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</p>}{enabled === false ? <section className="app-card mx-auto max-w-2xl p-8 text-center"><Save className="mx-auto mb-4 text-violet-400" size={36} /><h2 className="mb-2 text-xl font-bold text-white">Habilitar área criativa</h2><p className="mb-6 text-sm text-slate-400">Um backup será baixado antes da criação das stores `notes`, `boards`, `nodes` e `edges`.</p><Button onClick={() => { void enable() }}><Save size={17} />Backup e habilitar</Button></section> : enabled ? <><div hidden={tab !== 'notes'}><NotesView notes={notes} reload={load} active={tab === 'notes'} /></div>{tab === 'board' && board && <MindMapBoard board={board} nodes={nodes} edges={edges} reload={load} history={graphHistory} />}</> : <p className="text-center text-slate-400">Carregando…</p>}</PageShell>
}
