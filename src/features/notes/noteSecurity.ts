import type { NoteBlock } from './types'

export function blocksAreSafe(blocks: NoteBlock[], depth = 0): boolean {
  if (depth > 30 || blocks.length > 10_000) return false
  const allowed = new Set(['audio', 'bulletListItem', 'callout', 'checkListItem', 'codeBlock', 'divider', 'file', 'heading', 'image', 'numberedListItem', 'paragraph', 'quote', 'table', 'toggleListItem', 'video'])
  const valuesAreSafe = (value: unknown, key = '', level = 0): boolean => {
    if (level > 50) return false
    if (typeof value === 'string' && /^(url|href)$/i.test(key)) return value.startsWith('hub-note-asset:') || /^(https?:|mailto:)/i.test(value)
    if (Array.isArray(value)) return value.length <= 50_000 && value.every((item) => valuesAreSafe(item, '', level + 1))
    if (value && typeof value === 'object') return Object.entries(value).every(([childKey, child]) => valuesAreSafe(child, childKey, level + 1))
    return true
  }
  return blocks.every((block) => {
    if (!block || typeof block !== 'object' || typeof block.type !== 'string' || !allowed.has(block.type) || !valuesAreSafe(block)) return false
    return !Array.isArray(block.children) || blocksAreSafe(block.children as NoteBlock[], depth + 1)
  })
}
