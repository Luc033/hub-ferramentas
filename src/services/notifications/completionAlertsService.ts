import { audioService } from '../audio/audioService'
import type { ClockState } from '../clock/ClockService'
import { notificationsService } from './notificationsService'

const STORAGE_KEY = 'hub.timer.processed-runs.v1'
const MAX_AGE = 7 * 24 * 60 * 60 * 1000

export interface CompletionAlertResult {
  processed: boolean
  notificationShown: boolean
  soundPlayed: boolean
}

interface CompletionAlertsOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  notify?: (mode: 'timer' | 'pomodoro', body?: string) => boolean
  playSound?: (runId: string) => Promise<boolean>
  now?: () => number
}

export class CompletionAlertsService {
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null
  private notify: NonNullable<CompletionAlertsOptions['notify']>
  private playSound: NonNullable<CompletionAlertsOptions['playSound']>
  private now: () => number
  private processedInMemory = new Set<string>()
  private inFlight = new Map<string, Promise<CompletionAlertResult>>()

  constructor(options: CompletionAlertsOptions = {}) {
    this.storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage
    this.notify = options.notify ?? notificationsService.notifyFinished
    this.playSound = options.playSound ?? ((runId) => audioService.startAlarm(runId))
    this.now = options.now ?? Date.now
  }

  process(clock: ClockState, notificationsEnabled: boolean, body?: string) {
    if (clock.status !== 'alarming' || !clock.runId) return Promise.resolve({ processed: false, notificationShown: false, soundPlayed: false })
    const runId = clock.runId
    const existing = this.inFlight.get(runId)
    if (existing) return existing
    const pending = this.withLock(runId, () => this.claimAndDeliver(clock, notificationsEnabled, body)).finally(() => this.inFlight.delete(runId))
    this.inFlight.set(runId, pending)
    return pending
  }

  private async withLock(runId: string, work: () => Promise<CompletionAlertResult>) {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(`hub-timer-completion:${runId}`, work)
    return work()
  }

  private async claimAndDeliver(clock: ClockState, notificationsEnabled: boolean, body?: string): Promise<CompletionAlertResult> {
    if (!clock.runId || this.wasProcessed(clock.runId)) return { processed: false, notificationShown: false, soundPlayed: false }
    this.markProcessed(clock.runId)
    let notificationShown = false
    let soundPlayed = false
    try { notificationShown = notificationsEnabled ? this.notify(clock.mode, body) : false }
    catch (reason) { if (import.meta.env.DEV) console.warn('A notificação de conclusão falhou.', reason) }
    try { soundPlayed = await this.playSound(clock.runId) }
    catch (reason) { if (import.meta.env.DEV) console.warn('O alerta sonoro de conclusão falhou.', reason) }
    return { processed: true, notificationShown, soundPlayed }
  }

  private wasProcessed(runId: string) {
    if (this.processedInMemory.has(runId)) return true
    return Object.hasOwn(this.readProcessed(), runId)
  }

  private markProcessed(runId: string) {
    this.processedInMemory.add(runId)
    if (!this.storage) return
    const cutoff = this.now() - MAX_AGE
    const recent = Object.entries(this.readProcessed()).filter(([, timestamp]) => timestamp >= cutoff).slice(-99)
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries([...recent, [runId, this.now()]]))) }
    catch (reason) { if (import.meta.env.DEV) console.warn('Não foi possível registrar a conclusão do temporizador.', reason) }
  }

  private readProcessed(): Record<string, number> {
    try {
      const value = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
      return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
    } catch { return {} }
  }
}

export const completionAlertsService = new CompletionAlertsService()
