
export type Game = 'maimai' | 'CHUNITHM' | 'ONGEKI'

export type ChartDifficulty =
  | 'Basic'
  | 'Advanced'
  | 'Expert'
  | 'Master'
  | 'Re:Master'
  | 'Ultima'
  | 'Lunatic'

export interface SongChart {
  difficulty: ChartDifficulty
  level: string | null
  notes?: number
}

export interface Song {
  id: string
  title: string
  artist: string | null
  games: Partial<Record<Game, SongChart[]>>
  jacketUrl: string | null
  wikiUrl: string
}
