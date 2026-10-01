// ============================================================
// Vent4000 — Moteur de verdict « ça saute ? » (v2.0)
// Module 100 % pur (aucune dépendance DOM ni fetch).
//
// Une heure est jugée en deux temps :
//  1. FACTEURS (facteurs.js) — chaque paramètre météo du modèle principal,
//     plus l'observation METAR pour l'heure en cours : bloquant / limite.
//  2. PROBABILITÉ (probabilite.js) — vote de 7 modèles et 122 membres
//     d'ensemble sur les critères décisifs (vent, rafales, pluie, couche
//     basse).
//
// Règles de combinaison :
//  - un facteur bloquant FERME (plafond, visibilité, orage, observation…)
//    → rouge, quoi que disent les votes ;
//  - un facteur bloquant PROBABILISTE (vent, rafales, pluie du modèle
//    principal) → rouge seulement si la probabilité est aussi sous le seuil
//    rouge ; sinon il devient « limite » : le modèle principal est un vote
//    parmi d'autres, pas un oracle ;
//  - probabilité < 35 % → rouge ; < 70 % ou facteur limite → orange ;
//  - sinon vert.
// ============================================================

import { DZ, PROBA, METAR } from "./config.js";
import { evaluerFacteurs } from "./facteurs.js";
import { probabiliteSaut, critereLimitant, accordCoucheBasse } from "./probabilite.js";
import { ageMetar } from "./metar.js";
export { plafondEstime } from "./nuages.js";

const LIBELLE_CRITERE = { vent: "vent moyen", rafales: "rafales", pluie: "pluie", nuages: "couche basse" };

/**
 * Score d'une heure.
 * @param {object} h — heure normalisée (cf. meteo.js) + `ventPrecedent`,
 *   `metar` (heure en cours) optionnels
 * @param {object} seuils — { ventMax, plafondMin, ecartRafalesOrange, hauteurOuverture, eleve? }
 * @param {{echeanceJours?:number}} [ctx]
 * @returns {{verdict, raisons:string[], facteurs, proba, chance:number|null, plafond:number, nuages}}
 *   `chance` = probabilité de saut affichable (0 si un facteur ferme bloque).
 */
