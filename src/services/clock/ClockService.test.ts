import { ClockService, formatDuration, hasConfiguredClockSession, shouldConfirmClockReplacement } from './ClockService'

test('usa endAt absoluto ao sincronizar e finaliza uma única vez', () => {
  let now = 1_000
  const clock = new ClockService({ now: () => now, storage: null })
  clock.setDuration(60_000)
  clock.start()
  now += 30_500
  clock.sync()
  expect(clock.getSnapshot().remainingMs).toBe(29_500)
  now += 60_000
  clock.sync()
  expect(clock.getSnapshot().status).toBe('alarming')
  expect(clock.getSnapshot().remainingMs).toBe(0)
  expect(clock.getSnapshot().notificationSent).toBe(false)
  clock.markNotificationSent()
  expect(clock.getSnapshot().notificationSent).toBe(true)
  clock.markNotificationSent()
  expect(clock.getSnapshot().notificationSent).toBe(true)
  clock.sync()
  expect(clock.getSnapshot().status).toBe('alarming')
  clock.destroy()
})

test('mantém o modo da sessão no motor compartilhado', () => {
  const clock = new ClockService({ storage: null })
  clock.setDuration(1_000, 'pomodoro')
  expect(clock.getSnapshot()).toMatchObject({ mode: 'pomodoro', status: 'ready' })
  clock.destroy()
})

test('associa uma tarefa sem presumir duração', () => {
  const clock = new ClockService({ storage: null })
  clock.associateTask('timer', 'task-1', 'Preparar relatório')
  expect(clock.getSnapshot()).toMatchObject({ mode: 'timer', status: 'idle', durationMs: 0, taskId: 'task-1', taskTitle: 'Preparar relatório' })
  clock.setDuration(60_000, 'timer')
  expect(clock.getSnapshot().taskId).toBe('task-1')
  clock.destroy()
})

test('mantém o vínculo coerente quando a tarefa é renomeada ou excluída', () => {
  const clock = new ClockService({ storage: null })
  clock.associateTask('timer', 'task-1', 'Título antigo')
  clock.setDuration(60_000, 'timer')
  clock.start()
  clock.renameAssociatedTask('task-1', 'Título novo')
  expect(clock.getSnapshot()).toMatchObject({ status: 'running', taskId: 'task-1', taskTitle: 'Título novo' })
  clock.clearTask('outra-tarefa')
  expect(clock.getSnapshot().taskId).toBe('task-1')
  clock.clearTask('task-1')
  expect(clock.getSnapshot()).toMatchObject({ status: 'running', taskId: null, taskTitle: null })
  clock.destroy()
})

test('pausa e retoma a partir do saldo real', () => {
  let now = 0
  const clock = new ClockService({ now: () => now, storage: null })
  clock.setDuration(5_000)
  clock.start()
  now = 2_000
  clock.pause()
  expect(clock.getSnapshot()).toMatchObject({ status: 'paused', remainingMs: 3_000, endAt: null })
  now = 10_000
  clock.start()
  expect(clock.getSnapshot()).toMatchObject({ startedAt: 0, endAt: 13_000 })
  clock.destroy()
})

test('encerra o alarme restaurando a última duração configurada', () => {
  let now = 0
  const clock = new ClockService({ now: () => now, storage: null })
  clock.setDuration(5_000)
  clock.start()
  now = 5_000
  clock.sync()
  expect(clock.getSnapshot()).toMatchObject({ status: 'alarming', remainingMs: 0 })
  clock.stopAlarm()
  expect(clock.getSnapshot()).toMatchObject({ status: 'ready', durationMs: 5_000, remainingMs: 5_000, startedAt: null, endAt: null, finishedAt: null })
  clock.destroy()
})

test('aceita duração zerada durante a edição e impede o início', () => {
  const clock = new ClockService({ storage: null })
  clock.configureDuration(0)
  clock.start()
  expect(clock.getSnapshot()).toMatchObject({ status: 'idle', durationMs: 0, remainingMs: 0 })
  clock.destroy()
})

test('formata duração para o display legado', () => {
  expect(formatDuration(3_661_000)).toBe('01:01:01')
})

test('persiste o instante de conclusão ao restaurar uma sessão vencida', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  values.set('hub.timer.session.v1', JSON.stringify({ status: 'running', mode: 'pomodoro', durationMs: 1_000, remainingMs: 1_000, startedAt: 0, endAt: 1_000, finishedAt: null, notificationSent: false, taskId: null, taskTitle: null }))
  const first = new ClockService({ now: () => 2_000, storage })
  const second = new ClockService({ now: () => 3_000, storage })
  expect(first.getSnapshot().finishedAt).toBe(2_000)
  expect(second.getSnapshot().finishedAt).toBe(2_000)
  first.destroy(); second.destroy()
})

test('identifica substituições que exigem confirmação', () => {
  const clock = new ClockService({ storage: null })
  expect(hasConfiguredClockSession(clock.getSnapshot())).toBe(false)
  clock.setDuration(60_000, 'timer')
  expect(hasConfiguredClockSession(clock.getSnapshot())).toBe(true)
  expect(shouldConfirmClockReplacement(clock.getSnapshot(), 'timer')).toBe(false)
  expect(shouldConfirmClockReplacement(clock.getSnapshot(), 'pomodoro')).toBe(true)
  clock.start(); clock.pause()
  expect(shouldConfirmClockReplacement(clock.getSnapshot(), 'timer')).toBe(true)
  clock.destroy()
})
