// ============================================================
// Vent4000 — Configuration centrale
// Paraclub de Namur — Aérodrome de Namur/Temploux-Suarlée (EBNM)
// ============================================================

export const DZ = {
  nom: "Paraclub de Namur",
  oaci: "EBNM",
  lat: 50.4897,
  lon: 4.7697,
  altitudeTerrain: 181,   // m AMSL — à soustraire des géopotentiels pour obtenir l'AGL
  qfu: 64,                // axe de piste 064° / 244°
  altitudeLargage: 4000,  // m AGL (approx.)
};

// ============================================================
// ÉTAGE 1 — PLANCHER LÉGAL BELGE (non franchissable)
//
// Source : circulaire CIR/GDF-05, Édition 4 du 03/06/2016,
// Direction générale Transport Aérien (SPF Mobilité et Transports).
// Copie archivée : docs/CIR-GDF-05_ed4_20160603.pdf — §6 :
//
//   « Les sauts en parachute ne sont autorisés que dans les
//     conditions météorologiques suivantes :
//     a) Visibilité : minimum 3000 m ;
//     b) Base de nuages : minimum 3000 ft AGL ;
//     c) Vitesse du vent : maximum 25 kts de moyenne au sol. »
//
// C'est le droit belge applicable à EBNM, au-dessus de toute règle
// fédérale ou de club. Aucun niveau de pratique, aucun réglage
// personnalisé ne peut le franchir : les bornes des champs de réglage
// en dépendent (cf. app.js / index.html) et scoring.js le teste
// séparément des seuils de niveau, avec son propre motif.
//
// ⚠ Le point (c) porte explicitement sur la MOYENNE au sol. La règle
// « la limite s'applique à la rafale » (pratique DZ, cf. README) est
// un durcissement de niveau, pas la règle légale : les deux tests sont
// donc distincts dans scoring.js et ne doivent pas être fusionnés.
//
// La même circulaire délègue le reste aux fédérations : « Pour ce qui
// est des aspects techniques non couverts par la présente circulaire,
// les intéressés se réfèreront aux directives émises par les
// fédérations de parachutistes reconnues par les Communautés. » Pour
// Namur (Wallonie) : FWCP — cf. NIVEAUX_PRATIQUE ci-dessous.
export const LEGAL_BE = {
  ventMoyenMaxSol: 46,  // km/h — 25 kts = 46,30 (arrondi à l'entier inférieur)
  plafondMinAGL: 914,   // m AGL — 3000 ft = 914,4 (arrondi à l'entier inférieur)
  visibiliteMin: 3000,  // m
  source: "CIR/GDF-05 Éd.4 (03/06/2016) §6 — DGTA",
};

// Niveaux de pression Open-Meteo et leur rôle parachutiste
export const NIVEAUX_PRESSION = [
  { hpa: 600, role: "Largage ~4000 m" },
  { hpa: 700, role: "Chute ~3000 m" },
  { hpa: 850, role: "Ouverture ~1500 m" },
  { hpa: 925, role: "Basse couche ~600 m" },
];

