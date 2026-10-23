# ADR-0010 - Le module Duel : journal d'événements, et projection des duels actifs

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le module Duel (`src/modules/duel`, fiche de cadrage `docs/evaluation/fiche-cadrage.md`)
permet à un joueur d'en défier un autre, en mettant en jeu des ressources de son village. Le
duel se joue en manches simultanées : chaque duelliste choisit en secret une passe (attaquer,
se défendre, contrer, se soigner), puis les passes sont révélées et résolues. Un joueur peut
aussi s'entraîner contre le maître d'armes, piloté par l'ordinateur.

Les données du module présentent les caractéristiques suivantes :

- un duel est une **suite d'actions ordonnées dans le temps** : défi, prélèvement des mises,
  acceptation, passes, manches résolues, issue ;
- son **historique a une valeur de jeu** : le journal du combat, présenté aux duellistes, en
  est la lecture directe, et un palmarès pourrait en être tiré ;
- les deux duellistes peuvent **choisir leur passe au même instant**, et la réponse du Village
  à un prélèvement peut arriver en même temps qu'une commande d'un joueur : trois écrivains
  concurrents sur un même duel ;
- la règle 3 (un seul duel actif par joueur) demande de retrouver rapidement **les duels actifs
  d'un joueur**, ce qui porte sur plusieurs duels à la fois ;
- les données personnelles se limitent au nom des duellistes et à leur historique, sans
  contrainte de durée de conservation comparable à celle de la Taverne.

## Décision

**Le Duel enregistre ses données dans le journal d'événements, selon le modèle decider.**

- Chaque duel a son flux, `duel-<identifiant>`, qui est aussi le nom de son canal temps réel.
- Neuf événements décrivent sa vie : `ChallengeIssued`, `TrainingStarted`,
  `ChallengerStakeReserved`, `ChallengeAccepted`, `DuelStarted`, `ChallengeCancelled`,
  `MoveChosen`, `RoundResolved` (passes, effets et points de vie) et `DuelEnded`.
- Le domaine (`domain/duel.ts`, `domain/rules.ts`) est pur : `decide(état, commande,
  maintenant)` applique les règles de la fiche, `evolve(état, événement)` reconstruit l'état.
  Les effets d'une manche (dégâts, riposte, soin) sont calculés par `decide` et enregistrés
  dans `RoundResolved` ; `evolve` ne fait que les appliquer.
- La concurrence est optimiste, comme dans le Donjon : le service rejoue une commande refusée
  pour conflit de version, jusqu'à quatre tentatives (deux duellistes, la réponse du Village,
  une échéance).

**Les duels actifs d'un joueur sont retrouvés par un modèle de lecture**, la table
`duel.active_duels`, rangée dans le schéma propre du module et créée par la migration
`drizzle/0013_duel.sql`.

- Elle est tenue par la projection `duel-active-duels` (`infrastructure/active-duels-projection.ts`),
  version 1, avec son point de reprise dans `platform.projections` (ADR 0006) : un duel y entre à
  son lancement, et en sort à son issue ou à son annulation.
- Elle n'est qu'un **index** : avant de s'y fier pour la règle 3, le service relit chaque duel
  signalé dans le journal et enregistre ses échéances passées. Un défi expiré, ou un duel
  abandonné, libère ainsi ses duellistes et rend les mises.
- La règle 3, qui porte sur plusieurs duels, n'est donc pas vérifiée par `decide`, qui ne voit
  qu'un duel : elle l'est par la fonction pure `checkAvailability` du domaine, appelée par le
  service avec l'ensemble des joueurs occupés.

## Conséquences

### Positives

- Le journal du combat présenté aux joueurs est la lecture directe des événements : ce qui est
  affiché est exactement ce qui a été décidé.
- Les règles du duel se testent sans base, ligne du tableau de résolution par ligne.
- Les choix simultanés des deux duellistes ne peuvent pas se perdre : le second écrivain est
  rejoué sur l'état à jour.
- Le module réutilise sans modification la plateforme existante : journal, projections, canaux,
  boîte d'envoi.

### Négatives

- La règle 3 n'est pas garantie par une transaction : deux défis lancés au même instant au même
  joueur peuvent être enregistrés tous les deux (dette DT-011).
- Les noms des duellistes sont copiés dans le journal et dans la table des duels actifs :
  l'effacement d'un compte doit les réécrire aux deux endroits (`personal-data.ts`).
- Les événements deviennent un contrat : la forme de `RoundResolved` a déjà évolué pendant le
  développement (ajout des effets). Après le premier déploiement, une telle évolution demandera
  de lire les anciens événements sans effets.
- Les duels terminés quittent la table : aucun palmarès n'est consultable sans relire le journal.

## Alternatives écartées

- **Tables classiques (`duel.duels`, `duel.rounds`)** : adaptées à des données destinées à
  disparaître, comme celles de la Taverne (ADR 0008), mais l'historique a ici une valeur de jeu,
  et le contrôle des écritures concurrentes aurait demandé des verrous explicites.
- **Rechercher les duels actifs en relisant le journal** (`readAll` sur le préfixe `duel-`) : le
  coût de chaque défi aurait crû avec le nombre de duels jamais joués, comme celui des expéditions
  ouvertes avant le TD8 (DT-005).
- **Un flux « disponibilité » par joueur**, soumis à la concurrence optimiste : il garantirait la
  règle 3, mais chaque défi écrirait dans trois flux (le duel et ses deux joueurs), soit une saga
  de plus pour une règle dont la violation est rare. C'est la piste de remboursement de DT-011.
- **Vérifier la règle 3 dans `decide`** en passant les duels actifs dans la commande : l'état
  lu pourrait être périmé au moment de l'écriture, sans aucun gain de garantie.

## Réexamen

À réexaminer si des violations de la règle 3 sont constatées en production, ou si un palmarès
des duels est ajouté : une seconde projection, conservant les duels terminés, serait alors
nécessaire.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai choisi le module et fixé ses règles (quatre passes, points de vie, mises en ressources) ;
  l'IA a proposé le découpage du domaine, écrit le code du module et rédigé cet ADR. J'ai fait
  corriger plusieurs points pendant le développement : mise en bois, pierre ou or, effets de
  manche affichés, soin sans dégât pour l'adversaire.
- **Vérification** : tests du domaine (`rules.test.ts`, `view.test.ts`, `master.test.ts`), de la projection
  (`active-duels-projection.test.ts`) et de l'API (`src/bootstrap/duel-api.test.ts`) ; parties
  jouées en local ; `pnpm verify` et `pnpm build` réussissent.
