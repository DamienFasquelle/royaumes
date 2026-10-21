/**
 * Entrée publique « partagée » du module Classement : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types et des constantes.
 */

/** Nombre de joueurs présentés par le classement. */
export const RANKING_SIZE = 20

/** Ligne du classement : les totaux d'un joueur, et son rang. */
export interface RankingEntry {
  /** Rang, à partir de 1. */
  rank: number
  playerId: string
  /** Nom affiché du joueur. */
  label: string
  /** Expéditions terminées, gagnées ou perdues. */
  gamesPlayed: number
  gamesWon: number
  /** Or rapporté des expéditions gagnées. */
  gold: number
  /** Améliorations de bâtiments du village. */
  upgrades: number
}
