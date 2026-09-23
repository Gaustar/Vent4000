# Vent4000 — Ça vaut le déplacement ?

PWA météo dédiée au parachutisme au **Paraclub de Namur** (aérodrome de
Namur/Temploux-Suarlée, EBNM).

La question n'est pas « ça saute ? » mais **« est-ce que ça vaut le
déplacement ? »** — ce qui n'est pas la même chose depuis Bouillon :
**113 km, 1h30, sans péage**, soit 226 km, ~3 h et ~34 € de diesel par
tentative. Une journée orange qu'on tenterait sans réfléchir en habitant à
15 minutes devient un pari à 34 €.

L'app affiche donc, pour chaque jour d'ouverture réel du club : le verdict
par rapport aux **seuils officiels belges**, la fenêtre horaire, la
confiance multi-modèle, et un **conseil de déplacement** chiffré.

> ⚠ **Ce que l'app ne fait pas.** Elle ne remplace pas le verdict du club.
> Le RSB FWCP autorise explicitement le Responsable Technique à durcir les
> limites, et le Paraclub pose sur les journées limites une **barrière
> d'expérience** (un nombre de sauts minimum) qui n'est pas prévisible
> depuis la météo. L'app sert à savoir **sur quoi se baser avant** que le
> club ne se prononce — et à savoir **quand décider** : le club publie sa
> banderole le matin même, dès 7h10.

## Ce que fait l'app

**Écran d'accueil** — la liste des jours d'ouverture réels du club, tous au
même niveau. L'app ne désigne plus un « meilleur créneau » : elle désignait
souvent un vendredi ou un dimanche alors que les sauts se font surtout le
samedi. Chaque ligne donne le verdict, la fenêtre horaire, le motif
bloquant et la tendance depuis la dernière consultation.

**Vue Jour** — tout le détail, seulement sur le jour sélectionné :

- **Conseil de déplacement** chiffré (226 km · 3 h · coût du jour) et, sur
  les journées limites, le rappel de la barrière d'expérience du club.
- **Timeline horaire** avec marqueur de forme (● ▲ ✕) en plus de la
  couleur, lisible en daltonisme rouge-vert.
- **Profil vertical du vent** : sol → 180/120/80 m AGL → 925/850/700/600 hPa
  (≈ largage 4000 m), avec direction, vitesse et température par niveau.
- **Spot / dérive estimée** : dérive en chute, sous voile, totale, plus le
  cap **et la distance** à remonter depuis la zone de poser.
- **Boussole piste** : axe 064°/244° d'EBNM, vent au sol et dérive.
- **Confiance multi-modèle** : DWD ICON (primaire) + Météo-France AROME
  (J0-J3) + ECMWF IFS 0.25° (J0-J7), confrontés **sur le vent moyen et sur
  les rafales**, avec pénalité d'échéance. Un désaccord fort plafonne le
  verdict à orange.

**Ce qui entre dans le verdict** — vent moyen et rafales au sol, vent
interpolé à la hauteur d'ouverture, plafond estimé, couches nuageuses par
étage, visibilité, précipitations, CAPE, hausse rapide du vent, écart entre
le relevé temps réel et la prévision de l'heure en cours, et l'accord entre
modèles. Rien n'est récupéré sans servir.

**Niveaux** : Tandem → Élève AFF → Brevet A → Brevet B → Brevet C/D, chacun
avec ses seuils, personnalisables dans les bornes légales.

**Le reste** : aucune permission demandée (ni géolocalisation ni
notifications), thème jour/nuit sur le lever/coucher réel, installable,
cache hors-ligne, liens IRM / Windy / briefing du club.

Historique détaillé version par version dans [CHANGELOG.md](./CHANGELOG.md).

## Calendrier d'ouverture encodé

Vérifié sur paraclubnamur.be (voir §3 du cadre réglementaire) :

- Week-ends et jours fériés belges (computus de Pâques inclus), du 1er mars
  au 15 décembre. Club ouvert dès 8h30, mais **le scoring démarre à 9h00** :
  8h30 est l'inscription, « les séances de saut débutent à 9h00 ».
- **Pleine saison** : deux créneaux, 9h → 14h puis 14h → coucher du soleil.
- **À partir du dernier dimanche d'octobre** (changement d'heure) : un seul
  créneau continu, 9h → coucher du soleil.
