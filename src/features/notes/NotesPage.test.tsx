import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { NotesView } from './NotesPage'
import { notesRepository } from '../../services/db/notesRepository'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import { normalizeNote, type Note, type NoteBlock } from './types'

vi.mock('./RichTextEditor', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return { RichTextEditor: forwardRef(function TestEditor({ note, onChange }: { note: Note; onChange: (blocks: NoteBlock[], text: string) => void }, ref) {
    useImperativeHandle(ref, () => ({ focus: vi.fn(), html: () => `<p>${note.content}</p>`, markdown: () => note.content, blocks: () => note.blocks }))
    return <textarea aria-label="Conteúdo da nota" value={note.content} onChange={(event) => onChange([{ id: crypto.randomUUID(), type: 'paragraph', content: [{ type: 'text', text: event.target.value, styles: {} }] }], event.target.value)} />
  }) }
})

const first = normalizeNote({ id: 'one', title: 'Primeira', content: 'Inicial', createdAt: 1, updatedAt: 1 })
const second = normalizeNote({ id: 'two', title: 'Segunda', content: 'Outra', createdAt: 2, updatedAt: 2 })
const saved = (note: Note): Note => ({ ...note, revision: note.revision + 1, updatedAt: Date.now() })

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  vi.spyOn(notesRepository, 'getFolders').mockResolvedValue([])
  vi.spyOn(notesRepository, 'getTags').mockResolvedValue([])
  vi.spyOn(notesRepository, 'getMeta').mockResolvedValue('updated')
})

test('faz flush do rascunho ao desmontar', async () => {
  const save = vi.spyOn(notesRepository, 'saveNote').mockImplementation(async (note) => saved(note))
  const view = render(<NotesView notes={[first]} reload={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.change(screen.getByLabelText('Conteúdo da nota'), { target: { value: 'Última edição' } })
  view.unmount()
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'one', content: 'Última edição' })))
})

test('preserva o rascunho e permite tentar novamente após falha', async () => {
  const save = vi.spyOn(notesRepository, 'saveNote').mockRejectedValueOnce(new Error('Quota indisponível')).mockImplementation(async (note) => saved(note))
  render(<NotesView notes={[first, second]} reload={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.change(screen.getByLabelText('Conteúdo da nota'), { target: { value: 'Não perder' } })
  fireEvent.click(screen.getByRole('option', { name: /Segunda/ }))
  await screen.findByText(/Não foi possível salvar · Quota indisponível/)
  expect(screen.getByLabelText('Conteúdo da nota')).toHaveValue('Não perder')
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  await screen.findByText(/Salvo/)
})

test('serializa gravações para uma versão antiga não sobrescrever a mais nova', async () => {
  let releaseFirst!: (note: Note) => void
  const firstSave = new Promise<Note>((resolve) => { releaseFirst = resolve })
  const save = vi.spyOn(notesRepository, 'saveNote').mockReturnValueOnce(firstSave).mockImplementation(async (note) => saved(note))
  const view = render(<NotesView notes={[first]} reload={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.change(screen.getByLabelText('Conteúdo da nota'), { target: { value: 'Versão A' } })
  act(() => window.dispatchEvent(new Event('pagehide')))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ content: 'Versão A' })))
  fireEvent.change(screen.getByLabelText('Conteúdo da nota'), { target: { value: 'Versão B' } })
  view.unmount()
  releaseFirst(saved(save.mock.calls[0][0]))
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'Versão B' })))
  expect(save.mock.calls.map(([note]) => note.content)).toEqual(['Versão A', 'Versão B'])
})

test('copia a nota para um mapa escolhido sem modificar a nota original', async () => {
  vi.spyOn(notesRepository, 'saveNote').mockImplementation(async (note) => saved(note))
  vi.spyOn(mindMapsRepository, 'isEnabled').mockResolvedValue(true)
  vi.spyOn(mindMapsRepository, 'list').mockResolvedValue([{ id: 'map', schemaVersion: 1, name: 'Projeto', rootId: 'root', layout: 'radial', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1, topicCount: 1 }])
  const add = vi.spyOn(mindMapsRepository, 'addTopicFromNote').mockResolvedValue({ map: {} as never, topics: [] })
  render(<NotesView notes={[first]} reload={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Criar tópico em mapa' }))
  await screen.findByRole('dialog')
  fireEvent.click(screen.getByRole('button', { name: 'Criar tópico' }))
  await waitFor(() => expect(add).toHaveBeenCalledWith('map', 'Primeira', 'Inicial'))
  expect(first.content).toBe('Inicial')
})
