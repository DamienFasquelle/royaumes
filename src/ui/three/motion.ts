'use client'
import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Préférence « réduire les animations » du système. Les scènes 3D la lisent pour limiter
 * l'amplitude des mouvements décoratifs (bannières, braises, balancements), sans jamais
 * masquer une information de jeu : les animations de combat restent, mais plus brèves.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Préférence transmise aux composants de la scène, à l'intérieur du canevas. */
export const ReducedMotionContext = createContext(false)

/** Facteur d'amplitude des animations décoratives : 1 normalement, 0,15 si réduites. */
export function useMotionScale(): number {
  return useContext(ReducedMotionContext) ? 0.15 : 1
}

/**
 * Recul de la caméra selon la forme de l'écran : 1 sur un écran large, davantage sur un
 * écran étroit, pour que les personnages placés côte à côte restent dans le cadre.
 */
export function framingFactor(width: number, height: number): number {
  const aspect = width / Math.max(1, height)
  return Math.min(2.4, Math.max(1, 1.5 / aspect))
}
