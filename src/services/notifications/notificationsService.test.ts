import { notificationsService } from './notificationsService'

afterEach(() => vi.unstubAllGlobals())

test('não tenta notificar quando a API não existe', () => {
  vi.stubGlobal('Notification', undefined)
  expect(notificationsService.permission()).toBe('unsupported')
  expect(notificationsService.notifyFinished('timer')).toBe(false)
})

test('solicita permissão somente quando o método é chamado', async () => {
  const requestPermission = vi.fn().mockResolvedValue('granted')
  vi.stubGlobal('Notification', class {
    static permission = 'default'
    static requestPermission = requestPermission
  })
  expect(requestPermission).not.toHaveBeenCalled()
  await expect(notificationsService.requestPermission()).resolves.toBe('granted')
  expect(requestPermission).toHaveBeenCalledOnce()
})
