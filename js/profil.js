// ============================================================
// Vent4000 — Profil du membre (réglages personnels)
//
// Tout reste sur le téléphone (localStorage) : aucun compte, aucun envoi.
// Un code texte permet de passer son profil sur un autre appareil.
//
// Règle non négociable : une personnalisation ne peut JAMAIS assouplir
// une limite du règlement. La « marge » ne fait que retrancher au palier
// du brevet ; le nombre de sauts et le prénom ne touchent pas au verdict.
//
// Module pur (aucune dépendance DOM) : testé sous Node.
// ============================================================

import { NIVEAUX_PRATIQUE } from "./config.js";

export const VERSION_PROFIL = 2;

/** Jours de la semaine (0 = dimanche, comme Date#getDay) + jours fériés. */
export const JOURS_SEMAINE = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

export const UNITES_VENT = {
  kmh: { label: "km/h", depuisKmh: (v) => v },
  kt:  { label: "kt",   depuisKmh: (v) => v / 1.852 },
  ms:  { label: "m/s",  depuisKmh: (v) => v / 3.6 },
};

export const THEMES = { auto: "Auto (jour / nuit)", nuit: "Nuit", jour: "Jour" };

// Marge personnelle sous la limite du brevet, en km/h. Bornée pour qu'une
// faute de frappe ne rende pas l'app inutilisable (jamais de vent max < 5).
export const MARGE_MAX = 20;

export function profilParDefaut() {
  return {
    version: VERSION_PROFIL,
    prenom: "",
    niveau: "tandem",
    niveauChoisi: false,
    marge: 0,
    sauts: null,
    jours: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, feries: true },
    theme: "auto",
    unite: "kmh",
    maPosition: false,   // « Me situer » sur le radar : la position reste sur le téléphone
    trajet: null,
  };
}

const entier = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const positif = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

function nettoyerTrajet(t) {
  if (!t || typeof t !== "object") return null;
  const propre = {};
  for (const cle of ["distanceAllerKm", "dureeAllerMin", "consoL100"]) {
    const v = positif(t[cle]);
    if (v != null) propre[cle] = v;
  }
  if (typeof t.carburant === "string" && /^[a-z0-9]{1,12}$/.test(t.carburant) && t.carburant !== "diesel") propre.carburant = t.carburant;
  return Object.keys(propre).length ? propre : null;
}

/**
 * Profil lu (localStorage, import, ancien format) → profil valide.
 * Toute valeur invalide retombe sur le défaut : jamais d'erreur.
 * Format v1 (≤ 2.4) : {niveau, ventMax, trajet, niveauChoisi} — le vent
 * max personnel absolu devient une marge sous le palier du brevet.
 */
export function normaliserProfil(brut) {
  const p = profilParDefaut();
  if (!brut || typeof brut !== "object") return p;

  if (NIVEAUX_PRATIQUE[brut.niveau]) p.niveau = brut.niveau;
  // Avant la v2.2, le niveau était enregistré sans ce drapeau : un profil
  // ancien déjà enregistré vaut choix fait.
  p.niveauChoisi = brut.niveauChoisi === true || (brut.version === undefined && brut.niveauChoisi === undefined && !!NIVEAUX_PRATIQUE[brut.niveau]);

  if (typeof brut.prenom === "string") p.prenom = brut.prenom.replace(/[<>]/g, "").trim().slice(0, 30);

  const palier = NIVEAUX_PRATIQUE[p.niveau].ventMax;
  if (brut.version === undefined && typeof brut.ventMax === "number" && brut.ventMax < palier) {
    p.marge = Math.min(MARGE_MAX, Math.max(0, Math.round(palier - brut.ventMax)));
  } else {
    p.marge = entier(brut.marge, 0, MARGE_MAX) ?? 0;
  }

  p.sauts = entier(brut.sauts, 0, 100000);

  if (brut.jours && typeof brut.jours === "object") {
    for (const cle of Object.keys(p.jours)) {
      if (typeof brut.jours[cle] === "boolean") p.jours[cle] = brut.jours[cle];
    }
  }
  if (THEMES[brut.theme]) p.theme = brut.theme;
  if (UNITES_VENT[brut.unite]) p.unite = brut.unite;
  p.maPosition = brut.maPosition === true;
  p.trajet = nettoyerTrajet(brut.trajet);
  return p;
}

/** Vent max effectif : palier du brevet moins la marge, jamais au-dessus du palier. */
export function ventMaxEffectif(profil) {
  const palier = (NIVEAUX_PRATIQUE[profil.niveau] ?? NIVEAUX_PRATIQUE.tandem).ventMax;
  return Math.max(5, Math.min(palier, palier - (profil.marge ?? 0)));
}

/**
 * Ce jour fait-il partie de « mes jours » ? Un jour férié compte s'il est
 * coché comme jour de semaine OU si la case « fériés » est cochée.
 */
export function jourDisponible(profil, date, estFerie = false) {
  const j = profil?.jours ?? profilParDefaut().jours;
  return j[date.getDay()] === true || (estFerie && j.feries === true);
}

/** Valeur de vent (km/h) dans l'unité choisie, arrondie. */
export function convertirVent(kmh, unite = "kmh") {
  if (kmh == null || !Number.isFinite(kmh)) return null;
  return Math.round((UNITES_VENT[unite] ?? UNITES_VENT.kmh).depuisKmh(kmh));
}

// ------------------------------------------------------------
// Export / import : un code texte, sans serveur.
// ------------------------------------------------------------
const PREFIXE = "V4K2-";

export function exporterProfil(profil) {
  const json = JSON.stringify(normaliserProfil({ ...profil, version: VERSION_PROFIL }));
  const octets = new TextEncoder().encode(json);
  let bin = "";
  for (const o of octets) bin += String.fromCharCode(o);
  return PREFIXE + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @returns {object|null} profil valide, ou null si le code est illisible. */
export function importerProfil(code) {
  const texte = String(code ?? "").trim();
  if (!texte.startsWith(PREFIXE)) return null;
  try {
    const b64 = texte.slice(PREFIXE.length).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const brut = JSON.parse(json);
    if (brut?.version !== VERSION_PROFIL) return null;
    return normaliserProfil(brut);
  } catch {
    return null;
  }
}
