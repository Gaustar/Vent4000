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
- **Niveaux évolutifs** : Tandem (défaut) → Élève AFF → Brevet A → Brevet B →
  Brevet C/D, chaque niveau avec ses seuils de vent et de plafond, personnalisables.
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

## v1.4 — outil de décision + refonte « instrument de vol »

Détail complet dans [CHANGELOG.md](./CHANGELOG.md).

- **Correction d'un faux vert** : un ciel totalement bouché (couverture
  100 %) ressortait VERT pour tous les niveaux, sans aucune raison
  affichée — il passait à travers la bande « partiellement couvert »
  (30-75 %) et le plafond estimé (3000 m) franchissait le seuil de tous
  les niveaux. Une couche compacte (≥ 85 % sur un étage) est maintenant
  éliminatoire, avec un message distinct pour la couche moyenne, qui
  contient l'altitude de largage. Les cirrus, eux, ne bloquent pas.
- **Meilleur créneau en tête** : jour, fenêtre horaire précise et chiffres
  clés, au lieu de cartes à comparer.
- **Fenêtres horaires** (« 14h → 17h ») et **motif bloquant par jour**,
  visibles sans ouvrir le détail.
- **Spot / dérive estimée** : dérive en chute, sous voile, totale, et cap
  à remonter depuis la zone de poser, calculés sur toute la colonne de
  vent. Hauteur d'ouverture par niveau (FFP DT49).
- **Tendance de la prévision** : ↗ s'améliore / ↘ se dégrade depuis la
  dernière consultation.
- **Confiance pondérée par l'échéance** : une prévision à J+6 ne vaut pas
  une prévision à J+1, même si les modèles s'accordent.
- **Thème sombre « planche de bord »**, variante claire automatique en
  journée. Vert/ambre/rouge strictement réservés aux données : l'accent
  interactif est bleu, plus rien ne concurrence le code couleur du verdict.

## Fiabilité v1.3 — seuils par brevet validés contre une source fédérale

Vérification demandée explicitement : « valider les seuils suivant les brevets,
comme le font les DZ avant d'imposer une limite ». Comparaison contre le
document fédéral le plus pertinent trouvé — FFP, *Directive Technique n°49*
(modifiée 15/04/2025), même nomenclature de brevets A/B/C/D que la Belgique
francophone. Citations exactes et détail complet dans
[CHANGELOG.md](./CHANGELOG.md).

- **Correction** : le document fixe explicitement « Limite maximale de vent
  au sol : 11 m/s » (39,6 km/h) pour le brevet B et pour le BPA (prérequis
  des brevets C et D) — c'est le plafond le plus élevé écrit noir sur blanc
  dans tout le document, brevets C et D inclus. Le seuil groupé
  « Brevet B/C/D » à 46 km/h (v1.2.0) autorisait donc un brevet B à sauter
  jusqu'à 6+ km/h au-dessus de ce plafond documenté. **Brevet B est
  maintenant séparé, à 39 km/h** (arrondi à l'entier inférieur — jamais
  vers le haut pour un seuil de sécurité).
- **Brevet C/D conserve 46 km/h** : aucun chiffre fédéral explicite ne
  couvre ce palier au-delà du BPA (autonomie complète) ; valeur cohérente
  avec la pratique DZ généralement observée pour les jumpers très
  expérimentés — reste à confirmer par le club, comme avant.
- **Élève AFF (22 km/h) inchangé** : déjà sous le plafond fédéral de
  progression (7 m/s = 25,2 km/h), marge de sécurité volontaire conservée.
- **Tandem (28 km/h) inchangé** : cette règle FFP ne couvre pas le tandem
  (pas un brevet de progression solo — le moniteur est aux commandes, pas
  le passager) ; seuil laissé au jugement DZ/matériel comme avant.
- **Brevet A (33 km/h) inchangé** : aucun chiffre fédéral explicite pour ce
  palier précis (entre la fin de progression à 7 m/s et le brevet B à
  11 m/s) — interpolation DZ raisonnable, non contredite par la source.
