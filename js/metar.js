// ============================================================
// Vent4000 — Lecture des messages aéronautiques METAR et TAF
//
// METAR : observation réelle, la donnée la plus sûre pour l'heure en cours.
// TAF   : prévision officielle d'aérodrome, rédigée par les prévisionnistes
//         (skeyes) — plafond, visibilité, vent et temps présent, avec les
//         variations temporaires (TEMPO) et probables (PROB30/40).
//
// EBNM n'émet ni METAR ni TAF : Charleroi (EBCI) est à 22 km, même plateau.
// Module pur : texte brut en entrée, aucune dépendance réseau.
// ============================================================

const KT = 1.852;
const FT = 0.3048;

const RE_TEMPS = /^(\+|-|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)*$/;

/**
 * Lit un groupe de conditions (corps d'un METAR, ou d'un groupe de TAF).
 * Ne renvoie QUE les éléments présents : dans un TAF, un groupe TEMPO ne
 * décrit que ce qui change, le reste est hérité.
 * Vitesses en km/h, distances en m, plafond = base de la première couche
 * BKN/OVC/VV en m (Infinity si le groupe dit qu'il n'y en a pas).
 */
export function lireConditions(tokens) {
  const c = {};
  const nuages = [];
  let ciel = false;   // le groupe parle du ciel
  const temps = [];
  let tempsDit = false; // le groupe parle du temps présent

  for (const tok of tokens) {
    let m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(tok);
    if (m) {
      const f = m[4] === "KT" ? KT : 3.6;
      c.dir = m[1] === "VRB" ? null : Number(m[1]);
      c.variable = m[1] === "VRB";
      c.vent = Math.round(Number(m[2]) * f);
      c.rafales = m[3] ? Math.round(Number(m[3]) * f) : null;
      continue;
    }
    if (/^\d{3}V\d{3}$/.test(tok)) { c.variable = true; continue; }
    if (tok === "CAVOK") {
      c.visibilite = 10000; c.cavok = true; ciel = true; tempsDit = true;
      continue;
    }
    if (/^\d{4}$/.test(tok) && c.visibilite === undefined) {
      c.visibilite = tok === "9999" ? 10000 : Number(tok);
      continue;
    }
    if (/^\d{4}[NSEW]{1,2}$/.test(tok)) continue;
    m = /^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU|\/\/\/)?$/.exec(tok);
    if (m) {
      nuages.push({ couverture: m[1], baseM: Math.round(Number(m[2]) * 100 * FT), cb: m[3] === "CB" || m[3] === "TCU" });
      ciel = true;
      continue;
    }
    m = /^VV(\d{3}|\/\/\/)$/.exec(tok);
    if (m) {
      nuages.push({ couverture: "VV", baseM: m[1] === "///" ? 0 : Math.round(Number(m[1]) * 100 * FT), cb: false });
      ciel = true;
      continue;
    }
    if (/^(NSC|NCD|SKC|CLR)$/.test(tok)) { ciel = true; continue; }
    if (tok === "NSW") { tempsDit = true; continue; }
    m = /^(M?\d{2})\/(M?\d{2})?$/.exec(tok);
    if (m) {
      const v = (s) => (s ? Number(s.replace("M", "-")) : null);
      c.temp = v(m[1]);
      c.pointRosee = v(m[2]);
      continue;
    }
    if (/^[QA]\d{4}$/.test(tok)) continue;
    if (tok.length >= 2 && RE_TEMPS.test(tok)) {
      temps.push(tok);
      tempsDit = true;
    }
  }

  if (ciel) {
    c.nuages = nuages;
    const plafonds = nuages.filter((n) => n.couverture === "BKN" || n.couverture === "OVC" || n.couverture === "VV");
    c.plafond = plafonds.length ? Math.min(...plafonds.map((n) => n.baseM)) : Infinity;
    c.cb = nuages.some((n) => n.cb);
  }
  if (tempsDit) {
    c.temps = temps;
    c.orage = temps.some((t) => t.includes("TS") && !t.startsWith("VC"));
    c.precip = temps.some((t) => /(DZ|RA|SN|SG|PL|GR|GS|UP)/.test(t) && !t.startsWith("VC"));
    c.brouillard = temps.some((t) => /FG/.test(t) && !t.startsWith("VC"));
  }
  return c;
}

