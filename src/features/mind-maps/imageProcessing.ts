const SUPPORTED = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024
export interface ProcessedImage { file: File; originalSize: number; finalSize: number; resized: boolean }

export async function prepareMindMapImage(file: File, maxDimension = 1600): Promise<ProcessedImage> {
  if (!SUPPORTED.includes(file.type)) throw new Error('Use uma imagem PNG, JPEG ou WebP.')
  if (file.size > MAX_BYTES) throw new Error('A imagem deve ter no máximo 5 MB antes da otimização.')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('O navegador não conseguiu decodificar esta imagem.') })
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height)); if (scale === 1 && file.size < 900_000) return { file, originalSize: file.size, finalSize: file.size, resized: false }
    const canvas = globalThis.document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const context = canvas.getContext('2d')
    if (!context) throw new Error('A otimização de imagens não está disponível neste navegador.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); const mimeType = file.type === 'image/png' ? 'image/png' : 'image/webp'
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Não foi possível otimizar a imagem.')), mimeType, .84))
    const chosen = blob.size < file.size ? blob : file; const extension = chosen.type === 'image/webp' ? 'webp' : file.name.split('.').at(-1) || 'png'; const name = `${file.name.replace(/\.[^.]+$/, '').slice(0, 160)}.${extension}`
    return { file: chosen === file ? file : new File([chosen], name, { type: chosen.type, lastModified: Date.now() }), originalSize: file.size, finalSize: chosen.size, resized: chosen !== file }
  } finally { bitmap.close() }
}

export const formatImageBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
