# Changelog

Toutes les versions notables du projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [SemVer](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).

## [1.7.0] — 2026-09-23

L'app change de question. Elle répondait à « ça saute ? » ; elle répond
maintenant à **« est-ce que ça vaut le déplacement ? »** — ce qui n'est pas
la même chose quand on habite à 113 km de la DZ.

### Ajouté — arbitrage du déplacement (`js/deplacement.js`)

- **Coût réel affiché** : Bouillon → Paraclub Namur = 113 km / 1h30 sans
  péage (relevé Google Maps), soit **226 km, ~3 h et ~34 €** de diesel par
  tentative au prix belge actuel (2,50 €/L, record de septembre 2026).
  L'arbitrage devient concret au lieu de rester théorique.
- **Conseil contextuel** — « Ça vaut le déplacement » / « Pari ouvert » /
  « Garde le créneau » / « Trop tôt pour décider » / « N'y va pas » —
  construit sur quatre éléments que l'app calcule déjà : verdict, durée de
  la fenêtre, confiance multi-modèle et échéance.
- **Deux faits du club structurent la logique**, tous deux sourcés dans la
  FAQ de paraclubnamur.be :
  - le club publie sa banderole météo « le matin même (à partir de 7h10 et
    non la veille) » → le vrai point de décision est le matin de jour J.
    **« Partir » n'est donc jamais proposé pour un autre jour
    qu'aujourd'hui** (verrouillé par test) ; au-delà, on planifie ;
  - le club pratique le standby — « nous attendrons que les conditions
    s'améliorent au cours de la journée […] le parachutisme est un sport de
    patience » → un déplacement sur journée moyenne n'est pas binaire, ce
    qui rend une fenêtre **longue** bien plus précieuse qu'une fenêtre
    courte à verdict égal.
- **Périmètre explicite** : les seuils sont sourcés (GDF-05, RSB FWCP),
  l'arbitrage du trajet ne l'est pas et ne le sera jamais — c'est une
  tolérance au risque personnelle. Le module ne prétend pas remplacer le
  verdict du club ; il dit sur quoi se baser avant qu'il ne tombe.

### Performance

- **Mémo du calcul hebdomadaire.** `rendreJour` relançait
  `joursOuvertsScores()` à chaque tap sur une heure — 7 jours × ~14 h de
  scoring complet, profil de vent inclus depuis la v1.6.0 — pour une
  interaction qui ne change rien au résultat. Clé d'invalidation : jeu de
  prévisions, seuils effectifs, date et heure courante.

### Modifié

- `manifest.json` : description alignée sur la vraie question de l'app et
  sur ses sources réglementaires.

## [1.6.0] — 2026-09-23

Le **règlement fédéral belge a été retrouvé** — il existe, il est publié,
et il contredit plusieurs seuils de l'app. Plus : tout ce que l'app
récupérait sans jamais s'en servir entre désormais dans la décision.

### Ajouté — étage fédéral FWCP (remplace la FFP française)

- **RSB FWCP v2.1 (juin 2026)** intégré et archivé dans
  `docs/FWCP_RSB_v2.1_20260518.pdf`. Introuvable via les moteurs de
  recherche ; publié sur fwcp.be → Hub de Formation → Sécurité. §3.1 :
  le règlement est une **obligation** pour les clubs affiliés, dont Namur.

### Corrigé (sécurité : seuils PLUS PERMISSIFS que le règlement belge)

- **Brevet A : 33 → 25 km/h.** Le RSB §3.4.2 fixe 7 m/s (25,2 km/h)
  « jusqu'au brevet B inclus ». L'app autorisait **8 km/h de plus** que la
  limite fédérale réelle. La valeur 33 venait d'une interpolation FFP
  française sans existence en droit belge.
