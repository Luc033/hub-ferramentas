import { Outlet, useLocation } from 'react-router'
import { useEffect } from 'react'
import { audioService } from '../services/audio/audioService'
import { formatDuration } from '../services/clock/ClockService'
import { clockService } from '../services/clock/ClockService'
import { useClock } from '../services/clock/useClock'
import { SettingsPanel } from '../components/layout/SettingsPanel'
import { useSettings } from './providers/SettingsProvider'
import { completionAlertsService } from '../services/notifications/completionAlertsService'
import { pomodoroService } from '../features/pomodoro/pomodoroService'
import { focusSoundService } from '../services/audio/focusSoundService'
import { FocusAudioPlayer } from '../components/layout/FocusAudioPlayer'
import { useFocusSound } from '../services/audio/useFocusSound'
import { documentTitleForPath, faviconForPath } from './documentTitle'
import habitsFavicon from '../assets/favicon-habitos.png'
import pomodoroFavicon from '../assets/favicon-pomodoro.png'
import timerFavicon from '../assets/favicon-timer.png'
import kanbanFavicon from '../assets/favicon-kanban.png'
import notesFavicon from '../assets/favicon-mapa.png'
import soundsFavicon from '../assets/favicon-musica.png'

export function App() {
  const clock = useClock()
  const { settings } = useSettings()
  const focusAudio = useFocusSound()
  const location = useLocation()
  useEffect(() => {
    const sync = () => clockService.sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => { document.removeEventListener('visibilitychange', sync); window.removeEventListener('focus', sync) }
  }, [])
  useEffect(() => { pomodoroService.reconcileClock() }, [])
  useEffect(() => {
    audioService.configure(settings.soundEffects, settings.alarmVolume, settings.selectedAlarmSoundId)
    focusSoundService.setVolume(settings.environmentVolume)
    focusSoundService.setMuted(settings.environmentMuted)
    if (clock.status !== 'alarming') audioService.stopAlarm()
    if (clock.status === 'running' || clock.status === 'paused') document.title = `(${formatDuration(clock.remainingMs)}) ${clock.mode === 'pomodoro' ? 'Foco' : 'Timer'} | Hub`
    else if (clock.status === 'alarming') document.title = '⏰ Alarme | Hub'
    else document.title = documentTitleForPath(location.pathname)
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    favicon?.setAttribute('href', faviconForPath(location.pathname, habitsFavicon, pomodoroFavicon, timerFavicon, kanbanFavicon, notesFavicon, soundsFavicon))
    favicon?.setAttribute('type', ['/habits', '/pomodoro', '/timer', '/tasks', '/notes', '/sounds'].includes(location.pathname) || location.pathname.startsWith('/notes/maps') ? 'image/png' : 'image/svg+xml')
    if (clock.status === 'alarming') {
      const pomodoroMessage = clock.mode === 'pomodoro' ? pomodoroService.getSnapshot().transitionMessage ?? undefined : undefined
      void completionAlertsService.process(clock, settings.notificationsEnabled, pomodoroMessage).then((result) => {
        if (result.notificationShown && clockService.getSnapshot().runId === clock.runId) clockService.markNotificationSent()
      })
    }
  }, [clock, location.pathname, settings])
  return <><SettingsPanel /><div className={focusAudio.source ? 'pb-44' : ''}><Outlet /></div><FocusAudioPlayer /></>
}
