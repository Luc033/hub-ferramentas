export const HOME_TITLE = 'Hub | Ferramentas Pessoais'
export const HUB_FAVICON = '/hub-logo.svg?v=1'

export function faviconForPath(pathname: string, habitsFavicon: string, pomodoroFavicon: string) {
  if (pathname === '/habits') return habitsFavicon
  if (pathname === '/pomodoro') return pomodoroFavicon
  return HUB_FAVICON
}

export function documentTitleForPath(pathname: string) {
  if (pathname === '/') return HOME_TITLE
  if (pathname === '/habits') return 'Hábitos | Hub'
  if (pathname === '/timer') return 'Temporizador | Hub'
  if (pathname === '/pomodoro') return 'Foco | Hub'
  if (pathname === '/tasks') return 'Kanban | Hub'
  if (pathname === '/notes') return 'Anotações | Hub'
  if (pathname === '/notes/maps' || pathname.startsWith('/notes/maps/')) return 'Mapas Mentais | Hub'
  if (pathname === '/sounds') return 'Sons de Foco | Hub'
  return 'Página não encontrada | Hub'
}
