/**
 * Écran de chargement d'un lieu, affiché pendant le téléchargement de sa scène 3D.
 * Il occupe la place de la scène : les panneaux de jeu restent utilisables pendant ce temps.
 */
export function SceneLoading({ text = 'Le brouillard se lève...' }: { text?: string }) {
  return (
    <div className="scene-loading" role="status">
      {text}
    </div>
  )
}
