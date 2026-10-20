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
    // Le premier test (ou hook) d'un fichier démarre PGlite et applique les migrations,
    // ce qui peut dépasser 10 secondes lorsque tous les fichiers s'exécutent en parallèle.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
