# Vent4000 — Ça saute à Namur ?

PWA météo dédiée au parachutisme au **Paraclub de Namur** (aérodrome de
Namur/Temploux-Suarlée, EBNM). Objectif : décider en début de semaine
**quel jour aller sauter**, en n'affichant que les jours d'ouverture réels
du club, avec les vents du sol jusqu'à l'altitude de largage (~4000 m).

## Fonctionnalités v1

- **Vue Semaine** : verdict 🟢🟠🔴 pour chaque jour d'ouverture des 7 prochains
  jours, scindé matin (8h30-14h) / après-midi (14h-coucher du soleil).
  J+6/J+7 estompés (fiabilité réduite).
- **Vue Jour** : timeline horaire colorée, **profil vertical du vent**
  (sol → 925 → 850 → 700 → 600 hPa ≈ largage 4000 m) avec direction, vitesse
  et température par niveau, plafond nuageux estimé, rafales, CAPE, visibilité.
- **Boussole piste** : axe 064°/244° d'EBNM + flèche du vent au sol, avec
  composantes traversier / de face calculées.
- **Niveaux évolutifs** : Tandem (défaut) → Élève AFF → Brevet A → Brevet B/C/D,
  chaque niveau avec ses seuils de vent et de plafond, personnalisables.
- **Itinéraire** : boutons Google Maps et Waze vers la DZ (départ = position GPS).
- **Recoupement** : liens IRM et Windy en pied de page.
- Thème automatique jour/nuit (basé sur le lever/coucher réel du soleil),
  installable sur l'écran d'accueil, cache hors-ligne (dernières prévisions).

## Fiabilité v1.1

- **Confiance sur 3 modèles, toute la semaine** : DWD ICON (primaire) +
  Météo-France AROME (J0-J3) + ECMWF IFS 0.25° open-data (J0-J7). Avant,
  la comparaison s'arrêtait à J+3 (AROME) et l'app tournait "à l'aveugle"
  sur la seconde moitié de la fenêtre à 7 jours.
- **Faits vérifiés contre sources primaires** (août 2026) : coordonnées et
  altitude d'EBNM, et surtout l'**axe de piste 064°/244°** confirmés au
  degré près par le *Règlement d'aérodrome EBNM v004 (01/2024)* §3.1 ;
  horaires d'ouverture confirmés sur paraclubnamur.be en direct.
- **Tests automatisés** (`js/*.test.mjs`, Node natif, aucune dépendance) sur
  `scoring.js` et `ouverture.js` : calcul de Pâques, calendrier d'ouverture,
  verdicts météo, vent traversier, confiance multi-modèle. `npm test`.

## Fiabilité v1.2

Revue orientée « décider comme le ferait un club/moniteur expérimenté ».
Détail complet et sources dans [CHANGELOG.md](./CHANGELOG.md).

- **La limite de vent s'applique à la rafale, pas seulement à la moyenne**
  ("assume the worst case scenario at the time of landing" — pratique DZ
  standard) : un vent moyen sous le seuil avec des rafales au-dessus passe
  maintenant en rouge éliminatoire, plus en orange au mieux.
- **Spread rafales/moyenne gradué par niveau** (élève/tandem 9 km/h,
  Brevet A 13 km/h, Brevet B/C/D 18 km/h) plutôt qu'un seuil unique — un
  jumper expérimenté tolère un spread plus large qu'un élève.
- **Détection de hausse rapide du vent** d'une heure à l'autre.
- **La confiance multi-modèle influence le verdict**, pas seulement
  l'affichage : un fort désaccord entre modèles plafonne le verdict à
  orange, même si les seuils bruts seraient au vert.
- **Fraîcheur des données fiabilisée** : l'heure affichée est celle de la
  vraie dernière réponse réseau (en-tête HTTP), pas l'horloge de
  l'appareil — un bandeau rouge apparaît si les prévisions datent de plus
  de 90 min (mode hors-ligne prolongé).
- **Comparaisons d'heure ancrées sur Europe/Brussels** (pas le fuseau de
  l'appareil), timeout réseau (15 s) avec retour clair en cas d'échec.
- Suite de tests étendue à 42 cas (dont un nouveau `meteo.test.mjs` avec
  fetch simulé) + CI GitHub Actions sur chaque push/PR.
- Le **vent traversier reste volontairement informatif** (pas un seuil de
  sécurité perso) : un parachutiste atterrit face à la manche à air, pas à
  l'axe de piste — voir commentaire dans `scoring.js`.

## Calendrier d'ouverture encodé

- Week-ends et jours fériés belges (computus de Pâques inclus) :
  du 1er mars au 15 décembre, 8h30 → coucher du soleil.
- Vendredis de mai à septembre : dès 16h.

## Déploiement (GitHub Pages)

```bash
git init && git add . && git commit -m "Vent4000 v1"
git remote add origin git@github.com:gaustar/vent4000.git
git push -u origin main
```
Puis Settings → Pages → Deploy from branch → `main` / root.
Aucun build, aucune dépendance, aucune clé API.

## Architecture

```
index.html                Page unique, 3 vues (Semaine / Jour / Réglages)
css/style.css             Thèmes jour/nuit, profil vertical, boussole
js/config.js              DZ, piste, niveaux/seuils, liens
js/ouverture.js           Calendrier du club (pur, testable en Node)
js/ouverture.test.mjs     Tests (Pâques, fériés, créneaux)
js/scoring.js             Moteur « ça saute ? » (pur, testable en Node)
js/scoring.test.mjs       Tests (verdicts, rafales, tendance, confiance)
js/meteo.js               Fetch + parsing Open-Meteo (ICON + AROME + ECMWF)
js/meteo.test.mjs         Tests (fetch simulé : timeout, échecs, fraîcheur)
js/app.js                 UI et état
sw.js                     Service worker (offline)
.github/workflows/test.yml  CI : npm test sur chaque push/PR
CHANGELOG.md              Historique détaillé des versions
```

`scoring.js` et `ouverture.js` sont **sans dépendance DOM** : ils seront
importés tels quels par le futur script d'alerte Telegram (GitHub Actions,
cron jeudi/vendredi soir) — une seule source de vérité pour les seuils.

## Seuils par défaut (indicatifs)

| Niveau | Vent max sol | Plafond min |
|---|---|---|
| Tandem | 28 km/h | 1500 m |
| Élève AFF | 22 km/h | 2800 m |
| Brevet A | 33 km/h | 1400 m |
| Brevet B/C/D | 46 km/h | 1100 m |

⚠ Références internationales (USPA / pratiques DZ) — **la décision de sauter
appartient toujours au club et aux moniteurs.** À affiner avec eux.

## Sources (revue fiabilité v1.2)

- [USPA SIM](https://www.uspa.org/sim) — limites de vent par niveau/licence
- [Skydivemag — Winds Limits Part 1](https://www.skydivemag.com/new/winds-limits-part-1-what-every-skydiver-should-know/) — règle "gust = limite", spread par expérience
- [Skydivemag — Crosswind Landings](https://www.skydivemag.com/new/crosswind-landings/) · [Landing Priorities](https://www.skydivemag.com/new/landing-priorities/) — le crosswind piste n'est pas le facteur déterminant pour la sécurité d'atterrissage

## Pistes v2

- Alerte Telegram automatique (GitHub Actions) réutilisant `scoring.js`.
- Prix diesel sur le trajet (voir étude de faisabilité : options légales).
- Journal de sauts / progression AFF.
