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

test('não solicita novamente quando a permissão está bloqueada', async () => {
  const requestPermission = vi.fn()
  vi.stubGlobal('Notification', class {
    static permission = 'denied'
    static requestPermission = requestPermission
  })
  await expect(notificationsService.requestPermission()).resolves.toBe('denied')
  expect(requestPermission).not.toHaveBeenCalled()
})

test('cria a notificação do Timer e direciona a aba existente ao clicar', () => {
  const close = vi.fn()
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined)
  let created: { title: string; options?: NotificationOptions; onclick: ((event: Event) => void) | null } | null = null
  vi.stubGlobal('Notification', class {
    static permission = 'granted'
    static requestPermission = vi.fn()
    onclick: ((event: Event) => void) | null = null
    constructor(public title: string, public options?: NotificationOptions) { created = this }
    close = close
  })
  window.history.replaceState(null, '', '/')
  expect(notificationsService.notifyFinished('timer')).toBe(true)
  expect(created).toMatchObject({ title: '⏰ Temporizador encerrado!', options: { body: 'Seu temporizador chegou ao fim.', icon: '/favicon.svg', tag: 'hub-timer-finished' } })
  ;(created as unknown as { onclick: (event: Event) => void }).onclick(new Event('click'))
  expect(window.location.pathname).toBe('/timer')
  expect(focus).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})

test('uma falha da API de notificações não interrompe a aplicação', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.stubGlobal('Notification', class {
    static permission = 'granted'
    constructor() { throw new Error('falha do navegador') }
  })
  expect(notificationsService.notifyFinished('timer')).toBe(false)
})
