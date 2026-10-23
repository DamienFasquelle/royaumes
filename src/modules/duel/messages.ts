import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { DuelService } from './application/duel-service'
import { DUEL_TOPICS } from './contracts'
import { duelIdOf } from './domain/duel'

/** Réponse du Village à un prélèvement de mise (son type TransferResult, vérifié ici). */
const StakeResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused']),
})

/**
 * Gestionnaires des messages adressés au Duel : les réponses du Village aux prélèvements des
 * mises, qui font progresser la saga. Comme ceux du Marché, ils ne font que traduire un message
 * en appel au service. Ils sont idempotents : une réponse en double est ignorée par le domaine.
 */
export function createDuelHandlers(service: DuelService): Record<string, MessageHandler> {
  return {
    [DUEL_TOPICS.stakeResult]: async (message) => {
      const { transferId, outcome } = StakeResultMessage.parse(message.payload)
      // L'identifiant du mouvement a été construit par le Duel : il désigne le duel concerné.
      await service.step(duelIdOf(transferId), {
        type: 'RecordTransferResult',
        transferId,
        outcome,
      })
    },
  }
}
