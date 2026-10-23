# ADR-0003 - Les Server-Sent Events, alimentés par le journal d'événements, pour la diffusion en temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les joueurs doivent être informés des changements sans recharger la page : d'abord entre les
onglets d'un même joueur (son village), puis entre les participants d'une partie du Donjon (TD6).

Les actions des joueurs passent déjà par l'API, au moyen de requêtes HTTP authentifiées : seule
la diffusion du serveur vers le navigateur manque.

L'hébergement impose ses contraintes : une fonction Vercel a une durée d'exécution plafonnée
(300 secondes), plusieurs instances s'exécutent sans mémoire partagée, et l'offre gratuite
n'autorise aucune infrastructure supplémentaire.

Le journal d'événements existe déjà, et chaque flux y porte des versions croissantes (ADR 0002).

## Décision

- Les changements sont diffusés par des **Server-Sent Events**, sur la route `/api/stream/<canal>`
  (`src/platform/realtime/stream-api.ts`).
- **Un canal correspond exactement à un flux du journal.** L'identifiant de chaque message est la
  version de l'événement, ce qui permet la reprise sans perte par l'en-tête `Last-Event-ID`
  après une reconnexion. Les canaux globaux, ajoutés au TD8, utilisent la position.
- **Le flux relit le journal toutes les demi-secondes**, et se ferme de lui-même au bout de
  240 secondes ; le navigateur s'y reconnecte.
- **L'accès est réservé aux joueurs connectés**, et chaque module déclare la règle d'accès à ses
  canaux (`ChannelPolicy`) ; un canal qu'aucune règle ne couvre est refusé.
- **L'interface relit sa vue à chaque notification**, plutôt que d'appliquer elle-même le contenu
  des événements (`useChannel`). Cela a permis ensuite les canaux discrets, qui ne transmettent
  aucune donnée d'événement.

## Conséquences

### Positives

- Fonctionne sur l'offre sans serveur, sans service externe de diffusion.
- Aucune notification n'est perdue : la reprise repose sur la version, enregistrée dans le journal.
- Le contrôle d'accès est celui de l'API : session, puis règle du module.
- La logique d'affichage reste dans la vue filtrée par le serveur : le navigateur n'interprète pas
  les événements.

### Négatives

- **Chaque joueur connecté provoque deux lectures du journal par seconde et par flux ouvert**, même
  lorsque rien ne se passe : la charge de la base croît avec le nombre de joueurs.
- **Le délai maximal de réception d'un événement est d'une demi-seconde**, auquel s'ajoute la
  relecture de la vue.
- La reconnexion toutes les 240 secondes produit un trafic et des appels de fonction
  supplémentaires.
- La communication reste à sens unique : les actions du joueur passent par des requêtes HTTP.

## Alternatives écartées

- **Les WebSocket** : les fonctions Vercel ne maintiennent pas de connexion bidirectionnelle
  durable ; il aurait fallu un serveur permanent ou un service tiers.
- **L'interrogation périodique par le navigateur** : chaque interrogation relit la vue complète,
  et la reprise sans perte serait à construire.
- **Un mécanisme de notification partagé entre instances**, comme `LISTEN/NOTIFY` de PostgreSQL
  ou un service de messagerie (Pusher, Ably) : le premier demande une connexion dédiée et durable,
  incompatible avec la connexion mutualisée de Neon ; le second ajoute un fournisseur, un secret et
  une seconde source de vérité.

## Réexamen

À réexaminer si le nombre de joueurs connectés simultanément fait peser les lectures du journal
sur la base, si apparaît un besoin de communication du navigateur vers le serveur à très faible
délai, ou si l'hébergeur prend en charge de manière stable les WebSocket.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai fait rédiger cet ADR par l'IA après coup, à partir du code du temps réel
  (`src/platform/realtime/`), en lui fournissant la liste des éléments exigés par le support du TD5.
- **Vérification** : les valeurs citées ont été relevées dans `stream-api.ts` (lecture toutes les 500 ms, fermeture
  à 240 s, identifiant par version ou par position) ; la présence de chaque élément exigé par le
  TD5 a été contrôlée ; `pnpm verify` réussit.
