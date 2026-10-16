import JSZip from 'jszip'
import { normalizeNote, type Note, type NoteAsset, type NoteFolder, type NoteSnapshot, type NoteTag } from '../../features/notes/types'
import { blocksAreSafe } from '../../features/notes/noteSecurity'
import { NOTE_ASSETS_STORE, NOTE_FOLDERS_STORE, NOTE_SNAPSHOTS_STORE, NOTE_TAGS_STORE, NOTES_STORE, openDatabase, requestResult, transactionDone } from '../db/indexedDb'
import { notesRepository } from '../db/notesRepository'

const FORMAT = 'hub-notes-backup'
const VERSION = 1
const MAX_BACKUP_BYTES = 100 * 1024 * 1024
const MAX_ENTRIES = 2000

interface AssetMeta { id: string; mimeType: string; bytes: number; name: string; alt: string; createdAt: number; path: string }
export interface NotesBackupManifest { format: typeof FORMAT; version: number; exportedAt: string; notes: Note[]; folders: NoteFolder[]; tags: NoteTag[]; snapshots: NoteSnapshot[]; assets: AssetMeta[]; checksum: string }
export interface NotesImportPreview { notes: number; folders: number; tags: number; assets: number; conflicts: number; manifest: NotesBackupManifest; zip: JSZip }

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const blobToArrayBuffer = (blob: Blob) => typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob) })
async function checksum(value: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', encode(value))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0)
}

function validImageBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.slice(0, 6)))
  if (mimeType === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}