/** Date UTC d'un jour/heure/minute du mois, rapporté au mois de référence. */
function dateDuMois(jour, heure, minute, ref) {
  let annee = ref.getUTCFullYear();
  let mois = ref.getUTCMonth();
  if (jour > ref.getUTCDate() + 15) { mois -= 1; if (mois < 0) { mois = 11; annee -= 1; } }
  else if (jour < ref.getUTCDate() - 15) { mois += 1; if (mois > 11) { mois = 0; annee += 1; } }
  return new Date(Date.UTC(annee, mois, jour, heure, minute)); // heure 24 → lendemain 00h
}

/** Messages d'une réponse MET Norway (séparés par « = »), espaces normalisés. */
export function tousMessages(texte) {
  return String(texte ?? "").split("=").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * @param {string|null} brut — ex. "EBCI 011250Z 25006KT 200V320 9999 FEW035 21/11 Q1024 NOSIG"
 * @param {Date} maintenant — pour dater l'observation
 */
export function parseMetar(brut, maintenant = new Date()) {
  if (!brut || typeof brut !== "string") return null;
  const tokens = brut.trim().replace(/=$/, "").split(/\s+/);
  let i = 0;
  if (tokens[i] === "METAR" || tokens[i] === "SPECI") i++;
  const station = tokens[i++];
  if (!/^[A-Z]{4}$/.test(station ?? "")) return null;
  let obs = null;
  const t = /^(\d{2})(\d{2})(\d{2})Z$/.exec(tokens[i] ?? "");
  if (t) {
    i++;
    obs = dateDuMois(Number(t[1]), Number(t[2]), Number(t[3]), maintenant);
  }
  const corps = [];
  for (; i < tokens.length; i++) {
    if (/^(TEMPO|BECMG|NOSIG|RMK|TREND)$/.test(tokens[i])) break;
    corps.push(tokens[i]);
  }
  const c = lireConditions(corps);
  return {
    station, obs, brut,
    dir: c.dir ?? null, vent: c.vent ?? null, rafales: c.rafales ?? null, variable: !!c.variable,
    visibilite: c.visibilite ?? null, cavok: !!c.cavok,
    nuages: c.nuages ?? [], plafond: c.plafond ?? Infinity, cb: !!c.cb,
    temps: c.temps ?? [], orage: !!c.orage, precip: !!c.precip, brouillard: !!c.brouillard,
    temp: c.temp ?? null, pointRosee: c.pointRosee ?? null,
  };
}

/** Âge de l'observation en minutes (Infinity si non datée). */
export function ageMetar(metar, maintenant = new Date()) {
  if (!metar?.obs) return Infinity;
  return (maintenant.getTime() - metar.obs.getTime()) / 60000;
}

/**
 * @param {string|null} brut — ex. "EBCI 011100Z 0112/0218 27008KT 9999 SCT045 PROB40 0202/0208 0300 FG BKN001"
 * @returns {null | {station, emis:Date, debut:Date, fin:Date, base:object,
 *   groupes:Array<{type:"FM"|"BECMG"|"TEMPO"|"PROB", proba:number|null, debut:Date, fin:Date|null, cond:object, texte:string}>, brut}}
 */
export function parseTaf(brut, maintenant = new Date()) {
  if (!brut || typeof brut !== "string") return null;
  const tokens = brut.trim().replace(/=$/, "").split(/\s+/);
  let i = 0;
  while (/^(TAF|AMD|COR)$/.test(tokens[i])) i++;
  const station = tokens[i++];
  if (!/^[A-Z]{4}$/.test(station ?? "")) return null;
  const e = /^(\d{2})(\d{2})(\d{2})Z$/.exec(tokens[i] ?? "");
  if (!e) return null;
  i++;
  const emis = dateDuMois(Number(e[1]), Number(e[2]), Number(e[3]), maintenant);
  const periode = (tok) => {
    const p = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(tok ?? "");
    return p ? [dateDuMois(+p[1], +p[2], 0, emis), dateDuMois(+p[3], +p[4], 0, emis)] : null;
  };
  const validite = periode(tokens[i]);
  if (!validite) return null;
  i++;

  // Découpage en groupes : base, puis FM / BECMG / TEMPO / PROBxx [TEMPO].
  const blocs = [{ entete: null, tokens: [] }];
  for (; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "RMK") break;
    if (/^FM\d{6}$/.test(tok) || tok === "BECMG" || tok === "TEMPO" || /^PROB\d{2}$/.test(tok)) {
      // « PROB30 TEMPO » forme un seul groupe.
      if (tok === "TEMPO" && /^PROB\d{2}$/.test(blocs[blocs.length - 1].entete ?? "") && blocs[blocs.length - 1].tokens.length === 0) {
        blocs[blocs.length - 1].tempo = true;
        continue;
      }
      blocs.push({ entete: tok, tokens: [] });
      continue;
    }
    blocs[blocs.length - 1].tokens.push(tok);
  }

  const groupes = [];
  for (const b of blocs.slice(1)) {
    let debut;
    let fin;
    let toks = b.tokens;
    let type;
    let proba = null;
    if (b.entete.startsWith("FM")) {
      const f = /^FM(\d{2})(\d{2})(\d{2})$/.exec(b.entete);
      type = "FM";
      debut = dateDuMois(+f[1], +f[2], +f[3], emis);
      fin = null;
    } else {
      const p = periode(toks[0]);
      if (!p) continue;
      [debut, fin] = p;
      toks = toks.slice(1);
      if (b.entete.startsWith("PROB")) { type = "PROB"; proba = Number(b.entete.slice(4)); }
      else type = b.entete;
    }
    groupes.push({ type, proba, tempo: !!b.tempo, debut, fin, cond: lireConditions(toks), texte: [b.entete, ...b.tokens].join(" ") });
  }

  return { station, emis, debut: validite[0], fin: validite[1], base: lireConditions(blocs[0].tokens), groupes, brut };
}

