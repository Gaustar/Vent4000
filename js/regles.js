// ============================================================
// Vent4000 — Règles de saut (v2.1)
//
// Chaque règle est un texte écrit, cité. Elle est appliquée à chaque
// SOURCE de données séparément (observation, TAF, chaque modèle), puis
// scoring.js compte les sources qui la respectent.
//
// Statuts d'une règle pour une source :
//   "ok"      — la donnée respecte la règle
//   "echec"   — la donnée viole la règle
//   "limite"  — pas de règle chiffrée violée, mais une condition que le
//               Responsable Technique doit apprécier (pluie, CB, ouverture
//               au-dessus d'une couche) — ne bloque pas, n'autorise pas vert
//   "inconnu" — la source ne fournit pas la donnée (jamais estimée)
//
// Module pur.
// ============================================================

import { LEGAL_BE, COUCHE_PLAFOND } from "./config.js";

/** Les règles, dans l'ordre d'affichage. */
export const REGLES = [
  { id: "ventLegal",  label: "Vent moyen ≤ 25 kts",           source: "CIR/GDF-05 §6 c" },
  { id: "ventNiveau", label: "Vent moyen ≤ limite du brevet",  source: "RSB FWCP §3.4.2" },
  { id: "rafales",    label: "Rafales ≤ limite du brevet",     source: "RSB FWCP §3.4.2 (appliqué à la rafale)" },
  { id: "plafond",    label: "Base des nuages ≥ 3000 ft",      source: "CIR/GDF-05 §6 b · RSB §3.4.1" },
  { id: "ouverture",  label: "Ouverture sous la couche",       source: "RSB §6.4.1 (tandem) · club (AFF)" },
  { id: "visibilite", label: "Visibilité ≥ 3 km",              source: "CIR/GDF-05 §6 a · RSB §3.4.1" },
  { id: "orage",      label: "Pas d'orage",                    source: "CIR/GDF-05 §6 : vol en VMC" },
  { id: "pluie",      label: "Pas de précipitations",          source: "aucun seuil écrit — appréciation du RT" },
];