- Vendredis de mai à septembre : créneau unique dès 16h.

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
js/deplacement.js         « Ça vaut le trajet ? » — coût réel + quand décider (pur)
js/deplacement.test.mjs   Tests (jamais « pars » hors J+0, coût, fenêtre fragile)
js/carburant.js           Prix diesel officiel du jour (Statbel / SPF Économie)
js/carburant.test.mjs     Tests (extraction, repli réseau/cache/config)
js/meteo.js               Fetch + parsing Open-Meteo (ICON + AROME + ECMWF)
js/meteo.test.mjs         Tests (fetch simulé : timeout, échecs, fraîcheur)
js/app.js                 UI et état
sw.js                     Service worker (offline)
docs/                     Sources réglementaires archivées (CIR/GDF-05)
.github/workflows/test.yml  CI : npm test sur chaque push/PR
CHANGELOG.md              Historique détaillé des versions
```

`scoring.js` et `ouverture.js` sont **sans dépendance DOM** : ils seront
importés tels quels par le futur script d'alerte Telegram (GitHub Actions,
cron jeudi/vendredi soir) — une seule source de vérité pour les seuils.

## Cadre réglementaire — trois étages

### 1. Loi belge (contraignante, appliquée en dur)

**Circulaire CIR/GDF-05, Édition 4 du 03/06/2016** — Direction générale
Transport Aérien, SPF Mobilité et Transports. Copie archivée :
[`docs/CIR-GDF-05_ed4_20160603.pdf`](./docs/CIR-GDF-05_ed4_20160603.pdf), §6 :

> « Les sauts en parachute ne sont autorisés que dans les conditions
> météorologiques suivantes : a) Visibilité : minimum 3000 m ;
> b) Base de nuages : minimum 3000 ft AGL ; c) Vitesse du vent :
> maximum 25 kts de moyenne au sol. »

| Paramètre | Limite légale | Dans l'app |
|---|---|---|
| Vent **moyen** au sol | 25 kts = **46 km/h** | `LEGAL_BE.ventMoyenMaxSol` |
| Base de nuages | 3000 ft = **914 m AGL** | `LEGAL_BE.plafondMinAGL` |
| Visibilité | **3000 m** | `LEGAL_BE.visibiliteMin` |

Ces limites bornent les champs de réglage **et** sont retestées dans
`scoreHeure` : aucun réglage personnalisé, aucune évolution future des
seuils ne peut produire un feu vert sur un saut interdit. Le motif de
verdict est distinct (« hors limite légale ») pour ne pas se confondre
avec un dépassement de seuil personnel.

Noter le mot **moyenne** au point (c) : la règle « la limite s'applique à
la rafale » (pratique DZ, cf. Sources) est un durcissement de niveau, pas
la règle légale. Les deux tests sont séparés dans `scoring.js`.

### 2. Fédération — FWCP (contraignant pour le club)

La circulaire délègue explicitement : « Pour ce qui est des aspects
techniques non couverts par la présente circulaire, les intéressés se
réfèreront aux directives émises par les fédérations de parachutistes
reconnues par les Communautés. » Pour le Paraclub de Namur (Wallonie),
c'est la **FWCP**.

**Source : Règlement de Sécurité de Base (RSB) de la FWCP, version 2.1 —
juin 2026** (mise à jour 18/05/2026). Copie archivée :
[`docs/FWCP_RSB_v2.1_20260518.pdf`](./docs/FWCP_RSB_v2.1_20260518.pdf) ·
original : [fwcp.be](https://fwcp.be/learning-hub/safety/rsb).
Le RSB §3.1 est sans ambiguïté sur sa portée :

> « Le règlement de base de sécurité de la FWCP présente, pour les clubs
> qui y sont affiliés, une **obligation** et les déviations par rapport à
> celui-ci ne sont admises que sur dérogation écrite du Directeur
> Technique et du Président de la FWCP. »

**§3.4.2 Vent** — citation exacte :

> « Vitesse de vent maximum au sol permise :
> • Jusqu'au brevet B inclus : maximum **7 m/sec** ;
> • A partir du brevet B : maximum **12,86 m/sec. (25 nœuds)** (GDF 05)
> • Exception : sauts de nuit : maximum 7 m/sec. »

**§3.5 Altitudes de sécurité** :

> « Tout parachutiste doit avoir actionné l'ouverture de son parachute
> au-dessus de **3000 ft AGL**. »

→ Le barème belge n'a que **deux paliers**, pas cinq :

| Niveau | Vent max | Ouverture | Plafond min | Source |
|---|---|---|---|---|
| Tandem | 28 km/h | 1500 m | 1800 m | Club/matériel — hors barème §3.4.2 |
| Élève AFF | **25 km/h** | 1500 m | 1800 m | **RSB §3.4.2 — 7 m/s** |
| Brevet A | **25 km/h** | 1200 m | 1500 m | **RSB §3.4.2 — 7 m/s** |
| Brevet B | **25 km/h** | 914 m | 1214 m | **RSB §3.4.2 — 7 m/s** (lecture conservatrice, voir ci-dessous) |
| Brevet C/D | 46 km/h | 914 m | 1214 m | **RSB §3.4.2 — 12,86 m/s = 25 kts** |

#### L'ambiguïté du brevet B, levée par la fédération flamande

Le RSB place le brevet B des **deux** côtés de son barème (« jusqu'au
brevet B **inclus** » et « **à partir du** brevet B »). Le **Basis
Veiligheidsreglement de la VVP** (Vlaams Verbond van Paraclubs, homologue
flamand harmonisé avec la FWCP au sein de la FBP — cf. RSB §2.2) tranche,
section « Wind » :

> • **Tot en met B-brevet** : maximum **14 knopen**
> • **Vanaf C-brevet** : maximum **25 knopen**
> • Uitzondering nachtsprongen : maximum 14 knopen

Soit : jusqu'au brevet B inclus → 14 kts ; 25 kts à partir du brevet **C**.
Et 14 kts = 25,9 km/h ≈ les 7 m/s (25,2 km/h) de la FWCP — même valeur,
autre unité. Le « à partir du brevet B » du RSB est donc très probablement
une coquille pour « brevet C ». **Le brevet B reste à 25 km/h**, lecture
désormais corroborée plutôt que simplement prudente.

La VVP confirme également le plafond de 3000 ft AGL et la visibilité de
3 km : les trois textes (GDF-05, RSB FWCP, BVR VVP) concordent.

⚠ **Ce qu'aucun des deux règlements fédéraux ne dit** : si la limite porte
sur la **moyenne** ou sur la **rafale**. Seul GDF-05 précise « de
moyenne ». L'app applique le seuil de niveau à la rafale (durcissement DZ
documenté) et la limite légale à la moyenne. **Question ouverte pour le RT
— c'est celle qui te coûte le plus de journées.**

Les **plafonds sont dérivés**, jamais posés à la main :
`max(914 m, hauteur d'ouverture + MARGE_PLAFOND_OUVERTURE)`.
`MARGE_PLAFOND_OUVERTURE` (300 m) est le seul paramètre de jugement DZ
restant dans `config.js`.

### 3. Club — Paraclub de Namur

Le RSB prévoit lui-même cet étage : « chaque centre peut éditer chez lui
des règles plus restrictives » (§3.1) et « le Responsable Technique durant
les opérations peut imposer des limites plus sévères » (§3.4.2). Le club
durcit, jamais il n'assouplit.

Vérifié sur paraclubnamur.be le 2026-09-23 :

- **Saison et vendredis confirmés** — « ouvert les week-ends et jours
  fériés dès 8h30 […] de Mars à mi-décembre […] les vendredis dès 16h00
  **de mai à septembre** ».
- **Premier saut à 9h00, pas 8h30** — « les séances de saut au PCN
  **débutent à 9h00** et se terminent au coucher du soleil ». 8h30 est
  l'ouverture/inscription.
- **Journées continues en fin de saison** — « En pleine saison, les
  journées sont divisées en deux créneaux : de 8h30 à 14h00, puis de 14h00
  jusqu'au coucher du soleil. […] **À partir de fin octobre (avec le
  changement d'heure), les journées sont continues.** »
- **Ouverture élève à 1500 m** et **largage à 4000 m** confirmés par le
  club, ce qui valide `hauteurOuverture` et `altitudeLargage`.
- Le club publie une **banderole météo** sur sa page d'accueil le matin
  même (dès 7h10, 14h30 le vendredi), et un **briefing** dans l'espace
  membre. C'est le go/no-go opérationnel réel — l'app ne le remplace pas.

#### ⚠ Le club ne raisonne pas en seuils, mais en expérience

Constat tiré des briefings publiés dans l'espace membre du club (septembre
2026) : sur une journée limite, le Paraclub ne publie pas un vent maximum.
Il annonce que la météo est jouable **mais** pose une **barrière
d'expérience** — un nombre de sauts minimum pour être autorisé à décoller.

