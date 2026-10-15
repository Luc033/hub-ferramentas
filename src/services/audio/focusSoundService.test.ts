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
  focusSoundService.playSoundCloud(first); focusSoundService.attachSoundCloud(controller, first.url); focusSoundService.soundCloudPlaying(controller)
  expect(controller.play).toHaveBeenCalledOnce()
  focusSoundService.skip('next'); expect(controller.next).toHaveBeenCalledOnce()
  await focusSoundService.pause(); expect(controller.pause).toHaveBeenCalledOnce()
  focusSoundService.playSoundCloud(second)
  expect(controller.pause).toHaveBeenCalledTimes(2)
  expect(focusSoundService.getSnapshot()).toMatchObject({ source: { id: 'two' }, status: 'loading' })
})

test('ignora eventos atrasados do widget SoundCloud anterior', () => {
  const oldController: SoundCloudController = { play: vi.fn(), pause: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn() }
  const newController: SoundCloudController = { play: vi.fn(), pause: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn() }
  const playlist = { id: 'one', url: 'https://soundcloud.com/artist/sets/one', title: 'One', author: 'Artist', category: 'Lo-fi' as const, createdAt: 1 }
  focusSoundService.playSoundCloud(playlist); focusSoundService.attachSoundCloud(oldController, playlist.url)
  const nextPlaylist = { ...playlist, id: 'two', url: 'https://soundcloud.com/artist/sets/two' }
  focusSoundService.playSoundCloud(nextPlaylist); focusSoundService.attachSoundCloud(oldController, playlist.url); focusSoundService.attachSoundCloud(newController, nextPlaylist.url)
  focusSoundService.soundCloudPaused(oldController); focusSoundService.soundCloudError(oldController)
  expect(focusSoundService.getSnapshot()).toMatchObject({ source: { id: 'two' }, status: 'loading', error: null })
  focusSoundService.soundCloudPlaying(newController)
  expect(focusSoundService.getSnapshot().status).toBe('playing')
})

test('trocar para a rádio encerra o widget anterior e usa HTMLAudioElement', async () => {
  const radioPlay = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('Audio', class extends EventTarget {
    play = radioPlay; pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn(); src = ''; volume = 1; preload = ''
  })
  const controller: SoundCloudController = { play: vi.fn(), pause: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn() }
  focusSoundService.playSoundCloud({ id: 'one', url: 'https://soundcloud.com/artist/sets/one', title: 'One', author: 'Artist', category: 'Lo-fi', createdAt: 1 })
  focusSoundService.attachSoundCloud(controller, 'https://soundcloud.com/artist/sets/one')
  await focusSoundService.playRadio()
  expect(controller.pause).toHaveBeenCalledOnce()
  expect(radioPlay).toHaveBeenCalledOnce()
  expect(focusSoundService.getSnapshot()).toMatchObject({ source: { kind: 'radio', provider: 'FluxFM' }, status: 'loading' })
})

test('mantém a modulação das ondas antes do ganho mestre para respeitar mute', async () => {
  class FakeParam {
    value = 0
    targets: number[] = []
    setTargetAtTime(value: number) { this.value = value; this.targets.push(value) }
  }
  class FakeNode {
    connections: unknown[] = []
    connect(target: unknown) { this.connections.push(target); return target as FakeNode }
    disconnect() { this.connections = [] }
  }
  class FakeGain extends FakeNode { gain = new FakeParam() }
  class FakeSource extends FakeNode { buffer: unknown; loop = false; start = vi.fn(); stop = vi.fn() }
  class FakeFilter extends FakeNode { type = ''; frequency = new FakeParam(); Q = new FakeParam() }
  class FakeOscillator extends FakeNode { frequency = new FakeParam(); start = vi.fn() }
  const gains: FakeGain[] = []; const oscillators: FakeOscillator[] = []
  vi.stubGlobal('AudioContext', class {
    state = 'running'; sampleRate = 10; currentTime = 0; destination = new FakeNode()
    resume = vi.fn(); suspend = vi.fn()
    createBuffer = () => ({ getChannelData: () => new Float32Array(20) })
    createBufferSource = () => new FakeSource()
    createGain = () => { const gain = new FakeGain(); gains.push(gain); return gain }
    createBiquadFilter = () => new FakeFilter()
    createOscillator = () => { const oscillator = new FakeOscillator(); oscillators.push(oscillator); return oscillator }
  })

  await focusSoundService.playAmbient('waves')
  expect(gains).toHaveLength(3)
  expect(oscillators[0].connections[0]).toBe(gains[2])
  expect(gains[2].connections[0]).toBe(gains[1].gain)
  expect(gains[2].connections[0]).not.toBe(gains[0].gain)
  focusSoundService.setMuted(true)
  expect(gains[0].gain.targets.at(-1)).toBe(0)
})
