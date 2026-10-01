// ============================================================
// Vent4000 — Verdict « ça saute ? » (v2.1)
// Module pur (aucune dépendance DOM ni réseau).
//
// Pour chaque heure, les sources sont prises de la plus précise à la
// moins précise, sans pondération ni estimation :
//
//  1. OBSERVATION (METAR Charleroi, heure en cours, < 90 min) : un fait.
//     Pour toute règle qu'il renseigne, il tranche seul.
//  2. TAF Charleroi (prévision officielle) + modèles 1,3-2,2 km : chaque
//     source est une voix. Au-delà de la portée des modèles 2 km (≈ J+2),
//     les modèles régionaux (7-10 km) prennent le relais — et l'heure est
//     marquée « précision régionale ».
//
// Pour chaque règle (regles.js) :
//  - aucune source en échec            → respectée
//  - plus de la moitié des sources en échec → violée
//  - la moitié ou moins en échec       → incertaine (sources divergentes)
//  - aucune source ne renseigne la règle → non vérifiable
// Les variations TEMPO / PROB du TAF en échec rendent la règle incertaine.
//
// Verdict de l'heure :
//  - une règle violée                                 → rouge
//  - une règle incertaine, non vérifiable, ou « limite » → orange
//  - sinon                                            → vert
// ============================================================

import { DZ, MODELES, AERODROME } from "./config.js";
import { REGLES, evaluerSource, conditionsModele, conditionsAero } from "./regles.js";
import { ageMetar, conditionsTaf } from "./metar.js";

// Règles dont l'absence de donnée empêche de conclure au vert : ce sont
// les conditions légales. Pluie, orage et ouverture n'ont pas de donnée
// manquante bloquante (les modèles les renseignent toujours).
const REGLES_OBLIGATOIRES = new Set(["ventLegal", "ventNiveau", "rafales", "plafond", "visibilite"]);

/**
 * Sources disponibles pour une heure.
 * @returns {Array<{id, nom, type:"obs"|"taf"|"modele", hr?:boolean, resultats, conditions}>}
 */
export function sourcesHeure(h, seuils, aero = {}) {
  const sources = [];
  const { metar, taf, maintenant = new Date() } = aero;

  // Observation : seulement pour l'heure qui contient « maintenant ».
  if (metar && ageMetar(metar, maintenant) <= AERODROME.metarAgeMaxMin &&
      maintenant.getTime() >= h.utc && maintenant.getTime() < h.utc + 3600000) {
    const c = conditionsAero(metar);
    sources.push({ id: "metar", nom: `Observé ${AERODROME.nom}`, type: "obs", conditions: c, resultats: evaluerSource(c, seuils) });
  }

  // TAF : conditions prévues + variations temporaires.
  const ct = conditionsTaf(taf, h.utc, h.utc + 3600000);
  if (ct) {
    const c = conditionsAero(ct.principal);
    const variantes = ct.variantes.map((v) => {
      const cv = conditionsAero(v.cond);
      return { libelle: v.libelle, conditions: cv, resultats: evaluerSource(cv, seuils) };
    });
    sources.push({ id: "taf", nom: `TAF ${AERODROME.nom}`, type: "taf", conditions: c, resultats: evaluerSource(c, seuils), variantes });
  }

  // Modèles : les plus fins disponibles à cette heure.
  const dispo = MODELES.filter((m) => h.modeles?.[m.id]);
  const hr = dispo.filter((m) => m.hr);
  const retenus = hr.length ? hr : dispo;
  for (const m of retenus) {
    const c = conditionsModele(h.modeles[m.id], !!m.base);
    sources.push({ id: m.id, nom: m.nom, maille: m.maille, type: "modele", hr: !!m.hr, conditions: c, resultats: evaluerSource(c, seuils) });
  }
  return sources;
}

/**
 * @param {object} h — heure normalisée (meteo.js)
 * @param {object} seuils — { ventMax, plafondMin, hauteurOuverture, label }
 * @param {{metar?, taf?, maintenant?}} aero
 * @returns {{verdict, raisons:string[], regles:Array, sources:Array, precision:"obs"|"hr"|"regional"|"aucune", accord:{favorables:number, total:number}}}
 */
