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
// ⚠ Valeurs INDICATIVES (références USPA / DZ internationales).
// La décision finale appartient toujours au club et aux moniteurs.
export const NIVEAUX_PRATIQUE = {
  tandem: { label: "Tandem",       ventMax: 28, plafondMin: 1500 },
  aff:    { label: "Élève AFF",    ventMax: 22, plafondMin: 2800 },
  brevetA:{ label: "Brevet A",     ventMax: 33, plafondMin: 1400 },
  brevetBCD:{ label: "Brevet B/C/D", ventMax: 46, plafondMin: 1100 },
};

// Seuils communs (identiques quel que soit le niveau)
export const SEUILS_COMMUNS = {
  precipMax: 0.2,        // mm/h — au-delà : rouge
  probaPluieMax: 60,     // % — au-delà : rouge
  capeOrange: 400,       // J/kg — instabilité notable
  capeRouge: 800,        // J/kg — risque orageux
  visibiliteMin: 5000,   // m — VFR
  ecartRafalesOrange: 10,// km/h d'écart rafales/vent moyen (~5 kt)
  ventOrangeRatio: 0.8,  // vent > 80 % du seuil → orange
  nuagesOrangeMin: 30,   // % couverture basse+moyenne combinée
  nuagesOrangeMax: 75,
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
};

export const VERSION = "1.0.0";
