import { CalendarDays, ChevronLeft, ChevronRight, Clock3, History, Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { clockService, type TimerHistoryRecord } from '../../services/clock/ClockService'

function localDay(timestamp: number) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function sameDay(first: Date, second: Date) { return first.getTime() === second.getTime() }

export function recordsForLocalDay(history: TimerHistoryRecord[], selectedDate: Date) {
  return history.filter((record) => sameDay(localDay(record.finishedAt), selectedDate)).sort((a, b) => b.finishedAt - a.finishedAt)
}

export function formatHistoryDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000))
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

function formatTime(timestamp: number) { return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }

function HistoryRow({ record }: { record: TimerHistoryRecord }) {
  return <li className="timer-history-row grid grid-cols-[minmax(0,1fr)_3.3rem_3.3rem_3.8rem] items-center gap-2 rounded-xl px-3 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_4rem_4rem_4.3rem] sm:text-sm">
    <span className="flex min-w-0 items-center gap-2 font-medium text-slate-100"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,.7)]" /><span className="truncate" title={record.title}>{record.title}</span></span>
    <span className="text-center text-slate-300">{formatTime(record.startedAt)}</span>
    <span className="text-center text-slate-300">{formatTime(record.finishedAt)}</span>
    <strong className="text-right font-medium text-cyan-200">{formatHistoryDuration(record.durationMs)}</strong>
  </li>
}

export function TimerHistoryPanel() {
  const today = useMemo(() => localDay(Date.now()), [])
  const [selectedDate, setSelectedDate] = useState(today)
  const history = clockService.getHistory()
  const records = useMemo(() => recordsForLocalDay(history, selectedDate), [history, selectedDate])
  const total = records.reduce((sum, record) => sum + record.durationMs, 0)
  const canGoForward = selectedDate.getTime() < today.getTime()
  const changeDay = (amount: number) => setSelectedDate((current) => {
    const next = new Date(current)
    next.setDate(next.getDate() + amount)
    return next > today ? today : next
  })

  return <aside className="timer-history-panel w-full rounded-2xl p-4 sm:p-5" aria-label="Histórico do timer">
    <div className="mb-5 flex items-center gap-3"><span className="timer-history-heading-icon grid h-10 w-10 place-items-center rounded-xl"><History size={21} /></span><h2 className="text-lg font-semibold text-slate-100">Histórico do timer</h2></div>
    <div className="mb-4 grid grid-cols-[2.9rem_minmax(0,1fr)_2.9rem] gap-2">
      <button type="button" className="timer-history-date-button" onClick={() => changeDay(-1)} aria-label="Dia anterior"><ChevronLeft /></button>
      <div className="timer-history-date flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-center font-medium text-slate-200"><CalendarDays size={18} className="shrink-0 text-cyan-300" /><time dateTime={selectedDate.toISOString().slice(0, 10)}>{selectedDate.toLocaleDateString('pt-BR')}</time></div>
      <button type="button" className="timer-history-date-button" onClick={() => changeDay(1)} disabled={!canGoForward} aria-label="Próximo dia"><ChevronRight /></button>
    </div>
    <div className="timer-history-total mb-4 rounded-2xl p-4">
      <span className="block text-xs font-semibold uppercase tracking-[.13em] text-sky-200">Tempo total do dia</span>
      <div className="mt-2 flex items-center gap-3"><Clock3 className="text-cyan-400" size={33} /><strong className="timer-history-total-value">{formatHistoryDuration(total)}</strong></div>
    </div>
    <div className="timer-history-table-label grid grid-cols-[minmax(0,1fr)_3.3rem_3.3rem_3.8rem] gap-2 px-3 pb-2 text-xs font-medium text-sky-200 sm:grid-cols-[minmax(0,1fr)_4rem_4rem_4.3rem]"><span>Timer</span><span className="text-center">Início</span><span className="text-center">Fim</span><span className="text-right">Duração</span></div>
    {records.length ? <ul className="space-y-2">{records.map((record) => <HistoryRow key={record.id} record={record} />)}</ul> : <div className="timer-history-empty rounded-xl px-4 py-8 text-center text-sm text-slate-400"><Timer className="mx-auto mb-2 text-slate-500" size={22} />Não existem timers registrados nesta data.</div>}
    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-400"><span className="mt-0.5 text-cyan-300">ⓘ</span>Os registros são exibidos do mais recente para o mais antigo.</p>
  </aside>
}
