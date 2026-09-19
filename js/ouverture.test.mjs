import { test } from "node:test";
import assert from "node:assert/strict";
import { paques, feriesBelges, estFerie, dansSaison, statutOuverture } from "./ouverture.js";

test("Pâques 2026 tombe le 5 avril (vérifié via référence liturgique)", () => {
  const p = paques(2026);
  assert.equal(p.getMonth(), 3); // avril = index 3
  assert.equal(p.getDate(), 5);
});

test("Pâques 2024 tombe le 31 mars", () => {
  const p = paques(2024);
  assert.equal(p.getMonth(), 2);
  assert.equal(p.getDate(), 31);
});

test("Lundi de Pâques 2026 (6 avril) est bien férié", () => {
  assert.equal(estFerie(new Date(2026, 3, 6)), true);
});

test("Fête nationale belge (21 juillet) toujours fériée", () => {
  assert.equal(estFerie(new Date(2026, 6, 21)), true);
  assert.equal(estFerie(new Date(2027, 6, 21)), true);
});

test("dansSaison : 1er mars inclus, 15 décembre inclus, 16 décembre exclu", () => {
  assert.equal(dansSaison(new Date(2026, 2, 1)), true);
  assert.equal(dansSaison(new Date(2026, 1, 28)), false);
  assert.equal(dansSaison(new Date(2026, 11, 15)), true);
  assert.equal(dansSaison(new Date(2026, 11, 16)), false);
});

test("Un samedi en saison est ouvert 8h30 -> split 14h -> coucher", () => {
  // Samedi 2026-08-22 (vérifié : samedi)
  const d = new Date(2026, 7, 22);
  assert.equal(d.getDay(), 6);
  const o = statutOuverture(d);
  assert.equal(o.type, "weekend");
  assert.equal(o.creneaux.length, 2);
  assert.equal(o.creneaux[0].debut, 8.5);
  assert.equal(o.creneaux[1].fin, null); // coucher du soleil
});

test("Un mardi ordinaire en saison est fermé", () => {
  const d = new Date(2026, 7, 25); // mardi
  assert.equal(d.getDay(), 2);
  assert.equal(statutOuverture(d), null);
});

test("Un vendredi de juin est ouvert dès 16h", () => {
  const d = new Date(2026, 5, 5); // vendredi 5 juin 2026
  assert.equal(d.getDay(), 5);
  const o = statutOuverture(d);
  assert.equal(o.type, "vendredi");
  assert.equal(o.creneaux[0].debut, 16);
});

test("Un vendredi hors saison (janvier) est fermé", () => {
  const d = new Date(2026, 0, 9); // vendredi
  assert.equal(statutOuverture(d), null);
});

test("feriesBelges retourne 10 jours fériés fixes/mobiles", () => {
  assert.equal(feriesBelges(2026).length, 10);
});

test("Un jour férié en semaine ouvre comme un week-end (matin + après-midi)", () => {
  const d = new Date(2026, 6, 21); // mardi 21 juillet 2026 = Fête nationale
  assert.equal(d.getDay(), 2);
  const o = statutOuverture(d);
  assert.equal(o.type, "ferie");
  assert.equal(o.creneaux.length, 2);
});

test("Un vendredi hors fenêtre mai-septembre (avril) est fermé même en saison", () => {
  const d = new Date(2026, 3, 3); // vendredi 3 avril 2026, en saison mais avant mai
  assert.equal(d.getDay(), 5);
  assert.equal(statutOuverture(d), null);
});

test("Un vendredi hors fenêtre mai-septembre (octobre) est fermé même en saison", () => {
  const d = new Date(2026, 9, 2); // vendredi 2 octobre 2026
  assert.equal(d.getDay(), 5);
  assert.equal(statutOuverture(d), null);
});

test("Pâques 2027 tombe le 28 mars (vérification croisée sur une 3e année)", () => {
  const p = paques(2027);
  assert.equal(p.getMonth(), 2);
  assert.equal(p.getDate(), 28);
});
