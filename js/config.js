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

// Niveaux de pression Open-Meteo et leur rôle parachutiste
export const NIVEAUX_PRESSION = [
  { hpa: 600, role: "Largage ~4000 m" },
  { hpa: 700, role: "Chute ~3000 m" },
  { hpa: 850, role: "Ouverture ~1500 m" },
  { hpa: 925, role: "Basse couche ~600 m" },
];

// Seuils par niveau de pratique (vent en km/h, plafond en m AGL)
//
// ⚠ Vent max sol — vérifié le 2026-09-19 contre la source fédérale la plus
// pertinente trouvée : FFP (Fédération Française de Parachutisme),
// *Directive Technique n°49, modifiée le 15/04/2025* (même nomenclature de
// brevets A/B/C/D que la Belgique francophone ; à confirmer malgré tout
// auprès de la FWCP — Fédération Wallonne des Clubs de Parachutisme,
// dont dépend le Paraclub de Namur — dont le règlement technique propre
// n'a pas pu être consulté en ligne). Citations exactes :
//   - Progression jusqu'au brevet A (module « Aptitudes sous voile » non
//     validé) : « Vent au sol inférieur ou égal à 7 m/s » = 25,2 km/h.
//   - Brevet B (module Bv + conditions d'obtention) ET Brevet de
//     Parachutiste Autonome/BPA (prérequis des brevets C et D) :
//     « Limite maximale de vent au sol : 11 m/s » = 39,6 km/h — c'est le
//     plafond le plus élevé explicitement écrit dans tout le document,
//     y compris pour les sections brevet C et brevet D (aucun chiffre
//     supérieur n'y est donné).
// D'où la correction suivante : le brevet B (et le BPA, prérequis de C/D)
// est maintenant seul à hériter de ce plafond documenté (39 km/h, arrondi
// à l'entier inférieur — on n'arrondit jamais un seuil de sécurité vers le
// haut), au lieu d'être mélangé avec C/D à 46 km/h comme avant (v1.2.0) :
// un brevet B seul aurait alors été autorisé 6+ km/h au-dessus du plafond
// fédéral documenté pour son niveau. Brevet C/D conserve 46 km/h : aucun
// chiffre fédéral explicite ne les concerne au-delà du BPA (autonomie
// complète), et cette valeur reste dans la fourchette "expérimenté"
// généralement observée (cf. README §Sources) — à valider par le club.
// Élève AFF (22) reste volontairement sous le plafond fédéral de
// progression (25,2 km/h) : marge de sécurité déjà en place, non modifiée.
// Tandem (28) n'est PAS couvert par cette règle (pas un brevet de
// progression solo, le moniteur est aux commandes) : seuil laissé au
// jugement DZ/matériel, inchangé.
// Brevet A (33) reste une interpolation DZ raisonnable : aucun chiffre
// fédéral explicite ne couvre ce palier précis (entre la fin de
// progression à 7 m/s et le brevet B à 11 m/s).
//
// Plafond nuageux min. : aucune source fédérale chiffrée trouvée (ni FFP,
// ni club) — reste une estimation DZ, cohérente avec les hauteurs
// d'ouverture minimales qui, elles, sont documentées par la FFP et
// décroissent avec l'expérience (1200 m en progression/brevet A → 1000 m
// avant BPA → 850 m après BPA/brevet B) : plus l'ouverture peut être basse,
// moins il faut de plafond dégagé au-dessus. Brevet B est donc aligné sur
// brevet C/D (1100 m) plutôt que sur brevet A (1400 m), puisque c'est au
// brevet B que la hauteur d'ouverture minimale documentée passe à 850 m.
//
// ecartRafalesOrange : écart rafale/moyenne (km/h) à partir duquel on
// dégrade le verdict — un jumper expérimenté tolère un "spread" plus large
// qu'un élève (cf. Skydivemag, "Winds Limits Part 1", pas de source
// fédérale chiffrée ici) :
//   élève/tandem ≈ 5 kt (9 km/h) · brevet A/B ≈ 7 kt (13 km/h) ·
//   brevet C/D confirmé ≈ 10 kt (18 km/h).
//
// La décision finale appartient toujours au club et aux moniteurs.
//
// hauteurOuverture : hauteur d'ouverture (m AGL) utilisée pour estimer la
// dérive sous voile. Chiffres issus de la même source FFP DT49 :
//   « Hauteur minimale d'ouverture 1200 mètres » (progression / brevet A),
//   « 1000 mètres avant l'obtention du BPA », « 850 mètres après ».
// Élève et tandem : hauteur pratiquée, plus haute que le minimum légal
// (la DT49 cite « Ouverture à 1500 mètres » au niveau 2 de progression).
export const NIVEAUX_PRATIQUE = {
  tandem:  { label: "Tandem",       ventMax: 28, plafondMin: 1500, ecartRafalesOrange: 9,  hauteurOuverture: 1500 },
  aff:     { label: "Élève AFF",    ventMax: 22, plafondMin: 2800, ecartRafalesOrange: 9,  hauteurOuverture: 1500 },
  brevetA: { label: "Brevet A",     ventMax: 33, plafondMin: 1400, ecartRafalesOrange: 13, hauteurOuverture: 1200 },
  brevetB: { label: "Brevet B",     ventMax: 39, plafondMin: 1100, ecartRafalesOrange: 13, hauteurOuverture: 850 },
  brevetCD:{ label: "Brevet C/D",   ventMax: 46, plafondMin: 1100, ecartRafalesOrange: 18, hauteurOuverture: 850 },
};

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
  visibiliteMin: 5000,   // m — VFR
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
  // Écart de vent (km/h) au-delà duquel on parle d'évolution de la
  // prévision entre deux consultations (js/tendance.js).
  tendancePrevisionVent: 4,
};

// Saison & créneaux du club
export const OUVERTURE = {
  saisonDebut: { mois: 3, jour: 1 },    // 1er mars
  saisonFin:   { mois: 12, jour: 15 },  // mi-décembre
  vendrediDebutMois: 5,                 // vendredis de mai…
  vendrediFinMois: 9,                   // …à septembre
  heureOuverture: 8.5,                  // 8h30
  heureSplit: 14,                       // matin / après-midi
  heureVendredi: 16,                    // vendredi dès 16h
};

// Liens externes
export const LIENS = {
  gmaps: `https://www.google.com/maps/dir/?api=1&destination=${DZ.lat},${DZ.lon}&travelmode=driving&dir_action=navigate`,
  waze: `https://waze.com/ul?ll=${DZ.lat},${DZ.lon}&navigate=yes&zoom=17`,
  irm: "https://www.meteo.be/fr/namur",
  windy: `https://www.windy.com/${DZ.lat}/${DZ.lon}?wind,${DZ.lat},${DZ.lon},11`,
  club: "https://paraclubnamur.be",
  briefing: "https://pro.paraclubnamur.be/fr/meteo",
};

export const VERSION = "1.4.4";
