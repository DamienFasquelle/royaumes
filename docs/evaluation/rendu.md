# Rendu de l'évaluation

- Auteur : Damien Fasquelle
- Module : `duel`
- Dépôt : https://github.com/DamienFasquelle/royaumes
- Adresse du déploiement : https://royaumes-six.vercel.app
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/duel/` : `domain/` (domaine pur), `application/` (service et ports), `infrastructure/` (journal, schéma, projection), `api.ts`, `messages.ts`, `personal-data.ts`, et les entrées publiques `index.ts`, `contracts.ts`, `ui.tsx` | `pnpm lint:archi` (règles `module-encapsulation`, `pure-domain`, `application-ignores-infrastructure`, `client-without-server-code`) |
| E2 | `src/bootstrap/create-api.ts` (module, gestionnaires, canal, données personnelles, route `/duel`) ; `src/ui/app-shell.tsx` (entrée « Duel » de la navigation) ; `app/(jeu)/duel/page.tsx`, `app/(jeu)/duel/[id]/page.tsx` | `src/bootstrap/duel-api.test.ts` (toutes les routes, à travers l'application assemblée) ; `pnpm build` |
| E3 | `src/modules/duel/domain/` : `content.ts`, `duel.ts`, `rules.ts`, `saga.ts`, `master.ts`, `view.ts` | `domain/rules.test.ts`, `domain/master.test.ts`, `domain/view.test.ts` (détail par règle ci-dessous) |
| E4 | Journal d'événements, modèle decider : `domain/duel.ts`, `domain/rules.ts`, `infrastructure/event-store-duel-repository.ts`. Modèle de lecture dans le schéma `duel` : `infrastructure/schema.ts`, migration `drizzle/0013_duel.sql`. ADR 0010 | `infrastructure/active-duels-projection.test.ts` ; fonction d'aptitude « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » (`architecture.test.ts`) |
| E5 | `api.ts` (le joueur est toujours `c.var.userId`) ; `contracts.ts` (`ChallengeInput`, `ChooseMoveInput`) ; `create-api.ts` (`requireUser('/duel/*')`) ; contrôle d'accès dans le domaine et la vue | `duel-api.test.ts` : « refuse une requête anonyme (401) », « valide le corps des requêtes (400) », « réserve la vue et les commandes d'un duel à ses duellistes » ; revue de sécurité U1 à U6 |
| E6 | Messages de la boîte d'envoi vers le Village : `domain/saga.ts`, `application/duel-service.ts` (`toMessage`), `messages.ts` (réponses `duel.stake-result`). Seul import du Village : `@/modules/realm/contracts`. ADR 0011 | `rules.test.ts` (règles 6, 7, 8, 16 ; « ignore une réponse du Village en double ») ; `duel-api.test.ts` (« joue un duel complet... », « rend sa mise ... si l'adversaire n'a pas les ressources », « joue un duel complet avec le Village extrait ») |
| E7 | `src/modules/duel/personal-data.ts` (export, réécriture des événements, effacement de `duel.active_duels`), déclaré dans `create-api.ts` | `duel-api.test.ts` : « exporte les duels du joueur, sans le nom ni les passes de son adversaire », « remplace le nom du joueur effacé dans les événements des duels » ; fonction d'aptitude « déclare les données personnelles de chaque module » |
| E8 | Correspondance des règles et des routes avec les tests : tableaux ci-dessous | 65 tests propres au module (domaine, projection, API, temps réel), plus la fonction d'aptitude du Duel |
| E9 | `.dependency-cruiser.cjs` et `architecture.test.ts` non assouplis ; une fonction d'aptitude ajoutée | `pnpm verify` : 0 violation, 3 fonctions d'aptitude réussies |
| E10 | Migration `drizzle/0013_duel.sql`, appliquée par `pnpm vercel-build` | Vérifié le 2026-10-23 sur https://royaumes-six.vercel.app : `/api/duel/duels` renvoie 401 sans session et 200 avec une session ; un duel inconnu renvoie 404 ; un compte de test a été supprimé par `DELETE /api/account`. Le parcours complet à deux joueurs reste à jouer dans le navigateur |

### Règles métier de la fiche et tests du domaine

| Règle | Test (`src/modules/duel/domain/`) |
| --- | --- |
| 1 | `rules.test.ts` : « règle 1 : refuse une mise vide, hors des bornes, ou d'une ressource inconnue » ; « règle 1 : accepte du bois, de la pierre ou de l'or, seuls ou combinés » |
| 2 | `rules.test.ts` : « règle 2 : refuse un défi lancé à soi-même, ou au maître d'armes » |
| 3 | `rules.test.ts` : « règle 3 : refuse un duel à un joueur qui en a déjà un actif » ; API : « refuse un défi à un joueur qui a déjà un duel actif (409) » |
| 4 | `rules.test.ts` : « règle 4 : seul l'adversaire répond au défi, seul son lanceur l'annule » |
| 5 | `rules.test.ts` : « règle 5 : un défi sans réponse expire 10 minutes après son lancement » |
| 6 | `rules.test.ts` : « règle 6 : prélève la mise du joueur qui lance le défi, et annule le défi en cas de refus » |
| 7 | `rules.test.ts` : « règle 7 : prélève la mise de l'adversaire, et rend la première mise si elle est refusée » |
| 8 | `rules.test.ts` : « règle 8 : un défi refusé, annulé ou expiré rend sa mise au joueur qui l'a lancé » |
| 9 | `rules.test.ts` : « règle 9 : chaque duelliste commence avec 30 points de vie, qui ne dépassent jamais 30 » |
| 10 | `rules.test.ts` : « règle 10 : une passe par duelliste, pour la manche en cours seulement » |
| 11 | `view.test.ts` : « règle 11 : la passe de l'adversaire reste cachée tant que la manche n'est pas résolue » |
| 12 | `rules.test.ts` : dix tests « règle 12 : X contre Y donne ... », « se soigner ne fait jamais perdre de points de vie à l'adversaire », « enregistre les effets de la manche » |
| 13 | `rules.test.ts` : « règle 13 : un duelliste se soigne au plus 3 fois par duel » |
| 14 | `rules.test.ts` : trois tests « règle 14 » (passe par défaut, abandon, échéances multiples) |
| 15 | `rules.test.ts` : trois tests « règle 15 » (mise à terre, nul, fin des 12 manches) |
| 16 | `rules.test.ts` : « règle 16 : le vainqueur reçoit les deux mises ; en cas de nul, chacun récupère la sienne » |
| 17 | `rules.test.ts` : trois tests « règle 17 » ; `master.test.ts` (stratégie du maître d'armes) |

### Routes et tests de l'API (`src/bootstrap/duel-api.test.ts`)

| Route | Test |
| --- | --- |
| `GET /api/duel/duels` | « présente au joueur ses duels actifs, lancés ou reçus » |
| `POST /api/duel/duels` | « lance un défi (201) et prélève la mise du joueur qui le lance » |
| `POST /api/duel/training` | « commence un entraînement (201) contre le maître d'armes, sans mouvement de ressources » |
| `GET /api/duel/duels/:id` | « réserve la vue et les commandes d'un duel à ses duellistes » |
| `POST /api/duel/duels/:id/accept` | « joue un duel complet, et verse les deux mises au vainqueur » |
| `POST /api/duel/duels/:id/decline` | « rend la mise d'un défi refusé, annulé ou expiré » |
| `POST /api/duel/duels/:id/cancel` | « rend la mise d'un défi refusé, annulé ou expiré » |
| `POST /api/duel/duels/:id/move` | « refuse une seconde passe pour la même manche (409) » |
| `POST /api/duel/duels/:id/deadline` | « résout la manche échue par la commande d'échéance » |
| `GET /api/stream/duel-<id>` | `duel-realtime.test.ts` : « réserve le canal d'un duel à ses duellistes (403) » |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B5 | Saga avec étape compensable entre le Duel et le Village : la mise du joueur qui lance le défi est rendue si celle de l'adversaire est refusée | `domain/saga.ts`, `domain/rules.ts` (`recordTransferResult`), `application/duel-service.ts`, `messages.ts` | `rules.test.ts` règle 7 ; `duel-api.test.ts` « rend sa mise au joueur qui a lancé le défi, si l'adversaire n'a pas les ressources » | ADR 0011 ; diagramme de séquence de `docs/architecture.md` |
| B2 | Échéances gérées sans tâche de fond : expiration des défis, manches de vingt secondes, abandon | `domain/rules.ts` (`settle`), `domain/view.ts`, `application/duel-service.ts` | `rules.test.ts` règles 5 et 14 ; `view.test.ts` « présente les échéances passées, sans rien enregistrer » ; `duel-api.test.ts` « résout la manche échue... », « rend la mise d'un défi ... expiré » | ADR 0012 ; README (Limites actuelles) |
| B1 | Canal temps réel propre au module, avec sa règle d'accès et sans fuite des passes | `index.ts` (`channelPolicy`, `redact`), `ui.tsx` (`useChannel`) | `duel-realtime.test.ts` (deux tests) | ADR 0012 ; README (Temps réel) |
| B3 | Personnage piloté par l'ordinateur, selon une IA déterministe et testée : le maître d'armes | `domain/master.ts`, `domain/rules.ts` (`moveOf`) | `master.test.ts` (trois tests) ; `rules.test.ts` règle 17 | ADR 0012 ; fiche de cadrage, règle 17 |
| B4 | Modèle de lecture tenu par une projection, avec son point de reprise et sa version : les duels actifs | `infrastructure/active-duels-projection.ts` (version 1), `infrastructure/drizzle-active-duels-reader.ts`, `infrastructure/schema.ts` | `active-duels-projection.test.ts` (trois tests) ; règle 3 de l'API | ADR 0010 ; `docs/architecture.md` |
| B8 | Nouvelle fonction d'aptitude : les ressources misables dans un duel sont exactement celles du Village | `src/bootstrap/architecture.test.ts`, `domain/content.ts` (`STAKE_RESOURCES`) | « ne met en jeu dans un duel que des ressources que le Village sait prélever » | ADR 0012 ; `docs/architecture.md` |

Le total des bonus revendiqués dépasse le plafond de cinq points.

## Écarts avec la fiche de cadrage

- **Mise** : la fiche prévoyait d'abord une mise en or seulement. Elle a été étendue au bois et à
  la pierre, seuls ou combinés, pour que les joueurs puissent se battre dès la fondation de leur
  village, qui ne produit pas d'or. La fiche a été mise à jour (règle 1).
- **Tableau de résolution** : « contrer contre se soigner » ne fait plus perdre de points de vie à
  celui qui contre, pour qu'un soin ne fasse jamais perdre de points de vie à l'adversaire. La
  fiche a été mise à jour (règle 12).
- **Abandon simultané** : la fiche ne précisait pas le cas où les deux duellistes abandonnent à la
  même manche ; le duel est alors nul. La fiche a été complétée (règle 14).
- **Bonus B4** : la fiche visait une projection de palmarès. Le bonus est réalisé par la projection
  des duels actifs, qui sert la règle 3 ; aucun palmarès n'est présenté.
- **Bonus B8** : non prévu par la fiche, réalisé en complément.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232 (33 fichiers) | 298 (39 fichiers) |
| Couverture des lignes | 75,04 % (1 176 / 1 567) | 75,34 % (1 534 / 2 036) |
| Violations des règles d'architecture | 0 | 0 |

Mesures : `pnpm test:coverage` et `pnpm lint:archi`, sur le dépôt courant et sur l'étiquette
`td11-fin` extraite dans un répertoire de travail séparé.

## Usage de l'IA générative

J'ai utilisé l'IA générative.

**Nature de la contribution, partie par partie :**

| Partie du travail | Contribution de l'IA | Ma contribution |
| --- | --- | --- |
| Propositions d'idées de modules ; première rédaction de la fiche | Choix du Duel ; règles du jeu (quatre passes, 30 points de vie) ; modifications de la fiche ; validation |
| Code du module Duel | Domaine, service, infrastructure, migration, API, interface, branchement dans la racine de composition | Exigence de suivre la structure du Donjon ; mise en bois, pierre ou or ; effets de manche à afficher ; soin sans dégât pour l'adversaire |
| Interface du jeu | Refonte graphique de tous les modules | Charte graphique fournie (couleurs, polices, règles d'usage) ; rejet d'une première version |
| Tests | Tests du domaine, de la projection, de l'API, du temps réel, et fonction d'aptitude | Essais du module en local, signalement des défauts |
| ADR | Rédaction des ADR 0002 à 0009, qui étaient vides, d'après le code et les éléments exigés par chaque TD ; rédaction des ADR 0010 à 0012 | Fourniture des supports des TD ; consigne de ne modifier que les ADR vides |
| Revues et registres | Revue de sécurité du Duel ; conduite des revues de l'authentification, du Donjon, du Marché et de conformité au RGPD ; registre de la dette, registre des traitements | Adresse du déploiement fournie pour les vérifications en production |
| Architecture, README, bilan, rendu | Rédaction et mise à jour | Demandes de complément (revues antérieures, adresse du déploiement) |

**Manière dont les résultats ont été vérifiés :**

- `pnpm verify` (Biome, TypeScript, dependency-cruiser, Vitest) et `pnpm build` exécutés après
  chaque étape ; aucun test existant n'a été supprimé, désactivé ou affaibli ;
- chaque règle de la fiche et chaque route sont vérifiées par un test nommé (tableaux ci-dessus),
  et chaque test cité dans les documents a été retrouvé sous ce nom dans les résultats de Vitest ;
- le module a été joué en local ; un défaut d'affichage constaté pendant ces essais a été
  diagnostiqué (serveur de développement exécutant un code antérieur) ;
- les diagrammes Mermaid ont été analysés par la bibliothèque Mermaid 11, et l'interface contrôlée
  par une capture d'écran ;
- les indicateurs ont été mesurés par commande (`pnpm test:coverage`, `pnpm lint:archi`), et non
  estimés ;
- les ADR rédigés après coup ont été confrontés au code qu'ils décrivent, et aux éléments exigés
  par les supports des TD ;
- les revues ont été menées par les tests, la lecture du code et les manipulations prévues par les
  TD, sur le serveur de développement et en production (compte de test supprimé aussitôt).

Je reste responsable de l'ensemble du contenu du dépôt, quelle qu'en soit l'origine.
