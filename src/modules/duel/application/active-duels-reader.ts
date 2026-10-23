/** Port de lecture des duels actifs, défini par la couche application. */
export interface ActiveDuelsReader {
  /**
   * Identifiants des duels actifs auxquels participe l'un des joueurs, le plus récent en tête.
   * Le modèle de lecture peut compter un duel dont l'échéance est passée sans avoir été
   * enregistrée : le service relit chaque duel dans le journal avant de s'y fier.
   */
  activeDuelIds(playerIds: string[]): Promise<string[]>
}
