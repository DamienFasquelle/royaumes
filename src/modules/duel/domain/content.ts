/**
 * Contenu du Duel : les passes d'armes, leur tableau de résolution, et les constantes du jeu.
 * Les numéros renvoient aux règles métier de la fiche de cadrage.
 */

/** Passes d'armes : attaquer, se défendre, contrer, se soigner. */
export const MOVES = ['attack', 'defend', 'counter', 'heal'] as const
export type Move = (typeof MOVES)[number]

/**
 * Ressources que l'on peut mettre en jeu (règle 1) : celles du Village, dont le Duel ne connaît
 * que les noms. Une fonction d'aptitude vérifie qu'elles restent identiques à celles du Village.
 */
export const STAKE_RESOURCES = ['wood', 'stone', 'gold'] as const
export type StakeResource = (typeof STAKE_RESOURCES)[number]

/** Quantités mises en jeu, par ressource : au moins une, chacune entre les bornes (règle 1). */
export type Stake = Partial<Record<StakeResource, number>>

/** Bornes de la quantité de chaque ressource mise en jeu (règle 1). */
export const STAKE_MIN = 10
export const STAKE_MAX = 500

/** Vrai si la mise comporte au moins une ressource connue, chacune en quantité entière bornée. */
export function isValidStake(stake: Record<string, unknown>): stake is Stake {
  const entries = Object.entries(stake)
  return (
    entries.length > 0 &&
    entries.every(
      ([resource, amount]) =>
        (STAKE_RESOURCES as readonly string[]).includes(resource) &&
        Number.isInteger(amount) &&
        (amount as number) >= STAKE_MIN &&
        (amount as number) <= STAKE_MAX,
    )
  )
}

/** Mise multipliée par un facteur : les deux mises réunies valent la mise doublée. */
export const multiplyStake = (stake: Stake, factor: number): Stake =>
  Object.fromEntries(Object.entries(stake).map(([r, amount]) => [r, (amount ?? 0) * factor]))

/** Délai de réponse à un défi, en millisecondes (règle 5). */
export const CHALLENGE_TTL_MS = 10 * 60_000

/** Points de vie de départ, qui sont aussi le maximum (règle 9). */
export const MAX_HP = 30

/** Nombre maximal de manches d'un duel (règle 9). */
export const MAX_ROUNDS = 12

/** Nombre maximal de soins par duelliste et par duel (règle 13). */
export const MAX_HEALS = 3

/** Durée d'une manche, en millisecondes (règle 14). */
export const ROUND_MS = 20_000

/** Passe retenue pour un duelliste qui n'a pas choisi à l'échéance (règle 14). */
export const DEFAULT_MOVE: Move = 'defend'

/** Nombre de manches manquées d'affilée qui fait perdre le duel par abandon (règle 14). */
export const FORFEIT_AFTER_MISSED = 2

/** Identifiant et nom du maître d'armes, l'adversaire des duels d'entraînement (règle 17). */
export const MASTER_ID = 'master-at-arms'
export const MASTER_NAME = "Maître d'armes"

/**
 * Valeurs du tableau de résolution (règle 12). Chaque passe a ses propres effets, qui dépendent
 * de la passe de l'adversaire : rules.ts en déduit les effets de la manche.
 */
/** Dégâts d'une attaque qui porte : sur une attaque, ou sur un soin, qu'elle interrompt. */
export const ATTACK_DAMAGE = 6
/** Dégâts d'une attaque sur un adversaire qui se défend. */
export const GUARDED_DAMAGE = 2
/** Dégâts que le contre renvoie à l'attaquant ; l'attaque contrée ne porte pas. */
export const RIPOSTE_DAMAGE = 8
/** Points de vie perdus par celui qui contre une garde (défense ou contre) : il se déséquilibre. */
export const STAGGER_DAMAGE = 2
/** Points de vie rendus par un soin que l'adversaire n'interrompt pas. */
export const HEAL_AMOUNT = 5
