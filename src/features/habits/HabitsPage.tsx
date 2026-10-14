import { Archive, BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, Download, Flame, Leaf, ListChecks, Pencil, Plus, Save, Trash2, Upload, Wind } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/Modal'
import { DAYS, toLocalDateKey, weekKeysForOffset, weekRangeLabel } from '../../lib/date'
import { audioService } from '../../services/audio/audioService'
import { downloadBackup, importBackup, parseBackup, type ImportMode } from '../../services/backup/backupService'
import { habitsRepository } from '../../services/db/habitsRepository'
import { datedStreak, datedTotals, legacyStats, weeklyPercentage } from './stats'
import type { Habit, HabitCheckin, HabitDatabaseInfo } from './types'

function WeeklyChart({ totals, habitCount }: { totals: number[]; habitCount: number }) {
  return <div>
    <div className="relative mt-6 flex h-48 items-end justify-between gap-2">
      <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-between opacity-10">{[0, 1, 2, 3].map((line) => <div key={line} className="h-px w-full bg-white" />)}</div>
      {totals.map((total, index) => <div key={DAYS[index]} title={`${total}/${habitCount} hábitos concluídos`} className="group relative z-10 flex h-full flex-1 flex-col items-center justify-end">
        <span className="absolute -top-7 rounded bg-slate-950 px-2 py-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{total}/{habitCount}</span>
        <div className="flex h-full w-full max-w-8 items-end overflow-hidden rounded-t border border-b-0 border-slate-700/50 bg-slate-900"><div className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400 transition-[height] duration-500" style={{ height: `${habitCount ? (total / habitCount) * 100 : 0}%` }} /></div>
      </div>)}
    </div>
    <div className="mt-3 flex justify-between text-xs font-medium text-slate-400">{DAYS.map((day) => <span key={day} className="flex-1 text-center">{day[0]}</span>)}</div>
  </div>
}