C'est la limite structurelle de cet outil :

- l'app raisonne par **brevet**, le club tranche par **carnet de sauts** ;
- la barrière dépend du jugement du responsable de séance, au jour le jour :
  elle n'est **pas prévisible** à partir des données météo ;
- donc un verdict **orange** ne signifie pas « ça passe pour toi », mais
  « ça passe peut-être, pour certains ».

L'app affiche cet avertissement sur tous les verdicts orange, avec un lien
vers le briefing. **Aucune évolution ne pourra lever cette limite** — seul
le briefing du club fait foi.

**La décision de sauter appartient toujours au Paraclub et aux moniteurs.**

### Ce qui reste à faire confirmer par le RT

Classé par impact réel sur les journées affichées :

1. 🔴 **Moyenne ou rafale ?** Ni le RSB ni le BVR ne le précisent ; seul GDF-05 dit « moyenne ». L'app teste la **rafale** contre le seuil de niveau — plus strict que le texte, donc des journées légales sortent rouges. C'est le réglage qui coûte le plus de week-ends.
2. 🔴 **`MARGE_PLAFOND_OUVERTURE` = 300 m.** Aucune source ne fixe de plafond nuageux par niveau ; cette marge est un choix de conception, et elle détermine tous les `plafondMin`.
3. 🟠 **`ventOuvertureOrange` = 40 km/h** à la hauteur d'ouverture. Règle de bon sens (une voile école avance à 35-45 km/h), sans source fédérale. Dégrade seulement en orange.
4. 🟠 **Tandem 28 km/h** : hors barème FWCP, et au-dessus des 25 km/h d'un solo jusqu'au brevet B.
5. ⚪️ **Brevet B** : levé par le BVR VVP (voir ci-dessus), mais autant le faire confirmer.

