// ============================================================
// Vent4000 — Configuration centrale (v2.1)
// Paraclub de Namur — Aérodrome de Namur/Temploux-Suarlée (EBNM)
//
// PRINCIPE : aucune spéculation. Le verdict ne repose que sur
//  1. des RÈGLES écrites (loi belge, règlement fédéral FWCP), citées ;
//  2. les DONNÉES les plus précises disponibles pour la zone :
//     observation réelle (METAR), prévision officielle d'aérodrome (TAF),
//     modèles de 1,3 à 2,2 km de maille — puis, au-delà de leur portée,
//     modèles régionaux de 7 à 10 km, signalés comme moins précis.
// Aucun seuil inventé, aucune estimation (pas de plafond déduit d'une
// formule, pas de pondération arbitraire, pas de dérive supposée).
// ============================================================

export const DZ = {
  nom: "Paraclub de Namur",
  oaci: "EBNM",
  lat: 50.4897,
  lon: 4.7697,
  altitudeTerrain: 181,   // m AMSL — à soustraire des géopotentiels pour obtenir l'AGL
  qfu: 64,                // axe de piste 064° / 244° (Règlement d'aérodrome EBNM v004, §3.1)
};

const FT = 0.3048;
const KT = 1.852;

// ============================================================
// ÉTAGE 1 — LOI BELGE : circulaire CIR/GDF-05, Éd. 4 (03/06/2016),
// DGTA / SPF Mobilité. Copie : docs/CIR-GDF-05_ed4_20160603.pdf, §6 :
//   « L'aéronef vole tout le temps en VMC. […] Les sauts en parachute ne
//     sont autorisés que dans les conditions météorologiques suivantes :
//     a) Visibilité : minimum 3000 m ;
//     b) Base de nuages : minimum 3000 ft AGL ;
//     c) Vitesse du vent : maximum 25 kts de moyenne au sol. »
// ============================================================
export const LEGAL_BE = {
  ventMoyenMaxSol: Math.floor(25 * KT),   // 46 km/h
  plafondMinAGL: Math.floor(3000 * FT),   // 914 m
  visibiliteMin: 3000,                    // m
  source: "CIR/GDF-05 §6",
};

// ============================================================
// ÉTAGE 2 — FÉDÉRATION : Règlement de Sécurité de Base FWCP v2.1
// (juin 2026). Copie : docs/FWCP_RSB_v2.1_20260518.pdf.
//
// §3.4.1 « la couverture nuageuse ne doit pas être inférieure à
//   3.000 ft AGL […] et la visibilité dans la zone ne doit pas être
//   inférieure à 3 km. »
// §3.4.2 « Vitesse de vent maximum au sol permise :
//   • Jusqu'au brevet B inclus : maximum 7 m/sec ;
//   • A partir du brevet B : maximum 12,86 m/sec (25 nœuds) (GDF 05) »
//   Le « à partir du brevet B » chevauche la ligne précédente ; le Basis
//   Veiligheidsreglement de la VVP (homologue flamand, harmonisé au sein
//   de la FBP) écrit « Tot en met B-brevet : 14 knopen / Vanaf C-brevet :
//   25 knopen » : le palier haut commence au brevet C.
//   « Le Responsable Technique […] peut imposer des limites plus sévères. »
// §3.5 « Tout parachutiste doit avoir actionné l'ouverture de son
//   parachute au-dessus de 3000 ft AGL. »
// §6.4.1 Tandem : « L'altitude minimum pour effectuer un saut tandem est
//   de 6.500 ft AGL. L'altitude minimum d'ouverture est de 5.000 ft AGL. »
// RSB, définition : « élève = non titulaire du brevet A ».
//
// Vent : le RSB dit « vitesse de vent », sans préciser moyenne ou rafale.
// L'app applique la limite à la moyenne ET à la rafale (une rafale au-delà
// de la limite est une vitesse de vent au-delà de la limite) ; la loi
// (GDF-05) porte, elle, explicitement sur la moyenne.
//
// Tandem : le passager n'est titulaire d'aucun brevet. Le barème §3.4.2
// est donné par brevet ; la seule ligne qui couvre un sauteur sans brevet
// est « jusqu'au brevet B inclus » (7 m/s). C'est ce palier qui est
// appliqué — le RT peut en décider autrement, jamais l'app.
// ============================================================
const VENT_JUSQU_BREVET_B = Math.floor(7 * 3.6);   // 25 km/h (7 m/s = 25,2)
const VENT_A_PARTIR_BREVET_C = LEGAL_BE.ventMoyenMaxSol; // 46 km/h (25 kts)
const OUVERTURE_MIN = Math.floor(3000 * FT);       // 914 m — RSB §3.5