function HabitCard({ habit, supportsDates, weekKeys, checkins, history, todayKey, onToggle, onRename, onDelete }: { habit: Habit; supportsDates: boolean; weekKeys: string[]; checkins: HabitCheckin[]; history: HabitCheckin[]; todayKey: string; onToggle: (habit: Habit, index: number) => void; onRename: (habit: Habit, name: string) => Promise<void>; onDelete: (habit: Habit) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(habit.name)
  const saving = useRef(false)
  const datedDays = weekKeys.map((date) => date <= todayKey && checkins.some((item) => item.habitId === habit.id && item.date === date))
  const activeDays = supportsDates ? datedDays : habit.days
  const stats = legacyStats(activeDays)
  const streak = supportsDates ? datedStreak(history, habit.id, todayKey) : null
  const save = async () => {
    if (saving.current) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === habit.name) { setName(habit.name); setEditing(false); return }
    saving.current = true
    try { await onRename(habit, trimmed); setEditing(false) } finally { saving.current = false }
  }

  return <article className="group rounded-2xl border border-slate-700 bg-slate-900/50 p-4 transition-colors hover:border-slate-600 md:p-5">
    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex min-h-8 items-center gap-3">
          {editing ? <><input aria-label="Nome do hábito" autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { void save() }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save() } else if (event.key === 'Escape') { setName(habit.name); setEditing(false) } }} className="w-full max-w-xs rounded-lg border border-indigo-500 bg-slate-950 px-3 py-1 text-white" /><span className="hidden text-xs text-slate-500 sm:inline">Enter para salvar</span></>
            : <><h3 className="max-w-[210px] truncate text-lg font-medium text-white sm:max-w-xs" title={habit.name}>{habit.name}</h3><div className="flex shrink-0 gap-2 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"><button aria-label={`Editar ${habit.name}`} onClick={() => setEditing(true)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-blue-400"><Pencil size={14} /></button><button aria-label={`Excluir ${habit.name}`} onClick={() => onDelete(habit)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-red-400"><Trash2 size={15} /></button></div></>}
        </div>
        <div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full border border-slate-700/50 bg-slate-800"><div className={`h-full rounded-full bg-gradient-to-r ${stats.percentage === 100 ? 'from-emerald-500 to-green-400' : 'from-indigo-600 to-indigo-400'}`} style={{ width: `${stats.percentage}%` }} /></div><span className={`w-9 text-xs font-semibold ${stats.percentage ? 'text-indigo-400' : 'text-slate-500'}`}>{stats.percentage}%</span><span title={supportsDates ? `Sequência atual: ${streak?.current ?? 0}; maior histórica: ${streak?.longest ?? 0}` : 'Maior sequência entre as marcações legadas'} className={`inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs ${(streak?.current ?? stats.longest) ? 'text-orange-400' : 'text-slate-600'}`}><Flame size={11} />{streak?.current ?? stats.longest}</span></div>
        {supportsDates && <p className="mt-2 text-[11px] text-slate-500">Maior sequência histórica: {streak?.longest ?? 0} dia(s).</p>}
        {supportsDates && habit.days.some(Boolean) && <p className="mt-2 text-[11px] text-amber-300/80">Marcações legadas sem data preservadas: {habit.days.filter(Boolean).length}/7.</p>}
      </div>
      <div className="flex w-full justify-between gap-2 px-1 xl:w-auto xl:justify-end md:gap-3 md:px-0">{activeDays.map((checked, index) => { const future = supportsDates && weekKeys[index] > todayKey; return <label key={weekKeys[index]} title={future ? 'Dias futuros não podem ser marcados' : weekKeys[index]} className={`flex flex-col items-center gap-1.5 ${future ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}><input className="sr-only" type="checkbox" checked={checked} disabled={future} onChange={() => onToggle(habit, index)} /><span className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-all md:h-10 md:w-10 ${checked ? 'scale-105 border-emerald-500 bg-emerald-500 text-white' : 'border-slate-600 bg-slate-900 text-slate-700 hover:border-emerald-500'}`}><Check size={16} /></span><span className="text-[10px] font-medium text-slate-500 md:hidden">{DAYS[index][0]}</span></label> })}</div>
    </div>
  </article>
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [checkins, setCheckins] = useState<HabitCheckin[]>([])
  const [history, setHistory] = useState<HabitCheckin[]>([])
  const [info, setInfo] = useState<HabitDatabaseInfo | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Habit | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const todayKey = toLocalDateKey()
  const weekKeys = useMemo(() => weekKeysForOffset(weekOffset), [weekOffset])

  const load = useCallback(async () => {
    try {
      const dbInfo = await habitsRepository.initialize()
      const [allHabits, allCheckins, allHistory] = await Promise.all([habitsRepository.getAll(), habitsRepository.getCheckins(weekKeys[0], weekKeys[6]), dbInfo.supportsDatedCheckins ? habitsRepository.getCheckins() : Promise.resolve([])])
      setInfo(dbInfo); setHabits(allHabits); setCheckins(allCheckins); setHistory(allHistory); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar neste navegador.') }
    finally { setLoading(false) }
  }, [weekKeys])

  useEffect(() => { void load(); return habitsRepository.subscribe(() => { void load() }) }, [load])
  const totals = useMemo(() => info?.supportsDatedCheckins ? datedTotals(habits, checkins, weekKeys, todayKey) : DAYS.map((_, index) => habits.filter((habit) => habit.days[index]).length), [info, habits, checkins, weekKeys, todayKey])
  const percentage = weeklyPercentage(habits.length, totals)

  const addHabit = async (event: FormEvent) => {
    event.preventDefault(); const trimmed = name.trim()
    if (!trimmed) { setError('Digite um nome para o hábito.'); return }
    if (habits.some((habit) => habit.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase()) && !window.confirm('Já existe um hábito com este nome. Deseja adicionar mesmo assim?')) return
    try { await habitsRepository.add(trimmed); setName(''); setNotice('Hábito adicionado.'); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o hábito.') }
  }
  const toggle = async (habit: Habit, index: number) => {
    try {
      const checked = info?.supportsDatedCheckins ? await habitsRepository.toggleDate(habit.id, weekKeys[index]) : await habitsRepository.toggleLegacyDay(habit, index)
      if (checked) {
        const completedBefore = info?.supportsDatedCheckins
          ? checkins.filter((item) => item.habitId === habit.id && weekKeys.includes(item.date)).length
          : habit.days.filter(Boolean).length
        audioService.playCheck(completedBefore + 1 === 7)
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a marcação.') }
  }
  const enableDates = async () => {
    try {
      await downloadBackup()
      if (!window.confirm('O backup foi baixado. Deseja agora criar a store de marcações com datas? Os valores legados permanecerão intactos.')) return
      const dbInfo = await habitsRepository.enableDatedCheckins(); setInfo(dbInfo); setNotice('Marcações por data habilitadas. Os valores antigos continuam preservados sem data.'); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível habilitar marcações por data.') }
  }
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    try {
      const backup = parseBackup(await file.text())
      if (importMode === 'replace') {
        if (!window.confirm('Substituir removerá os hábitos atuais. Um backup será baixado antes de continuar. Deseja prosseguir?')) return
        await downloadBackup()
        if (!window.confirm('Backup atual baixado. Confirma a substituição pelos dados do arquivo?')) return
      }
      const report = await importBackup(backup, importMode)
      setNotice(`${report.imported} registro(s) importado(s); ${report.ignored} ignorado(s).`); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar o arquivo.') }
  }

  return <PageShell>
    <BackToHub />
    <header className="app-card mb-6 flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center"><div><h1 className="flex items-center gap-3 text-2xl font-bold text-white md:text-3xl"><Leaf className="text-emerald-400" />Hábitos da Semana</h1><p className="mt-1 text-sm text-slate-400">Acompanhe suas metas diárias e crie sequências duradouras.</p></div><div className="flex items-center rounded-2xl border border-slate-700 bg-slate-900 p-3"><div className="border-r border-slate-700 px-4 text-center"><strong className="block text-2xl text-indigo-500">{habits.length}</strong><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hábitos</span></div><div className="px-4 text-center"><strong className="block text-2xl text-emerald-500">{percentage}%</strong><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Semanal</span></div></div></header>
    {error && <div role="alert" className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><strong>Não foi possível salvar neste navegador.</strong> {error}</div>}
    {notice && <div role="status" className="mb-5 flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice('')}>×</button></div>}
    {info && !info.supportsDatedCheckins && info.habitCount > 0 && <section className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center"><div><strong className="mb-1 flex items-center gap-2"><Archive size={17} />Base legada detectada</strong><p className="max-w-3xl text-amber-100/75">Os sete marcadores não possuem datas e continuam editáveis como legado. Eles não serão atribuídos à semana atual. Baixe um backup antes de habilitar novos check-ins datados.</p></div><Button variant="secondary" onClick={() => { void enableDates() }}><Download size={17} />Backup e habilitar datas</Button></div></section>}
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <aside className="flex flex-col gap-6">
        <section className="app-card p-6"><h2 className="flex items-center gap-2 text-lg font-semibold text-white"><BarChart3 className="text-indigo-500" size={21} />Resumo Semanal</h2><WeeklyChart totals={totals} habitCount={habits.length} /><p className="mt-3 text-xs text-slate-500">Percentual sobre 7 dias por hábito. {info?.supportsDatedCheckins ? 'Marcações datadas.' : 'Visualização legada sem datas.'}</p></section>
        <section className="app-card p-6"><h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white"><Plus className="text-indigo-500" size={21} />Novo Hábito</h2><form className="space-y-4" onSubmit={addHabit}><label className="block"><span className="mb-2 block text-sm font-medium text-slate-300">Nome</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="off" placeholder="ex: Ler 20 páginas" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500" /></label><Button className="w-full" type="submit">Adicionar Hábito <Plus size={17} /></Button></form></section>
        <section className="app-card p-6"><h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white"><Save className="text-indigo-500" size={20} />Backup local</h2><p className="mb-4 text-xs leading-relaxed text-slate-400">Use o arquivo JSON para transportar os dados entre endereços e navegadores.</p><div className="space-y-3"><Button variant="secondary" className="w-full" onClick={() => { void downloadBackup().then(() => setNotice('Backup baixado.')).catch((reason: Error) => setError(reason.message)) }}><Download size={17} />Exportar backup</Button><label className="block text-xs font-medium text-slate-400">Modo de importação<select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-white"><option value="merge">Mesclar (existentes prevalecem)</option><option value="replace">Substituir após backup</option></select></label><label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 font-semibold text-slate-300 hover:bg-slate-800"><Upload size={17} />Importar backup<input className="sr-only" type="file" accept="application/json,.json" onChange={handleImport} /></label></div></section>
      </aside>
      <section className="app-card flex min-h-[500px] flex-col p-4 md:p-6 lg:col-span-2"><div className="mb-4 flex flex-col gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-semibold text-white"><ListChecks className="text-slate-400" />Seus Hábitos</h2>{info?.supportsDatedCheckins && <nav aria-label="Navegação entre semanas" className="flex items-center gap-2"><button aria-label="Semana anterior" onClick={() => setWeekOffset((value) => value - 1)} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"><ChevronLeft size={17} /></button><button onClick={() => setWeekOffset(0)} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"><CalendarDays size={15} />{weekOffset === 0 ? 'Semana atual' : weekRangeLabel(weekKeys)}</button><button aria-label="Próxima semana" disabled={weekOffset === 0} onClick={() => setWeekOffset((value) => Math.min(0, value + 1))} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight size={17} /></button></nav>}</div><div className="ml-auto hidden w-1/2 justify-between px-2 text-xs font-medium text-slate-400 md:flex">{DAYS.map((day, index) => <span key={day} title={weekKeys[index]} className="w-8 text-center">{day}<small className="block text-[9px] text-slate-600">{weekKeys[index].slice(-2)}</small></span>)}</div></div>
        {loading ? <p className="m-auto text-slate-400">Carregando dados locais…</p> : habits.length ? <div className="flex max-h-[720px] flex-col gap-4 overflow-y-auto pr-1">{habits.map((habit) => <HabitCard key={habit.id} habit={habit} supportsDates={Boolean(info?.supportsDatedCheckins)} weekKeys={weekKeys} checkins={checkins} history={history} todayKey={todayKey} onToggle={(item, index) => { void toggle(item, index) }} onRename={async (item, newName) => { await habitsRepository.update({ ...item, name: newName }) }} onDelete={setDeleteTarget} />)}</div> : <div className="m-auto flex flex-col items-center py-16 text-center"><span className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-700 bg-slate-900"><Wind className="text-slate-500" size={32} /></span><h3 className="mb-1 text-lg font-medium text-white">Nenhum hábito ainda</h3><p className="max-w-xs text-sm text-slate-400">Adicione um hábito para começar a acompanhar seu progresso.</p></div>}
      </section>
    </div>
    <ConfirmModal open={Boolean(deleteTarget)} title="Excluir Hábito" confirmLabel="Excluir Hábito" onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) void habitsRepository.remove(deleteTarget.id).then(() => setDeleteTarget(null)).catch((reason: Error) => setError(reason.message)) }}><p>Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? As marcações datadas deste hábito também serão removidas.</p></ConfirmModal>
  </PageShell>
}
