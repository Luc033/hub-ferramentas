import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { mindMapsRepository } from '../../services/db/mindMapsRepository'
import { notesRepository } from '../../services/db/notesRepository'
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

test('cria tópico flutuante no centro visível sem exigir seleção', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(document); const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Criar tópico flutuante no centro' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ topics: expect.arrayContaining([expect.objectContaining({ parentId: null, manualPosition: true, position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }) })]) })))
})

test('abre ajuda pelo atalho de interrogação e fecha com Escape', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(document); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  const canvas = (render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>), await screen.findByLabelText('Canvas do mapa mental'))
  fireEvent.keyDown(canvas, { key: '?' }); expect(screen.getByRole('dialog', { name: 'Atalhos do editor' })).toBeInTheDocument(); fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('edita e reordena tópicos diretamente pelo Outline', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(documentWithChildren); const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Alternar Outline' })); const outline = screen.getByLabelText('Outline do mapa'); fireEvent.click(within(outline).getByRole('button', { name: /^Primeiro$/ })); fireEvent.doubleClick(within(outline).getByRole('button', { name: /^Primeiro$/ })); const input = screen.getByLabelText('Editar Primeiro no Outline'); fireEvent.change(input, { target: { value: 'Primeiro revisado' } }); fireEvent.blur(input)
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ topics: expect.arrayContaining([expect.objectContaining({ id: 'a', text: 'Primeiro revisado' })]) })))
  await waitFor(() => expect(screen.getByText('Salvo')).toBeInTheDocument()); fireEvent.click(within(outline).getByRole('button', { name: 'Mover para baixo' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ topics: expect.arrayContaining([expect.objectContaining({ id: 'a', order: 1 })]) })))
})

test('indica se a busca encontrou conteúdo na nota sem expor o texto inteiro', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue({ ...documentWithChildren, topics: documentWithChildren.topics.map((topic) => topic.id === 'a' ? { ...topic, note: 'segredo pesquisável extenso' } : topic) }); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined); vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Buscar tópicos' })); fireEvent.change(screen.getByPlaceholderText('Digite um termo'), { target: { value: 'segredo' } })
  expect(screen.getByText('Nota · correspondência encontrada')).toBeInTheDocument(); expect(screen.queryByText('segredo pesquisável extenso')).not.toBeInTheDocument()
})

test('seleciona múltiplos tópicos com Shift e arraste no canvas', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(documentWithChildren); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  const canvas = await screen.findByLabelText('Canvas do mapa mental'); Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() })
  const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, shiftKey: true }); Object.defineProperty(event, 'pointerId', { value: 1 }); fireEvent(canvas, event) }
  pointer('pointerdown', -1000, -1000); pointer('pointermove', 2000, 2000); pointer('pointerup', 2000, 2000)
  expect(screen.getByText('3 selecionados')).toBeInTheDocument()
})

test('exclui um tópico preservando e promovendo seus filhos', async () => {
  const nested: MindMapDocument = { ...document, topics: [document.topics[0], { id: 'parent', mapId: 'map', parentId: 'root', order: 0, text: 'Pai', collapsed: false, createdAt: 2, updatedAt: 2 }, { id: 'child', mapId: 'map', parentId: 'parent', order: 0, text: 'Filho', collapsed: false, createdAt: 3, updatedAt: 3 }] }
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(nested); const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Tópico: Pai/ })); fireEvent.click(screen.getByRole('button', { name: 'Excluir' })); fireEvent.click(screen.getByRole('button', { name: 'Excluir tópico e manter filhos' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ topics: expect.arrayContaining([expect.objectContaining({ id: 'child', parentId: 'root', order: 0 })]) }))); expect(screen.queryByRole('button', { name: /Tópico: Pai/ })).not.toBeInTheDocument()
})

test('cria anotação textual a partir do tópico selecionado sem alterar o mapa', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(documentWithChildren); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined); vi.spyOn(notesRepository, 'isEnabled').mockResolvedValue(true); const createNote = vi.spyOn(notesRepository, 'createNote').mockResolvedValue({ id: 'note', title: 'Plano', content: '', createdAt: 1, updatedAt: 1 })
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Criar nota' })); await waitFor(() => expect(createNote).toHaveBeenCalledWith('Plano', expect.stringContaining('- Primeiro'))); expect(screen.getByText('Anotação criada sem alterar o mapa.')).toBeInTheDocument()
})

test('Escape cancela uma conexão antes de limpar a seleção', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(documentWithChildren); vi.spyOn(mindMapsRepository, 'isAdvancedEnabled').mockResolvedValue(true); vi.spyOn(mindMapsRepository, 'getAssets').mockResolvedValue([]); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  const canvas = await screen.findByLabelText('Canvas do mapa mental'); fireEvent.click(screen.getByRole('button', { name: 'Conectar' })); expect(screen.getByText('Selecione o destino')).toBeInTheDocument(); fireEvent.keyDown(canvas, { key: 'Escape' })
  expect(screen.queryByText('Selecione o destino')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Conectar' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Tópico: Plano/ })).toHaveAttribute('aria-pressed', 'true')
})

