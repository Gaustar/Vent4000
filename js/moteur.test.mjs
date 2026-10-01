// Tests du moteur v2.0 : METAR, analyse nuageuse, probabilité, facteurs,
// et leur combinaison dans scoreHeure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetar, ageMetar } from "./metar.js";
import { analyseNuages } from "./nuages.js";
import { scenarioPasse, probabiliteSaut, poidsEnsemble, confianceProba, critereLimitant, accordCoucheBasse } from "./probabilite.js";
import { evaluerFacteurs, separationGroupes, temperatureA, decrireCode } from "./facteurs.js";
import { scoreHeure } from "./scoring.js";
import { NIVEAUX_PRATIQUE, MODELES, LEGAL_BE } from "./config.js";

const TANDEM = NIVEAUX_PRATIQUE.tandem;
const CD = NIVEAUX_PRATIQUE.brevetCD;
const MAINTENANT = new Date(Date.UTC(2026, 9, 1, 13, 20));

/** Niveaux de pression : [hPa, agl, couverture %, température °C, vent, dir]. */
function niveaux(rows) {
  return Object.fromEntries(rows.map(([p, agl, nuages, temp, vent = 20, dir = 250]) =>
    [p, { agl, nuages, temp, vent, dir, humidite: null }]));
}
const PROFIL_CLAIR = niveaux([
  [975, 200, 0, 15], [950, 420, 0, 13], [925, 650, 0, 12], [900, 880, 0, 10],
  [850, 1380, 0, 7], [800, 1880, 0, 4], [700, 2960, 0, -1], [600, 4180, 0, -6],
]);

function heure(o = {}) {
  return {
    vent10: 10, rafales10: 14, direction10: 240, t2m: 18, pointRosee: 8,
    precip: 0, probaPluie: 5, codeTemps: 1, nuagesTotal: 10, nuagesBas: 0, nuagesMoyens: 0, nuagesHauts: 0,
    visibilite: 30000, cape: 0, cin: 0, li: null, eclairs: 0, isoZero: 3200, coucheLimite: 600,
    niveaux: PROFIL_CLAIR, niveauxAGL: { 80: { vent: 15, dir: 245 }, 180: { vent: 18, dir: 250 } },
    modeles: {}, ensemble: [],
    ...o,
  };
}

/** Votes : n modèles favorables / défavorables sur les rafales. */
function modeles(rafales) {
  return Object.fromEntries(MODELES.map((m, i) => [m.id, { vent: 10, rafales: rafales[i] ?? 14, precip: 0, nuagesBas: 0 }]));
}

// ---------------- METAR ----------------

test("parseMetar : vent, rafales en km/h, visibilité, nuages, plafond", () => {
  const m = parseMetar("EBCI 011250Z 25012G25KT 200V320 8000 FEW012 BKN025 OVC040 21/11 Q1024 NOSIG", MAINTENANT);
  assert.equal(m.station, "EBCI");
  assert.equal(m.obs.toISOString(), "2026-10-01T12:50:00.000Z");
  assert.equal(m.dir, 250);
  assert.equal(m.vent, 22);   // 12 kt
  assert.equal(m.rafales, 46); // 25 kt
  assert.equal(m.variable, true);
  assert.equal(m.visibilite, 8000);
  assert.equal(m.plafond, 762); // BKN025 = 2500 ft
  assert.equal(m.temp, 21);
  assert.equal(ageMetar(m, MAINTENANT), 30);
});

test("parseMetar : CAVOK, temps présent, orage et CB, tendance ignorée", () => {
  const cavok = parseMetar("EBCI 011250Z 09005KT CAVOK 21/11 Q1024 TEMPO 3000 TSRA", MAINTENANT);
  assert.equal(cavok.visibilite, 10000);
  assert.equal(cavok.plafond, Infinity);
  assert.equal(cavok.orage, false, "le TEMPO n'est pas une observation");
  const ts = parseMetar("EBCI 011250Z 24015KT 4000 +TSRA SCT020CB 18/16 Q1010", MAINTENANT);
  assert.equal(ts.orage, true);
  assert.equal(ts.precip, true);
  assert.equal(ts.cb, true);
  const fg = parseMetar("METAR EBCI 010650Z 00000KT 0300 FG VV001 10/10 Q1024", MAINTENANT);
  assert.equal(fg.brouillard, true);
  assert.equal(fg.plafond, 30);
  assert.equal(parseMetar(null), null);
  assert.equal(parseMetar("n'importe quoi"), null);
});

test("parseMetar : observation datée de la fin du mois précédent", () => {
  const m = parseMetar("EBCI 302350Z 24008KT 9999 FEW030 12/08 Q1020", new Date(Date.UTC(2026, 9, 1, 0, 10)));
  assert.equal(m.obs.toISOString(), "2026-09-30T23:50:00.000Z");
});

