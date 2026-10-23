# TD final - Évaluation : un module de votre invention

## Objectifs

Cette évaluation vous demande de démontrer, sur un projet que vous connaissez désormais en détail, que vous êtes capable :

- de concevoir un module original et de l'intégrer à une architecture existante, sans en enfreindre les règles ;
- de choisir, pour ce module, le modèle de stockage et le mode de communication adaptés, et de justifier ces choix ;
- de faire évoluer un système en production sans dégrader ce qui fonctionne déjà ;
- de piloter techniquement votre travail avec les outils du module : ADR, documentation d'architecture, registre de la dette, revues et bilan technique.

## Partie 1 - Le cadre de l'évaluation

### 1.1 Ce qui est évalué

Vous ajoutez à Royaumes un module de votre invention. Ce peut être une nouvelle fonctionnalité de jeu, ou un service rendu aux joueurs. Ce module est conçu, réalisé, testé, déployé et documenté comme l'ont été la Taverne et le Marché au cours des TD.

L'évaluation porte sur trois volets.

| Volet | Question posée | Points |
| --- | --- | --- |
| Le nouveau module | Le module respecte-t-il les exigences minimales, et l'architecture du projet ? | 7 |
| Le pilotage technique | Les décisions sont-elles consignées, et la documentation est-elle à jour ? | 5 |
| Le socle maintenu | Le projet existant fonctionne-t-il toujours, et le dépôt est-il tenu ? | 3 |
| **Total du socle de la note** |  | **15** |
| Points bonus | Le module va-t-il au-delà du minimum ? | jusqu'à 5 |

Un travail qui réalise l'ensemble des exigences minimales avec soin obtient une bonne note, de l'ordre de 14 à 15 sur 20. Les points bonus récompensent les travaux plus ambitieux. La note finale est plafonnée à 20.

L'évaluation ne demande aucune notion nouvelle. Tout ce qui est exigé a été réalisé au cours des TD, et chaque exigence de cet énoncé renvoie au TD où la notion a été mise en œuvre. Les supports des TD sont votre référence : la qualité attendue est celle de leur code et de leurs documents.

Le travail est individuel.

### 1.2 Le déroulement et le rendu

L'évaluation se déroule en deux temps.

| Temps | Contenu |
| --- | --- |
| Séance en autonomie, sous la supervision de l'enseignant | Rédaction et validation de la fiche de cadrage, puis début de la réalisation |
| Travail personnel, jusqu'à la date de rendu | Réalisation, tests, déploiement et documentation |

Pendant la séance en autonomie, l'enseignant répond aux questions d'architecture et valide votre fiche de cadrage. Il ne corrige pas votre code à votre place.

**Date limite de rendu :** ______________________

Le rendu est votre dépôt GitHub, portant l'étiquette `eval-fin`, et votre application déployée sur Vercel. Aucun autre support n'est attendu : tous les documents figurent dans le dépôt. La partie 6 précise le contenu du rendu.

Vous partez de votre propre dépôt, à l'étiquette `td11-fin`. Avant toute modification, vérifiez que votre projet est dans l'état attendu :

```bash
git status
git describe --tags
pnpm install
pnpm verify
```

La commande `git status` ne doit présenter aucune modification en attente, et `pnpm verify` doit réussir. Si ce n'est pas le cas, corrigez d'abord votre projet : l'évaluation suppose un socle sain.

### 1.3 L'usage de l'IA générative

L'usage d'outils d'IA générative, assistants de code ou de rédaction, est autorisé. Il doit être déclaré.

La déclaration se fait à deux endroits, que vous connaissez déjà :

- dans la rubrique « Usage de l'IA générative » de chacun de vos ADR, pour la décision qu'il consigne ;
- dans la section « Usage de l'IA générative » du document de rendu, présenté en 6.1, pour l'ensemble du travail.

Chaque déclaration indique l'outil utilisé, la nature de sa contribution, et la manière dont vous avez vérifié le résultat. Indiquez « Aucun » le cas échéant.

Vous êtes responsable de tout ce qui figure dans votre dépôt, quelle qu'en soit l'origine. Un code que vous ne comprenez pas, ou un document qui décrit autre chose que ce que fait le code, sera évalué comme tel. La cohérence entre le code, les tests et les documents est l'un des premiers points vérifiés à la correction.

