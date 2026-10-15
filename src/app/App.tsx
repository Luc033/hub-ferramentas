import { Outlet } from 'react-router'
import { useEffect } from 'react'
import { audioService } from '../services/audio/audioService'
import { formatDuration } from '../services/clock/ClockService'
import { clockService } from '../services/clock/ClockService'
import { useClock } from '../services/clock/useClock'
import { SettingsPanel } from '../components/layout/SettingsPanel'
import { useSettings } from './providers/SettingsProvider'
import { notificationsService } from '../services/notifications/notificationsService'
import { pomodoroService } from '../features/pomodoro/pomodoroService'
import { focusSoundService } from '../services/audio/focusSoundService'
import { FocusAudioPlayer } from '../components/layout/FocusAudioPlayer'
import { useFocusSound } from '../services/audio/useFocusSound'

export function App() {
  const clock = useClock()
  const { settings } = useSettings()
  const focusAudio = useFocusSound()
  useEffect(() => {
    const sync = () => clockService.sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => { document.removeEventListener('visibilitychange', sync); window.removeEventListener('focus', sync) }
  }, [])
  useEffect(() => { pomodoroService.reconcileClock() }, [])
  useEffect(() => {
    audioService.configure(settings.soundEffects, settings.alarmVolume)
    focusSoundService.setVolume(settings.environmentVolume)
    focusSoundService.setMuted(settings.environmentMuted)
    if (clock.status === 'alarming') audioService.startAlarm()
    else audioService.stopAlarm()
    if (clock.status === 'running' || clock.status === 'paused') document.title = `(${formatDuration(clock.remainingMs)}) ${clock.mode === 'pomodoro' ? 'Pomodoro' : 'Temporizador'}`
    else if (clock.status === 'alarming') document.title = '⏰ ALARME! ⏰'
    else document.title = 'Hub de Ferramentas Pessoais'
    if (clock.status === 'alarming' && settings.notificationsEnabled && !clock.notificationSent) {
      const pomodoroMessage = clock.mode === 'pomodoro' ? pomodoroService.getSnapshot().transitionMessage ?? undefined : undefined
      notificationsService.notifyFinished(clock.mode, pomodoroMessage)
      clockService.markNotificationSent()
    }
  }, [clock, settings])
  return <><SettingsPanel /><div className={focusAudio.source ? 'pb-44' : ''}><Outlet /></div><FocusAudioPlayer /></>
}
