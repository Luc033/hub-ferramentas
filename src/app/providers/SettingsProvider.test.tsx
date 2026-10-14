import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSettings, SettingsProvider } from './SettingsProvider'

function SettingsHarness() {
  const { settings, updateSettings } = useSettings()
  return <button onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>{settings.theme}</button>
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.dataset.theme = 'dark'
})

test('usa dark como padrão e persiste a escolha explícita', async () => {
  render(<SettingsProvider><SettingsHarness /></SettingsProvider>)
  expect(screen.getByRole('button')).toHaveTextContent('dark')
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
  expect(JSON.parse(localStorage.getItem('hub.settings.v1') ?? '{}').theme).toBe('light')
})

test('restaura preferências válidas e limita o volume', () => {
  localStorage.setItem('hub.settings.v1', JSON.stringify({ theme: 'light', soundEffects: false, alarmVolume: 200, notificationsEnabled: true }))
  render(<SettingsProvider><SettingsHarness /></SettingsProvider>)
  expect(screen.getByRole('button')).toHaveTextContent('light')
  expect(JSON.parse(localStorage.getItem('hub.settings.v1') ?? '{}').alarmVolume).toBe(100)
})