export function scoreHeure(h, seuils, aero = {}) {
  const sources = sourcesHeure(h, seuils, aero);
  const obs = sources.find((s) => s.type === "obs");
  const voix = sources.filter((s) => s.type !== "obs");
  const regles = [];

  for (const regle of REGLES) {
    const decision = { ...regle, statut: "ok", detail: "", echecs: 0, total: 0 };

    // L'observation ne remplace la prévision que pour ce qu'elle mesure.
    const resObs = obs?.resultats[regle.id];
    if (resObs && resObs.statut !== "inconnu") {
      decision.statut = resObs.statut === "echec" ? "violee" : resObs.statut === "limite" ? "limite" : "ok";
      decision.detail = `${obs.nom} : ${resObs.detail}`;
      decision.total = 1;
      decision.echecs = resObs.statut === "echec" ? 1 : 0;
      decision.parObservation = true;
      regles.push(decision);
      continue;
    }

    const avis = voix.map((s) => ({ s, res: s.resultats[regle.id] })).filter((x) => x.res && x.res.statut !== "inconnu");
    if (!avis.length && !voix.some((s) => s.resultats[regle.id])) continue; // règle non applicable
    decision.total = avis.length;
    decision.echecs = avis.filter((x) => x.res.statut === "echec").length;
    const limites = avis.filter((x) => x.res.statut === "limite");
    const tafVar = voix.find((s) => s.type === "taf")?.variantes ?? [];
    const varEchec = tafVar.filter((v) => v.resultats[regle.id]?.statut === "echec" || v.resultats[regle.id]?.statut === "limite");

    if (!avis.length) {
      decision.statut = REGLES_OBLIGATOIRES.has(regle.id) ? "nonVerifiable" : "ok";
      decision.detail = "aucune source précise ne fournit cette donnée";
    } else if (decision.echecs * 2 > decision.total) {
      decision.statut = "violee";
    } else if (decision.echecs > 0 || varEchec.length) {
      decision.statut = "incertaine";
    } else if (limites.length) {
      decision.statut = "limite";
    }
    if (avis.length) {
      const enEchec = avis.filter((x) => x.res.statut !== "ok");
      const ex = enEchec[0] ?? avis[0];
      decision.detail = decision.statut === "ok"
        ? `${avis.length}/${avis.length} sources conformes`
        : `${decision.echecs}/${decision.total} sources en échec — ${ex.s.nom} : ${ex.res.detail}`;
      if (varEchec.length) decision.detail += ` · TAF : ${varEchec.map((v) => v.libelle).join(" ; ")}`;
    }
    regles.push(decision);
  }

  const violees = regles.filter((x) => x.statut === "violee");
  const douteuses = regles.filter((x) => x.statut === "incertaine" || x.statut === "nonVerifiable" || x.statut === "limite");
  const verdict = violees.length ? "rouge" : douteuses.length ? "orange" : "vert";
  const raisons = (violees.length ? violees : douteuses).map((x) => `${x.label} — ${x.detail}`);

  // Accord global : sources dont TOUTES les règles sont respectées.
  const evaluees = obs ? [obs] : voix;
  const favorables = evaluees.filter((s) => Object.values(s.resultats).every((res) => res.statut === "ok" || res.statut === "inconnu")).length;

  const precision = obs ? "obs"
    : voix.some((s) => s.type === "taf" || s.hr) ? "hr"
    : voix.length ? "regional" : "aucune";
  return { verdict, raisons, regles, sources, precision, accord: { favorables, total: evaluees.length } };
}

/**
 * Composante de vent traversier par rapport à l'axe de piste (information).
 * @returns {{traversier:number, face:number}} km/h
 */
export function ventPiste(vitesse, direction, qfu = DZ.qfu) {
  const delta = ((direction - qfu) * Math.PI) / 180;
  return {
    traversier: Math.abs(Math.round(vitesse * Math.sin(delta))),
    face: Math.abs(Math.round(vitesse * Math.cos(delta))),
  };
}

/**
 * Meilleure fenêtre sautable d'un créneau : la plus longue plage d'heures
 * consécutives (≥ 2 h) tenable, en privilégiant une plage entièrement verte.
 * Une heure `h` couvre [h, h+1[ : la plage 10h-12h se lit « 10h → 13h ».
 */
export function fenetreSautable(heures) {
  if (!heures?.length) return { verdict: "rouge", debut: null, fin: null, duree: 0 };

  function plusLonguePlage(test) {
    let meilleure = null;
    let debut = null;
    let precedente = null;
    for (const h of heures) {
      if (!test(h.verdict)) {
        debut = null;
        precedente = h.heure;
        continue;
      }
      const adjacente = debut !== null && h.heure === precedente + 1;
      if (!adjacente) debut = h.heure;
      const duree = h.heure - debut + 1;
      if (duree >= 2 && (!meilleure || duree > meilleure.duree)) {
        meilleure = { debut, fin: h.heure + 1, duree };
      }
      precedente = h.heure;
    }
    return meilleure;
  }

  const verte = plusLonguePlage((v) => v === "vert");
  if (verte) return { verdict: "vert", ...verte };
  const tenable = plusLonguePlage((v) => v !== "rouge");
  if (tenable) return { verdict: "orange", ...tenable };
  return { verdict: "rouge", debut: null, fin: null, duree: 0 };
}

export function scoreCreneau(verdictsHoraires) {
  return fenetreSautable(verdictsHoraires.map((verdict, i) => ({ heure: i, verdict }))).verdict;
}

/** Meilleur des verdicts : « y a-t-il un créneau sautable dans la journée ? » */
export function meilleurVerdict(verdicts) {
  if (verdicts.includes("vert")) return "vert";
  if (verdicts.includes("orange")) return "orange";
  return "rouge";
}
