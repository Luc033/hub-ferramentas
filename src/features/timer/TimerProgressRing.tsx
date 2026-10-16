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

  return <svg aria-hidden shapeRendering="geometricPrecision" data-direction="clockwise" className={`timer-progress-svg absolute inset-0 h-full w-full ${finished ? 'timer-progress-alarm' : ''}`} viewBox="0 0 100 100">
    <defs>
      <linearGradient id="timer-liquid-gradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--timer-progress-highlight)" /><stop offset=".45" stopColor="var(--timer-progress)" /><stop offset=".72" stopColor="var(--timer-progress-highlight)" /><stop offset="1" stopColor="var(--timer-progress)" />
        {running && !reducedMotion && <animateTransform attributeName="gradientTransform" type="rotate" from="0 50 50" to="360 50 50" dur="3.6s" repeatCount="indefinite" />}
      </linearGradient>
      <linearGradient id="timer-wave-gradient" x1="0" y1="50" x2="100" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--timer-progress-highlight)" stopOpacity=".05" /><stop offset=".42" stopColor="var(--timer-progress-highlight)" stopOpacity=".5" /><stop offset=".7" stopColor="var(--timer-progress-highlight)" stopOpacity=".14" /><stop offset="1" stopColor="var(--timer-progress-highlight)" stopOpacity=".04" />
        {running && !reducedMotion && <animateTransform attributeName="gradientTransform" type="rotate" from="0 50 50" to="360 50 50" dur="2.7s" repeatCount="indefinite" />}
      </linearGradient>
      <filter id="timer-cyan-glow" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation=".55" /></filter>
      <filter id="timer-red-glow" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation=".65" /></filter>
    </defs>
    <circle cx="50" cy="50" r="46" fill="none" stroke={finished ? 'var(--timer-expired-track)' : 'var(--timer-track)'} strokeWidth="3" />
    <path ref={glowRef} d={TIMER_RING_CLOCKWISE_PATH} fill="none" stroke={finished ? 'var(--timer-expired)' : 'var(--timer-progress)'} strokeOpacity={finished ? '.26' : '.22'} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TIMER_RING_CIRCUMFERENCE} strokeDashoffset={initialOffset} filter={`url(#${finished ? 'timer-red-glow' : 'timer-cyan-glow'})`} className={running ? 'timer-progress-glow-active' : ''} />
    <path ref={progressRef} data-testid="timer-progress" d={TIMER_RING_CLOCKWISE_PATH} fill="none" stroke={finished ? 'var(--timer-expired)' : running ? 'url(#timer-liquid-gradient)' : 'var(--timer-progress)'} strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TIMER_RING_CIRCUMFERENCE} strokeDashoffset={initialOffset} className={running ? 'timer-progress-liquid' : ''} />
    {running && <path ref={waveRef} d={TIMER_RING_CLOCKWISE_PATH} fill="none" stroke="url(#timer-wave-gradient)" strokeWidth=".72" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TIMER_RING_CIRCUMFERENCE} strokeDashoffset={initialOffset} className="timer-progress-wave" />}
  </svg>
}

export const TimerProgressRing = memo(TimerProgressRingComponent, (previous, next) => {
  if (previous.status === 'running' && next.status === 'running') return previous.durationMs === next.durationMs && previous.endAt === next.endAt && previous.reducedMotion === next.reducedMotion
  return previous.status === next.status && previous.durationMs === next.durationMs && previous.remainingMs === next.remainingMs && previous.endAt === next.endAt && previous.reducedMotion === next.reducedMotion
})
