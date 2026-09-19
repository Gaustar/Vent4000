# Changelog

Toutes les versions notables du projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [SemVer](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).

## [1.4.0] — 2026-09-19

Refonte visuelle « instrument de vol » et passage d'un affichage de
données à un outil de décision : l'app répond maintenant directement à
« quand aller sauter ? » au lieu de présenter des cartes à comparer.

### Corrigé (bug de sécurité : faux verts)

- **Un ciel totalement bouché ressortait VERT pour tous les niveaux**, sans
  aucune raison affichée. Deux causes cumulées : la bande « ciel
  partiellement couvert » était calibrée 30-75 %, donc une couverture à
  100 % passait à travers sans rien déclencher ; et `plafondEstime`
  renvoie 3000 m pour une couche moyenne compacte, ce qui passe le seuil
  de plafond de **tous** les niveaux (le plus strict, Élève AFF, est à
  2800 m). Reproduit puis verrouillé par test.
  Correction : une couche compacte (≥ 85 % sur un étage) est désormais
  éliminatoire, avec un message distinct selon l'étage — la couche moyenne
  d'Open-Meteo (~3-8 km) contient l'altitude de largage, donc « Couche
  compacte à l'altitude de largage » ; en bas, « Ciel bouché (couche
  basse) ». Le test se fait **par étage et non sur la somme** : 45 % bas
  + 40 % moyen est un ciel morcelé (orange), pas un ciel bouché.
  Les nuages **hauts** (cirrus, 8-15 km) restent volontairement non
  bloquants : ils sont au-dessus de l'altitude de largage.

### Ajouté

- **Meilleur créneau en tête d'écran** : le verdict, le jour, la fenêtre
  horaire précise et les chiffres clés (vent, rafales, plafond, confiance)
  — la réponse avant le détail.
