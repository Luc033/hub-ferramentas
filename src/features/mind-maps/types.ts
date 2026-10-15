export interface MindMapViewport { panX: number; panY: number; zoom: number }

export interface MindMap {
  id: string
  schemaVersion: 1
  name: string
  rootId: string
  layout: 'radial'
  viewport: MindMapViewport
  createdAt: number
  updatedAt: number
}

export interface MindMapTopic {
  id: string
  mapId: string
  parentId: string | null
  order: number
  text: string
  collapsed: boolean
  createdAt: number
  updatedAt: number
}

export interface MindMapSummary extends MindMap { topicCount: number }
export interface MindMapDocument { map: MindMap; topics: MindMapTopic[] }
