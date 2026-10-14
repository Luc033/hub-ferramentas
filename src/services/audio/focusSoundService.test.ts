import { vi } from 'vitest'
import { focusSoundService, type SoundCloudController } from './focusSoundService'

afterEach(() => { focusSoundService.stop(); focusSoundService.setMuted(false); focusSoundService.setVolume(30) })

test('limita e publica o volume sem iniciar áudio', () => {
  focusSoundService.setVolume(150)
  expect(focusSoundService.getSnapshot()).toMatchObject({ volume: 100, status: 'stopped' })
  focusSoundService.setVolume(-5)
  expect(focusSoundService.getSnapshot().volume).toBe(0)
})

test('mantém uma única playlist ativa e encaminha controles oficiais', async () => {
  const controller: SoundCloudController = { play: vi.fn(), pause: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn() }
  const first = { id: 'one', url: 'https://soundcloud.com/artist/sets/one', title: 'One', author: 'Artist', category: 'Lo-fi' as const, createdAt: 1 }
  const second = { ...first, id: 'two', url: 'https://soundcloud.com/artist/sets/two', title: 'Two' }
  focusSoundService.playSoundCloud(first); focusSoundService.attachSoundCloud(controller); focusSoundService.soundCloudPlaying()
  expect(controller.play).toHaveBeenCalledOnce()
  focusSoundService.skip('next'); expect(controller.next).toHaveBeenCalledOnce()
  await focusSoundService.pause(); expect(controller.pause).toHaveBeenCalledOnce()
  focusSoundService.playSoundCloud(second)
  expect(controller.pause).toHaveBeenCalledTimes(2)
  expect(focusSoundService.getSnapshot()).toMatchObject({ source: { id: 'two' }, status: 'loading' })
})

test('trocar para a rádio encerra o widget anterior e usa HTMLAudioElement', async () => {
  const radioPlay = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('Audio', class extends EventTarget {
    play = radioPlay; pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn(); src = ''; volume = 1; preload = ''
  })
  const controller: SoundCloudController = { play: vi.fn(), pause: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn() }
  focusSoundService.playSoundCloud({ id: 'one', url: 'https://soundcloud.com/artist/sets/one', title: 'One', author: 'Artist', category: 'Lo-fi', createdAt: 1 })
  focusSoundService.attachSoundCloud(controller)
  await focusSoundService.playRadio()
  expect(controller.pause).toHaveBeenCalledOnce()
  expect(radioPlay).toHaveBeenCalledOnce()
  expect(focusSoundService.getSnapshot()).toMatchObject({ source: { kind: 'radio', provider: 'FluxFM' }, status: 'loading' })
})
