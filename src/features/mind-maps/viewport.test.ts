import { clampMindMapZoom, zoomViewportAtPoint } from './viewport'

test('mantém sob o cursor o mesmo ponto do mundo ao aplicar zoom', () => {
  const viewport = { panX: 120, panY: -40, zoom: 1 }
  const anchor = { x: 420, y: 260 }
  const before = {
    x: (anchor.x - viewport.panX) / viewport.zoom,
    y: (anchor.y - viewport.panY) / viewport.zoom,
  }

  const next = zoomViewportAtPoint(viewport, 1.75, anchor.x, anchor.y)

  expect((anchor.x - next.panX) / next.zoom).toBeCloseTo(before.x)
  expect((anchor.y - next.panY) / next.zoom).toBeCloseTo(before.y)
})

test('acompanha o centro móvel de um gesto de pinça', () => {
  const viewport = { panX: 50, panY: 80, zoom: 1.2 }
  const next = zoomViewportAtPoint(viewport, 2, 200, 160, 240, 190)
  const worldX = (200 - viewport.panX) / viewport.zoom
  const worldY = (160 - viewport.panY) / viewport.zoom

  expect(next.panX + worldX * next.zoom).toBeCloseTo(240)
  expect(next.panY + worldY * next.zoom).toBeCloseTo(190)
})

test('limita o zoom e recupera valores não finitos', () => {
  expect(clampMindMapZoom(0.01)).toBe(0.25)
  expect(clampMindMapZoom(8)).toBe(3)
  expect(clampMindMapZoom(Number.NaN)).toBe(1)
})
