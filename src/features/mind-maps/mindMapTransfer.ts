import { calculateRadialLayout, connectionPath, transverseConnectionPath } from './layout'
import { validateMindMapDocument } from './tree'
import type { MindMap, MindMapAsset, MindMapConnection, MindMapDocument, MindMapTopic } from './types'

export const MIND_MAP_FILE_FORMAT = 'hub-mind-map'
export const MIND_MAP_FILE_VERSION = 1

export interface MindMapFileAsset extends Omit<MindMapAsset, 'blob'> { dataUrl: string }
export interface MindMapFile {
  format: typeof MIND_MAP_FILE_FORMAT
  version: typeof MIND_MAP_FILE_VERSION
  exportedAt: string
  map: MindMap
  topics: MindMapTopic[]
  connections: MindMapConnection[]
  assets: MindMapFileAsset[]
  integrity: { topics: number; connections: number; assets: number }
}

const MAX_TOPICS = 3000
const MAX_ASSETS = 300
const MAX_TOTAL_ASSET_BYTES = 50 * 1024 * 1024
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!))
const safeColor = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler uma imagem do mapa.')); reader.readAsDataURL(blob) })
}

export async function createMindMapFile(document: MindMapDocument, assets: MindMapAsset[]): Promise<MindMapFile> {
  validateMindMapDocument(document.map, document.topics)
  const referenced = new Set(document.topics.map((topic) => topic.imageAssetId).filter(Boolean))
  const fileAssets = await Promise.all(assets.filter((asset) => referenced.has(asset.id)).map(async ({ blob, ...asset }) => ({ ...asset, dataUrl: await blobToDataUrl(blob) })))
  const connections = (document.connections ?? []).map((item) => ({ ...item }))
  return { format: MIND_MAP_FILE_FORMAT, version: MIND_MAP_FILE_VERSION, exportedAt: new Date().toISOString(), map: { ...document.map, viewport: { ...document.map.viewport } }, topics: document.topics.map((topic) => ({ ...topic })), connections, assets: fileAssets, integrity: { topics: document.topics.length, connections: connections.length, assets: fileAssets.length } }
}

