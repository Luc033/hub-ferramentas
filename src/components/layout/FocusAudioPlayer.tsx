import { Headphones, Pause, Play, RefreshCw, SkipBack, SkipForward, Square, Volume2, VolumeX } from 'lucide-react'
import { useSettings } from '../../app/providers/SettingsProvider'
import { focusSoundService } from '../../services/audio/focusSoundService'
import { SoundCloudWidgetHost } from '../../services/audio/SoundCloudWidgetHost'
import { useFocusSound } from '../../services/audio/useFocusSound'

export function FocusAudioPlayer() {
  const state = useFocusSound(); const { settings, updateSettings } = useSettings()
  if (!state.source) return null
  const source = state.source
  const soundCloud = source.kind === 'soundcloud'
  return <aside aria-label="Miniplayer de Sons de Foco" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-8">
      <Headphones className="shrink-0 text-blue-400" size={22} />
      <div className="min-w-32 flex-1"><strong className="block truncate text-sm text-white">{source.title}</strong><span className="text-xs text-slate-400">{source.provider}{source.kind === 'soundcloud' && ` · ${source.author}`}</span></div>
      {soundCloud && <><button aria-label="Faixa anterior" title="Faixa anterior" onClick={() => focusSoundService.skip('previous')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><SkipBack size={18} /></button><button aria-label="Próxima faixa" title="Próxima faixa" onClick={() => focusSoundService.skip('next')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><SkipForward size={18} /></button></>}
      {state.status === 'error' ? <button onClick={() => focusSoundService.retry()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white"><RefreshCw size={16} />Tentar novamente</button> : state.status === 'playing' || state.status === 'loading' ? <button aria-label="Pausar" onClick={() => { void focusSoundService.pause() }} className="rounded-xl bg-blue-600 p-2.5 text-white"><Pause size={18} /></button> : <button aria-label="Reproduzir" onClick={() => { void focusSoundService.resume() }} className="rounded-xl bg-blue-600 p-2.5 text-white"><Play size={18} /></button>}
      <button aria-label="Parar" onClick={() => focusSoundService.stop()} className="rounded-xl border border-slate-700 p-2.5 text-slate-300 hover:bg-slate-800"><Square size={17} /></button>
      <button role="switch" aria-checked={settings.environmentMuted} aria-label={settings.environmentMuted ? 'Ativar som ambiente' : 'Silenciar som ambiente'} onClick={() => updateSettings({ environmentMuted: !settings.environmentMuted })} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">{settings.environmentMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
      <input aria-label="Volume de Sons de Foco" type="range" min="0" max="100" value={settings.environmentVolume} onChange={(event) => updateSettings({ environmentVolume: Number(event.target.value) })} className="w-24 accent-blue-500 md:w-32" />
      {state.status === 'loading' && <span role="status" className="w-full text-xs text-blue-300">Conectando à fonte…</span>}
      {state.error && <p role="alert" className="w-full text-xs text-red-300">{state.error}</p>}
      {source.kind === 'soundcloud' && <details className="w-full"><summary className="cursor-pointer text-xs font-semibold text-blue-300">Player oficial e créditos do SoundCloud</summary><div className="mt-2 overflow-hidden rounded-xl bg-white"><SoundCloudWidgetHost key={`${source.id}-${state.attempt}`} url={source.url} /></div><a href={source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-blue-300 underline">Abrir a playlist no SoundCloud</a></details>}
    </div>
  </aside>
}
