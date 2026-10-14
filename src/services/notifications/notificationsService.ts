export const notificationsService = {
  isSupported: () => typeof Notification !== 'undefined',
  permission: () => typeof Notification === 'undefined' ? 'unsupported' as const : Notification.permission,
}
