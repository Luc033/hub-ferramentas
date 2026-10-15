import { fireEvent, render, screen } from '@testing-library/react'
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
  render(<MindMapPropertiesPanel document={document} selected={document.topics[0]} advancedEnabled imageMessage="" onClose={vi.fn()} onTheme={vi.fn()} onTopic={onTopic} onConnection={onConnection} onRemoveConnection={vi.fn()} onAddLink={vi.fn()} onUploadImage={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Espessura da borda'), { target: { value: '4' } }); expect(onTopic).toHaveBeenCalledWith({ style: expect.objectContaining({ borderWidth: 4 }) })
  fireEvent.change(screen.getByLabelText('Alinhamento do texto'), { target: { value: 'left' } }); expect(onTopic).toHaveBeenCalledWith({ style: expect.objectContaining({ textAlign: 'left' }) })
  fireEvent.change(screen.getByLabelText('Formato da conexão'), { target: { value: 'straight' } }); expect(onConnection).toHaveBeenCalledWith('edge', { shape: 'straight' })
  fireEvent.click(screen.getByRole('button', { name: 'Seta inicial' })); expect(onConnection).toHaveBeenCalledWith('edge', { startMarker: true })
})

test('mantém o formulário aberto em erro e entrega somente link seguro', () => {
  const onAddLink = vi.fn()
  render(<MindMapPropertiesPanel document={document} selected={document.topics[0]} advancedEnabled imageMessage="" onClose={vi.fn()} onTheme={vi.fn()} onTopic={vi.fn()} onConnection={vi.fn()} onRemoveConnection={vi.fn()} onAddLink={onAddLink} onUploadImage={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar link' })); fireEvent.change(screen.getByPlaceholderText('https://exemplo.com'), { target: { value: 'javascript:alert(1)' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar link' }))
  expect(screen.getByRole('alert')).toHaveTextContent('http ou https'); expect(onAddLink).not.toHaveBeenCalled()
  fireEvent.change(screen.getByPlaceholderText('https://exemplo.com'), { target: { value: 'https://example.com/guia' } }); fireEvent.change(screen.getByPlaceholderText('Usar domínio'), { target: { value: 'Guia seguro' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar link' }))
  expect(onAddLink).toHaveBeenCalledWith({ label: 'Guia seguro', url: 'https://example.com/guia' }); expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
