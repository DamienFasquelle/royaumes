# ADR-0012 - Le Duel : canal discret, échéances paresseuses, maître d'armes et fonction d'aptitude

- Statut : accepté
- Date : 2026-10-23

## Contexte

Au-delà de son stockage (ADR 0010) et de sa saga (ADR 0011), le Duel a quatre besoins qui
touchent à l'architecture :

- les deux duellistes doivent voir le combat évoluer **en direct**, sans qu'aucun ne puisse
  apprendre la passe de l'autre avant la fin de la manche (règle 11) ;
- un défi expire au bout de **dix minutes**, une manche au bout de **vingt secondes**, et deux
  manches manquées font perdre par abandon (règles 5 et 14) ; aucune tâche de fond n'est
  disponible (ADR 0001) ;
- un joueur doit pouvoir s'entraîner contre un **adversaire piloté par l'ordinateur** (règle 17) ;
- le domaine du Duel, qui ne peut pas importer le Village, doit connaître le **nom des
  ressources** que l'on peut miser : une copie, qui pourrait diverger.

## Décision

- **Canal discret propre au module.** Le canal `duel-<identifiant>` suit le flux du duel. Sa règle
  d'accès (`index.ts`) ne l'ouvre qu'aux deux duellistes, en s'appuyant sur la vue filtrée. Il est
  **discret** (`redact`) : l'événement `MoveChosen` contient la passe choisie, et ne doit être
  transmis qu'avec son type ; chaque navigateur relit alors sa vue, qui ne contient jamais la passe
  de l'adversaire pour la manche en cours.
- **Échéances paresseuses, comme le Donjon (ADR 0004).** `decide` appelle d'abord `settle`, qui
  enregistre l'expiration d'un défi et la résolution des manches échues, chacune à son propre
  instant ; la vue applique les mêmes échéances sans rien écrire. Le compte à rebours de
  l'interface envoie `POST /api/duel/duels/:id/deadline` à zéro. Le service enregistre aussi les
  échéances des duels d'un joueur avant de vérifier sa disponibilité et à chaque consultation de
  ses duels.
- **IA déterministe, comme les compagnons (ADR 0005).** Le maître d'armes (`domain/master.ts`)
  répond à la passe que son adversaire a le plus souvent jouée ; une égalité est départagée par la
  graine du duel, tirée par le serveur et jamais transmise. Il choisit au moment de la résolution :
  une manche d'entraînement est résolue dès que le joueur a choisi.
- **Fonction d'aptitude des ressources misables.** Un test de `src/bootstrap/architecture.test.ts`
  vérifie que `STAKE_RESOURCES` (Duel) contient exactement les ressources de `RESOURCES` (Village).
  Une ressource ajoutée ou renommée au Village fait échouer `pnpm verify` tant que le Duel n'est
  pas mis à jour.

## Conséquences

### Positives

- Aucune infrastructure nouvelle : le module réutilise les canaux, les échéances et le modèle
  d'IA déjà éprouvés par le Donjon.
- La passe de l'adversaire ne peut fuir ni par l'API, ni par le canal (tests « signale la
  résolution des manches sans révéler les passes » et règle 11 de `view.test.ts`).
- La résolution d'une manche est reproductible : la même manche, calculée plus tard, donne le
  même résultat.
- La copie du nom des ressources est protégée : la divergence ne peut pas passer inaperçue.

### Négatives

- Une échéance n'est enregistrée qu'à la requête suivante : si les deux duellistes quittent la
  page, le duel reste en l'état dans le journal, et les mises ne sont rendues qu'à la première
  consultation ou au premier défi qui le concerne.
- Le maître d'armes est prévisible : un joueur qui varie ses passes le déjoue facilement.
- Chaque notification du canal provoque une relecture de la vue par les deux navigateurs.

## Alternatives écartées

- **Canal non discret** : il aurait transmis la passe choisie dans `MoveChosen`, en contradiction
  avec la règle 11.
- **Ne pas enregistrer `MoveChosen`, garder les choix en mémoire** : impossible sur des fonctions
  sans état partagé.
- **Minuteries côté serveur** pour les manches : impossibles sans processus permanent (ADR 0004).
- **Importer `RESOURCES` du Village dans le domaine du Duel** : interdit par la règle « domaine
  pur » de dependency-cruiser ; l'importer dans les contrats seulement aurait laissé le domaine
  sans connaissance des ressources pour valider la règle 1.

## Réexamen

À réexaminer si les duels doivent se poursuivre sans aucun joueur connecté (tournois
automatiques), ou si le maître d'armes doit offrir plusieurs niveaux de difficulté.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : L'IA a écrit le canal, les échéances, l'IA du maître d'armes, la fonction d'aptitude et leurs
  tests, et rédigé cet ADR.
- **Vérification** : tests `duel-realtime.test.ts`, `master.test.ts`, règles 5, 11, 14 et 17 de `rules.test.ts`, et
  fonction d'aptitude de `architecture.test.ts` ; `pnpm verify` réussit.