// ---------------- Nuages ----------------

test("analyseNuages : profil clair -> pas de plafond, largage à 4000 m", () => {
  const n = analyseNuages(heure());
  assert.equal(n.plafond, Infinity);
  assert.equal(n.largagePossible, 4000);
  assert.equal(n.source, "profil");
});

test("analyseNuages : couche à 900-850 hPa -> base interpolée, largage sous la couche", () => {
  const n = analyseNuages(heure({
    nuagesBas: 80,
    niveaux: niveaux([[975, 200, 0, 15], [950, 420, 0, 13], [925, 650, 20, 12], [900, 880, 100, 10],
                     [850, 1380, 90, 7], [800, 1880, 10, 4], [700, 2960, 0, -1], [600, 4180, 0, -6]]),
  }));
  assert.equal(n.couches.length, 1);
  // 20 % à 650 m, 100 % à 880 m : le seuil de 60 % est franchi à mi-chemin.
  assert.equal(n.plafond, 765);
  assert.equal(n.largagePossible, 615);
});

test("analyseNuages : couche « fantôme » dérivée de l'humidité, démentie par la couverture basse du modèle -> ignorée", () => {
  const n = analyseNuages(heure({
    nuagesBas: 15,
    niveaux: niveaux([[975, 200, 0, 15], [950, 420, 95, 13], [925, 650, 0, 12], [900, 880, 0, 10],
                     [850, 1380, 0, 7], [800, 1880, 0, 4], [700, 2960, 0, -1], [600, 4180, 0, -6]]),
  }));
  assert.equal(n.plafond, Infinity);
});

test("analyseNuages : niveau sous 100 m AGL ignoré (brume de surface, pas un plafond)", () => {
  const n = analyseNuages(heure({
    nuagesBas: 70,
    niveaux: { ...PROFIL_CLAIR, 1000: { agl: 5, nuages: 90, temp: 16, vent: 5, dir: 200 } },
    t2m: 18, pointRosee: 2, // base de convection ~1950 m
  }));
  assert.ok(n.plafond > 1000, `plafond ${n.plafond}`);
});

test("analyseNuages : givrage = couche entre 0 et -15 °C sous l'altitude de largage", () => {
  const n = analyseNuages(heure({
    nuagesMoyens: 90,
    niveaux: niveaux([[975, 200, 0, 5], [950, 420, 0, 4], [925, 650, 0, 3], [900, 880, 0, 2],
                     [850, 1380, 0, 0], [800, 1880, 0, -2], [700, 2960, 95, -6], [600, 4180, 95, -12]]),
  }));
  assert.equal(n.givrage, true);
  assert.ok(n.plafond > 1880 && n.plafond < 2960);
});

// ---------------- Probabilité ----------------

test("scenarioPasse : chaque critère échoue séparément", () => {
  assert.deepEqual(scenarioPasse({ vent: 10, rafales: 20, precip: 0, nuagesBas: 0 }, TANDEM), { passe: true, echecs: [] });
  assert.deepEqual(scenarioPasse({ vent: 10, rafales: 35, precip: 0, nuagesBas: 0 }, TANDEM).echecs, ["rafales"]);
  assert.deepEqual(scenarioPasse({ vent: 10, rafales: 20, precip: 1, nuagesBas: 0 }, TANDEM).echecs, ["pluie"]);
  assert.deepEqual(scenarioPasse({ vent: 10, rafales: 20, precip: 0, nuagesBas: 90 }, TANDEM).echecs, ["nuages"]);
  // Le vent moyen légal s'applique même au niveau le plus permissif.
  assert.ok(scenarioPasse({ vent: LEGAL_BE.ventMoyenMaxSol + 1, rafales: 40, precip: 0 }, { ventMax: 99 }).echecs.includes("vent"));
});

test("probabiliteSaut : vote pondéré — les modèles 2 km pèsent plus que les globaux", () => {
  // Les 3 modèles haute résolution disent non, les 4 globaux oui.
  const p = probabiliteSaut(heure({ modeles: modeles([40, 40, 40, 14, 14, 14, 14]) }), TANDEM);
  assert.equal(p.p, 8 / 17);
  assert.equal(critereLimitant(p), "rafales");
});

