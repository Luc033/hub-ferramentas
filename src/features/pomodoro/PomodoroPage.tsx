import { Coffee, FastForward, Pause, Play, RotateCcw, Square, Timer } from 'lucide-react'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { durationToFlipClockValues, FlipClockDisplay } from '../../components/flip-clock/FlipClockDisplay'
import { audioService } from '../../services/audio/audioService'
import { clockService, shouldConfirmClockReplacement } from '../../services/clock/ClockService'
import { useClock } from '../../services/clock/useClock'
import { pomodoroService } from './pomodoroService'
import { usePomodoro } from './usePomodoro'
import { useSettings } from '../../app/providers/SettingsProvider'

const phaseLabels = { focus: 'Foco', 'short-break': 'Pausa curta', 'long-break': 'Pausa longa' }
const MINUTES_AND_SECONDS = ['minutes', 'seconds'] as const
const FULL_CLOCK = ['hours', 'minutes', 'seconds'] as const

export default function PomodoroPage() {
  const pomodoro = usePomodoro()
  const { settings } = useSettings()
  const clock = useClock()
  const ownsClock = clock.mode === 'pomodoro'
  const running = ownsClock && clock.status === 'running'
  const paused = ownsClock && clock.status === 'paused'
  const phaseDurationMs = (pomodoro.phase === 'focus' ? settings.focusMinutes : pomodoro.phase === 'short-break' ? settings.shortBreakMinutes : settings.longBreakMinutes) * 60_000
  const remaining = ownsClock ? clock.remainingMs : phaseDurationMs
  const displayValues = durationToFlipClockValues(remaining)
  const showHours = (ownsClock ? clock.durationMs : phaseDurationMs) >= 60 * 60_000
  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const start = () => {
    if (shouldConfirmClockReplacement(clock, 'pomodoro') && !window.confirm(`Existe uma sessão ${clock.mode === 'timer' ? 'do Timer' : 'Pomodoro'} configurada. Deseja encerrá-la e iniciar um novo Pomodoro?`)) return
    audioService.unlock(); pomodoroService.start()
  }

  return <PageShell wide={false}>
    <BackToHub aside={<span className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-400"><Timer size={17} />Pomodoro</span>} />
    <section className="app-card relative flex min-h-[620px] flex-col items-center justify-center overflow-hidden p-6 text-center md:p-12">
      <div aria-hidden className={`pointer-events-none absolute left-1/2 top-1/2 h-[110%] w-[110%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px] ${pomodoro.phase === 'focus' ? 'bg-rose-500/10' : 'bg-emerald-500/10'}`} />
      <div className="z-10 mb-6 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 font-semibold text-slate-300">{pomodoro.phase === 'focus' ? <Timer size={18} className="text-rose-400" /> : <Coffee size={18} className="text-emerald-400" />}{phaseLabels[pomodoro.phase]}</div>
      <div className="z-10 mb-7 w-full max-w-lg" aria-live="polite" aria-label="Tempo restante do Pomodoro"><FlipClockDisplay values={displayValues} size="compact" visibleUnits={showHours ? FULL_CLOCK : MINUTES_AND_SECONDS} reducedMotion={reducedMotion} transitionKey={`${clock.status}-${clock.runId ?? pomodoro.phase}-${pomodoro.phase}`} /></div>
      {ownsClock && clock.taskTitle && <div className="z-10 mb-6 inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200"><span className="max-w-xs truncate">{clock.taskTitle}</span><button aria-label="Desvincular tarefa" onClick={() => clockService.clearTask()} className="font-bold">×</button></div>}
      <div className="z-10 mb-8 flex max-w-full flex-wrap justify-center gap-3" aria-label={`Ciclo: ${Math.min(pomodoro.completedInCycle, settings.focusesPerCycle)} de ${settings.focusesPerCycle} focos concluídos`}>{Array.from({ length: settings.focusesPerCycle }, (_, index) => <span key={index} className={`h-3 w-12 rounded-full border ${index < pomodoro.completedInCycle ? 'border-rose-400 bg-rose-500' : 'border-slate-600 bg-slate-800'}`} />)}</div>
      {pomodoro.transitionMessage && <p role="status" className="z-10 mb-6 max-w-md rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{pomodoro.transitionMessage}</p>}
      {pomodoro.taskRecordError && <p role="alert" className="z-10 mb-6 max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">O foco terminou, mas o progresso da tarefa não foi salvo. {pomodoro.taskRecordError} <button className="ml-2 font-bold underline" onClick={() => pomodoroService.dismissTaskRecordError()}>Fechar</button></p>}
      <div className="z-10 flex w-full max-w-xl flex-wrap justify-center gap-3">
        {running ? <Button variant="secondary" onClick={() => pomodoroService.pause()}><Pause size={18} />Pausar</Button> : <Button onClick={paused ? () => { audioService.unlock(); clockService.start() } : start}><Play size={18} />{paused ? 'Retomar' : 'Iniciar'}</Button>}
        <Button variant="secondary" onClick={() => { if (!running || window.confirm('Reiniciar a fase atual?')) { audioService.unlock(); pomodoroService.restart() } }}><RotateCcw size={17} />Reiniciar fase</Button>
        {pomodoro.phase !== 'focus' && <Button variant="secondary" onClick={() => pomodoroService.skipBreak()}><FastForward size={17} />Pular pausa</Button>}
        <Button variant="danger" onClick={() => { if (window.confirm('Encerrar o ciclo Pomodoro atual?')) pomodoroService.endCycle() }}><Square size={16} />Encerrar ciclo</Button>
      </div>
      <p className="z-10 mt-8 text-sm text-slate-400">Focos concluídos hoje: <strong className="text-white">{pomodoroService.completedToday()}</strong></p>
    </section>
  </PageShell>
}
