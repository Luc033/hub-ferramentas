import JSZip from 'jszip'
import { notesRepository } from '../../services/db/notesRepository'
import type { Note, NoteBlock } from './types'

const safeName = (value: string) => (value.trim() || 'sem-titulo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'anotacao'

function triggerDownload(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0) }
const blobToArrayBuffer = (blob: Blob) => typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob) })

function referencedAssetIds(blocks: NoteBlock[]) {
  const ids = new Set<string>(); const visit = (value: unknown) => { if (typeof value === 'string' && value.startsWith('hub-note-asset:')) ids.add(value.slice('hub-note-asset:'.length)); else if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') Object.values(value).forEach(visit) }; visit(blocks); return [...ids]
}

export async function downloadNoteFile(note: Note, kind: 'json' | 'txt' | 'md' | 'html', rendered?: { markdown?: string; html?: string }) {
  let body: string; let type: string
  if (kind === 'json') {
    const ids = referencedAssetIds(note.blocks); const assets = (await Promise.all(ids.map((id) => notesRepository.getAsset(id)))).filter((asset) => asset !== null)
    if (assets.length) { const zip = new JSZip(); zip.file('note.json', JSON.stringify({ format: 'hub-note', version: 1, note, assets: assets.map(({ blob: _blob, ...asset }) => ({ ...asset, path: `assets/${asset.id}` })) }, null, 2)); await Promise.all(assets.map(async (asset) => zip.file(`assets/${asset.id}`, await blobToArrayBuffer(asset.blob)))); triggerDownload(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `${safeName(note.title)}.zip`); return }
    body = JSON.stringify(note, null, 2); type = 'application/json'
  }
  else if (kind === 'txt') { body = `${note.title || 'Sem título'}\n\n${note.content}`; type = 'text/plain' }
  else if (kind === 'md') { body = `# ${note.title || 'Sem título'}\n\n${rendered?.markdown ?? note.content}`; type = 'text/markdown' }
  else { body = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(note.title || 'Sem título')}</title><style>body{max-width:850px;margin:3rem auto;padding:0 1.5rem;font:17px/1.65 system-ui;color:#172033}img{max-width:100%}pre{overflow:auto;background:#f1f5f9;padding:1rem}table{border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:.5rem}</style><h1>${escapeHtml(note.title || 'Sem título')}</h1>${rendered?.html ?? `<pre>${escapeHtml(note.content)}</pre>`}</html>`; type = 'text/html' }
  triggerDownload(new Blob([body], { type: `${type};charset=utf-8` }), `${safeName(note.title)}.${kind}`)
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!) }
