import { ArrowLeft, Copy, Download, Map, Pencil, Plus, Search, Save, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/Modal'
import { downloadBackup } from '../../services/backup/backupService'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import type { MindMapSummary } from './types'
import { createMindMapFile, downloadBlob, parseMindMapFile, remapMindMapFile, safeFileName } from './mindMapTransfer'

type SortOrder = 'updated' | 'created' | 'name-asc' | 'name-desc'
const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

export default function MindMapsLibraryPage() {
  const navigate = useNavigate()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [maps, setMaps] = useState<MindMapSummary[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOrder>('updated')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<MindMapSummary | null>(null)
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<MindMapSummary | null>(null)

  const load = useCallback(async () => {
    try {
      const active = await mindMapsRepository.isEnabled(); setEnabled(active)
      setMaps(active ? await mindMapsRepository.list() : []); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a biblioteca de mapas.') }
  }, [])
  useEffect(() => { void load(); return mindMapsRepository.subscribe(() => { void load() }) }, [load])

  const visible = useMemo(() => {
    const term = normalizeSearch(search.trim())
    return maps.filter((map) => !term || normalizeSearch(map.name).includes(term)).sort((a, b) => sort === 'updated' ? b.updatedAt - a.updatedAt : sort === 'created' ? b.createdAt - a.createdAt : sort === 'name-asc' ? a.name.localeCompare(b.name, 'pt-BR') : b.name.localeCompare(a.name, 'pt-BR'))
  }, [maps, search, sort])

  const enable = async () => {
    try {
      setBusy(true); await downloadBackup()
      if (!window.confirm('Backup baixado. Criar as stores mindMaps e mindMapTopics sem alterar os dados atuais?')) return
      await mindMapsRepository.enable(); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível habilitar Mapas Mentais.') }
    finally { setBusy(false) }
  }
  const create = async () => {
    try { setBusy(true); const document = await mindMapsRepository.create(); navigate(`/notes/maps/${document.map.id}`, { state: { editRoot: true } }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o mapa.') }
    finally { setBusy(false) }
  }
  const duplicate = async (map: MindMapSummary) => {
    try { setBusy(true); const copy = await mindMapsRepository.duplicate(map.id); navigate(`/notes/maps/${copy.map.id}`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível duplicar o mapa.') }
    finally { setBusy(false) }
  }
  const rename = async () => {
    if (!editing) return
    try { setBusy(true); await mindMapsRepository.rename(editing.id, editName); setEditing(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível renomear o mapa.') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!deleting) return
    try { setBusy(true); await mindMapsRepository.remove(deleting.id); setDeleting(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o mapa.') }
    finally { setBusy(false) }
  }
  const exportMap = async (map: MindMapSummary) => {
    try { setBusy(true); const document = await mindMapsRepository.get(map.id); if (!document) throw new Error('Este mapa não existe mais.'); const file = await createMindMapFile(document, await mindMapsRepository.getAssets(map.id)); downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${safeFileName(map.name)}.hubmap.json`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível exportar o mapa.') } finally { setBusy(false) }
  }
  const importMap = async (file?: File) => {
    if (!file) return
    try {
      setBusy(true); const parsed = parseMindMapFile(await file.text())
      if ((parsed.assets.length || parsed.connections.length) && !await mindMapsRepository.isAdvancedEnabled()) { await downloadBackup(); if (!window.confirm('Backup baixado. Habilitar os recursos visuais necessários para importar este mapa?')) return; await mindMapsRepository.enableAdvanced() }
      const imported = await remapMindMapFile(parsed); await mindMapsRepository.importDocument(imported.document, imported.assets); navigate(`/notes/maps/${imported.document.map.id}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar o mapa.') } finally { setBusy(false) }
  }

  return <PageShell>
    <nav aria-label="Navegação de Mapas Mentais" className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Link to="/notes" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 font-medium text-slate-400 hover:bg-slate-800 hover:text-white"><ArrowLeft size={18} />Anotações e quadro livre</Link>
      <Link to="/" className="text-sm font-semibold text-slate-400 hover:text-white">Voltar ao Hub</Link>
    </nav>
    <header className="app-card mb-6 flex flex-wrap items-end justify-between gap-5 p-6">
      <div><span className="mb-3 inline-flex rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3 text-violet-400"><Map size={25} /></span><h1 className="text-2xl font-bold text-strong md:text-3xl">Mapas Mentais</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Organize ideias em árvores visuais. Tudo fica armazenado somente neste navegador.</p></div>
      {enabled && <div className="flex flex-wrap gap-2"><label className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 font-semibold text-slate-300 ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-slate-700'}`}><Upload size={17} />Importar mapa<input aria-label="Selecionar mapa para importar" className="sr-only" type="file" accept="application/json,.json,.hubmap.json" disabled={busy} onChange={(event) => { void importMap(event.target.files?.[0]); event.currentTarget.value = '' }} /></label><Button disabled={busy} onClick={() => { void create() }}><Plus size={18} />Novo mapa</Button></div>}
    </header>
    {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><span>{error}</span><button className="font-semibold underline" onClick={() => { void load() }}>Tentar novamente</button></div>}
    {enabled === false ? <section className="app-card mx-auto max-w-2xl p-8 text-center"><Save className="mx-auto mb-4 text-violet-400" size={38} /><h2 className="mb-2 text-xl font-bold text-strong">Habilitar Mapas Mentais</h2><p className="mb-6 text-sm leading-relaxed text-slate-400">O Hub baixa um backup antes de criar duas stores novas e independentes. Notas, quadro livre e demais dados permanecem intactos.</p><Button disabled={busy} onClick={() => { void enable() }}><Save size={17} />{busy ? 'Preparando…' : 'Backup e habilitar'}</Button></section> : enabled === null ? <p className="py-12 text-center text-slate-400">Carregando biblioteca…</p> : <>
      <section className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative"><span className="sr-only">Pesquisar mapas</span><Search className="pointer-events-none absolute left-4 top-3.5 text-slate-500" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar pelo nome" className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 pl-11 pr-4 text-white" /></label>
        <select aria-label="Ordenar mapas" value={sort} onChange={(event) => setSort(event.target.value as SortOrder)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-900 px-4 text-slate-200"><option value="updated">Última edição</option><option value="created">Data de criação</option><option value="name-asc">Nome A–Z</option><option value="name-desc">Nome Z–A</option></select>
      </section>
      {visible.length ? <section aria-label="Mapas salvos" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{visible.map((map) => <article key={map.id} className="app-card flex min-h-52 flex-col p-5"><button className="mb-4 flex flex-1 items-start gap-4 text-left" onClick={() => navigate(`/notes/maps/${map.id}`)}><span className="rounded-xl bg-violet-500/10 p-3 text-violet-400"><Map size={22} /></span><span className="min-w-0"><strong title={map.name} className="block truncate text-lg text-strong">{map.name}</strong><span className="mt-2 block text-xs text-slate-500">Editado {new Date(map.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span><span className="mt-1 block text-xs text-slate-400">{map.topicCount} {map.topicCount === 1 ? 'tópico' : 'tópicos'}</span></span></button><div className="flex flex-wrap gap-2 border-t border-slate-700/70 pt-3"><button className="map-card-action" onClick={() => navigate(`/notes/maps/${map.id}`)}>Abrir</button><button aria-label={`Renomear ${map.name}`} className="map-card-action" onClick={() => { setEditing(map); setEditName(map.name) }}><Pencil size={15} /></button><button aria-label={`Duplicar ${map.name}`} className="map-card-action" disabled={busy} onClick={() => { void duplicate(map) }}><Copy size={15} /></button><button aria-label={`Exportar ${map.name}`} className="map-card-action" disabled={busy} onClick={() => { void exportMap(map) }}><Download size={15} /></button><button aria-label={`Excluir ${map.name}`} className="map-card-action ml-auto text-red-400" onClick={() => setDeleting(map)}><Trash2 size={15} /></button></div></article>)}</section> : <section className="app-card py-14 text-center"><Map className="mx-auto mb-4 text-slate-500" size={40} /><h2 className="text-lg font-bold text-strong">{maps.length ? 'Nenhum mapa encontrado' : 'Organize suas ideias em um mapa mental'}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{maps.length ? 'Tente outro termo de pesquisa.' : 'Crie uma árvore de tópicos e continue de onde parou a qualquer momento.'}</p>{!maps.length && <Button className="mt-6" onClick={() => { void create() }}><Plus size={17} />Criar primeiro mapa</Button>}</section>}
    </>}
    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><form className="app-card w-full max-w-md p-6" onSubmit={(event) => { event.preventDefault(); void rename() }}><h2 className="mb-4 text-xl font-bold text-strong">Renomear mapa</h2><label className="text-sm text-slate-400">Nome<input autoFocus maxLength={100} value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-white" onKeyDown={(event) => { if (event.key === 'Escape') setEditing(null) }} /></label><div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button disabled={!editName.trim() || busy}>Salvar</Button></div></form></div>}
    <ConfirmModal open={Boolean(deleting)} title="Excluir mapa?" confirmLabel="Excluir mapa" onClose={() => setDeleting(null)} onConfirm={() => { void remove() }}><p>O mapa <strong>{deleting?.name}</strong> e todos os seus tópicos serão removidos. Notas e o quadro livre não serão alterados.</p></ConfirmModal>
  </PageShell>
}
