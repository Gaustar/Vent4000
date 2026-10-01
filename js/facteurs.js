// ============================================================
// Vent4000 — Facteurs de décision (v2.0)
//
// Chaque paramètre météo qui peut empêcher ou dégrader un saut est un
// FACTEUR explicite, évalué séparément, avec sa valeur et son statut :
//
//   "ok"       — rien à signaler
//   "info"     — à savoir, sans effet sur le verdict
//   "limite"   — dégrade le verdict (orange)
//   "bloquant" — interdit le saut (rouge)
//
// `legal: true` marque une limite de la circulaire CIR/GDF-05 (motif
// distinct de « au-dessus de ton seuil »). `probabiliste: true` marque un
// facteur que les modèles et ensembles votent aussi (vent, rafales,
// pluie) : son blocage par le seul modèle principal est arbitré par la
// probabilité de saut (cf. scoring.js). Tous les autres sont fermes.
//
// Module pur : aucune dépendance DOM ni réseau.
// ============================================================

import { SEUILS_COMMUNS as C, LEGAL_BE, DZ, VOL, METAR } from "./config.js";
import { profilVent, ventAAltitude, vecteurVent } from "./spot.js";
import { analyseNuages } from "./nuages.js";
import { ageMetar } from "./metar.js";

const r = Math.round;
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".0", "")} km` : `${r(m)} m`);

export const GROUPES = {
  vent: "Vent",
  ciel: "Ciel",
  temps: "Temps",
  air: "Air & altitude",
  obs: "Observation",
};

/** Codes WMO du temps présent (Open-Meteo `weather_code`). */
export function decrireCode(code) {
  if (code == null) return null;
  if (code >= 95) return "Orage";
  if (code >= 85) return "Averses de neige";
  if (code >= 80) return "Averses";
  if (code >= 71) return "Neige";
  if (code >= 61) return "Pluie";
  if (code >= 51) return "Bruine";
  if (code === 45 || code === 48) return "Brouillard";
  return null;
}

/** Temps (s) à laisser entre deux groupes, d'après la vitesse sol en axe face au vent. */
export function separationGroupes(ventLargageKmh) {
  const sol = Math.max(30, VOL.vitesseAvionLargage - (ventLargageKmh ?? 0)); // km/h
  return Math.round(VOL.separationGroupes / (sol / 3.6));
}

/** Forme courte d'une distance pour le tableau horaire (« 1,2k », « 850 »). */
function court(m) {
  if (m == null) return "—";
  if (m === Infinity) return "∞";
  if (m >= 10000) return `${r(m / 1000)}k`;
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace(".0", "")}k` : `${r(m)}`;
}

function f(id, groupe, label, valeur, statut = "ok", motif = null, extra = {}) {
  return { id, groupe, label, valeur, court: valeur, statut, motif, legal: false, probabiliste: false, ...extra };
}

/**
 * @param {object} h — heure normalisée (cf. meteo.js), éventuellement
 *   enrichie de `ventPrecedent` (vent de l'heure d'avant) et `metar`
 *   (observation, uniquement pour l'heure en cours).
 * @param {{ventMax, plafondMin, ecartRafalesOrange, hauteurOuverture, eleve?}} seuils
 * @returns {Array<Facteur>}
 */
