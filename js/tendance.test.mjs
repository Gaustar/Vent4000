import { test } from "node:test";
import assert from "node:assert/strict";
import { comparerPrevisions, doitRemplacerInstantane, AGE_MIN_INSTANTANE_H } from "./tendance.js";

const MAINTENANT = Date.UTC(2026, 8, 19, 12, 0, 0);
const ilYA = (heures) => MAINTENANT - heures * 3600000;

test("Pas d'instantané précédent -> pas de tendance affichable", () => {
  assert.equal(comparerPrevisions({ verdict: "vert", vent: 15 }, null, MAINTENANT), null);
});

test("Instantané trop récent -> pas de tendance (on ne compare pas à il y a 10 min)", () => {
  const p = { verdict: "rouge", vent: 40, ts: ilYA(1) };
  assert.equal(comparerPrevisions({ verdict: "vert", vent: 15 }, p, MAINTENANT), null);
});

test("Passage rouge -> vert = amélioration", () => {
  const p = { verdict: "rouge", vent: 40, ts: ilYA(20) };
  const t = comparerPrevisions({ verdict: "vert", vent: 15 }, p, MAINTENANT);
  assert.equal(t.sens, "amelioration");
  assert.equal(t.depuisH, 20);
  assert.equal(t.deltaVent, -25);
});

test("Passage vert -> orange = dégradation", () => {
  const p = { verdict: "vert", vent: 15, ts: ilYA(10) };
  assert.equal(comparerPrevisions({ verdict: "orange", vent: 26 }, p, MAINTENANT).sens, "degradation");
});

test("Verdict inchangé mais vent qui forcit nettement = dégradation", () => {
  const p = { verdict: "orange", vent: 20, ts: ilYA(12) };
  const t = comparerPrevisions({ verdict: "orange", vent: 27 }, p, MAINTENANT);
  assert.equal(t.sens, "degradation");
  assert.equal(t.deltaVent, 7);
});

test("Verdict inchangé mais vent qui faiblit nettement = amélioration", () => {
  const p = { verdict: "orange", vent: 27, ts: ilYA(12) };
  assert.equal(comparerPrevisions({ verdict: "orange", vent: 20 }, p, MAINTENANT).sens, "amelioration");
});

test("Verdict inchangé et vent quasi identique = stable", () => {
  const p = { verdict: "vert", vent: 15, ts: ilYA(24) };
  const t = comparerPrevisions({ verdict: "vert", vent: 16 }, p, MAINTENANT);
  assert.equal(t.sens, "stable");
  assert.equal(t.deltaVent, 1);
});

test("doitRemplacerInstantane : remplace si absent ou assez ancien, conserve sinon", () => {
  assert.equal(doitRemplacerInstantane(null, MAINTENANT), true);
  assert.equal(doitRemplacerInstantane({ ts: ilYA(AGE_MIN_INSTANTANE_H + 1) }, MAINTENANT), true);
  assert.equal(doitRemplacerInstantane({ ts: ilYA(1) }, MAINTENANT), false);
});
