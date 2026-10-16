import { documentTitleForPath, faviconForPath, HOME_TITLE, HUB_FAVICON } from './documentTitle'

test.each([
  ['/', HOME_TITLE],
  ['/habits', 'Hábitos | Hub'],
  ['/timer', 'Timer | Hub'],
  ['/pomodoro', 'Foco | Hub'],
  ['/tasks', 'Kanban | Hub'],
  ['/notes', 'Anotações | Hub'],
  ['/notes/maps', 'Mapas Mentais | Hub'],
  ['/notes/maps/map-1', 'Mapas Mentais | Hub'],
  ['/sounds', 'Sons | Hub'],
  ['/desconhecida', 'Página não encontrada | Hub'],
])('define o título de %s', (path, expected) => expect(documentTitleForPath(path)).toBe(expected))

test('usa o favicon específico apenas na rota de cada ferramenta', () => {
  const args = ['/assets/favicon-habitos.png', '/assets/favicon-pomodoro.png', '/assets/favicon-timer.png', '/assets/favicon-kanban.png', '/assets/favicon-mapa.png', '/assets/favicon-musica.png'] as const
  expect(faviconForPath('/habits', ...args)).toBe('/assets/favicon-habitos.png')
  expect(faviconForPath('/pomodoro', ...args)).toBe('/assets/favicon-pomodoro.png')
  expect(faviconForPath('/timer', ...args)).toBe('/assets/favicon-timer.png')
  expect(faviconForPath('/tasks', ...args)).toBe('/assets/favicon-kanban.png')
  expect(faviconForPath('/notes', ...args)).toBe('/assets/favicon-mapa.png')
  expect(faviconForPath('/notes/maps/map-1', ...args)).toBe('/assets/favicon-mapa.png')
  expect(faviconForPath('/sounds', ...args)).toBe('/assets/favicon-musica.png')
  expect(faviconForPath('/', ...args)).toBe(HUB_FAVICON)
})
