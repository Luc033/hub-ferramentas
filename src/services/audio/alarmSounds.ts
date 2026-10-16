export const NATIVE_ALARM_SOUNDS = [
  { id: 'original', name: 'Alarme original', description: 'O alerta clássico do Hub.' },
  { id: 'aurora', name: 'Aurora', description: 'Melodia suave e ascendente.' },
  { id: 'digital-pulse', name: 'Pulso Digital', description: 'Pulsos eletrônicos e ritmados.' },
  { id: 'zen-bell', name: 'Sino Zen', description: 'Sinos espaçados e relaxantes.' },
  { id: 'retro', name: 'Retrô', description: 'Sequência curta inspirada em 8 bits.' },
  { id: 'crystal', name: 'Cristal', description: 'Notas brilhantes e descendentes.' },
] as const

export type NativeAlarmSoundId = typeof NATIVE_ALARM_SOUNDS[number]['id']
export type AlarmSoundId = NativeAlarmSoundId | 'custom'

export const isAlarmSoundId = (value: unknown): value is AlarmSoundId => value === 'custom' || NATIVE_ALARM_SOUNDS.some((sound) => sound.id === value)

export interface CustomAlarmSound {
  id: 'custom'
  name: string
  mimeType: string
  size: number
  data: ArrayBuffer
  updatedAt: number
}
