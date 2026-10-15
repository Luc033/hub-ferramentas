export type Theme = 'dark' | 'light'

export interface Settings {
  theme: Theme
  soundEffects: boolean
  alarmVolume: number
  environmentVolume: number
  environmentMuted: boolean
  notificationsEnabled: boolean
  pomodoroAutoStart: boolean
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
}

export const SETTINGS_IMPORTED_EVENT = 'settings:imported'
const STORAGE_KEY = 'hub.settings.v1'

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark', soundEffects: true, alarmVolume: 60, environmentVolume: 30, environmentMuted: false,
  notificationsEnabled: false, pomodoroAutoStart: true, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15,
}

const validMinutes = (value: unknown, fallback: number, max: number) => typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(1, value)) : fallback

export function readStoredSettings(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return DEFAULT_SETTINGS
    const value = JSON.parse(saved) as Partial<Settings>
    return {
      theme: value.theme === 'light' ? 'light' : 'dark',
      soundEffects: typeof value.soundEffects === 'boolean' ? value.soundEffects : true,
      alarmVolume: typeof value.alarmVolume === 'number' ? Math.min(100, Math.max(0, value.alarmVolume)) : 60,
      environmentVolume: typeof value.environmentVolume === 'number' ? Math.min(100, Math.max(0, value.environmentVolume)) : 30,
      environmentMuted: typeof value.environmentMuted === 'boolean' ? value.environmentMuted : false,
      notificationsEnabled: typeof value.notificationsEnabled === 'boolean' ? value.notificationsEnabled : false,
      pomodoroAutoStart: typeof value.pomodoroAutoStart === 'boolean' ? value.pomodoroAutoStart : true,
      focusMinutes: validMinutes(value.focusMinutes, 25, 180),
      shortBreakMinutes: validMinutes(value.shortBreakMinutes, 5, 60),
      longBreakMinutes: validMinutes(value.longBreakMinutes, 15, 60),
    }
  } catch { return DEFAULT_SETTINGS }
}

export function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Settings>
  return ['dark', 'light'].includes(String(item.theme))
    && typeof item.soundEffects === 'boolean'
    && typeof item.alarmVolume === 'number' && Number.isFinite(item.alarmVolume) && item.alarmVolume >= 0 && item.alarmVolume <= 100
    && typeof item.environmentVolume === 'number' && Number.isFinite(item.environmentVolume) && item.environmentVolume >= 0 && item.environmentVolume <= 100
    && typeof item.environmentMuted === 'boolean' && typeof item.notificationsEnabled === 'boolean' && typeof item.pomodoroAutoStart === 'boolean'
    && Number.isInteger(item.focusMinutes) && item.focusMinutes! >= 1 && item.focusMinutes! <= 180
    && Number.isInteger(item.shortBreakMinutes) && item.shortBreakMinutes! >= 1 && item.shortBreakMinutes! <= 60
    && Number.isInteger(item.longBreakMinutes) && item.longBreakMinutes! >= 1 && item.longBreakMinutes! <= 60
}

export function persistSettings(settings: Settings) { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) }

export function applyStoredSettings(settings: Settings) {
  if (!isSettings(settings)) throw new Error('As preferências do backup são inválidas.')
  persistSettings(settings)
  window.dispatchEvent(new Event(SETTINGS_IMPORTED_EVENT))
}
