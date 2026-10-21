import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Même alias que dans tsconfig.json : « @/ » désigne le répertoire src/.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // Les tests s'exécutent dans Node.js, sans navigateur simulé.
    environment: 'node',
    // Seuls les fichiers de test placés dans src/ sont exécutés.
    include: ['src/**/*.test.ts'],
    // Les tests s'exécutent toujours dans un environnement de test, y compris lorsqu'ils
    // sont lancés par la construction Vercel, où NODE_ENV vaut « production ». Ils ne
    // dépendent ainsi d'aucune variable de l'environnement de production.
    env: { NODE_ENV: 'test' },
    // Chaque fichier de test de l'API démarre sa propre base PGlite : sur un poste chargé,
    // ce démarrage peut dépasser le délai par défaut de cinq secondes. Il a lieu dans le
    // premier beforeEach du fichier : le délai des hooks est donc allongé lui aussi.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
