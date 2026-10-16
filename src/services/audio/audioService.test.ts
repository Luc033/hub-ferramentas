import { AudioService } from './audioService'

afterEach(() => vi.unstubAllGlobals())

test('aguarda o AudioContext retomar e toca um único alerta curto por execução', async () => {
  const resume = vi.fn(async () => { context.state = 'running' })
  const starts: number[] = []
  const context = {
    state: 'suspended', currentTime: 0, destination: {}, resume,
    createOscillator: () => ({ type: 'sine', frequency: { setValueAtTime: vi.fn() }, connect: (target: unknown) => target, start: (time: number) => starts.push(time), stop: vi.fn(), onended: null }),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (target: unknown) => target }),
  }
  vi.stubGlobal('AudioContext', vi.fn(() => context))
  const audio = new AudioService()
  audio.configure(true, 50)
  await expect(audio.startAlarm('run-1')).resolves.toBe(true)
  await expect(audio.startAlarm('run-1')).resolves.toBe(false)
  expect(resume).toHaveBeenCalledOnce()
  expect(starts).toHaveLength(5)
})

test('não cria contexto quando sons estão desabilitados', async () => {
  const AudioContextMock = vi.fn()
  vi.stubGlobal('AudioContext', AudioContextMock)
  const audio = new AudioService()
  audio.configure(false, 60)
  await expect(audio.startAlarm('run-muted')).resolves.toBe(false)
  expect(AudioContextMock).not.toHaveBeenCalled()
})
