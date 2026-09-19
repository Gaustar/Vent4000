// ============================================================
// Vent4000 — Tendance de la prévision
//
// Répond à « est-ce que ça s'améliore ou ça se dégrade depuis la dernière
// fois que j'ai regardé ? », question typique quand on surveille un
// week-end depuis le jeudi. Compare la prévision actuelle d'un jour à un
// instantané plus ancien conservé en local.
//
// Logique pure et testable ; le stockage (localStorage) est géré par app.js.
// ============================================================

import { SEUILS_COMMUNS } from "./config.js";

const RANG = { rouge: 0, orange: 1, vert: 2 };

// Un instantané plus récent que ça ne dit rien d'utile : on compare la
// prévision d'aujourd'hui à celle d'hier, pas à celle d'il y a 10 minutes.
export const AGE_MIN_INSTANTANE_H = 4;

/**
 * @param {{verdict:string, vent:number}} actuelle
 * @param {{verdict:string, vent:number, ts:number}|null|undefined} precedente
 * @param {number} maintenantMs
 * @returns {{sens:"amelioration"|"degradation"|"stable", depuisH:number, deltaVent:number}|null}
 *   `null` = pas de comparaison possible (pas d'instantané, ou trop récent).
 */
export function comparerPrevisions(actuelle, precedente, maintenantMs = Date.now()) {
  if (!actuelle || !precedente || precedente.ts == null) return null;
  const ageH = (maintenantMs - precedente.ts) / 3600000;
  if (ageH < AGE_MIN_INSTANTANE_H) return null;

  const depuisH = Math.round(ageH);
  const deltaVent = Math.round((actuelle.vent ?? 0) - (precedente.vent ?? 0));
  const rangActuel = RANG[actuelle.verdict];
  const rangPrecedent = RANG[precedente.verdict];

  // Le changement de verdict prime : c'est ce qui change la décision.
  if (rangActuel != null && rangPrecedent != null && rangActuel !== rangPrecedent) {
    return {
      sens: rangActuel > rangPrecedent ? "amelioration" : "degradation",
      depuisH,
      deltaVent,
    };
  }

  // À verdict égal, on regarde si le vent bouge significativement.
  if (Math.abs(deltaVent) >= SEUILS_COMMUNS.tendancePrevisionVent) {
    return { sens: deltaVent < 0 ? "amelioration" : "degradation", depuisH, deltaVent };
  }
  return { sens: "stable", depuisH, deltaVent };
}

/**
 * Décide si l'instantané stocké doit être remplacé par la prévision
 * courante. On ne l'écrase que s'il a déjà servi de base de comparaison
 * (sinon on perdrait le recul à chaque ouverture de l'app).
 */
export function doitRemplacerInstantane(precedente, maintenantMs = Date.now()) {
  if (!precedente || precedente.ts == null) return true;
  return (maintenantMs - precedente.ts) / 3600000 >= AGE_MIN_INSTANTANE_H;
}
