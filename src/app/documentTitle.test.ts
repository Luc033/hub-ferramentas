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
  ['/sounds', 'Sons de Foco | Hub'],
  ['/desconhecida', 'Página não encontrada | Hub'],
])('define o título de %s', (path, expected) => expect(documentTitleForPath(path)).toBe(expected))

test('usa o favicon específico apenas na rota de cada ferramenta', () => {
  expect(faviconForPath('/habits', '/assets/favicon-habitos.png', '/assets/favicon-pomodoro.png', '/assets/favicon-timer.png')).toBe('/assets/favicon-habitos.png')
  expect(faviconForPath('/pomodoro', '/assets/favicon-habitos.png', '/assets/favicon-pomodoro.png', '/assets/favicon-timer.png')).toBe('/assets/favicon-pomodoro.png')
  expect(faviconForPath('/timer', '/assets/favicon-habitos.png', '/assets/favicon-pomodoro.png', '/assets/favicon-timer.png')).toBe('/assets/favicon-timer.png')
  expect(faviconForPath('/', '/assets/favicon-habitos.png', '/assets/favicon-pomodoro.png', '/assets/favicon-timer.png')).toBe(HUB_FAVICON)
})
