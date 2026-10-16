import { Bell, BellOff, ChevronDown, ChevronUp, CircleGauge, Clock3, Flag, Focus, Pause, Play, RotateCcw, Square, Target } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useSettings } from '../../app/providers/SettingsProvider'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { audioService } from '../../services/audio/audioService'
import { clockService, formatDuration, shouldConfirmClockReplacement } from '../../services/clock/ClockService'
import { useClock } from '../../services/clock/useClock'
import { notificationsService } from '../../services/notifications/notificationsService'

const presets = [1, 5, 15, 30, 60]
const circumference = 2 * Math.PI * 46
type TimeUnit = 'hours' | 'minutes' | 'seconds'

function splitDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  return { hours: Math.min(99, Math.floor(totalSeconds / 3600)), minutes: Math.floor((totalSeconds % 3600) / 60), seconds: totalSeconds % 60 }
}

function joinDuration(values: Record<TimeUnit, number>) { return (values.hours * 3600 + values.minutes * 60 + values.seconds) * 1000 }
function formatClockTime(timestamp: number | null) { return timestamp === null ? '—' : new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
function formatTotal(milliseconds: number) {
  const minutes = milliseconds / 60_000
  if (Number.isInteger(minutes)) return minutes === 1 ? '1 minuto' : minutes === 60 ? '1 hora' : `${minutes} minutos`
  return formatDuration(milliseconds)
}

function TimeControl({ label, value, max, disabled, prominent = false, onChange }: { label: string; value: number; max: number; disabled: boolean; prominent?: boolean; onChange: (value: number) => void }) {
  const setValue = (next: number) => onChange(Math.min(max, Math.max(0, next)))
  return <div className="flex min-w-0 flex-1 flex-col items-center">
    <div className={`flex w-full flex-col items-center rounded-2xl border border-slate-700/90 bg-slate-950/45 py-1 shadow-inner sm:py-2 ${prominent ? 'max-w-36 md:max-w-44' : 'max-w-24 sm:max-w-28'}`}>
      <button type="button" aria-label={`Aumentar ${label}`} disabled={disabled || value >= max} onClick={() => setValue(value + 1)} className={`flex min-h-9 w-full items-center justify-center text-cyan-400 transition-[color,opacity] hover:text-cyan-200 disabled:opacity-30 ${disabled ? 'invisible' : ''}`}><ChevronUp size={prominent ? 34 : 25} /></button>
      <input aria-label={label} inputMode="numeric" maxLength={2} disabled={disabled} value={String(value).padStart(2, '0')} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setValue(Number(event.target.value.replace(/\D/g, '').slice(-2)) || 0)} className={`timer-digits w-full border-0 bg-transparent px-0 text-center font-mono font-bold text-white outline-none ${prominent ? 'text-5xl sm:text-6xl md:text-7xl' : 'text-4xl sm:text-5xl'}`} />
      <button type="button" aria-label={`Diminuir ${label}`} disabled={disabled || value <= 0} onClick={() => setValue(value - 1)} className={`flex min-h-9 w-full items-center justify-center text-cyan-400 transition-[color,opacity] hover:text-cyan-200 disabled:opacity-30 ${disabled ? 'invisible' : ''}`}><ChevronDown size={prominent ? 34 : 25} /></button>
    </div>
    <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-400 sm:text-sm">{label}</span>
  </div>
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex min-h-28 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/55 p-5 shadow-lg backdrop-blur">
    <span className="shrink-0 text-slate-300">{icon}</span><span className="min-w-0"><span className="block text-sm text-slate-400">{label}</span><strong className="mt-1 block truncate text-lg font-semibold text-white">{value}</strong></span>
  </div>
}

function Toggle({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onClick} className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${checked ? 'border-cyan-300 bg-cyan-500' : 'border-slate-500 bg-slate-800'}`}><span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] ${checked ? 'left-7' : 'left-1'}`} /></button>
}

