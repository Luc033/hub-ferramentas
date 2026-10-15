import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import type { MindMapDocument } from './types'
import MindMapsLibraryPage from './MindMapsLibraryPage'

const created: MindMapDocument = {
  map: { id: 'new-map', schemaVersion: 1, name: 'Projeto', rootId: 'root', layout: 'radial', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1 },
  topics: [{ id: 'root', mapId: 'new-map', parentId: null, order: 0, text: 'Projeto', collapsed: false, createdAt: 1, updatedAt: 1 }],
  connections: [],
}

function renderLibrary() {
  vi.spyOn(mindMapsRepository, 'isEnabled').mockResolvedValue(true); vi.spyOn(mindMapsRepository, 'list').mockResolvedValue([]); vi.spyOn(mindMapsRepository, 'subscribe').mockReturnValue(() => undefined)
  return render(<MemoryRouter initialEntries={['/notes/maps']}><Routes><Route path="/notes/maps" element={<MindMapsLibraryPage />} /><Route path="/notes/maps/:mapId" element={<p>Editor aberto</p>} /></Routes></MemoryRouter>)
}

afterEach(() => vi.restoreAllMocks())

test('permite criar mapa com nome opcional e usa o padrão quando vazio', async () => {
  const create = vi.spyOn(mindMapsRepository, 'create').mockResolvedValue(created); renderLibrary(); fireEvent.click(await screen.findByRole('button', { name: 'Novo mapa' })); expect(screen.getByRole('dialog', { name: 'Criar mapa mental' })).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Criar mapa' }))
  await waitFor(() => expect(create).toHaveBeenCalledWith(undefined)); expect(await screen.findByText('Editor aberto')).toBeInTheDocument()
})

test('preserva o nome após falha e permite tentar novamente', async () => {
  const create = vi.spyOn(mindMapsRepository, 'create').mockRejectedValueOnce(new Error('Armazenamento indisponível')).mockResolvedValue(created); renderLibrary(); fireEvent.click(await screen.findByRole('button', { name: 'Novo mapa' })); const input = screen.getByLabelText('Nome do novo mapa'); fireEvent.change(input, { target: { value: '  Projeto  ' } }); fireEvent.click(screen.getByRole('button', { name: 'Criar mapa' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Armazenamento indisponível'); expect(input).toHaveValue('  Projeto  '); fireEvent.click(screen.getByRole('button', { name: 'Criar mapa' })); await screen.findByText('Editor aberto'); expect(create).toHaveBeenNthCalledWith(1, 'Projeto'); expect(create).toHaveBeenNthCalledWith(2, 'Projeto')
})

test('Escape cancela a criação sem gravar um mapa', async () => {
  const create = vi.spyOn(mindMapsRepository, 'create').mockResolvedValue(created); renderLibrary(); fireEvent.click(await screen.findByRole('button', { name: 'Novo mapa' })); fireEvent.keyDown(screen.getByLabelText('Nome do novo mapa'), { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Criar mapa mental' })).not.toBeInTheDocument(); expect(create).not.toHaveBeenCalled()
})
