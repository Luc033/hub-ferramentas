export type PlaylistCategory = 'Lo-fi' | 'Chillhop' | 'Jazzhop' | 'Outro'

export interface FocusPlaylist {
  id: string
  url: string
  title: string
  category: PlaylistCategory
  author: string
  createdAt: number
}

export interface SoundCloudOEmbed {
  title: string
  author_name?: string
  provider_name: string
  html: string
}
