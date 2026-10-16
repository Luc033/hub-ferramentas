type NotificationPermissionState = NotificationPermission | 'unsupported'

function supported() {
  return typeof Notification !== 'undefined' && (typeof window === 'undefined' || window.isSecureContext !== false)
}

export const notificationsService = {
  isSupported: supported,
  permission: (): NotificationPermissionState => supported() ? Notification.permission : 'unsupported',
  async requestPermission(): Promise<NotificationPermissionState> {
    if (!supported()) return 'unsupported'
    if (Notification.permission !== 'default') return Notification.permission
    try { return await Notification.requestPermission() }
    catch (reason) {
      if (import.meta.env.DEV) console.warn('Não foi possível solicitar permissão para notificações.', reason)
      return Notification.permission
    }
  },
  notifyFinished(mode: 'timer' | 'pomodoro', body?: string) {
    if (!supported() || Notification.permission !== 'granted') return false
    try {
      const isTimer = mode === 'timer'
      const notification = new Notification(isTimer ? '⏰ Temporizador encerrado!' : 'Fase Pomodoro concluída', {
        body: body ?? (isTimer ? 'Seu temporizador chegou ao fim.' : 'A fase atual do Pomodoro chegou ao fim.'),
        icon: '/favicon.svg',
        tag: `hub-${mode}-finished`,
        silent: true,
      })
      notification.onclick = () => {
        window.focus()
        const target = isTimer ? '/timer' : '/pomodoro'
        if (window.location.pathname !== target) {
          window.history.pushState(null, '', target)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
        notification.close()
      }
      return true
    } catch (reason) {
      if (import.meta.env.DEV) console.warn('Não foi possível exibir a notificação de conclusão.', reason)
      return false
    }
  },
}
