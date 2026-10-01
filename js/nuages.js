// ============================================================
// Vent4000 — Analyse nuageuse verticale (v2.0)
//
// Jusqu'à la v1.8 le plafond venait d'une seule formule : 122 m par °C
// d'écart température / point de rosée. Elle ne vaut que pour un
// cumulus de convection né du sol et ignore tout stratus, toute couche
// en altitude. On lit désormais la couverture nuageuse sur 9 niveaux de
// pression (sol → ~4200 m) : on obtient les COUCHES réelles (base,
// sommet, couverture, température), donc
//  - le plafond = base de la première couche ≥ 60 % (≈ BKN) ;
//  - l'altitude de largage réellement possible sous cette couche ;
//  - le risque de givrage pour l'avion (couche traversée entre 0 et -15 °C).
//
// La formule historique reste le repli quand le profil est indisponible,
// et le contrôle de cohérence quand le modèle annonce une couche basse que
// la grille verticale, trop lâche, n'aurait pas captée.
// ============================================================

import { SEUILS_COMMUNS, DZ } from "./config.js";

/**
 * Plafond estimé à partir de l'écart T/Td et des couches Open-Meteo (méthode
 * historique, conservée en repli). En m AGL, Infinity si ciel peu couvert.
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

/** Niveaux exploitables (altitude + couverture), triés du sol vers le haut. */
export function profilNuages(h) {
  return Object.values(h.niveaux ?? {})
    // Sous ~100 m AGL, la « couverture » d'un niveau de pression est
    // dérivée de l'humidité d'un air de surface souvent proche de la
    // saturation au matin : elle signale de la brume, pas un plafond. Le
    // brouillard est traité par la visibilité et le code temps présent.
    .filter((n) => n?.agl != null && n?.nuages != null && n.agl >= 100)
    .map((n) => ({ agl: n.agl, nuages: n.nuages, temp: n.temp ?? null }))
    .sort((a, b) => a.agl - b.agl);
}

/**
 * @param {object} h — heure normalisée (cf. meteo.js)
 * @returns {{
 *   plafond:number,                 // m AGL, Infinity si aucune couche
 *   couches:Array<{base:number, sommet:number, couverture:number, tMin:number|null, tMax:number|null}>,
 *   largagePossible:number,         // m AGL, ≤ DZ.altitudeLargage
 *   givrage:boolean,                // couche entre 0 et -15 °C sous l'altitude de largage
 *   source:"profil"|"estimation"
 * }}
 */
export function analyseNuages(h) {
  const C = SEUILS_COMMUNS;
  const profil = profilNuages(h);
  const couches = [];
  let source = "profil";
  let plafond = Infinity;

  if (profil.length >= 4) {
    let courante = null;
    for (let i = 0; i < profil.length; i++) {
      const p = profil[i];
      if (p.nuages >= C.coucheMin) {
        if (!courante) {
          // Base interpolée entre le niveau clair du dessous et ce niveau :
          // la couverture franchit le seuil quelque part entre les deux.
          let base = p.agl;
          const prec = profil[i - 1];
          if (prec && prec.nuages < C.coucheMin && p.nuages > prec.nuages) {
            const t = (C.coucheMin - prec.nuages) / (p.nuages - prec.nuages);
            base = Math.round(prec.agl + t * (p.agl - prec.agl));
          }
          courante = { base, sommet: p.agl, couverture: p.nuages, tMin: p.temp, tMax: p.temp };
        } else {
          courante.sommet = p.agl;
          courante.couverture = Math.max(courante.couverture, p.nuages);
        }
        if (p.temp != null) {
          courante.tMin = courante.tMin == null ? p.temp : Math.min(courante.tMin, p.temp);
          courante.tMax = courante.tMax == null ? p.temp : Math.max(courante.tMax, p.temp);
        }
      } else if (courante) {
        couches.push(courante);
        courante = null;
      }
    }
    if (courante) couches.push(courante);

    // Cohérence avec la couverture DIAGNOSTIQUÉE par le modèle sur ses
    // propres niveaux (plus fins que la grille de pression) : une couche
    // ≥ 60 % sous 2 km est impossible si la couverture basse totale est
    // sous 40 %. Sans ce filtre, une humidité élevée produisait de faux
    // plafonds (constaté le 01/10/2026 : niveau 1000 hPa à 57 % alors que
    // Charleroi observait SCT015 puis FEW035).
    for (let k = couches.length - 1; k >= 0; k--) {
      const c = couches[k];
      const diag = c.base < 2000 ? h.nuagesBas : h.nuagesMoyens;
      if (diag != null && diag < 40) couches.splice(k, 1);
    }
    if (couches.length) plafond = couches[0].base;

    // Contrôle de cohérence : le modèle annonce une couche basse marquée
    // (cloud_cover_low, 0-2 km) que la grille verticale n'a pas vue — un
    // stratocumulus peut se loger entre deux niveaux de pression. On prend
    // alors la base de convection (formule T/Td), bornée à la couche basse.
    if ((h.nuagesBas ?? 0) >= C.coucheMin && !(plafond < 2000)) {
      const ecart = Math.max(0, (h.t2m ?? 0) - (h.pointRosee ?? 0));
      const estime = Math.min(2000, Math.max(300, Math.round(122 * ecart)));
      if (estime < plafond) {
        plafond = estime;
        couches.unshift({ base: estime, sommet: estime, couverture: h.nuagesBas, tMin: null, tMax: null });
        source = "estimation";
      }
    }
  } else {
    plafond = plafondEstime(h);
    source = "estimation";
  }

  const largagePossible = plafond >= DZ.altitudeLargage + C.margeSousCouche
    ? DZ.altitudeLargage
    : Math.max(0, Math.round(plafond - C.margeSousCouche));

  // Givrage : une couche nuageuse SOUS l'altitude de largage (l'avion la
  // traverse en montée) dont une partie est entre 0 et -15 °C.
  const givrage = couches.some((c) =>
    c.base < DZ.altitudeLargage &&
    c.tMin != null && c.tMax != null &&
    c.tMin <= C.givrageTmax && c.tMax >= C.givrageTmin
  );

  return { plafond, couches, largagePossible, givrage, source };
}