// ============================================================
// ÉTAGE 2 — RÈGLEMENT FÉDÉRAL FWCP (contraignant pour le club)
//
// Source : **Règlement de Sécurité de Base (RSB) de la FWCP**,
// Fédération Wallonne des Clubs de Parachutisme — version 2.1, juin 2026
// (mise à jour 18/05/2026). Copie archivée :
// docs/FWCP_RSB_v2.1_20260518.pdf — original : fwcp.be/Files/FWCP_Secu.pdf
//
// Le Paraclub de Namur est affilié FWCP, et le RSB §3.1 est explicite :
//   « Le règlement de base de sécurité de la FWCP présente, pour les clubs
//     qui y sont affiliés, une OBLIGATION et les déviations par rapport à
//     celui-ci ne sont admises que sur dérogation écrite du Directeur
//     Technique et du Président de la FWCP. »
// Il ajoute : « chaque centre peut éditer chez lui des règles plus
// restrictives » et, §3.4.2, « Le Responsable Technique durant les
// opérations peut imposer des limites plus sévères ». D'où l'étage 3
// (club/RT) qui se superpose, jamais qui assouplit.
//
// ⚠ Ces valeurs REMPLACENT celles de la FFP française utilisées jusqu'en
// v1.5.0 en substitution. Le RSB était introuvable via les moteurs de
// recherche ; il est publié sur fwcp.be → Hub de Formation → Sécurité.
//
// § 3.4.2 Vent — citation exacte :
//   « Vitesse de vent maximum au sol permise :
//     • Jusqu'au brevet B inclus : maximum 7 m/sec ;
//     • A partir du brevet B : maximum 12,86 m/sec. (25 nœuds) (GDF 05)
//     • Exception : sauts de nuit : maximum 7 m/sec. »
//   → 7 m/s = 25,2 km/h ; 12,86 m/s = 46,3 km/h (= la limite GDF-05).
//
// ⚠⚠ AMBIGUÏTÉ DANS LA SOURCE, non résolue ici : le brevet B apparaît des
// DEUX côtés du barème (« jusqu'au brevet B inclus » ET « à partir du
// brevet B »). Deux lectures possibles — 25 km/h ou 46 km/h pour un
// brevet B. On retient ici la lecture CONSERVATRICE (25 km/h), parce que
// « inclus » est explicite et qu'on n'arrondit jamais un seuil de sécurité
// vers le haut. **À faire trancher par le Responsable Technique du club.**
//
// § 3.5 Altitudes de sécurité — citation exacte :
//   « Tout parachutiste doit avoir actionné l'ouverture de son parachute
//     au-dessus de 3000 ft AGL. »
//   → 914 m AGL, pour TOUS, sans distinction de brevet. C'est pourquoi
//   hauteurOuverture ne descend plus à 850 m (valeur FFP française) : elle
//   était SOUS le minimum belge pour les brevets B et C/D.
//
// § 3.4.1 confirme par ailleurs les valeurs de LEGAL_BE : « la couverture
// nuageuse ne doit pas être inférieure à 3.000 ft AGL […] et la visibilité
// dans la zone ne doit pas être inférieure à 3 km ».
//
// Le TANDEM n'est pas couvert par le barème §3.4.2 (qui parle de brevets
// de progression solo ; en tandem le moniteur est aux commandes et détient
// au minimum un brevet D + qualification tandem). Son seuil reste un
// jugement club/matériel. ⚠ Noter qu'à 28 km/h il dépasse les 25 km/h
// applicables à un solo jusqu'au brevet B — cohérent avec la pratique
// tandem, mais à confirmer.
//
// ecartRafalesOrange : écart rafale/moyenne (km/h) qui dégrade le verdict.
// Aucun chiffre FWCP ni GDF-05 là-dessus — reste calé sur la pratique DZ
// documentée (Skydivemag, « Winds Limits Part 1 ») : un jumper expérimenté
// tolère un spread plus large qu'un élève.
//
// Plafond nuageux minimum par niveau : aucune source chiffrée (ni GDF-05,
// ni FWCP, ni club) — DÉRIVÉ, jamais posé à la main, du maximum entre :
//   1. le plancher légal/fédéral : 914 m (3000 ft) ;
//   2. la hauteur d'ouverture + MARGE_PLAFOND_OUVERTURE, pour pouvoir
//      ouvrir en air clair avec une référence visuelle sur la zone de poser.
// MARGE_PLAFOND_OUVERTURE est LE seul paramètre de jugement DZ restant
// dans ce fichier : c'est lui qu'il faut faire confirmer ou durcir.
export const MARGE_PLAFOND_OUVERTURE = 300; // m au-dessus de l'ouverture

/** Plafond minimum d'un niveau : le plus contraignant des deux étages. */
function plafondMinPour(hauteurOuverture) {
  return Math.max(LEGAL_BE.plafondMinAGL, hauteurOuverture + MARGE_PLAFOND_OUVERTURE);
}

