// ============================================================
// Vent4000 — Moteur de score « ça saute ? »
// Module 100 % pur (aucune dépendance DOM ni fetch) :
// réutilisable tel quel dans un script Node (alerte Telegram v2).
//
// Verdicts : "vert" | "orange" | "rouge"
// Étage 1 — éliminatoires  → rouge direct
// Étage 2 — dégradants     → orange
// Sinon                    → vert
// ============================================================

import { SEUILS_COMMUNS, DZ } from "./config.js";

/**
 * Plafond nuageux estimé en m AGL.
 * Base convective ≈ 122 m par °C d'écart température / point de rosée,
 * pondérée par les couches nuageuses réelles :
 *  - couche basse marquée  → la base estimée fait foi
 *  - couche moyenne marquée→ plafond ≈ 3000 m
 *  - ciel peu couvert      → plafond illimité (Infinity)
 */
export function plafondEstime(h) {
  const ecart = Math.max(0, (h.t2m ?? 0) - (h.pointRosee ?? 0));
  const base = Math.round(122 * ecart);
  const bas = h.nuagesBas ?? 0;
  const moyen = h.nuagesMoyens ?? 0;
  if (bas >= 40) return base;
  if (moyen >= 60) return Math.max(base, 3000);
  if (bas + moyen < 25) return Infinity;
  return Math.max(base, 3000);
}

/**
 * Composante de vent traversier (crosswind) par rapport à l'axe de piste.
 * @returns {{traversier:number, face:number}} en km/h (valeurs absolues)
 */
export function ventPiste(vitesse, direction, qfu = DZ.qfu) {
  const delta = ((direction - qfu) * Math.PI) / 180;
  return {
    traversier: Math.abs(Math.round(vitesse * Math.sin(delta))),
    face: Math.abs(Math.round(vitesse * Math.cos(delta))),
  };
}

/**
 * Score d'une heure.
 * @param {object} h — { vent10, rafales10, direction10, t2m, pointRosee,
 *   precip, probaPluie, nuagesBas, nuagesMoyens, nuagesHauts, visibilite, cape }
 * @param {object} seuils — { ventMax, plafondMin } du niveau de pratique
 * @returns {{verdict:string, raisons:string[], plafond:number}}
 */
export function scoreHeure(h, seuils) {
  const C = SEUILS_COMMUNS;
  const raisons = [];
  const plafond = plafondEstime(h);

  // --- Étage 1 : éliminatoires -------------------------------
  if ((h.precip ?? 0) > C.precipMax) raisons.push("Pluie");
  if ((h.probaPluie ?? 0) >= C.probaPluieMax) raisons.push("Forte proba de pluie");
  if ((h.cape ?? 0) >= C.capeRouge) raisons.push("Risque orageux (CAPE)");
  if (h.visibilite != null && h.visibilite < C.visibiliteMin) raisons.push("Visibilité < 5 km");
  if (plafond < seuils.plafondMin) raisons.push(`Plafond ~${plafond} m`);
  if ((h.vent10 ?? 0) > seuils.ventMax) raisons.push(`Vent ${Math.round(h.vent10)} km/h`);
  if (raisons.length) return { verdict: "rouge", raisons, plafond };

  // --- Étage 2 : dégradants ----------------------------------
  if ((h.vent10 ?? 0) > seuils.ventMax * C.ventOrangeRatio)
    raisons.push("Vent proche du seuil");
  const ecartRafales = (h.rafales10 ?? 0) - (h.vent10 ?? 0);
  if (ecartRafales > C.ecartRafalesOrange)
    raisons.push(`Rafales +${Math.round(ecartRafales)} km/h`);
  const couverture = (h.nuagesBas ?? 0) + (h.nuagesMoyens ?? 0);
  if (couverture >= C.nuagesOrangeMin && couverture <= C.nuagesOrangeMax)
    raisons.push("Ciel partiellement couvert");
  if ((h.cape ?? 0) >= C.capeOrange) raisons.push("Instabilité (CAPE)");
  if (raisons.length) return { verdict: "orange", raisons, plafond };

  return { verdict: "vert", raisons: [], plafond };
}

/**
 * Score d'un créneau = meilleure fenêtre de 2 h consécutives.
 *  - 2 h vertes consécutives           → vert
 *  - 2 h sautables (vert/orange) cons. → orange
 *  - sinon                             → rouge
 * @param {string[]} verdictsHoraires — verdicts des heures du créneau, dans l'ordre
 */
export function scoreCreneau(verdictsHoraires) {
  if (verdictsHoraires.length === 0) return "rouge";
  if (verdictsHoraires.length === 1) return verdictsHoraires[0];
  for (let i = 0; i < verdictsHoraires.length - 1; i++) {
    if (verdictsHoraires[i] === "vert" && verdictsHoraires[i + 1] === "vert")
      return "vert";
  }
  for (let i = 0; i < verdictsHoraires.length - 1; i++) {
    if (verdictsHoraires[i] !== "rouge" && verdictsHoraires[i + 1] !== "rouge")
      return "orange";
  }
  return "rouge";
}

/** Pire des deux : utile pour le badge global d'un jour (meilleur créneau). */
export function meilleurVerdict(verdicts) {
  if (verdicts.includes("vert")) return "vert";
  if (verdicts.includes("orange")) return "orange";
  return "rouge";
}

/**
 * Niveau de confiance basé sur l'accord entre deux modèles météo indépendants
 * (ex. DWD ICON-D2 vs Météo-France AROME) pour le vent au sol.
 * @param {number} ventPrimaire
 * @param {number|null|undefined} ventSecondaire — absent au-delà de J+3 (AROME)
 */
export function niveauConfiance(ventPrimaire, ventSecondaire) {
  if (ventSecondaire == null || ventPrimaire == null) return { niveau: "unique", ecart: null };
  const ecart = Math.round(Math.abs(ventPrimaire - ventSecondaire));
  if (ecart <= SEUILS_COMMUNS.confianceHauteMax) return { niveau: "haute", ecart };
  if (ecart <= SEUILS_COMMUNS.confianceMoyenneMax) return { niveau: "moyenne", ecart };
  return { niveau: "faible", ecart };
}
