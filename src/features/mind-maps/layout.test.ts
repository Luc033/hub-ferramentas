import { calculateRadialLayout, connectionPath } from './layout'
import type { MindMapTopic } from './types'

const topic = (id: string, parentId: string | null, order: number, text = id): MindMapTopic => ({ id, mapId: 'map', parentId, order, text, collapsed: false, createdAt: order + 1, updatedAt: 1 })

test('distribui ramos nos dois lados sem sobrepor tópicos irmãos', () => {
  const topics = [topic('root', null, 0), topic('a', 'root', 0), topic('b', 'root', 1), topic('a1', 'a', 0), topic('b1', 'b', 0)]
  const layout = calculateRadialLayout(topics, 'root')
  expect(layout.topics.get('a')?.side).toBe(1)
  expect(layout.topics.get('b')?.side).toBe(-1)
  const boxes = [...layout.topics.values()]
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const first = boxes[i]; const second = boxes[j]
    const overlaps = first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y
    expect(overlaps).toBe(false)
  }
})

test('remove descendentes recolhidos do layout e cria curva entre bordas', () => {
  const topics = [topic('root', null, 0), { ...topic('a', 'root', 0), collapsed: true }, topic('hidden', 'a', 0)]
  const layout = calculateRadialLayout(topics, 'root')
  expect(layout.topics.has('hidden')).toBe(false)
  expect(connectionPath(layout.topics.get('root')!, layout.topics.get('a')!)).toMatch(/^M .* C .*$/)
})

test('respeita posições manuais e mantém tópico independente visível', () => {
  const topics = [topic('root', null, 0), { ...topic('a', 'root', 0), position: { x: 500, y: 80 }, manualPosition: true }, { ...topic('free', null, 1), position: { x: -500, y: 120 }, manualPosition: true }]
  const layout = calculateRadialLayout(topics, 'root', 'manual')
  expect(layout.topics.get('a')).toMatchObject({ x: 500, y: 80 })
  expect(layout.topics.get('free')).toMatchObject({ x: -500, y: 120 })
})

test('oferece layouts à direita e organograma com eixos consistentes', () => {
  const topics = [topic('root', null, 0), topic('a', 'root', 0), topic('b', 'root', 1), topic('a1', 'a', 0)]
  const right = calculateRadialLayout(topics, 'root', 'right'); expect(right.topics.get('a')!.x).toBeGreaterThan(right.topics.get('root')!.x); expect(right.topics.get('a1')!.x).toBeGreaterThan(right.topics.get('a')!.x)
  const org = calculateRadialLayout(topics, 'root', 'orgchart'); expect(org.topics.get('a')!.y).toBeGreaterThan(org.topics.get('root')!.y); expect(org.topics.get('a1')!.y).toBeGreaterThan(org.topics.get('a')!.y)
})
