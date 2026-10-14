import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

export type Theme = 'dark' | 'light'

export interface Settings {
  theme: Theme
  soundEffects: boolean
  alarmVolume: number
  notificationsEnabled: boolean
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  soundEffects: true,
  alarmVolume: 60,
  notificationsEnabled: false,
}

const STORAGE_KEY = 'hub.settings.v1'

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return DEFAULT_SETTINGS
    const value = JSON.parse(saved) as Partial<Settings>
    return {
      theme: value.theme === 'light' ? 'light' : 'dark',
      soundEffects: typeof value.soundEffects === 'boolean' ? value.soundEffects : true,
      alarmVolume: typeof value.alarmVolume === 'number' ? Math.min(100, Math.max(0, value.alarmVolume)) : 60,
      notificationsEnabled: typeof value.notificationsEnabled === 'boolean' ? value.notificationsEnabled : false,
    }
  } catch { return DEFAULT_SETTINGS }
}

interface SettingsContextValue {
  settings: Settings
  updateSettings: (change: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState(loadSettings)
  const updateSettings = (change: Partial<Settings>) => setSettings((current) => ({ ...current, ...change }))

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#0a0f1c' : '#f8fafc')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const value = useMemo(() => ({ settings, updateSettings }), [settings])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings precisa estar dentro de SettingsProvider.')
  return value
}
