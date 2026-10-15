import { ArrowRight, Layers3, LockKeyhole, Pause, Play, RotateCcw, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PageShell } from '../../components/layout/PageShell'
import { toolRegistry, type ToolDefinition } from '../../app/toolRegistry'
import { habitsRepository } from '../../services/db/habitsRepository'
import { useClock } from '../../services/clock/useClock'
import { formatDuration } from '../../services/clock/ClockService'
import { clockService } from '../../services/clock/ClockService'
import { audioService } from '../../services/audio/audioService'
import { useBrowserRefresh } from '../../lib/useBrowserRefresh'
import { usePomodoro } from '../pomodoro/usePomodoro'
import { pomodoroService } from '../pomodoro/pomodoroService'
import { tasksRepository } from '../../services/db/tasksRepository'
import { notesRepository } from '../../services/db/notesRepository'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import { useFocusSound } from '../../services/audio/useFocusSound'
import { focusSoundService } from '../../services/audio/focusSoundService'
import { useSettings } from '../../app/providers/SettingsProvider'
import { countTasksCompletedToday, describeLastNoteUpdate } from './widgetSummaries'
import { useOnlineStatus } from '../../lib/useOnlineStatus'

interface HabitSummary {
  total: number
  completedToday: number | null
}

const accents = {
  emerald: 'bg-emerald-500/10 text-emerald-400 group-hover:border-emerald-500/50',
  cyan: 'bg-cyan-500/10 text-cyan-400 group-hover:border-cyan-500/50',
  rose: 'bg-rose-500/10 text-rose-400',
  amber: 'bg-amber-500/10 text-amber-400',
  violet: 'bg-violet-500/10 text-violet-400',
  blue: 'bg-blue-500/10 text-blue-400',
}

export interface TasksSummary { enabled: boolean; total: number; todo: number; doing: number; completedToday: number }
export interface NotesSummary { enabled: boolean; notes: number; nodes: number; maps: number; lastUpdate: string }

