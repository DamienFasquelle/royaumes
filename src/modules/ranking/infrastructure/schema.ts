import { integer, pgSchema, primaryKey, text } from 'drizzle-orm/pg-core'

/** Schéma PostgreSQL du module Classement : son modèle de lecture, tenu par sa projection. */
export const ranking = pgSchema('ranking')

/** Totaux de chaque joueur. Le nom et le village sont connus par des événements distincts. */
export const players = ranking.table('players', {
  playerId: text('player_id').primaryKey(),
  name: text('name'),
  village: text('village'),
  gamesPlayed: integer('games_played').notNull().default(0),
  gamesWon: integer('games_won').notNull().default(0),
  gold: integer('gold').notNull().default(0),
  upgrades: integer('upgrades').notNull().default(0),
})

/** Joueurs des expéditions en cours, à qui le résultat sera attribué à leur fin. */
export const gamePlayers = ranking.table(
  'game_players',
  {
    gameId: text('game_id').notNull(),
    playerId: text('player_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.playerId] })],
)
