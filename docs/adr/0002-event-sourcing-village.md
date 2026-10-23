# ADR-0002 - L'Event Sourcing comme mode de persistance du Village

- Statut : accepté
- Date : 2026-10-19

## Contexte

Le Village est le premier module de jeu. Son état évolue par des actions successives du
joueur : fondation, améliorations de bâtiments, puis mouvements de ressources demandés par
d'autres modules. Entre deux actions, la production s'accumule sans intervention.

La suite du projet annonçait deux besoins qui reposent sur l'activité des joueurs plutôt que
sur leur état courant : la diffusion des changements en temps réel (TD5), et la construction
de vues de lecture, comme un classement, à partir de cette activité (TD8).

L'hébergement sur Vercel exécute l'application dans plusieurs instances, qui peuvent traiter
simultanément deux requêtes pour un même village : par exemple deux améliorations envoyées
depuis deux onglets. Aucune ne doit pouvoir dépenser les ressources déjà dépensées par l'autre.

## Décision

- **L'état du village n'est pas stocké : il est reconstruit en rejouant ses événements**
  (`VillageFounded`, `BuildingUpgraded`...). Le domaine suit le modèle decider
  (`src/modules/realm/domain/village.ts`) : `decide` produit des événements, `evolve` les applique.
- **Les événements sont enregistrés dans un journal générique de la plateforme**, la table
  `platform.events`, en ajout seul, avec un flux par village nommé `village-<joueur>`. Le module
  n'y accède que par le port `EventStore` (`src/platform/event-store`).
- **Les écritures concurrentes sont détectées par la contrainte d'unicité `(stream, version)`** :
  l'enregistrement précise la version lue avant la décision, et un second enregistrement sur la
  même version est refusé (`ConcurrencyError`). La commande est alors rejouée sur l'état à jour,
  au plus trois fois (`withOptimisticRetry`).
- **Un événement porte toutes les informations nécessaires à son application** : `BuildingUpgraded`
  contient le coût effectivement payé, de sorte qu'un changement ultérieur du barème ne modifie
  pas l'histoire d'un village.
- La production n'est pas enregistrée minute par minute : le stock est calculé à l'instant de la
  lecture, à partir du dernier état reconstruit.

## Conséquences

### Positives

- L'historique complet de chaque village est conservé : il a servi au temps réel, au Classement et
  au relais du service extrait sans modifier le Village.
- Les écritures concurrentes sont détectées par la base, et non par le code : aucune ressource ne
  peut être dépensée deux fois.
- Le domaine se teste sans base de données : une suite d'événements en entrée, une décision en
  sortie.
- Les autres modules peuvent lire les événements du Village comme un langage publié, sans dépendre
  de ses tables.

### Négatives

- **Un événement enregistré ne peut pas être modifié.** Changer la structure d'un événement impose
  de savoir relire les anciennes formes déjà enregistrées, indéfiniment ; renommer un événement
  revient à en créer un nouveau.
- Chaque lecture relit tout le flux du village : son coût croît avec le nombre d'événements. Aucun
  instantané n'est enregistré.
- Effacer une donnée personnelle contredit le principe de l'ajout seul : une exception a dû être
  encadrée (ADR 0008).
- Le modèle est moins familier qu'une table mise à jour, et le calcul d'un état demande de
  comprendre le rejeu.

## Alternatives écartées

- **Stockage de l'état dans une table propre au module** (`realm.villages`, mise à jour à chaque
  commande) : plus simple, mais l'historique est perdu, et chaque module intéressé par un
  changement aurait dû être appelé par le Village, créant un couplage direct.
- **Verrouillage pessimiste** (`SELECT ... FOR UPDATE` sur le village) : il sérialise les
  commandes en bloquant les lectures concurrentes, et maintient des verrous sur des connexions
  mutualisées ; les conflits sont trop rares pour le justifier.
- **Une table d'état et un journal d'audit séparé** : deux sources de vérité, qui peuvent diverger
  si l'une des deux écritures échoue.
- **Une base spécialisée (EventStoreDB)** : un service de plus à héberger, hors de l'offre gratuite
  retenue (ADR 0001).

## Réexamen

À réexaminer si le nombre d'événements par village rend la reconstruction de l'état coûteuse
(instantanés), ou si le volume du journal impose un archivage.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai fait rédiger cet ADR par l'IA après coup, à partir du code du Village
  (`src/modules/realm/domain/village.ts`) et du journal (`src/platform/event-store/`), en lui
  fournissant la liste des éléments exigés par le support du TD3.
- **Vérification** : chaque mécanisme décrit a été confronté au code qui le met en œuvre (decider, contrainte
  d'unicité `(stream, version)`, `withOptimisticRetry`, coût enregistré dans `BuildingUpgraded`) ;
  la présence de chaque élément exigé par le TD3 a été contrôlée ; `pnpm verify` réussit.
