# ADR-0009 - L'extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-21

## Contexte

L'ADR 0001 a retenu un monolithe modulaire en promettant des frontières entre modules assez
strictes pour qu'un module puisse être extrait. Cette promesse n'avait jamais été vérifiée.

Les raisons habituelles d'extraire un module (un besoin de capacité propre, une équipe distincte,
un rythme de déploiement différent, une isolation des pannes) ne s'appliquent pas aujourd'hui au
jeu, hébergé sur une offre gratuite par une seule personne.

L'inventaire des dépendances du Village en compte deux qui ne passent pas par le code : le
Classement et le canal temps réel lisent ses événements dans le journal commun. Le Marché, lui,
dépend du Village par ses messages.

## Décision

- **Le Village peut s'exécuter dans un service autonome** (`src/services/village`), doté de sa
  propre base, de son propre journal et de sa propre boîte d'envoi. Le module n'est pas modifié :
  le service ne l'utilise que par son entrée publique.
- **L'application devient alors une passerelle** : elle reçoit une version distante du module
  Village (`src/modules/realm/remote.ts`), de même forme que la version exécutée dans le processus.
- **Les messages de la saga franchissent la frontière par une boîte de réception**
  (`/api/internal/messages`), sans modifier les garanties de la boîte d'envoi.
- **Un relais recopie le flux d'événements publié par le service** (`GET /events`) dans le journal
  de l'application, où le Classement et le canal temps réel continuent de le lire.
- **Les échanges entre les deux processus sont authentifiés par un secret partagé**
  (`SERVICE_SECRET`), qui n'est jamais versionné.
- **Le service n'est pas déployé** : en production, le Village s'exécute dans l'application. Le
  service n'est démarré qu'en local, lorsque `REALM_SERVICE_URL` et `SERVICE_SECRET` sont définies.

## Conséquences

### Positives

- Des frontières démontrées, et non plus supposées : ni le module, ni le Marché, ni le Classement
  n'ont été modifiés.
- Six tests de contrat (`village-service.test.ts`) vérifient ces frontières à chaque construction.
- Une extraction réversible, sans migration de données en production.
- Une boîte de réception et une authentification entre services, réutilisables pour tout autre
  module : le Duel fonctionne avec le Village extrait sans adaptation.
- La mesure du coût réel d'une extraction.

### Négatives

- **Deux chemins d'exécution du Village à maintenir**, l'un dans le processus, l'autre distant.
- **Une copie des événements du Village dans le journal de l'application**, dont la cohérence est
  différée.
- **Des dettes à rembourser avant tout déploiement du service** : migrations de sa base (DT-008),
  pagination du flux publié (DT-009), distribution de sa boîte d'envoi (DT-010).
- **Une authentification par secret partagé**, qui permettrait, en cas de fuite, de se faire passer
  pour n'importe quel joueur auprès du service.

## Alternatives écartées

- **Déployer le service** : aucun besoin ne le justifie, et les quotas gratuits seraient divisés.
- **Ne pas extraire, et laisser les frontières à l'état d'hypothèse** : la promesse de l'ADR 0001
  serait restée théorique.
- **La lecture à distance du flux publié par le Classement et le canal temps réel** : il aurait fallu
  modifier ces deux lecteurs, et rendre chaque lecture dépendante de la disponibilité du service.
- **Extraire un autre module, comme le Marché** : sa saga lie son sort à celui du Village, et
  l'extraction n'aurait pas isolé un module indépendant.
- **Un jeton signé ou le TLS mutuel** pour authentifier les échanges : plus robustes, mais non
  nécessaires pour une configuration locale ; ils restent une piste d'amélioration.

## Réexamen

À réexaminer lorsque l'une des raisons d'extraire devient observable : un Village dont le test de
charge dépasse le budget alors que les autres modules le respectent ; l'arrivée d'une seconde
équipe chargée du Village ; un besoin de déployer le Village plus souvent que le reste du jeu.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai fait rédiger cet ADR par l'IA après coup, à partir du service extrait
  (`src/services/village/`), de la version distante du module (`remote.ts`) et de
  l'authentification entre services, en lui fournissant la liste des éléments exigés par le
  support du TD11.
- **Vérification** : chaque mécanisme décrit a été confronté au code et aux six tests de contrat de
  `village-service.test.ts` ; la présence de chaque élément exigé par le TD11 a été contrôlée ;
  `pnpm verify` réussit.
