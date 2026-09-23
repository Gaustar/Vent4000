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

import { SEUILS_COMMUNS, DZ, LEGAL_BE } from "./config.js";
import { profilVent, ventAAltitude } from "./spot.js";

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
  const ecartRafalesOrange = seuils.ecartRafalesOrange ?? 10;

  // --- Étage 0 : limites LÉGALES belges ----------------------
  // CIR/GDF-05 §6 (cf. LEGAL_BE dans config.js). Testées séparément des
  // seuils de niveau et avec leur propre motif : « au-dessus de ton
  // seuil perso » et « interdit par la loi » ne se disent pas pareil.
  // Le point (c) de la circulaire porte sur la MOYENNE au sol — pas sur
  // la rafale, qui relève du durcissement de niveau ci-dessous.
  // Les réglages étant bornés à ces valeurs (app.js / index.html), ces
  // tests ne devraient jamais être le seul motif : c'est un garde-fou
  // structurel, pour qu'aucune évolution future des seuils ne puisse
  // produire un feu vert sur un saut illégal.
  if ((h.vent10 ?? 0) > LEGAL_BE.ventMoyenMaxSol)
    raisons.push(`Vent moyen ${Math.round(h.vent10)} km/h — hors limite légale (25 kts)`);
  if (plafond < LEGAL_BE.plafondMinAGL)
    raisons.push(`Plafond ~${plafond} m — sous le minimum légal (3000 ft)`);
  if (h.visibilite != null && h.visibilite < LEGAL_BE.visibiliteMin)
    raisons.push("Visibilité < 3 km — sous le minimum légal");

  // --- Étage 1 : éliminatoires -------------------------------
  if ((h.precip ?? 0) > C.precipMax) raisons.push("Pluie");
  if ((h.probaPluie ?? 0) >= C.probaPluieMax) raisons.push("Forte proba de pluie");
  if ((h.cape ?? 0) >= C.capeRouge) raisons.push("Risque orageux (CAPE)");
  // Ciel bouché : une couche compacte empêche le largage VFR, même si la
  // base estimée est haute. Testé par étage (voir config.js).
  if ((h.nuagesMoyens ?? 0) >= C.nuagesBoucheRouge)
    raisons.push("Couche compacte à l'altitude de largage");
  else if ((h.nuagesBas ?? 0) >= C.nuagesBoucheRouge)
    raisons.push("Ciel bouché (couche basse)");
  if (plafond < seuils.plafondMin && plafond >= LEGAL_BE.plafondMinAGL)
    raisons.push(`Plafond ~${plafond} m`);
  if ((h.vent10 ?? 0) > seuils.ventMax && (h.vent10 ?? 0) <= LEGAL_BE.ventMoyenMaxSol)
    raisons.push(`Vent ${Math.round(h.vent10)} km/h`);
  // La limite de NIVEAU s'applique à la rafale : c'est la rafale qui
  // compte au moment de l'atterrissage ("assume the worst case scenario
  // at the time of landing" — pratique DZ standard, cf. README). À
  // distinguer du test légal ci-dessus, qui porte sur la moyenne.
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
  // Vent en altitude : la colonne de vent entre enfin dans la décision.
  // On la lit à la hauteur d'ouverture du niveau, là où le parachutiste
  // doit pouvoir revenir vers la zone de poser sous voile.
  if (seuils.hauteurOuverture) {
    const ventOuverture = ventAAltitude(profilVent(h), seuils.hauteurOuverture);
    if (ventOuverture != null && ventOuverture > C.ventOuvertureOrange)
      raisons.push(`Vent ${Math.round(ventOuverture)} km/h à l'ouverture (${seuils.hauteurOuverture} m)`);
  }
  // Le relevé temps réel contredit la prévision de cette même heure : la
  // prévision est en train de se tromper, maintenant.
  if (h.ventActuel != null && h.vent10 != null) {
    const ecart = Math.abs(h.ventActuel - h.vent10);
    if (ecart > C.ecartNowcastOrange)
      raisons.push(`Relevé actuel ${Math.round(h.ventActuel)} km/h vs ${Math.round(h.vent10)} prévus`);
  }
  const couverture = (h.nuagesBas ?? 0) + (h.nuagesMoyens ?? 0);
  if (couverture >= C.nuagesOrangeMin) raisons.push("Ciel partiellement couvert");
  if ((h.cape ?? 0) >= C.capeOrange) raisons.push("Instabilité (CAPE)");
  // Légal (≥ 3 km) mais marge mince : marge de confort DZ, pas un interdit.
  if (h.visibilite != null && h.visibilite < C.visibiliteConfort)
    raisons.push(`Visibilité ${(h.visibilite / 1000).toFixed(0)} km`);
  if (raisons.length) return { verdict: "orange", raisons, plafond };

  // Confiance faible entre modèles : pas d'éléments franchement dégradants,
  // mais la prévision elle-même n'est pas fiable → on ne peut pas conclure
  // au vert en confiance. Un para prudent revérifierait avant de conclure.
  if (h.comparaisons) {
    const confiance = niveauConfiance(h.vent10, [
      { nom: "AROME", vent: h.comparaisons.arome?.vent, rafales: h.comparaisons.arome?.rafales },
      { nom: "ECMWF", vent: h.comparaisons.ecmwf?.vent, rafales: h.comparaisons.ecmwf?.rafales },
    ], h.echeanceJours ?? 0, h.rafales10);
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

/**
 * Niveau de confiance basé sur deux facteurs :
 *  1. l'accord entre modèles météo indépendants pour le vent au sol
 *     (DWD ICON = primaire, + Météo-France AROME sur J0-J3,
 *     + ECMWF IFS sur les 7 jours) ;
 *  2. l'échéance — une prévision à J+6 ne vaut pas une prévision à J+1,
 *     même si les modèles sont d'accord entre eux (ils peuvent l'être et
 *     se tromper ensemble). On ajoute donc une pénalité par jour.
 * @param {number} ventPrimaire
 * @param {Array<{nom:string, vent:number|null|undefined}>} autres — modèles secondaires disponibles à cette heure
 * @param {number} echeanceJours — 0 = aujourd'hui, 6 = J+6
 * @returns {{niveau:string, ecart:number|null, nModeles:number, penalite:number}}
 *   `ecart` reste l'écart réellement observé entre modèles (affichable) ;
 *   le niveau, lui, est calculé sur l'écart + pénalité d'échéance.
 */
export function niveauConfiance(ventPrimaire, autres = [], echeanceJours = 0, rafalePrimaire = null) {
  const C = SEUILS_COMMUNS;
  const penalite = Math.max(0, echeanceJours - 1) * C.confiancePenaliteParJour;
  // On confronte les modèles sur le vent moyen ET sur la rafale, en
  // retenant le pire désaccord des deux. La rafale est le critère qui
  // élimine une heure (scoreHeure) : un accord sur la moyenne ne dit rien
  // de l'accord sur la rafale, et c'est justement là que les modèles
  // divergent le plus. Jusqu'à la v1.5.0 la rafale était téléchargée puis
  // ignorée, ce qui pouvait afficher « confiance haute » sur un verdict
  // décidé par une variable jamais comparée.
  const ecarts = [];
  for (const m of autres) {
    if (m.vent != null && ventPrimaire != null) ecarts.push(Math.abs(ventPrimaire - m.vent));
    if (m.rafales != null && rafalePrimaire != null) ecarts.push(Math.abs(rafalePrimaire - m.rafales));
  }
  if (ecarts.length === 0) return { niveau: "unique", ecart: null, nModeles: 1, penalite };
  const ecart = Math.round(Math.max(...ecarts));
  // Compter les MODÈLES qui ont contribué, pas les écarts : depuis que la
  // rafale est comparée aussi, un même modèle peut produire deux écarts.
  const nModeles = autres.filter(
    (m) => (m.vent != null && ventPrimaire != null) || (m.rafales != null && rafalePrimaire != null)
  ).length + 1;
  const effectif = ecart + penalite;
  const niveau =
    effectif <= C.confianceHauteMax ? "haute" :
    effectif <= C.confianceMoyenneMax ? "moyenne" : "faible";
  return { niveau, ecart, nModeles, penalite };
}
