import { addTopic, canMoveTopic, duplicateTopicBranch, moveTopic, moveTopicAmongSiblings, normalizeTopicOrders, pasteTopicBranch, removeTopicBranch, validateMindMapDocument, visibleTopics } from './tree'
import type { MindMap, MindMapTopic } from './types'

const map: MindMap = { id: 'map', schemaVersion: 1, name: 'Mapa', rootId: 'root', layout: 'radial', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1 }
const topic = (id: string, parentId: string | null, order: number): MindMapTopic => ({ id, mapId: 'map', parentId, order, text: id, collapsed: false, createdAt: order + 1, updatedAt: 1 })

test('valida raiz única, pais existentes e ciclos', () => {
  expect(() => validateMindMapDocument(map, [topic('root', null, 0), topic('a', 'root', 0)])).not.toThrow()
  expect(() => validateMindMapDocument(map, [topic('root', 'a', 0), topic('a', null, 0)])).toThrow('exatamente um')
  expect(() => validateMindMapDocument(map, [topic('root', null, 0), topic('a', 'missing', 0)])).toThrow('pai inexistente')
  expect(() => validateMindMapDocument(map, [topic('root', null, 0), topic('a', 'b', 0), topic('b', 'a', 0)])).toThrow('ciclo')
  expect(() => validateMindMapDocument(map, [topic('root', null, 0), topic('a', 'root', 0), topic('b', 'root', 0)])).toThrow('ordem')
  expect(() => validateMindMapDocument(map, [{ ...topic('root', null, 0), position: { x: Number.NaN, y: 0 } }])).toThrow('Estrutura')
})

test('move e reordena tópicos sem permitir ciclos ou mover a raiz', () => {
  const topics = [topic('root', null, 0), topic('a', 'root', 0), topic('b', 'root', 1), topic('a1', 'a', 0)]
  expect(canMoveTopic(topics, 'a', 'a1', 'root')).toBe(false)
  expect(() => moveTopic(topics, 'root', 'a', undefined, 'root')).toThrow('inválida')
  const reparented = moveTopic(topics, 'a1', 'b', undefined, 'root')
  expect(reparented.find((item) => item.id === 'a1')?.parentId).toBe('b')
  const reordered = moveTopicAmongSiblings(topics, 'b', -1)
  expect(reordered.filter((item) => item.parentId === 'root').sort((a, b) => a.order - b.order).map((item) => item.id)).toEqual(['b', 'a'])
})

test('duplica e cola ramos com ids independentes', () => {
  const topics = [topic('root', null, 0), topic('a', 'root', 0), topic('a1', 'a', 0)]
  const duplicate = duplicateTopicBranch(topics, 'a', 10)
  const duplicatedRoot = duplicate.topics.find((item) => item.id === duplicate.rootId)!
  expect(duplicatedRoot.parentId).toBe('root'); expect(duplicate.topics.filter((item) => item.parentId === duplicate.rootId)).toHaveLength(1)
  const copied = topics.filter((item) => item.id === 'a' || item.id === 'a1')
  const pasted = pasteTopicBranch(topics, copied, 'a', 'root', 'map', 20)
  expect(pasted.rootId).not.toBe('a'); expect(pasted.topics.filter((item) => item.parentId === pasted.rootId)).toHaveLength(1)
})

test('cria filhos e irmãos mantendo ordem contínua', () => {
  const base = [topic('root', null, 0), topic('a', 'root', 0), topic('b', 'root', 1)]
  const result = addTopic(base, 'a', 'after', 10)
  expect(result.topics.filter((item) => item.parentId === 'root').sort((a, b) => a.order - b.order).map((item) => item.id)).toEqual(['a', result.topic.id, 'b'])
  expect(normalizeTopicOrders([{ ...base[2], order: 8 }, base[0], { ...base[1], order: 3 }]).filter((item) => item.parentId === 'root').map((item) => item.order).sort()).toEqual([0, 1])
})

test('remove um ramo, protege a raiz e respeita recolhimento', () => {
  const topics = [topic('root', null, 0), topic('a', 'root', 0), topic('b', 'a', 0), topic('c', 'root', 1)]
  expect(removeTopicBranch(topics, 'a', 'root').map((item) => item.id)).toEqual(['root', 'c'])
  expect(() => removeTopicBranch(topics, 'root', 'root')).toThrow('central')
  expect(visibleTopics(topics.map((item) => item.id === 'a' ? { ...item, collapsed: true } : item), 'root').map((item) => item.id)).toEqual(['root', 'a', 'c'])
})
