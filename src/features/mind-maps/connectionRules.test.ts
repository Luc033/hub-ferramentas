import { connectionIdentityKey, hasConnectionBetween } from './connectionRules'
import type { MindMapConnection } from './types'

const connection = (sourceId: string, targetId: string, directed = false): MindMapConnection => ({ id: `${sourceId}-${targetId}`, mapId: 'map', sourceId, targetId, label: ' relação ', color: '#a78bfa', width: 2, dashed: false, directed, createdAt: 1, updatedAt: 1 })

test('considera a ordem irrelevante em conexões não direcionadas', () => {
  expect(connectionIdentityKey(connection('a', 'b'))).toBe(connectionIdentityKey(connection('b', 'a')))
  expect(connectionIdentityKey(connection('a', 'b', true))).not.toBe(connectionIdentityKey(connection('b', 'a', true)))
})

test('detecta uma conexão existente nos dois sentidos', () => {
  expect(hasConnectionBetween([connection('a', 'b')], 'b', 'a')).toBe(true)
  expect(hasConnectionBetween([connection('a', 'b')], 'a', 'c')).toBe(false)
})
