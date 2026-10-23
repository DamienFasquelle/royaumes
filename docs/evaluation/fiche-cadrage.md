# Fiche de cadrage : Les Duels

- Auteur : Damien Fasquelle
- Date : 2026-10-23
- Nom technique du module : `duel`
- Validée par l'enseignant le :

## L'idée

Un joueur défie un autre joueur en duel, en mettant en jeu des ressources de
son village : du bois, de la pierre ou de l'or, seuls ou combinés. L'adversaire
peut accepter, en engageant la même mise, ou refuser. Le duel se joue en manches
simultanées : à chaque manche, chaque duelliste choisit en secret une passe d'armes,
**attaquer**, **se défendre**, **contrer** ou **se soigner**, puis les deux passes sont
révélées et résolues.
Le premier dont les points de vie tombent à zéro perd ; le vainqueur remporte les deux
mises.

Un joueur peut aussi s'entraîner contre le **maître d'armes**, un adversaire piloté par
l'ordinateur, sans mise.

Le module donne aux joueurs un usage de leurs ressources tourné vers les autres joueurs, dès
la fondation de leur village, qui dispose de bois et de pierre. Il
introduit aussi un affrontement direct entre joueurs, alors que le Donjon est coopératif.

## Les règles métier

1. La mise comporte au moins une ressource parmi le bois, la pierre et l'or, et aucune autre ;
   la quantité de chaque ressource mise en jeu est un nombre entier compris entre 10 et 500.
   L'adversaire engage exactement la même mise.
2. Un joueur ne peut pas se défier lui-même.
3. Un joueur a au plus un duel actif à la fois : un défi en attente de réponse, ou un duel
   en cours, qu'il l'ait lancé ou reçu.
4. Seul l'adversaire désigné peut accepter ou refuser un défi. Seul le joueur qui a lancé
   le défi peut l'annuler, et seulement tant que le défi n'a pas été accepté.
5. Un défi qui n'a pas reçu de réponse 10 minutes après son lancement expire.
6. La mise du joueur qui lance le défi est prélevée sur son village au lancement. Si le
   prélèvement est refusé, faute de ressources suffisantes, le défi est annulé.
7. La mise de l'adversaire est prélevée sur son village lorsqu'il accepte. Si ce
   prélèvement est refusé, le duel est annulé et la mise du joueur qui a lancé le défi
   lui est rendue : c'est l'étape de compensation.
8. Un défi refusé, annulé ou expiré rend sa mise au joueur qui l'a lancé.
9. Chaque duelliste commence avec 30 points de vie, qui ne peuvent jamais dépasser 30. Un
   duel compte au plus 12 manches.
10. À chaque manche, chaque duelliste choisit une passe, une seule fois, pour la manche en
    cours seulement.
11. La passe d'un duelliste reste cachée à son adversaire tant que les deux passes de la
    manche n'ont pas été choisies, ou que la manche n'est pas échue.
12. Les passes sont résolues selon le tableau suivant. L'attaque interrompt le soin ; la
    défense réduit l'attaque ; le contre renvoie l'attaque, mais déséquilibre celui qui
    contre une garde (défense ou contre) ; le soin profite d'une manche où l'adversaire
    n'attaque pas, et ne fait jamais perdre de points de vie à l'adversaire. Chaque manche
    enregistre ses effets (dégâts infligés, soins reçus), présentés aux deux duellistes.

    | Passe A | Passe B | Effet sur A | Effet sur B |
    | --- | --- | --- | --- |
    | attaquer | attaquer | −6 | −6 |
    | attaquer | se défendre | — | −2 |
    | attaquer | contrer | −8 | — |
    | attaquer | se soigner | — | −6, le soin est annulé |
    | se défendre | se défendre | — | — |
    | se défendre | contrer | — | −2 (déséquilibre) |
    | se défendre | se soigner | — | +5 |
    | contrer | contrer | −2 | −2 |
    | contrer | se soigner | — | +5 |
    | se soigner | se soigner | +5 | +5 |

13. Un duelliste peut se soigner au plus 3 fois par duel. Au-delà, la passe « se soigner »
    est refusée.
14. Une manche dure 20 secondes. Un duelliste qui n'a pas choisi de passe à l'échéance est
    réputé s'être défendu. Un duelliste qui manque deux manches consécutives perd le duel
    par abandon ; si les deux abandonnent à la même manche, le duel est nul.
15. Le duel se termine dès que les points de vie d'un duelliste tombent à zéro ou moins,
    ou à l'issue de la 12e manche. Le duelliste qui a le plus de points de vie gagne. Si
    les deux tombent à zéro à la même manche, ou finissent à égalité de points de vie, le
    duel est nul.
16. Le vainqueur reçoit les deux mises sur son village. En cas de duel nul, chacun
    récupère sa mise.
