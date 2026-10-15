import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { MindMapDocument } from './types'
import { MindMapPropertiesPanel } from './MindMapPropertiesPanel'

const document: MindMapDocument = {
  map: { id: 'map', schemaVersion: 1, name: 'Mapa', rootId: 'root', layout: 'radial', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1 },
  topics: [{ id: 'root', mapId: 'map', parentId: null, order: 0, text: 'Raiz', collapsed: false, createdAt: 1, updatedAt: 1 }],
  connections: [{ id: 'edge', mapId: 'map', sourceId: 'root', targetId: 'child', label: '', color: '#a78bfa', width: 2, dashed: false, directed: false, createdAt: 1, updatedAt: 1 }],
}

test('expõe estilos completos do tópico e da conexão', () => {
  const onTopic = vi.fn(); const onConnection = vi.fn()
  render(<MindMapPropertiesPanel document={document} selected={document.topics[0]} advancedEnabled imageMessage="" onClose={vi.fn()} onTheme={vi.fn()} onTopic={onTopic} onTopicNote={vi.fn()} onConnection={onConnection} onRemoveConnection={vi.fn()} onAddLink={vi.fn()} onUploadImage={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Espessura da borda'), { target: { value: '4' } }); expect(onTopic).toHaveBeenCalledWith({ style: expect.objectContaining({ borderWidth: 4 }) })
  fireEvent.change(screen.getByLabelText('Alinhamento do texto'), { target: { value: 'left' } }); expect(onTopic).toHaveBeenCalledWith({ style: expect.objectContaining({ textAlign: 'left' }) })
  fireEvent.change(screen.getByLabelText('Formato da conexão'), { target: { value: 'straight' } }); expect(onConnection).toHaveBeenCalledWith('edge', { shape: 'straight' })
  fireEvent.click(screen.getByRole('button', { name: 'Seta inicial' })); expect(onConnection).toHaveBeenCalledWith('edge', { startMarker: true })
})

test('mantém o formulário aberto em erro e entrega somente link seguro', () => {
  const onAddLink = vi.fn()
  render(<MindMapPropertiesPanel document={document} selected={document.topics[0]} advancedEnabled imageMessage="" onClose={vi.fn()} onTheme={vi.fn()} onTopic={vi.fn()} onTopicNote={vi.fn()} onConnection={vi.fn()} onRemoveConnection={vi.fn()} onAddLink={onAddLink} onUploadImage={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar link' })); fireEvent.change(screen.getByPlaceholderText('https://exemplo.com'), { target: { value: 'javascript:alert(1)' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar link' }))
  expect(screen.getByRole('alert')).toHaveTextContent('http ou https'); expect(onAddLink).not.toHaveBeenCalled()
  fireEvent.change(screen.getByPlaceholderText('https://exemplo.com'), { target: { value: 'https://example.com/guia' } }); fireEvent.change(screen.getByPlaceholderText('Usar domínio'), { target: { value: 'Guia seguro' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar link' }))
  expect(onAddLink).toHaveBeenCalledWith({ label: 'Guia seguro', url: 'https://example.com/guia' }); expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('agrupa a digitação da nota e faz flush ao fechar o painel', () => {
  vi.useFakeTimers(); const onTopicNote = vi.fn(); const onClose = vi.fn()
  render(<MindMapPropertiesPanel document={document} selected={document.topics[0]} advancedEnabled imageMessage="" onClose={onClose} onTheme={vi.fn()} onTopic={vi.fn()} onTopicNote={onTopicNote} onConnection={vi.fn()} onRemoveConnection={vi.fn()} onAddLink={vi.fn()} onUploadImage={vi.fn()} />)
  const note = screen.getByPlaceholderText('Detalhes em texto simples'); fireEvent.change(note, { target: { value: 'primeira' } }); fireEvent.change(note, { target: { value: 'versão final' } }); act(() => vi.advanceTimersByTime(499)); expect(onTopicNote).not.toHaveBeenCalled(); act(() => vi.advanceTimersByTime(1)); expect(onTopicNote).toHaveBeenCalledTimes(1); expect(onTopicNote).toHaveBeenLastCalledWith('root', 'versão final')
  fireEvent.change(note, { target: { value: 'antes de fechar' } }); fireEvent.click(screen.getByRole('button', { name: 'Fechar propriedades' })); expect(onTopicNote).toHaveBeenCalledTimes(2); expect(onTopicNote).toHaveBeenLastCalledWith('root', 'antes de fechar'); expect(onClose).toHaveBeenCalled()
  vi.useRealTimers()
})

test('salva a nota no tópico original antes de trocar a seleção', () => {
  const onTopicNote = vi.fn(); const child = { ...document.topics[0], id: 'child', parentId: 'root', text: 'Filho', note: 'Nota do filho' }; const nextDocument = { ...document, topics: [...document.topics, child] }
  const view = render(<MindMapPropertiesPanel document={document} selected={document.topics[0]} advancedEnabled imageMessage="" onClose={vi.fn()} onTheme={vi.fn()} onTopic={vi.fn()} onTopicNote={onTopicNote} onConnection={vi.fn()} onRemoveConnection={vi.fn()} onAddLink={vi.fn()} onUploadImage={vi.fn()} />)
  fireEvent.change(screen.getByPlaceholderText('Detalhes em texto simples'), { target: { value: 'Rascunho da raiz' } })
  view.rerender(<MindMapPropertiesPanel document={nextDocument} selected={child} advancedEnabled imageMessage="" onClose={vi.fn()} onTheme={vi.fn()} onTopic={vi.fn()} onTopicNote={onTopicNote} onConnection={vi.fn()} onRemoveConnection={vi.fn()} onAddLink={vi.fn()} onUploadImage={vi.fn()} />)
  expect(onTopicNote).toHaveBeenCalledWith('root', 'Rascunho da raiz'); expect(screen.getByPlaceholderText('Detalhes em texto simples')).toHaveValue('Nota do filho')
})
