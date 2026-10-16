export const HOME_TITLE = 'Hub | Ferramentas Pessoais'
export const HUB_FAVICON = '/hub-logo.svg?v=1'

export function faviconForPath(pathname: string, habitsFavicon: string, pomodoroFavicon: string, timerFavicon: string, kanbanFavicon: string, notesFavicon: string, soundsFavicon: string) {
  if (pathname === '/habits') return habitsFavicon
  if (pathname === '/pomodoro') return pomodoroFavicon
  if (pathname === '/timer') return timerFavicon
  if (pathname === '/tasks') return kanbanFavicon
  if (pathname === '/notes' || pathname.startsWith('/notes/maps')) return notesFavicon
  if (pathname === '/sounds') return soundsFavicon
  return HUB_FAVICON
}

export function documentTitleForPath(pathname: string) {
  if (pathname === '/') return HOME_TITLE
  if (pathname === '/habits') return 'Hábitos | Hub'
  if (pathname === '/timer') return 'Timer | Hub'
  if (pathname === '/pomodoro') return 'Foco | Hub'
  if (pathname === '/tasks') return 'Kanban | Hub'
  if (pathname === '/notes') return 'Anotações | Hub'
  if (pathname === '/notes/maps' || pathname.startsWith('/notes/maps/')) return 'Mapas Mentais | Hub'
  if (pathname === '/sounds') return 'Sons | Hub'
  return 'Página não encontrada | Hub'
}
