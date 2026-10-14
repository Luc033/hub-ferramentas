import { ClockService, formatDuration } from './ClockService'

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
  expect(clock.getSnapshot().endAt).toBe(13_000)
  clock.destroy()
})

test('formata duração para o display legado', () => {
  expect(formatDuration(3_661_000)).toBe('01:01:01')
})
