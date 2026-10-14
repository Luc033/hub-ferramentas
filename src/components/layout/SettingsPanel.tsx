import { Bell, BellOff, DatabaseBackup, Download, Moon, Settings2, Sun, Upload, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSettings } from '../../app/providers/SettingsProvider'
import type { ImportMode } from '../../services/backup/backupService'
import { notificationsService } from '../../services/notifications/notificationsService'
import { Button } from '../ui/Button'

const permissionLabels = {
  default: 'Não ativadas',
  granted: 'Permitidas',
  denied: 'Bloqueadas no navegador',
  unsupported: 'Não suportadas',
} as const

export function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(notificationsService.permission())
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [backupStatus, setBackupStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const { settings, updateSettings } = useSettings()

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const enableNotifications = async () => {
    const permission = await notificationsService.requestPermission()
    setNotificationPermission(permission)
    updateSettings({ notificationsEnabled: permission === 'granted' })
  }

  const exportData = async () => {
    setBackupBusy(true); setBackupStatus(null)
    try {
      const { downloadBackup } = await import('../../services/backup/backupService')
      const backup = await downloadBackup()
      const count = Object.values(backup.records).reduce((total, records) => total + (records?.length ?? 0), 0)
      setBackupStatus({ kind: 'success', message: `Backup baixado com ${count} registro(s).` })
    } catch (reason) {
      setBackupStatus({ kind: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível exportar os dados.' })
    } finally { setBackupBusy(false) }
  }

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBackupBusy(true); setBackupStatus(null)
    try {
      const { downloadBackup, importBackup, parseBackup } = await import('../../services/backup/backupService')
      const backup = parseBackup(await file.text())
      if (importMode === 'replace') {
        if (!window.confirm('Substituir removerá os dados atuais das ferramentas habilitadas. Deseja baixar um backup de segurança e continuar?')) return
        await downloadBackup()
        if (!window.confirm('O backup atual foi baixado. Confirma a substituição pelos dados do arquivo selecionado?')) return
      }
      const report = await importBackup(backup, importMode)
      setBackupStatus({ kind: 'success', message: `${report.imported} registro(s) importado(s); ${report.ignored} preservado(s).` })
    } catch (reason) {
      setBackupStatus({ kind: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível importar o backup.' })
    } finally { setBackupBusy(false) }
  }

  return <>
    <button aria-label="Abrir configurações" title="Configurações" onClick={() => setOpen(true)} className="fixed right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/95 text-slate-300 shadow-lg backdrop-blur transition-colors hover:bg-slate-700 hover:text-white md:right-8 md:top-8"><Settings2 size={20} /></button>
    {open && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false) }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="settings-title" className="h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-slate-900 p-6 shadow-2xl animate-fade-in">
        <header className="mb-8 flex items-center justify-between"><div><h2 id="settings-title" className="text-2xl font-bold text-white">Configurações</h2><p className="mt-1 text-sm text-slate-400">Preferências deste navegador</p></div><button ref={closeButton} aria-label="Fechar configurações" onClick={() => setOpen(false)} className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-slate-400 hover:text-white"><X /></button></header>

        <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-800 p-5"><h3 className="mb-4 font-semibold text-white">Aparência</h3><div className="grid grid-cols-2 gap-3"><Button variant={settings.theme === 'dark' ? 'brand' : 'secondary'} onClick={() => updateSettings({ theme: 'dark' })}><Moon size={17} />Escuro</Button><Button variant={settings.theme === 'light' ? 'brand' : 'secondary'} onClick={() => updateSettings({ theme: 'light' })}><Sun size={17} />Claro</Button></div></section>

        <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-800 p-5"><h3 className="mb-4 font-semibold text-white">Áudio</h3><button role="switch" aria-checked={settings.soundEffects} onClick={() => updateSettings({ soundEffects: !settings.soundEffects })} className="mb-5 flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-4 text-left text-sm text-slate-300"><span className="flex items-center gap-2">{settings.soundEffects ? <Volume2 size={18} /> : <VolumeX size={18} />}Efeitos sonoros</span><strong>{settings.soundEffects ? 'Ativados' : 'Silenciados'}</strong></button><label className="mb-5 block text-sm text-slate-300"><span className="mb-2 flex justify-between"><span>Volume dos alarmes</span><strong>{settings.alarmVolume}%</strong></span><input aria-label="Volume dos alarmes" type="range" min="0" max="100" value={settings.alarmVolume} onChange={(event) => updateSettings({ alarmVolume: Number(event.target.value) })} className="w-full accent-indigo-500" /></label><button role="switch" aria-checked={!settings.environmentMuted} onClick={() => updateSettings({ environmentMuted: !settings.environmentMuted })} className="mb-4 flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-4 text-left text-sm text-slate-300"><span className="flex items-center gap-2">{settings.environmentMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}Sons de Foco</span><strong>{settings.environmentMuted ? 'Silenciados' : 'Ativos'}</strong></button><label className="block text-sm text-slate-300"><span className="mb-2 flex justify-between"><span>Volume ambiente e musical</span><strong>{settings.environmentVolume}%</strong></span><input aria-label="Volume ambiente e musical" type="range" min="0" max="100" value={settings.environmentVolume} onChange={(event) => updateSettings({ environmentVolume: Number(event.target.value) })} className="w-full accent-indigo-500" /></label></section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5"><h3 className="mb-2 font-semibold text-white">Notificações</h3><p className="mb-4 text-sm leading-relaxed text-slate-400">Avisam quando o Timer ou uma fase Pomodoro termina enquanto esta página continua aberta. Não funcionam como Web Push com o navegador fechado.</p><div className="mb-4 flex items-center gap-2 text-sm text-slate-300">{notificationPermission === 'granted' ? <Bell size={18} className="text-emerald-400" /> : <BellOff size={18} className="text-slate-500" />}Estado: <strong>{permissionLabels[notificationPermission]}</strong></div>{notificationPermission === 'granted' ? <button role="switch" aria-checked={settings.notificationsEnabled} onClick={() => updateSettings({ notificationsEnabled: !settings.notificationsEnabled })} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm text-slate-300"><span>Notificar conclusões</span><strong>{settings.notificationsEnabled ? 'Ativado' : 'Desativado'}</strong></button> : <Button className="w-full" disabled={notificationPermission === 'denied' || notificationPermission === 'unsupported'} onClick={() => { void enableNotifications() }}><Bell size={17} />Ativar notificações</Button>}</section>
        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-5"><h3 className="mb-4 font-semibold text-white">Pomodoro</h3><button role="switch" aria-checked={settings.pomodoroAutoStart} onClick={() => updateSettings({ pomodoroAutoStart: !settings.pomodoroAutoStart })} className="mb-4 flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm text-slate-300"><span>Iniciar próxima fase</span><strong>{settings.pomodoroAutoStart ? 'Automático' : 'Manual'}</strong></button><div className="grid grid-cols-3 gap-2">{([
          ['Foco', 'focusMinutes', 180], ['Pausa curta', 'shortBreakMinutes', 60], ['Pausa longa', 'longBreakMinutes', 60],
        ] as const).map(([label, key, max]) => <label key={key} className="text-xs text-slate-400"><span className="mb-1 block min-h-8">{label}</span><input aria-label={`${label} em minutos`} type="number" min="1" max={max} value={settings[key]} onChange={(event) => updateSettings({ [key]: Math.min(max, Math.max(1, Number(event.target.value) || 1)) })} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 text-center text-white" /></label>)}</div></section>
        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-5"><h3 className="mb-2 flex items-center gap-2 font-semibold text-white"><DatabaseBackup size={18} className="text-indigo-400" />Dados locais</h3><p className="mb-4 text-sm leading-relaxed text-slate-400">Exporte os dados das ferramentas para transportar entre navegadores ou endereços. O arquivo permanece no seu dispositivo.</p><Button variant="secondary" className="mb-4 w-full" disabled={backupBusy} onClick={() => { void exportData() }}><Download size={17} />{backupBusy ? 'Processando…' : 'Exportar dados (.json)'}</Button><label className="mb-3 block text-xs font-medium text-slate-400">Ao importar<select disabled={backupBusy} value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-white disabled:opacity-50"><option value="merge">Mesclar e preservar existentes</option><option value="replace">Substituir após backup</option></select></label><label className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 font-semibold text-slate-300 hover:bg-slate-700 ${backupBusy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}><Upload size={17} />Selecionar backup<input aria-label="Selecionar arquivo de backup" className="sr-only" type="file" accept="application/json,.json" disabled={backupBusy} onChange={(event) => { void importData(event) }} /></label>{backupStatus && <p role={backupStatus.kind === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-xl border p-3 text-sm ${backupStatus.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>{backupStatus.message}</p>}<p className="mt-4 text-xs leading-relaxed text-slate-500">O IndexedDB é separado por origem. Use este arquivo ao mudar de domínio, porta, navegador ou dispositivo.</p></section>
      </aside>
    </div>}
  </>
}
