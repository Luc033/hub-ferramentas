import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import { closeDatabase, DB_NAME, FOCUS_PLAYLISTS_STORE, openDatabase } from './indexedDb'
import { focusPlaylistsRepository, normalizeSoundCloudPlaylistUrl } from './focusPlaylistsRepository'

beforeEach(async () => {
  closeDatabase(); vi.restoreAllMocks()
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
})

afterEach(() => vi.unstubAllGlobals())

test('aceita apenas URL HTTPS de playlist pública do SoundCloud', () => {
  expect(normalizeSoundCloudPlaylistUrl('https://soundcloud.com/artist/sets/focus?utm_source=x')).toBe('https://soundcloud.com/artist/sets/focus')
  expect(() => normalizeSoundCloudPlaylistUrl('https://example.com/artist/sets/focus')).toThrow('soundcloud.com')
  expect(() => normalizeSoundCloudPlaylistUrl('https://soundcloud.com/artist/track')).toThrow('playlist')
})

test('valida no oEmbed oficial antes de persistir no IndexedDB v5', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ title: 'Focus Beats', author_name: 'Artist', provider_name: 'SoundCloud', html: '<iframe src="https://w.soundcloud.com/player/"></iframe>' }) }))
  const playlist = await focusPlaylistsRepository.add('https://soundcloud.com/artist/sets/focus', 'Chillhop')
  expect(playlist).toMatchObject({ title: 'Focus Beats', category: 'Chillhop', author: 'Artist' })
  expect(await focusPlaylistsRepository.getAll()).toEqual([playlist])
  expect((await openDatabase()).objectStoreNames.contains(FOCUS_PLAYLISTS_STORE)).toBe(true)
})

test('recusa resposta sem incorporação oficial', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ title: 'Blocked', provider_name: 'SoundCloud', html: '' }) }))
  await expect(focusPlaylistsRepository.add('https://soundcloud.com/artist/sets/blocked', 'Lo-fi')).rejects.toThrow('incorporação oficial')
})

test('detecta URL duplicada normalizada antes de consultar o SoundCloud novamente', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ title: 'Focus Beats', author_name: 'Artist', provider_name: 'SoundCloud', html: '<iframe src="https://w.soundcloud.com/player/"></iframe>' }) })
  vi.stubGlobal('fetch', fetchMock)
  await focusPlaylistsRepository.add('https://www.soundcloud.com/artist/sets/focus?utm_source=share', 'Lo-fi')
  await expect(focusPlaylistsRepository.add('https://soundcloud.com/artist/sets/focus', 'Jazzhop')).rejects.toThrow('já está na biblioteca')
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(await focusPlaylistsRepository.getAll()).toHaveLength(1)
})

test('trata resposta inválida e autor vazio do oEmbed', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('invalid json') } })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ title: 'Focus', author_name: '   ', provider_name: 'SoundCloud', html: '<iframe src="https://w.soundcloud.com/player/"></iframe>' }) })
  vi.stubGlobal('fetch', fetchMock)
  await expect(focusPlaylistsRepository.add('https://soundcloud.com/artist/sets/invalid', 'Lo-fi')).rejects.toThrow('resposta inválida')
  const playlist = await focusPlaylistsRepository.add('https://soundcloud.com/artist/sets/fallback', 'Lo-fi')
  expect(playlist.author).toBe('SoundCloud')
})
