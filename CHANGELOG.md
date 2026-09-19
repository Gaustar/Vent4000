# Changelog

Toutes les versions notables du projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [SemVer](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).

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
