import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsProvider } from '../../app/providers/SettingsProvider'
import { SettingsPanel } from './SettingsPanel'

const backupMocks = vi.hoisted(() => ({
  download: vi.fn(),
  parse: vi.fn(),
  importData: vi.fn(),
}))

vi.mock('../../services/backup/backupService', () => ({
  downloadBackup: backupMocks.download,
  parseBackup: backupMocks.parse,
  importBackup: backupMocks.importData,
}))

beforeEach(() => {
  localStorage.clear()
  backupMocks.download.mockReset().mockResolvedValue({ records: { habits: [{ id: 'a' }], tasks: [] } })
  backupMocks.parse.mockReset().mockReturnValue({ records: { habits: [] } })
  backupMocks.importData.mockReset().mockResolvedValue({ imported: 2, ignored: 1, preferencesImported: true })
})

test('exporta e importa backup completo pelo painel global', async () => {
  render(<SettingsProvider><SettingsPanel /></SettingsProvider>)
  fireEvent.click(screen.getByLabelText('Abrir configurações'))

  fireEvent.click(screen.getByRole('button', { name: 'Exportar dados (.json)' }))
  expect(await screen.findByText('Backup baixado com 1 registro(s).')).toBeInTheDocument()

  const file = Object.assign(new File(['{}'], 'backup.json', { type: 'application/json' }), { text: () => Promise.resolve('{}') })
  fireEvent.change(screen.getByLabelText('Selecionar arquivo de backup'), { target: { files: [file] } })
  await waitFor(() => expect(backupMocks.importData).toHaveBeenCalledWith(expect.anything(), 'merge'))
  expect(screen.getByText('2 registro(s) importado(s); 1 preservado(s). Preferências aplicadas.')).toBeInTheDocument()
})