// Repères de spread rafale/moyenne (Skydivemag, aucune source fédérale) :
//   élève/tandem ≈ 5 kt (9 km/h) · brevet A/B ≈ 7 kt (13 km/h) ·
//   brevet C/D ≈ 10 kt (18 km/h).
// hauteurOuverture : au-dessus du minimum RSB §3.5 (914 m) pour tous ;
// 1500 m pour élève et tandem, confirmé par le club lui-même — « Vous
// ouvrez votre parachute à environ 1500 mètres » (paraclubnamur.be, page
// formation AFF). L'altitude de largage à 4000 m l'est aussi : « Vous
// pouvez sauter seul, en chute libre, à 4000 mètres » (FAQ du club).
//
// La décision finale appartient toujours au club et aux moniteurs.
//
// Barème FWCP §3.4.2 : DEUX paliers, pas cinq. Les valeurs intermédiaires
// de la v1.4.x (brevet A à 33, brevet B à 39) venaient de la FFP française
// et n'ont aucune existence dans le règlement belge — elles autorisaient
// un brevet A à sauter 8 km/h au-dessus de sa limite FWCP réelle.
const FWCP_VENT_JUSQU_BREVET_B = 25; // 7 m/s = 25,2 → arrondi ↓
const FWCP_VENT_APRES_BREVET_B = 46; // 12,86 m/s = 25 kts = 46,3 → arrondi ↓
const FWCP_OUVERTURE_MIN = 914;      // 3000 ft AGL, §3.5, pour tous

// `ventMax` est testé contre la RAFALE (durcissement de niveau, pratique
// DZ) ; le test légal GDF-05 sur la MOYENNE s'applique en plus, quel que
// soit le niveau. Aucun `ventMax` ne peut dépasser le plafond légal, ni
// aucune `hauteurOuverture` passer sous 914 m — invariants testés.
export const NIVEAUX_PRATIQUE = {
  tandem:  { label: "Tandem",     ventMax: 28,                          ecartRafalesOrange: 9,  hauteurOuverture: 1500 },
  aff:     { label: "Élève AFF",  ventMax: FWCP_VENT_JUSQU_BREVET_B,    ecartRafalesOrange: 9,  hauteurOuverture: 1500 },
  brevetA: { label: "Brevet A",   ventMax: FWCP_VENT_JUSQU_BREVET_B,    ecartRafalesOrange: 13, hauteurOuverture: 1200 },
  brevetB: { label: "Brevet B",   ventMax: FWCP_VENT_JUSQU_BREVET_B,    ecartRafalesOrange: 13, hauteurOuverture: FWCP_OUVERTURE_MIN },
  brevetCD:{ label: "Brevet C/D", ventMax: FWCP_VENT_APRES_BREVET_B,    ecartRafalesOrange: 18, hauteurOuverture: FWCP_OUVERTURE_MIN },
};

// Plafond dérivé (cf. plafondMinPour) injecté après coup, pour que la
// filiation reste lisible dans le littéral ci-dessus.
for (const n of Object.values(NIVEAUX_PRATIQUE)) {
  n.plafondMin = plafondMinPour(n.hauteurOuverture);
}

// Hypothèses de vol pour l'estimation de dérive / spot (js/spot.js).
// ⚠ Valeurs moyennes typiques, pas des mesures : l'estimation sert à
// anticiper l'ordre de grandeur de la dérive, pas à remplacer le largueur.
export const VOL = {
  tauxChuteVoile: 5,     // m/s — taux de chute moyen sous voile ram-air
  vitesseChuteLibre: 55, // m/s (~200 km/h) — chute ventre stabilisée
};

// Niveaux "au-dessus du sol" (AGL direct, pas de conversion nécessaire) —
// comblent l'écart entre le sol et le premier niveau de pression (925 hPa ≈ 800 m).
// Zone la plus critique pour l'ouverture et l'atterrissage sous voile.
export const NIVEAUX_AGL = [180, 120, 80];

