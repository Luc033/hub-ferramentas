import type { MindMapLink } from './types'

export type NewMindMapLink = Omit<MindMapLink, 'id'>

export function normalizeMindMapLink(rawUrl: string, rawLabel: string): NewMindMapLink {
  const value = rawUrl.trim()
  if (!value) throw new Error('Informe o endereço do link.')

  let url: URL
  try { url = new URL(value) } catch { throw new Error('Informe uma URL completa, incluindo http:// ou https://.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use somente endereços http ou https.')
  if (url.username || url.password) throw new Error('O endereço não pode conter usuário ou senha.')

  const label = rawLabel.trim() || url.hostname
  if (label.length > 80) throw new Error('Use no máximo 80 caracteres no nome do link.')
  return { label, url: url.toString() }
}
