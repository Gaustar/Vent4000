# Vent4000 — Ça vaut le déplacement ?

PWA météo dédiée au parachutisme au **Paraclub de Namur** (aérodrome de
Namur/Temploux-Suarlée, EBNM).

La question n'est pas « ça saute ? » mais **« est-ce que ça vaut le
déplacement ? »** — ce qui n'est pas la même chose à 15 minutes du
terrain et à 1h30 de route. Une journée orange qu'on tenterait sans
réfléchir en voisin devient un pari : des heures et un plein. Chaque
membre saisit **son** trajet dans les réglages (facultatif, stocké sur son
téléphone uniquement) ; sans trajet, le conseil reste, sans coût affiché.

L'app affiche donc, pour chaque jour d'ouverture réel du club, le verdict
selon les **règles écrites** (loi belge, règlement FWCP, par brevet),
appliquées aux **données les plus précises disponibles pour la zone**, le
nombre de sources qui valident la fenêtre, et un **conseil de déplacement**
chiffré. **Aucune spéculation** : aucun seuil inventé, aucune valeur
estimée, aucune pondération arbitraire.

> ⚠ **Ce que l'app ne fait pas.** Elle ne remplace pas le verdict du club.
> Le RSB FWCP autorise explicitement le Responsable Technique à durcir les
> limites, et le Paraclub pose sur les journées limites une **barrière
> d'expérience** (un nombre de sauts minimum) qui n'est pas prévisible
> depuis la météo. L'app sert à savoir **sur quoi se baser avant** que le
> club ne se prononce — et à savoir **quand décider** : le club publie
> l'état des activités le matin même sur sa page météo, jamais la veille.

## Ce que fait l'app (v2.4)

**Écran d'accueil** — l'observation réelle de Charleroi (METAR), l'**état
des activités publié par le club** (repris mot pour mot, avec le prochain
point météo et le start prévu), puis une carte par jour d'ouverture : verdict, fenêtre horaire, nombre de sources
qui valident toute la fenêtre (ex. « 5/5 »), règle en cause, tendance, et
une bande horaire (couleur = verdict, hauteur = part des sources favorables).
Les jours couverts seulement par les modèles 7-10 km sont étiquetés.

**Vue Jour** — verdict, conseil de déplacement, METAR (aujourd'hui) et TAF
de Charleroi (s'il couvre le jour), puis un **tableau horaire** règle ×
heure (vent moyen et rafales en plage min–max des sources, direction,
plafond, visibilité, orage, précipitations, précision des données). Pour
l'heure choisie : chaque règle avec sa **source réglementaire** et son
statut, le **tableau des sources** (valeurs de chacune et son verdict
propre), le vent en altitude (information) et le vent par rapport à la piste.

### Les règles (et rien d'autre)

| Règle | Texte | Tous | Jusqu'au brevet B (élève, tandem passager) | Brevet C/D |
|---|---|---|---|---|
| Vent moyen au sol | CIR/GDF-05 §6 c | ≤ 25 kts (46 km/h) | | |
| Vent au sol par brevet | RSB FWCP §3.4.2 | | ≤ 7 m/s (25 km/h) | ≤ 25 kts (46 km/h) |
| Base des nuages | CIR/GDF-05 §6 b · RSB §3.4.1 | ≥ 3000 ft (914 m) | | |
| Visibilité | CIR/GDF-05 §6 a · RSB §3.4.1 | ≥ 3 km | | |
| Ouverture | RSB §3.5 · §6.4.1 | ≥ 3000 ft | tandem ≥ 5000 ft ; AFF ~1500 m (club) | |

- La limite du brevet est appliquée au vent moyen **et à la rafale** (le
  RSB dit « vitesse de vent » sans préciser).
- Le passager tandem n'a pas de brevet : la seule ligne du barème qui le
  couvre est « jusqu'au brevet B inclus ».
- Sans seuil écrit, donc jamais rouges à elles seules : **pluie**,
  **cumulonimbus**, couche entre le plancher légal et l'altitude
  d'ouverture du niveau → orange, « à l'appréciation du RT ». L'**orage**
  est rouge (le vol de largage doit rester en VMC, GDF-05 §6).
- Le seul réglage personnel est un vent max **plus strict** que le
  règlement (le RT peut durcir, jamais assouplir).

### Les sources (de la plus précise à la moins précise)

1. **METAR Charleroi (EBCI, 22 km)** — observation réelle ; pour l'heure en
   cours, elle tranche seule sur tout ce qu'elle mesure.
2. **TAF Charleroi** — prévision officielle d'aérodrome (prévisionnistes),
   jusqu'à 30 h : plafond, visibilité, vent, temps présent ; ses variations
   TEMPO / PROB sont prises en compte.
3. **Modèles 1,3-2,2 km** — AROME HD, ICON-D2, HARMONIE KNMI, HARMONIE DMI,
   UKMO 2 km, au point de grille le plus proche de la piste, jusqu'à ≈ J+2.
   **HARMONIE DMI et UKMO calculent la base des nuages** ; pour les autres,
   le plafond n'est connu que s'il n'y a pas de couche basse ≥ 5/8 (alors,
   par définition, aucun plafond sous ~2 km). Sinon : « non vérifiable ».
4. **Modèles régionaux 7-10 km** — ICON-EU, ECMWF IFS, ARPEGE, uniquement
   quand aucun modèle 2 km ne couvre l'heure ; signalés comme moins précis.

Supprimés en v2.1 parce qu'ils reposaient sur des hypothèses : plafond
estimé par formule, probabilité pondérée et ensembles, seuils sans texte
(vent en altitude, gradient, froid, givrage, thermiques), estimation de
dérive et de séparation.

### La décision

Pour chaque heure et chaque règle : **respectée** si aucune source ne la
viole ; **non respectée** si plus de la moitié des sources la violent ;
**sources divergentes** sinon ; **non vérifiable** si aucune source précise
ne fournit la donnée. Rouge = une règle non respectée ; orange = une règle
divergente, non vérifiable ou à apprécier ; vert = tout est respecté. Un
créneau est sautable s'il offre **2 h consécutives**.

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

**Planning réel du club (v2.4).** Quand le relais répond, les jours listés
par le club sur sa page météo publique priment sur ce calendrier habituel
(`ouvertureReelle`, `js/ouverture.js`) :

- jour listé : ouvert, même hors calendrier habituel (« ouverture
  exceptionnelle », une journée continue) ; un « start prévu » plus
  tardif que 9h00 décale le début des créneaux ;
- jour habituel **absent** d'un planning qui le couvre (du lendemain de
  la lecture au dernier jour listé) : fermé, et signalé sous la liste ;