- **Brevet B : 39 → 25 km/h**, même règle (lecture conservatrice de
  l'ambiguïté de la source — voir ci-dessous).
- **Hauteur d'ouverture brevets B et C/D : 850 → 914 m.** Le RSB §3.5
  impose 3000 ft AGL **pour tous** ; les 850 m hérités de la FFP étaient
  **sous le minimum belge**. Répercuté sur les plafonds dérivés.
- **Élève AFF : 22 → 25 km/h** — alignement sur la valeur fédérale
  (assouplissement de 3 km/h ; l'ancienne marge n'était pas documentée).
- **Brevet C/D : 46 km/h inchangé** — mais désormais sourcé deux fois
  (RSB §3.4.2 *et* GDF-05, qui est la même limite de 25 kts).

⚠ **Ambiguïté de la source, non résolue** : le brevet B figure des deux
côtés du barème (« jusqu'au brevet B **inclus** : 7 m/s » / « **à partir
du** brevet B : 25 kts »). Lecture conservatrice retenue. **À faire
trancher par le Responsable Technique du club.**

### Corrigé (créneaux du club, vérifiés sur paraclubnamur.be)

- **Le scoring démarre à 9h00, plus à 8h30.** « Les séances de saut au PCN
  débutent à 9h00 » ; 8h30 est l'heure d'ouverture/inscription. L'app
  proposait des fenêtres 8h-9h pendant lesquelles personne ne saute.
- **Journées continues à partir du changement d'heure de fin octobre** :
  « À partir de fin octobre […] les journées sont continues, de 8h30
  jusqu'au coucher du soleil. » L'app coupait toujours à 14h, ce qui
  fractionne une journée continue et peut faire manquer une fenêtre à
  cheval sur 14h (la règle des 2 h s'applique par créneau).
- Saison, vendredis mai→septembre, ouverture élève à 1500 m et largage à
  4000 m : **confirmés** par le club, sans changement.

### Ajouté — la barrière d'expérience du club

Constat tiré des briefings de l'espace membre `pro.paraclubnamur.be`
(septembre 2026) : le club ne publie **pas de seuil de vent**. Sur une
journée jouable mais limite, il annonce une **barrière d'expérience** —
un nombre de sauts minimum pour être autorisé à décoller. La variable de
décision réelle n'est donc pas le brevet — c'est le carnet de sauts, que
l'app ne connaît pas et ne peut pas prévoir (la barrière dépend du jugement
du responsable de séance au jour le jour).

Conséquence : un verdict **orange** ne veut pas dire « ça passe pour toi »,
mais « ça passe peut-être, pour certains ». Un avertissement explicite
apparaît désormais sur les verdicts orange (vue Semaine et vue Jour), avec
un lien direct vers le briefing. C'est la limite structurelle de l'app,
maintenant dite à l'écran plutôt que supposée connue.

### Corrigé (données collectées puis jetées)

- **La confiance ignorait les rafales.** `wind_gusts_10m` était demandé à
  AROME et ECMWF depuis la v1.1 mais jamais parsé : la comparaison
  multi-modèle ne portait que sur le vent **moyen**, alors que c'est la
  **rafale** qui élimine une heure. L'app pouvait afficher « confiance
  haute » sur un verdict décidé par une variable que les modèles
  n'avaient jamais confrontée. La confiance retient maintenant le pire
  désaccord des deux.
- **La colonne de vent ne pesait rien dans le verdict.** Les vents à
  80/120/180 m et 925/850/700/600 hPa étaient récupérés, affichés et
  intégrés au calcul de dérive, sans jamais influencer le go/no-go : une
  journée calme au sol avec 90 km/h à 4000 m ressortait **verte**. Le vent
  interpolé à la hauteur d'ouverture dégrade désormais en orange au-delà
  de `ventOuvertureOrange` (40 km/h) — seuil de bon sens aérologique, sans
  source fédérale, à confirmer par le RT.
- **Le nowcast ne contredisait jamais la prévision.** Le relevé « maintenant »
  est désormais confronté à la prévision de l'heure en cours ; un écart de
  plus de `ecartNowcastOrange` (10 km/h) dégrade et s'affiche.
- **Direction des modèles de comparaison supprimée** : parsée à chaque
  heure, jamais lue. Elle ne peut pas entrer dans `niveauConfiance`, dont
  l'écart est en km/h — mélanger degrés et km/h n'aurait aucun sens. Elle
  n'est plus ni demandée ni stockée.

### Tests

- 88 → **96 tests**. Nouveaux : barème FWCP à deux paliers, plancher
  d'ouverture 3000 ft, confiance sur les rafales, comptage des modèles,
  vent à l'ouverture, nowcast vs prévision, journée continue de fin
  octobre, dernier dimanche d'octobre sur 4 ans.

## [1.5.0] — 2026-09-23

Intégration du **cadre légal belge**, qui manquait complètement : jusqu'ici
l'app s'appuyait sur la FFP (fédération **française**) faute d'avoir trouvé
la source applicable. Elle existe, elle est belge, elle est contraignante.

### Ajouté — étage légal (CIR/GDF-05)

- **`LEGAL_BE` dans `config.js`** : transcription de la circulaire
  **CIR/GDF-05, Éd. 4 du 03/06/2016** (Direction générale Transport Aérien,
  SPF Mobilité et Transports), §6 — copie archivée dans
  `docs/CIR-GDF-05_ed4_20160603.pdf` :
  > « Les sauts en parachute ne sont autorisés que dans les conditions
  > météorologiques suivantes : a) Visibilité : minimum 3000 m ;
  > b) Base de nuages : minimum 3000 ft AGL ; c) Vitesse du vent :
  > maximum 25 kts de moyenne au sol. »

  Soit **46 km/h**, **914 m AGL**, **3000 m**.
- **Hiérarchie à trois étages** explicitée dans l'app (vue Réglages) :
  loi belge → fédération (FWCP pour Namur) → club. La circulaire le dit
  elle-même : « Pour ce qui est des aspects techniques non couverts par la
  présente circulaire, les intéressés se réfèreront aux directives émises
  par les fédérations de parachutistes reconnues par les Communautés. »
  Les seuils par brevet restent donc FFP DT49 **en substitution**, à faire
  confirmer par la FWCP.
