import { matchRoutes } from 'react-router'
import { appRoutes } from './router'

test.each(['/','/habits','/timer','/pomodoro','/tasks'])('possui rota para %s', (path) => {
  const matches = matchRoutes(appRoutes, path)
  expect(matches?.at(-1)?.route.path).toBe(path)
})

test('rota futura não aponta para uma tela falsa', () => {
  const matches = matchRoutes(appRoutes, '/notes')
  expect(matches?.at(-1)?.route.path).toBe('*')
})