export function evaluerFacteurs(h, seuils) {
  const out = [];
  const vent = h.vent10 ?? 0;
  const raf = h.rafales10 ?? 0;
  const ecartRafales = (seuils.ecartRafalesOrange ?? 10);
  const profil = profilVent(h);

  // ---------- VENT AU SOL (moyen) ----------
  {
    const x = f("ventSol", "vent", "Vent au sol", `${r(vent)} km/h`, "ok", null, { probabiliste: true, court: `${r(vent)}` });
    if (vent > LEGAL_BE.ventMoyenMaxSol) {
      Object.assign(x, { statut: "bloquant", legal: true, motif: `Vent moyen ${r(vent)} km/h — hors limite légale (25 kts)` });
    } else if (vent > seuils.ventMax) {
      Object.assign(x, { statut: "bloquant", motif: `Vent ${r(vent)} km/h` });
    } else if (vent > seuils.ventMax * C.ventOrangeRatio) {
      Object.assign(x, { statut: "limite", motif: "Vent proche du seuil" });
    }
    out.push(x);
  }

  // ---------- RAFALES ----------
  {
    const ecart = raf - vent;
    const x = f("rafales", "vent", "Rafales", `${r(raf)} km/h`, "ok", null, { probabiliste: true, court: `${r(raf)}` });
    if (raf > seuils.ventMax) {
      Object.assign(x, { statut: "bloquant", motif: `Rafales ${r(raf)} km/h (> seuil)` });
    } else if (ecart > ecartRafales) {
      Object.assign(x, { statut: "limite", motif: `Rafales +${r(ecart)} km/h` });
    }
    out.push(x);
  }

  // ---------- TENDANCE ----------
  if (h.ventPrecedent != null) {
    const hausse = vent - h.ventPrecedent;
    if (hausse > C.tendanceHausseOrange) {
      out.push(f("tendance", "vent", "Évolution", `+${r(hausse)} km/h/h`, "limite",
        `Vent en hausse rapide (+${r(hausse)} km/h en 1h)`));
    }
  }

  // ---------- CISAILLEMENT BAS (10 m → basse couche) ----------
  {
    const hauts = Object.entries(h.niveauxAGL ?? {})
      .filter(([, n]) => n?.vent != null && n?.dir != null)
      .sort((a, b) => Number(b[0]) - Number(a[0]));
    if (hauts.length && h.vent10 != null && h.direction10 != null) {
      const [alt, n] = hauts[0];
      const a = vecteurVent(h.vent10, h.direction10);
      const b = vecteurVent(n.vent, n.dir);
      const diff = Math.hypot(a.est - b.est, a.nord - b.nord) * 3.6;
      const x = f("cisaillement", "vent", "Gradient 10→" + alt + " m", `${r(diff)} km/h`, "ok", null, { court: `${r(diff)}` });
      if (diff > C.cisaillementOrange) {
        Object.assign(x, { statut: "limite", motif: `Gradient de vent marqué en finale (${r(diff)} km/h entre 10 et ${alt} m)` });
      }
      out.push(x);
    }
  }

  // ---------- VENT À L'OUVERTURE ----------
  if (seuils.hauteurOuverture) {
    const v = ventAAltitude(profil, seuils.hauteurOuverture);
    if (v != null) {
      const x = f("ventOuverture", "vent", `Vent à ${seuils.hauteurOuverture} m`, `${r(v)} km/h`, "ok", null, { court: `${r(v)}` });
      if (v > C.ventOuvertureOrange) {
        Object.assign(x, { statut: "limite", motif: `Vent ${r(v)} km/h à l'ouverture (${seuils.hauteurOuverture} m)` });
      }
      out.push(x);
    }
  }

  // ---------- VENT AU LARGAGE ----------
  {
    const v = ventAAltitude(profil, DZ.altitudeLargage);
    if (v != null) {
      const sep = separationGroupes(v);
      const x = f("ventLargage", "vent", `Vent à ${DZ.altitudeLargage} m`, `${r(v)} km/h`, "info",
        `Séparation entre groupes ~${sep} s`, { court: `${r(v)}` });
      if (v > C.ventLargageOrange) {
        Object.assign(x, { statut: "limite", motif: `Vent ${r(v)} km/h au largage — spot critique, séparation ~${sep} s` });
      }
      out.push(x);
    }
  }

  // ---------- PLAFOND / COUCHES ----------
  const nuages = analyseNuages(h);
  {
    const p = nuages.plafond;
    const x = f("plafond", "ciel", "Plafond", p === Infinity ? "Dégagé" : `~${km(p)}`, "ok", null, { court: court(p) });
    if (p < LEGAL_BE.plafondMinAGL) {
      Object.assign(x, { statut: "bloquant", legal: true, motif: `Plafond ~${r(p)} m — sous le minimum légal (3000 ft)` });
    } else if (p < seuils.plafondMin) {
      Object.assign(x, { statut: "bloquant", motif: `Plafond ~${r(p)} m` });
    } else if (nuages.largagePossible < C.largageReduitOrange) {
      Object.assign(x, { statut: "limite", motif: `Couche à ~${km(p)} : largage limité à ~${km(nuages.largagePossible)}` });
    } else if (nuages.largagePossible < DZ.altitudeLargage) {
      Object.assign(x, { statut: "info", motif: `Largage sous la couche, ~${km(nuages.largagePossible)}` });
    }
    out.push(x);
  }
  {
    const couverture = (h.nuagesTotal ?? Math.max(h.nuagesBas ?? 0, h.nuagesMoyens ?? 0));
    const x = f("couverture", "ciel", "Couverture", `${r(couverture)} %`, "ok", null, { court: `${r(couverture)}` });
    if ((h.nuagesBas ?? 0) + (h.nuagesMoyens ?? 0) >= C.nuagesOrangeMin + 20 && nuages.plafond === Infinity) {
      Object.assign(x, { statut: "info", motif: "Ciel nuageux avec trous" });
    }
    out.push(x);
  }

  // ---------- VISIBILITÉ / BROUILLARD ----------
  {
    const vis = h.visibilite;
    const brouillard = h.codeTemps === 45 || h.codeTemps === 48;
    const x = f("visibilite", "ciel", "Visibilité", vis != null ? km(Math.min(vis, 99000)) : "—", "ok", null, { court: vis != null ? court(Math.min(vis, 99000)) : "—" });
    if (vis != null && vis < LEGAL_BE.visibiliteMin) {
      Object.assign(x, { statut: "bloquant", legal: true, motif: "Visibilité < 3 km — sous le minimum légal" });
    } else if (brouillard && vis == null) {
      Object.assign(x, { statut: "bloquant", motif: "Brouillard" });
    } else if ((vis != null && vis < C.visibiliteConfort) || brouillard) {
      Object.assign(x, { statut: "limite", motif: brouillard ? "Bancs de brouillard" : `Visibilité ${km(vis)}` });
    }
    out.push(x);
  }

  // ---------- PRÉCIPITATIONS ----------
  {
    const precip = h.precip ?? 0;
    const desc = decrireCode(h.codeTemps);
    const x = f("pluie", "temps", "Précipitations",
      precip > 0 ? `${precip.toFixed(1)} mm/h` : (h.probaPluie != null ? `${r(h.probaPluie)} %` : "—"),
      "ok", null, { probabiliste: true, court: precip > 0 ? precip.toFixed(1) : `${r(h.probaPluie ?? 0)}%` });
    if (precip > C.precipMax) {
      Object.assign(x, { statut: "bloquant", motif: desc && desc !== "Orage" ? desc : "Pluie" });
    } else if (desc && desc !== "Brouillard" && desc !== "Orage") {
      Object.assign(x, { statut: "limite", motif: `${desc} faible` });
    } else if ((h.probaPluie ?? 0) >= C.probaPluieMax) {
      Object.assign(x, { statut: "limite", motif: `Risque de pluie ${r(h.probaPluie)} %` });
    } else if ((h.probaPluie ?? 0) >= 30) {
      Object.assign(x, { statut: "info", motif: `Risque de pluie ${r(h.probaPluie)} %` });
    }
    out.push(x);
  }

  // ---------- ORAGE / CONVECTION ----------
  {
    const cape = h.cape ?? 0;
    const x = f("orage", "temps", "Orage / convection", `CAPE ${r(cape)} J/kg`, "ok", null, { court: `${r(cape)}` });
    const verrou = (h.cin ?? 0) >= C.cinVerrou;
    if ((h.codeTemps ?? 0) >= 95) {
      Object.assign(x, { statut: "bloquant", motif: "Orage prévu" });
    } else if ((h.eclairs ?? 0) >= C.eclairsRouge) {
      Object.assign(x, { statut: "bloquant", motif: "Risque d'éclairs" });
    } else if (cape >= C.capeRouge && !verrou) {
      Object.assign(x, { statut: "bloquant", motif: "Risque orageux (CAPE)" });
    } else if ((h.eclairs ?? 0) >= C.eclairsOrange) {
      Object.assign(x, { statut: "limite", motif: "Activité électrique possible" });
    } else if (cape >= C.capeOrange || (h.li != null && h.li <= C.liOrange)) {
      Object.assign(x, { statut: "limite", motif: verrou && cape >= C.capeRouge ? "Instabilité forte mais verrouillée (CIN)" : "Instabilité (CAPE)" });
    }
    out.push(x);
  }

  // ---------- THERMIQUES ----------
  if ((h.coucheLimite ?? 0) >= C.thermiqueBLH && (h.cape ?? 0) >= C.thermiqueCAPE) {
    out.push(f("thermique", "air", "Thermiques", `CL ${km(h.coucheLimite)}`,
      seuils.eleve ? "limite" : "info", "Air thermique : finale turbulente possible", { court: court(h.coucheLimite) }));
  }

  // ---------- FROID AU LARGAGE ----------
  {
    const t = temperatureA(h, DZ.altitudeLargage);
    if (t != null) {
      const x = f("froid", "air", `T° à ${DZ.altitudeLargage} m`, `${r(t)} °C`, "ok", null, { court: `${r(t)}°` });
      if (t <= C.froidOrange) Object.assign(x, { statut: "limite", motif: `Froid intense au largage (${r(t)} °C)` });
      else if (t <= C.froidInfo) Object.assign(x, { statut: "info", motif: `Froid au largage (${r(t)} °C)` });
      out.push(x);
    }
  }

  // ---------- GIVRAGE (avion) ----------
  {
    const x = f("givrage", "air", "Isotherme 0 °C", h.isoZero != null ? `${km(h.isoZero)}` : "—", "ok", null, { court: court(h.isoZero) });
    if (nuages.givrage) Object.assign(x, { statut: "limite", motif: "Givrage possible pour l'avion (couche entre 0 et -15 °C)" });
    out.push(x);
  }

  // ---------- OBSERVATION (heure en cours) ----------
  // Uniquement pour l'heure en cours (metarDecalage 0) : pour les heures
  // suivantes, l'observation sert seulement à arbitrer le plafond (scoring.js).
  if (h.metar && (h.metarDecalage ?? 0) === 0 && ageMetar(h.metar, h.maintenant ?? new Date()) <= METAR.ageMaxMin) {
    out.push(...facteursObservation(h, h.metar, seuils));
  }

  return Object.assign(out, { nuages });
}

