import type { Habit, HabitCheckin, HabitDatabaseInfo } from '../../features/habits/types'
import { CHECKINS_STORE, HABITS_STORE, initializeDatabase, inspectDatabase, openDatabase, requestResult, transactionDone, upgradeToDatedCheckins } from './indexedDb'

const CHANGE_EVENT = 'habits:changed'
const emitChange = () => window.dispatchEvent(new Event(CHANGE_EVENT))

function normalizeHabit(record: Habit): Habit {
  return { ...record, name: String(record.name), days: Array.from({ length: 7 }, (_, index) => Boolean(record.days?.[index])) }
}

export const habitsRepository = {
  initialize: initializeDatabase,
  info: inspectDatabase,
  enableDatedCheckins: upgradeToDatedCheckins,
  subscribe(listener: () => void) {
    window.addEventListener(CHANGE_EVENT, listener)
    return () => window.removeEventListener(CHANGE_EVENT, listener)
  },
  async getAll(): Promise<Habit[]> {
    const db = await openDatabase()
    const transaction = db.transaction(HABITS_STORE, 'readonly')
    const records = await requestResult(transaction.objectStore(HABITS_STORE).getAll()) as Habit[]
    await transactionDone(transaction)
    return records.map(normalizeHabit).sort((a, b) => b.createdAt - a.createdAt)
  },
  async add(name: string): Promise<Habit> {
    const habit: Habit = { id: crypto.randomUUID(), name, days: Array(7).fill(false), createdAt: Date.now() }
    const db = await openDatabase()
    const transaction = db.transaction(HABITS_STORE, 'readwrite')
    transaction.objectStore(HABITS_STORE).add(habit)
    await transactionDone(transaction)
    emitChange()
    return habit
  },
  async update(habit: Habit): Promise<void> {
    const db = await openDatabase()
    const transaction = db.transaction(HABITS_STORE, 'readwrite')
    transaction.objectStore(HABITS_STORE).put({ ...normalizeHabit(habit), updatedAt: Date.now() })
    await transactionDone(transaction)
    emitChange()
  },
  async remove(id: string): Promise<void> {
    const db = await openDatabase()
    const stores = db.objectStoreNames.contains(CHECKINS_STORE) ? [HABITS_STORE, CHECKINS_STORE] : [HABITS_STORE]
    const transaction = db.transaction(stores, 'readwrite')
    transaction.objectStore(HABITS_STORE).delete(id)
    if (stores.includes(CHECKINS_STORE)) {
      const index = transaction.objectStore(CHECKINS_STORE).index('habitId')
      const cursor = index.openKeyCursor(IDBKeyRange.only(id))
      cursor.onsuccess = () => {
        if (cursor.result) { transaction.objectStore(CHECKINS_STORE).delete(cursor.result.primaryKey); cursor.result.continue() }
      }
    }
    await transactionDone(transaction)
    emitChange()
  },
  async getCheckins(startDate?: string, endDate?: string): Promise<HabitCheckin[]> {
    const db = await openDatabase()
    if (!db.objectStoreNames.contains(CHECKINS_STORE)) return []
    const transaction = db.transaction(CHECKINS_STORE, 'readonly')
    const store = transaction.objectStore(CHECKINS_STORE)
    const request = startDate && endDate ? store.index('date').getAll(IDBKeyRange.bound(startDate, endDate)) : store.getAll()
    const records = await requestResult(request) as HabitCheckin[]
    await transactionDone(transaction)
    return records
  },
  async toggleDate(habitId: string, date: string): Promise<boolean> {
    const db = await openDatabase()
    if (!db.objectStoreNames.contains(CHECKINS_STORE)) throw new Error('Faça um backup e habilite marcações por data primeiro.')
    const id = `${habitId}:${date}`
    const transaction = db.transaction(CHECKINS_STORE, 'readwrite')
    const store = transaction.objectStore(CHECKINS_STORE)
    const existing = await requestResult(store.get(id))
    if (existing) store.delete(id)
    else store.add({ id, habitId, date, completedAt: Date.now() } satisfies HabitCheckin)
    await transactionDone(transaction)
    emitChange()
    return !existing
  },
  async toggleLegacyDay(habit: Habit, dayIndex: number): Promise<boolean> {
    const days = [...habit.days]
    days[dayIndex] = !days[dayIndex]
    await this.update({ ...habit, days })
    return days[dayIndex]
  },
}

export type { HabitDatabaseInfo }
