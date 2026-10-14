export const notificationsService = {
  isSupported: () => typeof Notification !== 'undefined',
  permission: () => typeof Notification === 'undefined' ? 'unsupported' as const : Notification.permission,
  async requestPermission() {
    if (typeof Notification === 'undefined') return 'unsupported' as const
    return Notification.requestPermission()
  },
  notifyFinished(mode: 'timer' | 'pomodoro', body?: string) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    const notification = new Notification(mode === 'pomodoro' ? 'Fase Pomodoro concluída' : 'Temporizador concluído', { body: body ?? 'O tempo definido chegou ao fim.', icon: '/favicon.svg', tag: `hub-${mode}-finished` })
    notification.onclick = () => { window.focus(); notification.close() }
    return true
  },
}