/** Température interpolée à une altitude AGL depuis les niveaux de pression. */
export function temperatureA(h, agl) {
  const pts = Object.values(h.niveaux ?? {})
    .filter((n) => n?.agl != null && n?.temp != null)
    .sort((a, b) => a.agl - b.agl);
  if (!pts.length) return null;
  if (agl <= pts[0].agl) return pts[0].temp;
  for (let i = 1; i < pts.length; i++) {
    if (agl <= pts[i].agl) {
      const t = (agl - pts[i - 1].agl) / (pts[i].agl - pts[i - 1].agl);
      return pts[i - 1].temp + t * (pts[i].temp - pts[i - 1].temp);
    }
  }
  return pts[pts.length - 1].temp;
}

/**
 * Facteurs issus du METAR. L'observation est un FAIT : elle n'est pas
 * arbitrée par la probabilité (probabiliste: false, observe: true).
 */
function facteursObservation(h, m, seuils) {
  const out = [];
  const nom = METAR.nom;
  const x = f("observation", "obs", `Observé ${nom}`,
    `${m.vent ?? "—"}${m.rafales ? `G${m.rafales}` : ""} km/h · ${m.plafond === Infinity ? "pas de plafond" : `plafond ${km(m.plafond)}`}`,
    "ok", null, { observe: true });
  const motifs = [];
  let statut = "ok";
  let legal = false;
  const pire = (s) => { if (s === "bloquant" || (s === "limite" && statut === "ok")) statut = s; };

  if ((m.vent ?? 0) > LEGAL_BE.ventMoyenMaxSol) { pire("bloquant"); legal = true; motifs.push(`${nom} observe ${m.vent} km/h de moyenne — hors limite légale`); }
  const rafObs = m.rafales ?? m.vent ?? 0;
  if (rafObs > seuils.ventMax) { pire("bloquant"); motifs.push(`${nom} observe ${rafObs} km/h${m.rafales ? " en rafales" : ""}`); }
  if (m.plafond < LEGAL_BE.plafondMinAGL) { pire("bloquant"); legal = true; motifs.push(`${nom} observe un plafond à ${r(m.plafond)} m — sous le minimum légal`); }
  else if (m.plafond < seuils.plafondMin) { pire("bloquant"); motifs.push(`${nom} observe un plafond à ${r(m.plafond)} m`); }
  if (m.visibilite != null && m.visibilite < LEGAL_BE.visibiliteMin) { pire("bloquant"); legal = true; motifs.push(`${nom} observe une visibilité de ${km(m.visibilite)}`); }
  if (m.orage) { pire("bloquant"); motifs.push(`Orage observé à ${nom}`); }
  if (m.cb) { pire("limite"); motifs.push(`Cumulonimbus observé à ${nom}`); }
  if (m.precip) { pire("limite"); motifs.push(`Précipitations observées à ${nom}`); }
  if (h.vent10 != null && m.vent != null && Math.abs(m.vent - h.vent10) > C.ecartNowcastOrange) {
    pire("limite");
    motifs.push(`${nom} observe ${m.vent} km/h vs ${r(h.vent10)} prévus`);
  }
  Object.assign(x, { statut, legal, motif: motifs.join(" · ") || null });
  out.push(x);
  return out;
}