17. Le duel d'entraînement contre le maître d'armes se joue sans mise et ne rapporte rien.
    Le maître d'armes choisit ses passes de façon déterministe, à partir de l'historique
    des passes de son adversaire : il répond à la passe la plus fréquente de celui-ci
    (contrer une attaque, se soigner contre une défense ou un contre, attaquer un soin).
    Une égalité de fréquence est départagée par la graine du duel. S'il ne peut plus se
    soigner, il se défend.

## Les commandes et les lectures

Toutes les routes sont préfixées par `/api/duel`. Elles sont réservées aux joueurs
connectés, et le joueur qui agit est toujours le joueur connecté.

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Voir ses défis reçus et envoyés, et son duel en cours | Lecture | `GET /api/duel/duels` |
| Défier un joueur | Commande `challenge` | `POST /api/duel/duels` (`{ opponentId, stake }`) |
| S'entraîner contre le maître d'armes | Commande `train` | `POST /api/duel/training` |
| Consulter un duel, réservé à ses deux duellistes | Lecture | `GET /api/duel/duels/:id` |
| Accepter un défi | Commande `accept` | `POST /api/duel/duels/:id/accept` |
| Refuser un défi | Commande `decline` | `POST /api/duel/duels/:id/decline` |
| Annuler son défi | Commande `cancel` | `POST /api/duel/duels/:id/cancel` |
| Choisir sa passe | Commande `strike` | `POST /api/duel/duels/:id/move` (`{ round, move }`) |
| Signaler l'échéance d'une manche ou d'un défi | Commande `deadline` | `POST /api/duel/duels/:id/deadline` |

## Le stockage envisagé

**Le journal d'événements**, selon le modèle decider, avec un flux par duel
(`duel-<id>`) et la concurrence optimiste du journal.

Raison principale : un duel est une suite d'actions ordonnées dans le temps, comme une
expédition du Donjon (`ChallengeIssued`, `StakeReserved`, `ChallengeAccepted`,
`MoveChosen`, `RoundResolved`, `DuelEnded`…). Son historique a une valeur de jeu : il
permet de rejouer un duel, et de construire un palmarès. Les deux duellistes peuvent
choisir leur passe au même instant ; la concurrence optimiste du journal tranche ce cas
sans verrou.

## La communication avec les modules existants

- **Le Village (`realm`), par des messages de la boîte d'envoi**, dans les deux sens, en
  réutilisant le langage publié du Village (`REALM_TOPICS`) :
  - le Duel envoie `realm.withdraw` pour prélever chaque mise, avec un sujet de réponse
    propre au Duel (`duel.stake-result`), traité par un gestionnaire idempotent du module ;
  - le Duel envoie `realm.deposit` pour verser les gains au vainqueur, ou rendre les mises
    (défi refusé, annulé ou expiré, duel nul, compensation de la règle 7).

  L'enchaînement « prélever la mise du joueur qui lance le défi, puis celle de
  l'adversaire, et rendre la première si la seconde est refusée » forme une **saga**,
  comme l'échange du Marché au TD9. Chaque mouvement porte un identifiant dérivé du duel
  et de l'étape (`<duelId>:stake:<playerId>`, `<duelId>:payout:<playerId>`), afin que le
  Village écarte les doublons.

Aucun fichier interne d'un autre module n'est importé. Le module n'utilise que
`@/modules/realm/contracts`. Le Village n'a pas à être modifié, puisqu'il sait déjà
traiter ces deux sujets.

## Les données personnelles

- Le nom des deux duellistes, copié dans les événements du duel (`ChallengeIssued`,
  `TrainingStarted`, `ChallengeAccepted`), comme dans le Donjon. Le nom de l'adversaire n'est
  enregistré qu'à son acceptation du défi, à partir de sa session.
- L'historique des duels du joueur : adversaire, mise, passes jouées, résultat, dates.

L'export présente les duels du joueur. L'effacement réécrit son nom dans les événements
par le nom d'effacement de la plateforme, sans supprimer les duels : ils font partie de
l'historique de l'adversaire. Ce choix sera justifié dans l'ADR et dans le registre des
traitements.

## Les bonus visés

Par ordre de priorité :

1. **B5 - Saga avec étape compensable (+2)** : prélèvement des deux mises auprès du
   Village, et remboursement du joueur qui a lancé le défi si la mise de l'adversaire est
   refusée (règle 7).
2. **B2 - Échéance gérée sans tâche de fond (+1)** : expiration des défis et échéance des
   manches, évaluées lors des lectures et par la route `deadline`, comme au TD6.
3. **B1 - Canal temps réel propre au module (+1)** : canal `duel-<id>`, réservé aux deux
   duellistes, qui annonce les passes choisies (sans les révéler) et la résolution des
   manches.
4. **B3 - Personnage piloté par l'ordinateur (+1)** : le maître d'armes, à la stratégie
   déterministe et testée (règle 17).
5. **B4 - Projection (+1)**, si le temps le permet : un palmarès des duels (victoires,
   défaites, nuls, ressources gagnées), avec son point de reprise et sa version.
