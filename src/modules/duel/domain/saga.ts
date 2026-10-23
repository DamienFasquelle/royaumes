/**
 * Étapes de la saga des mises : pour chaque événement d'un duel, les mouvements de ressources
 * à demander au Village. Le domaine décide de ces demandes ; le service les traduit en
 * messages de la boîte d'envoi. Un duel d'entraînement n'en produit aucune (règle 17).
 */
import { multiplyStake, type Stake } from './content'
import { type DuelEvent, type DuelState, transferIdOf } from './duel'

/** Quantités d'un mouvement de ressources : une mise, ou les deux mises réunies. */
export type Amounts = Stake

/** Demande produite par une étape de la saga. */
export type SagaRequest =
  /** Prélever une mise : le Village répond, et la réponse fait progresser la saga. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Verser des ressources : le versement ne peut pas échouer, aucune réponse n'est attendue. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }

/**
 * Demandes déclenchées par un événement. L'état reçu est celui qui suit l'application
 * de l'événement : il contient les duellistes, la mise et l'issue du duel.
 */
export function requestsFor(state: DuelState, event: DuelEvent): SagaRequest[] {
  if (state.training) return []
  const id = (step: string) => transferIdOf(state.duelId, step)
  const refundChallenger: SagaRequest = {
    kind: 'deposit',
    transferId: id('refund-challenger'),
    playerId: state.challenger.id,
    resources: state.stake,
  }

  switch (event.type) {
    // 1. Lancement du défi : prélèvement de la mise du joueur qui le lance (étape compensable).
    case 'ChallengeIssued':
      return [
        {
          kind: 'withdraw',
          transferId: id('stake-challenger'),
          playerId: state.challenger.id,
          resources: state.stake,
        },
      ]

    // 2. Acceptation : prélèvement de la mise de l'adversaire (étape pivot).
    case 'ChallengeAccepted':
      return [
        {
          kind: 'withdraw',
          transferId: id('stake-opponent'),
          playerId: state.opponent.id,
          resources: state.stake,
        },
      ]

    // Annulation : la mise du joueur qui a lancé le défi lui est rendue (règles 7 et 8),
    // sauf si elle n'a jamais été prélevée (règle 6).
    case 'ChallengeCancelled':
      return event.data.reason === 'unfunded' ? [] : [refundChallenger]

    // 3. Fin du duel : le vainqueur reçoit les deux mises, ou chacun récupère la sienne (règle 16).
    case 'DuelEnded':
      if (event.data.outcome === 'won' && event.data.winnerId) {
        return [
          {
            kind: 'deposit',
            transferId: id('payout'),
            playerId: event.data.winnerId,
            resources: multiplyStake(state.stake, 2),
          },
        ]
      }
      return [
        refundChallenger,
        {
          kind: 'deposit',
          transferId: id('refund-opponent'),
          playerId: state.opponent.id,
          resources: state.stake,
        },
      ]

    case 'TrainingStarted':
    case 'ChallengerStakeReserved':
    case 'DuelStarted':
    case 'MoveChosen':
    case 'RoundResolved':
      return []
  }
}
