// ============================================================
// Vent4000 — Estimation de dérive (spot)
//
// Intègre le vent sur la tranche d'altitude parcourue pour estimer de
// combien le parachutiste dérive, en chute puis sous voile. Module 100 %
// pur (aucune dépendance DOM ni fetch), testable en Node.
//
// ⚠ ESTIMATION. Hypothèses : taux de chute et vitesse de chute moyens
// (cf. VOL dans config.js), vent supposé linéaire entre deux niveaux
// mesurés, pas de portance/pilotage sous voile (un parachutiste qui
// remonte face au vent dérive nettement moins). Sert à anticiper l'ordre
// de grandeur, pas à remplacer le largueur ni la manche à air.
// ============================================================

import { VOL } from "./config.js";

/**
 * Convertit une observation « vent de 240° à 20 km/h » en vecteur de
 * déplacement (mètres par seconde) vers l'est et vers le nord.
 * La direction météo est celle d'où vient le vent : il pousse donc
 * vers direction + 180°.
 */
function vecteur(vitesseKmh, directionDeg) {
  const v = vitesseKmh / 3.6;
  const rad = (directionDeg * Math.PI) / 180;
  return { est: -v * Math.sin(rad), nord: -v * Math.cos(rad) };
}

/**
 * Profil de vent trié par altitude croissante, à partir des données
 * horaires d'Open-Meteo.
 * @returns {Array<{agl:number, vent:number, dir:number}>}
 */
export function profilVent(h) {
  const points = [];
  if (h.vent10 != null && h.direction10 != null) {
    points.push({ agl: 10, vent: h.vent10, dir: h.direction10 });
  }
  for (const [m, n] of Object.entries(h.niveauxAGL ?? {})) {
    if (n?.vent != null && n?.dir != null) {
      points.push({ agl: Number(m), vent: n.vent, dir: n.dir });
    }
  }
  for (const n of Object.values(h.niveaux ?? {})) {
    if (n?.vent != null && n?.dir != null && n?.agl != null) {
      points.push({ agl: n.agl, vent: n.vent, dir: n.dir });
    }
  }
  return points.sort((a, b) => a.agl - b.agl);
}

/**
 * Dérive entre deux altitudes, à taux de chute constant.
 * @param {Array<{agl,vent,dir}>} profil — trié par altitude croissante
 * @param {number} bas — altitude basse (m AGL)
 * @param {number} haut — altitude haute (m AGL)
 * @param {number} tauxChute — m/s (vitesse verticale, > 0)
 * @returns {{distance:number, cap:number, duree:number}} distance en m, cap en degrés (vers où ça dérive)
 */
export function derive(profil, bas, haut, tauxChute) {
  if (!profil?.length || haut <= bas || tauxChute <= 0) {
    return { distance: 0, cap: 0, duree: 0 };
  }

  /** Vent interpolé à une altitude donnée. */
  function ventA(agl) {
    if (agl <= profil[0].agl) return profil[0];
    if (agl >= profil[profil.length - 1].agl) return profil[profil.length - 1];
    for (let i = 1; i < profil.length; i++) {
      const a = profil[i - 1];
      const b = profil[i];
      if (agl <= b.agl) {
        const t = (agl - a.agl) / (b.agl - a.agl);
        // On interpole les composantes, pas l'angle : moyenner 350° et 10°
        // donnerait 180° (plein sud) au lieu de 0° (plein nord).
        const va = vecteur(a.vent, a.dir);
        const vb = vecteur(b.vent, b.dir);
        return {
          composantes: {
            est: va.est + (vb.est - va.est) * t,
            nord: va.nord + (vb.nord - va.nord) * t,
          },
        };
      }
    }
    return profil[profil.length - 1];
  }

  const PAS = 25; // m — découpage vertical de l'intégration
  let est = 0;
  let nord = 0;
  let duree = 0;
  for (let alt = bas; alt < haut; alt += PAS) {
    const tranche = Math.min(PAS, haut - alt);
    const dt = tranche / tauxChute;
    const p = ventA(alt + tranche / 2);
    const v = p.composantes ?? vecteur(p.vent, p.dir);
    est += v.est * dt;
    nord += v.nord * dt;
    duree += dt;
  }

  const distance = Math.hypot(est, nord);
  const cap = (Math.atan2(est, nord) * 180) / Math.PI;
  return {
    distance: Math.round(distance),
    cap: Math.round((cap + 360) % 360),
    duree: Math.round(duree),
  };
}

/**
 * Estimation complète du spot pour une heure donnée.
 * @param {object} h — heure normalisée (cf. meteo.js)
 * @param {number} hauteurOuverture — m AGL, selon le niveau de pratique
 * @param {number} altitudeLargage — m AGL
 * @returns {{chute, voile, total, pointLargage:{distance:number, cap:number}}}
 *   `pointLargage` = où se placer par rapport à la zone de poser :
 *   à l'opposé de la dérive totale (donc face au vent).
 */
export function estimerSpot(h, hauteurOuverture, altitudeLargage) {
  const profil = profilVent(h);
  const voile = derive(profil, 0, hauteurOuverture, VOL.tauxChuteVoile);
  const chute = derive(profil, hauteurOuverture, altitudeLargage, VOL.vitesseChuteLibre);

  const total = {
    distance: 0,
    cap: 0,
    duree: voile.duree + chute.duree,
  };
  // Somme vectorielle des deux dérives (on repasse par les composantes).
  const cv = capVersComposantes(voile);
  const cc = capVersComposantes(chute);
  const est = cv.est + cc.est;
  const nord = cv.nord + cc.nord;
  total.distance = Math.round(Math.hypot(est, nord));
  total.cap = Math.round(((Math.atan2(est, nord) * 180) / Math.PI + 360) % 360);

  return {
    chute,
    voile,
    total,
    pointLargage: { distance: total.distance, cap: (total.cap + 180) % 360 },
  };
}

function capVersComposantes({ distance, cap }) {
  const rad = (cap * Math.PI) / 180;
  return { est: distance * Math.sin(rad), nord: distance * Math.cos(rad) };
}