test('tecla zero restaura o zoom sem reenquadrar o mapa', async () => {
  const zoomed = { ...document, map: { ...document.map, viewport: { panX: 120, panY: 80, zoom: 2 } } }
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(zoomed); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  const canvas = await screen.findByLabelText('Canvas do mapa mental'); expect(screen.getByText('200%')).toBeInTheDocument(); fireEvent.keyDown(canvas, { key: '0' }); expect(screen.getByText('100%')).toBeInTheDocument(); expect(canvas.firstElementChild).toHaveStyle({ transform: 'translate(60px, 40px) scale(1)' })
})

test('roda com modificador ancora o zoom na posição do cursor', async () => {
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(document); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  const canvas = await screen.findByLabelText('Canvas do mapa mental'); fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -100, clientX: 420, clientY: 260 })
  expect(screen.getByText('110%')).toBeInTheDocument(); expect(canvas.firstElementChild).toHaveStyle({ transform: 'translate(90px, 84px) scale(1.1)' })
})

test('seleciona uma conexão pelo canvas e permite excluí-la pelo teclado', async () => {
  const connected: MindMapDocument = { ...documentWithChildren, connections: [{ id: 'edge', mapId: 'map', sourceId: 'root', targetId: 'a', label: 'depende de', color: '#a78bfa', width: 2, dashed: false, directed: true, createdAt: 4, updatedAt: 4 }] }
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(connected); vi.spyOn(mindMapsRepository, 'isAdvancedEnabled').mockResolvedValue(true); vi.spyOn(mindMapsRepository, 'getAssets').mockResolvedValue([]); const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  const canvas = await screen.findByLabelText('Canvas do mapa mental'); const connection = screen.getByRole('button', { name: 'Conexão de Plano para Primeiro' }); fireEvent.click(connection)
  expect(connection).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByLabelText('Conexão selecionada')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /Tópico: Plano/ })); expect(connection).toHaveAttribute('aria-pressed', 'false'); fireEvent.keyDown(connection, { key: 'Enter' }); expect(connection).toHaveAttribute('aria-pressed', 'true'); fireEvent.keyDown(canvas, { key: 'Delete' })
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ connections: [] }))); expect(screen.queryByRole('button', { name: 'Conexão de Plano para Primeiro' })).not.toBeInTheDocument()
})

test('bloqueia conexão duplicada no sentido inverso com feedback visível', async () => {
  const connected: MindMapDocument = { ...documentWithChildren, connections: [{ id: 'edge', mapId: 'map', sourceId: 'root', targetId: 'a', label: '', color: '#a78bfa', width: 2, dashed: false, directed: false, createdAt: 4, updatedAt: 4 }] }
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(connected); vi.spyOn(mindMapsRepository, 'isAdvancedEnabled').mockResolvedValue(true); vi.spyOn(mindMapsRepository, 'getAssets').mockResolvedValue([]); const save = vi.spyOn(mindMapsRepository, 'save').mockImplementation(async (value) => value); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Tópico: Primeiro/ })); fireEvent.click(screen.getByRole('button', { name: 'Conectar' })); fireEvent.click(screen.getByRole('button', { name: /Tópico: Plano/ }))
  expect(screen.getByRole('alert')).toHaveTextContent('Já existe uma conexão entre esses tópicos.'); expect(save).not.toHaveBeenCalled()
})

test('sair do modo foco restaura viewport e seleção anteriores', async () => {
  const nested: MindMapDocument = { ...documentWithChildren, topics: [...documentWithChildren.topics, { id: 'child', mapId: 'map', parentId: 'a', order: 0, text: 'Detalhe', collapsed: false, createdAt: 4, updatedAt: 4 }] }
  vi.spyOn(mindMapsRepository, 'get').mockResolvedValue(nested); vi.spyOn(mindMapsRepository, 'saveViewport').mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/notes/maps/map']}><Routes><Route path="/notes/maps/:mapId" element={<MindMapEditorPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Tópico: Primeiro/ })); fireEvent.click(screen.getByRole('button', { name: 'Focar' })); expect(screen.queryByRole('button', { name: /Tópico: Plano/ })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /Tópico: Detalhe/ }))
  const canvas = screen.getByLabelText('Canvas do mapa mental'); fireEvent.keyDown(canvas, { key: '+' }); expect(screen.getByText('110%')).toBeInTheDocument(); fireEvent.keyDown(canvas, { key: 'Escape' })
  expect(screen.getByText('100%')).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Tópico: Plano/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Tópico: Primeiro/ })).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByRole('button', { name: /Tópico: Detalhe/ })).toHaveAttribute('aria-pressed', 'false'); expect(screen.getByRole('button', { name: 'Focar' })).toBeInTheDocument()
})
