import { AudioService } from './audioService'
import { alarmSoundsRepository } from '../db/alarmSoundsRepository'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

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

test('expõe seis alarmes nativos e permite prévia mesmo com alertas automáticos desativados', async () => {
  vi.useFakeTimers()
  const stopped: boolean[] = []
  const context = {
    state: 'running', currentTime: 0, destination: {}, resume: vi.fn(),
    createOscillator: () => ({ type: 'sine', frequency: { setValueAtTime: vi.fn() }, connect: (target: unknown) => target, start: vi.fn(), stop: () => stopped.push(true), disconnect: vi.fn(), onended: null }),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (target: unknown) => target }),
    createBiquadFilter: () => ({ type: 'lowpass', frequency: { setValueAtTime: vi.fn() }, connect: (target: unknown) => target }),
  }
  vi.stubGlobal('AudioContext', vi.fn(() => context))
  const audio = new AudioService()
  audio.configure(false, 40, 'aurora')
  expect(audio.listSounds()).toHaveLength(6)
  await expect(audio.preview('aurora')).resolves.toBe(true)
  expect(audio.getPreviewSoundId()).toBe('aurora')
  await expect(audio.preview('retro')).resolves.toBe(true)
  expect(stopped.length).toBeGreaterThan(0)
  expect(audio.getPreviewSoundId()).toBe('retro')
  audio.stopPreview()
  expect(audio.getPreviewSoundId()).toBeNull()
  vi.useRealTimers()
})

test('repete o alarme selecionado e cancela todas as repetições ao parar', async () => {
  vi.useFakeTimers()
  const start = vi.fn()
  const stop = vi.fn()
  const context = {
    state: 'running', currentTime: 0, destination: {}, resume: vi.fn(),
    createOscillator: () => ({ type: 'sine', frequency: { setValueAtTime: vi.fn() }, connect: (target: unknown) => target, start, stop, disconnect: vi.fn(), onended: null }),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (target: unknown) => target }),
    createBiquadFilter: () => ({ type: 'lowpass', frequency: { setValueAtTime: vi.fn() }, connect: (target: unknown) => target }),
  }
  vi.stubGlobal('AudioContext', vi.fn(() => context))
  const audio = new AudioService(); audio.configure(true, 60, 'digital-pulse')
  await expect(audio.startAlarm('loop-1')).resolves.toBe(true)
  const firstCycle = start.mock.calls.length
  await vi.advanceTimersByTimeAsync(1600)
  expect(start.mock.calls.length).toBeGreaterThan(firstCycle)
  audio.stopAlarm()
  const stoppedAt = start.mock.calls.length
  await vi.advanceTimersByTimeAsync(5000)
  expect(start).toHaveBeenCalledTimes(stoppedAt)
  expect(stop).toHaveBeenCalled()
  vi.useRealTimers()
})

test('rejeita arquivo grande antes de criar ou substituir áudio', async () => {
  const audio = new AudioService()
  const oversized = { name: 'grande.mp3', type: 'audio/mpeg', size: 10 * 1024 * 1024 + 1 } as File
  await expect(audio.importCustomSound(oversized)).rejects.toThrow('10 MB')
})

test('decodifica o arquivo antes de persistir um áudio personalizado válido', async () => {
  const decoded = { duration: 2 } as AudioBuffer
  const decodeAudioData = vi.fn(async () => decoded)
  const context = { state: 'running', resume: vi.fn(), decodeAudioData } as unknown as AudioContext
  vi.stubGlobal('AudioContext', vi.fn(() => context))
  const saved = { id: 'custom', name: 'meu.wav', mimeType: 'audio/wav', size: 4, data: new ArrayBuffer(4), updatedAt: 1 } as const
  vi.spyOn(alarmSoundsRepository, 'saveCustom').mockResolvedValue(saved)
  const file = { name: 'meu.wav', type: 'audio/wav', size: 4, arrayBuffer: vi.fn(async () => new ArrayBuffer(4)) } as unknown as File
  const audio = new AudioService()
  await expect(audio.importCustomSound(file)).resolves.toEqual(saved)
  expect(decodeAudioData).toHaveBeenCalledOnce()
  expect(alarmSoundsRepository.saveCustom).toHaveBeenCalledWith(file)
})

test('usa o alarme original como fallback quando o personalizado não existe', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const starts: number[] = []
  const context = {
    state: 'running', currentTime: 0, destination: {}, resume: vi.fn(),
    createOscillator: () => ({ type: 'sine', frequency: { setValueAtTime: vi.fn() }, connect: (target: unknown) => target, start: (at: number) => starts.push(at), stop: vi.fn(), disconnect: vi.fn(), onended: null }),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (target: unknown) => target }),
  }
  vi.stubGlobal('AudioContext', vi.fn(() => context))
  vi.spyOn(alarmSoundsRepository, 'getCustom').mockResolvedValue(null)
  const audio = new AudioService(); audio.configure(true, 60, 'custom')
  await expect(audio.startAlarm('custom-ausente')).resolves.toBe(true)
  expect(starts).toHaveLength(5)
  audio.stopAlarm()
})
