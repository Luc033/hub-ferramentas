import type { Board, MindNode } from './types'

type Viewport = Pick<Board, 'panX' | 'panY' | 'zoom'>
type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

export function screenToWorld(clientX: number, clientY: number, rect: Rect, viewport: Viewport) {
  return { x: (clientX - rect.left - viewport.panX) / viewport.zoom, y: (clientY - rect.top - viewport.panY) / viewport.zoom }
}

export function fitGraph(nodes: MindNode[], rect: Rect, board: Board): Board {
  if (!nodes.length) return { ...board, panX: 0, panY: 0, zoom: 1 }
  const minX = Math.min(...nodes.map((node) => node.x)); const minY = Math.min(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x + 160)); const maxY = Math.max(...nodes.map((node) => node.y + 80))
  const zoom = Math.min(3, Math.max(.25, Math.min((rect.width - 80) / Math.max(160, maxX - minX), (rect.height - 80) / Math.max(80, maxY - minY))))
  return { ...board, zoom, panX: (rect.width - (minX + maxX) * zoom) / 2, panY: (rect.height - (minY + maxY) * zoom) / 2 }
}