function validateUrl(value: unknown) { try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) } catch { return false } }
function validateTopic(value: unknown): value is MindMapTopic {
  if (!isObject(value)) return false
  const style = value.style; const links = value.links
  const styleValid = style === undefined || isObject(style) && ['background', 'color', 'borderColor'].every((key) => style[key] === undefined || typeof style[key] === 'string') && ['bold', 'italic'].every((key) => style[key] === undefined || typeof style[key] === 'boolean') && (style.fontScale === undefined || typeof style.fontScale === 'number' && style.fontScale >= .7 && style.fontScale <= 2) && (style.borderWidth === undefined || typeof style.borderWidth === 'number' && style.borderWidth >= 0 && style.borderWidth <= 8) && (style.borderRadius === undefined || typeof style.borderRadius === 'number' && style.borderRadius >= 0 && style.borderRadius <= 40) && (style.textAlign === undefined || ['left', 'center', 'right'].includes(String(style.textAlign)))
  const linksValid = links === undefined || Array.isArray(links) && links.length <= 100 && links.every((link) => isObject(link) && typeof link.id === 'string' && typeof link.label === 'string' && link.label.length <= 80 && validateUrl(link.url))
  const position = value.position
  return typeof value.id === 'string' && typeof value.mapId === 'string' && (value.parentId === null || typeof value.parentId === 'string') && Number.isInteger(value.order) && Number(value.order) >= 0 && typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= 500 && typeof value.collapsed === 'boolean' && (position === undefined || isObject(position) && Number.isFinite(position.x) && Number.isFinite(position.y)) && styleValid && linksValid && (value.icon === undefined || typeof value.icon === 'string' && value.icon.length <= 8) && (value.note === undefined || typeof value.note === 'string' && value.note.length <= 10000) && (value.imageAssetId === undefined || typeof value.imageAssetId === 'string') && typeof value.createdAt === 'number' && typeof value.updatedAt === 'number'
}
function validateMap(value: unknown): value is MindMap {
  if (!isObject(value) || !isObject(value.viewport)) return false
  return typeof value.id === 'string' && value.schemaVersion === 1 && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 100 && typeof value.rootId === 'string' && ['radial', 'manual', 'right', 'orgchart'].includes(String(value.layout)) && (value.theme === undefined || ['classic', 'minimal', 'colorful'].includes(String(value.theme))) && Number.isFinite(value.viewport.panX) && Number.isFinite(value.viewport.panY) && typeof value.viewport.zoom === 'number' && value.viewport.zoom >= .25 && value.viewport.zoom <= 3 && typeof value.createdAt === 'number' && typeof value.updatedAt === 'number'
}
function validateConnection(value: unknown): value is MindMapConnection { return Boolean(isObject(value) && typeof value.id === 'string' && typeof value.mapId === 'string' && typeof value.sourceId === 'string' && typeof value.targetId === 'string' && value.sourceId !== value.targetId && typeof value.label === 'string' && value.label.length <= 120 && typeof value.color === 'string' && typeof value.width === 'number' && value.width >= 1 && value.width <= 6 && typeof value.dashed === 'boolean' && typeof value.directed === 'boolean' && (value.shape === undefined || ['curve', 'straight'].includes(String(value.shape))) && (value.startMarker === undefined || typeof value.startMarker === 'boolean') && (value.endMarker === undefined || typeof value.endMarker === 'boolean') && (value.curveOffset === undefined || typeof value.curveOffset === 'number' && value.curveOffset >= -240 && value.curveOffset <= 240) && typeof value.createdAt === 'number' && typeof value.updatedAt === 'number') }
function validateAsset(value: unknown): value is MindMapFileAsset { return Boolean(isObject(value) && typeof value.id === 'string' && typeof value.mapId === 'string' && typeof value.name === 'string' && IMAGE_TYPES.includes(value.mimeType as typeof IMAGE_TYPES[number]) && typeof value.size === 'number' && value.size >= 0 && value.size <= 5 * 1024 * 1024 && typeof value.dataUrl === 'string' && value.dataUrl.startsWith(`data:${value.mimeType};base64,`) && typeof value.createdAt === 'number') }

export function parseMindMapFile(text: string): MindMapFile {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('O arquivo não contém JSON válido.') }
  if (!isObject(value) || value.format !== MIND_MAP_FILE_FORMAT || value.version !== MIND_MAP_FILE_VERSION || typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt))) throw new Error('Este arquivo não é um mapa compatível do Hub.')
  if (!validateMap(value.map) || !Array.isArray(value.topics) || !value.topics.every(validateTopic) || !Array.isArray(value.connections) || !value.connections.every(validateConnection) || !Array.isArray(value.assets) || !value.assets.every(validateAsset) || !isObject(value.integrity)) throw new Error('O arquivo do mapa contém dados inválidos.')
  const encodedBytes = value.assets.reduce((sum, asset) => sum + Math.ceil((asset.dataUrl.split(',')[1]?.length ?? 0) * .75), 0)
  if (value.topics.length > MAX_TOPICS || value.assets.length > MAX_ASSETS || value.assets.some((asset) => Math.ceil((asset.dataUrl.split(',')[1]?.length ?? 0) * .75) > 5 * 1024 * 1024) || encodedBytes > MAX_TOTAL_ASSET_BYTES) throw new Error('O mapa excede os limites seguros de importação.')
  const file = value as unknown as MindMapFile
  if (file.integrity.topics !== file.topics.length || file.integrity.connections !== file.connections.length || file.integrity.assets !== file.assets.length) throw new Error('A verificação de integridade do arquivo falhou.')
  const ids = new Set(file.topics.map(({ id }) => id)); const assetIds = new Set(file.assets.map(({ id }) => id))
  const relationKeys = new Set<string>(); const repeatedRelation = file.connections.some((item) => { const endpoints = item.directed ? `${item.sourceId}>${item.targetId}` : [item.sourceId, item.targetId].sort().join('~'); const key = `${endpoints}\u0000${item.label}`; if (relationKeys.has(key)) return true; relationKeys.add(key); return false })
  if (ids.size !== file.topics.length || new Set(file.connections.map(({ id }) => id)).size !== file.connections.length || assetIds.size !== file.assets.length || repeatedRelation) throw new Error('O arquivo contém identificadores duplicados.')
  if (file.topics.some((topic) => topic.mapId !== file.map.id || topic.imageAssetId && !assetIds.has(topic.imageAssetId)) || file.assets.some((asset) => asset.mapId !== file.map.id) || file.connections.some((item) => item.mapId !== file.map.id || !ids.has(item.sourceId) || !ids.has(item.targetId))) throw new Error('O arquivo contém referências inválidas.')
  validateMindMapDocument(file.map, file.topics); return file
}

