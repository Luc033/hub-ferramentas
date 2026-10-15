import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { closeDatabase, DB_NAME } from './indexedDb'
import { mindMapsRepository } from './mindMapsRepository'
import { addTopic } from '../../features/mind-maps/tree'

beforeEach(async () => {
  closeDatabase(); await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) }); await mindMapsRepository.enable()
})

test('cria mapa e raiz atomicamente e mantém mapas isolados', async () => {
  const first = await mindMapsRepository.create('Primeiro'); const second = await mindMapsRepository.create('Segundo')
  expect(first.topics).toEqual([expect.objectContaining({ id: first.map.rootId, parentId: null, mapId: first.map.id })])
  const addition = addTopic(first.topics, first.map.rootId, 'child')
  await mindMapsRepository.save({ map: first.map, topics: addition.topics })
  expect((await mindMapsRepository.get(first.map.id))?.topics).toHaveLength(2)
  expect((await mindMapsRepository.get(second.map.id))?.topics).toHaveLength(1)
})

test('duplica com ids independentes e exclusão remove apenas o mapa escolhido', async () => {
  const original = await mindMapsRepository.create('Plano'); const addition = addTopic(original.topics, original.map.rootId, 'child')
  await mindMapsRepository.save({ map: original.map, topics: addition.topics })
  const copy = await mindMapsRepository.duplicate(original.map.id)
  expect(copy.map.id).not.toBe(original.map.id); expect(copy.map.rootId).not.toBe(original.map.rootId); expect(new Set(copy.topics.map((item) => item.id))).not.toContain(addition.topic.id)
  await mindMapsRepository.remove(original.map.id)
  expect(await mindMapsRepository.get(original.map.id)).toBeNull(); expect(await mindMapsRepository.get(copy.map.id)).not.toBeNull()
})

test('renomeia e persiste viewport somente após a transação', async () => {
  const document = await mindMapsRepository.create('Inicial')
  await mindMapsRepository.rename(document.map.id, '  Final  '); await mindMapsRepository.saveViewport(document.map.id, { panX: 120, panY: -45, zoom: 1.4 })
  expect((await mindMapsRepository.get(document.map.id))?.map).toMatchObject({ name: 'Final', viewport: { panX: 120, panY: -45, zoom: 1.4 } })
})

test('persiste posição manual e tópico independente sem afetar a raiz', async () => {
  const original = await mindMapsRepository.create('Manual')
  const child = addTopic(original.topics, original.map.rootId, 'child')
  const topics = child.topics.map((topic) => topic.id === child.topic.id ? { ...topic, parentId: null, order: 1, manualPosition: true, position: { x: 320, y: -90 } } : topic)
  await mindMapsRepository.save({ map: { ...original.map, layout: 'manual' }, topics })
  expect(await mindMapsRepository.get(original.map.id)).toMatchObject({ map: { layout: 'manual', rootId: original.map.rootId }, topics: expect.arrayContaining([expect.objectContaining({ id: child.topic.id, parentId: null, position: { x: 320, y: -90 } })]) })
})

test('persiste conexões e imagens na v7 e duplica seus ids sem alterar a hierarquia', async () => {
  await mindMapsRepository.enableAdvanced(); const original = await mindMapsRepository.create('Visual'); const child = addTopic(original.topics, original.map.rootId, 'child'); const asset = await mindMapsRepository.saveAsset(original.map.id, new File(['image'], 'ideia.png', { type: 'image/png' }))
  const topics = child.topics.map((topic) => topic.id === child.topic.id ? { ...topic, imageAssetId: asset.id, note: 'Texto simples', icon: '💡' } : topic); const now = Date.now()
  await mindMapsRepository.save({ map: { ...original.map, layout: 'right', theme: 'colorful' }, topics, connections: [{ id: 'connection', mapId: original.map.id, sourceId: original.map.rootId, targetId: child.topic.id, label: 'depende', color: '#a78bfa', width: 2, dashed: true, directed: true, createdAt: now, updatedAt: now }] })
  const saved = await mindMapsRepository.get(original.map.id); expect(saved).toMatchObject({ map: { layout: 'right', theme: 'colorful' }, connections: [expect.objectContaining({ label: 'depende', directed: true })] }); expect(await mindMapsRepository.getAssets(original.map.id)).toHaveLength(1)
  const copy = await mindMapsRepository.duplicate(original.map.id); expect(copy.connections?.[0].id).not.toBe('connection'); expect(copy.connections?.[0].sourceId).toBe(copy.map.rootId); expect(await mindMapsRepository.getAssets(copy.map.id)).toHaveLength(1)
})