- **Plafond nuageux minimum** : aucune source chiffrée trouvée (FFP ou
  club) — reste une estimation DZ. Cohérence conservée avec les hauteurs
  d'ouverture minimales documentées par la FFP, qui décroissent avec
  l'expérience (1200 m progression/brevet A → 1000 m avant BPA → 850 m
  après BPA/brevet B) : brevet B est donc aligné sur brevet C/D (1100 m)
  plutôt que sur brevet A (1400 m).
- Recherche complémentaire : le club apparaît affilié à la FWCP (Fédération
  Wallonne des Clubs de Parachutisme, Spa) plutôt qu'à la FFP directement —
  leur règlement technique propre n'a pas pu être consulté en ligne pour
  confirmer ces chiffres au mot près. **À valider avec les moniteurs du
  club**, comme le rappelle déjà l'avertissement en pied de section.

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
js/config.test.mjs        Tests (invariants des seuils par brevet)
js/ouverture.js           Calendrier du club (pur, testable en Node)
js/ouverture.test.mjs     Tests (Pâques, fériés, créneaux)
js/scoring.js             Moteur « ça saute ? » (pur, testable en Node)
js/scoring.test.mjs       Tests (verdicts, rafales, nuages, fenêtres, confiance)
js/spot.js                Estimation de dérive / spot (pur)
js/spot.test.mjs          Tests (intégration du vent, caps, hypothèses)
js/tendance.js            Évolution de la prévision entre 2 consultations (pur)
js/tendance.test.mjs      Tests (amélioration / dégradation / stable)
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

| Niveau | Vent max sol | Plafond min | Source vent max |
|---|---|---|---|
| Tandem | 28 km/h | 1500 m | DZ/matériel (hors périmètre de la règle FFP — moniteur aux commandes) |
| Élève AFF | 22 km/h | 2800 m | DZ (sous le plafond fédéral de progression, 25,2 km/h) |
| Brevet A | 33 km/h | 1400 m | DZ, interpolation (aucun chiffre fédéral pour ce palier) |
| Brevet B | 39 km/h | 1100 m | **FFP DT49 : 11 m/s = 39,6 km/h** (arrondi ↓) |
| Brevet C/D | 46 km/h | 1100 m | DZ (aucun chiffre fédéral au-delà du BPA) |

⚠ Seuils **indicatifs**, vérifiés le 2026-09-19 contre la FFP (Fédération
Française de Parachutisme, *Directive Technique n°49*, même nomenclature de
brevets que la Belgique francophone) faute de règlement FWCP consulté en
ligne — **la décision de sauter appartient toujours au club et aux
moniteurs.** À confirmer avec eux, en particulier le seuil Brevet C/D qui
n'est adossé à aucun texte fédéral trouvé.

## Sources

- [FFP — Directive Technique n°49](https://www.ffp.asso.fr/wp-content/uploads/2025/04/Directive-Technique-49-modifiee-15-avril-2025.pdf) (modifiée 15/04/2025) — seuils de vent par brevet (7 m/s progression/brevet A, 11 m/s brevet B et BPA), hauteurs d'ouverture minimales par brevet
- [USPA SIM](https://www.uspa.org/sim) — limites de vent par niveau/licence (référence USPA générale)
- [Skydivemag — Winds Limits Part 1](https://www.skydivemag.com/new/winds-limits-part-1-what-every-skydiver-should-know/) — règle "gust = limite", spread par expérience
- [Skydivemag — Crosswind Landings](https://www.skydivemag.com/new/crosswind-landings/) · [Landing Priorities](https://www.skydivemag.com/new/landing-priorities/) — le crosswind piste n'est pas le facteur déterminant pour la sécurité d'atterrissage

## Pistes v2

- Alerte Telegram automatique (GitHub Actions) réutilisant `scoring.js`.
- Prix diesel sur le trajet (voir étude de faisabilité : options légales).
- Journal de sauts / progression AFF.
