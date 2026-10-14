import { useSyncExternalStore } from 'react'
import { focusSoundService } from './focusSoundService'
export const useFocusSound = () => useSyncExternalStore(focusSoundService.subscribe, focusSoundService.getSnapshot)
