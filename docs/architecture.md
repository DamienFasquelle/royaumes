# Architecture de Royaumes

Ce document décrit la structure du système selon le modèle C4, du plus général au plus
détaillé. Les raisons des choix qui y apparaissent sont consignées dans les
[décisions d'architecture](adr/README.md).

Les diagrammes sont rédigés en Mermaid : ils sont versionnés avec le code, et mis à jour
dans le même commit que la modification qu'ils décrivent.

## Niveau 1 - Contexte

```mermaid
flowchart TB
  joueur["Joueur<br/>[Personne]<br/>Joue depuis un navigateur,<br/>sur ordinateur ou sur téléphone"]
  royaumes["Royaumes<br/>[Système logiciel]<br/>Jeu web multijoueur : village, donjon,<br/>classement, marché, taverne et duels"]
  joueur -->|"Gère son village, joue avec les autres joueurs,<br/>reçoit les changements en direct (HTTPS)"| royaumes
```

Royaumes ne dépend d'aucun système externe : il n'envoie aucun courrier électronique et
ne fait appel à aucun service de paiement ni à aucun fournisseur d'identité. Les comptes
des joueurs sont gérés par le système lui-même.

## Niveau 2 - Conteneurs

```mermaid
flowchart TB
  joueur["Joueur<br/>[Personne]"]
  subgraph royaumes["Système Royaumes"]
    web["Interface web<br/>[Conteneur : React, dans le navigateur]<br/>Pages du jeu et page de connexion"]
    serveur["Application serveur<br/>[Conteneur : Next.js et Hono, fonctions Vercel, Francfort]<br/>Rendu des pages, API JSON,<br/>authentification, flux temps réel"]
    base[("Base de données<br/>[Conteneur : PostgreSQL, Neon, Francfort]<br/>Schéma platform : journal, points de reprise,<br/>boîte d'envoi, registre des effacements<br/>Schéma identity : comptes et sessions<br/>Schémas ranking, dungeon, market et duel :<br/>modèles de lecture<br/>Schéma tavern : messages et présence")]
  end
  joueur -->|"Utilise"| web
  web -->|"Pages, appels de l'API avec le cookie de session<br/>(HTTPS, JSON)"| serveur
  serveur -->|"Événements des canaux autorisés<br/>(Server-Sent Events)"| web
  serveur -->|"Lit et écrit<br/>(SQL, connexion mutualisée)"| base
```

| Conteneur | Technologies | Responsabilités |
| --- | --- | --- |
| Interface web | React, composants des modules (`ui.tsx`) | Affichage des vues, envoi des actions du joueur, abonnement aux canaux temps réel |
| Application serveur | Next.js, Hono, Better Auth, Drizzle | Contrôle d'accès, règles du jeu, enregistrement des événements, diffusion des flux |
| Base de données | PostgreSQL (Neon en production, PGlite en local et en test) | Conservation du journal d'événements, des comptes et des sessions ; modèles de lecture des modules |

Le journal d'événements est la seule source de vérité des modules Village, Donjon, Marché et Duel.
La Taverne n'enregistre pas d'événements : ses tables sont sa propre source de vérité (ADR 0008).
Les tables des schémas `ranking`, `dungeon`, `market` et `duel` sont des modèles de lecture, dérivés du journal par des projections : elles peuvent
être vidées puis reconstruites à tout moment, sans perte d'information.

L'interface web ne communique jamais directement avec la base : toute lecture et toute
écriture passent par l'application serveur, qui applique le contrôle d'accès.

## Niveau 3 - Composants de l'application serveur

```mermaid
flowchart TB
  route["Route d'API<br/>[app/api/[[...route]]/route.ts]<br/>Transmet toute requête /api à Hono"]
  pages["Pages du jeu<br/>[app/(jeu)/]<br/>Vérifient la session avant tout rendu"]
  subgraph bootstrap["src/bootstrap"]
    server["server.ts<br/>Instance unique de l'application,<br/>de la base et de l'authentification"]
    createapi["create-api.ts<br/>Assemble plateforme et modules,<br/>protège les routes"]
  end
  subgraph modules["src/modules"]
    system["system<br/>Route de santé"]
    realm["realm<br/>Village : domaine, service,<br/>dépôt fondé sur le journal, API, canal,<br/>version distante (remote.ts)"]
    dungeon["dungeon<br/>Donjon : domaine et IA, service,<br/>dépôt fondé sur le journal, API, canal discret,<br/>projection des expéditions ouvertes"]
    ranking["ranking<br/>Classement : projection,<br/>lecture, API, canal global"]
    market["market<br/>Marché : orchestrateur de la saga,<br/>projection des offres, API, canal global"]
    tavern["tavern<br/>Taverne : messages et présence<br/>en tables, API, canal à source propre"]
    duel["duel<br/>Duel : domaine et maître d'armes,<br/>orchestrateur de la saga des mises,<br/>projection des duels actifs, API, canal discret"]
  end
  subgraph platform["src/platform"]
    auth["auth<br/>Port AuthPort,<br/>adaptateur Better Auth"]
    http["http<br/>Intergiciel requireUser,<br/>validation des requêtes,<br/>authentification entre services"]
    realtime["realtime<br/>Flux SSE, règles d'accès<br/>aux canaux, canaux discrets et globaux"]
    store["event-store<br/>Journal d'événements,<br/>concurrence optimiste"]
    projection["projection<br/>Rattrapage et reconstruction<br/>des projections"]
    outbox["outbox<br/>Boîte d'envoi, distributeur,<br/>boîte de réception"]
    privacy["privacy<br/>Export et effacement,<br/>registre des effacements"]
    cron["cron<br/>Route des tâches<br/>quotidiennes"]
    db["db<br/>Client Drizzle<br/>(Neon ou PGlite)"]
  end
  base[("Base de données")]
  route --> server
  pages --> server
  server --> createapi
  createapi --> system & realm & dungeon & ranking & market & tavern & duel & auth & http & realtime & projection & outbox & privacy & cron
  realm --> store & realtime & http & outbox
  market --> store & projection & realtime & http & outbox
  dungeon --> store & projection & realtime & http
  ranking --> projection & realtime & http
  tavern --> realtime & http & db
  duel --> store & projection & realtime & http & outbox
  realm & dungeon & market & ranking & tavern & duel --> privacy
  privacy --> store
  auth --> privacy
  realtime --> store & http
  projection --> db
  store --> outbox
  outbox --> db
  http --> auth
  auth --> db
  store --> db
  db --> base
```

Les interfaces des modules (`ui.tsx`) s'appuient sur la couche 3D partagée, `src/ui/three/`
(canevas, décors, personnages, effets, étiquettes), et sur les scènes de leur propre répertoire
`scene/`. Ces scènes sont chargées à la demande dans le navigateur, et ne reçoivent que les vues
renvoyées par l'API : elles ne font partie que de la présentation (ADR 0013). Elles ne figurent pas
sur le diagramme, qui décrit l'application serveur.

Une flèche signifie « dépend de ». Le diagramme ne montre que les dépendances principales :
`server.ts` crée également lui-même la base, le journal et l'adaptateur d'authentification,
qu'il transmet à `create-api.ts`. Les modules `dungeon` et `ranking` écrivent directement
dans leurs propres tables, au sein de la transaction fournie par le moteur des projections.

Le module `ranking` lit des événements du Village et du Donjon, mais n'importe aucun de leurs
fichiers en dehors de leurs contrats : il ne dépend que de leur langage publié, c'est-à-dire
du nom et des données de leurs événements, ainsi que du préfixe de leurs flux.

Le module `market` modifie les villages sans jamais importer le code du Village : il enregistre
des messages dans la boîte d'envoi, que le distributeur remet aux gestionnaires du Village.
La seule dépendance directe porte sur les contrats du Village (`REALM_TOPICS`, `ResourceAmounts`),
qui décrivent ces messages. Chaque transaction ne modifie que les données d'un seul module,
et la boîte d'envoi (ADR 0007).

Le module `duel` communique lui aussi avec le Village par la boîte d'envoi, sans importer son
code (ADR 0011). Il réutilise les sujets publiés par le Village, `realm.withdraw` et
`realm.deposit`, et reçoit les réponses aux prélèvements sur son propre sujet,
`duel.stake-result`. L'offre du Marché et le duel sont ainsi deux orchestrateurs de saga
indépendants, qui s'adressent au même gestionnaire du Village. Le Village n'a pas été modifié
pour accueillir le Duel. La seule dépendance du Duel envers lui porte sur ses contrats
(`REALM_TOPICS`), et une fonction d'aptitude vérifie que les ressources misables par le Duel
restent celles du Village. L'interface du Duel lit en outre la liste des joueurs dans le langage
publié du Classement (`GET /api/ranking/players`), pour proposer des adversaires.

Chaque module déclare ses données personnelles à la brique `privacy`, au moyen d'un fichier
`personal-data.ts` : il les exporte, désigne les champs personnels de ses événements, et les
efface de ses tables. La brique `privacy` contient la seule fonction du projet qui modifie un
événement enregistré : la réécriture ciblée des champs personnels, lors de la suppression
d'un compte (ADR 0008).

Les règles suivantes sont vérifiées automatiquement par
dependency-cruiser (`.dependency-cruiser.cjs`) à chaque exécution de `pnpm verify` :

- la plateforme ne dépend d'aucun module ;
- un module n'est accessible que par ses entrées publiques (`index.ts`, `contracts.ts`, `ui.tsx`) ;
- le domaine d'un module ne dépend d'aucune bibliothèque technique ;
- la couche application d'un module ne dépend pas de sa couche infrastructure ;
- le code destiné au navigateur ne dépend d'aucun code serveur ;
- aucune dépendance circulaire n'est admise ;
- un module n'importe jamais les tables de la plateforme : il passe par ses fonctions.

Trois fonctions d'aptitude complètent ces règles, sous la forme de tests
(`src/bootstrap/architecture.test.ts`) : chaque table est rangée dans le schéma d'une brique
de la plateforme ou d'un module, chaque module qui conserve des données déclare ses
données personnelles, et les ressources misables dans un duel sont exactement celles du
Village (ADR 0012).

Seule la racine de composition connaît à la fois la plateforme et l'ensemble des modules.

## Parcours d'un duel entre deux modules

Le diagramme suivant présente l'acceptation d'un défi, puis la fin du duel. Il traverse le Duel,
la boîte d'envoi de la plateforme et le Village (ADR 0011). Chaque rectangle `Note` est une
transaction locale à un module.

```mermaid
sequenceDiagram
  autonumber
  actor Bob as Bob (adversaire)
  participant API as API du Duel
  participant Duel as Service du Duel
  participant Journal as Journal et boîte d'envoi
  participant Distrib as Distributeur
  participant Village as Gestionnaire du Village

  Bob->>API: POST /api/duel/duels/:id/accept
  API->>Duel: accept(duel, Bob)
  Duel->>Journal: ChallengeAccepted + message realm.withdraw (mise de Bob)
  Note over Duel,Journal: une transaction : événement et message
  Duel->>Distrib: dispatch()
  Distrib->>Village: realm.withdraw (d1:stake-opponent)
  alt stock suffisant
    Village->>Journal: ResourcesWithdrawn + réponse « withdrawn »
  else stock insuffisant
    Village->>Journal: WithdrawalRefused + réponse « refused »
  end
  Distrib->>Duel: duel.stake-result
  alt mise prélevée
    Duel->>Journal: DuelStarted
  else mise refusée : compensation
    Duel->>Journal: ChallengeCancelled + realm.deposit (d1:refund-challenger)
    Distrib->>Village: realm.deposit : la mise d'Alice lui est rendue
  end
  Duel-->>API: vue du duel, état stable suivant
  API-->>Bob: 200, vue du duel

  Note over Bob,Village: ... manches simultanées, résolues par les passes ou leur échéance ...

  Duel->>Journal: RoundResolved + DuelEnded + realm.deposit (d1:payout, deux mises)
  Distrib->>Village: realm.deposit au vainqueur
  Journal-->>Bob: canal du duel : RoundResolved, DuelEnded (sans données)
```

Une réponse ou un versement remis deux fois n'ont d'effet qu'une fois : l'identifiant du
mouvement, déterminé par le duel et l'étape, sert de clé d'idempotence au Village, et le Duel
ignore une réponse qui ne correspond pas à l'étape en cours.

## Extraction du Village

Le Village peut s'exécuter dans un service autonome, distinct de l'application serveur
(ADR 0009). Cette configuration n'est utilisée qu'en local, lorsque les variables
`REALM_SERVICE_URL` et `SERVICE_SECRET` sont définies ; elle n'est pas déployée.

```mermaid
flowchart LR
  web["Interface web"] -->|"/api/realm"| app["Application serveur<br/>passerelle et module distant"]
  app -->|"requêtes du joueur, messages de la saga,<br/>export et effacement (secret partagé)"| village["Service Village<br/>[Hono, Node.js, port 4000]<br/>src/services/village"]
  village -->|"réponses de la saga<br/>(/api/internal/messages)"| app
  app -->|"relais du flux publié<br/>(GET /events)"| village
  app --- base[("Base de l'application<br/>.data/pglite")]
  village --- base2[("Base du service<br/>.data/village")]
```

L'application reçoit alors une version distante du module Village (`remote.ts`), de même
forme que la version exécutée dans le processus : le reste de l'application ne voit pas la
différence. Le relais recopie les événements publiés par le service dans le journal de
l'application, où le Classement et le canal temps réel du village continuent de les lire.
Le service est assemblé par sa propre racine de composition, `src/services/village`, qui
n'utilise le module Village que par son point d'entrée public.

## Niveau 4 - Code

Ce niveau n'est pas dessiné : il est décrit par le code lui-même et par ses tests, que
tout diagramme maintenu à la main ne tarderait pas à contredire.

## Déploiement

```mermaid
flowchart LR
  poste["Poste de développement"] -->|"git push"| github["GitHub<br/>Dépôt royaumes"]
  github -->|"Déclenche"| build["Construction Vercel<br/>verify, db:migrate, next build"]
  build -->|"Migrations<br/>(connexion directe)"| neon[("Neon<br/>Francfort")]
  build -->|"Publie"| fonctions["Fonctions Vercel<br/>Francfort (fra1)"]
  fonctions -->|"SQL<br/>(connexion mutualisée)"| neon
  cron["Tâche planifiée Vercel<br/>chaque jour à 4 h UTC"] -->|"GET /api/cron/daily<br/>(secret CRON_SECRET)"| fonctions
```

Chaque envoi sur la branche `main` déclenche un déploiement. Le code n'est publié que si
l'ensemble des contrôles a réussi, et les migrations ne sont appliquées qu'après ces contrôles.

La tâche planifiée, déclarée dans `vercel.json`, exécute chaque jour les tâches quotidiennes :
la distribution des messages restés en attente dans la boîte d'envoi, et l'application des
durées de conservation de la Taverne. Elle ne s'exécute que sur le déploiement de production.

Le service Village extrait n'est pas déployé : en production, le Village s'exécute dans
les fonctions Vercel, comme les autres modules (ADR 0009).