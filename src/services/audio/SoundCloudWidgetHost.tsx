import { useEffect, useMemo, useRef } from 'react'
import { focusSoundService, type SoundCloudController } from './focusSoundService'

interface Widget extends SoundCloudController { bind(event: string, listener: () => void): void; unbind(event?: string): void }
interface SoundCloudApi { Widget: ((iframe: HTMLIFrameElement) => Widget) & { Events: Record<'READY' | 'PLAY' | 'PAUSE' | 'FINISH', string> & { ERROR?: string } } }
declare global { interface Window { SC?: SoundCloudApi } }

let apiPromise: Promise<SoundCloudApi> | null = null
function loadApi(): Promise<SoundCloudApi> {
  if (window.SC) return Promise.resolve(window.SC)
  if (apiPromise) return apiPromise
  const promise = new Promise<SoundCloudApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-soundcloud-widget]')
    const script = existing ?? document.createElement('script')
    const loaded = () => window.SC ? resolve(window.SC) : reject(new Error('A API do SoundCloud não foi disponibilizada.'))
    script.addEventListener('load', loaded, { once: true }); script.addEventListener('error', () => reject(new Error('Falha ao carregar a API oficial do SoundCloud.')), { once: true })
    if (!existing) { script.src = 'https://w.soundcloud.com/player/api.js'; script.async = true; script.dataset.soundcloudWidget = 'true'; document.head.appendChild(script) }
  }).catch((reason) => { apiPromise = null; throw reason })
  apiPromise = promise
  return promise
}

export function SoundCloudWidgetHost({ url, attempt }: { url: string; attempt: number }) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const src = useMemo(() => { const params = new URLSearchParams({ url, color: '#6366f1', auto_play: 'true', hide_related: 'false', show_comments: 'false', show_user: 'true', show_reposts: 'false', show_teaser: 'true', visual: 'false' }); return `https://w.soundcloud.com/player/?${params}` }, [url])
  useEffect(() => {
    let widget: Widget | null = null; let cancelled = false
    const timeout = window.setTimeout(() => { if (!cancelled) focusSoundService.soundCloudError() }, 20_000)
    void loadApi().then((api) => {
      if (cancelled || !iframe.current) return
      const created = api.Widget(iframe.current); widget = created; const events = api.Widget.Events
      created.bind(events.READY, () => { window.clearTimeout(timeout); focusSoundService.attachSoundCloud(created, url, attempt) })
      created.bind(events.PLAY, () => focusSoundService.soundCloudPlaying(created)); created.bind(events.PAUSE, () => focusSoundService.soundCloudPaused(created))
      created.bind(events.FINISH, () => focusSoundService.soundCloudFinished(created)); if (events.ERROR) created.bind(events.ERROR, () => focusSoundService.soundCloudError(created))
    }).catch(() => { if (!cancelled) focusSoundService.soundCloudError() })
    return () => { cancelled = true; window.clearTimeout(timeout); if (widget) { focusSoundService.detachSoundCloud(widget); widget.unbind() } }
  }, [attempt, src, url])
  return <iframe ref={iframe} title="Player oficial do SoundCloud" width="100%" height="166" scrolling="no" frameBorder="0" allow="autoplay" src={src} />
}
