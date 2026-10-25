// ============================================================
// Vent4000 — Le langage de tout le monde
//
// L'app parle d'abord à un passager tandem, à un élève, à un parent qui
// vient voir sauter : pas de METAR, pas de « BKN012 », pas de « 3/5
// sources ». Ce module traduit les données en phrases courtes. Il ne
// décide rien : les verdicts restent ceux de regles.js / scoring.js, et
// les détails techniques restent disponibles (mode expert).
//
// Module pur (aucune dépendance DOM) : testé sous Node.
// ============================================================

/** Règle (regles.js) → phrase courte, selon qu'elle est non respectée ou douteuse. */
const MOTS_REGLES = {
  ventLegal:  { violee: "Vent trop fort pour sauter (limite légale)", doute: "Vent proche de la limite légale" },
  ventNiveau: { violee: "Vent trop fort pour ton niveau",             doute: "Vent à la limite de ton niveau" },
  rafales:    { violee: "Rafales trop fortes pour ton niveau",        doute: "Rafales à la limite de ton niveau" },
  plafond:    { violee: "Nuages trop bas",                            doute: "Hauteur des nuages incertaine" },
  ouverture:  { violee: "Nuages sous l'altitude d'ouverture",         doute: "Nuages possibles sous l'altitude d'ouverture" },
  visibilite: { violee: "Pas assez de visibilité",                    doute: "Visibilité incertaine" },
  orage:      { violee: "Orage",                                      doute: "Nuages d'orage possibles" },
  pluie:      { violee: "Pluie",                                      doute: "Pluie possible" },
};

/** @param {{id:string, statut:string, label?:string}} regle */
export function regleEnClair(regle) {
  const mots = MOTS_REGLES[regle?.id];
  if (!mots) return regle?.label ?? "";
  return regle.statut === "violee" ? mots.violee : mots.doute;
}

/**
 * Fiabilité d'une journée, en clair.
 * @param {{precision:string, confiance:string, index:number}} jour  (calculerJoursOuverts)
 */
export function confianceEnClair(jour) {
  if (jour.precision === "regional" || jour.index >= 3) return "Prévision lointaine : elle peut encore changer";
  if (jour.confiance === "faible") return "Les prévisions ne sont pas toutes d'accord";
  if (jour.confiance === "haute") return "Les prévisions sont d'accord";
  return "Prévision à confirmer";
}

/** « aujourd'hui », « demain », « dans 4 jours ». */
export function echeanceEnClair(index) {
  if (index === 0) return "aujourd'hui";
  if (index === 1) return "demain";
  return `dans ${index} jours`;
}

const DIRECTIONS = ["du nord", "du nord-est", "d'est", "du sud-est", "du sud", "du sud-ouest", "d'ouest", "du nord-ouest"];

/** 260° → « d'ouest » (direction d'où vient le vent, 8 secteurs). */
export function directionEnClair(deg) {
  if (deg == null || !Number.isFinite(deg)) return null;
  return DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const COUVERTURES = { FEW: "quelques nuages", SCT: "nuages épars", BKN: "ciel très nuageux", OVC: "ciel couvert" };

const metres = (m) => (m >= 1000 ? `${(Math.round(m / 100) / 10).toLocaleString("fr-BE")} km` : `${Math.round(m / 10) * 10} m`);

/**
 * Ciel d'un METAR en clair : la couche la plus basse qui compte.
 * @param {{cavok?:boolean, nuages?:{couverture:string, baseM:number}[]}} m
 */
export function cielEnClair(m) {
  if (m?.cavok) return "ciel dégagé";
  const nuages = m?.nuages ?? [];
  if (!nuages.length) return "pas de nuage bas";
  const vv = nuages.find((n) => n.couverture === "VV");
  if (vv) return "brouillard, ciel invisible";
  // La couche la plus basse qui fait plafond si elle existe, sinon la plus basse.
  const plafond = nuages.filter((n) => n.couverture === "BKN" || n.couverture === "OVC").sort((a, b) => a.baseM - b.baseM)[0];
  const couche = plafond ?? [...nuages].sort((a, b) => a.baseM - b.baseM)[0];
  return `${COUVERTURES[couche.couverture] ?? "nuages"} à ${metres(couche.baseM)}`;
}

/** Visibilité en clair. */
export function visibiliteEnClair(m) {
  if (m == null || !Number.isFinite(m)) return null;
  if (m >= 10000) return "bonne visibilité";
  if (m >= 5000) return `visibilité moyenne (${metres(m)})`;
  return `mauvaise visibilité (${metres(m)})`;
}

const TEMPS = [
  [/TS/, "orage"], [/FG/, "brouillard"], [/BR/, "brume"], [/SN/, "neige"], [/GR|GS/, "grêle"],
  [/SH.*RA|SHRA/, "averses"], [/RA/, "pluie"], [/DZ/, "bruine"],
];

/** Temps présent (codes METAR « -SHRA », « BR »…) → mots, sans doublon. */
export function tempsEnClair(codes) {
  const mots = [];
  for (const c of codes ?? []) {
    if (/^VC/.test(c)) continue;
    const trouve = TEMPS.find(([re]) => re.test(c));
    if (trouve && !mots.includes(trouve[1])) mots.push(trouve[1]);
  }
  return mots.join(", ");
}