- **Motifs de verdict distincts** : « hors limite légale » ne se confond
  plus avec « au-dessus de ton seuil perso ».

### Corrigé (sécurité : réglages pouvant autoriser un saut illégal)

- **Le champ « vent max » montait à 60 km/h**, soit 14 de plus que le
  plafond légal, et **le champ « plafond min » descendait à 300 m**, un
  tiers du plancher légal. Un réglage personnalisé pouvait donc produire
  un feu vert sur un saut interdit. Bornes désormais issues de `LEGAL_BE`,
  dans le HTML *et* dans `seuilsActifs()` — ce second point est nécessaire
  parce qu'un réglage hors limites enregistré par une version antérieure
  est encore dans le `localStorage` des appareils.
- **Garde-fou dans `scoreHeure`** : les limites légales sont testées
  indépendamment des seuils de niveau, pour qu'aucune évolution future des
  seuils ne puisse réintroduire le problème.

### Corrigé (affichage faux)

- **Toutes les flèches de vent étaient à 90° de la réalité** — chips de la
  timeline et profil vertical. Le code appliquait `rotate(direction + 180)`
  au glyphe « ➤ », en oubliant que **U+27A4 pointe vers l'EST** à
  `rotate(0)`, pas vers le nord. Un vent de nord était donc dessiné vers
  l'ouest. La boussole SVG, elle, était juste (ses formes pointent déjà
  vers le haut) : les deux se contredisaient sur le même écran.
  Correction centralisée dans `rotationFleche()` (`direction + 90`).

### Corrigé (cohérence des valeurs)

- **Plafonds par brevet désormais dérivés** de
  `max(plancher légal, hauteur d'ouverture + marge)` au lieu d'être posés à
  la main. ⚠ **Élève AFF passe de 2800 m à 1800 m — un assouplissement.**
  Le 2800 n'avait aucune source et créait un effet de falaise involontaire :
  via `plafondEstime`, dès 40 % de nuages bas le plafond retenu devient
  `122 × (T − Td)`, et franchir 2800 m aurait demandé un écart
  température/point de rosée de ~23 °C, inatteignable en Belgique. **Toute
  heure à ≥ 40 % de couche basse sortait donc rouge pour un élève**, par
  accident de calcul. Tandem et AFF, qui partagent la hauteur d'ouverture
  (1500 m), partagent maintenant le même plafond — l'incohérence
  1500 / 2800 de la v1.4.x disparaît.
- **Visibilité** : 3000 m (légal) → rouge ; 3000-5000 m → orange (marge de
  confort club). Avant, le seuil unique de 5000 m sortait **rouge sur des
  conditions pourtant légalement sautables**.
- **Moyenne vs rafale explicitées** : la loi vise la *moyenne* au sol, la
  règle « la limite s'applique à la rafale » est un durcissement de niveau.
  Les deux tests sont maintenant séparés et documentés comme tels.

### Corrigé (moteur de décision)

- **`fenetreSautable` : un créneau d'une seule heure sortait avec le
  verdict de cette heure**, court-circuitant la règle des 2 h consécutives
  appliquée partout ailleurs. Un créneau réduit à une heure verte (fin de
  journée, vendredi tronqué par le coucher du soleil) sortait donc VERT,
  alors que la même heure verte au milieu d'un créneau plus long sortait
  rouge.
- `meilleurVerdict` : commentaire corrigé (il disait « pire des deux », la
  fonction retourne le **meilleur** — elle ne l'a jamais fait).

### Corrigé (accessibilité et robustesse)

- **Verdict horaire lisible sans la couleur** : marqueur de forme
  (● / ▲ / ✕) sur chaque chip. La timeline ne distinguait les verdicts que
  par la teinte — illisible en daltonisme rouge-vert (~8 % des hommes), et
  le `title` ne sert qu'au survol desktop, inutile sur mobile.
- **ARIA de la timeline complété** : `#timeline` portait `role="tablist"`
  avec des boutons nus pour enfants — un lecteur d'écran annonçait une
  liste d'onglets vide. Les chips sont maintenant de vrais `tab`
  (`aria-selected`, `aria-controls`) pointant vers un `tabpanel`.
- `err.message` passe par `textContent` (seul texte non littéral qui
  atteignait `innerHTML`).
- Garde sur `Math.min/max` de tableau vide dans le hero (évite un
  « -Infinity km/h »).

### Ajouté (affichage)

- **Distance de largage affichée** : le bloc Spot ne montrait que le cap à
  remonter (« 242° »), sans la distance — pourtant calculée depuis la
  v1.4.0. Affiche maintenant « 242° · 2.3 km ».

### Supprimé

- `LIENS.waze` : défini mais jamais utilisé (le README annonçait un bouton
  Waze qui n'a jamais existé dans l'interface).

### Tests

- 76 → **88 tests**. Nouvelle couverture : transcription de `LEGAL_BE`,
  invariants « aucun niveau au-dessus de la limite légale », dérivation des
  plafonds, égalité tandem/AFF, motifs légaux vs motifs de niveau,
  moyenne vs rafale, créneau d'une heure.

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