export const NIVEAUX_PRATIQUE = {
  tandem:   { label: "Tandem (passager)", ventMax: VENT_JUSQU_BREVET_B,    hauteurOuverture: Math.floor(5000 * FT), sourceOuverture: "RSB §6.4.1 (5000 ft)" },
  aff:      { label: "Élève AFF",         ventMax: VENT_JUSQU_BREVET_B,    hauteurOuverture: 1500, sourceOuverture: "paraclubnamur.be — formation AFF : « vous ouvrez votre parachute à environ 1500 mètres »" },
  brevetA:  { label: "Brevet A",          ventMax: VENT_JUSQU_BREVET_B,    hauteurOuverture: OUVERTURE_MIN, sourceOuverture: "RSB §3.5 (3000 ft)" },
  brevetB:  { label: "Brevet B",          ventMax: VENT_JUSQU_BREVET_B,    hauteurOuverture: OUVERTURE_MIN, sourceOuverture: "RSB §3.5 (3000 ft)" },
  brevetCD: { label: "Brevet C/D",        ventMax: VENT_A_PARTIR_BREVET_C, hauteurOuverture: OUVERTURE_MIN, sourceOuverture: "RSB §3.5 (3000 ft)" },
};
// Plafond minimum : le plancher légal, identique pour tous (GDF-05 §6 b,
// RSB §3.4.1). Aucune marge ajoutée.
for (const n of Object.values(NIVEAUX_PRATIQUE)) n.plafondMin = LEGAL_BE.plafondMinAGL;

// Couverture à partir de laquelle une couche fait plafond : 5/8 (BKN),
// définition OACI du plafond, la même que celle des METAR et des TAF.
export const COUCHE_PLAFOND = 62.5; // %

// ============================================================
// SOURCES — classées par précision pour EBNM
//
// Vérifié le 2026-10-01 sur l'API Open-Meteo, point de grille le plus
// proche de la piste et portée réelle de chaque modèle :
//  - AROME France HD (Météo-France, 1,3 km) .......... ~42 h
//  - ICON-D2 (DWD, 2,2 km) ........................... ~48 h
//  - HARMONIE-AROME Pays-Bas (KNMI, 2 km) ............ ~60 h
//  - HARMONIE-AROME Europe (DMI, 2 km) — base des nuages ~60 h
//  - UKMO UK 2 km (Met Office) — base des nuages ..... ~54 h
// Au-delà (« régional », moins précis) :
//  - ICON-EU (DWD, 7 km) ~5 j · ECMWF IFS (9 km) 7 j · ARPEGE Europe (10 km) ~4,5 j
// `base` : le modèle fournit la hauteur de la base des nuages.
// ============================================================
export const MODELES = [
  { id: "meteofrance_arome_france_hd",  nom: "AROME HD",       maille: "1,3 km", hr: true },
  { id: "icon_d2",                      nom: "ICON-D2",        maille: "2,2 km", hr: true },
  { id: "knmi_harmonie_arome_netherlands", nom: "HARMONIE KNMI", maille: "2 km", hr: true },
  { id: "dmi_harmonie_arome_europe",    nom: "HARMONIE DMI",   maille: "2 km",   hr: true, base: true },
  { id: "ukmo_uk_deterministic_2km",    nom: "UKMO 2 km",      maille: "2 km",   hr: true, base: true },
  { id: "icon_eu",                      nom: "ICON-EU",        maille: "7 km" },
  { id: "ecmwf_ifs",                    nom: "ECMWF IFS",      maille: "9 km" },
  { id: "meteofrance_arpege_europe",    nom: "ARPEGE",         maille: "10 km" },
];

