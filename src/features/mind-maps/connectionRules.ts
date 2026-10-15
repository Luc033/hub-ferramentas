import type { MindMapConnection } from './types'

const isDirectional = (connection: Pick<MindMapConnection, 'directed' | 'startMarker' | 'endMarker'>) => Boolean(connection.directed || connection.startMarker || connection.endMarker)

export function connectionIdentityKey(connection: Pick<MindMapConnection, 'sourceId' | 'targetId' | 'label' | 'directed' | 'startMarker' | 'endMarker'>) {
  const endpoints = isDirectional(connection) ? [connection.sourceId, connection.targetId] : [connection.sourceId, connection.targetId].sort()
  return JSON.stringify([isDirectional(connection), ...endpoints, connection.label.trim()])
}

export function hasConnectionBetween(connections: MindMapConnection[], sourceId: string, targetId: string) {
  return connections.some((connection) => (connection.sourceId === sourceId && connection.targetId === targetId) || (connection.sourceId === targetId && connection.targetId === sourceId))
}
