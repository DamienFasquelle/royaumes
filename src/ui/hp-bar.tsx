import type { CSSProperties } from 'react'

/**
 * Jauge de points de vie d'un combattant, partagée par le Donjon et le Duel.
 * La valeur est lue par les lecteurs d'écran ; la jauge elle-même n'est qu'une décoration.
 */
export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
  return (
    <span className="hp" title={`${hp}/${maxHp} PV`} data-low={hp > 0 && ratio <= 0.25}>
      <span style={{ '--value': `${ratio * 100}%` } as CSSProperties} />
      <span className="sr-only">
        {hp} points de vie sur {maxHp}
      </span>
    </span>
  )
}
