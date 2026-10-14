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
