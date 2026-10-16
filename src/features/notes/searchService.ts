import type { Note } from './types'

export const normalizeSearchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

export function searchNotes(notes: Note[], query: string) {
  const term = normalizeSearchText(query.trim())
  if (!term) return notes
  return notes.map((note) => {
    const title = normalizeSearchText(note.title); const content = normalizeSearchText(note.content)
    return { note, rank: title.includes(term) ? 0 : content.includes(term) ? 1 : 2 }
  }).filter(({ rank }) => rank < 2).sort((a, b) => a.rank - b.rank || b.note.updatedAt - a.note.updatedAt).map(({ note }) => note)
}

export function noteExcerpt(note: Note, query = '') {
  const compact = note.content.replace(/\s+/g, ' ').trim()
  if (!compact) return 'Nota vazia'
  const term = normalizeSearchText(query.trim()); const normalized = normalizeSearchText(compact); const index = term ? normalized.indexOf(term) : 0
  const start = Math.max(0, index - 45); return `${start ? '…' : ''}${compact.slice(start, start + 110)}${compact.length > start + 110 ? '…' : ''}`
}