## Partie 2 - Choisir et cadrer son idée

### 2.1 Des idées de départ

L'idée vous appartient. Elle doit cependant s'intégrer à l'univers du jeu, et communiquer avec au moins un module existant. Les idées suivantes sont des points de départ ; vous pouvez en retenir une, la transformer, ou en proposer une autre.

| Idée | Principe | Ce qu'elle mobilise naturellement |
| --- | --- | --- |
| La Forge | Le joueur fabrique des objets à partir de recettes, en consommant des ressources de son village | Saga avec le Village (TD9), Event Sourcing (TD3) |
| Les Quêtes | Chaque jour, le joueur reçoit des objectifs, réalisés par ses actions dans les autres modules | Lecture du langage publié (TD8), tâche quotidienne (TD10) |
| Les Enchères | Un joueur met en vente des ressources ; les autres enchérissent jusqu'à une échéance | Échéance paresseuse (TD6), temps réel (TD5), saga (TD9) |
| Les Guildes | Les joueurs forment des groupes, avec un classement collectif | Projection (TD8), données personnelles (TD10) |
| Les Hauts faits | Des distinctions attribuées automatiquement lorsqu'un joueur atteint certains seuils | Projection alimentée par les événements des autres modules (TD8) |
| Le Tournoi | Des affrontements organisés entre joueurs, ou contre des adversaires pilotés par l'ordinateur | Manches simultanées (TD6), IA déterministe (TD7) |
| La Caravane | Le joueur envoie une caravane de ressources vers un autre village ; elle arrive au bout d'un délai, ou se fait attaquer | Saga avec compensation (TD9), échéance (TD6) |
| Les Notifications | Un service qui présente au joueur un fil d'avertissements : offre acceptée, expédition terminée, message reçu | Lecture du langage publié (TD8), temps réel (TD5), conservation limitée (TD10) |

Une bonne idée d'évaluation n'est pas la plus grande possible. C'est une idée dont le cœur peut être réalisé entièrement, testé et documenté avant la date de rendu, et qui laisse de la place pour des bonus. Préférez un module simple et achevé à un module ambitieux et inachevé : seul le second est pénalisé.

### 2.2 La fiche de cadrage

La fiche de cadrage décrit votre idée avant toute réalisation. Elle engage le périmètre de votre travail : c'est par rapport à elle que la correction vérifie que le module fait ce qu'il annonce.

Créez le répertoire `docs/evaluation/` et le fichier `docs/evaluation/fiche-cadrage.md` :

```bash
mkdir -p docs/evaluation
```

```markdown
# Fiche de cadrage : <nom du module>

- Auteur :
- Date :
- Nom technique du module : `<nom>` (en anglais, comme `realm`, `dungeon` ou `market`)
- Validée par l'enseignant le :

## L'idée

En quelques phrases : ce que le joueur peut faire, et pourquoi c'est intéressant dans le jeu.

## Les règles métier

Les règles que le domaine du module devra faire respecter, numérotées. Chacune devra
être vérifiée par au moins un test.

1.
2.
3.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| | | |

## Le stockage envisagé

Journal d'événements ou tables classiques, et la raison principale de ce choix.

## La communication avec les modules existants

Le ou les modules concernés, le sens de la communication, et le moyen : messages par la
boîte d'envoi, ou lecture du langage publié.

## Les données personnelles

Les données personnelles que le module conservera, ou « aucune ».

## Les bonus visés

Les bonus de la partie 3.2 que vous envisagez, par ordre de priorité. Cette liste
n'engage pas : seuls les bonus réalisés et déclarés au rendu sont comptés.
```

Remplissez la fiche, puis présentez-la à l'enseignant pendant la séance en autonomie. Une fois validée, indiquez la date de validation, puis enregistrez-la :

```bash
git add docs/evaluation
git commit -m "docs(evaluation): fiche de cadrage du module"
```

Si votre périmètre change de manière significative après la validation, par exemple si vous abandonnez une règle métier ou changez de module partenaire, mettez la fiche à jour, et signalez-le à l'enseignant. Une fiche qui ne correspond plus au rendu est un défaut de pilotage.