test("probabiliteSaut : chaque ensemble pèse autant quel que soit son nombre de membres", () => {
  const ens = [
    ...Array.from({ length: 50 }, () => ({ ens: "ecmwf_ifs025", vent: 10, rafales: 14, precip: 0, nuagesBas: null })),
    ...Array.from({ length: 10 }, () => ({ ens: "gfs025", vent: 10, rafales: 40, precip: 0, nuagesBas: null })),
  ];
  const p = probabiliteSaut(heure({ ensemble: ens }), TANDEM, 0);
  assert.ok(Math.abs(p.p - 0.5) < 1e-9, `p = ${p.p}`);
  assert.deepEqual(p.ensemble, { passe: 50, total: 60 });
});

test("poidsEnsemble : croît avec l'échéance, plafonné", () => {
  assert.equal(poidsEnsemble(0), 6);
  assert.equal(poidsEnsemble(1), 6);
  assert.equal(poidsEnsemble(3), 10);
  assert.equal(poidsEnsemble(9), 14);
});

test("probabiliteSaut : aucune donnée -> null ; confiance selon la netteté du consensus", () => {
  assert.equal(probabiliteSaut(heure(), TANDEM), null);
  assert.equal(confianceProba(null), "unique");
  assert.equal(confianceProba({ p: 0.95 }), "haute");
  assert.equal(confianceProba({ p: 0.05 }), "haute");
  assert.equal(confianceProba({ p: 0.75 }), "moyenne");
  assert.equal(confianceProba({ p: 0.5 }), "faible");
});

test("accordCoucheBasse : part pondérée des modèles qui voient une couche basse", () => {
  const m = modeles([]);
  m.icon_d2.nuagesBas = 90;
  assert.equal(accordCoucheBasse(heure({ modeles: m })).part, 3 / 17);
});

// ---------------- Facteurs ----------------

const statut = (fs, id) => fs.find((x) => x.id === id)?.statut;

test("facteurs : conditions idéales -> aucun facteur limite ni bloquant", () => {
  const fs = evaluerFacteurs(heure(), TANDEM);
  assert.deepEqual(fs.filter((x) => x.statut === "limite" || x.statut === "bloquant"), []);
  for (const id of ["ventSol", "rafales", "cisaillement", "ventOuverture", "ventLargage", "plafond", "visibilite", "pluie", "orage", "froid", "givrage"]) {
    assert.ok(fs.some((x) => x.id === id), `facteur ${id} présent`);
  }
});

test("facteurs : gradient de vent marqué entre 10 m et la basse couche -> limite", () => {
  const fs = evaluerFacteurs(heure({ vent10: 8, direction10: 200, niveauxAGL: { 180: { vent: 35, dir: 260 } } }), TANDEM);
  assert.equal(statut(fs, "cisaillement"), "limite");
});

test("facteurs : vent très fort au largage -> limite, avec séparation entre groupes", () => {
  const prof = niveaux([[975, 200, 0, 15], [850, 1380, 0, 7], [700, 2960, 0, -1, 80], [600, 4180, 0, -6, 110]]);
  const fs = evaluerFacteurs(heure({ niveaux: prof }), CD);
  const x = fs.find((f) => f.id === "ventLargage");
  assert.equal(x.statut, "limite");
  assert.match(x.motif, /séparation ~\d+ s/);
  assert.ok(separationGroupes(110) > separationGroupes(20));
});

test("facteurs : orage, éclairs, CAPE verrouillée par la CIN", () => {
  assert.equal(statut(evaluerFacteurs(heure({ codeTemps: 95 }), TANDEM), "orage"), "bloquant");
  assert.equal(statut(evaluerFacteurs(heure({ eclairs: 2 }), TANDEM), "orage"), "bloquant");
  assert.equal(statut(evaluerFacteurs(heure({ eclairs: 0.2 }), TANDEM), "orage"), "limite");
  assert.equal(statut(evaluerFacteurs(heure({ cape: 1000 }), TANDEM), "orage"), "bloquant");
  assert.equal(statut(evaluerFacteurs(heure({ cape: 1000, cin: 250 }), TANDEM), "orage"), "limite");
});

test("facteurs : brouillard, bruine, froid, thermiques (élève uniquement)", () => {
  assert.equal(statut(evaluerFacteurs(heure({ codeTemps: 45, visibilite: 2000 }), TANDEM), "visibilite"), "bloquant");
  assert.equal(statut(evaluerFacteurs(heure({ codeTemps: 45, visibilite: 6000 }), TANDEM), "visibilite"), "limite");
  assert.equal(statut(evaluerFacteurs(heure({ codeTemps: 51, precip: 0.1 }), TANDEM), "pluie"), "limite");
  const froid = niveaux([[975, 200, 0, 0], [700, 2960, 0, -12], [600, 4180, 0, -20]]);
  assert.equal(statut(evaluerFacteurs(heure({ niveaux: froid }), TANDEM), "froid"), "limite");
  assert.ok(temperatureA(heure({ niveaux: froid }), 4000) < -15);
  const thermique = { coucheLimite: 2000, cape: 300 };
  assert.equal(statut(evaluerFacteurs(heure(thermique), NIVEAUX_PRATIQUE.aff), "thermique"), "limite");
  assert.equal(statut(evaluerFacteurs(heure(thermique), CD), "thermique"), "info");
  assert.equal(decrireCode(63), "Pluie");
});

