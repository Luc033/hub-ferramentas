import { ArrowRight, Layers3, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PageShell } from '../../components/layout/PageShell'
import { toolRegistry, type ToolDefinition } from '../../app/toolRegistry'
import { habitsRepository } from '../../services/db/habitsRepository'
import { useClock } from '../../services/clock/useClock'
import { formatDuration } from '../../services/clock/ClockService'

const accents = {
  emerald: 'bg-emerald-500/10 text-emerald-400 group-hover:border-emerald-500/50',
  cyan: 'bg-cyan-500/10 text-cyan-400 group-hover:border-cyan-500/50',
  rose: 'bg-rose-500/10 text-rose-400',
  amber: 'bg-amber-500/10 text-amber-400',
  violet: 'bg-violet-500/10 text-violet-400',
  blue: 'bg-blue-500/10 text-blue-400',
}

function ToolCard({ tool, habitCount }: { tool: ToolDefinition; habitCount: number | null }) {
  const clock = useClock()
  const Icon = tool.icon
  const available = tool.status === 'available'
  const liveText = tool.widget === 'habits'
    ? habitCount === null ? 'Carregando dados locais…' : `${habitCount} ${habitCount === 1 ? 'hábito cadastrado' : 'hábitos cadastrados'}`
    : tool.widget === 'timer'
      ? clock.status === 'running' ? `Em execução · ${formatDuration(clock.remainingMs)}` : clock.status === 'paused' ? `Pausado · ${formatDuration(clock.remainingMs)}` : clock.status === 'alarming' ? 'Alarme' : 'Nenhum temporizador ativo'
      : null

  return <article className={`app-card group relative flex min-h-80 flex-col overflow-hidden p-6 transition-all ${available ? 'hover:-translate-y-0.5 hover:shadow-xl' : 'opacity-75'}`}>
    {!available && <span className="absolute right-4 top-4 rounded-full bg-slate-700/80 px-3 py-1 text-xs font-semibold text-slate-300">Em breve</span>}
    <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform ${accents[tool.accent]} ${available ? 'group-hover:scale-110' : ''}`}><Icon size={27} /></div>
    <h2 className="mb-2 text-xl font-bold text-strong">{tool.title}</h2>
    <p className="mb-4 flex-grow text-sm leading-relaxed text-slate-400">{tool.description}</p>
    {liveText && <p className="mb-4 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-300" aria-live="polite">{liveText}</p>}
    {available ? <Link to={tool.path} className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition-colors ${tool.id === 'timer' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>Abrir Aplicativo <ArrowRight size={17} /></Link>
      : <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-700/50 px-4 py-3 font-medium text-slate-400"><LockKeyhole size={16} />Indisponível</span>}
  </article>
}

export default function HomePage() {
  const [habitCount, setHabitCount] = useState<number | null>(null)
  useEffect(() => {
    const load = () => habitsRepository.initialize().then(() => habitsRepository.getAll()).then((habits) => setHabitCount(habits.length)).catch(() => setHabitCount(0))
    void load()
    return habitsRepository.subscribe(() => { void load() })
  }, [])

  return <PageShell>
    <header className="mb-10 pt-4 text-center md:pt-8 md:text-left">
      <div className="mb-4 inline-flex items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-indigo-400"><Layers3 size={28} /></div>
      <h1 className="mb-3 text-3xl font-bold text-strong md:text-4xl">Hub de Ferramentas</h1>
      <p className="mx-auto max-w-2xl text-lg text-slate-400 md:mx-0">Centralize sua produtividade. Acesse seus aplicativos integrados em um único lugar.</p>
    </header>
    <section aria-label="Ferramentas" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">{toolRegistry.map((tool) => <ToolCard key={tool.id} tool={tool} habitCount={habitCount} />)}</section>
  </PageShell>
}
