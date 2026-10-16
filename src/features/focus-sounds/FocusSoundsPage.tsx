import { CloudRain, ExternalLink, ListMusic, Play, Radio, Trash2, Waves, Wind } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { focusSoundService, FLUXFM_STREAM, type FocusSound } from '../../services/audio/focusSoundService'
import { useFocusSound } from '../../services/audio/useFocusSound'
import { focusPlaylistsRepository, loadFocusPlaylistCatalog } from '../../services/db/focusPlaylistsRepository'
import type { FocusPlaylist, PlaylistCategory } from './types'
import { useOnlineStatus } from '../../lib/useOnlineStatus'
import soundsLogo from '../../assets/logo-musica.webp'

const sounds: { id: FocusSound; title: string; description: string; icon: typeof Wind }[] = [
  { id: 'white', title: 'Ruído Branco', description: 'Ruído uniforme para mascarar distrações.', icon: Wind },
  { id: 'rain', title: 'Chuva Sintética', description: 'Textura filtrada semelhante a chuva contínua.', icon: CloudRain },
  { id: 'waves', title: 'Ondas do Mar', description: 'Ruído grave com variação lenta de volume.', icon: Waves },
]
const categories: PlaylistCategory[] = ['Lo-fi', 'Chillhop', 'Jazzhop', 'Outro']

