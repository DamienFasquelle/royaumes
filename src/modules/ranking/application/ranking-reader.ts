import type { RankingEntry } from '../contracts'

/** Port de lecture du classement, implémenté par l'infrastructure. */
export interface RankingReader {
  /** Les meilleurs joueurs, au plus limit, du premier au dernier. */
  top(limit: number): Promise<RankingEntry[]>
}
