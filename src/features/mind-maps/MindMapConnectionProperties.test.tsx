import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { MindMapConnectionProperties } from './MindMapConnectionProperties'
import type { MindMapConnection } from './types'

const connection: MindMapConnection = { id: 'edge', mapId: 'map', sourceId: 'root', targetId: 'child', label: '', color: '#a78bfa', width: 2, dashed: false, directed: false, createdAt: 1, updatedAt: 1 }

test('agrupa a digitação do rótulo e faz flush ao desmontar', () => {
  vi.useFakeTimers(); const onChange = vi.fn()
  const view = render(<MindMapConnectionProperties connection={connection} selected onChange={onChange} onRemove={vi.fn()} />)
  const input = screen.getByLabelText('Rótulo da conexão'); fireEvent.change(input, { target: { value: 'depende' } }); fireEvent.change(input, { target: { value: 'depende de' } }); act(() => vi.advanceTimersByTime(499)); expect(onChange).not.toHaveBeenCalled(); act(() => vi.advanceTimersByTime(1)); expect(onChange).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenLastCalledWith('edge', { label: 'depende de' })
  fireEvent.change(input, { target: { value: 'bloqueia' } }); view.unmount(); expect(onChange).toHaveBeenCalledTimes(2); expect(onChange).toHaveBeenLastCalledWith('edge', { label: 'bloqueia' }); vi.useRealTimers()
})

test('faz flush do rótulo antes de remover a conexão', () => {
  const onChange = vi.fn(); const onRemove = vi.fn()
  render(<MindMapConnectionProperties connection={connection} selected={false} onChange={onChange} onRemove={onRemove} />)
  fireEvent.change(screen.getByLabelText('Rótulo da conexão'), { target: { value: 'relação final' } }); fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
  expect(onChange).toHaveBeenCalledWith('edge', { label: 'relação final' }); expect(onRemove).toHaveBeenCalledWith('edge')
})
