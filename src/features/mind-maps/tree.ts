import type { MindMap, MindMapTopic } from './types'

export function normalizeTopicOrders(topics: MindMapTopic[]) {
  const grouped = new Map<string | null, MindMapTopic[]>()
  topics.forEach((topic) => grouped.set(topic.parentId, [...(grouped.get(topic.parentId) ?? []), topic]))
  return topics.map((topic) => {
    const siblings = [...(grouped.get(topic.parentId) ?? [])].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    return { ...topic, order: siblings.findIndex((item) => item.id === topic.id) }
  })
}

export function validateMindMapDocument(map: MindMap, topics: MindMapTopic[]) {
  if (!map.id || !map.rootId || !map.name.trim() || map.name.trim().length > 100) throw new Error('Metadados do mapa inválidos.')
  const ids = new Set<string>()
  for (const topic of topics) {
    if (!topic.id || topic.mapId !== map.id || ids.has(topic.id) || !Number.isInteger(topic.order) || topic.order < 0) throw new Error('Estrutura de tópicos inválida.')
    ids.add(topic.id)
  }
  const root = topics.filter((topic) => topic.parentId === null)
  if (root.length !== 1 || root[0].id !== map.rootId) throw new Error('O mapa precisa ter exatamente um tópico central.')
  const byId = new Map(topics.map((topic) => [topic.id, topic]))
  const siblingOrders = new Map<string | null, number[]>()
  topics.forEach((topic) => siblingOrders.set(topic.parentId, [...(siblingOrders.get(topic.parentId) ?? []), topic.order]))
  siblingOrders.forEach((orders) => {
    const sorted = [...orders].sort((a, b) => a - b)
    if (sorted.some((order, index) => order !== index)) throw new Error('A ordem dos tópicos não é contínua.')
  })
  for (const topic of topics) {
    if (topic.parentId !== null && !byId.has(topic.parentId)) throw new Error('Um tópico possui pai inexistente.')
    const visited = new Set<string>()
    let current: MindMapTopic | undefined = topic
    while (current?.parentId) {
      if (visited.has(current.id)) throw new Error('A árvore do mapa contém um ciclo.')
      visited.add(current.id)
      current = byId.get(current.parentId)
    }
  }
}

export function descendantIds(topics: MindMapTopic[], topicId: string) {
  const result = new Set<string>()
  const visit = (id: string) => topics.filter((topic) => topic.parentId === id).forEach((child) => { result.add(child.id); visit(child.id) })
  visit(topicId)
  return result
}

export function addTopic(topics: MindMapTopic[], selectedId: string, placement: 'child' | 'after' | 'before', now = Date.now()) {
  const selected = topics.find((topic) => topic.id === selectedId)
  if (!selected) throw new Error('O tópico selecionado não existe mais.')
  const parentId = placement === 'child' || selected.parentId === null ? selected.id : selected.parentId
  const siblings = topics.filter((topic) => topic.parentId === parentId).sort((a, b) => a.order - b.order)
  const selectedIndex = siblings.findIndex((topic) => topic.id === selected.id)
  const insertAt = placement === 'child' || selected.parentId === null ? siblings.length : selectedIndex + (placement === 'after' ? 1 : 0)
  const topic: MindMapTopic = { id: crypto.randomUUID(), mapId: selected.mapId, parentId, order: insertAt, text: 'Novo tópico', collapsed: false, createdAt: now, updatedAt: now }
  const shifted = topics.map((item) => item.parentId === parentId && item.order >= insertAt ? { ...item, order: item.order + 1 } : item)
  return { topics: normalizeTopicOrders([...shifted, topic]), topic }
}

export function removeTopicBranch(topics: MindMapTopic[], topicId: string, rootId: string) {
  if (topicId === rootId) throw new Error('O tópico central não pode ser excluído.')
  const removed = descendantIds(topics, topicId); removed.add(topicId)
  return normalizeTopicOrders(topics.filter((topic) => !removed.has(topic.id)))
}

export function visibleTopics(topics: MindMapTopic[], rootId: string) {
  const result: MindMapTopic[] = []
  const visit = (id: string) => {
    const topic = topics.find((item) => item.id === id)
    if (!topic) return
    result.push(topic)
    if (!topic.collapsed) topics.filter((item) => item.parentId === id).sort((a, b) => a.order - b.order).forEach((child) => visit(child.id))
  }
  visit(rootId)
  return result
}
