import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import type { MindMapDocument } from './types'
import MindMapEditorPage from './MindMapEditorPage'

const document: MindMapDocument = {
  map: { id: 'map', schemaVersion: 1, name: 'Plano', rootId: 'root', layout: 'radial', viewport: { panX: 120, panY: 100, zoom: 1 }, createdAt: 1, updatedAt: 1 },
  topics: [{ id: 'root', mapId: 'map', parentId: null, order: 0, text: 'Plano', collapsed: false, createdAt: 1, updatedAt: 1 }],
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
