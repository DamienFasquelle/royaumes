# ADR-0008 - Un stockage classique pour la Taverne, et la réécriture ciblée des champs personnels du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

La Taverne, salon de discussion du jeu, conserve des messages et une présence destinés à
disparaître : ils n'ont aucune valeur de jeu, et leur conservation doit être limitée (RGPD,
article 5). Les droits d'accès, de portabilité et d'effacement (articles 15, 17 et 20) portent,
eux, sur le jeu entier.

L'existant contient des données personnelles copiées : des noms de joueurs dans les événements du
Donjon et du Marché, et un nom de village dans ceux du Village, dans des flux parfois partagés avec
d'autres joueurs.

Le journal est en ajout seul (ADR 0002), et les projections en dérivent des tables de lecture qui
recopient ces noms (ADR 0006).

## Décision

- **La Taverne utilise des tables ordinaires** (schéma `tavern`), dont les lignes sont supprimées à
  l'expiration de leur durée de conservation : trente jours pour les messages.
- **Son canal temps réel est alimenté par une source fournie par le module**, la table des
  messages, et non par le journal.
- **La présence repose sur un signal périodique** : une ligne par joueur présent, supprimée à son
  départ ou deux minutes après son dernier signal.
- **Les durées de conservation sont appliquées à la lecture**, et chaque jour par la route des
  tâches quotidiennes.
- **Chaque module déclare ses données personnelles par un contributeur** (`personal-data.ts`) :
  export, réécriture de ses événements, effacement de ses tables.
- **L'effacement réécrit les seuls champs de nom des événements du joueur**, par une fonction
  unique de la plateforme (`src/platform/privacy/privacy.ts`), et le consigne dans un registre
  (`platform.erasures`) qui ne contient aucune donnée sur le joueur.
- **L'identité est effacée en dernier ; chaque étape est idempotente** : un effacement interrompu
  peut être relancé par le joueur lui-même.

## Conséquences

### Positives

- Des droits exercés par le joueur lui-même, depuis la page « Mes données », sans intervention.
- Un effacement qui n'altère ni les états reconstruits, ni l'historique des autres joueurs.
- Une règle de conservation garantie même sans activité, grâce à la tâche quotidienne.
- Un module, la Taverne, plus simple que s'il avait suivi le modèle des autres.

### Négatives

- **Une exception à la règle de l'ajout seul**, que toute modification future du journal devra
  respecter strictement : seuls les champs personnels, par cette seule fonction.
- **Un effacement et un export dont le coût croît avec la taille du journal.**
- **Une obligation nouvelle pour chaque événement futur** : déclarer ses champs personnels dans le
  contributeur de son module, faute de quoi ils échapperont à l'effacement.
- **Un identifiant conservé dans le journal**, dont la pseudonymisation dépend de la destruction
  effective de tout lien avec la personne.

## Alternatives écartées

- **L'Event Sourcing pour la Taverne** : il aurait fallu réécrire ou supprimer des événements chaque
  jour pour respecter la durée de conservation.
- **La suppression des flux du joueur** : elle aurait rendu incohérents les flux partagés avec
  d'autres joueurs.
- **L'effacement cryptographique** (une clé par joueur, détruite à l'effacement) : il impose une
  gestion des clés et le chiffrement de chaque champ personnel, disproportionnés pour ce projet.
- **Les références sans copie** (n'enregistrer que l'identifiant, et lire le nom dans `identity`) :
  plus propres, mais elles auraient demandé de reprendre tous les événements et toutes les
  projections existants.
- **Un service externe de présence**, comme une base clé-valeur en mémoire : une infrastructure de
  plus, pour une donnée que deux colonnes suffisent à tenir.

## Réexamen

À réexaminer lors de la conception d'un nouveau module, pour lequel les références sans copie
devraient être préférées dès l'origine ; si la taille du journal rend l'effacement trop long pour
une requête ; ou en cas d'évolution de la doctrine sur l'anonymisation des identifiants pseudonymes.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai fait rédiger cet ADR par l'IA après coup, à partir de la brique `privacy`, du module
  Taverne et des contributeurs `personal-data.ts`, en lui fournissant la liste des éléments
  exigés par le support du TD10.
- **Vérification** : chaque mécanisme décrit a été confronté au code (durées de conservation, réécriture ciblée,
  registre des effacements, ordre des contributeurs) et aux tests `privacy-api.test.ts` ; la
  présence de chaque élément exigé par le TD10 a été contrôlée ; `pnpm verify` réussit.
