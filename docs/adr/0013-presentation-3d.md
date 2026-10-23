# ADR-0013 - Une couche de présentation 3D, procédurale et chargée à la demande, au-dessus du métier existant

- Statut : accepté
- Date : 2026-10-23

## Contexte

Royaumes présentait ses lieux comme des pages de formulaires et de listes. L'objectif est
désormais que le joueur ait l'impression de jouer à un jeu vidéo : un village 3D dont les
bâtiments reflètent leur niveau, une salle de donjon où les héros affrontent des monstres, une
arène où deux duellistes croisent le fer, et des lieux cohérents pour le Marché, la Taverne et le
Classement.

Plusieurs contraintes encadrent cette transformation :

- **le métier ne change pas** : les règles, les API, les événements, la saga, les canaux temps
  réel et la confidentialité des choix (passes du duel, actions du donjon) restent la seule source
  de vérité ;
- l'application est une application Next.js déployée sur Vercel (ADR 0001) : le rendu serveur ne
  dispose ni de `window`, ni de WebGL ;
- les règles d'architecture interdisent au code du navigateur d'importer du code serveur, et au
  domaine d'importer quoi que ce soit (`.dependency-cruiser.cjs`) ;
- le projet n'a ni budget ni artiste : toute ressource tierce poserait une question de licence et
  de poids.

## Décision

- **Three.js, React Three Fiber et Drei** (versions exactes `three@0.186.1`,
  `@react-three/fiber@9.8.2`, `@react-three/drei@10.7.9`) rendent les scènes dans le navigateur.
  Drei ne sert qu'aux contrôles de caméra (`CameraControls`).
- **La 3D est une couche de présentation.** Chaque scène reçoit la vue renvoyée par l'API et la
  représente ; elle ne calcule aucun résultat. Les combats rejouent, effet par effet, les effets
  enregistrés par le serveur dans la dernière manche ; une manche déjà jouée n'est pas rejouée à
  l'ouverture, et chaque manche ne l'est qu'une fois.
- **Organisation** : la couche partagée est dans `src/ui/three/` (canevas, palette, décors,
  personnages, effets, étiquettes) ; chaque scène est dans son module, `src/modules/<module>/scene/`,
  et n'est importée que par le `ui.tsx` du module. Aucune frontière de module n'est modifiée.
- **Chargement à la demande** : chaque scène est importée par `next/dynamic` sans rendu serveur.
  Three.js n'est téléchargé qu'à l'entrée d'un lieu, et un écran de chargement le remplace pendant
  ce temps.
- **Ressources procédurales** : bâtiments, personnages, décors et effets sont construits à partir
  de géométries simples, de matériaux de la charte et d'éclairages. Aucune ressource externe n'est
  téléchargée : ni modèle, ni texture, ni police de rendu.
- **Étiquettes en DOM** : noms, jauges de vie et chiffres de dégâts sont du DOM ordinaire, placé à
  chaque image au-dessus de son ancre 3D (`src/ui/three/labels.tsx`). Le composant `Html` de Drei a
  été écarté (voir plus bas).
- **Interface de jeu en DOM** : les panneaux (fiche de bâtiment, actions de combat, journal,
  défis) restent du DOM au-dessus de la scène. Toute action est disponible au clavier depuis ces
  panneaux, même si elle l'est aussi par un clic dans la scène.
- **Sobriété** : résolution plafonnée, boucle de rendu arrêtée quand l'onglet est masqué, une seule
  lumière portant des ombres par scène, préférence « réduire les animations » respectée, décor de
  repli sans WebGL.

## Conséquences

### Positives

- Le jeu change de nature pour le joueur, sans qu'une seule règle métier, route ou test ait été
  modifié : `pnpm verify` réussit avec les 298 tests existants.
- La confidentialité est préservée par construction : la scène ne reçoit que la vue filtrée, qui
  ne contient jamais la passe secrète de l'adversaire.
- Les pages qui n'affichent pas de scène ne téléchargent pas Three.js.
- Aucune question de licence : toutes les ressources sont produites par le code du projet.
- Le jeu reste jouable sans WebGL, au clavier, et avec les animations réduites.

### Négatives

- Les scènes ne sont couvertes par aucun test automatisé : elles ont été vérifiées par des captures
  d'écran d'un navigateur sans interface (dette DT-015).
- Le paquet 3D pèse environ 980 Ko non compressés, téléchargés à la première entrée dans un lieu.
- Les modèles procéduraux restent stylisés : un rendu proche d'un jeu commercial demanderait des
  modèles et des animations réalisés par un artiste.
- Chaque scène recrée son canevas à chaque changement de lieu : le passage d'un lieu à l'autre
  coûte une initialisation WebGL.

## Alternatives écartées

- **Illustrations ou vidéos en arrière-plan** : elles ne réagissent pas à l'état du jeu, et ne
  donnent pas l'impression d'un monde.
- **Modèles glTF libres de droits** : il aurait fallu vérifier chaque licence, alourdir le dépôt et
  le téléchargement, et harmoniser des styles disparates.
- **Babylon.js** : moteur complet et performant, mais sans intégration à React aussi directe que
  React Three Fiber, alors que toute l'interface du projet est en React.
- **Le composant `Html` de Drei pour les étiquettes** : il crée une racine React par étiquette, ce
  qui provoquait des erreurs de démontage avec React 19 (« Attempted to synchronously unmount a
  root while React was already rendering ») et un coût par image avec de nombreuses étiquettes.
- **Un canevas unique, persistant entre les lieux** : il éviterait de réinitialiser WebGL, mais
  demande de faire coexister toutes les scènes dans un même arbre, et complique le chargement à la
  demande.

## Réexamen

À réexaminer si le coût d'initialisation entre les lieux devient gênant (canevas persistant), si
un artiste fournit des modèles, ou si des tests de bout en bout (Playwright) sont ajoutés au projet.

## Usage de l'IA générative

J'ai utilisé l'IA générative pour cette décision.

- **Outil** : Claude Code, assistant de code d'Anthropic (modèle Claude Opus 5.5), utilisé dans le
  terminal avec un accès en lecture et en écriture au dépôt.
- **Contribution** : à partir de ma demande de transformer Royaumes en jeu vidéo 3D médiéval
  fantastique, l'IA a choisi les bibliothèques, conçu la couche de présentation et écrit les scènes,
  les personnages, les effets et l'interface de jeu, puis rédigé cet ADR.
- **Vérification** : `pnpm verify` (298 tests, 0 violation des règles d'architecture) et
  `pnpm build` ; captures d'écran de chaque lieu, sur ordinateur et sur mobile, prises avec des
  données réelles (expédition, duel d'entraînement, offres du Marché, message de la Taverne) dans
  un navigateur sans interface ; contrôle que Three.js n'est chargé qu'à la demande.