export default function FocusSoundsPage() {
  const state = useFocusSound()
  const online = useOnlineStatus()
  const [playlists, setPlaylists] = useState<FocusPlaylist[]>([])
  const [catalog, setCatalog] = useState<FocusPlaylist[]>([])
  const [url, setUrl] = useState(''); const [category, setCategory] = useState<PlaylistCategory>('Lo-fi')
  const [loading, setLoading] = useState(true); const [catalogLoading, setCatalogLoading] = useState(false); const [adding, setAdding] = useState(false); const [error, setError] = useState('')
  const [retryRemoval, setRetryRemoval] = useState<FocusPlaylist | null>(null)
  const load = useCallback(async () => { try { await focusPlaylistsRepository.initialize(); setPlaylists(await focusPlaylistsRepository.getAll()); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a biblioteca de playlists.') } finally { setLoading(false) } }, [])
  useEffect(() => { void load(); return focusPlaylistsRepository.subscribe(() => { void load() }) }, [load])
  useEffect(() => {
    if (!online) { setCatalog([]); return }
    let cancelled = false; setCatalogLoading(true)
    void loadFocusPlaylistCatalog().then((items) => { if (!cancelled) setCatalog(items) }).finally(() => { if (!cancelled) setCatalogLoading(false) })
    return () => { cancelled = true }
  }, [online])

  const addPlaylist = async (event: FormEvent) => {
    event.preventDefault(); setAdding(true); setError('')
    try { const playlist = await focusPlaylistsRepository.add(url, category); setUrl(''); focusSoundService.playSoundCloud(playlist) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar a playlist.') }
    finally { setAdding(false) }
  }
  const addCatalogPlaylist = async (playlist: FocusPlaylist) => {
    setAdding(true); setError('')
    try { const saved = await focusPlaylistsRepository.add(playlist.url, playlist.category); focusSoundService.playSoundCloud(saved) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar a playlist.') }
    finally { setAdding(false) }
  }
  const removePlaylist = async (playlist: FocusPlaylist, confirm = true) => {
    const active = state.source?.kind === 'soundcloud' && state.source.url === playlist.url
    if (confirm && !window.confirm(active ? 'Esta playlist está tocando. Removê-la encerrará a reprodução. Deseja continuar?' : 'Remover esta playlist da biblioteca?')) return
    if (active) focusSoundService.stop()
    try { await focusPlaylistsRepository.remove(playlist.id); setRetryRemoval(null); setError('') }
    catch (reason) { setRetryRemoval(playlist); setError(reason instanceof Error ? reason.message : 'Não foi possível remover a playlist.') }
  }

  return <PageShell><BackToHub aside={<span className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400"><img src={soundsLogo} alt="" className="h-6 w-6 object-contain" />Sons de Foco</span>} />
    <header className="app-card mb-8 p-6"><h1 className="flex items-center gap-3 text-2xl font-bold text-white md:text-3xl"><img src={soundsLogo} alt="" className="h-9 w-9 object-contain" />Sons de Foco</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">Combine sons gerados no navegador, rádio ao vivo e playlists oficiais incorporadas. Uma única fonte toca por vez e continua durante a navegação interna.</p></header>
    {!online && <div role="status" className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Sem conexão. Os sons ambientes continuam disponíveis; rádio, SoundCloud e validação de novas playlists exigem internet.</div>}
    {(error || state.error) && <div role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><p>{error || state.error}</p><button disabled={!retryRemoval && Boolean(state.error) && !online && state.source?.kind !== 'ambient'} onClick={() => { if (retryRemoval) void removePlaylist(retryRemoval, false); else { setError(''); if (state.error) focusSoundService.retry() } }} className="mt-2 font-semibold underline disabled:cursor-not-allowed disabled:opacity-50">{retryRemoval || state.error ? 'Tentar novamente' : 'Fechar'}</button></div>}

    <section className="mb-9" aria-labelledby="ambient-title"><div className="mb-4"><h2 id="ambient-title" className="text-xl font-bold text-white">Sons Ambientes</h2><p className="mt-1 text-sm text-slate-400">Gerados localmente pela Web Audio API.</p></div><div className="grid gap-4 md:grid-cols-3">{sounds.map((sound) => { const Icon = sound.icon; const active = state.source?.kind === 'ambient' && state.source.id === sound.id; return <article key={sound.id} className={`app-card p-5 ${active ? 'border-blue-500' : ''}`}><Icon className="mb-4 text-blue-400" size={30} /><h3 className="mb-2 font-bold text-white">{sound.title}</h3><p className="mb-5 min-h-12 text-sm text-slate-400">{sound.description}</p><Button className="w-full" variant={active ? 'secondary' : 'brand'} onClick={() => { void focusSoundService.playAmbient(sound.id) }}><Play size={16} />{active ? 'Reiniciar' : 'Reproduzir'}</Button></article> })}</div></section>

    <section className="mb-9" aria-labelledby="radio-title"><div className="mb-4"><h2 id="radio-title" className="text-xl font-bold text-white">Rádios</h2><p className="mt-1 text-sm text-slate-400">Transmissões oficiais reproduzidas diretamente, sem download.</p></div><article className={`app-card flex flex-col gap-5 p-5 md:flex-row md:items-center ${state.source?.kind === 'radio' ? 'border-blue-500' : ''}`}><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-400"><Radio size={28} /></div><div className="min-w-0 flex-1"><span className="text-xs font-semibold uppercase tracking-wide text-blue-400">FluxFM · Rádio ao vivo · Requer internet</span><h3 className="mt-1 text-lg font-bold text-white">FluxFM Chillhop</h3><p className="mt-1 text-sm text-slate-400">Lo-fi e chillhop pelo streaming externo oficial da estação.</p><a href={FLUXFM_STREAM} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 underline">Fonte oficial <ExternalLink size={12} /></a></div><Button disabled={!online} onClick={() => { void focusSoundService.playRadio() }}><Play size={16} />{state.source?.kind === 'radio' ? 'Reconectar' : 'Ouvir rádio'}</Button></article></section>

    <section aria-labelledby="playlists-title"><div className="mb-4"><h2 id="playlists-title" className="text-xl font-bold text-white">Playlists</h2><p className="mt-1 text-sm text-slate-400">Player incorporável e controles oficiais do SoundCloud.</p></div>
      <div className="app-card mb-5 p-5"><div className="mb-4"><h3 className="font-bold text-white">Catálogo validado</h3><p className="mt-1 text-xs text-slate-500">As opções só aparecem após validação pelo oEmbed oficial e não são salvas automaticamente.</p></div>{!online ? <p className="text-sm text-slate-500">Conecte-se à internet para validar o catálogo.</p> : catalogLoading ? <p role="status" className="text-sm text-slate-400">Validando catálogo…</p> : catalog.length ? <div className="grid gap-3 md:grid-cols-2">{catalog.map((playlist) => <article key={playlist.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"><span className="text-xs font-semibold text-blue-400">{playlist.category} · SoundCloud</span><h4 className="mt-1 truncate font-semibold text-white" title={playlist.title}>{playlist.title}</h4><p className="mb-3 truncate text-xs text-slate-500">{playlist.author}</p><div className="flex gap-2"><Button className="flex-1" variant="secondary" onClick={() => focusSoundService.playSoundCloud(playlist)}><Play size={15} />Reproduzir</Button><Button className="flex-1" disabled={adding || playlists.some((item) => item.url === playlist.url)} onClick={() => { void addCatalogPlaylist(playlist) }}>{playlists.some((item) => item.url === playlist.url) ? 'Na biblioteca' : 'Adicionar'}</Button></div></article>)}</div> : <p className="text-sm text-slate-500">Nenhuma playlist do catálogo está incorporável neste momento. Você ainda pode adicionar uma URL pública abaixo.</p>}</div>
      <h3 className="mb-3 font-bold text-white">Minha biblioteca</h3>
      <form onSubmit={(event) => { void addPlaylist(event) }} className="app-card mb-5 grid gap-3 p-5 md:grid-cols-[1fr_170px_auto]"><label className="text-sm text-slate-300"><span className="mb-2 block">URL pública da playlist</span><input type="url" required disabled={!online} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://soundcloud.com/artista/sets/playlist" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-white disabled:cursor-not-allowed disabled:opacity-50" /></label><label className="text-sm text-slate-300"><span className="mb-2 block">Categoria</span><select disabled={!online} value={category} onChange={(event) => setCategory(event.target.value as PlaylistCategory)} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-white disabled:cursor-not-allowed disabled:opacity-50">{categories.map((item) => <option key={item}>{item}</option>)}</select></label><Button className="self-end" type="submit" disabled={adding || !online}>{adding ? 'Validando…' : 'Adicionar'}</Button><p className="text-xs leading-relaxed text-slate-500 md:col-span-3">A URL é validada pelo oEmbed oficial do SoundCloud antes de ser salva no IndexedDB. Playlists privadas, removidas ou sem permissão de incorporação são recusadas.</p></form>
      {loading ? <p role="status" className="py-8 text-center text-slate-400">Carregando biblioteca…</p> : playlists.length ? <div className="grid gap-4 md:grid-cols-2">{playlists.map((playlist) => { const active = state.source?.kind === 'soundcloud' && state.source.url === playlist.url; return <article key={playlist.id} className={`app-card p-5 ${active ? 'border-blue-500' : ''}`}><div className="mb-4 flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-400"><ListMusic size={22} /></div><div className="min-w-0 flex-1"><span className="text-xs font-semibold text-blue-400">{playlist.category} · SoundCloud</span><h3 className="mt-1 truncate font-bold text-white" title={playlist.title}>{playlist.title}</h3><p className="truncate text-xs text-slate-500">{playlist.author}</p></div><button aria-label={`Remover ${playlist.title}`} onClick={() => { void removePlaylist(playlist) }} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"><Trash2 size={16} /></button></div><div className="flex gap-2"><Button disabled={!online} className="flex-1" variant={active ? 'secondary' : 'brand'} onClick={() => focusSoundService.playSoundCloud(playlist)}><Play size={16} />{active ? 'Reiniciar' : 'Reproduzir'}</Button><a aria-label={`Abrir ${playlist.title} no SoundCloud`} href={playlist.url} target="_blank" rel="noreferrer" className="grid min-h-11 w-11 place-items-center rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800"><ExternalLink size={17} /></a></div></article> })}</div> : <div className="app-card p-8 text-center"><ListMusic className="mx-auto mb-3 text-slate-500" size={32} /><h3 className="font-semibold text-white">Sua biblioteca está vazia</h3><p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">Adicione uma playlist pública real do SoundCloud para iniciar a biblioteca. O Hub não cadastra endereços de exemplo que não possam ser validados.</p></div>}
    </section>
    <p className="mt-8 text-xs leading-relaxed text-slate-500">Rádio e SoundCloud dependem de internet, disponibilidade regional e políticas dos provedores. A reprodução exige interação e termina ao fechar ou recarregar o navegador.</p>
  </PageShell>
}
