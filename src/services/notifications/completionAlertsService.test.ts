import type { ClockState } from '../clock/ClockService'
import { CompletionAlertsService } from './completionAlertsService'

function alarming(runId: string): ClockState {
  return { status: 'alarming', mode: 'timer', durationMs: 5_000, remainingMs: 0, startedAt: 0, endAt: null, finishedAt: 5_000, notificationSent: false, runId, taskId: null, taskTitle: null }
}

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test('processa cada execução apenas uma vez, inclusive entre instâncias', async () => {
  const storage = memoryStorage()
  const notify = vi.fn(() => true)
  const playSound = vi.fn(async () => true)
  const first = new CompletionAlertsService({ storage, notify, playSound })
  const second = new CompletionAlertsService({ storage, notify, playSound })
  const results = await Promise.all([first.process(alarming('run-1'), true), second.process(alarming('run-1'), true)])
  expect(results.filter((result) => result.processed)).toHaveLength(1)
  expect(notify).toHaveBeenCalledOnce()
  expect(playSound).toHaveBeenCalledOnce()
})

test('mantém som e notificação independentes e respeita a preferência', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const sound = vi.fn(async () => true)
  const disabledNotify = vi.fn(() => true)
  const disabled = new CompletionAlertsService({ storage: memoryStorage(), notify: disabledNotify, playSound: sound })
  await disabled.process(alarming('run-disabled'), false)
  expect(disabledNotify).not.toHaveBeenCalled()
  expect(sound).toHaveBeenCalledOnce()

  const failingNotify = vi.fn(() => { throw new Error('bloqueada') })
  const independentSound = vi.fn(async () => true)
  const independent = new CompletionAlertsService({ storage: memoryStorage(), notify: failingNotify, playSound: independentSound })
  await expect(independent.process(alarming('run-failure'), true)).resolves.toMatchObject({ processed: true, notificationShown: false, soundPlayed: true })
  expect(independentSound).toHaveBeenCalledOnce()
})
