import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { NotesView } from './NotesPage'
import { notesRepository } from '../../services/db/notesRepository'

const first = { id: 'one', title: 'Primeira', content: 'Inicial', createdAt: 1, updatedAt: 1 }
const second = { id: 'two', title: 'Segunda', content: 'Outra', createdAt: 2, updatedAt: 2 }

afterEach(() => vi.restoreAllMocks())

test('faz flush do rascunho ao desmontar', async () => {
  const save = vi.spyOn(notesRepository, 'saveNote').mockResolvedValue(undefined)
  const view = render(<NotesView notes={[first]} reload={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.change(screen.getByLabelText('Conteúdo da nota'), { target: { value: 'Última edição' } })
  view.unmount()
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'one', content: 'Última edição' })))
})

test('preserva o rascunho e permite tentar novamente após falha', async () => {
  const save = vi.spyOn(notesRepository, 'saveNote').mockRejectedValueOnce(new Error('Quota indisponível')).mockResolvedValue(undefined)
  render(<NotesView notes={[first, second]} reload={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.change(screen.getByLabelText('Conteúdo da nota'), { target: { value: 'Não perder' } })
  fireEvent.click(screen.getByRole('button', { name: /Segunda/ }))
  await screen.findByText(/Falha ao salvar: Quota indisponível/)
  expect(screen.getByLabelText('Conteúdo da nota')).toHaveValue('Não perder')
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  await screen.findByText('Salvo')
})

test('serializa gravações para uma versão antiga não sobrescrever a mais nova', async () => {
  let releaseFirst!: () => void
  const firstSave = new Promise<void>((resolve) => { releaseFirst = resolve })
  const save = vi.spyOn(notesRepository, 'saveNote').mockReturnValueOnce(firstSave).mockResolvedValue(undefined)
  const view = render(<NotesView notes={[first]} reload={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.change(screen.getByLabelText('Conteúdo da nota'), { target: { value: 'Versão A' } })
  act(() => window.dispatchEvent(new Event('pagehide')))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ content: 'Versão A' })))
  fireEvent.change(screen.getByLabelText('Conteúdo da nota'), { target: { value: 'Versão B' } })
  view.unmount()
  releaseFirst()
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'Versão B' })))
  expect(save.mock.calls.map(([note]) => note.content)).toEqual(['Versão A', 'Versão B'])
})