## Sources

- **[Circulaire CIR/GDF-05 Éd. 4 (03/06/2016)](https://mobilit.belgium.be/fr/regulation/circulaire-gdf-05)** — DGTA / SPF Mobilité et Transports. **Source légale applicable en Belgique** : §6, conditions météo des sauts (25 kts moyen, 3000 ft, 3000 m). Copie archivée dans [`docs/`](./docs/).
- **[FWCP — Règlement de Sécurité de Base v2.1 (juin 2026)](https://fwcp.be/learning-hub/safety/rsb)** — **source fédérale applicable au Paraclub de Namur** : §3.4.2 vent par brevet, §3.4.1 visibilité/nuages, §3.5 altitudes de sécurité. Copie archivée dans [`docs/`](./docs/).
- **[VVP — Basis Veiligheidsreglement](https://docs.google.com/document/d/e/2PACX-1vQopCCA2u-XuuWaWGqB43-DJXsBG-JFCEcaUkdsIsax71XARH3qG4CmEkTz3be8gdH4YoQKBFrzCaiR/pub)** (Vlaams Verbond van Paraclubs) — homologue flamand harmonisé avec la FWCP au sein de la FBP. Lève l'ambiguïté du brevet B (« Tot en met B-brevet : 14 knopen / Vanaf **C**-brevet : 25 knopen ») et confirme 3000 ft / 3 km. ⚠ Document vivant publié via Google Docs, susceptible d'évoluer sans historique : citation relevée le 2026-09-23.
- [paraclubnamur.be](https://paraclubnamur.be) — saison, créneaux, heure réelle de début des séances, journées continues de fin octobre, hauteur d'ouverture élève.
- **[Statbel — Tarif officiel des produits pétroliers](https://bestat.statbel.fgov.be/bestat/crosstable.xhtml?view=9e9cf394-6c54-4d81-8013-7124a8c4bf15)** (Direction générale de l'Énergie, SPF Économie) — prix maximum légal du diesel B7, mis à jour quotidiennement, CC BY 4.0. Consommé en direct par l'app.
- [FFP — Directive Technique n°49](https://www.ffp.asso.fr/wp-content/uploads/2025/04/Directive-Technique-49-modifiee-15-avril-2025.pdf) — fédération **française**, utilisée en substitution jusqu'en v1.5.0, **remplacée** par le RSB FWCP en v1.6.0. Conservée ici pour la traçabilité des anciennes valeurs.
- [USPA SIM](https://www.uspa.org/sim) — limites de vent par niveau/licence (référence USPA générale)
- [Skydivemag — Winds Limits Part 1](https://www.skydivemag.com/new/winds-limits-part-1-what-every-skydiver-should-know/) — règle "gust = limite", spread par expérience
- [Skydivemag — Crosswind Landings](https://www.skydivemag.com/new/crosswind-landings/) · [Landing Priorities](https://www.skydivemag.com/new/landing-priorities/) — le crosswind piste n'est pas le facteur déterminant pour la sécurité d'atterrissage

## Pistes v2

- **Alerte Telegram automatique** (GitHub Actions, cron jeudi soir)
  réutilisant `scoring.js` et `deplacement.js` — tous deux purs et sans
  dépendance DOM, précisément pour ça.
- Réglage « mes sauts » pour contextualiser les verdicts orange face à la
  barrière d'expérience du club (saisie manuelle : l'app n'a pas accès au
  carnet de sauts).
- Journal de sauts / progression AFF.

*(Le prix du diesel sur le trajet est fait depuis la v1.8.0 — source
officielle Statbel, cf. `js/carburant.js`.)*
