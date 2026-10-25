import { test } from "node:test";
import assert from "node:assert/strict";
import { profilParDefaut, normaliserProfil, ventMaxEffectif, jourDisponible, convertirVent, exporterProfil, importerProfil, MARGE_MAX } from "./profil.js";
import { NIVEAUX_PRATIQUE } from "./config.js";

test("normaliserProfil : valeurs invalides → défauts, jamais d'erreur", () => {
  assert.deepEqual(normaliserProfil(null), profilParDefaut());
  const p = normaliserProfil({ version: 2, niveau: "inconnu", marge: -3, sauts: 1.5, theme: "rose", unite: "mph", prenom: "<b>Léa</b>   ", jours: { 0: "oui", 6: false } });
  assert.equal(p.niveau, "tandem");
  assert.equal(p.marge, 0);
  assert.equal(p.sauts, null);
  assert.equal(p.theme, "auto");
  assert.equal(p.unite, "kmh");
  assert.equal(p.prenom, "bLéa/b");
  assert.equal(p.jours[0], true);
  assert.equal(p.jours[6], false);
  assert.equal(normaliserProfil({ version: 2, marge: 99 }).marge, 0);
});

test("migration v1 : le vent max personnel devient une marge, le reste est gardé", () => {
  const p = normaliserProfil({ niveau: "brevetCD", ventMax: 40, niveauChoisi: true, trajet: { distanceAllerKm: 80, carburant: "e10", pirate: 1 } });
  assert.equal(p.niveau, "brevetCD");
  assert.equal(p.marge, NIVEAUX_PRATIQUE.brevetCD.ventMax - 40);
  assert.equal(p.niveauChoisi, true);
  assert.deepEqual(p.trajet, { distanceAllerKm: 80, carburant: "e10" });
  // Un ancien vent max au-dessus du palier n'assouplit rien.
  assert.equal(normaliserProfil({ niveau: "aff", ventMax: 60 }).marge, 0);
  // Profil d'avant la v2.2 (sans drapeau) : le niveau compte comme choisi.
  assert.equal(normaliserProfil({ niveau: "brevetA" }).niveauChoisi, true);
  assert.equal(normaliserProfil({ version: 2, niveau: "brevetA" }).niveauChoisi, false);
});

test("ventMaxEffectif : la marge durcit, ne dépasse jamais le palier, plancher 5 km/h", () => {
  const palier = NIVEAUX_PRATIQUE.aff.ventMax;
  assert.equal(ventMaxEffectif({ niveau: "aff", marge: 0 }), palier);
  assert.equal(ventMaxEffectif({ niveau: "aff", marge: 5 }), palier - 5);
  assert.equal(ventMaxEffectif({ niveau: "aff", marge: -10 }), palier);
  assert.equal(ventMaxEffectif({ niveau: "aff", marge: MARGE_MAX + 50 }), 5);
});

test("jourDisponible : jours cochés, fériés à part", () => {
  const p = { jours: { 0: true, 1: false, 2: false, 3: false, 4: false, 5: false, 6: true, feries: true } };
  assert.equal(jourDisponible(p, new Date(2026, 9, 31)), true);          // samedi
  assert.equal(jourDisponible(p, new Date(2026, 10, 11)), false);        // mercredi
  assert.equal(jourDisponible(p, new Date(2026, 10, 11), true), true);   // mercredi férié
  assert.equal(jourDisponible({ jours: { ...p.jours, feries: false } }, new Date(2026, 10, 11), true), false);
});

test("convertirVent : km/h, nœuds, m/s", () => {
  assert.equal(convertirVent(46, "kt"), 25);
  assert.equal(convertirVent(25, "ms"), 7);
  assert.equal(convertirVent(43, "kmh"), 43);
  assert.equal(convertirVent(null, "kt"), null);
});

test("export / import : aller-retour fidèle, code invalide → null", () => {
  const p = normaliserProfil({ version: 2, prenom: "Zoé", niveau: "brevetA", niveauChoisi: true, marge: 3, sauts: 57, unite: "kt", theme: "nuit",
    jours: { 0: true, 1: false, 2: false, 3: false, 4: false, 5: true, 6: true, feries: false }, trajet: { distanceAllerKm: 42, dureeAllerMin: 35 } });
  const code = exporterProfil(p);
  assert.match(code, /^V4K2-[A-Za-z0-9_-]+$/);
  assert.deepEqual(importerProfil(code), p);
  assert.equal(importerProfil("n'importe quoi"), null);
  assert.equal(importerProfil("V4K2-@@@"), null);
  assert.equal(importerProfil(""), null);
});