## Partie 3 - Le nouveau module

### 3.1 Les exigences minimales

Le module doit respecter chacune des exigences suivantes. Elles composent ensemble le volet « Le nouveau module » de la grille.

| N° | Exigence | Référence |
| --- | --- | --- |
| E1 | Le module est un répertoire `src/modules/<nom>/`, découpé comme les modules existants : un domaine pur, une couche application, une couche infrastructure, une API, et les entrées publiques `index.ts`, `contracts.ts` et `ui.tsx` | TD2 |
| E2 | Le module est assemblé par la racine de composition `src/bootstrap/create-api.ts`, et sa page est accessible depuis la navigation du jeu | TD2, TD4 |
| E3 | Le domaine porte les règles métier de la fiche de cadrage, sous la forme de fonctions pures, sans dépendance technique | TD1, TD2 |
| E4 | Le module conserve ses données soit dans le journal d'événements, selon le modèle decider, soit dans des tables classiques rangées dans son propre schéma de base, qui porte le nom technique du module et dont les tables sont créées par une migration | TD3, TD10 |
| E5 | Toutes les routes du module sont réservées aux joueurs connectés ; un joueur n'agit jamais qu'en son propre nom ; toutes les entrées sont validées | TD4 |
| E6 | Le module communique avec au moins un module existant : par des messages de la boîte d'envoi, comme le Marché avec le Village, ou par la lecture de son langage publié, comme le Classement | TD8, TD9 |
| E7 | Le module déclare ses données personnelles par un contributeur `personal-data.ts`, pris en compte par l'export et l'effacement d'un compte | TD10 |
| E8 | Chaque règle métier de la fiche est vérifiée par au moins un test du domaine, et chaque route par au moins un test de l'API | TD1 à TD11 |
| E9 | Les règles de dépendance et les fonctions d'aptitude du projet sont respectées, sans modification de leur configuration pour les contourner | TD2, TD11 |
| E10 | Le module fonctionne sur le déploiement de production, migrations appliquées | TD5 |

Quelques précisions sur ces exigences.

**E4.** Le choix du stockage n'est pas noté pour lui-même : les deux modèles sont acceptés. Ce qui est évalué est la cohérence entre ce choix, la nature des données du module, et la justification qu'en donne votre ADR. Le TD10 a montré qu'un module dont les données sont destinées à disparaître se prête mal à l'Event Sourcing ; inversement, un module dont l'historique a une valeur de jeu s'y prête bien. Si vous retenez des tables classiques, déclarez-les dans `src/modules/<nom>/infrastructure/schema.ts`, emplacement que lit `drizzle-kit`, puis produisez la migration par `pnpm db:generate --name <nom>`, comme au TD10.

**E6.** Si votre module doit recevoir des messages d'un autre module, ou si un module existant doit traiter un message du vôtre, la modification du module existant est autorisée. Elle doit alors passer par ses contrats, comme l'ont fait le Marché et le Village au TD9 : de nouveaux sujets dans `contracts.ts`, de nouveaux gestionnaires dans le module concerné. Les gestionnaires restent idempotents.

**E8.** Le nombre de tests n'est pas imposé. Ce qui est évalué est la correspondance entre les règles de la fiche et les tests : la correction prend chaque règle, et cherche le test qui la vérifie.

**E9.** Une fonction d'aptitude qui échoue signale un défaut de votre module, et non de la fonction. Par exemple, la fonction « déclare les données personnelles de chaque module qui conserve des données » échouera tant que votre contributeur n'est pas déclaré : c'est le comportement attendu.

### 3.2 Aller plus loin : les points bonus

Au-delà des exigences minimales, chacun des éléments suivants rapporte des points bonus. Vous composez librement votre module : un jeu riche en mécanismes peut atteindre le plafond sans recourir à l'extraction d'un service, et inversement.

**Les notions des TD**