/** Conditions héritées : les éléments absents du groupe viennent de `parent`. */
function fusion(parent, groupe) {
  return { ...parent, ...groupe };
}

/**
 * Conditions TAF pour une période [debutMs, finMs[ (une heure).
 * @returns {null | {principal:object, variantes:Array<{libelle:string, cond:object}>}}
 *   `principal` : conditions prévues (base + FM + BECMG terminés) au milieu
 *   de la période. `variantes` : groupes TEMPO / PROB / BECMG en cours qui
 *   recouvrent la période, chacun avec ses conditions complètes.
 */
export function conditionsTaf(taf, debutMs, finMs) {
  if (!taf) return null;
  const milieu = (debutMs + finMs) / 2;
  if (milieu < taf.debut.getTime() || milieu >= taf.fin.getTime()) return null;
  let principal = { ...taf.base };
  const variantes = [];
  for (const g of taf.groupes) {
    const d = g.debut.getTime();
    const f = g.fin?.getTime() ?? Infinity;
    if (g.type === "FM") {
      if (milieu >= d) { principal = fusion(principal, g.cond); variantes.length = 0; }
      continue;
    }
    if (g.type === "BECMG") {
      if (milieu >= f) principal = fusion(principal, g.cond);
      else if (finMs > d && debutMs < f) variantes.push({ libelle: g.texte, cond: fusion(principal, g.cond) });
      continue;
    }
    // TEMPO / PROB : variation temporaire ou probable sur la période.
    if (finMs > d && debutMs < f) variantes.push({ libelle: g.texte, cond: fusion(principal, g.cond) });
  }
  return { principal, variantes };
}
