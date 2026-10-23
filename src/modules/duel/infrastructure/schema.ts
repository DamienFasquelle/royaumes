import { bigint, boolean, index, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'

/** Schéma PostgreSQL du module Duel. Ses événements restent dans le journal de la plateforme. */
export const duel = pgSchema('duel')

/**
 * Duels actifs, tenus à jour par la projection des duels actifs : un duel y entre à son
 * lancement, et en sort lorsqu'il atteint un état final (terminé ou annulé). La table sert
 * d'index pour retrouver les duels d'un joueur ; leur état fait foi dans le journal.
 */
export const activeDuels = duel.table(
  'active_duels',
  {
    duelId: text('duel_id').primaryKey(),
    challengerId: text('challenger_id').notNull(),
    challengerName: text('challenger_name').notNull(),
    opponentId: text('opponent_id').notNull(),
    /** Vide tant que l'adversaire n'a pas accepté le défi. */
    opponentName: text('opponent_name').notNull(),
    training: boolean('training').notNull(),
    /** Ressources mises en jeu par chaque duelliste, par exemple { wood: 50 }. */
    stake: jsonb('stake').notNull(),
    /** reserving, pending, accepting ou fighting : les seuls états qui ne sont pas finaux. */
    status: text('status').notNull(),
    issuedAt: bigint('issued_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('active_duels_challenger_idx').on(t.challengerId),
    index('active_duels_opponent_idx').on(t.opponentId),
  ],
)