| Bonus | Points | Référence |
| --- | --- | --- |
| B1 - Un canal temps réel propre au module, avec sa règle d'accès | +1 | TD5 |
| B2 - Une échéance gérée sans tâche de fond, ou une tâche quotidienne propre au module | +1 | TD6, TD10 |
| B3 - Des personnages pilotés par l'ordinateur, selon une IA déterministe et testée | +1 | TD7 |
| B4 - Un modèle de lecture tenu par une projection, avec son point de reprise et sa version | +1 | TD8 |
| B5 - Une saga avec au moins une étape compensable, entre le module et un module existant | +2 | TD9 |
| B6 - Une communication avec au moins deux modules existants | +1 | TD8, TD9 |
| B7 - Un test de charge portant sur les lectures du module, dont les résultats respectent le budget de performance | +1 | TD11 |
| B8 - Une nouvelle fonction d'aptitude ou règle de dependency-cruiser, qui protège une propriété de votre module | +1 | TD11 |
| B9 - L'extraction du module en service autonome, avec ses tests de contrat | +2 | TD11 |

**Les pistes de « Pour approfondir »**

Chaque piste de la rubrique « Pour approfondir » d'un TD, réalisée et appliquée au projet, rapporte un point. Elle doit apporter quelque chose au projet, et pas seulement être essayée à part. Par exemple :

| Bonus | Points | Référence |
| --- | --- | --- |
| B10 - Des tests de bout en bout de l'interface, avec Playwright, qui couvrent au moins un parcours de votre module | +1 | TD11 |
| B11 - Le droit de rectification : un joueur peut modifier son nom | +1 | TD10 |
| B12 - Un jeton signé, à la place du secret partagé, pour les échanges entre services | +1 | TD11 |
| B13 - Toute autre piste de « Pour approfondir », déclarée au rendu avec le TD dont elle provient | +1 | TD1 à TD11 |

Le total des bonus est plafonné à 5 points.

### 3.3 Les conditions d'attribution des bonus

Un bonus n'est attribué que si les cinq conditions suivantes sont réunies.

1. **Le minimum est atteint.** Les exigences E1 à E10 sont toutes satisfaites. Un bonus ne compense pas une exigence manquante.
2. **Le projet est vert.** La commande `pnpm verify` réussit sur le dépôt rendu.
3. **Le bonus est testé.** Au moins un test vérifie le comportement qu'il apporte.
4. **Le bonus est documenté.** Il figure dans la documentation d'architecture ou le README, et fait l'objet d'un ADR s'il relève d'une décision d'architecture : une saga, une projection, une extraction.
5. **Le bonus est déclaré.** Il figure dans le document de rendu, avec les fichiers et les tests qui le prouvent.

Un bonus inachevé, cassé ou non testé ne rapporte aucun point. Il peut même en coûter, s'il dégrade le socle : une fonctionnalité existante cassée par un bonus est évaluée dans le volet « Le socle maintenu ».

## Partie 4 - Maintenir le socle

### 4.1 Ce qui doit rester vrai à chaque commit

Votre module s'ajoute à un système qui fonctionne, et que des joueurs utilisent. Ce système doit continuer de fonctionner pendant toute votre évaluation, et non seulement au moment du rendu.

| Règle | Vérification |
| --- | --- |
| La commande `pnpm verify` réussit | Exécution sur le dépôt rendu, et sur l'historique des commits |
| Aucun test existant n'est supprimé, désactivé ou affaibli pour faire réussir la vérification | Comparaison avec l'étiquette `td11-fin` |
| Les fonctionnalités existantes fonctionnent en production : Village, Donjon, Classement, Marché, Taverne et données personnelles | Parcours sur le déploiement |
| Aucun secret n'est versionné, et le répertoire `.data/` ne l'est pas | `git ls-files .data`, recherche des secrets dans l'historique |
| Les messages de commit respectent Conventional Commits, et l'historique montre une construction progressive | `git log --oneline td11-fin..eval-fin` |

La comparaison avec l'étiquette `td11-fin` s'obtient ainsi :

```bash
git diff --stat td11-fin -- src
git log --oneline td11-fin..HEAD
```

Un commit qui laisse le projet dans un état où `pnpm verify` échoue n'est pas une faute en soi pendant le développement local. Mais chaque envoi sur la branche `main` déclenche un déploiement, qui n'aboutit que si la vérification réussit : un envoi qui échoue laisse la production sur la version précédente. Exécutez `pnpm verify` avant chaque `git push`.

### 4.2 Faire évoluer l'existant sans le casser

