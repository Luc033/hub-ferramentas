import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SettingsProvider } from '../../app/providers/SettingsProvider'
import { clockService } from '../../services/clock/ClockService'
import TimerPage from './TimerPage'

function renderTimer() {
  return render(<MemoryRouter><SettingsProvider><TimerPage /></SettingsProvider></MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  clockService.reset()
})

afterAll(() => clockService.reset())

test('aplica presets e permite ajustar a duração diretamente no círculo', () => {
  renderTimer()
  expect(screen.getByRole('button', { name: 'Iniciar' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '5 min' }))
  expect(screen.getByLabelText('MIN')).toHaveValue('05')
  expect(screen.getByRole('button', { name: 'Iniciar' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar SEG' }))
  expect(screen.getByLabelText('SEG')).toHaveValue('01')
  expect(clockService.getSnapshot()).toMatchObject({ status: 'ready', durationMs: 301_000 })
})

test('modo foco oculta informações secundárias e permite retornar', () => {
  renderTimer()
  expect(screen.getByText('Duração total')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('switch', { name: 'Ativar modo foco' }))
  expect(screen.queryByText('Duração total')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '5 min' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sair do modo foco' }))
  expect(screen.getByText('Duração total')).toBeInTheDocument()
})

test('oculta os controles de incremento durante a execução e ativa o progresso líquido', () => {
  clockService.setDuration(60_000)
  clockService.start()
  renderTimer()
  expect(screen.getByRole('button', { name: 'Aumentar MIN' })).toHaveClass('invisible')
  expect(screen.getByTestId('timer-progress')).toHaveClass('timer-progress-liquid')
})

test('usa o logotipo do Temporizador no cabeçalho', () => {
  const view = renderTimer()
  expect(view.container.querySelector('img[src*="logo-timer"]')).toBeInTheDocument()
})

test('abre o histórico pelo botão do cabeçalho e fecha ao clicar fora', () => {
  renderTimer()
  expect(screen.queryByLabelText('Histórico do timer')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Abrir histórico do timer' }))
  expect(screen.getByLabelText('Histórico do timer')).toBeInTheDocument()
  fireEvent.mouseDown(screen.getByTestId('timer-history-dropdown'))
  expect(screen.queryByLabelText('Histórico do timer')).not.toBeInTheDocument()
})
