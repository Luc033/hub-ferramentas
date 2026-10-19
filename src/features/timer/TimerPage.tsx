import { Bell, BellOff, CircleGauge, Clock3, Flag, Focus, History, Pause, Play, RotateCcw, Square, Target } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useSettings } from '../../app/providers/SettingsProvider'
import { durationToFlipClockValues, FlipClockDisplay, type FlipClockUnit } from '../../components/flip-clock/FlipClockDisplay'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { audioService } from '../../services/audio/audioService'
import { clockService, formatDuration, shouldConfirmClockReplacement } from '../../services/clock/ClockService'
import { useClock } from '../../services/clock/useClock'
import { notificationsService } from '../../services/notifications/notificationsService'
import { TimerProgressRing } from './TimerProgressRing'
import { TimerHistoryPanel } from './TimerHistoryPanel'
import timerLogo from '../../assets/logo-timer.webp'

const presets = [1, 5, 15, 30, 60]
function joinDuration(values: Record<FlipClockUnit, number>) { return (values.hours * 3600 + values.minutes * 60 + values.seconds) * 1000 }
function formatClockTime(timestamp: number | null) { return timestamp === null ? '—' : new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
function formatTotal(milliseconds: number) {
  const minutes = milliseconds / 60_000
  if (Number.isInteger(minutes)) return minutes === 1 ? '1 minuto' : minutes === 60 ? '1 hora' : `${minutes} minutos`
  return formatDuration(milliseconds)
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="timer-info-card flex min-h-28 items-center gap-4 rounded-2xl p-5">
    <span className="timer-info-icon shrink-0">{icon}</span><span className="min-w-0"><span className="timer-info-label block text-sm">{label}</span><strong className="timer-info-value mt-1 block truncate text-lg font-semibold">{value}</strong></span>
  </div>
}

function Toggle({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onClick} className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${checked ? 'border-cyan-300 bg-cyan-500' : 'border-slate-500 bg-slate-800'}`}><span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] ${checked ? 'left-7' : 'left-1'}`} /></button>
}

