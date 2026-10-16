import { FileAudio, Play, Square, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSettings } from '../../app/providers/SettingsProvider'
import { type AlarmSoundId, type CustomAlarmSound } from '../../services/audio/alarmSounds'
import { audioService } from '../../services/audio/audioService'
import { alarmSoundsRepository } from '../../services/db/alarmSoundsRepository'

export function AlarmSoundSettings() {
  const { settings, updateSettings } = useSettings()
  const [custom, setCustom] = useState<CustomAlarmSound | null>(null)
  const [previewing, setPreviewing] = useState(audioService.getPreviewSoundId())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(audioService.getLastError())
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void alarmSoundsRepository.getCustom().then((record) => {
      if (!active) return
      setCustom(record)
      if (!record && settings.selectedAlarmSoundId === 'custom') setError('O áudio personalizado não está disponível neste navegador. O alarme original será usado até você selecionar outro arquivo.')
    }).catch(() => { if (active) setError('Não foi possível carregar o áudio personalizado salvo. O alarme original será usado.') })
    const unsubscribe = audioService.subscribe(() => { setPreviewing(audioService.getPreviewSoundId()); if (audioService.getLastError()) setError(audioService.getLastError()) })
    return () => { active = false; unsubscribe(); audioService.stopPreview() }
  }, [settings.selectedAlarmSoundId])

  const select = (soundId: AlarmSoundId) => {
    setError(null)
    if (soundId === 'custom' && !custom) { fileInput.current?.click(); return }
    updateSettings({ selectedAlarmSoundId: soundId })
  }

  const togglePreview = async (soundId: AlarmSoundId) => {
    setError(null)
    if (previewing === soundId) { audioService.stopPreview(); return }
    try {
      if (!await audioService.preview(soundId)) setError('O navegador bloqueou a reprodução. Tente novamente.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível reproduzir este som.') }
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setError(null); audioService.stopPreview()
    try {
      const record = await audioService.importCustomSound(file)
      setCustom(record)
      updateSettings({ selectedAlarmSoundId: 'custom' })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar o áudio.') }
    finally { setBusy(false) }
  }

  return <div className="mt-5 border-t border-slate-700 pt-5">
    <h4 className="text-xs font-bold tracking-[.16em] text-slate-300">SOM DO ALARME</h4>
    <p className="mb-3 mt-1 text-xs leading-relaxed text-slate-400">Escolha o som utilizado quando um temporizador terminar.</p>
    <div className="space-y-2">
      {audioService.listSounds().map((sound) => <div key={sound.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${settings.selectedAlarmSoundId === sound.id ? 'border-indigo-500/70 bg-indigo-500/10' : 'border-slate-700 bg-slate-900'}`}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input type="radio" name="alarm-sound" value={sound.id} checked={settings.selectedAlarmSoundId === sound.id} onChange={() => select(sound.id)} className="h-4 w-4 shrink-0 accent-indigo-500" />
          <span className="min-w-0"><strong className="block truncate text-sm text-slate-100">{sound.name}</strong><span className="block truncate text-xs text-slate-500">{sound.description}</span></span>
        </label>
        <button type="button" aria-label={`${previewing === sound.id ? 'Parar' : 'Reproduzir'} prévia de ${sound.name}`} onClick={() => { void togglePreview(sound.id) }} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${previewing === sound.id ? 'border-rose-500/50 bg-rose-500/10 text-rose-300' : 'border-slate-700 text-slate-300 hover:border-indigo-500/50 hover:text-white'}`}>{previewing === sound.id ? <Square size={16} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
      </div>)}

      <div className={`rounded-xl border px-3 py-2.5 ${settings.selectedAlarmSoundId === 'custom' ? 'border-indigo-500/70 bg-indigo-500/10' : 'border-slate-700 bg-slate-900'}`}>
        <div className="flex items-center gap-3">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
            <input type="radio" name="alarm-sound" value="custom" checked={settings.selectedAlarmSoundId === 'custom'} onChange={() => select('custom')} className="h-4 w-4 shrink-0 accent-indigo-500" />
            <span className="min-w-0"><strong className="block text-sm text-slate-100">Áudio personalizado</strong>{custom && <span title={custom.name} className="block truncate text-xs text-slate-500">{custom.name}</span>}</span>
          </label>
          {custom && <button type="button" aria-label={`${previewing === 'custom' ? 'Parar' : 'Reproduzir'} prévia do áudio personalizado`} onClick={() => { void togglePreview('custom') }} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${previewing === 'custom' ? 'border-rose-500/50 bg-rose-500/10 text-rose-300' : 'border-slate-700 text-slate-300 hover:text-white'}`}>{previewing === 'custom' ? <Square size={16} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>}
        </div>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50">{custom ? <FileAudio size={15} /> : <Upload size={15} />}{busy ? 'Validando…' : custom ? 'Alterar arquivo' : 'Selecionar arquivo'}</button>
        <input ref={fileInput} aria-label="Selecionar áudio personalizado" className="sr-only" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/*" onChange={(event) => { void importFile(event) }} />
      </div>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
  </div>
}
