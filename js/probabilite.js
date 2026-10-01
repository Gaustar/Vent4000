// ============================================================
// Vent4000 — Probabilité de saut (v2.0)
//
// Chaque modèle déterministe et chaque membre d'ensemble « vote » pour
// une heure : sautable ou non, sur les critères qu'il fournit. La
// probabilité est la part pondérée des votes favorables (cf. PROBA et
// MODELES dans config.js pour les poids et leur justification).
//
// Pourquoi un vote plutôt qu'une moyenne : faire la moyenne des rafales
// de 7 modèles écrase le scénario qui compte (2 modèles sur 7 voient
// passer un front à 50 km/h). Le vote garde ce scénario visible sous la
// forme d'une probabilité de 70 % au lieu d'un faux 100 %.
//
// Module pur, testable sans réseau.
// ============================================================

import { MODELES, PROBA, SEUILS_COMMUNS, LEGAL_BE } from "./config.js";

/**
 * Un scénario (modèle ou membre) passe-t-il les critères de saut ?
 * @param {{vent:number|null, rafales:number|null, precip:number|null, nuagesBas:number|null}} s
 * @param {{ventMax:number}} seuils
 * @returns {{passe:boolean, echecs:string[]}} echecs ⊂ {"vent","rafales","pluie","nuages"}
 */
export function scenarioPasse(s, seuils) {
  const echecs = [];
  if (s.vent != null && (s.vent > LEGAL_BE.ventMoyenMaxSol || s.vent > seuils.ventMax)) echecs.push("vent");
  if (s.rafales != null && s.rafales > seuils.ventMax) echecs.push("rafales");
  if (s.precip != null && s.precip > SEUILS_COMMUNS.precipMax) echecs.push("pluie");
  if (s.nuagesBas != null && s.nuagesBas >= PROBA.nuagesBasBouche) echecs.push("nuages");
  return { passe: echecs.length === 0, echecs };
}

/** Poids total accordé aux ensembles, croissant avec l'échéance. */
export function poidsEnsemble(echeanceJours = 0) {
  return Math.min(
    PROBA.poidsEnsembleMax,
    PROBA.poidsEnsembleBase + Math.max(0, echeanceJours - 1) * PROBA.poidsEnsembleParJour
  );
}

/**
 * @param {object} h — heure normalisée : h.modeles {id: scénario}, h.ensemble [scénario+ens]
 * @param {{ventMax:number}} seuils
 * @param {number} echeanceJours
 * @returns {null | {
 *   p:number,                       // 0..1
 *   modeles:Array<{id, nom, hr, passe, echecs, vent, rafales}>,
 *   ensemble:{passe:number, total:number},
 *   echecs:{vent:number, rafales:number, pluie:number, nuages:number}  // part du poids total en échec par critère
 * }}
 */
export function probabiliteSaut(h, seuils, echeanceJours = 0) {
  let poidsTotal = 0;
  let poidsOui = 0;
  const echecs = { vent: 0, rafales: 0, pluie: 0, nuages: 0 };
  const detailModeles = [];

  for (const m of MODELES) {
    const s = h.modeles?.[m.id];
    if (!s || s.rafales == null) continue;
    const r = scenarioPasse(s, seuils);
    poidsTotal += m.poids;
    if (r.passe) poidsOui += m.poids;
    for (const e of r.echecs) echecs[e] += m.poids;
    detailModeles.push({ id: m.id, nom: m.nom, hr: !!m.hr, passe: r.passe, echecs: r.echecs, vent: s.vent, rafales: s.rafales });
  }

  const membres = h.ensemble ?? [];
  const parEns = new Map();
  for (const s of membres) {
    if (!parEns.has(s.ens)) parEns.set(s.ens, []);
    parEns.get(s.ens).push(s);
  }
  let ensPasse = 0;
  if (parEns.size) {
    // Chaque ensemble pèse autant, quel que soit son nombre de membres :
    // sinon ECMWF (51) écraserait GEFS (31) par simple effectif.
    const poidsParEns = poidsEnsemble(echeanceJours) / parEns.size;
    for (const liste of parEns.values()) {
      const pm = poidsParEns / liste.length;
      for (const s of liste) {
        const r = scenarioPasse(s, seuils);
        poidsTotal += pm;
        if (r.passe) { poidsOui += pm; ensPasse++; }
        for (const e of r.echecs) echecs[e] += pm;
      }
    }
  }

  if (poidsTotal === 0) return null;
  for (const k of Object.keys(echecs)) echecs[k] = echecs[k] / poidsTotal;
  return {
    p: poidsOui / poidsTotal,
    modeles: detailModeles,
    ensemble: { passe: ensPasse, total: membres.length },
    echecs,
  };
}

/**
 * Part pondérée des modèles déterministes qui prévoient une couche basse
 * (≥ 60 % sous 2 km). Sert à arbitrer un plafond bas annoncé par le seul
 * modèle principal : la nébulosité basse est la variable la moins fiable
 * d'une prévision (constaté le 01/10/2026 : 97 % de couche basse prévue
 * par le modèle principal, FEW035 observé à Charleroi, et seulement 2
 * modèles sur 7 d'accord).
 * @returns {{part:number, n:number}|null}
 */
export function accordCoucheBasse(h, seuilCouverture = 60) {
  let total = 0;
  let oui = 0;
  let n = 0;
  for (const m of MODELES) {
    const nb = h.modeles?.[m.id]?.nuagesBas;
    if (nb == null) continue;
    total += m.poids;
    n++;
    if (nb >= seuilCouverture) oui += m.poids;
  }
  return total ? { part: oui / total, n } : null;
}

/**
 * Confiance = netteté du consensus. 90 % ou 10 % de votes favorables,
 * c'est une prévision tranchée ; 50 %, c'est un pile ou face.
 * @returns {"haute"|"moyenne"|"faible"|"unique"}
 */
export function confianceProba(proba) {
  if (!proba) return "unique";
  const nettete = Math.abs(proba.p - 0.5) * 2; // 0 = pile ou face, 1 = unanimité
  if (nettete >= 0.7) return "haute";
  if (nettete >= 0.4) return "moyenne";
  return "faible";
}

/** Critère qui fait le plus échouer les votes (ou null si aucun). */
export function critereLimitant(proba) {
  if (!proba) return null;
  const [cle, part] = Object.entries(proba.echecs).sort((a, b) => b[1] - a[1])[0];
  return part > 0 ? cle : null;
}

