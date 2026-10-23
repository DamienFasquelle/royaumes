# ADR-0005 - Une intelligence artificielle déterministe, exécutée dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le Donjon a besoin de monstres dont le comportement dépend d'un niveau de difficulté, et de
compagnons pilotés par l'ordinateur, qui permettent de jouer seul.

L'hébergement ne permet aucun processus permanent (ADR 0004) : il n'existe aucune boucle de jeu
dans laquelle un personnage pourrait agir de lui-même.

L'état d'une expédition est reconstruit à partir de ses événements, et une manche peut être
calculée lors d'une lecture sans être enregistrée (ADR 0002 et 0004) : toute décision doit donner
le même résultat quel que soit le moment du calcul.

## Décision

- **Les décisions de l'intelligence artificielle sont des fonctions pures du domaine**, appelées
  au moment de la résolution d'une manche : `chooseCompanionAction` (`companion.ts`) pour les
  compagnons, une stratégie par niveau pour les monstres.
- **Elles ne tirent au sort qu'au moyen du générateur de la manche** (`random.ts`, mulberry32,
  graine dérivée de la graine de l'expédition et du numéro de manche).
- **Leurs résultats, actions des compagnons comprises, sont enregistrés dans l'événement
  `RoundResolved`** : la relecture applique les décisions, elle ne les recalcule pas.
- **Le comportement des monstres est isolé derrière un port de stratégie**
  (`monster-strategies.ts`), dont chaque niveau de difficulté fournit une mise en œuvre.
- **Un compagnon n'agit que si au moins un joueur a choisi une action pour la manche** : sinon il
  se défend, et ne joue pas à la place de joueurs absents.
- **L'équilibre du jeu est mesuré par simulation** (`simulation.ts`, script `simulate-dungeon.ts`),
  et protégé par des tests statistiques (`simulation.test.ts`).

## Conséquences

### Positives

- Une expédition se rejoue à l'identique, et les décisions de l'IA se testent comme le reste du
  domaine, par des cas précis.
- Aucune infrastructure : l'IA ne coûte que quelques calculs pendant une requête.
- Un nouveau niveau de difficulté s'ajoute par une nouvelle stratégie, sans toucher aux règles du
  combat.
- L'équilibrage devient mesurable, et une régression d'équilibre fait échouer les tests.

### Négatives

- **Un personnage piloté par l'ordinateur ne peut pas agir entre deux échéances**, ni de sa propre
  initiative : il ne décide qu'au moment de la résolution.
- **La qualité de l'équilibre mesuré dépend de la règle suivie par les joueurs simulés** : de vrais
  joueurs peuvent jouer mieux ou moins bien.
- Une IA déterministe est prévisible, et le secret de la graine devient une exigence de sécurité
  (revue du Donjon, D1 et D7).

## Alternatives écartées

- **Une boucle de jeu exécutée par un processus permanent** : impossible sur l'hébergement retenu,
  et contraire aux échéances paresseuses.
- **Des décisions prises par le navigateur d'un joueur** : un joueur pourrait les modifier, et un
  compagnon cesserait d'agir dès que ce navigateur est fermé.
- **Un recalcul des décisions lors de la relecture, plutôt que leur enregistrement** : toute
  modification ultérieure de l'IA changerait l'histoire des expéditions passées.

## Réexamen

À réexaminer si le jeu demande un personnage qui agit en temps réel, ou une intelligence
artificielle trop coûteuse en calcul pour être exécutée pendant une lecture.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai fait rédiger cet ADR par l'IA après coup, à partir de l'IA du Donjon
  (`companion.ts`, `monster-strategies.ts`, `random.ts`, `simulation.ts`), en lui fournissant la
  liste des éléments exigés par le support du TD7.
- **Vérification** : chaque mécanisme décrit a été confronté au code, notamment la condition d'action du compagnon
  et l'enregistrement des actions dans `RoundResolved` ; la présence de chaque élément exigé par
  le TD7 a été contrôlée ; `pnpm verify` réussit.
