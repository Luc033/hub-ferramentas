import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SettingsProvider } from '../../app/providers/SettingsProvider'
import { clockService } from '../../services/clock/ClockService'
import { pomodoroService } from './pomodoroService'
import PomodoroPage from './PomodoroPage'

beforeEach(() => {
  localStorage.clear()
  clockService.reset()
  pomodoroService.endCycle()
})

afterAll(() => clockService.reset())

test('mostra o Flip Clock compartilhado do Pomodoro sem criar controles de edição', () => {
  const view = render(<MemoryRouter><SettingsProvider><PomodoroPage /></SettingsProvider></MemoryRouter>)
  expect(screen.getByText('Foco')).toBeInTheDocument()
  expect(view.container.querySelector('.flip-clock-display-2')).toBeInTheDocument()
  expect(view.container.querySelectorAll('.flip-clock-input')).toHaveLength(0)
  expect(view.container.querySelector('img[src*="logo-pomodoro"]')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Aumentar|Diminuir/ })).not.toBeInTheDocument()
})