export function ToolCard({ tool, habitSummary, tasksSummary, notesSummary, error, onRetry }: { tool: ToolDefinition; habitSummary: HabitSummary | null; tasksSummary: TasksSummary | null; notesSummary: NotesSummary | null; error?: string; onRetry: () => void }) {
  const clock = useClock()
  const pomodoro = usePomodoro()
  const focusSound = useFocusSound()
  const { settings } = useSettings()
  const online = useOnlineStatus()
  const Icon = tool.icon
  const available = tool.status === 'available'
  const liveText = tool.widget === 'habits'
    ? habitSummary === null ? 'Carregando dados locais…' : habitSummary.completedToday === null ? `${habitSummary.total} ${habitSummary.total === 1 ? 'hábito cadastrado' : 'hábitos cadastrados'} · histórico legado` : `Hoje: ${habitSummary.completedToday}/${habitSummary.total}`
    : tool.widget === 'timer'
      ? clock.mode !== 'timer' ? 'Nenhum temporizador ativo' : clock.status === 'running' ? `Em execução · ${formatDuration(clock.remainingMs)}` : clock.status === 'paused' ? `Pausado · ${formatDuration(clock.remainingMs)}` : clock.status === 'alarming' ? 'Alarme' : 'Nenhum temporizador ativo'
      : tool.widget === 'pomodoro'
        ? clock.mode === 'pomodoro' && ['ready', 'running', 'paused', 'alarming'].includes(clock.status) ? `${pomodoro.phase === 'focus' ? 'Foco' : pomodoro.phase === 'short-break' ? 'Pausa curta' : 'Pausa longa'} · ${formatDuration(clock.remainingMs)} · ${Math.min(pomodoro.completedInCycle, settings.focusesPerCycle)}/${settings.focusesPerCycle}` : 'Pronto para focar'
        : tool.widget === 'tasks'
          ? tasksSummary === null ? 'Carregando tarefas…' : tasksSummary.enabled ? tasksSummary.total === 0 ? 'Nenhuma tarefa' : `${tasksSummary.todo} a fazer · ${tasksSummary.doing} fazendo · ${tasksSummary.completedToday} concluída(s) hoje` : 'Kanban ainda não habilitado'
          : tool.widget === 'notes'
            ? notesSummary === null ? 'Carregando anotações…' : notesSummary.enabled ? notesSummary.notes || notesSummary.maps ? `${notesSummary.notes} nota(s) · ${notesSummary.maps} mapa(s) · ${notesSummary.nodes} nós livres · ${notesSummary.lastUpdate}` : 'Comece uma anotação ou crie um mapa' : 'Área criativa ainda não habilitada'
            : tool.widget === 'sounds'
              ? focusSound.source ? `${focusSound.status === 'playing' ? 'Tocando' : focusSound.status === 'loading' ? 'Conectando' : focusSound.status === 'error' ? 'Falha' : 'Pausado'} · ${focusSound.source.title}` : 'Desligado'
              : null

  return <article className={`app-card group relative flex min-h-80 flex-col overflow-hidden p-6 transition-all ${available ? 'hover:-translate-y-0.5 hover:shadow-xl' : 'opacity-75'}`}>
    {!available && <span className="absolute right-4 top-4 rounded-full bg-slate-700/80 px-3 py-1 text-xs font-semibold text-slate-300">Em breve</span>}
    <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform ${accents[tool.accent]} ${available ? 'group-hover:scale-110' : ''}`}><Icon size={27} /></div>
    <h2 className="mb-2 text-xl font-bold text-strong">{tool.title}</h2>
    <p className="mb-4 flex-grow text-sm leading-relaxed text-slate-400">{tool.description}</p>
    {error ? <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"><p>Falha ao carregar os dados locais.</p><button onClick={onRetry} className="mt-2 inline-flex items-center gap-1 font-semibold underline"><RotateCcw size={12} />Tentar novamente</button></div> : liveText && <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-300" aria-live="polite"><p>{liveText}</p>{tool.widget === 'habits' && habitSummary?.completedToday !== null && habitSummary && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${habitSummary.total ? (habitSummary.completedToday! / habitSummary.total) * 100 : 0}%` }} /></div>}{tool.widget === 'timer' && clock.mode === 'timer' && ['running', 'paused'].includes(clock.status) && <button className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 font-semibold text-cyan-400 hover:bg-slate-700" onClick={() => { if (clock.status === 'running') clockService.pause(); else { audioService.unlock(); clockService.start() } }}>{clock.status === 'running' ? <><Pause size={13} />Pausar</> : <><Play size={13} />Retomar</>}</button>}{tool.widget === 'pomodoro' && clock.mode === 'pomodoro' && ['running', 'paused'].includes(clock.status) && <button className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 font-semibold text-rose-400 hover:bg-slate-700" onClick={() => { if (clock.status === 'running') pomodoroService.pause(); else { audioService.unlock(); clockService.start() } }}>{clock.status === 'running' ? <><Pause size={13} />Pausar</> : <><Play size={13} />Retomar</>}</button>}{tool.widget === 'sounds' && focusSound.source && <div className="mt-2 flex flex-wrap gap-2"><button disabled={focusSound.status === 'error' && !online && focusSound.source.kind !== 'ambient'} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 font-semibold text-blue-400 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => focusSound.status === 'error' ? focusSoundService.retry() : ['playing', 'loading'].includes(focusSound.status) ? void focusSoundService.pause() : void focusSoundService.resume()}>{['playing', 'loading'].includes(focusSound.status) ? <><Pause size={13} />Pausar</> : <><Play size={13} />{focusSound.status === 'error' ? 'Tentar novamente' : 'Retomar'}</>}</button><button className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 font-semibold text-slate-400" onClick={() => focusSoundService.stop()}><Square size={12} />Parar</button></div>}</div>}
    {available ? <Link to={tool.path} className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition-colors ${tool.id === 'timer' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>Abrir Aplicativo <ArrowRight size={17} /></Link>
      : <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-700/50 px-4 py-3 font-medium text-slate-400"><LockKeyhole size={16} />Indisponível</span>}
  </article>
}

export default function HomePage() {
  const [habitSummary, setHabitSummary] = useState<HabitSummary | null>(null)
  const [tasksSummary, setTasksSummary] = useState<TasksSummary | null>(null)
  const [notesSummary, setNotesSummary] = useState<NotesSummary | null>(null)
  const [widgetErrors, setWidgetErrors] = useState<Partial<Record<'habits' | 'tasks' | 'notes', string>>>({})
  const [retryRevision, setRetryRevision] = useState({ habits: 0, tasks: 0, notes: 0 })
  const { todayKey, revision } = useBrowserRefresh()
  useEffect(() => {
    const load = async () => {
      try {
        const info = await habitsRepository.initialize()
        const habits = await habitsRepository.getAll()
        if (!info.supportsDatedCheckins) { setHabitSummary({ total: habits.length, completedToday: null }); setWidgetErrors((current) => ({ ...current, habits: undefined })); return }
        const checkins = await habitsRepository.getCheckins(todayKey, todayKey)
        const habitIds = new Set(habits.map((habit) => habit.id))
        setHabitSummary({ total: habits.length, completedToday: checkins.filter((checkin) => habitIds.has(checkin.habitId)).length }); setWidgetErrors((current) => ({ ...current, habits: undefined }))
      } catch (reason) { setHabitSummary(null); setWidgetErrors((current) => ({ ...current, habits: reason instanceof Error ? reason.message : 'Falha ao carregar hábitos.' })) }
    }
    void load()
    return habitsRepository.subscribe(() => { void load() })
  }, [todayKey, revision, retryRevision.habits])
  useEffect(() => {
    const load = async () => { try { const [notesEnabled, mapsEnabled] = await Promise.all([notesRepository.isEnabled(), mindMapsRepository.isEnabled()]); if (!notesEnabled && !mapsEnabled) { setNotesSummary({ enabled: false, notes: 0, nodes: 0, maps: 0, lastUpdate: 'Comece uma anotação' }); setWidgetErrors((current) => ({ ...current, notes: undefined })); return } const [notes, nodes, maps] = await Promise.all([notesEnabled ? notesRepository.getNotes() : [], notesEnabled ? notesRepository.getNodes() : [], mapsEnabled ? mindMapsRepository.list() : []]); const latestMap = maps.length ? Math.max(...maps.map((map) => map.updatedAt)) : 0; const noteText = describeLastNoteUpdate(notes, todayKey); const lastUpdate = latestMap > Math.max(0, ...notes.map((note) => note.updatedAt)) ? `Mapa atualizado ${new Date(latestMap).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}` : noteText; setNotesSummary({ enabled: true, notes: notes.length, nodes: nodes.length, maps: maps.length, lastUpdate }); setWidgetErrors((current) => ({ ...current, notes: undefined })) } catch (reason) { setNotesSummary(null); setWidgetErrors((current) => ({ ...current, notes: reason instanceof Error ? reason.message : 'Falha ao carregar anotações.' })) } }
    void load(); const unsubscribeNotes = notesRepository.subscribe(() => { void load() }); const unsubscribeMaps = mindMapsRepository.subscribe(() => { void load() }); return () => { unsubscribeNotes(); unsubscribeMaps() }
  }, [revision, retryRevision.notes, todayKey])
  useEffect(() => {
    const load = async () => {
      try {
        const enabled = await tasksRepository.isEnabled()
        const tasks = enabled ? await tasksRepository.getAll() : []
        setTasksSummary({ enabled, total: tasks.length, todo: tasks.filter((task) => task.status === 'todo').length, doing: tasks.filter((task) => task.status === 'doing').length, completedToday: countTasksCompletedToday(tasks, todayKey) }); setWidgetErrors((current) => ({ ...current, tasks: undefined }))
      } catch (reason) { setTasksSummary(null); setWidgetErrors((current) => ({ ...current, tasks: reason instanceof Error ? reason.message : 'Falha ao carregar tarefas.' })) }
    }
    void load()
    return tasksRepository.subscribe(() => { void load() })
  }, [revision, retryRevision.tasks, todayKey])

  return <PageShell>
    <header className="mb-10 pt-4 text-center md:pt-8 md:text-left">
      <div className="mb-4 inline-flex items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-indigo-400"><Layers3 size={28} /></div>
      <h1 className="mb-3 text-3xl font-bold text-strong md:text-4xl">Hub de Ferramentas</h1>
      <p className="mx-auto max-w-2xl text-lg text-slate-400 md:mx-0">Centralize sua produtividade. Acesse seus aplicativos integrados em um único lugar.</p>
    </header>
    <section aria-label="Ferramentas" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">{toolRegistry.map((tool) => { const kind = tool.widget === 'habits' || tool.widget === 'tasks' || tool.widget === 'notes' ? tool.widget : null; return <ToolCard key={tool.id} tool={tool} habitSummary={habitSummary} tasksSummary={tasksSummary} notesSummary={notesSummary} error={kind ? widgetErrors[kind] : undefined} onRetry={() => { if (kind) setRetryRevision((current) => ({ ...current, [kind]: current[kind] + 1 })) }} /> })}</section>
  </PageShell>
}
