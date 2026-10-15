import { useEffect, useState } from 'react'
import { toLocalDateKey } from './date'

export function useBrowserRefresh() {
  const [state, setState] = useState(() => ({ todayKey: toLocalDateKey(), revision: 0 }))

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>
    const scheduleMidnight = () => {
      clearTimeout(midnightTimer)
      const now = new Date()
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      midnightTimer = setTimeout(() => { refresh(); scheduleMidnight() }, Math.max(100, nextDay.getTime() - now.getTime() + 50))
    }
    const refresh = () => setState((current) => ({ todayKey: toLocalDateKey(), revision: current.revision + 1 }))
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') { refresh(); scheduleMidnight() } }
    const onFocus = () => { refresh(); scheduleMidnight() }

    scheduleMidnight()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    return () => {
      clearTimeout(midnightTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return state
}
