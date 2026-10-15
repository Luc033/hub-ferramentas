import { ArrowRight, Layers3, LockKeyhole, Pause, Play } from 'lucide-react'
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
import { useFocusSound } from '../../services/audio/useFocusSound'
import { focusSoundService } from '../../services/audio/focusSoundService'
import { useSettings } from '../../app/providers/SettingsProvider'

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

interface TasksSummary { enabled: boolean; todo: number; doing: number }
interface NotesSummary { enabled: boolean; notes: number; nodes: number }

function ToolCard({ tool, habitSummary, tasksSummary, notesSummary }: { tool: ToolDefinition; habitSummary: HabitSummary | null; tasksSummary: TasksSummary | null; notesSummary: NotesSummary | null }) {
  const clock = useClock()
  const pomodoro = usePomodoro()
  const focusSound = useFocusSound()
  const { settings } = useSettings()
  const Icon = tool.icon
  const available = tool.status === 'available'
  const liveText = tool.widget === 'habits'
    ? habitSummary === null ? 'Carregando dados locais…' : habitSummary.completedToday === null ? `${habitSummary.total} ${habitSummary.total === 1 ? 'hábito cadastrado' : 'hábitos cadastrados'} · histórico legado` : `Hoje: ${habitSummary.completedToday}/${habitSummary.total}`
    : tool.widget === 'timer'
      ? clock.mode !== 'timer' ? 'Nenhum temporizador ativo' : clock.status === 'running' ? `Em execução · ${formatDuration(clock.remainingMs)}` : clock.status === 'paused' ? `Pausado · ${formatDuration(clock.remainingMs)}` : clock.status === 'alarming' ? 'Alarme' : 'Nenhum temporizador ativo'
      : tool.widget === 'pomodoro'
        ? clock.mode === 'pomodoro' && ['ready', 'running', 'paused', 'alarming'].includes(clock.status) ? `${pomodoro.phase === 'focus' ? 'Foco' : pomodoro.phase === 'short-break' ? 'Pausa curta' : 'Pausa longa'} · ${formatDuration(clock.remainingMs)} · ${Math.min(pomodoro.completedInCycle, settings.focusesPerCycle)}/${settings.focusesPerCycle}` : 'Pronto para focar'
        : tool.widget === 'tasks'
          ? tasksSummary === null ? 'Carregando tarefas…' : tasksSummary.enabled ? `${tasksSummary.todo} a fazer · ${tasksSummary.doing} fazendo` : 'Kanban ainda não habilitado'
          : tool.widget === 'notes'
            ? notesSummary === null ? 'Carregando anotações…' : notesSummary.enabled ? `${notesSummary.notes} notas · ${notesSummary.nodes} nós` : 'Área criativa ainda não habilitada'
            : tool.widget === 'sounds'
              ? focusSound.source ? `${focusSound.status === 'playing' ? 'Tocando' : focusSound.status === 'loading' ? 'Conectando' : focusSound.status === 'error' ? 'Falha' : 'Pausado'} · ${focusSound.source.title}` : 'Desligado'
              : null

  return <article className={`app-card group relative flex min-h-80 flex-col overflow-hidden p-6 transition-all ${available ? 'hover:-translate-y-0.5 hover:shadow-xl' : 'opacity-75'}`}>
    {!available && <span className="absolute right-4 top-4 rounded-full bg-slate-700/80 px-3 py-1 text-xs font-semibold text-slate-300">Em breve</span>}
    <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform ${accents[tool.accent]} ${available ? 'group-hover:scale-110' : ''}`}><Icon size={27} /></div>
    <h2 className="mb-2 text-xl font-bold text-strong">{tool.title}</h2>
    <p className="mb-4 flex-grow text-sm leading-relaxed text-slate-400">{tool.description}</p>
    {liveText && <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-300" aria-live="polite"><p>{liveText}</p>{tool.widget === 'habits' && habitSummary?.completedToday !== null && habitSummary && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${habitSummary.total ? (habitSummary.completedToday! / habitSummary.total) * 100 : 0}%` }} /></div>}{tool.widget === 'timer' && clock.mode === 'timer' && ['running', 'paused'].includes(clock.status) && <button className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 font-semibold text-cyan-400 hover:bg-slate-700" onClick={() => { if (clock.status === 'running') clockService.pause(); else { audioService.unlock(); clockService.start() } }}>{clock.status === 'running' ? <><Pause size={13} />Pausar</> : <><Play size={13} />Retomar</>}</button>}{tool.widget === 'pomodoro' && clock.mode === 'pomodoro' && ['running', 'paused'].includes(clock.status) && <button className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 font-semibold text-rose-400 hover:bg-slate-700" onClick={() => { if (clock.status === 'running') pomodoroService.pause(); else { audioService.unlock(); clockService.start() } }}>{clock.status === 'running' ? <><Pause size={13} />Pausar</> : <><Play size={13} />Retomar</>}</button>}{tool.widget === 'sounds' && focusSound.source && <button className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 font-semibold text-blue-400" onClick={() => focusSound.status === 'error' ? focusSoundService.retry() : ['playing', 'loading'].includes(focusSound.status) ? void focusSoundService.pause() : void focusSoundService.resume()}>{['playing', 'loading'].includes(focusSound.status) ? <><Pause size={13} />Pausar</> : <><Play size={13} />{focusSound.status === 'error' ? 'Tentar novamente' : 'Retomar'}</>}</button>}</div>}
    {available ? <Link to={tool.path} className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition-colors ${tool.id === 'timer' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>Abrir Aplicativo <ArrowRight size={17} /></Link>
      : <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-700/50 px-4 py-3 font-medium text-slate-400"><LockKeyhole size={16} />Indisponível</span>}
  </article>
}

export default function HomePage() {
  const [habitSummary, setHabitSummary] = useState<HabitSummary | null>(null)
  const [tasksSummary, setTasksSummary] = useState<TasksSummary | null>(null)
  const [notesSummary, setNotesSummary] = useState<NotesSummary | null>(null)
  const { todayKey, revision } = useBrowserRefresh()
  useEffect(() => {
    const load = async () => {
      try {
        const info = await habitsRepository.initialize()
        const habits = await habitsRepository.getAll()
        if (!info.supportsDatedCheckins) { setHabitSummary({ total: habits.length, completedToday: null }); return }
        const checkins = await habitsRepository.getCheckins(todayKey, todayKey)
        const habitIds = new Set(habits.map((habit) => habit.id))
        setHabitSummary({ total: habits.length, completedToday: checkins.filter((checkin) => habitIds.has(checkin.habitId)).length })
      } catch { setHabitSummary({ total: 0, completedToday: null }) }
    }
    void load()
    return habitsRepository.subscribe(() => { void load() })
  }, [todayKey, revision])
  useEffect(() => {
    const load = async () => { try { const enabled = await notesRepository.isEnabled(); if (!enabled) { setNotesSummary({ enabled, notes: 0, nodes: 0 }); return } const [notes, nodes] = await Promise.all([notesRepository.getNotes(), notesRepository.getNodes()]); setNotesSummary({ enabled, notes: notes.length, nodes: nodes.length }) } catch { setNotesSummary({ enabled: false, notes: 0, nodes: 0 }) } }
    void load(); return notesRepository.subscribe(() => { void load() })
  }, [revision])
  useEffect(() => {
    const load = async () => {
      try {
        const enabled = await tasksRepository.isEnabled()
        const tasks = enabled ? await tasksRepository.getAll() : []
        setTasksSummary({ enabled, todo: tasks.filter((task) => task.status === 'todo').length, doing: tasks.filter((task) => task.status === 'doing').length })
      } catch { setTasksSummary({ enabled: false, todo: 0, doing: 0 }) }
    }
    void load()
    return tasksRepository.subscribe(() => { void load() })
  }, [revision])

  return <PageShell>
    <header className="mb-10 pt-4 text-center md:pt-8 md:text-left">
      <div className="mb-4 inline-flex items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-indigo-400"><Layers3 size={28} /></div>
      <h1 className="mb-3 text-3xl font-bold text-strong md:text-4xl">Hub de Ferramentas</h1>
      <p className="mx-auto max-w-2xl text-lg text-slate-400 md:mx-0">Centralize sua produtividade. Acesse seus aplicativos integrados em um único lugar.</p>
    </header>
    <section aria-label="Ferramentas" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">{toolRegistry.map((tool) => <ToolCard key={tool.id} tool={tool} habitSummary={habitSummary} tasksSummary={tasksSummary} notesSummary={notesSummary} />)}</section>
  </PageShell>
}
