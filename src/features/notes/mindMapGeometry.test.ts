import { fitGraph, screenToWorld } from './mindMapGeometry'
import type { Board, MindNode } from './types'

const board: Board = { id: 'main', name: 'Mapa', panX: 100, panY: 50, zoom: 2, updatedAt: 1 }
const rect = { left: 20, top: 30, width: 800, height: 600 }

test('converte coordenadas da tela para o mundo com pan e zoom', () => {
  expect(screenToWorld(320, 280, rect, board)).toEqual({ x: 100, y: 100 })
})

test('enquadra todos os nós dentro da área visível', () => {
  const nodes = [
    { id: 'a', boardId: 'main', text: 'A', x: 0, y: 0, createdAt: 1, updatedAt: 1 },
    { id: 'b', boardId: 'main', text: 'B', x: 640, y: 320, createdAt: 1, updatedAt: 1 },
  ] satisfies MindNode[]
  const fitted = fitGraph(nodes, rect, board)
  expect(fitted.zoom).toBeCloseTo(.9)
  expect(fitted.panX).toBeCloseTo(40)
  expect(fitted.panY).toBeCloseTo(120)
})

test('restaura viewport padrão quando o quadro está vazio', () => {
  expect(fitGraph([], rect, board)).toMatchObject({ panX: 0, panY: 0, zoom: 1 })
})
