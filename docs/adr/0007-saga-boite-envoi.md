# ADR-0007 - Les opérations entre modules sont des sagas orchestrées, dont les messages transitent par une boîte d'envoi transactionnelle

- Statut : accepté
- Date : 2026-10-21

## Contexte

Un échange du Marché modifie les données du Marché (l'offre) et celles de deux villages. Il ne
doit ni créer ni perdre de ressources, même si le traitement s'interrompt à mi-chemin.

La règle d'encapsulation des modules (TD2) interdit au Marché d'écrire dans les données du
Village, et la perspective de l'extraction d'un module dans un service doté de sa propre base
(TD11) exclut toute transaction commune aux deux modules.

L'hébergement ne permet aucun processus permanent (ADR 0004) : rien ne garantit qu'un appel prévu
après une écriture aura lieu si la fonction s'arrête entre les deux.

## Décision

- **Une transaction ne modifie jamais les données que d'un seul module.**
- **Une opération qui concerne plusieurs modules est une saga**, dont les étapes sont identifiées :
  la mise en séquestre des ressources du vendeur est **compensable** (rendue si l'offre est retirée
  ou expire) ; le paiement de l'acheteur est le **pivot** ; la livraison aux deux joueurs est
  **reprise jusqu'au succès**.
- **La saga est orchestrée par le module qui porte l'opération** : l'offre du Marché, dont l'état
  résume l'avancement (`src/modules/market/domain/saga.ts`). Les participants ne connaissent pas la
  saga : ils répondent à l'**adresse de retour** (`replyTo`) indiquée dans chaque demande.
- **Les messages sont enregistrés dans la boîte d'envoi de la plateforme** (`platform.outbox`), dans
  la même transaction que les événements qui les déclenchent.
- **La distribution est garantie au moins une fois** : bail de trente secondes, nouvel essai avec un
  recul exponentiel (2, 4, 8 secondes...), abandon après dix tentatives.
- **Chaque gestionnaire est idempotent**, grâce à une clé d'idempotence choisie par le demandeur :
  l'identifiant du mouvement, déterminé par l'offre et l'étape.
- **La distribution a lieu après chaque commande et chaque consultation du Marché**, et chaque jour
  par une tâche planifiée protégée par un secret (`CRON_SECRET`).

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre.
- Une panne à n'importe quel moment ne perd ni ne duplique aucune ressource : chaque étape est
  atomique, et la saga reprend à la distribution suivante.
- Le Village peut servir d'autres demandeurs sans modification : le Duel l'a fait (ADR 0011).
- La boîte d'envoi sert aussi de minuterie : un message différé rappelle une offre à son échéance.
- Le déroulement de la saga se lit en un seul endroit, l'orchestrateur.

### Négatives

- **Des états intermédiaires visibles des joueurs**, comme une offre « en règlement ».
- **Une latence qui dépend de l'activité** : une saga interrompue ne reprend qu'à la consultation
  suivante du Marché, ou le lendemain.
- **L'obligation d'écrire des gestionnaires idempotents**, et de tester leurs doublons.
- **Des messages abandonnés qu'aucun outil ne permettait d'examiner** (dette DT-007, remboursée au
  TD11 par `scripts/dead-letters.ts`).
- **Une table de la boîte d'envoi qui grandit sans limite**, les messages traités étant conservés.

## Alternatives écartées

- **Une transaction unique englobant les données des deux modules** : elle viole les frontières des
  modules et rend l'extraction du Village impossible.
- **Une transaction distribuée par validation en deux phases** : elle demande un coordinateur, que
  le projet n'a pas, et bloque les données concernées tant que ce coordinateur n'a pas tranché, y
  compris lorsqu'il tombe en panne.
- **Un appel direct du Village par le Marché, sans boîte d'envoi** : un arrêt entre l'enregistrement
  de l'offre et l'appel perdrait le mouvement.
- **Une saga chorégraphiée** : aucun point unique ne connaît l'avancement de l'échange, ce qui
  complique la compensation et le diagnostic.
- **Le journal d'événements utilisé comme boîte d'envoi** : il aurait fallu un point de reprise par
  destinataire, et un événement de domaine aurait servi de message technique.

## Réexamen

À réexaminer en cas d'extraction d'un module dans un service distinct, qui demande une boîte
d'envoi par base et un transport entre services (réalisé au TD11, ADR 0009) ; d'un volume de
messages qui justifierait un courtier de messages dédié ; ou d'un besoin de latence que la
distribution déclenchée par les requêtes ne satisfait plus.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : J'ai fait rédiger cet ADR par l'IA après coup, à partir de la saga du Marché
  (`src/modules/market/`), de la boîte d'envoi (`src/platform/outbox/`) et des gestionnaires du
  Village, en lui fournissant la liste des éléments exigés par le support du TD9.
- **Vérification** : chaque mécanisme décrit a été confronté au code (bail, recul exponentiel, abandon après dix
  tentatives, clés d'idempotence) ; une affirmation non étayée sur la validation en deux phases a
  été retirée ; la présence de chaque élément exigé par le TD9 a été contrôlée ; `pnpm verify`
  réussit.
