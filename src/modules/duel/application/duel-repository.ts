import type { NewMessage } from '@/platform/outbox/outbox'
import type { DuelEvent, DuelState } from '../domain/duel'

/** Port de persistance des duels, défini par la couche application. */
export interface DuelRepository {
  /** Charge l'état d'un duel, reconstruit à partir de ses événements, et sa version. */
  load(duelId: string): Promise<{ state: DuelState; version: number }>

  /**
   * Enregistre de nouveaux événements, et les messages de la saga qu'ils déclenchent,
   * dans une même transaction. Une ConcurrencyError est levée en cas de conflit de version.
   */
  save(
    duelId: string,
    expectedVersion: number,
    events: DuelEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
