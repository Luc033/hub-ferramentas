import { matchRoutes } from 'react-router'
import { appRoutes } from './router'

test.each(['/','/habits','/timer','/pomodoro','/tasks','/notes','/notes/maps','/notes/maps/map-1','/sounds'])('possui rota para %s', (path) => {
  const matches = matchRoutes(appRoutes, path)
  expect(matches?.at(-1)?.route.path).toBe(path === '/notes/maps/map-1' ? '/notes/maps/:mapId' : path)
})

test('rota futura não aponta para uma tela falsa', () => {
  const matches = matchRoutes(appRoutes, '/unknown-tool')
  expect(matches?.at(-1)?.route.path).toBe('*')
})
