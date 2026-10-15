import type { MindMapTopic } from './types'
import { visibleTopics } from './tree'

export interface TopicLayout { id: string; x: number; y: number; width: number; height: number; side: -1 | 0 | 1; depth: number }
export interface MindMapLayout { topics: Map<string, TopicLayout>; width: number; height: number; minX: number; minY: number; maxX: number; maxY: number }

const ROOT_WIDTH = 220
const TOPIC_WIDTH = 180
const LEVEL_GAP = 110
const SIBLING_GAP = 24

function topicHeight(text: string, root: boolean) {
  const width = root ? ROOT_WIDTH : TOPIC_WIDTH
  const charactersPerLine = Math.max(12, Math.floor(width / 8))
  const lines = Math.max(1, text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0))
  return Math.max(root ? 72 : 56, 28 + lines * 20)
}

export function calculateRadialLayout(allTopics: MindMapTopic[], rootId: string, mode: 'radial' | 'manual' = 'radial'): MindMapLayout {
  const visible = visibleTopics(allTopics, rootId)
  const byId = new Map(visible.map((topic) => [topic.id, topic]))
  const children = new Map<string, MindMapTopic[]>()
  visible.forEach((topic) => { if (topic.parentId && byId.has(topic.parentId)) children.set(topic.parentId, [...(children.get(topic.parentId) ?? []), topic]) })
  children.forEach((items) => items.sort((a, b) => a.order - b.order))
  const heights = new Map<string, number>()
  const measure = (id: string): number => {
    const topic = byId.get(id)!; const own = topicHeight(topic.text, id === rootId); const descendants = children.get(id) ?? []
    const total = descendants.length ? descendants.reduce((sum, child) => sum + measure(child.id), 0) + SIBLING_GAP * (descendants.length - 1) : own
    const height = Math.max(own, total); heights.set(id, height); return height
  }
  measure(rootId)
  const first = children.get(rootId) ?? []
  const left: MindMapTopic[] = []; const right: MindMapTopic[] = []; let leftWeight = 0; let rightWeight = 0
  first.forEach((topic) => { const weight = heights.get(topic.id) ?? 0; if (rightWeight <= leftWeight) { right.push(topic); rightWeight += weight } else { left.push(topic); leftWeight += weight } })
  const positioned = new Map<string, TopicLayout>()
  positioned.set(rootId, { id: rootId, x: -ROOT_WIDTH / 2, y: -topicHeight(byId.get(rootId)?.text ?? '', true) / 2, width: ROOT_WIDTH, height: topicHeight(byId.get(rootId)?.text ?? '', true), side: 0, depth: 0 })
  const placeBranch = (topic: MindMapTopic, side: -1 | 1, depth: number, centerY: number) => {
    const height = topicHeight(topic.text, false); const x = side === 1 ? ROOT_WIDTH / 2 + LEVEL_GAP + (depth - 1) * (TOPIC_WIDTH + LEVEL_GAP) : -ROOT_WIDTH / 2 - LEVEL_GAP - depth * TOPIC_WIDTH - (depth - 1) * LEVEL_GAP
    positioned.set(topic.id, { id: topic.id, x, y: centerY - height / 2, width: TOPIC_WIDTH, height, side, depth })
    const descendants = children.get(topic.id) ?? []; if (!descendants.length) return
    const total = descendants.reduce((sum, child) => sum + (heights.get(child.id) ?? 0), 0) + SIBLING_GAP * (descendants.length - 1)
    let cursor = centerY - total / 2
    descendants.forEach((child) => { const span = heights.get(child.id) ?? 0; placeBranch(child, side, depth + 1, cursor + span / 2); cursor += span + SIBLING_GAP })
  }
  const placeSide = (items: MindMapTopic[], side: -1 | 1) => {
    const total = items.reduce((sum, item) => sum + (heights.get(item.id) ?? 0), 0) + Math.max(0, items.length - 1) * SIBLING_GAP
    let cursor = -total / 2
    items.forEach((topic) => { const span = heights.get(topic.id) ?? 0; placeBranch(topic, side, 1, cursor + span / 2); cursor += span + SIBLING_GAP })
  }
  placeSide(right, 1); placeSide(left, -1)
  const floating = visible.filter((topic) => topic.parentId === null && topic.id !== rootId)
  const placeFloating = (topic: MindMapTopic, depth: number, fallbackX: number, centerY: number) => {
    const height = topicHeight(topic.text, false); const position = topic.position
    const x = position?.x ?? fallbackX; const y = position?.y ?? centerY - height / 2
    positioned.set(topic.id, { id: topic.id, x, y, width: TOPIC_WIDTH, height, side: 1, depth })
    const descendants = children.get(topic.id) ?? []; let cursor = y
    descendants.forEach((child) => { const span = heights.get(child.id) ?? topicHeight(child.text, false); placeFloating(child, depth + 1, x + TOPIC_WIDTH + LEVEL_GAP, cursor + span / 2); cursor += span + SIBLING_GAP })
  }
  floating.forEach((topic, index) => { measure(topic.id); placeFloating(topic, 0, 380, index * 150) })
  if (mode === 'manual') {
    positioned.forEach((value, id) => { const position = byId.get(id)?.position; if (position) positioned.set(id, { ...value, x: position.x, y: position.y }) })
  }
  const values = [...positioned.values()]
  const minX = Math.min(...values.map((item) => item.x)); const minY = Math.min(...values.map((item) => item.y))
  const maxX = Math.max(...values.map((item) => item.x + item.width)); const maxY = Math.max(...values.map((item) => item.y + item.height))
  return { topics: positioned, minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function connectionPath(parent: TopicLayout, child: TopicLayout) {
  const right = child.x + child.width / 2 >= parent.x + parent.width / 2
  const startX = right ? parent.x + parent.width : parent.x
  const endX = right ? child.x : child.x + child.width
  const startY = parent.y + parent.height / 2; const endY = child.y + child.height / 2; const bend = Math.abs(endX - startX) * .5
  return `M ${startX} ${startY} C ${startX + (right ? bend : -bend)} ${startY}, ${endX + (right ? -bend : bend)} ${endY}, ${endX} ${endY}`
}
