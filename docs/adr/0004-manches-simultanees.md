# ADR-0004 - Des manches simultanées, aux échéances paresseuses, pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les combats du Donjon réunissent jusqu'à quatre joueurs humains. Ils ne doivent ni s'attendre
indéfiniment, ni être avantagés par l'ordre de jeu.

L'hébergement ne permet ni minuteur en mémoire, ni tâche de fond, et les tâches planifiées de
l'offre gratuite ne s'exécutent qu'une fois par jour : rien ne s'exécute à l'échéance d'une
manche si personne n'envoie de requête.

L'état d'une expédition est reconstruit à partir de ses événements (ADR 0002) : tout calcul doit
être reproductible.

Les choix des joueurs doivent rester secrets jusqu'à la résolution de la manche.

## Décision

- **Les héros choisissent simultanément.** La manche est résolue lorsque tous ont choisi, ou
  lorsque son échéance de trente secondes est atteinte ; un héros sans choix se défend.
- **L'échéance est enregistrée dans les événements**, et une manche échue est résolue à l'instant
  de son échéance, non à l'instant où elle est constatée.
- **Une lecture calcule la résolution des manches échues sans rien enregistrer** ; toute commande
  commence par l'enregistrer (`settle`, appelée par `decide`) ; le navigateur envoie une **commande
  d'échéance** (`POST .../deadline`) lorsque son compte à rebours atteint zéro.
- **Le hasard est tiré dans `decide`**, avec un générateur à graine dérivée du numéro de manche
  (`mix(seed, 1, round)`), et ses résultats sont enregistrés dans les événements.
- **Une action porte le numéro de la manche visée**, et elle est refusée si cette manche est déjà
  résolue (`ROUND_OVER`).

## Conséquences

### Positives

- Aucun joueur n'attend les autres, et un joueur absent ne bloque personne ; aucun n'est avantagé
  par l'ordre de jeu.
- Aucune infrastructure de minuterie : le mécanisme fonctionne sur l'offre sans serveur.
- Le résultat d'une manche ne dépend pas du moment où il est calculé : rejeu et tests reproductibles.
- Une action envoyée trop tard ne peut pas s'appliquer par erreur à la manche suivante.
- Le mécanisme a été réutilisé tel quel par le Marché et le Duel.

### Négatives

- **Le journal peut être en retard sur ce qu'affichent les lectures** : lorsque plus aucun joueur ne
  se manifeste, une expédition reste en l'état dans le journal, alors que toute lecture l'affiche
  comme avancée. Une expédition abandonnée n'enregistre jamais sa fin.
- **Les notifications dépendent des navigateurs** : c'est la commande d'échéance d'un navigateur
  ouvert qui fait enregistrer la manche, et donc notifier les autres membres.
- La logique d'échéance est répartie entre le domaine, la vue et l'interface : un lecteur du code
  peut s'étonner d'une commande « qui ne fait rien ».
- Les choix simultanés provoquent des conflits de version : une commande est rejouée jusqu'à
  `MAX_HEROES + 1` fois.

## Alternatives écartées

- **Le tour par tour strict** : les joueurs s'attendent, l'ordre de jeu avantage certains, et un
  joueur absent bloque l'expédition.
- **Un minuteur ou une tâche planifiée** : impossible sur des fonctions qui s'arrêtent après la
  réponse, et la tâche planifiée gratuite ne passe qu'une fois par jour.
- **Une lecture qui enregistre elle-même la résolution** : une lecture deviendrait une écriture,
  concurrente des commandes, et une simple consultation modifierait le journal.
- **Un tirage par `Math.random` dont seul le résultat serait enregistré** : le rejeu resterait
  possible, mais le calcul effectué par une lecture différerait de celui de la commande, et les
  tests ne seraient plus reproductibles.

## Réexamen

À réexaminer si le jeu doit enregistrer la fin d'une expédition abandonnée (par exemple pour le
Classement), ou si un service de planification de tâches compatible avec l'hébergement devient
disponible.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai fait rédiger cet ADR par l'IA après coup, à partir des règles du Donjon
  (`src/modules/dungeon/domain/rules.ts`, `view.ts`), en lui fournissant la liste des éléments
  exigés par le support du TD6.
- **Vérification** : chaque mécanisme décrit a été confronté au code (`settle`, `CheckDeadline`, `ROUND_OVER`,
  graine `mix(seed, 1, round)`) et aux tests du Donjon ; la présence de chaque élément exigé par
  le TD6 a été contrôlée ; `pnpm verify` réussit.
