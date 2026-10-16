import { Map, Save } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import notesLogo from '../../assets/logo-mapa.webp'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { downloadBackup } from '../../services/backup/backupService'
import { notesRepository } from '../../services/db/notesRepository'
import { MindMapBoard, type GraphHistory } from './MindMapBoard'
import { NotesView } from './NotesWorkspace'
import type { Board, MindEdge, MindNode, Note } from './types'

export { NotesView } from './NotesWorkspace'

export default function NotesPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'notes' | 'board'>('notes')
  const [notes, setNotes] = useState<Note[]>([]); const [nodes, setNodes] = useState<MindNode[]>([]); const [edges, setEdges] = useState<MindEdge[]>([]); const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState(''); const graphHistory = useRef<GraphHistory>({ past: [], future: [] })
  const load = useCallback(async () => {
    try {
      const active = await notesRepository.isProEnabled(); setEnabled(active)
      if (active) { const [nextNotes, nextNodes, nextEdges, nextBoard] = await Promise.all([notesRepository.getNotes(), notesRepository.getNodes(), notesRepository.getEdges(), notesRepository.getBoard()]); setNotes(nextNotes); setNodes(nextNodes); setEdges(nextEdges); setBoard(nextBoard) }
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao abrir Anotações.') }
  }, [])
  useEffect(() => { void load(); return notesRepository.subscribe(() => { void load() }) }, [load])
  const enable = async () => { try { await downloadBackup(); if (!window.confirm('Backup baixado. Criar as stores profissionais de Anotações sem alterar seus dados atuais?')) return; await notesRepository.enable(); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível habilitar Anotações.') } }

  return <PageShell wide><BackToHub aside={<span className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-400"><img src={notesLogo} alt="" className="h-6 w-6 object-contain" />Anotações</span>} />
    <header className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h1 className="flex items-center gap-3 text-2xl font-bold text-white md:text-3xl"><img src={notesLogo} alt="" className="h-9 w-9 object-contain" />Anotações e Mapa Mental</h1><p className="mt-1 text-sm text-slate-400">Editor por blocos e mapas visuais, armazenados localmente.</p></div><nav aria-label="Seções da ferramenta" className="flex rounded-xl border border-slate-700 bg-slate-900 p-1"><button disabled={!enabled} onClick={() => setTab('notes')} className={`min-h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-40 ${tab === 'notes' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>Anotações</button><Link to="/notes/maps" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-4 text-sm font-semibold text-slate-400 hover:text-white"><Map size={15} />Mapas Mentais</Link><button disabled={!enabled} onClick={() => setTab('board')} className={`min-h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-40 ${tab === 'board' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>Quadro livre</button></nav></header>
    {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200"><span>{error}</span><button className="font-semibold underline" onClick={() => { void load() }}>Tentar novamente</button></div>}
    {enabled === false ? <section className="app-card mx-auto max-w-2xl p-8 text-center"><Save className="mx-auto mb-4 text-violet-400" size={36} /><h2 className="mb-2 text-xl font-bold text-white">Habilitar Anotações Pro</h2><p className="mb-6 text-sm text-slate-400">O Hub exportará um backup antes de adicionar as stores de pastas, etiquetas, imagens e versões. Suas notas atuais serão convertidas de forma idempotente, preservando IDs e datas.</p><Button onClick={() => { void enable() }}><Save size={17} />Backup e habilitar</Button></section> : enabled ? <>{tab === 'notes' && <NotesView notes={notes} reload={load} />}{tab === 'board' && board && <MindMapBoard board={board} nodes={nodes} edges={edges} reload={load} history={graphHistory} />}</> : <div className="app-card animate-pulse p-10 text-center text-slate-400">Carregando armazenamento local…</div>}
  </PageShell>
}
