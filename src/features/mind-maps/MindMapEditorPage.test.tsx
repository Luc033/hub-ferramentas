import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import type { MindMapDocument } from './types'
import MindMapEditorPage from './MindMapEditorPage'

const document: MindMapDocument = {
  map: { id: 'map', schemaVersion: 1, name: 'Plano', rootId: 'root', layout: 'radial', viewport: { panX: 120, panY: 100, zoom: 1 }, createdAt: 1, updatedAt: 1 },
  topics: [{ id: 'root', mapId: 'map', parentId: null, order: 0, text: 'Plano', collapsed: false, createdAt: 1, updatedAt: 1 }],
}
const documentWithChildren: MindMapDocument = {
  ...document,
  topics: [document.topics[0], { id: 'a', mapId: 'map', parentId: 'root', order: 0, text: 'Primeiro', collapsed: false, createdAt: 2, updatedAt: 2 }, { id: 'b', mapId: 'map', parentId: 'root', order: 1, text: 'Segundo', collapsed: false, createdAt: 3, updatedAt: 3 }],
}

afterEach(() => vi.restoreAllMocks())

test('faz flush da edição inline ao sair do editor', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(document)
  const save = vi.spyOn(mindMapsRepository, 'save').mockResolvedValue(document)
  vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  const view = render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  const topic = await screen.findByRole('button', { name: /Tópico: Plano/ })
  fireEvent.doubleClick(topic)
  fireEvent.change(screen.getByLabelText('Editar tópico Plano'), { target: { value: 'Última ideia' } })
  view.unmount()
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ topics: [expect.objectContaining({ text: 'Última ideia' })] })))
})

test('atalho Tab cria filho e persiste a árvore', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(document)
  const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value)
  vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  const canvas = await screen.findByLabelText('Canvas do mapa mental')
  fireEvent.keyDown(canvas, { key: 'Tab' })
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ topics: expect.arrayContaining([expect.objectContaining({ parentId: 'root' })]) })))
})

test('alterna para posição manual persistindo as coordenadas atuais', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(documentWithChildren)
  const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value)
  vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Usar posição manual' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ map: expect.objectContaining({ layout: 'manual' }), topics: expect.arrayContaining([expect.objectContaining({ id: 'a', manualPosition: true, position: expect.any(Object) })]) })))
})

test('reordena por controle acessível sem depender de arraste', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(documentWithChildren)
  const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value)
  vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Tópico: Primeiro/ }))
  fireEvent.click(screen.getByRole('button', { name: /Mover para/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Abaixo' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ topics: expect.arrayContaining([expect.objectContaining({ id: 'a', order: 1 }), expect.objectContaining({ id: 'b', order: 0 })]) })))
})

test('pausa gravações ao detectar alteração do mesmo mapa em outra aba', async () => {
  let notifyExternal!: () => void
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(document)
  const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value)
  vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  vi.spyOn(mindMapsRepository, 'subscribeExternal').mockImplementation((_mapId, listener) => { notifyExternal = listener; return () => undefined })
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  const canvas = await screen.findByLabelText('Canvas do mapa mental'); act(() => notifyExternal())
  expect(screen.getByText(/alterado em outra aba/)).toBeInTheDocument(); fireEvent.keyDown(canvas, { key: 'Tab' })
  await screen.findByText(/Recarregue antes de continuar/); expect(save).not.toHaveBeenCalled()
})

test('não mostra Salvo após quota excedida e oferece exportação de recuperação', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(document); vi.spyOn(mindMapsRepository, 'save').mockRejectedValue(new DOMException('Cheio', 'QuotaExceededError')); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.keyDown(await screen.findByLabelText('Canvas do mapa mental'), { key: 'Tab' })
  expect(await screen.findByText(/armazenamento local está cheio/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Exportar recuperação' })).toBeInTheDocument(); expect(screen.getByText('Falha ao salvar')).toBeInTheDocument()
})