// Seuils communs (identiques quel que soit le niveau)
export const SEUILS_COMMUNS = {
  precipMax: 0.2,        // mm/h — au-delà : rouge
  probaPluieMax: 60,     // % — au-delà : rouge
  capeOrange: 400,       // J/kg — instabilité notable
  capeRouge: 800,        // J/kg — risque orageux
  // Visibilité : le minimum LÉGAL est 3000 m (LEGAL_BE.visibiliteMin) et
  // déclenche un rouge « hors limite légale ». Entre 3000 et 5000 m le
  // saut est légal mais la marge est mince : marge de confort DZ, donc
  // orange et non rouge. Avant la v1.5.0 le seuil unique de 5000 m
  // sortait rouge sur des conditions pourtant légalement sautables.
  visibiliteConfort: 5000, // m — en dessous : orange (marge club)
  ventOrangeRatio: 0.8,  // vent > 80 % du seuil → orange
  nuagesOrangeMin: 30,   // % couverture basse+moyenne combinée → orange
  // Une couche compacte (≥ 85 % sur UN étage) bouche le ciel : l'avion ne
  // peut pas larguer en VFR à travers. Testé par étage et non sur la somme
  // des couches : 45 % bas + 40 % moyen, c'est un ciel morcelé (orange),
  // pas un ciel bouché. La couche « moyenne » d'Open-Meteo (~3-8 km)
  // contient l'altitude de largage (4000 m) → message dédié.
  // ⚠ Avant la v1.4.0, un ciel 100 % couvert passait à travers la bande
  // orange (30-75 %) et ressortait VERT, sans aucune raison affichée.
  nuagesBoucheRouge: 85,
  confianceHauteMax: 5,  // km/h d'écart entre modèles → confiance haute
  confianceMoyenneMax: 12, // km/h d'écart → confiance moyenne ; au-delà = faible
  // Pénalité d'échéance : la qualité d'une prévision se dégrade avec le
  // délai. On ajoute ces km/h fictifs à l'écart entre modèles par jour
  // au-delà de J+1, ce qui fait naturellement chuter la confiance au loin
  // (et, via scoreHeure, plafonne les verdicts lointains à orange).
  confiancePenaliteParJour: 2,
  tendanceHausseOrange: 8, // km/h de hausse d'une heure à l'autre → orange
  // Vent à la hauteur d'ouverture au-delà duquel une voile ne pénètre
  // plus franchement face au vent : le parachutiste recule ou stagne au
  // lieu de revenir vers la zone de poser. Une voile école avance de
  // l'ordre de 35-45 km/h bras hauts, d'où ce seuil.
  // ⚠ Aucune source FWCP ni GDF-05 ne chiffre ce point — c'est une règle
  // de bon sens aérologique, volontairement DÉGRADANTE (orange) et non
  // éliminatoire. À faire confirmer/ajuster par le Responsable Technique,
  // au même titre que MARGE_PLAFOND_OUVERTURE.
  // Elle existe parce que jusqu'à la v1.5.0 toute la colonne de vent
  // (80-180 m AGL + 925/850/700/600 hPa) était récupérée, affichée et
  // intégrée au calcul de dérive… sans jamais peser sur le verdict : une
  // journée calme au sol avec 90 km/h à 4000 m ressortait VERTE.
  ventOuvertureOrange: 40, // km/h à la hauteur d'ouverture
  // Écart entre le relevé « maintenant » et la prévision de la même heure
  // au-delà duquel on prévient que la prévision est en train de dériver.
  ecartNowcastOrange: 10,  // km/h
  // Écart de vent (km/h) au-delà duquel on parle d'évolution de la
  // prévision entre deux consultations (js/tendance.js).
  tendancePrevisionVent: 4,
};

