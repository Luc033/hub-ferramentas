import { memo, useEffect, useRef } from 'react'
import type { ClockStatus } from '../../services/clock/ClockService'

export const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 46
export const TIMER_RING_CLOCKWISE_PATH = 'M 50 4 A 46 46 0 0 1 96 50 A 46 46 0 0 1 50 96 A 46 46 0 0 1 4 50 A 46 46 0 0 1 50 4'

interface TimerProgressRingProps {
  status: ClockStatus
  durationMs: number
  remainingMs: number
  endAt: number | null
  reducedMotion: boolean
}

export function calculateTimerProgress(status: ClockStatus, durationMs: number, remainingMs: number) {
  if (status === 'alarming') return 1
  if (status === 'idle' || status === 'ready' || durationMs <= 0) return 0
  return Math.min(1, Math.max(0, (durationMs - remainingMs) / durationMs))
}

function TimerProgressRingComponent({ status, durationMs, remainingMs, endAt, reducedMotion }: TimerProgressRingProps) {
  const progressRef = useRef<SVGPathElement>(null)
  const glowRef = useRef<SVGPathElement>(null)
  const waveRef = useRef<SVGPathElement>(null)
  const running = status === 'running'
  const finished = status === 'alarming'
  const initialProgress = calculateTimerProgress(status, durationMs, remainingMs)
  const initialOffset = TIMER_RING_CIRCUMFERENCE * (1 - initialProgress)

  useEffect(() => {
    const rings = [progressRef.current, glowRef.current, waveRef.current]
    const updateRings = (progress: number) => {
      const offset = String(TIMER_RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress))))
      rings.forEach((ring) => { if (ring) ring.style.strokeDashoffset = offset })
    }

    if (!running || endAt === null || durationMs <= 0) {
      updateRings(calculateTimerProgress(status, durationMs, remainingMs))
      return
    }

    const initialWallRemaining = Math.max(0, endAt - Date.now())
    const performanceEnd = performance.now() + initialWallRemaining
    let frame = 0
    const tick = (now: number) => {
      const remainingByPerformance = performanceEnd - now
      const remainingByWallClock = endAt - Date.now()
      const preciseRemaining = Math.max(0, Math.min(remainingByPerformance, remainingByWallClock))
      updateRings(1 - preciseRemaining / durationMs)
      if (preciseRemaining > 0) frame = requestAnimationFrame(tick)
    }
    tick(performance.now())
    return () => { if (frame) cancelAnimationFrame(frame) }
  }, [durationMs, endAt, remainingMs, running, status])

  return <svg aria-hidden shapeRendering="geometricPrecision" data-direction="clockwise" className={`absolute inset-0 h-full w-full ${finished ? 'timer-progress-alarm text-red-500' : 'text-cyan-400'}`} viewBox="0 0 100 100">
    <defs>
      <linearGradient id="timer-liquid-gradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#a5f3fc" /><stop offset=".28" stopColor="#22d3ee" /><stop offset=".58" stopColor="#0891b2" /><stop offset=".82" stopColor="#67e8f9" /><stop offset="1" stopColor="#06b6d4" />
        {running && !reducedMotion && <animateTransform attributeName="gradientTransform" type="rotate" from="0 50 50" to="360 50 50" dur="3.6s" repeatCount="indefinite" />}
      </linearGradient>
      <linearGradient id="timer-wave-gradient" x1="0" y1="50" x2="100" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ecfeff" stopOpacity=".12" /><stop offset=".35" stopColor="#ecfeff" stopOpacity=".9" /><stop offset=".62" stopColor="#67e8f9" stopOpacity=".28" /><stop offset="1" stopColor="#ecfeff" stopOpacity=".08" />
        {running && !reducedMotion && <animateTransform attributeName="gradientTransform" type="rotate" from="0 50 50" to="360 50 50" dur="2.7s" repeatCount="indefinite" />}
      </linearGradient>
      <filter id="timer-cyan-glow" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="1.15" /></filter>
      <filter id="timer-red-glow" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="1.35" /></filter>
    </defs>
    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity=".13" strokeWidth="3" />
    <path ref={glowRef} d={TIMER_RING_CLOCKWISE_PATH} fill="none" stroke={finished ? '#ef4444' : '#22d3ee'} strokeOpacity={finished ? '.7' : '.58'} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TIMER_RING_CIRCUMFERENCE} strokeDashoffset={initialOffset} filter={`url(#${finished ? 'timer-red-glow' : 'timer-cyan-glow'})`} className={running ? 'timer-progress-glow-active' : ''} />
    <path ref={progressRef} data-testid="timer-progress" d={TIMER_RING_CLOCKWISE_PATH} fill="none" stroke={finished ? '#ef4444' : running ? 'url(#timer-liquid-gradient)' : 'currentColor'} strokeWidth="2.65" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TIMER_RING_CIRCUMFERENCE} strokeDashoffset={initialOffset} className={running ? 'timer-progress-liquid' : ''} />
    {running && <path ref={waveRef} d={TIMER_RING_CLOCKWISE_PATH} fill="none" stroke="url(#timer-wave-gradient)" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TIMER_RING_CIRCUMFERENCE} strokeDashoffset={initialOffset} className="timer-progress-wave" />}
  </svg>
}

export const TimerProgressRing = memo(TimerProgressRingComponent, (previous, next) => {
  if (previous.status === 'running' && next.status === 'running') return previous.durationMs === next.durationMs && previous.endAt === next.endAt && previous.reducedMotion === next.reducedMotion
  return previous.status === next.status && previous.durationMs === next.durationMs && previous.remainingMs === next.remainingMs && previous.endAt === next.endAt && previous.reducedMotion === next.reducedMotion
})
