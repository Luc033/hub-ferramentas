import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { NotesView } from './NotesPage'
import { notesRepository } from '../../services/db/notesRepository'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'

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

test('copia a nota para um mapa escolhido sem modificar a nota original', async () => {
  vi.spyOn(notesRepository, 'saveNote').mockResolvedValue(undefined); vi.spyOn(mindMapsRepository, 'isEnabled').mockResolvedValue(true); vi.spyOn(mindMapsRepository, 'list').mockResolvedValue([{ id: 'map', schemaVersion: 1, name: 'Projeto', rootId: 'root', layout: 'radial', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1, topicCount: 1 }]); const add = vi.spyOn(mindMapsRepository, 'addTopicFromNote').mockResolvedValue({ map: {} as never, topics: [] })
  render(<NotesView notes={[first]} reload={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.click(screen.getByTitle('Criar tópico em um mapa mental')); await screen.findByRole('dialog'); fireEvent.click(screen.getAllByRole('button', { name: 'Criar tópico' }).at(-1)!)
  await waitFor(() => expect(add).toHaveBeenCalledWith('map', 'Primeira', 'Inicial')); expect(first).toEqual({ id: 'one', title: 'Primeira', content: 'Inicial', createdAt: 1, updatedAt: 1 })
})
