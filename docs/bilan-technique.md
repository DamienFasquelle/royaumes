# Bilan technique de Royaumes

- Date : 2026-10-23
- Version examinée : étiquette `eval-fin` (module Duel), comparée à l'étiquette `td11-fin`
- Auteur : Damien Fasquelle

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 7 : `system`, `realm`, `dungeon`, `ranking`, `market`, `tavern`, `duel` |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` |
| Lignes de code, hors tests | 10 294 (`src/`), dont 1 589 pour la plateforme |
| Fichiers de test, nombre de tests | 39 fichiers, 298 tests (33 fichiers et 232 tests à `td11-fin`) |
| Commits | 79 avant les commits de documentation de l'évaluation (76 à `td11-fin`) |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 096 |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 070 |
| `market` | Event Sourcing, projection des offres, saga | 1 274 |
| `ranking` | Projection du journal | 463 |
| `tavern` | Tables ordinaires | 667 |
| `duel` | Event Sourcing, projection des duels actifs, saga | 2 361 |
| `system` | Aucun | 73 |

Le module `duel` est le plus volumineux. Son interface (`ui.tsx`) en représente environ un
cinquième : écran des défis, écran du combat et journal du combat.

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) ; ajout du Duel | Tenue : le Duel s'est ajouté sans modifier aucun autre module que la racine de composition et la navigation |
| 0002 | Event Sourcing pour le Village | Saga du Marché puis du Duel ; relais du service extrait | Tenue : les mouvements idempotents du Village ont servi tels quels au Duel |
| 0003 | Server-Sent Events alimentés par le journal | Canaux discrets du Donjon et du Duel ; canaux globaux | Tenue ; la charge de la base croît avec le nombre de flux ouverts |
| 0004 | Manches simultanées et échéances paresseuses | Réemploi par le Marché (expiration) et le Duel | Tenue : le mécanisme a été réutilisé sans changement de plateforme |
| 0005 | Intelligence artificielle déterministe | Compagnons, monstres, maître d'armes du Duel | Tenue : chaque IA est une fonction pure testée |
| 0006 | CQRS et projections rattrapées à la lecture | Quatre projections ; optimisation du TD11 | Tenue ; les lectures restent au-dessus du budget de performance (section 3) |
| 0007 | Saga orchestrée et boîte d'envoi | Saga du Duel, avec compensation ; Village extrait | Tenue : deuxième orchestrateur ajouté sans modifier le Village |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Contributeur du Duel ; fonction d'aptitude | Tenue : la fonction d'aptitude a signalé l'absence du contributeur du Duel pendant son développement |
| 0009 | Extraction du Village, préparée mais non déployée | Tests de contrat | Tenue en local ; trois dettes avant tout déploiement (DT-008 à DT-010) |
| 0010 | Duel : journal d'événements et projection des duels actifs | Évolution de la mise et des effets de manche pendant le développement | Tenue ; règle 3 sans garantie transactionnelle (DT-011) |
| 0011 | Duel : saga des mises par la boîte d'envoi | Tests de compensation et de conservation des ressources avec le vrai Village | Tenue |
| 0012 | Duel : canal discret, échéances, maître d'armes, fonction d'aptitude | Tests du canal et de la fonction d'aptitude | Tenue |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 298 tests réussis sur 298 ; chaque règle de la fiche du Duel est vérifiée par un test nommé « règle N » | Bonne |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | `perf/apres.json` : p99 de 240 ms (Village) à 1 653 ms (Taverne), aucune erreur ; budget de 500 ms respecté pour le Village seul | Insuffisante : quatre lectures sur cinq dépassent le budget. Les lectures du Duel n'ont pas été mesurées |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Acceptations simultanées au Marché ; réponses en double ignorées par le Duel ; compensation testée ; outil de relance des messages abandonnés | Bonne ; un test du temps réel et un test du service extrait échouent parfois sur un poste chargé (délais) |
| Sécurité | Exigences des revues de sécurité | 54 exigences de sécurité : 49 conformes, 5 en risque accepté, aucune non conforme ; RGPD : 7 conformes sur 10, 1 non conforme | Bonne ; la non-conformité R8 (sessions expirées) est consignée (DT-014) |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 0 violation des 8 règles de dependency-cruiser ; 3 fonctions d'aptitude (2 à `td11-fin`) ; couverture des lignes 75,34 % (75,04 % à `td11-fin`) | Bonne : la couverture s'est maintenue malgré 1 600 lignes de plus |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village extrait ; PGlite en local, Neon en production ; le Duel fonctionne aussi avec le Village extrait (test « joue un duel complet avec le Village extrait ») | Bonne |

Couverture mesurée par `pnpm test:coverage` :

| Mesure | `td11-fin` | `eval-fin` |
| --- | --- | --- |
| Instructions | 73,37 % (1 328 / 1 810) | 73,99 % (1 750 / 2 365) |
| Branches | 64,06 % (592 / 924) | 63,15 % (857 / 1 357) |
| Fonctions | 70,05 % (365 / 521) | 69,89 % (462 / 661) |
| Lignes | 75,04 % (1 176 / 1 567) | 75,34 % (1 534 / 2 036) |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 14 (DT-001 à DT-014) |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance prévue (DT-001 à DT-007) |
| Entrées ouvertes | 7 : DT-008 à DT-010 (service Village extrait), DT-011 à DT-013 (Duel), DT-014 (sessions expirées, revue de conformité) |

Analyse : les dettes des TD ont toutes été remboursées au TD prévu. Les dettes ouvertes sont de
deux natures. Celles du service extrait (DT-008 à DT-010) ne pèsent pas tant que le service n'est
pas déployé. Celles du Duel touchent l'expérience de jeu sans mettre en danger les ressources des
joueurs : la règle 3 non garantie lors de deux défis simultanés (DT-011), l'adversaire non vérifié
(DT-012) et la liste d'adversaires limitée à vingt joueurs (DT-013). DT-012 et DT-013 se
rembourseraient ensemble par une recherche de joueurs. DT-014, issue de la revue de conformité,
concerne des données personnelles : c'est la première à rembourser avant une ouverture au public.

Le registre comportait une ligne DT-007 dupliquée et tronquée ; elle a été retirée lors de
l'évaluation, sans modifier le contenu des entrées.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 15 | 1 en risque accepté (S9) | Aucune |
| Sécurité du Donjon | 14 | 12 | 2 en risque accepté (D10, D14) | Aucune |
| Sécurité du Marché | 10 | 10 | Aucune | Aucune |
| Sécurité du Duel | 14 | 12 | 2 en risque accepté (U12, U13) | DT-011, DT-012 |
| Conformité au RGPD | 10 | 7 | 1 non conforme (R8), 2 en risque accepté (R9, R10) | DT-014 ; vérifier la conservation des journaux de Vercel |

Les revues de l'authentification, du Donjon, du Marché et de conformité au RGPD avaient leurs
exigences, mais leurs constats étaient vides à l'étiquette `td11-fin`. Elles ont été menées le
2026-10-23 : tests, lecture du code, manipulations prévues par les TD sur le serveur de
développement, et inspection du cookie de session en production avec un compte de test supprimé
ensuite.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Lectures au-delà du budget de performance avec plus de joueurs | p99 des lectures supérieur à 500 ms dans `perf/apres.json` | Mesurer aussi les lectures du Duel ; réduire le nombre de requêtes par lecture (rattrapage des projections, relecture des flux) |
| 2 | Charge de la base due aux flux temps réel (deux lectures par seconde et par flux) | Nombre de connexions et de requêtes Neon proche du quota gratuit | Allonger l'intervalle de lecture des canaux discrets, ou regrouper les flux d'un même joueur |
| 3 | Évolution de la forme des événements après déploiement (par exemple `RoundResolved`) | Erreur d'affichage sur un duel ancien après une mise à jour | Lire les anciens événements avec des valeurs par défaut (« upcasting »), et tester la relecture d'événements d'une version précédente |
| 4 | Deux défis simultanés au même joueur (DT-011) | Joueur engagé dans deux duels actifs | Flux de disponibilité par joueur, soumis à la concurrence optimiste |
| 5 | Données personnelles conservées au-delà du nécessaire : sessions expirées (R8), journaux de Vercel (R9, R10) | Sessions expirées en nombre croissant dans `identity.session` | Rembourser DT-014 ; vérifier et documenter la conservation des journaux de l'hébergeur |

## 7. Conclusion

L'architecture a tenu l'épreuve de l'évaluation : le module Duel combine Event Sourcing,
projection, saga avec compensation, canal temps réel, échéances paresseuses et IA déterministe,
sans aucune modification de la plateforme ni du Village. Les règles d'architecture n'ont signalé
aucune violation, et les fonctions d'aptitude ont détecté ce qu'elles devaient détecter.

Les points faibles sont connus et consignés : la performance des lectures reste au-dessus du
budget, et la revue de conformité a relevé une non-conformité sur les sessions expirées (DT-014). La priorité, pour qui reprendrait le
projet, est de mesurer puis d'améliorer les lectures, avant d'ouvrir le jeu à plus de joueurs.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour ce bilan.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : rédaction du bilan, et mesure des indicateurs à ma demande.
- **Vérification** : les valeurs ont été mesurées par commande, et non estimées :
  `pnpm test:coverage` sur le dépôt courant et sur l'étiquette `td11-fin` (extraite dans un
  répertoire de travail séparé), `pnpm lint:archi`, comptage des lignes par `wc -l`, lecture de
  `perf/apres.json`, du registre de la dette et des revues.
