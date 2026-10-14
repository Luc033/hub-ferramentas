import { useSyncExternalStore } from 'react'
import { pomodoroService } from './pomodoroService'

export const usePomodoro = () => useSyncExternalStore(pomodoroService.subscribe, pomodoroService.getSnapshot)