export default function TimerPage() {
  const state = useClock()
  const { settings, updateSettings } = useSettings()
  const [focusMode, setFocusMode] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const ownsClock = state.mode === 'timer'
  const running = ownsClock && state.status === 'running'
  const paused = ownsClock && state.status === 'paused'
  const finished = ownsClock && state.status === 'alarming'
  const available = !ownsClock || state.status === 'idle' || state.status === 'ready'
  const displayMs = ownsClock ? state.remainingMs : 0
  const units = durationToFlipClockValues(displayMs)
  const selectedPreset = available && ownsClock && presets.find((preset) => preset * 60_000 === state.durationMs)
  const elapsed = ownsClock ? Math.max(0, state.durationMs - state.remainingMs) : 0
  const status = finished ? 'Encerrado' : running ? 'Em andamento' : paused ? 'Pausado' : 'Disponível'
  const statusState = finished ? 'expired' : paused ? 'paused' : running ? 'running' : 'available'
  const canRestore = ownsClock && ['running', 'paused', 'alarming'].includes(state.status)

  useEffect(() => {
    if (!historyOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setHistoryOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [historyOpen])

  const replaceDuration = (milliseconds: number) => {
    if (shouldConfirmClockReplacement(state, 'timer') && !window.confirm(`${state.mode === 'pomodoro' ? 'O Pomodoro' : 'O temporizador'} possui uma sessão ${state.status === 'paused' ? 'pausada' : 'ativa'}. Deseja substituí-la?`)) return
    clockService.configureDuration(milliseconds, 'timer')
  }
  const changeUnit = (unit: FlipClockUnit, value: number) => replaceDuration(joinDuration({ ...units, [unit]: value }))
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
    <BackToHub aside={<div className="flex items-center gap-2"><span className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 font-semibold text-cyan-400"><img src={timerLogo} alt="" className="h-6 w-6 object-contain" />Temporizador</span><button type="button" aria-label="Abrir histórico do timer" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)} className="timer-history-trigger grid h-10 w-10 place-items-center rounded-xl"><History size={20} /></button></div>} />
    {historyOpen && <div data-testid="timer-history-dropdown" className="fixed inset-0 z-50 bg-slate-950/30 p-4 sm:p-6" onMouseDown={() => setHistoryOpen(false)}>
      <div className="ml-auto w-full max-w-[30rem] pt-14 sm:pt-16" onMouseDown={(event) => event.stopPropagation()}><TimerHistoryPanel /></div>
    </div>}
    <section data-focus-mode={focusMode} className={`timer-page relative overflow-hidden px-4 py-7 sm:px-7 lg:px-10 ${focusMode ? 'min-h-[calc(100vh-10rem)]' : ''}`}>
      <div aria-hidden className={`timer-page-glow timer-page-glow-${statusState} pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full blur-[120px]`} />
      <div className="relative">
      <div className={`relative grid items-center gap-5 ${focusMode ? 'min-h-[calc(100vh-15rem)] place-items-center' : 'xl:grid-cols-[minmax(12rem,1fr)_minmax(27rem,31rem)_minmax(12rem,1fr)]'}`}>
        {!focusMode && <div className="order-2 grid gap-4 sm:grid-cols-2 xl:order-1 xl:grid-cols-1"><InfoCard icon={<Target size={38} />} label="Duração total" value={ownsClock && state.durationMs ? formatTotal(state.durationMs) : '—'} /><InfoCard icon={<Clock3 size={38} />} label="Início" value={ownsClock ? formatClockTime(state.startedAt) : '—'} /></div>}
        <div className={`order-1 mx-auto flex w-full flex-col items-center xl:order-2 ${focusMode ? 'max-w-[min(78vh,56rem)]' : 'max-w-[31rem]'}`}>
          <div className={`relative aspect-square w-full ${focusMode ? 'max-w-[min(78vh,56rem)]' : 'max-w-[29rem]'}`}>
            <TimerProgressRing status={ownsClock ? state.status : 'idle'} durationMs={ownsClock ? state.durationMs : 0} remainingMs={displayMs} endAt={ownsClock ? state.endAt : null} reducedMotion={reducedMotion} />
            <div className="timer-center-surface absolute inset-[7%] flex flex-col items-center justify-center rounded-full px-[7%]">
              <div role="status" className={`timer-status timer-status-${statusState} flex items-center gap-2 font-semibold ${focusMode ? 'mb-8 text-lg sm:text-xl' : 'mb-5 text-sm sm:text-base'}`}><span className={`h-2.5 w-2.5 rounded-full bg-current ${running ? 'timer-status-dot-active' : ''}`} />{status}</div>
              <div aria-live="polite" aria-label={`Tempo restante: ${formatDuration(displayMs)}`} className="w-full">
                <FlipClockDisplay values={units} disabled={!available} size={focusMode ? 'prominent' : 'regular'} reducedMotion={reducedMotion} transitionKey={`${state.status}-${state.runId ?? 'configured'}`} onChange={changeUnit} />
              </div>
            </div>
          </div>
          {ownsClock && state.taskTitle && <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300"><span className="truncate">{state.taskTitle}</span><button aria-label="Desvincular tarefa" onClick={() => clockService.clearTask()} className="font-bold">×</button></div>}
          <div className="mt-5 grid w-full max-w-xl grid-cols-2 gap-3 sm:gap-5">
            <Button variant="secondary" disabled={!canRestore} onClick={() => clockService.restoreConfiguredDuration()} className="timer-action-secondary py-4 text-base"><RotateCcw size={21} />Reiniciar</Button>
            <Button variant={finished ? 'danger' : 'timer'} disabled={available && displayMs <= 0} onClick={startOrToggle} className="py-4 text-base">{finished ? <><Square size={19} />Encerrar</> : running ? <><Pause size={21} />Pausar</> : <><Play size={21} />{paused ? 'Continuar' : 'Iniciar'}</>}</Button>
          </div>
        </div>
        {!focusMode && <div className="order-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><InfoCard icon={<CircleGauge size={38} />} label="Tempo decorrido" value={ownsClock && state.startedAt !== null ? formatDuration(elapsed) : '—'} /><InfoCard icon={<Flag size={38} />} label="Término previsto" value={running ? formatClockTime(state.endAt) : '—'} /></div>}
      </div>

      {!focusMode && <>
        <div className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">{presets.map((preset) => <button key={preset} disabled={!available} onClick={() => replaceDuration(preset * 60_000)} className={`timer-preset ${selectedPreset === preset ? 'timer-preset-selected' : ''}`}>{preset} min{selectedPreset === preset && <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2">✓</span>}</button>)}</div>
        <div className="relative mt-6 grid gap-4 lg:grid-cols-2">
          <div className="timer-setting-card flex min-h-24 items-center gap-4 rounded-2xl p-5"><Bell size={29} className="timer-info-icon shrink-0" /><div className="min-w-0 flex-1"><strong className="timer-info-value block">Notificação</strong><span className="timer-info-label mt-1 block text-sm">Avise quando o tempo terminar.</span></div><Toggle checked={settings.notificationsEnabled} label="Ativar notificações" onClick={() => { void toggleNotifications() }} /></div>
          <div className="timer-setting-card flex min-h-24 items-center gap-4 rounded-2xl p-5"><Focus size={29} className="timer-info-icon shrink-0" /><div className="min-w-0 flex-1"><strong className="timer-info-value block">Modo foco</strong><span className="timer-info-label mt-1 block text-sm">Oculta informações secundárias.</span></div><Toggle checked={focusMode} label="Ativar modo foco" onClick={() => setFocusMode(true)} /></div>
        </div>
        {notificationMessage && <p role="alert" className="relative mt-3 flex items-center justify-center gap-2 text-center text-sm text-amber-300"><BellOff size={16} />{notificationMessage}</p>}
      </>}
      {focusMode && <button onClick={() => setFocusMode(false)} className="relative mx-auto mt-6 flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-sm font-semibold text-slate-300 hover:text-white"><Focus size={17} />Sair do modo foco</button>}
      </div>
    </section>
  </PageShell>
}