- le jour même n'est jamais déclaré fermé par absence (à vérifier un jour
  d'opération : la page liste-t-elle le jour en cours ?) ;
- relais en panne, hors-ligne sans copie de moins de 12 h, ou au-delà du
  dernier jour listé : calendrier habituel, annoncé comme tel.

## Déploiement (GitHub Pages)

```bash
git init && git add . && git commit -m "Vent4000 v1"
git remote add origin git@github.com:gaustar/vent4000.git
git push -u origin main
```
Puis Settings → Pages → Deploy from branch → `main` / root.
Aucun build, aucune dépendance, aucune clé API.

### Relais de la page du club (Cloudflare Worker)

`relais/worker.js` lit la page météo **publique** du club
(`paraclubnamur.be/fr/meteo` : pas d'API, pas de CORS) avec le même code
que l'app (`js/club.js`) et renvoie du JSON. En ligne sur
`https://vent4000-club.gaustar.workers.dev/club` (compte Cloudflare de
le mainteneur, offre gratuite). Copie gardée 2 min : au plus ~720 lectures par
jour sur le site du club. Rien de l'espace membre n'est lu.

```bash
cd relais && npx wrangler@4 deploy   # après `npx wrangler@4 login`
```

## Architecture

```
index.html                Page unique, 3 vues (Semaine / Jour / Réglages)
css/style.css             Thèmes jour/nuit, cartes, tableau horaire, sources
js/config.js              Règles citées (GDF-05, RSB FWCP), niveaux, sources, club
js/meteo.js               Acquisition : 8 modèles, profil ICON, METAR + TAF
js/metar.js               Lecture METAR / TAF (groupes BECMG, TEMPO, PROB, FM) (pur)
js/regles.js              Règles appliquées à une source (pur)
js/scoring.js             Combinaison des sources → verdict, fenêtres (pur)
js/ouverture.js           Calendrier du club (pur)
js/tendance.js            Évolution de la prévision entre 2 consultations (pur)
js/deplacement.js         « Ça vaut le trajet ? » — coût réel + quand décider (pur)
js/carburant.js           Prix diesel officiel du jour (Statbel / SPF Économie)
js/club.js                Page météo publique du club : lecture + chargement via le relais (pur)
js/fixtures/              Page du club relevée (tests)
relais/                   Cloudflare Worker qui lit la page du club (CORS)
js/*.test.mjs             Tests Node (npm test)
js/app.js                 UI et état
sw.js                     Service worker (offline, réseau d'abord pour la météo)
docs/                     Sources réglementaires archivées (CIR/GDF-05, RSB FWCP)
.github/workflows/test.yml  CI : npm test sur chaque push/PR
CHANGELOG.md              Historique détaillé des versions
```

Tout le moteur (`metar`, `regles`, `scoring`, `ouverture`) est **sans dépendance DOM** : ils seront
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
- Le club publie l'**état des activités** le matin même (« aucune décision
  liée à la météo n'est prise la veille des sauts »). C'est le go/no-go
  opérationnel réel — l'app ne le remplace pas. Voir ci-dessous la page
  météo refaite en octobre 2026.

#### Page météo du club (refaite en octobre 2026, relue le 2026-10-25)

Deux versions : publique (`paraclubnamur.be/fr/meteo`, remplace la
banderole de la page d'accueil, que la FAQ cite encore) et membres
(`pro.paraclubnamur.be/fr/meteo`, connexion requise — c'est elle que
l'app ouvre). On y trouve :

- **État des activités** (relevé : « Fermé » ; les autres états ne sont
  visibles qu'un jour d'opération) et date de dernière mise à jour ;
- **Prochains jours d'ouverture**, avec l'heure du **point météo** et le
  **start prévu** (8h30 sur tous les jours affichés) ;
- **Limite de sauts** (membres) : la barrière d'expérience décrite
  ci-dessous est désormais publiée, avec cette réserve du club : la limite
  affichée est « celle qui était valable au moment de la dernière mise à
  jour » ;
- **METAR et TAF de Charleroi (EBCI)** (membres), avec un décodage « à
  titre indicatif ». Ce sont les deux sources d'observation de l'app ; le
  décodage de l'app a été comparé à celui du club sur les messages du
  2026-10-25 (vent, rafales, nuages, groupe TEMPO, heures locales) :
  identique.

Ce que l'app ne peut pas en tirer automatiquement : les pages sont
rendues côté serveur, sans API ni en-tête CORS, et la version membres
demande une connexion. **Depuis la v2.4**, un relais (voir « Déploiement »)
lit la page **publique** : état des activités, point météo et planning
s'affichent dans l'app. La limite de sauts reste réservée aux membres
(choix de le mainteneur, 2026-10-25) : l'app renvoie vers la page membres et
précise que son calendrier est le calendrier **habituel**.

**Le calendrier réel a des exceptions** que l'app ignore : club fermé le
week-end du 24-25 octobre 2026 (absent des « prochains jours
d'ouverture ») ; l'Agenda public du site membres annonce aussi des
fermetures (4-6 septembre 2026) et des ouvertures en semaine (24-28 août,
1-2 septembre 2026).

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
vers la page météo du club, où la **limite de sauts** du jour est publiée
depuis octobre 2026. Elle reste imprévisible à l'avance : seule la page du
club fait foi.

**La décision de sauter appartient toujours au Paraclub et aux moniteurs.**

### Ce qui reste à faire confirmer par le RT

Recherche du 2026-10-13 dans les textes d'origine : aucun texte belge ne
répond aux questions 1 à 4. Les réponses ne peuvent venir que du RT.

1. 🔴 **Moyenne ou rafale ?** GDF-05 §6 dit « 25 kts de moyenne » ; le RSB
   FWCP (§3.4.2) et le BVR flamand disent « vitesse du vent » / « grondwind »
   sans préciser ; la DT49 française ne contient pas le mot « rafale ». Seul
   texte trouvé qui parle de rafales : le manuel britannique (suspension des
   sauts après deux rafales au-dessus de la limite en cinq minutes).
   **L'app applique la limite du brevet à la rafale aussi, et l'annonce
   comme sa prudence, pas comme une règle écrite.**
2. 🟠 **Tandem** : le RSB §6.4.1.1 renvoie aux « instructions des
   constructeurs ». Le manuel UPT Sigma donne une plage *optimale* de 5 à
   20 mph, pas de maximum chiffré. L'app applique 7 m/s (palier « jusqu'au
   brevet B inclus »). Repère étranger : 20 kts au Royaume-Uni.
3. 🟠 **Couche sous l'altitude d'ouverture** (tandem 5000 ft, AFF ~1500 m) :
   rien dans GDF-05 ni dans le RSB ; l'app met orange. Repère étranger : au
   Royaume-Uni, pas de sortie d'avion si le sol n'est pas visible entre le
   point d'ouverture et la zone de posé.
4. 🟠 **« Base de nuages » : toute couche, ou plafond ?** La loi écrit
   « base de nuages », le RSB « couverture nuageuse », le BVR « plafond ».
   L'app ne retient qu'une couche ≥ 5/8 (définition OACI du plafond,
   Annexe 2 : couche couvrant plus de la moitié du ciel). Des nuages épars
   sous 3000 ft ne bloquent donc pas le verdict.
5. 🟠 **Premier saut à 8h30 ou 9h00 ?** L'ancien site disait « les séances
   de saut débutent à 9h00 » ; la nouvelle page météo affiche « start
   prévu 8h30 ». L'app garde 9h00 tant que le sens de « start » n'est pas
   confirmé (ouverture ou premier décollage).
6. ✅ **Brevet B** : tranché par le BVR VVP (« Tot en met B-brevet : 14
   knopen / Vanaf C-brevet : 25 knopen »), relu le 2026-10-13.

### Limites des sources de données

- **Base des nuages** : sur 13 modèles interrogés (Open-Meteo, 2026-10-13),
  seuls HARMONIE DMI et UKMO 2 km la fournissent. Au-delà de leur portée
  (≈ J+2), le plafond n'est vérifiable que si aucune couche basse ≥ 5/8
  n'est prévue ; AROME HD et ARPEGE ne fournissent pas la visibilité. D'où
  les sources « partielles ».
- **Open-Meteo** : gratuit pour un usage non commercial (site ou app sans
  abonnement ni publicité), moins de 10 000 appels par jour, CC BY 4.0.
- **MET Norway** : leurs conditions demandent qu'une app navigateur passe
  par un serveur relais ; l'appel direct est toléré à faible volume. À
  revoir si l'app est adoptée par tout le club.

## Sources

- **[Circulaire CIR/GDF-05 Éd. 4 (03/06/2016)](https://mobilit.belgium.be/fr/regulation/circulaire-gdf-05)** — DGTA / SPF Mobilité et Transports. **Source légale applicable en Belgique** : §6, conditions météo des sauts (25 kts moyen, 3000 ft, 3000 m). Copie archivée dans [`docs/`](./docs/).
- **[FWCP — Règlement de Sécurité de Base v2.1 (juin 2026)](https://fwcp.be/learning-hub/safety/rsb)** — **source fédérale applicable au Paraclub de Namur** : §3.4.2 vent par brevet, §3.4.1 visibilité/nuages, §3.5 altitudes de sécurité. Copie archivée dans [`docs/`](./docs/).
- **[VVP — Basis Veiligheidsreglement](https://docs.google.com/document/d/e/2PACX-1vQopCCA2u-XuuWaWGqB43-DJXsBG-JFCEcaUkdsIsax71XARH3qG4CmEkTz3be8gdH4YoQKBFrzCaiR/pub)** (Vlaams Verbond van Paraclubs) — homologue flamand harmonisé avec la FWCP au sein de la FBP. Lève l'ambiguïté du brevet B (« Tot en met B-brevet : 14 knopen / Vanaf **C**-brevet : 25 knopen ») et confirme 3000 ft / 3 km. ⚠ Document vivant publié via Google Docs, susceptible d'évoluer sans historique : citation relevée le 2026-09-23.
- **[Open-Meteo](https://open-meteo.com)** — modèles AROME HD (Météo-France), ICON-D2 et ICON-EU (DWD), HARMONIE-AROME (KNMI, DMI), UKMO 2 km (Met Office), ECMWF IFS, ARPEGE. Gratuit, sans clé, CORS ouvert.
- **[MET Norway — tafmetar](https://api.met.no/weatherapi/tafmetar/1.0/documentation)** — METAR et TAF de Charleroi (EBCI), CORS ouvert.
- [paraclubnamur.be](https://paraclubnamur.be) — saison, créneaux, heure réelle de début des séances, journées continues de fin octobre, hauteur d'ouverture élève.
- **[Statbel — Tarif officiel des produits pétroliers](https://bestat.statbel.fgov.be/bestat/crosstable.xhtml?view=9e9cf394-6c54-4d81-8013-7124a8c4bf15)** (Direction générale de l'Énergie, SPF Économie) — prix maximum légal du diesel B7 et des essences 95 E10 / 98 E5, mis à jour quotidiennement, CC BY 4.0. Consommé en direct par l'app.
- [FFP — Directive Technique n°49](https://www.ffp.asso.fr/wp-content/uploads/2025/04/Directive-Technique-49-modifiee-15-avril-2025.pdf) — fédération **française**, utilisée en substitution jusqu'en v1.5.0, **remplacée** par le RSB FWCP en v1.6.0. Conservée ici pour la traçabilité des anciennes valeurs.
- [British Skydiving — Operations Manual (juin 2026), Section 8](https://britishskydiving.org/operations-manual/) — fédération **britannique**, non applicable en Belgique ; seul texte trouvé qui traite les rafales (§2.2), le tandem (20 kts, §2.1.2) et la vue du sol (§3.1).
- [UPT — manuel Sigma (MAN-013)](https://paraorg.dfv.aero/uploads/manual_sigma_man-013.pdf) — constructeur tandem : plage de vent « optimale » 5-20 mph, sans maximum chiffré.
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
