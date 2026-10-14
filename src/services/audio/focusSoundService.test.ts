import { focusSoundService } from './focusSoundService'

afterEach(() => focusSoundService.stop())

test('limita e publica o volume sem iniciar áudio', () => {
  focusSoundService.setVolume(150)
  expect(focusSoundService.getSnapshot()).toMatchObject({ volume: 100, status: 'stopped' })
  focusSoundService.setVolume(-5)
  expect(focusSoundService.getSnapshot().volume).toBe(0)
})
