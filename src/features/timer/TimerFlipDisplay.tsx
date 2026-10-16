import FlipClock from '@hasthiya_/flip-clock'
import { memo, useEffect, useMemo, useState } from 'react'

export type TimerUnit = 'hours' | 'minutes' | 'seconds'

interface TimerFlipDisplayProps {
  values: Record<TimerUnit, number>
  disabled: boolean
  prominent?: boolean
  reducedMotion: boolean
  transitionKey: string
  onChange: (unit: TimerUnit, value: number) => void
}

const unitConfig: ReadonlyArray<{ unit: TimerUnit; label: string; max: number }> = [
  { unit: 'hours', label: 'HRS', max: 99 },
  { unit: 'minutes', label: 'MIN', max: 59 },
  { unit: 'seconds', label: 'SEG', max: 59 },
]

const segments = {
  hours: { days: false, hours: true, minutes: false, seconds: false },
  minutes: { days: false, hours: false, minutes: true, seconds: false },
  seconds: { days: false, hours: false, minutes: false, seconds: true },
} as const

function FlipTimeUnit({ unit, label, value, max, disabled, prominent, reducedMotion, transitionKey, onChange }: { unit: TimerUnit; label: string; value: number; max: number; disabled: boolean; prominent: boolean; reducedMotion: boolean; transitionKey: string; onChange: (value: number) => void }) {
  const setValue = (next: number) => onChange(Math.min(max, Math.max(0, next)))
  const staticTime = useMemo(() => ({ [unit]: value }), [unit, value])
  const sizeClass = prominent ? 'timer-flip-unit-prominent' : 'timer-flip-unit-regular'
  const [settledTransition, setSettledTransition] = useState<string | null>(null)
  const animate = !reducedMotion && settledTransition === transitionKey

  useEffect(() => {
    const timer = setTimeout(() => setSettledTransition(transitionKey), 0)
    return () => clearTimeout(timer)
  }, [transitionKey])

  return <div className={`timer-flip-unit ${sizeClass}`}>
    <button type="button" aria-label={`Aumentar ${label}`} disabled={disabled || value >= max} onClick={() => setValue(value + 1)} className={`timer-flip-step ${disabled ? 'invisible' : ''}`}>+</button>
    <div className="timer-flip-edit">
      <div aria-hidden="true">
        <FlipClock
          staticTime={staticTime}
          segments={segments[unit]}
          cardStyle={{ background: '#0b1424', backgroundDark: '#07101d', width: 'var(--flip-card-width)', height: 'var(--flip-card-height)', borderRadius: '.45rem', boxShadow: '0 9px 18px rgb(0 0 0 / .32), inset 0 1px 0 rgb(148 163 184 / .08)' }}
          digitStyle={{ color: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 'var(--flip-digit-size)', textShadow: '0 2px 3px rgb(0 0 0 / .65)' }}
          labelStyle={{ visible: false }}
          lineStyle={{ color: 'rgb(0 0 0 / .7)', height: '2px' }}
          animation={{ flipDuration: animate ? 200 : 1, bounceIntensity: animate ? 5 : 0, flipDownEasing: 'cubic-bezier(.55,.05,.68,.53)', flipUpEasing: 'cubic-bezier(.22,.61,.36,1)' }}
          groupGap="0"
          cardGap="var(--flip-card-gap)"
          labelGap="0"
        />
      </div>
      <input aria-label={label} inputMode="numeric" maxLength={2} disabled={disabled} value={String(value).padStart(2, '0')} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setValue(Number(event.target.value.replace(/\D/g, '').slice(-2)) || 0)} className="timer-flip-input" />
    </div>
    <button type="button" aria-label={`Diminuir ${label}`} disabled={disabled || value <= 0} onClick={() => setValue(value - 1)} className={`timer-flip-step ${disabled ? 'invisible' : ''}`}>−</button>
    <span className="timer-flip-label">{label}</span>
  </div>
}

function TimerFlipDisplayComponent({ values, disabled, prominent = false, reducedMotion, transitionKey, onChange }: TimerFlipDisplayProps) {
  return <div className="timer-flip-display" aria-label="Tempo restante">
    {unitConfig.map(({ unit, label, max }) => <FlipTimeUnit key={unit} unit={unit} label={label} value={values[unit]} max={max} disabled={disabled} prominent={prominent} reducedMotion={reducedMotion} transitionKey={transitionKey} onChange={(value) => onChange(unit, value)} />)}
  </div>
}

export const TimerFlipDisplay = memo(TimerFlipDisplayComponent, (previous, next) => previous.values.hours === next.values.hours
  && previous.values.minutes === next.values.minutes
  && previous.values.seconds === next.values.seconds
  && previous.disabled === next.disabled
  && previous.prominent === next.prominent
  && previous.reducedMotion === next.reducedMotion
  && previous.transitionKey === next.transitionKey)
