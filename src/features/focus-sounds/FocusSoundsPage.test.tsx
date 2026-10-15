import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import FocusSoundsPage from './FocusSoundsPage'
import { focusPlaylistsRepository } from '../../services/db/focusPlaylistsRepository'
import { closeDatabase, DB_NAME } from '../../services/db/indexedDb'
import { focusSoundService } from '../../services/audio/focusSoundService'

beforeEach(async () => {
  closeDatabase(); focusSoundService.stop(); vi.restoreAllMocks()
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (request: URL) => {
    const source = new URL(String(request)).searchParams.get('url') ?? ''
    const active = source.includes('/artist/sets/one')
    return { ok: true, status: 200, json: async () => ({ title: active ? 'Ativa' : 'Catálogo', author_name: 'Artista', provider_name: 'SoundCloud', html: '<iframe src="https://w.soundcloud.com/player/"></iframe>' }) }
  }))
})

afterEach(() => { vi.unstubAllGlobals(); act(() => focusSoundService.stop()); closeDatabase() })

test('remover a playlist ativa também encerra sua reprodução', async () => {
  const playlist = await focusPlaylistsRepository.add('https://soundcloud.com/artist/sets/one', 'Lo-fi')
  focusSoundService.playSoundCloud({ ...playlist, id: 'catalog-0' })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<MemoryRouter><FocusSoundsPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Remover Ativa' }))
  await waitFor(async () => expect(await focusPlaylistsRepository.getAll()).toEqual([]))
  expect(focusSoundService.getSnapshot()).toMatchObject({ source: null, status: 'stopped' })
})
