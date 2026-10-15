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
  if (!['radial', 'manual', 'right', 'orgchart'].includes(map.layout) || !Number.isFinite(map.viewport.panX) || !Number.isFinite(map.viewport.panY) || !Number.isFinite(map.viewport.zoom) || map.viewport.zoom < .25 || map.viewport.zoom > 3) throw new Error('Viewport ou layout do mapa inválido.')
  const ids = new Set<string>()
  for (const topic of topics) {
    const validPosition = topic.position === undefined || Number.isFinite(topic.position.x) && Number.isFinite(topic.position.y)
    const style = topic.style; const validStyle = style === undefined || (style.borderWidth === undefined || Number.isFinite(style.borderWidth) && style.borderWidth >= 0 && style.borderWidth <= 8) && (style.borderRadius === undefined || Number.isFinite(style.borderRadius) && style.borderRadius >= 0 && style.borderRadius <= 40) && (style.textAlign === undefined || ['left', 'center', 'right'].includes(style.textAlign)) && (style.fontScale === undefined || Number.isFinite(style.fontScale) && style.fontScale >= .7 && style.fontScale <= 2)
    if (!topic.id || topic.mapId !== map.id || ids.has(topic.id) || !Number.isInteger(topic.order) || topic.order < 0 || !topic.text.trim() || topic.text.length > 500 || typeof topic.collapsed !== 'boolean' || !validPosition || !validStyle) throw new Error('Estrutura de tópicos inválida.')
    ids.add(topic.id)
  }
  const root = topics.find((topic) => topic.id === map.rootId)
  if (!root || root.parentId !== null || topics.filter((topic) => topic.id === map.rootId).length !== 1) throw new Error('O mapa precisa ter exatamente um tópico central.')
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
  topics.filter((topic) => topic.parentId === null && topic.id !== rootId).sort((a, b) => a.order - b.order).forEach((topic) => visit(topic.id))
  return result
}

export function canMoveTopic(topics: MindMapTopic[], topicId: string, parentId: string | null, rootId: string) {
  if (topicId === rootId || topicId === parentId) return false
  if (parentId !== null && !topics.some((topic) => topic.id === parentId)) return false
  return !descendantIds(topics, topicId).has(parentId ?? '')
}

export function moveTopic(topics: MindMapTopic[], topicId: string, parentId: string | null, index?: number, rootId = '') {
  if (!canMoveTopic(topics, topicId, parentId, rootId)) throw new Error('Este destino criaria uma relação inválida.')
  const moving = topics.find((topic) => topic.id === topicId)
  if (!moving) throw new Error('O tópico movido não existe mais.')
  const without = topics.filter((topic) => topic.id !== topicId)
  const siblings = without.filter((topic) => topic.parentId === parentId).sort((a, b) => a.order - b.order)
  const insertAt = Math.max(0, Math.min(index ?? siblings.length, siblings.length))
  siblings.splice(insertAt, 0, { ...moving, parentId, order: insertAt, updatedAt: Date.now(), manualPosition: parentId === null ? true : moving.manualPosition })
  const ids = new Set(siblings.map((topic) => topic.id))
  return normalizeTopicOrders([...without.filter((topic) => !ids.has(topic.id)), ...siblings])
}

export function moveTopicAmongSiblings(topics: MindMapTopic[], topicId: string, direction: -1 | 1, rootId = '') {
  const topic = topics.find((item) => item.id === topicId); if (!topic) throw new Error('O tópico não existe mais.')
  const siblings = topics.filter((item) => item.parentId === topic.parentId).sort((a, b) => a.order - b.order)
  const current = siblings.findIndex((item) => item.id === topicId); const target = current + direction
  if (target < 0 || target >= siblings.length) return topics
  if (siblings[target].id === rootId) return topics
  const reordered = [...siblings]; const [moving] = reordered.splice(current, 1); reordered.splice(target, 0, moving)
  const ids = new Set(reordered.map((item) => item.id))
  return normalizeTopicOrders([...topics.filter((item) => !ids.has(item.id)), ...reordered.map((item, order) => ({ ...item, order, updatedAt: item.id === topicId ? Date.now() : item.updatedAt }))])
}

export function duplicateTopicBranch(topics: MindMapTopic[], topicId: string, now = Date.now()) {
  const source = topics.find((topic) => topic.id === topicId); if (!source) throw new Error('O tópico não existe mais.')
  const branchIds = descendantIds(topics, topicId); branchIds.add(topicId)
  const ids = new Map([...branchIds].map((id) => [id, crypto.randomUUID()]))
  const copies = topics.filter((topic) => branchIds.has(topic.id)).map((topic) => ({ ...topic, id: ids.get(topic.id)!, parentId: topic.id === topicId ? source.parentId : ids.get(topic.parentId!)!, order: topic.id === topicId ? source.order + .5 : topic.order, text: topic.id === topicId ? `${topic.text} (cópia)`.slice(0, 500) : topic.text, position: topic.position ? { x: topic.position.x + 36, y: topic.position.y + 36 } : undefined, createdAt: now, updatedAt: now }))
  return { topics: normalizeTopicOrders([...topics, ...copies]), rootId: ids.get(topicId)! }
}

export function pasteTopicBranch(topics: MindMapTopic[], copied: MindMapTopic[], copiedRootId: string, parentId: string, mapId: string, now = Date.now()) {
  if (!topics.some((topic) => topic.id === parentId)) throw new Error('Escolha um tópico de destino válido.')
  const ids = new Map(copied.map((topic) => [topic.id, crypto.randomUUID()]))
  const siblings = topics.filter((topic) => topic.parentId === parentId)
  const pasted = copied.map((topic) => ({ ...topic, id: ids.get(topic.id)!, mapId, parentId: topic.id === copiedRootId ? parentId : ids.get(topic.parentId!)!, order: topic.id === copiedRootId ? siblings.length : topic.order, createdAt: now, updatedAt: now, position: topic.position ? { x: topic.position.x + 40, y: topic.position.y + 40 } : undefined }))
  return { topics: normalizeTopicOrders([...topics, ...pasted]), rootId: ids.get(copiedRootId)! }
}

export function removeTopicBranches(topics: MindMapTopic[], topicIds: Iterable<string>, rootId: string) {
  const removed = new Set<string>()
  for (const id of topicIds) { if (id === rootId) continue; removed.add(id); descendantIds(topics, id).forEach((child) => removed.add(child)) }
  return normalizeTopicOrders(topics.filter((topic) => !removed.has(topic.id)))
}
