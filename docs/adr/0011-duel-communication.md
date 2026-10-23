# ADR-0011 - Le Duel et le Village : saga des mises par la boîte d'envoi

- Statut : accepté
- Date : 2026-10-23

## Contexte

Un duel met en jeu des ressources (bois, pierre ou or, seuls ou combinés) que conservent les
villages des deux duellistes. Le Duel doit donc :

- prélever la mise du joueur qui lance le défi, puis celle de l'adversaire lorsqu'il accepte ;
- verser les deux mises au vainqueur, ou rendre à chacun la sienne en cas de duel nul ;
- rendre la première mise si le défi est refusé, annulé ou expiré, ou si la mise de l'adversaire
  ne peut pas être prélevée (règles 6 à 8 et 16 de la fiche de cadrage).

Ces mouvements modifient un autre module, le Village, que le Duel ne doit pas importer (ADR 0001).
Le Village sait déjà traiter les sujets `realm.withdraw` et `realm.deposit`, publiés dans ses
contrats et utilisés par le Marché (ADR 0007). Il peut aussi s'exécuter dans un service extrait
(ADR 0009).

## Décision

**Le Duel communique avec le Village par des messages de la boîte d'envoi, et orchestre une
saga avec une étape compensable.**

1. **Lancement du défi** : `ChallengeIssued` est enregistré avec un message `realm.withdraw`
   (mise du joueur qui lance le défi, étape compensable), dans la même transaction.
2. **Réponse du Village** au sujet `duel.stake-result`, traitée par le gestionnaire du module
   (`messages.ts`) : prélèvement réussi, le défi attend l'adversaire ; refusé, le défi est annulé
   sans rien à rendre.
3. **Acceptation** : `ChallengeAccepted` est enregistré avec un second `realm.withdraw` (mise de
   l'adversaire, étape pivot).
4. **Réponse** : réussie, le duel commence ; refusée, le duel est annulé et la **compensation**
   rend la première mise par un `realm.deposit`.
5. **Issue** : `DuelEnded` est enregistré avec un `realm.deposit` des deux mises au vainqueur, ou
   deux versements en cas de nul. Un défi refusé, annulé ou expiré déclenche le même
   remboursement que l'étape 4.

Les étapes sont décidées par le domaine (`domain/saga.ts`, `requestsFor`) et traduites en messages
par le service. Un duel d'entraînement ne produit aucun message.

Garanties obtenues :

- **Atomicité locale** : un événement du Duel et les messages qu'il déclenche sont enregistrés
  dans une seule transaction (`EventStore.append(..., messages)`). Aucun prélèvement ne peut être
  demandé sans que le défi soit enregistré, ni l'inverse.
- **Livraison au moins une fois** : le distributeur retente un message en échec, jusqu'à dix fois ;
  il est déclenché après chaque commande et chaque consultation du Duel, et chaque jour.
- **Idempotence** : chaque mouvement porte un identifiant déterminé par le duel et l'étape
  (`<duel>:stake-challenger`, `<duel>:stake-opponent`, `<duel>:payout`, `<duel>:refund-challenger`,
  `<duel>:refund-opponent`). Le Village ignore un mouvement déjà traité ; le Duel ignore une
  réponse qui ne correspond pas à l'étape en cours. Chaque étape n'a lieu qu'une fois par duel.
- **Cohérence différée** : entre deux étapes, le duel est dans un état intermédiaire visible
  (« prélèvement des mises »). Dans le cas ordinaire, la distribution qui suit la commande mène
  la saga jusqu'à l'état stable suivant avant que la réponse soit renvoyée.

**Le Village n'est pas modifié.** Le Duel n'importe que `@/modules/realm/contracts`
(`REALM_TOPICS`). Une fonction d'aptitude vérifie que les ressources misables par le Duel restent
celles du Village (ADR 0012).

L'interface du Duel lit en outre le langage publié du Classement (`GET /api/ranking/players`)
pour proposer une liste d'adversaires ; c'est une lecture du navigateur, sans dépendance serveur.

## Conséquences

### Positives

- Aucune ressource n'est créée ni perdue : le test « joue un duel complet » vérifie que les stocks
  cumulés sont conservés, et le test de compensation que la mise refusée est rendue.
- Le Duel fonctionne sans changement avec le Village extrait : les messages transitent alors par la
  boîte de réception de l'application (ADR 0009). Le test « joue un duel complet avec le Village
  extrait » le vérifie.
- La saga réutilise intégralement le mécanisme du Marché : aucun nouveau code de plateforme.

### Négatives

- Pendant la saga, les ressources mises en jeu ne sont plus dans le village : un joueur ne peut pas
  les dépenser, et un défi sans réponse les immobilise jusqu'à son expiration (dix minutes).
- Un identifiant d'adversaire inexistant n'est pas rejeté : le défi immobilise la mise jusqu'à son
  expiration (dette DT-012).
- Un message abandonné interromprait la saga d'un duel comme celle d'une offre : il serait signalé
  par la tâche quotidienne et relancé par `scripts/dead-letters.ts`.
- Le remboursement d'un défi expiré n'a lieu qu'à la première commande ou consultation qui suit son
  échéance (échéance paresseuse, ADR 0012).

## Alternatives écartées

- **Lecture du langage publié du Village** (son stock) puis écriture directe : impossible sans
  importer son code, et la lecture serait périmée au moment de l'écriture.
- **Transaction unique entre le Duel et le Village** : contraire aux frontières des modules, et
  impossible avec le Village extrait.
- **Appel direct du service du Village** : couplage fort, et perte du mouvement si le processus
  s'arrête entre l'enregistrement du défi et l'appel.
- **Prélever les deux mises seulement au début du combat** : le joueur qui lance le défi pourrait
  dépenser ses ressources pendant l'attente, et l'adversaire accepter un défi que le premier ne
  pourrait plus honorer.
- **Saga chorégraphiée** (le Village réagissant aux événements du Duel) : il aurait fallu modifier
  le Village, et aucun point unique ne connaîtrait l'avancement de la saga pour décider de la
  compensation.

## Réexamen

À réexaminer si d'autres modules doivent mettre des ressources en séquestre : un service de
séquestre commun au Marché et au Duel deviendrait alors intéressant.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : L'IA a proposé ce mode de communication, écrit la saga, le gestionnaire de messages et leurs
  tests, et rédigé cet ADR ; j'ai validé le choix de la saga et l'extension des mises au bois et
  à la pierre.
- **Vérification** : tests de la saga (`rules.test.ts`, règles 6 à 8 et 16) et de l'API avec le vrai Village, y
  compris la compensation, la conservation des ressources et le Village extrait
  (`src/bootstrap/duel-api.test.ts`) ; `pnpm verify` réussit.