export async function remapMindMapFile(file: MindMapFile): Promise<{ document: MindMapDocument; assets: MindMapAsset[] }> {
  const now = Date.now(); const mapId = crypto.randomUUID(); const topicIds = new Map(file.topics.map(({ id }) => [id, crypto.randomUUID()])); const assetIds = new Map(file.assets.map(({ id }) => [id, crypto.randomUUID()]))
  const map: MindMap = { ...file.map, id: mapId, rootId: topicIds.get(file.map.rootId)!, name: `${file.map.name.slice(0, 88)} (importado)`, createdAt: now, updatedAt: now }
  const topics = file.topics.map((topic) => ({ ...topic, id: topicIds.get(topic.id)!, mapId, parentId: topic.parentId ? topicIds.get(topic.parentId)! : null, imageAssetId: topic.imageAssetId ? assetIds.get(topic.imageAssetId) : undefined, createdAt: now, updatedAt: now }))
  const connections = file.connections.map((item) => ({ ...item, id: crypto.randomUUID(), mapId, sourceId: topicIds.get(item.sourceId)!, targetId: topicIds.get(item.targetId)!, createdAt: now, updatedAt: now }))
  const assets = await Promise.all(file.assets.map(async ({ dataUrl, ...asset }) => ({ ...asset, id: assetIds.get(asset.id)!, mapId, blob: await (await fetch(dataUrl)).blob(), createdAt: now })))
  validateMindMapDocument(map, topics); return { document: { map, topics, connections }, assets }
}

function wrappedLines(text: string, limit = 24) { const words = text.split(/\s+/); const lines: string[] = []; let line = ''; words.forEach((word) => { if (`${line} ${word}`.trim().length > limit && line) { lines.push(line); line = word } else line = `${line} ${word}`.trim() }); if (line) lines.push(line); return lines.slice(0, 8) }

