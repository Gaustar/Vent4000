// ============================================================
// Vent4000 — Lecture d'un METAR (observation aéronautique réelle)
//
// EBNM n'émet pas de METAR ; Charleroi (EBCI) est à 22 km sur le même
// plateau. L'observation sert à l'HEURE EN COURS uniquement : c'est la
// seule donnée de l'app qui n'est pas une prévision. Elle corrige le
// verdict quand la prévision est déjà démentie par les faits (rafales,
// plafond, visibilité, orage).
//
// Module pur : parse le texte brut, aucune dépendance réseau.
// ============================================================

const KT = 1.852;
const FT = 0.3048;

/**
 * @param {string|null} brut — ex. "EBCI 011250Z 25006KT 200V320 9999 FEW035 21/11 Q1024 NOSIG"
 * @param {Date} maintenant — pour dater l'observation (jour/heure seuls dans le METAR)
 * @returns {object|null}
 *   { station, obs: Date, dir, vent, rafales, variable, visibilite, cavok,
 *     nuages:[{couverture, baseM, cb}], plafond, cb, temps:string[], orage,
 *     precip, brouillard, temp, pointRosee, brut }
 *   Vitesses en km/h, distances en m. `plafond` = base de la première
 *   couche BKN/OVC/VV en m AGL (Infinity si aucune).
 */
export function parseMetar(brut, maintenant = new Date()) {
  if (!brut || typeof brut !== "string") return null;
  const tokens = brut.trim().replace(/=$/, "").split(/\s+/);
  let i = 0;
  if (tokens[i] === "METAR" || tokens[i] === "SPECI") i++;
  const station = tokens[i++];
  if (!/^[A-Z]{4}$/.test(station ?? "")) return null;

  const r = {
    station, obs: null, dir: null, vent: null, rafales: null, variable: false,
    visibilite: null, cavok: false, nuages: [], plafond: Infinity, temps: [], cb: false,
    orage: false, precip: false, brouillard: false, temp: null, pointRosee: null, brut,
  };

  const t = /^(\d{2})(\d{2})(\d{2})Z$/.exec(tokens[i] ?? "");
  if (t) {
    i++;
    const jour = Number(t[1]);
    let annee = maintenant.getUTCFullYear();
    let mois = maintenant.getUTCMonth();
    // Observation datée d'un jour « futur » → elle vient du mois précédent.
    if (jour > maintenant.getUTCDate() + 1) {
      mois -= 1;
      if (mois < 0) { mois = 11; annee -= 1; }
    }
    r.obs = new Date(Date.UTC(annee, mois, jour, Number(t[2]), Number(t[3])));
  }

  for (; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/^(TEMPO|BECMG|NOSIG|RMK|TREND)$/.test(tok)) break;
    if (tok === "AUTO" || tok === "COR") continue;

    let m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(tok);
    if (m) {
      const f = m[4] === "KT" ? KT : 3.6;
      r.dir = m[1] === "VRB" ? null : Number(m[1]);
      r.variable = m[1] === "VRB";
      r.vent = Math.round(Number(m[2]) * f);
      r.rafales = m[3] ? Math.round(Number(m[3]) * f) : null;
      continue;
    }
    if (/^\d{3}V\d{3}$/.test(tok)) { r.variable = true; continue; }
    if (tok === "CAVOK") { r.cavok = true; r.visibilite = 10000; continue; }
    if (/^\d{4}$/.test(tok) && r.visibilite == null) {
      r.visibilite = tok === "9999" ? 10000 : Number(tok);
      continue;
    }
    if (/^\d{4}[NSEW]{1,2}$/.test(tok)) continue; // visibilité minimale directionnelle
    m = /^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU|\/\/\/)?$/.exec(tok);
    if (m) {
      const baseM = Math.round(Number(m[2]) * 100 * FT);
      r.nuages.push({ couverture: m[1], baseM, cb: m[3] === "CB" || m[3] === "TCU" });
      if ((m[1] === "BKN" || m[1] === "OVC") && baseM < r.plafond) r.plafond = baseM;
      if (m[3] === "CB" || m[3] === "TCU") r.cb = true;
      continue;
    }
    m = /^VV(\d{3}|\/\/\/)$/.exec(tok);
    if (m) {
      const baseM = m[1] === "///" ? 0 : Math.round(Number(m[1]) * 100 * FT);
      r.nuages.push({ couverture: "VV", baseM, cb: false });
      r.plafond = Math.min(r.plafond, baseM);
      continue;
    }
    if (/^(NSC|NCD|SKC|CLR)$/.test(tok)) continue;
    m = /^(M?\d{2})\/(M?\d{2})?$/.exec(tok);
    if (m) {
      const c = (s) => (s ? Number(s.replace("M", "-")) : null);
      r.temp = c(m[1]);
      r.pointRosee = c(m[2]);
      continue;
    }
    if (/^[QA]\d{4}$/.test(tok)) continue;
    // Temps présent : intensité, descripteur, phénomènes.
    if (/^(\+|-|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)*$/.test(tok) && tok.length >= 2) {
      r.temps.push(tok);
      if (tok.includes("TS")) r.orage = true;
      if (/(DZ|RA|SN|SG|PL|GR|GS|UP)/.test(tok) && !tok.startsWith("VC")) r.precip = true;
      if (/FG/.test(tok) && !tok.startsWith("VC")) r.brouillard = true;
    }
  }
  return r;
}

/** Âge de l'observation en minutes (Infinity si non datée). */
export function ageMetar(metar, maintenant = new Date()) {
  if (!metar?.obs) return Infinity;
  return (maintenant.getTime() - metar.obs.getTime()) / 60000;
}
