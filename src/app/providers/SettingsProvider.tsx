import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { persistSettings, readStoredSettings, SETTINGS_IMPORTED_EVENT, type Settings } from '../../services/settings/settingsStorage'
import { notificationsService } from '../../services/notifications/notificationsService'

interface SettingsContextValue {
  settings: Settings
  updateSettings: (change: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState(readStoredSettings)
  const updateSettings = (change: Partial<Settings>) => setSettings((current) => ({ ...current, ...change }))

  useEffect(() => {
    const reloadImportedSettings = () => setSettings(readStoredSettings())
    window.addEventListener(SETTINGS_IMPORTED_EVENT, reloadImportedSettings)
    return () => window.removeEventListener(SETTINGS_IMPORTED_EVENT, reloadImportedSettings)
  }, [])

  useEffect(() => {
    const reconcileNotificationPermission = () => setSettings((current) => current.notificationsEnabled && notificationsService.permission() !== 'granted' ? { ...current, notificationsEnabled: false } : current)
    reconcileNotificationPermission()
    window.addEventListener('focus', reconcileNotificationPermission)
    document.addEventListener('visibilitychange', reconcileNotificationPermission)
    return () => { window.removeEventListener('focus', reconcileNotificationPermission); document.removeEventListener('visibilitychange', reconcileNotificationPermission) }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#0a0f1c' : '#f8fafc')
    persistSettings(settings)
  }, [settings])

  const value = useMemo(() => ({ settings, updateSettings }), [settings])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings precisa estar dentro de SettingsProvider.')
  return value
}