test("facteurs : observation METAR de l'heure en cours (rafales observées au-dessus du seuil -> bloquant)", () => {
  const metar = parseMetar("EBCI 011250Z 24015G28KT 9999 FEW030 18/10 Q1015", MAINTENANT);
  const fs = evaluerFacteurs(heure({ metar, metarDecalage: 0, maintenant: MAINTENANT }), TANDEM);
  const obs = fs.find((x) => x.id === "observation");
  assert.equal(obs.statut, "bloquant");
  assert.match(obs.motif, /Charleroi observe 52 km\/h en rafales/);
  // Pour l'heure suivante, l'observation ne crée pas de facteur.
  const fs2 = evaluerFacteurs(heure({ metar, metarDecalage: 1, maintenant: MAINTENANT }), TANDEM);
  assert.equal(fs2.some((x) => x.id === "observation"), false);
});

// ---------------- Combinaison (scoreHeure) ----------------

test("scoreHeure : rafale du modèle principal au-dessus du seuil, mais 8 modèles sur 10 d'accord pour sauter -> orange arbitré, pas rouge", () => {
  const s = scoreHeure(heure({ rafales10: 32, modeles: modeles([32, 14, 14, 14, 14, 14, 14]) }), TANDEM);
  assert.equal(s.verdict, "orange");
  assert.ok(s.facteurs.find((x) => x.id === "rafales").arbitre);
  assert.ok(s.raisons.some((r) => r.includes("% des modèles favorables")));
});

test("scoreHeure : probabilité sous 35 % -> rouge même si le modèle principal est calme", () => {
  const s = scoreHeure(heure({ modeles: modeles([14, 40, 40, 40, 40, 40, 40]) }), TANDEM);
  assert.equal(s.verdict, "rouge");
  assert.match(s.raisons[0], /^Probabilité de saut \d+ % — en cause : rafales/);
});

test("scoreHeure : probabilité entre 35 et 70 % -> orange ; ≥ 70 % et rien de limite -> vert", () => {
  assert.equal(scoreHeure(heure({ modeles: modeles([14, 14, 14, 40, 40, 40, 40]) }), TANDEM).verdict, "orange");
  const v = scoreHeure(heure({ modeles: modeles([]) }), TANDEM);
  assert.equal(v.verdict, "vert");
  assert.equal(v.chance, 1);
});

test("scoreHeure : un blocage FERME (orage) n'est jamais arbitré par le vote", () => {
  const s = scoreHeure(heure({ codeTemps: 96, modeles: modeles([]) }), TANDEM);
  assert.equal(s.verdict, "rouge");
  assert.equal(s.chance, 0);
});

test("scoreHeure : plafond bas du seul modèle principal, démenti par la majorité des modèles -> orange", () => {
  const prof = niveaux([[975, 200, 0, 15], [950, 420, 100, 13], [925, 650, 100, 12], [900, 880, 0, 10],
                       [850, 1380, 0, 7], [800, 1880, 0, 4], [700, 2960, 0, -1], [600, 4180, 0, -6]]);
  const base = { nuagesBas: 90, niveaux: prof };
  assert.equal(scoreHeure(heure(base), TANDEM).verdict, "rouge", "sans arbitrage");
  const s = scoreHeure(heure({ ...base, modeles: modeles([]) }), TANDEM);
  assert.equal(s.verdict, "orange");
  assert.match(s.raisons.join(" "), /couche basse prévue par 0 % des modèles/);
});

test("scoreHeure : plafond bas prévu mais Charleroi n'observe aucun plafond (heure en cours) -> orange", () => {
  const prof = niveaux([[975, 200, 0, 15], [950, 420, 100, 13], [925, 650, 100, 12], [900, 880, 0, 10],
                       [850, 1380, 0, 7], [800, 1880, 0, 4], [700, 2960, 0, -1], [600, 4180, 0, -6]]);
  const metar = parseMetar("EBCI 011250Z 24008KT 9999 FEW035 18/10 Q1015", MAINTENANT);
  const s = scoreHeure(heure({ nuagesBas: 90, niveaux: prof, metar, metarDecalage: 0, maintenant: MAINTENANT }), TANDEM);
  assert.equal(s.verdict, "orange");
  assert.match(s.raisons.join(" "), /Charleroi n'observe aucun plafond/);
});
