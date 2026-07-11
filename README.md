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
index.html          Page unique, 3 vues (Semaine / Jour / Réglages)
css/style.css       Thèmes jour/nuit, profil vertical, boussole
js/config.js        DZ, piste, niveaux/seuils, liens
js/ouverture.js     Calendrier du club (pur, testable en Node)
js/scoring.js       Moteur « ça saute ? » (pur, testable en Node)
js/meteo.js         Fetch + parsing Open-Meteo (surface + niveaux hPa)
js/app.js           UI et état
sw.js               Service worker (offline)
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

## Pistes v2

- Alerte Telegram automatique (GitHub Actions) réutilisant `scoring.js`.
- Prix diesel sur le trajet (voir étude de faisabilité : options légales).
- Journal de sauts / progression AFF.