const r = Math.round;
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".0", "")} km` : `${r(m)} m`);

/**
 * Normalise les données horaires d'un MODÈLE en conditions comparables à
 * celles d'un METAR ou d'un TAF. Aucune estimation :
 *  - le plafond n'est renseigné que si le modèle CALCULE la base des
 *    nuages (HARMONIE DMI, UKMO 2 km) et prévoit une couche basse ≥ 5/8 ;
 *  - si la couverture basse (0-2 km) du modèle est < 5/8, il n'y a, par
 *    définition, aucun plafond sous ~2 km : `plafondAuMoins = 2000` ;
 *  - couche basse ≥ 5/8 sans base calculée → plafond inconnu, signalé.
 * @param {{vent, rafales, nuagesBas, base, visibilite, code}} m
 * @param {boolean} fournitBase
 */
export function conditionsModele(m, fournitBase = false) {
  const c = {
    vent: m.vent ?? null,
    rafales: m.rafales ?? null,
    dir: m.dir ?? null,
    visibilite: m.visibilite ?? null,
    orage: m.code != null ? m.code >= 95 : null,
    precip: m.code != null ? ((m.code >= 51 && m.code <= 67) || (m.code >= 71 && m.code <= 86)) : null,
    brouillard: m.code === 45 || m.code === 48,
    plafond: null,
    plafondAuMoins: null,
    coucheBasse: null,
  };
  if (m.nuagesBas != null) {
    c.coucheBasse = m.nuagesBas >= COUCHE_PLAFOND;
    if (!c.coucheBasse) c.plafondAuMoins = 2000;
    else if (fournitBase && m.base != null && m.base > 0) c.plafond = m.base;
  }
  return c;
}

/**
 * Évalue toutes les règles sur UNE source.
 * @param {object} c — conditions : {vent, rafales, plafond, plafondAuMoins,
 *   coucheBasse, visibilite, orage, precip, cb}
 * @param {{ventMax:number, hauteurOuverture:number}} seuils
 * @returns {Object<string, {statut:string, detail:string}>}
 */
export function evaluerSource(c, seuils) {
  const res = {};
  const set = (id, statut, detail) => { res[id] = { statut, detail }; };

  // Vent moyen — loi puis brevet.
  if (c.vent == null) { set("ventLegal", "inconnu", "—"); set("ventNiveau", "inconnu", "—"); }
  else {
    set("ventLegal", c.vent > LEGAL_BE.ventMoyenMaxSol ? "echec" : "ok", `${r(c.vent)} km/h`);
    set("ventNiveau", c.vent > seuils.ventMax ? "echec" : "ok", `${r(c.vent)} / ${seuils.ventMax} km/h`);
  }
  // Rafales. Un METAR ou un TAF sans « G » signifie : pas de rafales
  // significatives (≥ 10 kt au-dessus de la moyenne) → on teste la moyenne.
  const raf = c.rafales ?? (c.rafalesAbsentesSignifientCalme ? c.vent : null);
  if (raf == null) set("rafales", "inconnu", "—");
  else set("rafales", raf > seuils.ventMax ? "echec" : "ok", `${r(raf)} / ${seuils.ventMax} km/h`);

  // Plafond.
  const plafondConnu = c.plafond != null ? c.plafond : null;
  if (plafondConnu != null) {
    set("plafond", plafondConnu < LEGAL_BE.plafondMinAGL ? "echec" : "ok",
      plafondConnu === Infinity ? "pas de couche ≥ 5/8" : `${km(plafondConnu)}`);
  } else if (c.plafondAuMoins != null) {
    set("plafond", "ok", `> ${km(c.plafondAuMoins)} (pas de couche basse ≥ 5/8)`);
  } else if (c.coucheBasse) {
    set("plafond", "inconnu", "couche basse ≥ 5/8, base non fournie");
  } else {
    set("plafond", "inconnu", "—");
  }

  // Ouverture : seulement si le niveau ouvre au-dessus du plancher légal
  // (tandem 5000 ft, AFF ~1500 m). Une couche entre le plancher et
  // l'altitude d'ouverture oblige à ouvrir au-dessus d'elle.
  if (seuils.hauteurOuverture > LEGAL_BE.plafondMinAGL) {
    if (plafondConnu != null && plafondConnu !== Infinity && plafondConnu >= LEGAL_BE.plafondMinAGL && plafondConnu < seuils.hauteurOuverture) {
      set("ouverture", "limite", `couche à ${km(plafondConnu)} < ouverture ${km(seuils.hauteurOuverture)}`);
    } else if (plafondConnu != null || c.plafondAuMoins != null) {
      set("ouverture", "ok", `ouverture ${km(seuils.hauteurOuverture)}`);
    } else {
      set("ouverture", "inconnu", "—");
    }
  }

  // Visibilité.
  if (c.visibilite == null) set("visibilite", "inconnu", "—");
  else set("visibilite", c.visibilite < LEGAL_BE.visibiliteMin ? "echec" : "ok", km(Math.min(c.visibilite, 99000)));

  // Orage / cumulonimbus.
  if (c.orage) set("orage", "echec", "orage");
  else if (c.cb) set("orage", "limite", "cumulonimbus");
  else if (c.orage === false) set("orage", "ok", "non");
  else set("orage", "inconnu", "—");

  // Précipitations.
  if (c.precip) set("pluie", "limite", (c.temps ?? []).join(" ") || "précipitations");
  else if (c.precip === false) set("pluie", "ok", "non");
  else set("pluie", "inconnu", "—");

  return res;
}

/** Conditions d'un METAR ou d'un TAF, au format de evaluerSource. */
export function conditionsAero(cond) {
  return {
    vent: cond.vent ?? null,
    rafales: cond.rafales ?? null,
    dir: cond.dir ?? null,
    rafalesAbsentesSignifientCalme: cond.vent != null,
    plafond: cond.plafond !== undefined ? cond.plafond : null,
    plafondAuMoins: null,
    coucheBasse: null,
    visibilite: cond.visibilite ?? null,
    // Dans un METAR ou un TAF, l'absence de groupe de temps présent
    // signifie « aucun phénomène significatif » (groupes TAF fusionnés
    // avec la base, cf. conditionsTaf).
    orage: !!cond.orage,
    precip: !!cond.precip,
    cb: !!cond.cb,
    temps: cond.temps ?? [],
  };
}
