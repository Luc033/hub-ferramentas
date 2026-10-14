import { useSyncExternalStore } from 'react'
import { clockService } from './ClockService'

export const useClock = () => useSyncExternalStore(clockService.subscribe, clockService.getSnapshot)
