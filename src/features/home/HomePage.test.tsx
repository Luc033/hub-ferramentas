import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { SettingsProvider } from '../../app/providers/SettingsProvider'
import { toolRegistry } from '../../app/toolRegistry'
import { focusSoundService } from '../../services/audio/focusSoundService'
import { ToolCard } from './HomePage'

const renderCard = (id: 'tasks' | 'sounds', error?: string, onRetry = vi.fn()) => render(<SettingsProvider><MemoryRouter><ToolCard tool={toolRegistry.find((tool) => tool.id === id)!} habitSummary={null} tasksSummary={{ enabled: true, total: 1, todo: 1, doing: 0, completedToday: 0 }} notesSummary={null} error={error} onRetry={onRetry} /></MemoryRouter></SettingsProvider>)

afterEach(() => { act(() => focusSoundService.stop()) })

test('widget com falha mantém retry independente', () => {
  const retry = vi.fn(); renderCard('tasks', 'IndexedDB indisponível', retry)
  expect(screen.getByText('Falha ao carregar os dados locais.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(retry).toHaveBeenCalledOnce()
})

test('widget de sons encerra a fonte global pela ação Parar', () => {
  focusSoundService.playSoundCloud({ id: 'one', url: 'https://soundcloud.com/artist/sets/one', title: 'One', author: 'Artist', category: 'Lo-fi', createdAt: 1 })
  renderCard('sounds')
  fireEvent.click(screen.getByRole('button', { name: 'Parar' }))
  expect(focusSoundService.getSnapshot()).toMatchObject({ source: null, status: 'stopped' })
})

test('cartão de Hábitos usa o logotipo de imagem e o novo nome', () => {
  const tool = toolRegistry.find((item) => item.id === 'habits')!
  const view = render(<SettingsProvider><MemoryRouter><ToolCard tool={tool} habitSummary={{ total: 0, completedToday: 0 }} tasksSummary={null} notesSummary={null} onRetry={vi.fn()} /></MemoryRouter></SettingsProvider>)
  expect(screen.getByRole('heading', { name: 'Hábitos' })).toBeInTheDocument()
  expect(view.container.querySelector('img[src*="logo-habitos"]')).toBeInTheDocument()
})

test('cartão de Foco Pomodoro usa o logotipo de imagem', () => {
  const tool = toolRegistry.find((item) => item.id === 'pomodoro')!
  const view = render(<SettingsProvider><MemoryRouter><ToolCard tool={tool} habitSummary={null} tasksSummary={null} notesSummary={null} onRetry={vi.fn()} /></MemoryRouter></SettingsProvider>)
  expect(screen.getByRole('heading', { name: 'Foco Pomodoro' })).toBeInTheDocument()
  expect(view.container.querySelector('img[src*="logo-pomodoro"]')).toBeInTheDocument()
})

test('cartão de Temporizador usa o logotipo de imagem', () => {
  const tool = toolRegistry.find((item) => item.id === 'timer')!
  const view = render(<SettingsProvider><MemoryRouter><ToolCard tool={tool} habitSummary={null} tasksSummary={null} notesSummary={null} onRetry={vi.fn()} /></MemoryRouter></SettingsProvider>)
  expect(screen.getByRole('heading', { name: 'Temporizador' })).toBeInTheDocument()
  expect(view.container.querySelector('img[src*="logo-timer"]')).toBeInTheDocument()
})

test('cartão de Kanban usa o logotipo de imagem', () => {
  const tool = toolRegistry.find((item) => item.id === 'tasks')!
  const view = render(<SettingsProvider><MemoryRouter><ToolCard tool={tool} habitSummary={null} tasksSummary={null} notesSummary={null} onRetry={vi.fn()} /></MemoryRouter></SettingsProvider>)
  expect(screen.getByRole('heading', { name: 'Kanban' })).toBeInTheDocument()
  expect(view.container.querySelector('img[src*="logo-kanban"]')).toBeInTheDocument()
})

test('cartão de Anotações e Mapa Mental usa o logotipo de imagem', () => {
  const tool = toolRegistry.find((item) => item.id === 'notes')!
  const view = render(<SettingsProvider><MemoryRouter><ToolCard tool={tool} habitSummary={null} tasksSummary={null} notesSummary={null} onRetry={vi.fn()} /></MemoryRouter></SettingsProvider>)
  expect(screen.getByRole('heading', { name: 'Anotações / Mapa Mental' })).toBeInTheDocument()
  expect(view.container.querySelector('img[src*="logo-mapa"]')).toBeInTheDocument()
})