// ============================================================
// ÉTAGE 3 — CRÉNEAUX DU CLUB (Paraclub de Namur)
//
// Vérifié le 2026-09-23 sur paraclubnamur.be. Citations :
//
//  - FAQ « heures d'ouverture » : « le PCN est ouvert les week-ends et
//    jours fériés dès 8h30 et jusqu'au coucher du soleil de Mars à
//    mi-décembre. Il est également ouvert les vendredis dès 16h00 **de mai
//    à septembre**. » → confirme saison, vendredis et horaires encodés.
//
//  - Page formation AFF, « Organisation des créneaux » : « En pleine
//    saison, les journées sont divisées en deux créneaux : de 8h30 à
//    14h00, puis de 14h00 jusqu'au coucher du soleil. Le vendredi, il n'y
//    a qu'un créneau de 16h00 au coucher du soleil. **À partir de fin
//    octobre (avec le changement d'heure), les journées sont continues, de
//    8h30 jusqu'au coucher du soleil.** »
//    → le découpage matin/après-midi DISPARAÎT en fin de saison. L'app le
//    ignorait et continuait à couper à 14h, ce qui fractionne une journée
//    continue en deux et peut faire manquer une fenêtre à cheval sur 14h
//    (la règle des 2 h consécutives s'applique par créneau).
//
//  - FAQ « organisation de la journée » : « De manière générale, les
//    séances de saut au PCN **débutent à 9h00** et se terminent au coucher
//    du soleil. » → 8h30 est l'heure d'ouverture/inscription, 9h00 celle
//    du premier saut. Scorer dès 8h proposait une fenêtre pendant laquelle
//    personne ne saute.
export const OUVERTURE = {
  saisonDebut: { mois: 3, jour: 1 },    // 1er mars
  saisonFin:   { mois: 12, jour: 15 },  // mi-décembre
  vendrediDebutMois: 5,                 // vendredis de mai…
  vendrediFinMois: 9,                   // …à septembre
  heureOuverture: 8.5,                  // 8h30 — ouverture du club
  heurePremierSaut: 9,                  // 9h00 — début réel des séances
  heureSplit: 14,                       // matin / après-midi (pleine saison)
  heureVendredi: 16,                    // vendredi dès 16h
};

// ============================================================
// TRAJET — l'enjeu réel de chaque décision
//
// L'app ne répond pas à « ça saute ? » mais à « est-ce que ça vaut le
// déplacement ? ». Ces deux questions divergent dès qu'on habite loin :
// une journée orange se tente quand on est à 15 min, pas à 1h30.
//
// Distance et durée relevées sur Google Maps (Bouillon → Paraclub Namur,
// Suarlée), itinéraire sans péage. Le prix du diesel est un plafond belge
// officiel (SPF Économie) : à ajuster si tu fais le plein moins cher,
// notamment côté France ou Luxembourg — tu es frontalier.
export const TRAJET = {
  distanceAllerKm: 113,
  dureeAllerMin: 90,
  consoL100: 6,        // L/100 km — hypothèse, à ajuster
  prixCarburant: 2.50, // €/L — diesel B7, plafond belge (record 09/2026)
};

/** Coût et temps d'un aller-retour raté. */
export function coutAllerRetour() {
  const km = TRAJET.distanceAllerKm * 2;
  return {
    km,
    minutes: TRAJET.dureeAllerMin * 2,
    euros: Math.round(km * (TRAJET.consoL100 / 100) * TRAJET.prixCarburant),
  };
}

// Liens externes
export const LIENS = {
  // Aucun paramètre `origin` : c'est Google Maps qui utilise la position
  // de l'appareil. L'app elle-même ne demande AUCUNE permission
  // (ni géolocalisation, ni notifications).
  gmaps: `https://www.google.com/maps/dir/?api=1&destination=${DZ.lat},${DZ.lon}&travelmode=driving&dir_action=navigate`,
  irm: "https://www.meteo.be/fr/namur",
  windy: `https://www.windy.com/${DZ.lat}/${DZ.lon}?wind,${DZ.lat},${DZ.lon},11`,
  club: "https://paraclubnamur.be",
  briefing: "https://pro.paraclubnamur.be/fr/meteo",
};

export const VERSION = "1.7.0";
