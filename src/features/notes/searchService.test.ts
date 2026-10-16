import { normalizeNote } from './types'
import { noteExcerpt, searchNotes } from './searchService'

test('pesquisa título e texto dos blocos ignorando acentos e caixa', () => {
  const title = normalizeNote({ id: 'title', title: 'Reunião estratégica', content: 'Outro assunto', createdAt: 1, updatedAt: 1 })
  const body = normalizeNote({ id: 'body', title: 'Planejamento', content: 'Decisão da reunião', createdAt: 2, updatedAt: 2 })
  expect(searchNotes([body, title], 'REUNIAO').map(({ id }) => id)).toEqual(['title', 'body'])
  expect(noteExcerpt(body, 'decisao')).toContain('Decisão')
})

test('não injeta marcação da busca no trecho apresentado', () => {
  const note = normalizeNote({ id: 'safe', title: 'Teste', content: '<img src=x onerror=alert(1)>', createdAt: 1, updatedAt: 1 })
  expect(noteExcerpt(note, 'img')).toBe('<img src=x onerror=alert(1)>')
})