// Observation et prévision officielle d'aérodrome. EBNM n'émet ni METAR
// ni TAF ; Charleroi (EBCI) est à 22 km à l'ouest, sur le même plateau
// (176 m). Source : MET Norway (api.met.no/tafmetar), CORS ouvert.
export const AERODROME = {
  station: "EBCI",
  nom: "Charleroi",
  distanceKm: 22,
  metarAgeMaxMin: 90, // au-delà, l'observation ne décrit plus l'heure en cours
};

// ============================================================
// ÉTAGE 3 — CRÉNEAUX DU CLUB (Paraclub de Namur), vérifiés le 2026-09-23
// sur paraclubnamur.be :
//  - « ouvert les week-ends et jours fériés dès 8h30 et jusqu'au coucher
//    du soleil de Mars à mi-décembre. […] les vendredis dès 16h00 de mai
//    à septembre. »
//  - « En pleine saison, les journées sont divisées en deux créneaux : de
//    8h30 à 14h00, puis de 14h00 jusqu'au coucher du soleil. […] À partir
//    de fin octobre (avec le changement d'heure), les journées sont
//    continues. »
//  - « les séances de saut au PCN débutent à 9h00 ».
// ============================================================
export const OUVERTURE = {
  saisonDebut: { mois: 3, jour: 1 },
  saisonFin:   { mois: 12, jour: 15 },
  vendrediDebutMois: 5,
  vendrediFinMois: 9,
  heureOuverture: 8.5,
  heurePremierSaut: 9,
  heureSplit: 14,
  heureVendredi: 16,
};

// Affichage uniquement (sans effet sur le verdict) : écart de vent moyen
// à partir duquel on signale que la prévision a bougé depuis la dernière
// consultation (js/tendance.js).
export const SEUILS_COMMUNS = {
  tendancePrevisionVent: 4, // km/h
};

// ============================================================
// TRAJET — Bouillon → Paraclub Namur (Google Maps, sans péage).
// Le prix du litre est récupéré chaque jour (Statbel, js/carburant.js) ;
// la valeur ci-dessous n'est qu'un repli.
// ============================================================
export const TRAJET = {
  distanceAllerKm: 113,
  dureeAllerMin: 90,
  consoL100: 6,
  prixCarburantDefaut: 2.50,
};

export function coutAllerRetour(prixLitre = null) {
  const km = TRAJET.distanceAllerKm * 2;
  const prix = (typeof prixLitre === "number" && prixLitre > 0) ? prixLitre : TRAJET.prixCarburantDefaut;
  return {
    km,
    minutes: TRAJET.dureeAllerMin * 2,
    prixLitre: prix,
    euros: Math.round(km * (TRAJET.consoL100 / 100) * prix),
  };
}

export const LIENS = {
  gmaps: `https://www.google.com/maps/dir/?api=1&destination=${DZ.lat},${DZ.lon}&travelmode=driving&dir_action=navigate`,
  irm: "https://www.meteo.be/fr/namur",
  windy: `https://www.windy.com/${DZ.lat}/${DZ.lon}?wind,${DZ.lat},${DZ.lon},11`,
  club: "https://paraclubnamur.be",
  briefing: "https://pro.paraclubnamur.be/fr/meteo",
};

export const VERSION = "2.1.0";
