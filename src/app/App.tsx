import { Outlet } from 'react-router'
import { useEffect } from 'react'
import { audioService } from '../services/audio/audioService'
import { formatDuration } from '../services/clock/ClockService'
import { clockService } from '../services/clock/ClockService'
import { useClock } from '../services/clock/useClock'

export function App() {
  const clock = useClock()
  useEffect(() => {
    const sync = () => clockService.sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => { document.removeEventListener('visibilitychange', sync); window.removeEventListener('focus', sync) }
  }, [])
  useEffect(() => {
    if (clock.status === 'alarming') audioService.startAlarm()
    else audioService.stopAlarm()
    if (clock.status === 'running' || clock.status === 'paused') document.title = `(${formatDuration(clock.remainingMs)}) Temporizador`
    else if (clock.status === 'alarming') document.title = '⏰ ALARME! ⏰'
    else document.title = 'Hub de Ferramentas Pessoais'
  }, [clock])
  return <Outlet />
}
