import { ArrowDown, ArrowUp, Clock3, GripVertical, ListTodo, Pencil, Plus, Save, Timer, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { BackToHub, PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { ConfirmModal } from '../../components/ui/Modal'
import { downloadBackup } from '../../services/backup/backupService'
import { tasksRepository } from '../../services/db/tasksRepository'
import type { Task, TaskStatus } from './types'
import { useNavigate } from 'react-router'
import { clockService } from '../../services/clock/ClockService'

const columns: { status: TaskStatus; title: string; accent: string }[] = [
  { status: 'todo', title: 'A Fazer', accent: 'text-slate-300' },
  { status: 'doing', title: 'Fazendo', accent: 'text-amber-400' },
  { status: 'done', title: 'Concluído', accent: 'text-emerald-400' },
]

function TaskCard({ task, onEdit, onDelete, onMove, onReorder, onDragStart, onStart }: { task: Task; onEdit: (task: Task) => void; onDelete: (task: Task) => void; onMove: (task: Task, status: TaskStatus) => void; onReorder: (task: Task, direction: -1 | 1) => void; onDragStart: (event: DragEvent, task: Task) => void; onStart: (task: Task, mode: 'timer' | 'pomodoro') => void }) {
  return <article draggable onDragStart={(event) => onDragStart(event, task)} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 shadow-sm transition-colors hover:border-slate-600">
    <div className="mb-2 flex items-start gap-2"><GripVertical aria-hidden className="mt-0.5 shrink-0 cursor-grab text-slate-600" size={18} /><h3 className={`min-w-0 flex-1 font-semibold ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-white'}`}>{task.title}</h3><button aria-label={`Editar ${task.title}`} onClick={() => onEdit(task)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-blue-400"><Pencil size={14} /></button><button aria-label={`Excluir ${task.title}`} onClick={() => onDelete(task)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-red-400"><Trash2 size={15} /></button></div>
    {task.description && <p className="mb-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-400">{task.description}</p>}
    {(task.pomodoroCount ?? 0) > 0 && <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300"><Timer size={13} />{task.pomodoroCount} foco(s) · {task.focusMinutes ?? 0} min</p>}
    <div className="mb-3 grid grid-cols-2 gap-2"><button onClick={() => onStart(task, 'timer')} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 text-xs font-semibold text-cyan-400"><Clock3 size={13} />Usar no Timer</button><button onClick={() => onStart(task, 'pomodoro')} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 text-xs font-semibold text-rose-400"><Timer size={13} />Usar no Pomodoro</button></div><div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-[11px] text-slate-500">Mover para<select aria-label={`Mover ${task.title}`} value={task.status} onChange={(event) => onMove(task, event.target.value as TaskStatus)} className="mt-1 min-h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs text-slate-300"><option value="todo">A Fazer</option><option value="doing">Fazendo</option><option value="done">Concluído</option></select></label><button aria-label="Mover para cima" title="Mover para cima" onClick={() => onReorder(task, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white"><ArrowUp size={15} /></button><button aria-label="Mover para baixo" title="Mover para baixo" onClick={() => onReorder(task, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white"><ArrowDown size={15} /></button></div>
  </article>
}

export default function TasksPage() {
  const navigate = useNavigate()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try { const active = await tasksRepository.isEnabled(); setEnabled(active); setTasks(active ? await tasksRepository.getAll() : []) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir as tarefas.') }
  }, [])
  useEffect(() => { void load(); return tasksRepository.subscribe(() => { void load() }) }, [load])

  const enable = async () => {
    try {
      await downloadBackup()
      if (!window.confirm('O backup foi baixado. Deseja criar a store de tarefas sem alterar hábitos ou check-ins?')) return
      await tasksRepository.enable(); setEnabled(true); setNotice('Kanban habilitado com segurança.'); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível habilitar o Kanban.') }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const cleanTitle = title.trim(); const cleanDescription = description.trim()
    if (!cleanTitle) { setError('O título da tarefa é obrigatório.'); return }
    try {
      if (editing) { await tasksRepository.update({ ...editing, title: cleanTitle, description: cleanDescription }); clockService.renameAssociatedTask(editing.id, cleanTitle) }
      else await tasksRepository.add(cleanTitle, cleanDescription)
      setTitle(''); setDescription(''); setEditing(null); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a tarefa.') }
  }
  const dragStart = (event: DragEvent, task: Task) => { event.dataTransfer.setData('text/task-id', task.id); event.dataTransfer.effectAllowed = 'move' }
  const drop = (event: DragEvent, status: TaskStatus) => { event.preventDefault(); const task = tasks.find((item) => item.id === event.dataTransfer.getData('text/task-id')); if (task) void tasksRepository.move(task, status) }
  const startWithTask = (task: Task, mode: 'timer' | 'pomodoro') => {
    const clock = clockService.getSnapshot()
    if (clock.status === 'running' && !window.confirm(`Existe uma sessão ${clock.mode === 'pomodoro' ? 'Pomodoro' : 'do Timer'} em execução. Deseja encerrá-la?`)) return
    clockService.associateTask(mode, task.id, task.title)
    navigate(mode === 'timer' ? '/timer' : '/pomodoro')
  }
  const deleteTask = async () => {
    if (!deleteTarget) return
    try { await tasksRepository.remove(deleteTarget.id); clockService.clearTask(deleteTarget.id); setDeleteTarget(null); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir a tarefa.') }
  }

  return <PageShell>
    <BackToHub aside={<span className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-400"><ListTodo size={17} />Kanban</span>} />
    <header className="app-card mb-6 p-6"><h1 className="flex items-center gap-3 text-2xl font-bold text-white md:text-3xl"><ListTodo className="text-amber-400" />Quadro de Tarefas</h1><p className="mt-2 text-sm text-slate-400">Organize o fluxo entre A Fazer, Fazendo e Concluído.</p></header>
    {error && <p role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</p>}
    {enabled === false ? <section className="app-card mx-auto max-w-2xl p-8 text-center"><Save className="mx-auto mb-4 text-amber-400" size={36} /><h2 className="mb-2 text-xl font-bold text-white">Habilitar armazenamento do Kanban</h2><p className="mb-6 text-sm leading-relaxed text-slate-400">Antes de criar a store `tasks`, o Hub baixa um backup de todas as stores atuais. Hábitos e marcações permanecem intactos.</p><Button onClick={() => { void enable() }}><Save size={17} />Backup e habilitar Kanban</Button></section> : enabled ? <>
      <section className="app-card mb-6 p-5"><form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]"><label className="text-sm text-slate-300">Título<input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Próxima tarefa" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-white" /></label><label className="text-sm text-slate-300">Descrição opcional<input maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalhes em texto simples" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-white" /></label><div className="flex items-end gap-2"><Button type="submit"><Plus size={17} />{editing ? 'Salvar' : 'Adicionar'}</Button>{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setTitle(''); setDescription('') }}>Cancelar</Button>}</div></form></section>
      <section className="grid gap-5 lg:grid-cols-3">{columns.map((column) => { const columnTasks = tasks.filter((task) => task.status === column.status); return <div key={column.status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, column.status)} className="app-card min-h-[420px] p-4"><header className="mb-4 flex items-center justify-between"><h2 className={`font-bold ${column.accent}`}>{column.title}</h2><span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-bold text-slate-300">{columnTasks.length}</span></header><div className="space-y-3">{columnTasks.map((task) => <TaskCard key={task.id} task={task} onDragStart={dragStart} onStart={startWithTask} onEdit={(item) => { setEditing(item); setTitle(item.title); setDescription(item.description); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onDelete={setDeleteTarget} onMove={(item, status) => { void tasksRepository.move(item, status) }} onReorder={(item, direction) => { void tasksRepository.reorder(item, direction) }} />)}{!columnTasks.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">Nenhuma tarefa</p>}</div></div> })}</section>
    </> : <p className="text-center text-slate-400">Carregando armazenamento local…</p>}
    <ConfirmModal open={Boolean(deleteTarget)} title="Excluir tarefa" confirmLabel="Excluir tarefa" onClose={() => setDeleteTarget(null)} onConfirm={() => { void deleteTask() }}><p>Excluir <strong>{deleteTarget?.title}</strong>? A contagem ativa continuará, mas será desvinculada desta tarefa.</p></ConfirmModal>
  </PageShell>
}