Votre module modifiera nécessairement quelques fichiers existants : la racine de composition, la navigation, peut-être les contrats et les gestionnaires d'un module partenaire. Ces modifications sont attendues. Elles obéissent aux mêmes règles que celles des TD.

- **Les modifications sont minimales.** Ne modifiez un fichier existant que si votre module l'exige, et ne réorganisez pas le code des autres modules.
- **Les frontières sont respectées.** Un module existant n'est utilisé que par ses entrées publiques. Si vous avez besoin d'une information qu'aucun contrat n'expose, ajoutez-la au contrat, plutôt que d'importer un fichier interne.
- **Les migrations ne modifient pas les tables des autres modules.** Votre migration crée les tables de votre module, dans son propre schéma, et rien d'autre.
- **Les projections existantes conservent leur version, sauf nécessité.** Si vous modifiez une projection existante, par exemple pour que le Classement tienne compte de votre module, augmentez sa version, comme au TD8, afin qu'elle soit reconstruite.

Si une modification de l'existant vous paraît nécessaire, mais contraire à l'une de ces règles, c'est une décision d'architecture : consignez-la dans un ADR, avec ses conséquences et les alternatives que vous avez écartées.

## Partie 5 - Le pilotage technique

### 5.1 Les décisions d'architecture

Rédigez au moins deux ADR, numérotés à la suite des vôtres à partir de 0010, avec le modèle `docs/adr/template.md`. Toutes les rubriques du modèle sont renseignées, y compris « Usage de l'IA générative ».

| ADR | Contenu attendu |
| --- | --- |
| Le module et son stockage | Le besoin, le choix entre le journal d'événements et les tables classiques, ses conséquences, les alternatives écartées |
| La communication avec les modules existants | Le choix entre messages et lecture du langage publié, les garanties obtenues (livraison au moins une fois, idempotence, cohérence différée), les alternatives écartées |

Chaque bonus qui relève d'une décision d'architecture fait l'objet d'un ADR supplémentaire, ou d'une section explicite dans l'un des deux ADR précédents.

Ajoutez chaque ADR au registre des décisions, `docs/adr/README.md`. Un ADR est évalué sur la qualité de son raisonnement, et non sur sa longueur : un contexte factuel, une décision vérifiable, des conséquences négatives réelles, et des alternatives sérieusement envisagées. Les ADR 0007 et 0008 du projet servent de référence.

### 5.2 La documentation du système

Mettez à jour la documentation existante, comme à la fin de chaque TD.

**`docs/architecture.md`.**

- Le diagramme des conteneurs présente le schéma de base de votre module, s'il en a un.
- Le diagramme des composants présente votre module et ses dépendances.
- Un paragraphe décrit la communication de votre module avec les modules existants.
- Un diagramme de séquence, rédigé en Mermaid, présente le parcours d'une opération qui traverse plusieurs modules, comme celui de la partie 4 du TD11.

**`README.md`.**

- Le tableau des modules présente votre module et l'adresse de son API.
- Les sections concernées décrivent ses canaux temps réel, ses données personnelles et ses éventuelles commandes nouvelles.
- La section « Limites actuelles » présente ses limites connues.

Vérifiez le rendu de chaque diagramme Mermaid sur GitHub : un diagramme qui ne s'affiche pas compte comme absent.

### 5.3 La dette, les revues et le bilan technique

**Le registre de la dette.** Consignez dans `docs/qualite/dette-technique.md` chaque raccourci délibéré de votre module, avec ses conséquences et son échéance, et signalez-le dans le code par un commentaire `DETTE TECHNIQUE`. Un module sans aucune dette est possible, mais rare : un registre vide pour un module réalisé en peu de temps sera lu comme une dette non consignée. Vérifiez la correspondance :

```bash
git grep -n "DETTE TECHNIQUE" -- src scripts
```

**La revue de sécurité du module.** Créez le fichier `docs/qualite/revue-securite-<nom>.md`, sur le modèle de la revue de sécurité du Marché. Elle compte au moins huit exigences, propres à votre module. Chacune est dotée d'une vérification précise (un test, une commande ou une manipulation), d'un constat et d'un statut. La synthèse indique les exigences conformes, non conformes ou en risque accepté, et les actions décidées.

