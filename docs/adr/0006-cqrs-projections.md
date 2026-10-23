# ADR-0006 - Séparer les modèles de lecture du modèle d'écriture, tenus à jour par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

Certaines lectures traversent les flux : le classement des joueurs, et la liste des expéditions
ouvertes. Leur calcul par rejeu du journal croissait avec l'historique du jeu, et non avec le
nombre d'éléments présentés (dette DT-005).

L'hébergement ne permet aucun processus permanent (ADR 0004) : aucune tâche de fond ne peut tenir
une table à jour en continu.

Le journal attribue à chaque événement une position globale, croissante mais non continue : une
insertion annulée laisse un trou, et une insertion encore en cours peut apparaître après une
position plus élevée (ADR 0002).

## Décision

- **Les lectures transversales s'appuient sur des modèles de lecture**, placés dans le schéma
  PostgreSQL de leur module (`ranking.players`, `dungeon.open_games`, puis `market.offers` et
  `duel.active_duels`) ; **les décisions s'appuient toujours sur le modèle d'écriture**, le journal.
- **Chaque modèle de lecture est tenu à jour par une projection**, dont le point de reprise est
  enregistré dans la table `platform.projections` (`src/platform/projection/projection.ts`).
- **Une projection est rattrapée au moment de sa consultation**, dans une seule transaction, le
  point de reprise étant verrouillé (`FOR UPDATE`).
- **Le rattrapage s'arrête devant une position manquante** tant que l'événement qui la suit a moins
  de cinq secondes : l'insertion manquante est peut-être encore en cours.
- **Chaque projection porte une version** : une version plus élevée que celle des tables provoque
  leur reconstruction, une version moins élevée interdit toute écriture.
- **Le classement est annoncé aux navigateurs par un canal global et discret** ; l'interface relit
  le classement jusqu'à ce que la projection ait atteint la position annoncée.

## Conséquences

### Positives

- Le coût d'une consultation ne dépend plus de l'historique, mais de la taille de la table.
- Les modules qui écrivent ne savent rien des projections qui les lisent.
- Une nouvelle information peut être calculée pour le passé, sans migration de données : il suffit
  d'augmenter la version de la projection.
- Aucune tâche de fond, ni opération manuelle après un déploiement.

### Négatives

- **Cohérence à terme** : un modèle de lecture peut avoir quelques secondes de retard sur le journal.
- **La reconstruction a lieu pendant une consultation**, dont la durée est limitée sur Vercel : elle
  deviendra impossible au-delà d'une certaine taille du journal.
- **Après un retour à une version précédente de l'application**, une projection dont la version a
  été augmentée cesse d'avancer jusqu'au déploiement suivant.
- **Le Classement dépend du langage publié des autres modules** : un événement modifié ou ajouté
  sans réexamen de ses lecteurs passe inaperçu, comme l'a montré la liste des expéditions ouvertes.

## Alternatives écartées

- **La mise à jour des modèles de lecture dans la commande, par le module qui écrit** : couple le
  module qui écrit à tous ceux qui lisent, et allonge chaque commande.
- **Une tâche planifiée, ou un processus de fond abonné au journal** : impossibles ou trop rares sur
  l'hébergement retenu.
- **Une vue matérialisée de PostgreSQL** : entièrement recalculée à chaque rafraîchissement, elle
  coûte autant qu'un rejeu.
- **Le maintien du calcul par rejeu** : la solution d'origine, dont le coût croissait avec
  l'historique (DT-005).

## Réexamen

À réexaminer si une reconstruction approche la durée maximale d'une fonction, si le nombre de
consultations simultanées fait du verrou du point de reprise un goulet d'étranglement, ou si un
besoin de lecture strictement à jour apparaît.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai fait rédiger cet ADR par l'IA après coup, à partir du moteur des projections
  (`src/platform/projection/projection.ts`) et des projections des modules, en lui fournissant
  la liste des éléments exigés par le support du TD8.
- **Vérification** : chaque mécanisme décrit a été confronté au code (verrou du point de reprise, délai de cinq
  secondes devant une position manquante, comparaison des versions) ; la présence de chaque
  élément exigé par le TD8 a été contrôlée ; `pnpm verify` réussit.