- **Fenêtres horaires explicites** (`fenetreSautable`) : l'information
  était calculée puis jetée (`scoreCreneau` ne renvoyait qu'une couleur).
  On lit maintenant « 14h → 17h » au lieu de « Dimanche 🟢 ».
- **Motif bloquant sur chaque jour**, en vue Semaine : plus besoin
  d'ouvrir un jour pour savoir pourquoi il est rouge.
- **Estimation de dérive / spot** (`js/spot.js`, nouveau) : intègre le
  vent sur toute la colonne (sol → 80/120/180 m → 925/850/700/600 hPa)
  pour estimer la dérive en chute, la dérive sous voile, la dérive totale
  et le cap à remonter depuis la zone de poser. Hauteur d'ouverture prise
  par niveau, elle aussi issue de la FFP DT49 (1200 m progression/brevet A,
  850 m à partir du brevet B). Affichée avec ses hypothèses explicites.
- **Tendance de la prévision** (`js/tendance.js`, nouveau) : « ↗ s'améliore »
  / « ↘ se dégrade » par rapport à un instantané conservé en local, utile
  quand on surveille un week-end depuis le jeudi. La comparaison n'est
  faite que si l'instantané a au moins 4 h, sinon elle ne dit rien.
- **Confiance pondérée par l'échéance** : +2 km/h d'écart fictif par jour
  au-delà de J+1. À J+6, les modèles doivent s'accorder à 2 km/h près pour
  rester en confiance « moyenne ». Choix assumé de ne **pas** plafonner
  tout J+5/J+6 à orange : cela rendrait inutile la fonction première de
  l'app (décider en début de semaine). La dégradation reste progressive.
- Rafales affichées directement sur chaque heure de la timeline.

### Refonte visuelle — « instrument de vol »

- **Thème sombre** (planche de bord) par défaut, variante claire
  automatique en journée pour rester lisible en plein soleil.
- **Vert / ambre / rouge sont désormais réservés aux données.** L'accent
  interactif passe de l'orange au bleu : l'ancien bandeau orange plein
  « Briefing officiel du club » dominait l'écran et se lisait comme une
  alerte alors que ce n'est qu'un lien — exactement le genre de bruit qui
  fait douter d'un code couleur décisionnel.
- Chiffres en IBM Plex Mono tabulaire (les colonnes ne dansent plus quand
  une valeur passe de 9 à 10), titres en Barlow Condensed majuscule.
- Vue Semaine en lignes scannables (pastille · jour · fenêtre · motif ·
  tendance) au lieu de cartes empilées ; vue Jour réorganisée en blocs
  distincts et étiquetés (verdict, heure par heure, cette heure-là, profil,
  vent/piste, spot, détails).
- Boussole enrichie : axe de piste, vent au sol (trait plein) et dérive
  estimée (trait pointillé ambre).
- Le niveau de pratique actif devient une puce cliquable dans l'en-tête.

### Notes

- Tests : 46 → 76 (nouveaux fichiers `spot.test.mjs`, `tendance.test.mjs`).
- Cache du service worker en `vent4000-v8`, avec les deux nouveaux modules
  dans le shell hors-ligne.

## [1.3.0] — 2026-09-19

Validation des seuils de vent par brevet contre une source fédérale
primaire, à la demande explicite de l'utilisateur ("vérifie et valide les
seuils suivant les brevets, comme le font les DZ avant d'imposer une
limite"). Démarche : identifier le document fédéral le plus pertinent
disponible, lire les chiffres exacts, comparer à ce que l'app appliquait
déjà, et documenter chaque écart.

### Source consultée

[FFP (Fédération Française de Parachutisme) — Directive Technique n°49,
modifiée le 15/04/2025](https://www.ffp.asso.fr/wp-content/uploads/2025/04/Directive-Technique-49-modifiee-15-avril-2025.pdf)
(36 pages, "Méthodes d'enseignement, brevets fédéraux"). Choisie parce
qu'elle utilise exactement la même nomenclature de brevets (A/B/C/D) que
celle déjà en place dans l'app, historiquement partagée par le
parachutisme francophone. Le Paraclub de Namur n'apparaît pas comme
membre FFP confirmé (il dépend a priori de la FWCP — Fédération Wallonne
des Clubs de Parachutisme, basée à Spa — dont le règlement technique
propre n'a pas pu être consulté en ligne) : ces chiffres sont donc la
**meilleure référence trouvée, pas une confirmation officielle du club**.

Citations exactes extraites du PDF (`pdftotext`, vérifiées ligne par
ligne, pas de résumé IA intermédiaire pour les chiffres retenus) :
- p.5, module "Aptitudes sous voile", tant que non validé (= pendant toute
  la progression jusqu'au brevet A inclus) : *"Vent au sol inférieur ou
  égal à 7 m/s"* = 25,2 km/h.
- p.6-7, brevet B (module Bv + conditions d'obtention) : *"Limite maximale
  de vent au sol : 11 m/s"* = 39,6 km/h.
- p.15, BPA (Brevet de Parachutiste Autonome, prérequis des brevets C et
  D) : *"Limite maximale de vent au sol : 11 m/s"* — même chiffre.
- Sections brevet C (p.18) et brevet D (p.20) : **aucun chiffre de vent
  n'y est donné** — 11 m/s reste le plafond le plus élevé explicitement
  écrit dans tout le document.
- Aucune mention de plafond nuageux (plafond/nuage/visibilité) chiffrée
  nulle part dans le document, quel que soit le brevet.

### Corrigé

- **Brevet B séparé de C/D et aligné sur le plafond fédéral documenté** :
  `ventMax` 46 → **39 km/h** (11 m/s arrondi à l'entier inférieur — un
  seuil de sécurité ne s'arrondit jamais vers le haut). Avant cette
  correction, un titulaire du seul brevet B pouvait recevoir un verdict
  vert jusqu'à 46 km/h, soit 6,4 km/h au-dessus du plafond que la FFP fixe
  explicitement pour ce niveau (et pour le BPA, prérequis de C/D). Brevet
  C/D conserve 46 km/h : aucun chiffre fédéral ne le couvre au-delà du BPA,
  la valeur reste une estimation DZ à confirmer par le club — mais elle ne
  s'applique plus, à tort, aux détenteurs du seul brevet B.
- `plafondMin` du brevet B aligné sur brevet C/D (1100 m, au lieu du
  1400 m de brevet A) : la FFP documente une hauteur d'ouverture minimale
  qui passe justement à 850 m à l'obtention du brevet B (1200 m avant,
  1000 m avant BPA) — cohérence conservée entre plafond nuageux estimé et
  hauteur d'ouverture réglementaire.

### Confirmé sans changement

- Élève AFF (22 km/h) : déjà sous le plafond fédéral de progression
  (25,2 km/h) — marge de sécurité volontaire, non touchée.
- Tandem (28 km/h) : hors périmètre de cette règle FFP (pas un brevet de
  progression solo, moniteur aux commandes) — seuil DZ/matériel inchangé.
- Brevet A (33 km/h) : aucun chiffre fédéral explicite pour ce palier
  précis (entre la fin de progression à 7 m/s et le brevet B à 11 m/s) —
  interpolation DZ raisonnable, non contredite par la source consultée.
- Plafonds nuageux minimums (hors brevet B) : aucune source chiffrée
  trouvée, valeurs DZ inchangées.

### Ce qui reste à faire confirmer par le club

- Le seuil Brevet C/D (46 km/h) n'est adossé à aucun texte fédéral
  identifié — c'est le point le plus incertain de cette validation.
- Confirmer si le Paraclub de Namur applique effectivement le règlement
  FFP/FWCP ou un barème interne différent.

## [1.2.0] — 2026-09-19

Revue de fiabilité complète du moteur de décision, à la demande de
l'utilisateur : rapprocher le verdict de ce qu'un club/moniteur expérimenté
ferait réellement, en s'appuyant sur les pratiques DZ documentées (limites
de vent USPA/SIM, gestion des rafales, spread de rafales par expérience —
voir sources ci-dessous).

### Corrigé (sécurité / correction de fond)

- **La limite de vent s'applique désormais à la rafale, pas seulement à la
  moyenne.** Pratique DZ standard ("assume the worst case scenario at the
  time of landing") : un vent moyen sous le seuil avec des rafales
  au-dessus passait auparavant en orange au mieux, jamais en rouge
  éliminatoire. `scoreHeure` ajoute une raison rouge dédiée quand
  `rafales10 > ventMax`.
- **`recupereLe` reflétait toujours "maintenant"**, même quand les données
  provenaient du cache hors-ligne du service worker (repli réseau en
  échec). Un verdict vert périmé de plusieurs heures pouvait donc s'afficher
  comme fraîchement calculé. `chargerMeteo()` lit désormais l'en-tête HTTP
  `Date` de la réponse réseau réelle ; l'UI affiche un bandeau d'alerte
  rouge si les données ont plus de 90 min.
- **Comparaison horaire au fuseau de l'appareil, pas Europe/Brussels.** Un
  téléphone mal configuré (ou en déplacement) pouvait comparer l'heure
  courante au mauvais fuseau et masquer/afficher le mauvais créneau.
  `heureCourante()`, `todayIso()` et `appliquerTheme()` utilisent
  maintenant `Intl.DateTimeFormat` ancré sur `Europe/Brussels`.
- **Pas de timeout réseau.** Une requête Open-Meteo qui ne répond jamais
  bloquait l'app indéfiniment sur l'écran de chargement, sans jamais
  basculer sur le cache hors-ligne. Ajout d'un timeout (15 s primaire,
  10 s secondaires) via `AbortController`, avec message d'erreur explicite.
- Validation défensive de la réponse Open-Meteo (`hourly`/`daily`
  manquants ou vides → erreur claire plutôt qu'un plantage silencieux
  plus loin dans le rendu).

### Ajouté

- **Seuil de "spread" rafales/moyenne gradué par niveau de pratique**,
  au lieu d'un seuil unique : élève/tandem 9 km/h (~5 kt), Brevet A
  13 km/h (~7 kt), Brevet B/C/D 18 km/h (~10 kt) — un jumper expérimenté
  tolère un spread plus large qu'un élève (cf. sources).
- **Détection de hausse rapide du vent** d'une heure à l'autre
  (> 8 km/h/h) → dégrade en orange avec la raison "Vent en hausse rapide".
  Reflète la pratique "si les rafales viennent d'apparaître après du calme,
  prolonge la prudence".
- **La confiance multi-modèle influence désormais le verdict**, pas
  seulement l'affichage : si les 3 modèles météo divergent fortement
  (confiance "faible") sur une heure par ailleurs jugée verte, le verdict
  est plafonné à orange avec la raison correspondante. Un verdict vert
  n'est plus jamais donné "à l'aveugle" en cas de désaccord des modèles.
- Suite de tests étendue : 26 → 42 tests. Nouveaux cas sur les rafales
  comme limite, le spread par niveau, la tendance, le plafonnement par
  confiance, et un fichier `meteo.test.mjs` (fetch simulé) couvrant le
  timeout, l'échec des modèles secondaires, l'échec du modèle principal et
  une réponse incomplète.
- CI GitHub Actions (`.github/workflows/test.yml`) : `npm test` sur chaque
  push/PR vers `main`, pour empêcher toute régression silencieuse future.
- `package.json` : champs `version`/`description` alignés sur
  `js/config.js`.

### Clarifié (pas de changement de comportement)

- **Le vent traversier (crosswind) reste volontairement informatif**,
  documenté en commentaire dans `scoring.js`. Recherche à l'appui : un
  parachutiste choisit son axe d'atterrissage via la manche à air, pas via
  l'axe de piste — un atterrissage travers bien négocié n'est pas plus
  dangereux qu'un atterrissage face au vent (cf. sources). Le calculer
  comme seuil personnel du sauteur aurait été une fausse bonne idée ; il
  reste affiché pour la lecture du terrain et l'activité de l'avion
  largueur.

### Notes de version

- Cache du service worker bumpé en `vent4000-v6` pour forcer la mise à
  jour des PWA déjà installées après déploiement.
- Seuils de vent max par niveau (28/22/33/46 km/h) inchangés : ils
  recoupent déjà correctement les références USPA/SIM trouvées
  (élève ≈ 14 mph ≈ 22 km/h).

**Sources consultées pour cette revue** (voir aussi liens en pied de
README) :
- USPA SIM — limites de vent par catégorie/niveau
- Skydivemag, *Winds Limits Part 1: What Every Skydiver Should Know* —
  règle "gust = limite", spread par expérience
- Skydivemag, *Crosswind Landings* / *Landing Priorities* — crosswind non
  déterminant pour la sécurité d'atterrissage
- Réglementation française "pratique du parachutisme" (préfecture) —
  visibilité/couverture nuageuse générales

## [1.1.0] — 2026-08-22

- Confiance sur 3 modèles météo (Open-Meteo/DWD-ICON, Météo-France AROME,
  ECMWF IFS) sur toute la fenêtre à 7 jours.
- Suite de tests Node native (26 tests) sur `scoring.js`/`ouverture.js`.
- Rafraîchissement visuel (échelle d'espacement/rayons unifiée).
- Faits vérifiés contre sources primaires (axe de piste, horaires club).

## [1.0.0] — première version

- Vue Semaine / Vue Jour / Réglages, profil vertical du vent, boussole
  piste, niveaux de pratique, PWA installable avec cache hors-ligne.
