import type { CustomAlarmSound } from '../audio/alarmSounds'
import { ALARM_SOUNDS_STORE, openDatabase, requestResult, transactionDone, upgradeToAlarmSchema } from './indexedDb'

export const MAX_CUSTOM_ALARM_SIZE = 10 * 1024 * 1024
const CUSTOM_ID = 'custom'

const readFile = (file: Blob) => typeof file.arrayBuffer === 'function' ? file.arrayBuffer() : new Promise<ArrayBuffer>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as ArrayBuffer)
  reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo.'))
  reader.readAsArrayBuffer(file)
})

export const alarmSoundsRepository = {
  async getCustom(): Promise<CustomAlarmSound | null> {
    const db = await openDatabase()
    if (!db.objectStoreNames.contains(ALARM_SOUNDS_STORE)) return null
    const transaction = db.transaction(ALARM_SOUNDS_STORE, 'readonly')
    const result = await requestResult(transaction.objectStore(ALARM_SOUNDS_STORE).get(CUSTOM_ID)) as CustomAlarmSound | undefined
    await transactionDone(transaction)
    return result ?? null
  },

  async saveCustom(file: File): Promise<CustomAlarmSound> {
    if (file.size > MAX_CUSTOM_ALARM_SIZE) throw new Error('O arquivo excede o limite de 10 MB.')
    if (!file.size || file.type && !file.type.startsWith('audio/')) throw new Error('Não foi possível utilizar esse arquivo. Selecione um áudio válido e compatível.')
    const record: CustomAlarmSound = { id: CUSTOM_ID, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, data: await readFile(file), updatedAt: Date.now() }
    await upgradeToAlarmSchema()
    const db = await openDatabase()
    const transaction = db.transaction(ALARM_SOUNDS_STORE, 'readwrite')
    transaction.objectStore(ALARM_SOUNDS_STORE).put(record)
    await transactionDone(transaction)
    return record
  },
}
