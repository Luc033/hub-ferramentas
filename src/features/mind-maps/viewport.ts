import type { MindMapViewport } from './types'

export const MIN_MIND_MAP_ZOOM = 0.25
export const MAX_MIND_MAP_ZOOM = 3

export function clampMindMapZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(MAX_MIND_MAP_ZOOM, Math.max(MIN_MIND_MAP_ZOOM, Number(zoom.toFixed(2))))
}

export function zoomViewportAtPoint(
  viewport: MindMapViewport,
  requestedZoom: number,
  sourceX: number,
  sourceY: number,
  targetX = sourceX,
  targetY = sourceY,
): MindMapViewport {
  const currentZoom = clampMindMapZoom(viewport.zoom)
  const zoom = clampMindMapZoom(requestedZoom)
  const worldX = (sourceX - viewport.panX) / currentZoom
  const worldY = (sourceY - viewport.panY) / currentZoom

  return {
    zoom,
    panX: targetX - worldX * zoom,
    panY: targetY - worldY * zoom,
  }
}
