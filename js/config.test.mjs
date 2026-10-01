// Invariants : chaque seuil de config.js doit être la transcription exacte
// d'un texte (CIR/GDF-05, RSB FWCP), sans marge ni valeur inventée.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NIVEAUX_PRATIQUE, LEGAL_BE, COUCHE_PLAFOND, MODELES } from "./config.js";

test("LEGAL_BE transcrit CIR/GDF-05 §6 (25 kts, 3000 ft, 3000 m), arrondi vers le plus strict", () => {
  assert.equal(LEGAL_BE.ventMoyenMaxSol, Math.floor(25 * 1.852)); // 46
  assert.equal(LEGAL_BE.plafondMinAGL, Math.floor(3000 * 0.3048)); // 914
  assert.equal(LEGAL_BE.visibiliteMin, 3000);
});

test("RSB §3.4.2 : 7 m/s jusqu'au brevet B inclus (passager tandem compris), 25 kts au-delà", () => {
  const bas = Math.floor(7 * 3.6);
  for (const cle of ["tandem", "aff", "brevetA", "brevetB"]) assert.equal(NIVEAUX_PRATIQUE[cle].ventMax, bas, cle);
  assert.equal(NIVEAUX_PRATIQUE.brevetCD.ventMax, LEGAL_BE.ventMoyenMaxSol);
});

test("Plafond minimum = plancher légal pour tous les niveaux, sans marge ajoutée", () => {
  for (const [cle, n] of Object.entries(NIVEAUX_PRATIQUE)) assert.equal(n.plafondMin, LEGAL_BE.plafondMinAGL, cle);
});

test("Ouverture : 5000 ft en tandem (RSB §6.4.1), jamais sous 3000 ft (RSB §3.5), source citée", () => {
  assert.equal(NIVEAUX_PRATIQUE.tandem.hauteurOuverture, Math.floor(5000 * 0.3048));
  for (const [cle, n] of Object.entries(NIVEAUX_PRATIQUE)) {
    assert.ok(n.hauteurOuverture >= LEGAL_BE.plafondMinAGL, cle);
    assert.ok(n.sourceOuverture?.length > 5, `${cle} : source de l'altitude d'ouverture`);
  }
});

test("Plafond = couche ≥ 5/8 (BKN, définition OACI)", () => {
  assert.equal(COUCHE_PLAFOND, 62.5);
});

test("Les modèles haute résolution passent avant les régionaux ; seuls DMI et UKMO fournissent la base", () => {
  const premierRegional = MODELES.findIndex((m) => !m.hr);
  assert.ok(MODELES.slice(0, premierRegional).every((m) => m.hr));
  assert.ok(MODELES.slice(premierRegional).every((m) => !m.hr));
  assert.deepEqual(MODELES.filter((m) => m.base).map((m) => m.id), ["dmi_harmonie_arome_europe", "ukmo_uk_deterministic_2km"]);
});