export default function TimerPage() {
  const state = useClock()
  const { settings, updateSettings } = useSettings()
  const [focusMode, setFocusMode] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const ownsClock = state.mode === 'timer'
  const running = ownsClock && state.status === 'running'
  const paused = ownsClock && state.status === 'paused'
  const finished = ownsClock && state.status === 'alarming'
  const available = !ownsClock || state.status === 'idle' || state.status === 'ready'
  const displayMs = ownsClock ? state.remainingMs : 0
  const units = splitDuration(displayMs)
  const selectedPreset = available && ownsClock && presets.find((preset) => preset * 60_000 === state.durationMs)
  const elapsed = ownsClock ? Math.max(0, state.durationMs - state.remainingMs) : 0
  const progress = finished ? 1 : state.durationMs > 0 ? Math.min(1, elapsed / state.durationMs) : 0
  const status = finished ? 'Encerrado' : running ? 'Em andamento' : paused ? 'Pausado' : 'Disponível'
  const statusColor = finished ? 'text-red-400' : paused ? 'text-amber-400' : running ? 'text-cyan-300' : 'text-slate-400'
  const progressColor = finished ? 'text-red-500' : 'text-cyan-400'
  const canRestore = ownsClock && ['running', 'paused', 'alarming'].includes(state.status)

  const replaceDuration = (milliseconds: number) => {
    if (shouldConfirmClockReplacement(state, 'timer') && !window.confirm(`${state.mode === 'pomodoro' ? 'O Pomodoro' : 'O temporizador'} possui uma sessão ${state.status === 'paused' ? 'pausada' : 'ativa'}. Deseja substituí-la?`)) return
    clockService.configureDuration(milliseconds, 'timer')
  }
  const changeUnit = (unit: TimeUnit, value: number) => replaceDuration(joinDuration({ ...units, [unit]: value }))
  const startOrToggle = () => {
    if (finished) { clockService.stopAlarm(); return }
    if (running) { clockService.pause(); return }
    audioService.unlock(); clockService.start()
  }
  const toggleNotifications = async () => {
    setNotificationMessage('')
    if (settings.notificationsEnabled) { updateSettings({ notificationsEnabled: false }); return }
    const permission = notificationsService.permission() === 'granted' ? 'granted' : await notificationsService.requestPermission()
    if (permission === 'granted') updateSettings({ notificationsEnabled: true })
    else setNotificationMessage(permission === 'denied' ? 'As notificações estão bloqueadas nas configurações do navegador.' : 'Este navegador não oferece notificações.')
  }

  return <PageShell wide>
    <BackToHub aside={<span className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 font-semibold text-cyan-400"><Clock3 size={20} />Temporizador</span>} />
    <section data-focus-mode={focusMode} className={`timer-page relative overflow-hidden px-4 py-7 sm:px-7 lg:px-10 ${focusMode ? 'min-h-[calc(100vh-10rem)]' : ''}`}>
      <div aria-hidden className={`pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full blur-[120px] ${finished ? 'bg-red-500/15' : 'bg-cyan-500/10'}`} />
      <div className={`relative grid items-center gap-5 ${focusMode ? 'min-h-[calc(100vh-15rem)] place-items-center' : 'xl:grid-cols-[minmax(12rem,1fr)_minmax(27rem,31rem)_minmax(12rem,1fr)]'}`}>
        {!focusMode && <div className="order-2 grid gap-4 sm:grid-cols-2 xl:order-1 xl:grid-cols-1"><InfoCard icon={<Target size={38} />} label="Duração total" value={ownsClock && state.durationMs ? formatTotal(state.durationMs) : '—'} /><InfoCard icon={<Clock3 size={38} />} label="Início" value={ownsClock ? formatClockTime(state.startedAt) : '—'} /></div>}
        <div className={`order-1 mx-auto flex w-full flex-col items-center xl:order-2 ${focusMode ? 'max-w-[min(78vh,56rem)]' : 'max-w-[31rem]'}`}>
          <div className={`relative aspect-square w-full ${focusMode ? 'max-w-[min(78vh,56rem)]' : 'max-w-[29rem]'}`}>
            <svg aria-hidden className={`absolute inset-0 h-full w-full -rotate-90 ${progressColor} ${finished ? 'timer-progress-alarm' : ''}`} viewBox="0 0 100 100">
              <defs>
                <linearGradient id="timer-liquid-gradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#67e8f9" /><stop offset=".42" stopColor="#06b6d4" /><stop offset=".72" stopColor="#22d3ee" /><stop offset="1" stopColor="#a5f3fc" /></linearGradient>
                <filter id="timer-liquid-filter" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".025 .11" numOctaves="1" seed="7" result="noise">{running && !reducedMotion && <animate attributeName="baseFrequency" values=".025 .11;.04 .085;.025 .11" dur="2.8s" repeatCount="indefinite" />}</feTurbulence><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.1" xChannelSelector="R" yChannelSelector="B" /><feDropShadow dx="0" dy="0" stdDeviation="1.1" floodColor="#22d3ee" floodOpacity=".8" /></filter>
              </defs>
              <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity=".13" strokeWidth="3" />
              <circle data-testid="timer-progress" cx="50" cy="50" r="46" fill="none" stroke={running ? 'url(#timer-liquid-gradient)' : 'currentColor'} filter={running ? 'url(#timer-liquid-filter)' : undefined} strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} className={`transition-[stroke-dashoffset,stroke] duration-300 ${running ? 'timer-progress-liquid' : ''}`} />
            </svg>
            <div className="absolute inset-[7%] flex flex-col items-center justify-center rounded-full border border-slate-800/80 bg-slate-950/55 px-[7%] shadow-[inset_0_0_60px_rgba(8,145,178,.08)] backdrop-blur-sm">
              <div role="status" className={`flex items-center gap-2 font-semibold ${focusMode ? 'mb-8 text-lg sm:text-xl' : 'mb-5 text-sm sm:text-base'} ${statusColor}`}><span className={`h-2.5 w-2.5 rounded-full bg-current ${running ? 'shadow-[0_0_12px_currentColor]' : ''}`} />{status}</div>
              <div aria-live="polite" aria-label={`Tempo restante: ${formatDuration(displayMs)}`} className="flex w-full items-start justify-center gap-2 sm:gap-3">
                <TimeControl label="HRS" value={units.hours} max={99} disabled={!available} prominent={focusMode} onChange={(value) => changeUnit('hours', value)} />
                <TimeControl label="MIN" value={units.minutes} max={59} disabled={!available} prominent={focusMode} onChange={(value) => changeUnit('minutes', value)} />
                <TimeControl label="SEG" value={units.seconds} max={59} disabled={!available} prominent={focusMode} onChange={(value) => changeUnit('seconds', value)} />
              </div>
            </div>
          </div>
          {ownsClock && state.taskTitle && <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300"><span className="truncate">{state.taskTitle}</span><button aria-label="Desvincular tarefa" onClick={() => clockService.clearTask()} className="font-bold">×</button></div>}
          <div className="mt-5 grid w-full max-w-xl grid-cols-2 gap-3 sm:gap-5">
            <Button variant="secondary" disabled={!canRestore} onClick={() => clockService.restoreConfiguredDuration()} className="py-4 text-base"><RotateCcw size={21} />Reiniciar</Button>
            <Button variant={finished ? 'danger' : 'timer'} disabled={available && displayMs <= 0} onClick={startOrToggle} className="py-4 text-base">{finished ? <><Square size={19} />Encerrar</> : running ? <><Pause size={21} />Pausar</> : <><Play size={21} />{paused ? 'Continuar' : 'Iniciar'}</>}</Button>
          </div>
        </div>
        {!focusMode && <div className="order-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><InfoCard icon={<CircleGauge size={38} />} label="Tempo decorrido" value={ownsClock && state.startedAt !== null ? formatDuration(elapsed) : '—'} /><InfoCard icon={<Flag size={38} />} label="Término previsto" value={running ? formatClockTime(state.endAt) : '—'} /></div>}
      </div>

      {!focusMode && <>
        <div className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">{presets.map((preset) => <button key={preset} disabled={!available} onClick={() => replaceDuration(preset * 60_000)} className={`relative min-h-12 rounded-xl border px-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selectedPreset === preset ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,.12)]' : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-300'}`}>{preset} min{selectedPreset === preset && <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-300">✓</span>}</button>)}</div>
        <div className="relative mt-6 grid gap-4 lg:grid-cols-2">
          <div className="flex min-h-24 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/55 p-5"><Bell size={29} className="shrink-0 text-slate-300" /><div className="min-w-0 flex-1"><strong className="block text-white">Notificação</strong><span className="mt-1 block text-sm text-slate-400">Avise quando o tempo terminar.</span></div><Toggle checked={settings.notificationsEnabled} label="Ativar notificações" onClick={() => { void toggleNotifications() }} /></div>
          <div className="flex min-h-24 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/55 p-5"><Focus size={29} className="shrink-0 text-slate-300" /><div className="min-w-0 flex-1"><strong className="block text-white">Modo foco</strong><span className="mt-1 block text-sm text-slate-400">Oculta informações secundárias.</span></div><Toggle checked={focusMode} label="Ativar modo foco" onClick={() => setFocusMode(true)} /></div>
        </div>
        {notificationMessage && <p role="alert" className="relative mt-3 flex items-center justify-center gap-2 text-center text-sm text-amber-300"><BellOff size={16} />{notificationMessage}</p>}
      </>}
      {focusMode && <button onClick={() => setFocusMode(false)} className="relative mx-auto mt-6 flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-sm font-semibold text-slate-300 hover:text-white"><Focus size={17} />Sair do modo foco</button>}
    </section>
  </PageShell>
}
