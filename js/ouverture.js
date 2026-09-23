// ============================================================
// Vent4000 — Calendrier d'ouverture du Paraclub de Namur
// Week-ends + jours fériés belges (mars → mi-décembre),
// vendredis dès 16h (mai → septembre).
// Module pur (aucune dépendance DOM) — réutilisable côté Node.
// ============================================================

import { OUVERTURE } from "./config.js";

/** Dimanche de Pâques (algorithme grégorien anonyme / Meeus). */
export function paques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

/** Jours fériés légaux belges pour une année (Date locales à minuit). */
export function feriesBelges(annee) {
  const p = paques(annee);
  const plus = (d, n) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  return [
    new Date(annee, 0, 1),   // Nouvel An
    plus(p, 1),              // Lundi de Pâques
    new Date(annee, 4, 1),   // Fête du Travail
    plus(p, 39),             // Ascension
    plus(p, 50),             // Lundi de Pentecôte
    new Date(annee, 6, 21),  // Fête nationale
    new Date(annee, 7, 15),  // Assomption
    new Date(annee, 10, 1),  // Toussaint
    new Date(annee, 10, 11), // Armistice
    new Date(annee, 11, 25), // Noël
  ];
}

function memeJour(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export function estFerie(date) {
  return feriesBelges(date.getFullYear()).some((f) => memeJour(f, date));
}

/** La date est-elle dans la saison d'activité du club ? */
export function dansSaison(date) {
  const m = date.getMonth() + 1;
  const j = date.getDate();
  const { saisonDebut, saisonFin } = OUVERTURE;
  const apresDebut = m > saisonDebut.mois || (m === saisonDebut.mois && j >= saisonDebut.jour);
  const avantFin = m < saisonFin.mois || (m === saisonFin.mois && j <= saisonFin.jour);
  return apresDebut && avantFin;
}

/**
 * Dernier dimanche d'octobre : fin de l'heure d'été en Europe, et date à
 * laquelle le club passe en journées continues (cf. OUVERTURE dans
 * config.js). Le 31 octobre est le dernier jour possible du mois ; on
 * recule jusqu'au dimanche.
 */
export function changementHeureOctobre(annee) {
  const d = new Date(annee, 9, 31); // 9 = octobre
  d.setDate(31 - d.getDay());
  return d;
}

/**
 * Journées continues (un seul créneau 8h30 → coucher) à partir du
 * changement d'heure de fin octobre, d'après la page formation du club :
 * « À partir de fin octobre (avec le changement d'heure), les journées
 * sont continues, de 8h30 jusqu'au coucher du soleil. »
 */
export function journeeContinue(date) {
  return date >= changementHeureOctobre(date.getFullYear());
}

/**
 * Statut d'ouverture d'une date.
 * @returns {null | {type:"weekend"|"ferie"|"vendredi", creneaux:[{id,label,debut,fin}]}}
 *   Les heures `debut`/`fin` sont décimales locales ; `fin: null` = coucher du soleil.
 *   `debut` est l'heure du PREMIER SAUT (9h00), pas l'ouverture du club
 *   (8h30) : scorer 8h-9h proposait une fenêtre sans séance de saut.
 */
export function statutOuverture(date) {
  if (!dansSaison(date)) return null;
  const dow = date.getDay(); // 0 = dimanche … 6 = samedi
  const ferie = estFerie(date);
  const { heurePremierSaut, heureSplit, heureVendredi, vendrediDebutMois, vendrediFinMois } = OUVERTURE;

  if (dow === 0 || dow === 6 || ferie) {
    const type = ferie && dow !== 0 && dow !== 6 ? "ferie" : "weekend";
    if (journeeContinue(date)) {
      return {
        type,
        creneaux: [{ id: "journee", label: "Journée continue", debut: heurePremierSaut, fin: null }],
      };
    }
    return {
      type,
      creneaux: [
        { id: "matin", label: "Matin", debut: heurePremierSaut, fin: heureSplit },
        { id: "aprem", label: "Après-midi", debut: heureSplit, fin: null },
      ],
    };
  }

  const mois = date.getMonth() + 1;
  if (dow === 5 && mois >= vendrediDebutMois && mois <= vendrediFinMois) {
    return {
      type: "vendredi",
      creneaux: [{ id: "soir", label: "Dès 16h", debut: heureVendredi, fin: null }],
    };
  }
  return null;
}
