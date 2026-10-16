import FlipClock from '@hasthiya_/flip-clock'
import { memo, useEffect, useMemo, useState } from 'react'

export type FlipClockUnit = 'hours' | 'minutes' | 'seconds'
export type FlipClockSize = 'regular' | 'prominent' | 'compact'

interface FlipClockDisplayProps {
  values: Record<FlipClockUnit, number>
  disabled?: boolean
  size?: FlipClockSize
  reducedMotion: boolean
  transitionKey: string
  onChange?: (unit: FlipClockUnit, value: number) => void
  visibleUnits?: readonly FlipClockUnit[]
  ariaLabel?: string
}

const unitConfig: ReadonlyArray<{ unit: FlipClockUnit; label: string; max: number }> = [
  { unit: 'hours', label: 'HRS', max: 99 },
  { unit: 'minutes', label: 'MIN', max: 59 },
  { unit: 'seconds', label: 'SEG', max: 59 },
]

const segments = {
  hours: { days: false, hours: true, minutes: false, seconds: false },
  minutes: { days: false, hours: false, minutes: true, seconds: false },
  seconds: { days: false, hours: false, minutes: false, seconds: true },
} as const

export function durationToFlipClockValues(milliseconds: number): Record<FlipClockUnit, number> {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return { hours: Math.min(99, Math.floor(totalSeconds / 3600)), minutes: Math.floor((totalSeconds % 3600) / 60), seconds: totalSeconds % 60 }
}

function FlipTimeUnit({ unit, label, value, max, disabled, size, reducedMotion, transitionKey, onChange }: { unit: FlipClockUnit; label: string; value: number; max: number; disabled: boolean; size: FlipClockSize; reducedMotion: boolean; transitionKey: string; onChange?: (value: number) => void }) {
  const setValue = (next: number) => onChange?.(Math.min(max, Math.max(0, next)))
  const staticTime = useMemo(() => ({ [unit]: value }), [unit, value])
  const [settledTransition, setSettledTransition] = useState<string | null>(null)
  const animate = !reducedMotion && settledTransition === transitionKey
  const editable = onChange !== undefined

  useEffect(() => {
    const timer = setTimeout(() => setSettledTransition(transitionKey), 0)
    return () => clearTimeout(timer)
  }, [transitionKey])

  return <div className={`flip-clock-unit flip-clock-unit-${size}`}>
    {editable && <button type="button" aria-label={`Aumentar ${label}`} disabled={disabled || value >= max} onClick={() => setValue(value + 1)} className={`flip-clock-step ${disabled ? 'invisible' : ''}`}>+</button>}
    <div className="flip-clock-card">
      <div aria-hidden="true">
        <FlipClock
          staticTime={staticTime}
          segments={segments[unit]}
          cardStyle={{ background: 'var(--flip-card-top)', backgroundDark: 'var(--flip-card-bottom)', width: 'var(--flip-card-width)', height: 'var(--flip-card-height)', borderRadius: '.45rem', boxShadow: 'var(--flip-card-shadow)' }}
          digitStyle={{ color: 'var(--flip-card-text)', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 'var(--flip-digit-size)', textShadow: 'var(--flip-digit-shadow)' }}
          labelStyle={{ visible: false }}
          lineStyle={{ color: 'var(--flip-card-line)', height: '2px' }}
          animation={{ flipDuration: animate ? 200 : 1, bounceIntensity: animate ? 5 : 0, flipDownEasing: 'cubic-bezier(.55,.05,.68,.53)', flipUpEasing: 'cubic-bezier(.22,.61,.36,1)' }}
          groupGap="0"
          cardGap="var(--flip-card-gap)"
          labelGap="0"
        />
      </div>
      {editable && <input aria-label={label} inputMode="numeric" maxLength={2} disabled={disabled} value={String(value).padStart(2, '0')} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setValue(Number(event.target.value.replace(/\D/g, '').slice(-2)) || 0)} className="flip-clock-input" />}
    </div>
    {editable && <button type="button" aria-label={`Diminuir ${label}`} disabled={disabled || value <= 0} onClick={() => setValue(value - 1)} className={`flip-clock-step ${disabled ? 'invisible' : ''}`}>−</button>}
    <span className="flip-clock-label">{label}</span>
  </div>
}

function FlipClockDisplayComponent({ values, disabled = false, size = 'regular', reducedMotion, transitionKey, onChange, visibleUnits = unitConfig.map(({ unit }) => unit), ariaLabel = 'Tempo restante' }: FlipClockDisplayProps) {
  return <div className={`flip-clock-display flip-clock-display-${size} flip-clock-display-${visibleUnits.length}`} aria-label={ariaLabel}>
    {unitConfig.filter(({ unit }) => visibleUnits.includes(unit)).map(({ unit, label, max }) => <FlipTimeUnit key={unit} unit={unit} label={label} value={values[unit]} max={max} disabled={disabled} size={size} reducedMotion={reducedMotion} transitionKey={transitionKey} onChange={onChange ? (value) => onChange(unit, value) : undefined} />)}
  </div>
}

export const FlipClockDisplay = memo(FlipClockDisplayComponent, (previous, next) => previous.values.hours === next.values.hours
  && previous.values.minutes === next.values.minutes
  && previous.values.seconds === next.values.seconds
  && previous.disabled === next.disabled
  && previous.size === next.size
  && previous.reducedMotion === next.reducedMotion
  && previous.transitionKey === next.transitionKey
  && previous.visibleUnits === next.visibleUnits)