export const notesBackupService = {
  async createBlob() {
    const [notes, folders, tags, assets] = await Promise.all([notesRepository.getNotes(), notesRepository.getFolders(), notesRepository.getTags(), notesRepository.getAssets()])
    const snapshots = (await Promise.all(notes.map((note) => notesRepository.getSnapshots(note.id)))).flat()
    const assetMeta: AssetMeta[] = assets.map(({ blob: _blob, ...asset }) => ({ ...asset, path: `assets/${asset.id}` }))
    const payload = { notes, folders, tags, snapshots, assets: assetMeta }
    const manifest: NotesBackupManifest = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), ...payload, checksum: await checksum(payload) }
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify(manifest, null, 2)); await Promise.all(assets.map(async (asset) => zip.file(`assets/${asset.id}`, await blobToArrayBuffer(asset.blob))))
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  },
  async download() { const blob = await this.createBlob(); download(blob, `hub-anotacoes-backup-${new Date().toISOString().slice(0, 10)}.zip`); await notesRepository.setMeta('lastBackupAt', Date.now()) },
  async preview(file: File): Promise<NotesImportPreview> {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('O backup excede o limite de 100 MB.')
    const zip = await JSZip.loadAsync(file, { checkCRC32: true }); const names = Object.keys(zip.files)
    if (names.length > MAX_ENTRIES || names.some((name) => name.includes('..') || name.startsWith('/') || name.includes('\\'))) throw new Error('O pacote contém caminhos ou quantidade de arquivos inválidos.')
    const manifestFile = zip.file('manifest.json'); if (!manifestFile) throw new Error('Manifesto do backup não encontrado.')
    const raw = JSON.parse(await manifestFile.async('string')) as Partial<NotesBackupManifest>
    if (raw.format !== FORMAT || raw.version !== VERSION || !Array.isArray(raw.notes) || !Array.isArray(raw.folders) || !Array.isArray(raw.tags) || !Array.isArray(raw.assets) || !Array.isArray(raw.snapshots)) throw new Error('Backup de Anotações incompatível ou incompleto.')
    const notes = raw.notes.map((note) => normalizeNote(note)); if (notes.some((note) => !blocksAreSafe(note.blocks))) throw new Error('O backup contém blocos ou endereços inseguros.')
    const payload = { notes, folders: raw.folders, tags: raw.tags, snapshots: raw.snapshots, assets: raw.assets }
    if (raw.checksum !== await checksum(payload)) throw new Error('A verificação de integridade do backup falhou.')
    if (raw.folders.some((folder) => !folder || typeof folder.id !== 'string' || typeof folder.name !== 'string' || !Number.isFinite(folder.createdAt) || !Number.isFinite(folder.updatedAt)) || raw.tags.some((tag) => !tag || typeof tag.id !== 'string' || typeof tag.name !== 'string' || typeof tag.color !== 'string') || raw.snapshots.some((snapshot) => !snapshot || typeof snapshot.id !== 'string' || typeof snapshot.noteId !== 'string' || !Array.isArray(snapshot.blocks) || !blocksAreSafe(snapshot.blocks))) throw new Error('O backup contém dados de organização ou histórico inválidos.')
    for (const asset of raw.assets) {
      if (!asset || typeof asset.id !== 'string' || asset.path !== `assets/${asset.id}` || !zip.file(asset.path) || asset.bytes > 10 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(asset.mimeType)) throw new Error('O backup contém uma imagem inválida ou ausente.')
      const bytes = await zip.file(asset.path)!.async('uint8array'); if (bytes.byteLength !== asset.bytes || !validImageBytes(bytes, asset.mimeType)) throw new Error('O backup contém uma imagem corrompida ou incompatível.')
    }
    const unique = (records: Array<{ id: string }>) => new Set(records.map(({ id }) => id)).size === records.length
    if (![notes, raw.folders, raw.tags, raw.snapshots, raw.assets].every(unique)) throw new Error('O backup contém identificadores duplicados.')
    const noteIds = new Set(notes.map(({ id }) => id)); const folderIds = new Set(raw.folders.map(({ id }) => id)); const tagIds = new Set(raw.tags.map(({ id }) => id))
    if (notes.some((note) => note.folderId && !folderIds.has(note.folderId) || note.tagIds.some((id) => !tagIds.has(id))) || raw.snapshots.some((snapshot) => !noteIds.has(snapshot.noteId))) throw new Error('O backup contém referências quebradas entre notas e sua organização.')
    const currentIds = new Set((await notesRepository.getNotes()).map((note) => note.id))
    return { notes: notes.length, folders: raw.folders.length, tags: raw.tags.length, assets: raw.assets.length, conflicts: notes.filter((note) => currentIds.has(note.id)).length, manifest: { ...raw, notes } as NotesBackupManifest, zip }
  },
  async import(preview: NotesImportPreview, mode: 'merge' | 'replace') {
    const { manifest, zip } = preview
    const restoredAssets = await Promise.all(manifest.assets.map(async (meta) => {
      const bytes = await zip.file(meta.path)!.async('uint8array'); if (bytes.byteLength !== meta.bytes) throw new Error(`A imagem ${meta.name} está corrompida.`)
      return { id: meta.id, blob: new Blob([bytes], { type: meta.mimeType }), mimeType: meta.mimeType, bytes: meta.bytes, name: meta.name, alt: meta.alt, createdAt: meta.createdAt } satisfies NoteAsset
    }))
    const db = await openDatabase(); const stores = [NOTES_STORE, NOTE_FOLDERS_STORE, NOTE_TAGS_STORE, NOTE_ASSETS_STORE, NOTE_SNAPSHOTS_STORE]; const tx = db.transaction(stores, 'readwrite')
    const notes = tx.objectStore(NOTES_STORE); const folders = tx.objectStore(NOTE_FOLDERS_STORE); const tags = tx.objectStore(NOTE_TAGS_STORE); const assets = tx.objectStore(NOTE_ASSETS_STORE); const snapshots = tx.objectStore(NOTE_SNAPSHOTS_STORE)
    if (mode === 'replace') { notes.clear(); folders.clear(); tags.clear(); assets.clear(); snapshots.clear() }
    let imported = 0; let ignored = 0
    for (const note of manifest.notes) { if (mode === 'merge' && await requestResult(notes.get(note.id))) ignored++; else { notes.put(note); imported++ } }
    for (const folder of manifest.folders) { if (mode === 'merge' && await requestResult(folders.get(folder.id))) ignored++; else { folders.put(folder); imported++ } }
    for (const tag of manifest.tags) { if (mode === 'merge' && await requestResult(tags.get(tag.id))) ignored++; else { tags.put(tag); imported++ } }
    for (const snapshot of manifest.snapshots) { if (mode === 'merge' && await requestResult(snapshots.get(snapshot.id))) ignored++; else { snapshots.put(snapshot); imported++ } }
    for (const asset of restoredAssets) {
      if (mode === 'merge' && await requestResult(assets.get(asset.id))) { ignored++; continue }
      assets.put(asset); imported++
    }
    await transactionDone(tx); window.dispatchEvent(new Event('notes:changed')); return { imported, ignored }
  },
}
