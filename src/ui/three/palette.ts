/**
 * Couleurs des scènes 3D, tirées de la charte graphique du jeu, et couleurs des matériaux.
 * Les scènes n'emploient jamais une couleur en dur : changer d'ambiance ne demande de
 * modifier que ce fichier.
 */
export const PALETTE = {
  // Charte graphique.
  night: '#101b2a',
  deepNight: '#0a111b',
  steel: '#263849',
  gold: '#d4af37',
  legendary: '#ffd166',
  copper: '#8b5e3c',
  stone: '#526779',
  parchment: '#e8d5b5',
  emerald: '#2ecc71',
  sapphire: '#3498db',
  amethyst: '#9b59b6',
  ruby: '#e74c3c',
  amber: '#f39c12',

  // Matériaux du monde.
  grass: '#3e5a32',
  grassDark: '#2c4426',
  dirt: '#6b5236',
  cobble: '#6d6a62',
  wallStone: '#7b7f86',
  darkStone: '#3b4048',
  dungeonStone: '#2f343c',
  wood: '#6b4a2b',
  darkWood: '#3d2a1a',
  plaster: '#d9c9a8',
  roof: '#7a2e22',
  roofSlate: '#3a4553',
  metal: '#9aa3ad',
  leather: '#5b3b24',
  pine: '#24402a',
  leaf: '#3f6b33',
  water: '#2d5c7a',
  flame: '#ffb347',
  ember: '#ff7a1a',
  bone: '#e6dcc3',
  goblinSkin: '#6f9a3a',
  trollSkin: '#6b7d6a',
  sand: '#b59a6a',
} as const

/** Couleur associée à chaque ressource, dans le monde comme dans l'interface. */
export const RESOURCE_COLORS: Record<string, string> = {
  wood: PALETTE.wood,
  stone: PALETTE.wallStone,
  gold: PALETTE.gold,
}