export async function renderMindMapSvg(document: MindMapDocument, assets: MindMapAsset[], background: 'dark' | 'light' | 'transparent' = 'dark') {
  const topics = document.topics.map((topic) => ({ ...topic, collapsed: false })); const layout = calculateRadialLayout(topics, document.map.rootId, document.map.layout); const padding = 70; const width = Math.ceil(layout.width + padding * 2); const height = Math.ceil(layout.height + padding * 2)
  if (width > 12000 || height > 12000 || width * height > 48_000_000) throw new Error('O mapa é grande demais para exportação gráfica neste navegador.')
  const offsetX = padding - layout.minX; const offsetY = padding - layout.minY; const assetUrls = new Map<string, string>(); for (const asset of assets) assetUrls.set(asset.id, await blobToDataUrl(asset.blob))
  const hierarchy = topics.filter((topic) => topic.parentId).map((topic) => { const parent = layout.topics.get(topic.parentId!); const child = layout.topics.get(topic.id); return parent && child ? `<path d="${connectionPath({ ...parent, x: parent.x + offsetX, y: parent.y + offsetY }, { ...child, x: child.x + offsetX, y: child.y + offsetY })}" fill="none" stroke="#64748b" stroke-width="2"/>` : '' }).join('')
  const transverse = (document.connections ?? []).map((item) => { const source = layout.topics.get(item.sourceId); const target = layout.topics.get(item.targetId); if (!source || !target) return ''; const shiftedSource = { ...source, x: source.x + offsetX, y: source.y + offsetY }; const shiftedTarget = { ...target, x: target.x + offsetX, y: target.y + offsetY }; const x1 = shiftedSource.x + source.width / 2; const y1 = shiftedSource.y + source.height / 2; const x2 = shiftedTarget.x + target.width / 2; const y2 = shiftedTarget.y + target.height / 2; const color = safeColor(item.color, '#a78bfa'); return `<path d="${transverseConnectionPath(shiftedSource, shiftedTarget, item.shape, item.curveOffset)}" fill="none" stroke="${color}" stroke-width="${item.width}"${item.dashed ? ' stroke-dasharray="7 5"' : ''}${item.startMarker ? ' marker-start="url(#arrow)"' : ''}${(item.endMarker ?? item.directed) ? ' marker-end="url(#arrow)"' : ''}/>${item.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 10}" text-anchor="middle" fill="${color}" font-size="12">${escapeXml(item.label)}</text>` : ''}` }).join('')
  const nodes = [...layout.topics.values()].map((position) => { const topic = topics.find(({ id }) => id === position.id)!; const x = position.x + offsetX; const y = position.y + offsetY; const backgroundColor = safeColor(topic.style?.background, topic.id === document.map.rootId ? '#4f46e5' : '#1e293b'); const color = safeColor(topic.style?.color, '#f8fafc'); const border = safeColor(topic.style?.borderColor, '#64748b'); const lines = wrappedLines(`${topic.icon ? `${topic.icon} ` : ''}${topic.text}`); const image = topic.imageAssetId && assetUrls.get(topic.imageAssetId) ? `<image href="${assetUrls.get(topic.imageAssetId)}" x="${x + 8}" y="${y + 6}" width="32" height="32" preserveAspectRatio="xMidYMid meet"/>` : ''; const align = topic.style?.textAlign ?? 'center'; const textX = align === 'left' ? x + 14 : align === 'right' ? x + position.width - 14 : x + position.width / 2; const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'; const fontSize = (topic.id === document.map.rootId ? 18 : 14) * (topic.style?.fontScale ?? 1); return `<g><rect x="${x}" y="${y}" width="${position.width}" height="${position.height}" rx="${topic.style?.borderRadius ?? 14}" fill="${backgroundColor}" stroke="${border}" stroke-width="${topic.style?.borderWidth ?? (topic.id === document.map.rootId ? 2 : 1)}"/>${image}<text x="${textX}" y="${y + position.height / 2 - (lines.length - 1) * 9}" text-anchor="${anchor}" fill="${color}" font-family="Inter,Arial,sans-serif" font-size="${fontSize}"${topic.style?.bold ? ' font-weight="700"' : ''}${topic.style?.italic ? ' font-style="italic"' : ''}>${lines.map((line, index) => `<tspan x="${textX}" dy="${index ? 18 : 0}">${escapeXml(line)}</tspan>`).join('')}</text></g>` }).join('')
  const fill = background === 'transparent' ? 'none' : background === 'light' ? '#f8fafc' : '#0a0f1c'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs><rect width="100%" height="100%" fill="${fill}"/>${hierarchy}${transverse}${nodes}</svg>`
}

export async function renderMindMapPng(document: MindMapDocument, assets: MindMapAsset[], background: 'dark' | 'light' | 'transparent' = 'dark') {
  const svg = await renderMindMapSvg(document, assets, background); const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(svgBlob)
  try { const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new globalThis.Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error('O navegador não conseguiu renderizar o mapa.')); element.src = url }); const canvas = globalThis.document.createElement('canvas'); const scale = Math.min(2, 8192 / Math.max(image.width, image.height)); canvas.width = Math.max(1, Math.floor(image.width * scale)); canvas.height = Math.max(1, Math.floor(image.height * scale)); const context = canvas.getContext('2d'); if (!context) throw new Error('Exportação PNG não está disponível neste navegador.'); context.drawImage(image, 0, 0, canvas.width, canvas.height); return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG.')), 'image/png')) } finally { URL.revokeObjectURL(url) }
}

export function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = globalThis.document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0) }
export const safeFileName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'mapa-mental'