export function scoreHeure(h, seuils, ctx = {}) {
  const facteurs = evaluerFacteurs(h, seuils);
  const nuages = facteurs.nuages;
  const proba = probabiliteSaut(h, seuils, ctx.echeanceJours ?? h.echeanceJours ?? 0);

  // Arbitrage des blocages probabilistes par le vote.
  if (proba && proba.p >= PROBA.rouge) {
    for (const x of facteurs) {
      if (x.statut === "bloquant" && x.probabiliste) {
        x.statut = "limite";
        x.arbitre = true;
        x.motif = `${x.motif} selon le modèle principal — ${Math.round(proba.p * 100)} % des modèles favorables`;
      }
    }
  }

  // Arbitrage du plafond. Un plafond bas n'est retenu comme bloquant que
  // s'il est corroboré : par la majorité des modèles (couche basse), et
  // pas démenti par l'observation réelle de Charleroi dans les 2 heures
  // (la persistance d'une observation bat la prévision à très court terme).
  const plafond = facteurs.find((x) => x.id === "plafond");
  if (plafond?.statut === "bloquant") {
    const accord = accordCoucheBasse(h);
    const m = h.metar;
    const obsFraiche = m && ageMetar(m, h.maintenant ?? new Date()) <= METAR.ageMaxMin + 60 * (h.metarDecalage ?? 0);
    if (obsFraiche && m.plafond >= seuils.plafondMin && (m.visibilite ?? 10000) >= 5000 && (h.metarDecalage ?? 0) <= 2) {
      plafond.statut = "limite";
      plafond.arbitre = true;
      plafond.motif = `${plafond.motif} prévu, mais ${METAR.nom} n'observe ${m.plafond === Infinity ? "aucun plafond" : `qu'un plafond à ${Math.round(m.plafond)} m`}`;
    } else if (accord && accord.n >= 3 && accord.part < 0.5 && nuages.plafond < 2000) {
      plafond.statut = "limite";
      plafond.arbitre = true;
      plafond.motif = `${plafond.motif} selon le modèle principal — couche basse prévue par ${Math.round(accord.part * 100)} % des modèles`;
    }
  }

  const bloquants = facteurs.filter((x) => x.statut === "bloquant");
  const limites = facteurs.filter((x) => x.statut === "limite");
  const pct = proba ? Math.round(proba.p * 100) : null;
  const critere = LIBELLE_CRITERE[critereLimitant(proba)];
  const raisonProba = proba
    ? `Probabilité de saut ${pct} %${critere ? ` — en cause : ${critere}` : ""}`
    : null;

  let verdict;
  let raisons;
  if (bloquants.length) {
    verdict = "rouge";
    raisons = bloquants.map((x) => x.motif);
  } else if (proba && proba.p < PROBA.rouge) {
    verdict = "rouge";
    raisons = [raisonProba, ...limites.map((x) => x.motif)];
  } else if (limites.length || (proba && proba.p < PROBA.vert)) {
    verdict = "orange";
    raisons = [...limites.map((x) => x.motif)];
    if (proba && proba.p < PROBA.vert) raisons.unshift(raisonProba);
  } else {
    verdict = "vert";
    raisons = [];
  }

  const fermeBloque = bloquants.some((x) => !x.probabiliste);
  const chance = proba ? (fermeBloque ? 0 : proba.p) : null;
  return { verdict, raisons, facteurs, proba, chance, plafond: nuages.plafond, nuages };
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
 * Meilleure fenêtre sautable d'un créneau : la plus longue plage d'heures
 * consécutives (≥ 2 h) tenable, en privilégiant une plage entièrement verte.
 *
 * Une heure `h` couvre la tranche [h, h+1[ : une plage 10h→12h (heures 10,
 * 11 et 12) se lit donc « 10h → 13h ».
 *
 * @param {Array<{heure:number, verdict:string}>} heures — dans l'ordre chronologique
 * @returns {{verdict:string, debut:number|null, fin:number|null, duree:number}}
 */
export function fenetreSautable(heures) {
  if (!heures?.length) return { verdict: "rouge", debut: null, fin: null, duree: 0 };
  // Une heure isolée ne fait pas une fenêtre : la règle « 2 h consécutives »
  // s'applique aussi quand le créneau ne contient qu'une heure (fin de
  // journée, créneau du vendredi tronqué par le coucher du soleil). Avant
  // la v1.5.0 ce cas retournait le verdict de l'heure : un créneau réduit
  // à une heure verte sortait VERT, alors que la même heure verte au
  // milieu d'un créneau plus long sortait rouge.

  /** Plus longue plage d'heures consécutives dont le verdict passe le test. */
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

/**
 * Score d'un créneau = verdict de sa meilleure fenêtre sautable.
 *  - 2 h vertes consécutives           → vert
 *  - 2 h sautables (vert/orange) cons. → orange
 *  - sinon                             → rouge
 * @param {string[]} verdictsHoraires — verdicts des heures du créneau, dans l'ordre
 */
export function scoreCreneau(verdictsHoraires) {
  return fenetreSautable(
    verdictsHoraires.map((verdict, i) => ({ heure: i, verdict }))
  ).verdict;
}

/**
 * MEILLEUR des verdicts fournis (vert dès qu'un créneau est vert) : c'est
 * le badge du jour, qui répond à « est-ce qu'il y a un créneau sautable
 * quelque part dans la journée ? ». À ne pas confondre avec une agrégation
 * pessimiste — le commentaire d'origine disait « pire des deux », ce que
 * la fonction n'a jamais fait.
 */
export function meilleurVerdict(verdicts) {
  if (verdicts.includes("vert")) return "vert";
  if (verdicts.includes("orange")) return "orange";
  return "rouge";
}
