import type { Habit, HabitCheckin } from '../../features/habits/types'
import { CHECKINS_STORE, HABITS_STORE, openDatabase, requestResult, transactionDone } from '../db/indexedDb'

export interface HubBackup {
  schemaVersion: number
  exportedAt: string
  appVersion: string
  records: { habits: Habit[]; habitCheckins?: HabitCheckin[]; [storeName: string]: unknown[] | undefined }
}

export interface ImportReport { imported: number; ignored: number }
export type ImportMode = 'merge' | 'replace'

const isHabit = (value: unknown): value is Habit => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Habit>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.createdAt === 'number' && Array.isArray(item.days) && item.days.length === 7 && item.days.every((day) => typeof day === 'boolean')
}

const isCheckin = (value: unknown): value is HabitCheckin => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<HabitCheckin>
  return typeof item.id === 'string' && typeof item.habitId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date)) && typeof item.completedAt === 'number'
}

export function parseBackup(text: string): HubBackup {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('O arquivo não contém JSON válido.') }

  // Formato legado aceito: array direto de hábitos.
  if (Array.isArray(parsed)) {
    if (!parsed.every(isHabit)) throw new Error('O backup legado contém hábitos inválidos.')
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), appVersion: 'legacy', records: { habits: parsed } }
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('Formato de backup não reconhecido.')
  const backup = parsed as Partial<HubBackup>
  if (typeof backup.schemaVersion !== 'number' || typeof backup.exportedAt !== 'string' || typeof backup.appVersion !== 'string' || !backup.records) throw new Error('Metadados obrigatórios ausentes no backup.')
  if (!Array.isArray(backup.records.habits) || !backup.records.habits.every(isHabit)) throw new Error('A lista de hábitos do backup é inválida.')
  if (backup.records.habitCheckins && (!Array.isArray(backup.records.habitCheckins) || !backup.records.habitCheckins.every(isCheckin))) throw new Error('As marcações datadas do backup são inválidas.')
  if (Object.values(backup.records).some((records) => records !== undefined && !Array.isArray(records))) throw new Error('Uma store do backup possui formato inválido.')
  return backup as HubBackup
}

export async function createBackup(): Promise<HubBackup> {
  const db = await openDatabase()
  const stores = Array.from(db.objectStoreNames)
  const transaction = db.transaction(stores, 'readonly')
  const records: HubBackup['records'] = { habits: [] }
  for (const storeName of stores) records[storeName] = await requestResult(transaction.objectStore(storeName).getAll()) as unknown[]
  await transactionDone(transaction)
  return { schemaVersion: db.version, exportedAt: new Date().toISOString(), appVersion: '1.0.0', records }
}

export async function downloadBackup() {
  const backup = await createBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `hub-ferramentas-backup-${backup.exportedAt.slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return backup
}

export async function importBackup(backup: HubBackup, mode: ImportMode): Promise<ImportReport> {
  const db = await openDatabase()
  if (backup.records.habitCheckins?.length && !db.objectStoreNames.contains(CHECKINS_STORE)) throw new Error('Habilite marcações por data antes de importar este backup.')
  const stores = [HABITS_STORE, ...(db.objectStoreNames.contains(CHECKINS_STORE) ? [CHECKINS_STORE] : [])]
  const transaction = db.transaction(stores, 'readwrite')
  const habitsStore = transaction.objectStore(HABITS_STORE)
  const checkinsStore = stores.includes(CHECKINS_STORE) ? transaction.objectStore(CHECKINS_STORE) : null
  let imported = 0
  let ignored = 0

  if (mode === 'replace') {
    habitsStore.clear()
    checkinsStore?.clear()
    backup.records.habits.forEach((record) => { habitsStore.put(record); imported++ })
    backup.records.habitCheckins?.forEach((record) => { checkinsStore?.put(record); imported++ })
  } else {
    for (const record of backup.records.habits) {
      const existing = await requestResult(habitsStore.get(record.id))
      if (existing) ignored++
      else { habitsStore.add(record); imported++ }
    }
    for (const record of backup.records.habitCheckins ?? []) {
      const existing = checkinsStore ? await requestResult(checkinsStore.get(record.id)) : true
      if (existing) ignored++
      else { checkinsStore!.add(record); imported++ }
    }
  }
  await transactionDone(transaction)
  window.dispatchEvent(new Event('habits:changed'))
  return { imported, ignored }
}
