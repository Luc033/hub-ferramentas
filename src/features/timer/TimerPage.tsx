import { BellOff, Check, Clock3, Pause, Play, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { audioService } from '../../services/audio/audioService'
import { clockService, formatDuration, shouldConfirmClockReplacement } from '../../services/clock/ClockService'
import { useClock } from '../../services/clock/useClock'

const presets = [1, 5, 15, 30, 60]

function TimeInput({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (value: string) => void }) {
  return <label className="flex flex-col items-center gap-1"><input aria-label={label} type="number" min="0" max={max} value={value} placeholder="00" onChange={(event) => onChange(event.target.value)} className="w-16 rounded-xl border border-slate-700 bg-slate-950 px-2 py-3 text-center font-mono text-xl text-white focus:border-transparent md:w-20" /><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span></label>
}

export default function TimerPage() {
  const state = useClock()
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [error, setError] = useState('')
  const ownsClock = state.mode === 'timer'
  const running = ownsClock && state.status === 'running'
  const alarming = ownsClock && state.status === 'alarming'
  const remaining = ownsClock ? state.remainingMs : 0

  const replaceDuration = (milliseconds: number) => {
    if (shouldConfirmClockReplacement(state, 'timer') && !window.confirm(`${state.mode === 'pomodoro' ? 'O Pomodoro' : 'O temporizador'} possui uma sessão ${state.status === 'paused' ? 'pausada' : 'ativa'}. Deseja substituí-la?`)) return
    clockService.setDuration(milliseconds)
    setError('')
  }
  const applyCustom = () => {
    const values = [hours, minutes, seconds].map((value) => value === '' ? 0 : Number(value))
    if (values.some((value) => !Number.isInteger(value) || value < 0) || values[0] > 99 || values[1] > 59 || values[2] > 59) { setError('Use 0–99 horas e 0–59 minutos/segundos.'); return }
    const total = (values[0] * 3600 + values[1] * 60 + values[2]) * 1000
    if (!total) { setError('Informe um tempo maior que zero.'); return }
    replaceDuration(total)
  }
  const toggle = () => {
    if (running) clockService.pause()
    else { audioService.unlock(); clockService.start() }
  }

  return <PageShell wide={false}>
    <BackToHub aside={<span className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-400"><Clock3 size={17} />Temporizador</span>} />
    <section className="app-card relative flex min-h-[620px] flex-col items-center justify-center overflow-hidden p-5 sm:p-8 md:p-12">
      <div aria-hidden className={`pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] ${alarming ? 'animate-pulse bg-red-500/20' : running ? 'bg-amber-500/10' : 'bg-cyan-500/5'}`} />
      <div aria-live="polite" aria-label={`Tempo restante: ${formatDuration(remaining)}`} className={`timer-digits z-10 mb-10 text-center font-mono text-[3.25rem] font-bold leading-none tracking-tight drop-shadow-[0_0_15px_rgba(34,211,238,0.2)] sm:text-[5.5rem] md:text-[7.5rem] ${alarming ? 'text-red-500' : 'text-white'}`}>{formatDuration(remaining)}</div>
      {ownsClock && state.taskTitle && <div className="z-10 -mt-6 mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300"><span className="max-w-xs truncate">{state.taskTitle}</span><button aria-label="Desvincular tarefa" onClick={() => clockService.clearTask()} className="font-bold">×</button></div>}
      {ownsClock && state.taskTitle && state.status === 'idle' && <p className="z-10 -mt-5 mb-7 text-center text-sm text-slate-400">Escolha um preset ou informe a duração para esta tarefa.</p>}
      {alarming ? <Button variant="danger" className="z-10 w-full max-w-sm animate-pulse py-5 text-lg" onClick={() => clockService.stopAlarm()}><BellOff />ENCERRAR ALARME</Button> : <div className="z-10 flex w-full max-w-2xl flex-col gap-8">
        <div className="grid grid-cols-5 gap-2 md:gap-4">{presets.map((preset) => <button key={preset} onClick={() => replaceDuration(preset * 60_000)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 py-3 font-semibold text-slate-300 transition-colors hover:border-cyan-500 hover:bg-slate-700 hover:text-cyan-400">{preset}m</button>)}</div>
        <div className="flex flex-col items-center justify-between gap-5 rounded-2xl border border-slate-700/50 bg-slate-900/50 p-4 md:flex-row">
          <div className="flex items-center gap-2"><TimeInput label="Hrs" value={hours} max={99} onChange={setHours} /><span aria-hidden className="pb-5 text-2xl text-slate-600">:</span><TimeInput label="Min" value={minutes} max={59} onChange={setMinutes} /><span aria-hidden className="pb-5 text-2xl text-slate-600">:</span><TimeInput label="Seg" value={seconds} max={59} onChange={setSeconds} /><button aria-label="Aplicar tempo personalizado" title="Aplicar tempo personalizado" onClick={applyCustom} className="ml-1 rounded-xl border border-slate-700 bg-slate-800 p-3 text-cyan-400 hover:border-cyan-500 hover:bg-slate-700"><Check /></button></div>
          <div className="flex w-full gap-3 md:w-auto"><Button variant="secondary" className="flex-1" onClick={() => { if (state.mode !== 'timer' && state.status !== 'idle' && !window.confirm('Encerrar a sessão Pomodoro ativa?')) return; clockService.reset() }}><RotateCcw size={17} />ZERAR</Button><Button variant={running ? 'secondary' : 'timer'} className="min-w-32 flex-1" disabled={!running && !(ownsClock && ['ready', 'paused'].includes(state.status))} onClick={toggle}>{running ? <><Pause size={18} />PAUSAR</> : <><Play size={18} />{ownsClock && state.status === 'paused' ? 'RETOMAR' : 'INICIAR'}</>}</Button></div>
        </div>
        {error && <p role="alert" className="-mt-5 text-center text-sm font-medium text-red-400">{error}</p>}
        <p className="text-center text-xs text-slate-500">A contagem usa o horário absoluto do dispositivo e continua correta ao trocar de rota ou voltar à aba.</p>
      </div>}
    </section>
  </PageShell>
}
