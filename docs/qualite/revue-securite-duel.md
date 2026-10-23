# Revue de sécurité du Duel : équité du combat et intégrité des mises

- Date : 2026-10-23
- Périmètre : API du module Duel (`/api/duel`), gestionnaire des réponses du Village, saga des
  mises, canal temps réel `duel-<identifiant>`, contributeur de données personnelles.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and
  Data Integrity Failures) ; ADR 0010, 0011 et 0012.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| U1 | Toutes les routes du Duel sont réservées aux joueurs connectés | Test « refuse une requête anonyme (401) » de `duel-api.test.ts` ; `requireUser('/duel/*')` dans `create-api.ts` | Les routes de liste, de défi et d'entraînement renvoient 401 sans session ; l'intergiciel couvre tout le préfixe | Conforme |
| U2 | Un joueur n'agit qu'en son propre nom | Lecture de `api.ts` : le joueur est toujours `c.var.userId` ; `opponentId` désigne la cible du défi, jamais l'auteur d'une action | Aucune route n'accepte l'identifiant de l'auteur ; l'adversaire désigné doit accepter lui-même le défi | Conforme |
| U3 | La vue et les commandes d'un duel sont réservées à ses deux duellistes | Test « réserve la vue et les commandes d'un duel à ses duellistes » | Un tiers reçoit 404 sur la vue et la commande d'échéance (le duel ne lui est pas révélé), 403 sur l'acceptation ; le lanceur ne peut pas accepter son propre défi, l'adversaire ne peut pas l'annuler | Conforme |
| U4 | La passe d'un duelliste reste cachée à son adversaire jusqu'à la résolution de la manche | Test « règle 11 » de `view.test.ts` ; test « refuse une seconde passe pour la même manche » de l'API ; outils de développement du navigateur | La vue de l'adversaire indique seulement `ready: true` et `move: null` ; la passe n'apparaît dans aucune réponse avant la résolution | Conforme |
| U5 | Le canal d'un duel n'est accessible qu'à ses duellistes, et ne transmet aucune donnée d'événement | Tests « réserve le canal d'un duel à ses duellistes (403) » et « signale la résolution des manches sans révéler les passes » de `duel-realtime.test.ts` | Un tiers reçoit 403 ; le flux transmet `MoveChosen` et `RoundResolved` sans leurs données | Conforme |
| U6 | Toutes les entrées sont validées : mise (ressources connues, entiers de 10 à 500), passe, manche, adversaire | Test « valide le corps des requêtes (400) » ; tests « règle 1 » de `rules.test.ts` ; envoi d'une mise `{ "iron": 50 }` et d'une passe `fuir` | Les schémas `ChallengeInput` et `ChooseMoveInput` refusent ces entrées (400) ; le domaine revérifie la mise (`isValidStake`) indépendamment de l'API | Conforme |
| U7 | Aucun duel ne crée ni ne détruit de ressources, y compris en cas de refus d'une mise | Tests « joue un duel complet, et verse les deux mises au vainqueur » et « rend sa mise au joueur qui a lancé le défi, si l'adversaire n'a pas les ressources » | La somme des stocks est conservée ; la compensation rend la première mise lorsque la seconde est refusée | Conforme |
| U8 | Une réponse du Village remise plusieurs fois n'a d'effet qu'une fois | Test « ignore une réponse du Village en double, ou qui ne correspond pas à l'étape en cours » ; identifiants de mouvement `<duel>:<étape>` | Une réponse en double ou tardive ne produit aucun événement ; le Village ignore un mouvement déjà traité | Conforme |
| U9 | Aucun joueur ne peut provoquer un mouvement de ressources hors d'un duel | Lecture des routes : seuls les événements du domaine produisent des messages, par `requestsFor` ; le sujet `duel.stake-result` n'est accessible qu'au distributeur | Aucune route ne prend de quantité à verser ; les montants viennent toujours de la mise enregistrée | Conforme |
| U10 | Un joueur ne peut ni choisir ni prévoir les choix du maître d'armes | Lecture de `duel-service.ts` : graine tirée par le serveur ; test « ne transmet pas la graine » de `view.test.ts` | La graine n'est jamais transmise ; le maître d'armes décide au moment de la résolution | Conforme |
| U11 | Les échéances sont appréciées par l'horloge du serveur | Test « règle 5 » : acceptation possible une milliseconde avant l'échéance, refusée à l'échéance ; commande d'échéance envoyée trop tôt | Une commande d'échéance anticipée n'enregistre rien ; l'expiration est datée de son échéance, pas de sa constatation | Conforme |
| U12 | Un joueur ne participe qu'à un seul duel actif à la fois (règle 3) | Test « refuse un défi à un joueur qui a déjà un duel actif (409) » ; deux défis lancés simultanément au même joueur | Conforme dans le cas séquentiel ; deux défis strictement simultanés peuvent passer tous les deux (DT-011) | Risque accepté |
| U13 | Un défi ne peut immobiliser les ressources d'un joueur au profit d'un adversaire inexistant | Défi lancé à un identifiant inventé | Le défi est enregistré, la mise immobilisée dix minutes puis rendue (DT-012) ; aucune ressource n'est perdue | Risque accepté |
| U14 | L'export et l'effacement couvrent les données du Duel | Tests « exporte les duels du joueur, sans le nom ni les passes de son adversaire » et « remplace le nom du joueur effacé dans les événements des duels » | L'export ne contient que les passes du joueur ; l'effacement réécrit son nom dans les événements et dans `duel.active_duels` | Conforme |

## Synthèse

Sur quatorze exigences, douze sont conformes et deux sont en risque accepté. Aucune n'est non
conforme.

Les deux risques acceptés ne peuvent ni créer ni détruire de ressources : ils n'affectent que la
disponibilité d'un joueur (U12) ou l'immobilisation temporaire d'une mise (U13). Ils sont
consignés au registre de la dette :

- **DT-011** : la règle 3 n'est pas garantie par une transaction. Action décidée : si une
  violation est constatée, introduire un flux de disponibilité par joueur, soumis à la
  concurrence optimiste (ADR 0010, alternatives).
- **DT-012** : l'adversaire n'est pas vérifié. Action décidée : vérifier son existence avant
  l'enregistrement du défi, par le langage publié du Classement ou un contrat du Village.

Aucune autre action n'est ouverte.
