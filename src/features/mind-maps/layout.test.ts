import { calculateRadialLayout, connectionPath, transverseConnectionPath } from './layout'
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

test('centraliza pais sobre suas subárvores nos layouts direcionais', () => {
  const topics = [topic('root', null, 0), topic('a', 'root', 0), topic('b', 'root', 1), topic('a1', 'a', 0), topic('a2', 'a', 1), topic('a3', 'a', 2)]
  const right = calculateRadialLayout(topics, 'root', 'right'); const a = right.topics.get('a')!; const rightChildren = ['a1', 'a2', 'a3'].map((id) => right.topics.get(id)!)
  const rightCenter = (Math.min(...rightChildren.map((item) => item.y)) + Math.max(...rightChildren.map((item) => item.y + item.height))) / 2
  expect(a.y + a.height / 2).toBeCloseTo(rightCenter)
  const org = calculateRadialLayout(topics, 'root', 'orgchart'); const orgChildren = ['a1', 'a2', 'a3'].map((id) => org.topics.get(id)!)
  const orgCenter = (Math.min(...orgChildren.map((item) => item.x)) + Math.max(...orgChildren.map((item) => item.x + item.width))) / 2
  expect(org.topics.get('a')!.x + org.topics.get('a')!.width / 2).toBeCloseTo(orgCenter)
})

test('gera conexões manuais retas e curvas com curvatura configurável', () => {
  const source = { id: 'a', x: 0, y: 0, width: 100, height: 50, side: 0 as const, depth: 0 }
  const target = { id: 'b', x: 300, y: 100, width: 100, height: 50, side: 1 as const, depth: 1 }
  expect(transverseConnectionPath(source, target, 'straight')).toContain(' L ')
  expect(transverseConnectionPath(source, target, 'curve', 120)).toContain(' Q 200 195 ')
})

test('calcula mapa com 150 tópicos sem perder nenhum nó', () => {
  const topics = [topic('root', null, 0), ...Array.from({ length: 149 }, (_, index) => topic(`node-${index}`, index < 12 ? 'root' : `node-${Math.floor((index - 12) / 3)}`, index < 12 ? index : index % 3))]
  const layout = calculateRadialLayout(topics, 'root', 'right'); expect(layout.topics.size).toBe(150); expect(layout.width).toBeGreaterThan(0); expect(layout.height).toBeGreaterThan(0)
})