**Le registre des traitements.** Si votre module conserve des données personnelles, ajoutez le traitement correspondant à `docs/rgpd/registre-traitements.md` : finalité, données, durée de conservation, mesures de sécurité.

**Le bilan technique.** Mettez à jour `docs/bilan-technique.md` :

- ajoutez vos ADR au tableau des décisions ;
- reportez dans le tableau de la qualité les indicateurs mesurés au rendu, et comparez-les à ceux de l'étiquette `td11-fin` (nombre de tests, couverture, règles d'architecture) ;
- complétez les sections de la dette et des risques en conséquence.

La couverture se mesure comme au TD11 :

```bash
pnpm test:coverage
```

## Partie 6 - Le rendu

### 6.1 Le dépôt et l'étiquette de rendu

Créez le document de rendu, `docs/evaluation/rendu.md` :

```markdown
# Rendu de l'évaluation

- Auteur :
- Module : `<nom>`
- Adresse du déploiement :
- Fiche de cadrage : fiche-cadrage.md

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | | |
| E2 | | |
| E3 | | |
| E4 | | |
| E5 | | |
| E6 | | |
| E7 | | |
| E8 | | |
| E9 | | |
| E10 | | |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| | | | | |

## Écarts avec la fiche de cadrage

Les règles ou fonctionnalités annoncées et non réalisées, ou réalisées autrement, avec
leur raison. Indiquer « Aucun » le cas échéant.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | | |
| Couverture des lignes | | |
| Violations des règles d'architecture | 0 | |

## Usage de l'IA générative

Outils utilisés, nature de leur contribution pour chaque partie du travail (code, tests,
documents), et manière dont les résultats ont été vérifiés. Indiquer « Aucun » le cas échéant.
```

Ce document est le point d'entrée de la correction. Un bonus absent du tableau des bonus revendiqués n'est pas recherché, et n'est pas compté.

Lorsque votre travail est terminé, enregistrez-le, envoyez-le, et attendez que le déploiement apparaisse avec l'état « Ready » dans l'onglet « Deployments » de Vercel. Posez alors l'étiquette de rendu :

```bash
git tag -a eval-fin -m "Rendu de l'évaluation : module <nom>"
git push origin eval-fin
```

Seul l'état du dépôt à l'étiquette `eval-fin` est évalué. Une étiquette posée ou déplacée après la date limite de rendu n'est pas prise en compte. Le dépôt doit rester public, et l'adresse du déploiement doit figurer dans la rubrique « About » du dépôt GitHub.

### 6.2 La liste de contrôle avant le rendu

Avant de poser l'étiquette, exécutez les vérifications suivantes :

```bash
git status
pnpm lint:fix
pnpm verify
pnpm build
git ls-files .data
git grep -n "DETTE TECHNIQUE" -- src scripts
git log --oneline td11-fin..HEAD
```

La commande `git status` ne présente aucune modification en attente ; `pnpm verify` et `pnpm build` réussissent ; `git ls-files .data` n'affiche rien.

Vérifiez ensuite sur le déploiement de production :

1. Votre module fonctionne, à deux joueurs si son principe le demande.
2. Les modules existants fonctionnent toujours : fondez un village, ouvrez une expédition, concluez un échange au Marché, écrivez dans la Taverne.
3. Un compte de test, créé pour l'occasion et ayant utilisé votre module, peut télécharger ses données, qui comprennent celles de votre module, puis être supprimé.

Vérifiez enfin sur GitHub que l'étiquette `eval-fin` est présente, que les diagrammes Mermaid s'affichent, et que tous les documents sont accessibles depuis le README.

## Grille d'évaluation

### Le socle de la note

**Le nouveau module (7 points)**

| Critère | Points | Ce qui est vérifié |
| --- | --- | --- |
| Conformité à la fiche de cadrage | 1 | Le module réalise les règles et les actions annoncées, ou les écarts sont justifiés dans le document de rendu |
| Découpage et frontières | 1,5 | E1, E2, E3, E9 : couches du module, domaine pur, entrées publiques, règles de dépendance et fonctions d'aptitude respectées |
| Stockage | 1 | E4 : modèle appliqué correctement (decider et concurrence optimiste, ou tables dans un schéma propre), cohérent avec l'ADR |
| Communication avec l'existant | 1,5 | E6 : contrats, idempotence des gestionnaires, cohérence des échanges, absence d'import interne d'un autre module |
| Sécurité et données personnelles | 1 | E5, E7 : routes protégées, validation des entrées, contrôle d'accès, contributeur complet (export, réécriture, effacement) |
| Tests | 1 | E8 : chaque règle de la fiche et chaque route sont vérifiées, avec des assertions significatives |

