export type NoteBlock = Record<string, unknown>

export interface Note {
  id: string
  title: string
  /** Projeção em texto simples, mantida para busca, widgets e integrações legadas. */
  content: string
  blocks: NoteBlock[]
  folderId: string | null
  tagIds: string[]
  favorite: boolean
  archivedAt: number | null
  deletedAt: number | null
  createdAt: number
  updatedAt: number
  contentSchemaVersion: number
  revision: number
  fontFamily: 'sans' | 'serif' | 'mono'
  textSize: 'small' | 'normal' | 'large'
  lineHeight: 'compact' | 'normal' | 'comfortable'
  migrationSource?: string
}

export interface NoteFolder { id: string; name: string; order: number; createdAt: number; updatedAt: number }
export interface NoteTag { id: string; name: string; color: string; createdAt: number }
export interface NoteAsset { id: string; blob: Blob; mimeType: string; bytes: number; name: string; alt: string; createdAt: number }
export interface NoteSnapshot { id: string; noteId: string; title: string; content: string; blocks: NoteBlock[]; createdAt: number; reason: string }
export interface NoteMeta { id: string; value: unknown; updatedAt: number }

export interface Board { id: string; name: string; panX: number; panY: number; zoom: number; updatedAt: number }
export interface MindNode { id: string; boardId: string; text: string; x: number; y: number; createdAt: number; updatedAt: number }
export interface MindEdge { id: string; boardId: string; sourceId: string; targetId: string }

export const NOTE_CONTENT_SCHEMA_VERSION = 2

export function textToBlocks(content: string): NoteBlock[] {
  return content.replace(/\r\n?/g, '\n').split('\n').map((line) => ({ type: 'paragraph', content: line }))
}

function inlineText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(inlineText).join('')
  if (!value || typeof value !== 'object') return ''
  const item = value as Record<string, unknown>
  if (typeof item.text === 'string') return item.text
  return inlineText(item.content)
}

export function blocksToText(blocks: NoteBlock[]): string {
  const visit = (block: NoteBlock): string => {
    const own = inlineText(block.content)
    const rows = block.type === 'table' && block.content && typeof block.content === 'object' ? inlineText((block.content as Record<string, unknown>).rows) : ''
    const children = Array.isArray(block.children) ? (block.children as NoteBlock[]).map(visit).join('\n') : ''
    return [own || rows, children].filter(Boolean).join('\n')
  }
  return blocks.map(visit).filter(Boolean).join('\n')
}

export function normalizeNote(raw: Partial<Note> & Pick<Note, 'id'>): Note {
  const legacyContent = typeof raw.content === 'string' ? raw.content : ''
  const blocks = Array.isArray(raw.blocks) && raw.blocks.length ? raw.blocks as NoteBlock[] : textToBlocks(legacyContent)
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : '',
    content: legacyContent || blocksToText(blocks),
    blocks,
    folderId: typeof raw.folderId === 'string' ? raw.folderId : null,
    tagIds: Array.isArray(raw.tagIds) ? raw.tagIds.filter((id): id is string => typeof id === 'string') : [],
    favorite: raw.favorite === true,
    archivedAt: typeof raw.archivedAt === 'number' ? raw.archivedAt : null,
    deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    contentSchemaVersion: NOTE_CONTENT_SCHEMA_VERSION,
    revision: Number.isInteger(raw.revision) ? Math.max(0, raw.revision!) : 0,
    fontFamily: ['sans', 'serif', 'mono'].includes(String(raw.fontFamily)) ? raw.fontFamily as Note['fontFamily'] : 'sans',
    textSize: ['small', 'normal', 'large'].includes(String(raw.textSize)) ? raw.textSize as Note['textSize'] : 'normal',
    lineHeight: ['compact', 'normal', 'comfortable'].includes(String(raw.lineHeight)) ? raw.lineHeight as Note['lineHeight'] : 'normal',
    migrationSource: raw.contentSchemaVersion ? raw.migrationSource : 'legacy-text-v1',
  }
}
