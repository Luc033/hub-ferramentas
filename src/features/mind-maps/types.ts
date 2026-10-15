export interface MindMapViewport { panX: number; panY: number; zoom: number }
export interface MindMapPosition { x: number; y: number }
export type MindMapLayout = 'radial' | 'manual' | 'right' | 'orgchart'
export type MindMapTheme = 'classic' | 'minimal' | 'colorful'

export interface MindMapTopicStyle {
  background?: string
  color?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  textAlign?: 'left' | 'center' | 'right'
  bold?: boolean
  italic?: boolean
  fontScale?: number
}

export interface MindMapLink { id: string; label: string; url: string }

export interface MindMap {
  id: string
  schemaVersion: 1
  name: string
  rootId: string
  layout: MindMapLayout
  theme?: MindMapTheme
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
  position?: MindMapPosition
  manualPosition?: boolean
  style?: MindMapTopicStyle
  icon?: string
  note?: string
  links?: MindMapLink[]
  imageAssetId?: string
  createdAt: number
  updatedAt: number
}

export interface MindMapSummary extends MindMap { topicCount: number }
export interface MindMapConnection {
  id: string
  mapId: string
  sourceId: string
  targetId: string
  label: string
  color: string
  width: number
  dashed: boolean
  directed: boolean
  shape?: 'curve' | 'straight'
  startMarker?: boolean
  endMarker?: boolean
  curveOffset?: number
  createdAt: number
  updatedAt: number
}

export interface MindMapAsset {
  id: string
  mapId: string
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
  blob: Blob
  createdAt: number
}

/** connections is optional so v6 documents and old backups remain source-compatible. */
export interface MindMapDocument { map: MindMap; topics: MindMapTopic[]; connections?: MindMapConnection[] }
