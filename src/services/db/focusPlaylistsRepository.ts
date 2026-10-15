import type { FocusPlaylist, PlaylistCategory, SoundCloudOEmbed } from '../../features/focus-sounds/types'
import { FOCUS_PLAYLISTS_STORE, openDatabase, requestResult, transactionDone, upgradeToAudioSchema } from './indexedDb'

const EVENT = 'focus-playlists:changed'
const emit = () => window.dispatchEvent(new Event(EVENT))

export const FOCUS_CATALOG_CANDIDATES: ReadonlyArray<{ url: string; category: PlaylistCategory }> = [
  { url: 'https://soundcloud.com/lofi_girl/sets/lofi-hip-hop-music-beats-to-relax-study-to', category: 'Lo-fi' },
  { url: 'https://soundcloud.com/chillhopdotcom/sets/chillhop-essentials-spring-2024', category: 'Chillhop' },
  { url: 'https://soundcloud.com/thejazzhopcafe/sets/jazzhop', category: 'Jazzhop' },
]

export function normalizeSoundCloudPlaylistUrl(input: string) {
  let url: URL
  try { url = new URL(input.trim()) } catch { throw new Error('Informe uma URL pública válida do SoundCloud.') }
  if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname.toLowerCase())) throw new Error('Use uma URL HTTPS do domínio soundcloud.com.')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 3 || parts[1] !== 'sets') throw new Error('A URL deve apontar para uma playlist pública do SoundCloud (/sets/).')
  url.hostname = 'soundcloud.com'; url.search = ''; url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export async function validateSoundCloudPlaylist(input: string): Promise<Pick<FocusPlaylist, 'url' | 'title' | 'author'>> {
  const url = normalizeSoundCloudPlaylistUrl(input)
  let response: Response
  try {
    const endpoint = new URL('https://soundcloud.com/oembed')
    endpoint.searchParams.set('format', 'json'); endpoint.searchParams.set('url', url); endpoint.searchParams.set('maxheight', '166')
    response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
  } catch { throw new Error('Não foi possível acessar o SoundCloud. Verifique sua conexão e tente novamente.') }
  if (!response.ok) throw new Error(response.status === 404 ? 'A playlist não foi encontrada ou foi removida.' : 'O SoundCloud não permitiu validar esta playlist agora.')
  let data: Partial<SoundCloudOEmbed>
  try { data = await response.json() as Partial<SoundCloudOEmbed> }
  catch { throw new Error('O SoundCloud retornou uma resposta inválida. Tente novamente mais tarde.') }
  if (data.provider_name !== 'SoundCloud' || typeof data.title !== 'string' || !data.title.trim() || typeof data.html !== 'string' || !data.html.includes('w.soundcloud.com/player/')) throw new Error('Esta URL não oferece uma incorporação oficial disponível.')
  const author = typeof data.author_name === 'string' ? data.author_name.trim().slice(0, 120) : ''
  return { url, title: data.title.trim().slice(0, 180), author: author || 'SoundCloud' }
}

export async function loadFocusPlaylistCatalog(): Promise<FocusPlaylist[]> {
  const results = await Promise.allSettled(FOCUS_CATALOG_CANDIDATES.map(async (candidate, index) => ({
    id: `catalog-${index}`,
    ...await validateSoundCloudPlaylist(candidate.url),
    category: candidate.category,
    createdAt: 0,
  } satisfies FocusPlaylist)))
  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
}

export const focusPlaylistsRepository = {
  async initialize() { await upgradeToAudioSchema() },
  subscribe(listener: () => void) { window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener) },
  async getAll(): Promise<FocusPlaylist[]> {
    const db = await openDatabase(); if (!db.objectStoreNames.contains(FOCUS_PLAYLISTS_STORE)) return []
    const tx = db.transaction(FOCUS_PLAYLISTS_STORE, 'readonly'); const records = await requestResult(tx.objectStore(FOCUS_PLAYLISTS_STORE).getAll()) as FocusPlaylist[]; await transactionDone(tx)
    return records.sort((a, b) => b.createdAt - a.createdAt)
  },
  async add(input: string, category: PlaylistCategory) {
    await this.initialize()
    const normalizedUrl = normalizeSoundCloudPlaylistUrl(input)
    const db = await openDatabase()
    const lookup = db.transaction(FOCUS_PLAYLISTS_STORE, 'readonly')
    const duplicate = await requestResult(lookup.objectStore(FOCUS_PLAYLISTS_STORE).index('url').get(normalizedUrl))
    await transactionDone(lookup)
    if (duplicate) throw new Error('Esta playlist já está na biblioteca.')
    const validated = await validateSoundCloudPlaylist(normalizedUrl)
    const playlist: FocusPlaylist = { id: crypto.randomUUID(), ...validated, category, createdAt: Date.now() }
    const tx = db.transaction(FOCUS_PLAYLISTS_STORE, 'readwrite')
    try { tx.objectStore(FOCUS_PLAYLISTS_STORE).add(playlist); await transactionDone(tx) } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'ConstraintError') throw new Error('Esta playlist já está na biblioteca.')
      throw reason
    }
    emit(); return playlist
  },
  async remove(id: string) { const db = await openDatabase(); const tx = db.transaction(FOCUS_PLAYLISTS_STORE, 'readwrite'); tx.objectStore(FOCUS_PLAYLISTS_STORE).delete(id); await transactionDone(tx); emit() },
}