**Le pilotage technique (5 points)**

| Critère | Points | Ce qui est vérifié |
| --- | --- | --- |
| Décisions d'architecture | 1,5 | Au moins deux ADR complets, au raisonnement juste, inscrits au registre |
| Documentation d'architecture et README | 1 | C4 à jour, diagramme de séquence, README à jour, diagrammes affichés |
| Revue de sécurité du module | 1 | Au moins huit exigences pertinentes, vérifications précises, constats et synthèse |
| Registre de la dette | 0,5 | Raccourcis consignés, signalés dans le code, cohérents entre le registre et le code |
| Registre des traitements et bilan technique | 1 | Traitement ajouté le cas échéant ; bilan mis à jour, indicateurs mesurés et comparés |

**Le socle maintenu (3 points)**

| Critère | Points | Ce qui est vérifié |
| --- | --- | --- |
| Projet vert | 1 | `pnpm verify` et `pnpm build` réussissent ; aucun test existant supprimé, désactivé ou affaibli |
| Production intacte | 1 | E10 et fonctionnalités existantes opérationnelles sur le déploiement |
| Tenue du dépôt | 1 | Commits conventionnels et progressifs, aucun secret ni répertoire `.data/` versionné, étiquette `eval-fin` posée, document de rendu complet |

### Le barème des points bonus

| N° | Bonus | Points |
| --- | --- | --- |
| B1 | Canal temps réel propre au module | +1 |
| B2 | Échéance sans tâche de fond, ou tâche quotidienne propre au module | +1 |
| B3 | Personnages pilotés par l'ordinateur, IA déterministe | +1 |
| B4 | Modèle de lecture tenu par une projection | +1 |
| B5 | Saga avec étape compensable | +2 |
| B6 | Communication avec au moins deux modules existants | +1 |
| B7 | Test de charge du module, budget respecté | +1 |
| B8 | Nouvelle fonction d'aptitude ou règle de dépendance | +1 |
| B9 | Extraction du module en service, avec tests de contrat | +2 |
| B10 | Tests de bout en bout de l'interface avec Playwright | +1 |
| B11 | Droit de rectification du nom d'un joueur | +1 |
| B12 | Jeton signé entre services | +1 |
| B13 | Autre piste de « Pour approfondir » | +1 par piste |

Les bonus ne sont attribués que dans les conditions de la partie 3.3. Leur total est plafonné à 5 points, et la note finale à 20.

## Point de contrôle

**Projet**

- La fiche de cadrage est validée par l'enseignant, et correspond au module rendu.
- Le module satisfait les exigences E1 à E10.
- Les fonctionnalités existantes fonctionnent en production.
- Un compte qui a utilisé le module peut exporter ses données, puis être supprimé.

**Qualité**

- La commande `pnpm verify` se termine sans erreur.
- Chaque règle métier de la fiche est vérifiée par un test, et chaque route par un test de l'API.
- Chaque bonus revendiqué est vérifié par au moins un test.
- Aucun test existant n'a été supprimé, désactivé ou affaibli.

**Documentation**

- Au moins deux ADR, numérotés à partir de 0010, sont rédigés et inscrits au registre des décisions.
- Le document d'architecture et le README présentent le module ; les diagrammes s'affichent sur GitHub.
- La revue de sécurité du module compte au moins huit exigences, et sa synthèse est rédigée.
- Le registre de la dette, le registre des traitements et le bilan technique sont à jour.
- Le document de rendu est complet, y compris la déclaration d'usage de l'IA générative.

**Dépôt**

- Aucun secret ni fichier du répertoire `.data/` n'est versionné.
- L'étiquette annotée `eval-fin` est présente sur GitHub, avant la date limite de rendu.
- L'adresse du déploiement figure dans la rubrique « About » du dépôt.