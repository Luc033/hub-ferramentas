export const notificationsService = {
  isSupported: () => typeof Notification !== 'undefined',
  permission: () => typeof Notification === 'undefined' ? 'unsupported' as const : Notification.permission,
  async requestPermission() {
    if (typeof Notification === 'undefined') return 'unsupported' as const
    return Notification.requestPermission()
  },
  notifyTimerFinished() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    const notification = new Notification('Temporizador concluído', { body: 'O tempo definido chegou ao fim.', icon: '/favicon.svg', tag: 'hub-timer-finished' })
    notification.onclick = () => { window.focus(); notification.close() }
    return true
  },
}
