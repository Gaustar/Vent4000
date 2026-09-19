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
 *
 * Volontairement PURE INFO — n'intervient pas dans le verdict. Contrairement
 * à un avion, un parachutiste sous voile choisit son axe d'atterrissage en
 * fonction de la manche à air et non de l'axe de piste : un atterrissage
 * "travers" bien négocié (flare symétrique et franc) n'est pas plus
 * dangereux qu'un atterrissage face au vent (cf. Skydivemag "Crosswind
 * Landings" / "Landing Priorities" — la technique prime sur l'axe).
 * Affiché ici pour la lecture du terrain (place de l'axe piste vs vent) et
 * pour aider les pilotes largueurs, pas comme seuil personnel du sauteur.
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
 *   precip, probaPluie, nuagesBas, nuagesMoyens, nuagesHauts, visibilite, cape,
 *   ventPrecedent?, comparaisons? }
 *   `ventPrecedent` (optionnel) : vent moyen de l'heure précédente, pour
 *   détecter une hausse rapide. `comparaisons` (optionnel) : voir
 *   `niveauConfiance` — permet de dégrader le verdict si les modèles
 *   météo divergent fortement pour cette heure.
 * @param {object} seuils — { ventMax, plafondMin, ecartRafalesOrange } du niveau de pratique
 * @returns {{verdict:string, raisons:string[], plafond:number}}
 */
export function scoreHeure(h, seuils) {
  const C = SEUILS_COMMUNS;
  const raisons = [];
  const plafond = plafondEstime(h);
  const ecartRafalesOrange = seuils.ecartRafalesOrange ?? C.ecartRafalesOrange ?? 10;

  // --- Étage 1 : éliminatoires -------------------------------
  if ((h.precip ?? 0) > C.precipMax) raisons.push("Pluie");
  if ((h.probaPluie ?? 0) >= C.probaPluieMax) raisons.push("Forte proba de pluie");
  if ((h.cape ?? 0) >= C.capeRouge) raisons.push("Risque orageux (CAPE)");
  if (h.visibilite != null && h.visibilite < C.visibiliteMin) raisons.push("Visibilité < 5 km");
  if (plafond < seuils.plafondMin) raisons.push(`Plafond ~${plafond} m`);
  if ((h.vent10 ?? 0) > seuils.ventMax) raisons.push(`Vent ${Math.round(h.vent10)} km/h`);
  // La limite de vent s'applique à la rafale, pas à la moyenne : c'est la
  // rafale qui compte au moment de l'atterrissage ("assume the worst case
  // scenario at the time of landing" — pratique DZ standard, cf. README).
  if ((h.rafales10 ?? 0) > seuils.ventMax)
    raisons.push(`Rafales ${Math.round(h.rafales10)} km/h (> seuil)`);
  if (raisons.length) return { verdict: "rouge", raisons, plafond };

  // --- Étage 2 : dégradants ----------------------------------
  if ((h.vent10 ?? 0) > seuils.ventMax * C.ventOrangeRatio)
    raisons.push("Vent proche du seuil");
  const ecartRafales = (h.rafales10 ?? 0) - (h.vent10 ?? 0);
  if (ecartRafales > ecartRafalesOrange)
    raisons.push(`Rafales +${Math.round(ecartRafales)} km/h`);
  if (h.ventPrecedent != null) {
    const hausse = (h.vent10 ?? 0) - h.ventPrecedent;
    if (hausse > C.tendanceHausseOrange)
      raisons.push(`Vent en hausse rapide (+${Math.round(hausse)} km/h en 1h)`);
  }
  const couverture = (h.nuagesBas ?? 0) + (h.nuagesMoyens ?? 0);
  if (couverture >= C.nuagesOrangeMin && couverture <= C.nuagesOrangeMax)
    raisons.push("Ciel partiellement couvert");
  if ((h.cape ?? 0) >= C.capeOrange) raisons.push("Instabilité (CAPE)");
  if (raisons.length) return { verdict: "orange", raisons, plafond };

  // Confiance faible entre modèles : pas d'éléments franchement dégradants,
  // mais la prévision elle-même n'est pas fiable → on ne peut pas conclure
  // au vert en confiance. Un para prudent revérifierait avant de conclure.
  if (h.comparaisons) {
    const confiance = niveauConfiance(h.vent10, [
      { nom: "AROME", vent: h.comparaisons.arome?.vent },
      { nom: "ECMWF", vent: h.comparaisons.ecmwf?.vent },
    ]);
    if (confiance.niveau === "faible") {
      return {
        verdict: "orange",
        raisons: [`Modèles météo divergents (écart ${confiance.ecart} km/h) — à revérifier`],
        plafond,
      };
    }
  }

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
 * Niveau de confiance basé sur l'accord entre plusieurs modèles météo
 * indépendants pour le vent au sol (DWD ICON = primaire, + Météo-France
 * AROME sur J0-J3, + ECMWF IFS sur les 7 jours).
 * @param {number} ventPrimaire
 * @param {Array<{nom:string, vent:number|null|undefined}>} autres — modèles secondaires disponibles à cette heure
 * @returns {{niveau:string, ecart:number|null, nModeles:number}}
 */
export function niveauConfiance(ventPrimaire, autres = []) {
  const ecarts = autres
    .filter((m) => m.vent != null && ventPrimaire != null)
    .map((m) => Math.abs(ventPrimaire - m.vent));
  if (ecarts.length === 0) return { niveau: "unique", ecart: null, nModeles: 1 };
  const ecart = Math.round(Math.max(...ecarts));
  const nModeles = ecarts.length + 1;
  if (ecart <= SEUILS_COMMUNS.confianceHauteMax) return { niveau: "haute", ecart, nModeles };
  if (ecart <= SEUILS_COMMUNS.confianceMoyenneMax) return { niveau: "moyenne", ecart, nModeles };
  return { niveau: "faible", ecart, nModeles };
}
