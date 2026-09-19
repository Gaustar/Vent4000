import { test } from "node:test";
import assert from "node:assert/strict";
import { profilVent, derive, estimerSpot } from "./spot.js";

/** Profil de vent uniforme : même vent à toutes les altitudes. */
function profilUniforme(vent, dir, altitudes = [10, 180, 800, 1500, 3000, 4200]) {
  return altitudes.map((agl) => ({ agl, vent, dir }));
}

test("derive : vent d'ouest uniforme -> dérive vers l'est, distance = vitesse × temps", () => {
  // 36 km/h = 10 m/s, descente de 1000 m à 5 m/s = 200 s -> 2000 m
  const d = derive(profilUniforme(36, 270), 0, 1000, 5);
  assert.equal(d.duree, 200);
  assert.ok(Math.abs(d.distance - 2000) <= 5, `distance ${d.distance}`);
  assert.equal(d.cap, 90); // vers l'est
});

test("derive : vent du nord pousse vers le sud (cap 180°)", () => {
  const d = derive(profilUniforme(36, 0), 0, 1000, 5);
  assert.equal(d.cap, 180);
});

test("derive : vent nul -> aucune dérive", () => {
  const d = derive(profilUniforme(0, 240), 0, 1500, 5);
  assert.equal(d.distance, 0);
});

test("derive : plus on descend vite, moins on dérive", () => {
  const lente = derive(profilUniforme(30, 270), 0, 1000, 5);
  const rapide = derive(profilUniforme(30, 270), 0, 1000, 55);
  assert.ok(rapide.distance < lente.distance / 5);
});

test("derive : interpolation par composantes, pas par angle (350° et 10° ne font pas 180°)", () => {
  // Deux niveaux encadrant le nord : la dérive doit rester vers le sud
  // (cap ~180°), pas partir vers le nord.
  const profil = [
    { agl: 0, vent: 30, dir: 350 },
    { agl: 1000, vent: 30, dir: 10 },
  ];
  const d = derive(profil, 0, 1000, 5);
  assert.ok(d.cap > 170 && d.cap < 190, `cap ${d.cap} devrait être proche de 180°`);
});

test("derive : bornes invalides -> dérive nulle", () => {
  assert.equal(derive([], 0, 1000, 5).distance, 0);
  assert.equal(derive(profilUniforme(30, 270), 1000, 1000, 5).distance, 0);
  assert.equal(derive(profilUniforme(30, 270), 0, 1000, 0).distance, 0);
});

test("profilVent : agrège sol + niveaux AGL + niveaux de pression, trié en altitude", () => {
  const h = {
    vent10: 12, direction10: 240,
    niveauxAGL: { 80: { vent: 18, dir: 245 }, 180: { vent: 22, dir: 250 } },
    niveaux: { 925: { vent: 30, dir: 255, agl: 620 }, 600: { vent: 55, dir: 260, agl: 4100 } },
  };
  const p = profilVent(h);
  assert.deepEqual(p.map((x) => x.agl), [10, 80, 180, 620, 4100]);
});

test("profilVent : ignore les niveaux incomplets sans planter", () => {
  const h = {
    vent10: 12, direction10: 240,
    niveauxAGL: { 80: { vent: null, dir: 245 } },
    niveaux: { 925: { vent: 30, dir: 255, agl: null } },
  };
  assert.deepEqual(profilVent(h).map((x) => x.agl), [10]);
});

test("estimerSpot : le point de largage est à l'opposé de la dérive totale", () => {
  const h = {
    vent10: 20, direction10: 240,
    niveauxAGL: { 80: { vent: 25, dir: 240 }, 120: { vent: 27, dir: 240 }, 180: { vent: 30, dir: 240 } },
    niveaux: {
      925: { vent: 35, dir: 240, agl: 620 },
      850: { vent: 40, dir: 240, agl: 1400 },
      700: { vent: 50, dir: 240, agl: 3000 },
      600: { vent: 60, dir: 240, agl: 4100 },
    },
  };
  const s = estimerSpot(h, 1200, 4000);
  assert.ok(s.total.distance > 0);
  assert.equal(s.pointLargage.distance, s.total.distance);
  assert.equal(s.pointLargage.cap, (s.total.cap + 180) % 360);
  // Vent de secteur 240° (SO) -> on dérive vers le NE (~60°)
  assert.ok(Math.abs(s.total.cap - 60) < 10, `cap total ${s.total.cap}`);
});

test("estimerSpot : la dérive sous voile domine celle en chute (on y passe bien plus de temps)", () => {
  const h = {
    vent10: 25, direction10: 240,
    niveauxAGL: { 80: { vent: 25, dir: 240 } },
    niveaux: { 925: { vent: 30, dir: 240, agl: 620 }, 600: { vent: 45, dir: 240, agl: 4100 } },
  };
  const s = estimerSpot(h, 1200, 4000);
  assert.ok(s.voile.duree > s.chute.duree * 3);
  assert.ok(s.voile.distance > s.chute.distance);
});
