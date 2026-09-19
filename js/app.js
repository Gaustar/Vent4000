// ============================================================
// Vent4000 — Application (UI)
// ============================================================

import { DZ, NIVEAUX_PRESSION, NIVEAUX_AGL, NIVEAUX_PRATIQUE, VOL, LIENS, VERSION } from "./config.js";
import { statutOuverture } from "./ouverture.js";
import { scoreHeure, fenetreSautable, meilleurVerdict, ventPiste, niveauConfiance } from "./scoring.js";
import { estimerSpot } from "./spot.js";
import { comparerPrevisions, doitRemplacerInstantane } from "./tendance.js";
import { chargerMeteo } from "./meteo.js";

// ------------------------------------------------------------
// État & réglages
// ------------------------------------------------------------
const CLE_REGLAGES = "vent4000.reglages";
const CLE_INSTANTANES = "vent4000.instantanes";

const etat = {
  meteo: null,
  jourSelectionne: null,
  heureSelectionnee: null,
  reglages: chargerReglages(),
  instantanes: chargerInstantanes(),
};

function chargerReglages() {
  const defauts = { niveau: "tandem", ventMax: null, plafondMin: null };
  try {
    return { ...defauts, ...JSON.parse(localStorage.getItem(CLE_REGLAGES) || "{}") };
  } catch {
    return defauts;
  }
}

function sauverReglages() {
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(etat.reglages)); } catch { /* mode privé */ }
}

/** Instantanés de prévision par date, pour la tendance entre deux consultations. */
function chargerInstantanes() {
  try {
    return JSON.parse(localStorage.getItem(CLE_INSTANTANES) || "{}");
  } catch {
    return {};
  }
}

function sauverInstantanes() {
  try { localStorage.setItem(CLE_INSTANTANES, JSON.stringify(etat.instantanes)); } catch { /* mode privé */ }
}

/** Seuils effectifs = préréglage du niveau + overrides éventuels. */
function seuilsActifs() {
  const base = NIVEAUX_PRATIQUE[etat.reglages.niveau] ?? NIVEAUX_PRATIQUE.tandem;
  return {
    label: base.label,
    ventMax: etat.reglages.ventMax ?? base.ventMax,
    plafondMin: etat.reglages.plafondMin ?? base.plafondMin,
    ecartRafalesOrange: base.ecartRafalesOrange,
    hauteurOuverture: base.hauteurOuverture,
  };
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

const JOURS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS_FR = ["janv.", "févr.", "mars", "avril", "mai", "juin",
                 "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const VERDICT_TEXTE = {
  vert: "Ça saute",
  orange: "Ça passe juste",
  rouge: "Ça ne saute pas",
};

function dateLocale(isoDate) {
  const [a, m, j] = isoDate.split("-").map(Number);
  return new Date(a, m - 1, j);
}

function heureDe(iso) {
  return iso ? iso.slice(11, 16).replace(":", "h") : "—";
}

function heureDecimale(iso) {
  return parseInt(iso.slice(11, 13), 10) + parseInt(iso.slice(14, 16), 10) / 60;
}

// Les prévisions Open-Meteo sont ancrées sur Europe/Brussels (voir
// meteo.js). On calcule "maintenant" dans le même fuseau plutôt que celui
// de l'appareil : sinon un téléphone réglé sur un autre fuseau (voyage,
// mauvaise config) comparerait des heures incohérentes et pourrait cacher
// ou afficher le mauvais créneau du jour.
const FMT_BRUXELLES = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function partsBruxelles(date = new Date()) {
  return Object.fromEntries(FMT_BRUXELLES.formatToParts(date).map((x) => [x.type, x.value]));
}

/** Heure actuelle décimale, fuseau Europe/Brussels. */
function heureCourante() {
  const p = partsBruxelles();
  return parseInt(p.hour, 10) + parseInt(p.minute, 10) / 60;
}

/** Date du jour au format YYYY-MM-DD, fuseau Europe/Brussels. */
function todayIso() {
  const p = partsBruxelles();
  return `${p.year}-${p.month}-${p.day}`;
}

const CARDINAUX = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
function cardinal(deg) {
  if (deg == null) return "—";
  return CARDINAUX[Math.round(deg / 22.5) % 16];
}

/** "14h → 17h" à partir d'une fenêtre. */
function texteFenetre(f) {
  if (!f || f.debut == null) return null;
  return `${f.debut}h → ${f.fin}h`;
}

function statCell(label, valeur, unite = "", alerte = false) {
  return `<div class="stat${alerte ? " alerte" : ""}">
    <span class="stat-label">${label}</span>
    <span class="stat-valeur">${valeur}${unite ? `<small>${unite}</small>` : ""}</span>
  </div>`;
}

// ------------------------------------------------------------
// Calcul des jours d'ouverture scorés
// ------------------------------------------------------------
function joursOuvertsScores() {
  const seuils = seuilsActifs();
  const resultat = [];
  const maintenant = heureCourante();
  const aujourdhui = todayIso();

  etat.meteo.jours.forEach((jour, index) => {
    const date = dateLocale(jour.date);
    const ouverture = statutOuverture(date);
    if (!ouverture) return;

    const estAujourdhui = jour.date === aujourdhui;
    const coucher = heureDecimale(jour.sunset);
    const ventParHeure = new Map(jour.heures.map((h) => [h.heure, h.vent10]));

    let creneaux = ouverture.creneaux.map((c) => {
      const fin = c.fin ?? coucher;
      const heures = jour.heures
        .filter((h) => h.heure + 1 > c.debut && h.heure < fin)
        .filter((h) => !estAujourdhui || h.heure >= Math.floor(maintenant))
        .map((h) => ({
          h,
          score: scoreHeure({
            ...h,
            ventPrecedent: ventParHeure.get(h.heure - 1),
            echeanceJours: index,
          }, seuils),
        }));
      return {
        ...c,
        heures,
        fenetre: fenetreSautable(heures.map((x) => ({ heure: x.h.heure, verdict: x.score.verdict }))),
      };
    });
    creneaux = creneaux.map((c) => ({ ...c, verdict: c.fenetre.verdict }));

    if (estAujourdhui) creneaux = creneaux.filter((c) => c.heures.length > 0);
    if (estAujourdhui && creneaux.length === 0) return;

    const verdictJour = meilleurVerdict(creneaux.map((c) => c.verdict));
    const toutes = creneaux.flatMap((c) => c.heures);

    resultat.push({
      index,
      date,
      dateIso: jour.date,
      ouverture,
      creneaux,
      verdictJour,
      // Meilleure fenêtre du jour, tous créneaux confondus
      meilleureFenetre: creneaux
        .filter((c) => c.verdict === verdictJour)
        .map((c) => c.fenetre)
        .sort((a, b) => (b.duree ?? 0) - (a.duree ?? 0))[0] ?? null,
      motif: motifDominant(toutes, verdictJour),
      tendance: tendanceDuJour(jour.date, verdictJour, toutes),
      lointain: index >= 5,
      sunset: jour.sunset,
      heures: toutes,
    });
  });

  return resultat;
}

/**
 * Regroupe une raison horaire (qui contient des chiffres propres à l'heure)
 * en un motif lisible et stable, affichable au niveau du jour.
 * « Vent 34 km/h » et « Vent 37 km/h » sont le même motif.
 */
const MOTIFS = [
  [/^Rafales .*seuil/, "Rafales au-dessus du seuil"],
  [/^Rafales \+/,      "Rafales marquées"],
  [/^Vent \d/,         "Vent trop fort"],
  [/^Vent proche/,     "Vent proche du seuil"],
  [/^Vent en hausse/,  "Vent en hausse rapide"],
  [/^Plafond/,         "Plafond trop bas"],
  [/^Couche compacte/, "Couche compacte au largage"],
  [/^Ciel bouché/,     "Ciel bouché"],
  [/^Ciel partiel/,    "Ciel partiellement couvert"],
  [/^Modèles/,         "Modèles météo divergents"],
  [/^Visibilité/,      "Visibilité réduite"],
  [/^Forte proba/,     "Risque de pluie"],
  [/^Risque orageux/,  "Risque orageux"],
  [/^Instabilité/,     "Instabilité (CAPE)"],
  [/^Pluie/,           "Pluie"],
];

function motifRaison(raison) {
  return MOTIFS.find(([re]) => re.test(raison))?.[1] ?? raison;
}

/**
 * Motif le plus fréquent parmi les heures qui portent le verdict du jour.
 * C'est « pourquoi c'est rouge » sans avoir à ouvrir le jour.
 */
function motifDominant(heuresScorees, verdict) {
  if (verdict === "vert") return null;
  const compte = new Map();
  for (const { score } of heuresScorees) {
    if (score.verdict !== verdict) continue;
    for (const r of score.raisons) {
      const motif = motifRaison(r);
      compte.set(motif, (compte.get(motif) ?? 0) + 1);
    }
  }
  if (!compte.size) return null;
  return [...compte.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Compare la prévision du jour à l'instantané conservé localement. */
function tendanceDuJour(dateIso, verdict, heuresScorees) {
  const vents = heuresScorees.map((x) => x.h.vent10).filter((v) => v != null);
  if (!vents.length) return null;
  const vent = Math.round(vents.reduce((a, b) => a + b, 0) / vents.length);
  return comparerPrevisions({ verdict, vent }, etat.instantanes[dateIso]);
}

/** Met à jour les instantanés après rendu (sans écraser une base encore utile). */
function majInstantanes(jours) {
  let modifie = false;
  for (const j of jours) {
    const vents = j.heures.map((x) => x.h.vent10).filter((v) => v != null);
    if (!vents.length) continue;
    if (!doitRemplacerInstantane(etat.instantanes[j.dateIso])) continue;
    etat.instantanes[j.dateIso] = {
      verdict: j.verdictJour,
      vent: Math.round(vents.reduce((a, b) => a + b, 0) / vents.length),
      ts: Date.now(),
    };
    modifie = true;
  }
  // Purge des dates passées pour ne pas laisser grossir le stockage.
  const aujourdhui = todayIso();
  for (const date of Object.keys(etat.instantanes)) {
    if (date < aujourdhui) { delete etat.instantanes[date]; modifie = true; }
  }
  if (modifie) sauverInstantanes();
}

// ------------------------------------------------------------
// Vue Semaine
// ------------------------------------------------------------
function rendreSemaine() {
  const jours = joursOuvertsScores();
  $("#niveau-actif").textContent = seuilsActifs().label;

  rendreHero(jours);

  const conteneur = $("#jours");
  conteneur.innerHTML = "";
  if (jours.length === 0) {
    conteneur.innerHTML = `
      <div class="vide">
        <strong>Aucun jour d'ouverture</strong> dans les 7 prochains jours.
        Le club ouvre les week-ends et jours fériés de mars à mi-décembre,
        plus les vendredis dès 16h de mai à septembre.
      </div>`;
  }

  for (const j of jours) {
    const ligne = document.createElement("button");
    ligne.className = `jour-ligne ${j.verdictJour}${j.lointain ? " lointain" : ""}`;
    const fenetre = texteFenetre(j.meilleureFenetre);
    const info = fenetre
      ? `<span class="jour-fenetre">${fenetre}</span>${j.motif ? `<span class="jour-motif">${j.motif}</span>` : ""}`
      : `<span class="jour-fenetre">Aucune fenêtre</span>${j.motif ? `<span class="jour-motif">${j.motif}</span>` : ""}`;

    ligne.innerHTML = `
      <span class="jour-point"></span>
      <span class="jour-quand">
        <span class="jour-nom">${JOURS_FR[j.date.getDay()]}</span>
        <span class="jour-date">${j.date.getDate()} ${MOIS_FR[j.date.getMonth()]}</span>
      </span>
      <span class="jour-info">${info}</span>
      <span class="jour-marqueurs">
        ${j.ouverture.type === "ferie" ? `<span class="etiq-jour">Férié</span>` : ""}
        ${j.lointain ? `<span class="etiq-jour">Indicatif</span>` : ""}
        ${rendreTendance(j.tendance)}
      </span>`;
    ligne.setAttribute("aria-label",
      `${JOURS_FR[j.date.getDay()]} ${j.date.getDate()} — ${VERDICT_TEXTE[j.verdictJour]}${fenetre ? `, ${fenetre}` : ""}`);
    ligne.addEventListener("click", () => ouvrirJour(j.index));
    conteneur.appendChild(ligne);
  }

  majInstantanes(jours);
}

function rendreTendance(t) {
  if (!t || t.sens === "stable") return "";
  const fleche = t.sens === "amelioration" ? "↗" : "↘";
  const mot = t.sens === "amelioration" ? "s'améliore" : "se dégrade";
  return `<span class="tendance ${t.sens}" title="Depuis ${t.depuisH} h (${t.deltaVent > 0 ? "+" : ""}${t.deltaVent} km/h)">${fleche} ${mot}</span>`;
}

/** Le verdict de tête : la réponse à « quand aller sauter ? ». */
function rendreHero(jours) {
  const hero = $("#hero");
  const sautables = jours.filter((j) => j.verdictJour !== "rouge" && j.meilleureFenetre?.debut != null);
  // Meilleur = vert avant orange, puis le plus tôt possible.
  const meilleur = sautables.sort((a, b) => {
    const rang = { vert: 0, orange: 1 };
    return (rang[a.verdictJour] - rang[b.verdictJour]) || (a.index - b.index);
  })[0];

  if (!meilleur) {
    hero.className = "hero rouge";
    $("#hero-verdict").textContent = "Aucun créneau";
    $("#hero-quand").innerHTML = jours.length
      ? "Rien de sautable sur les jours d'ouverture à venir."
      : "Aucun jour d'ouverture dans les 7 prochains jours.";
    $("#hero-stats").innerHTML = "";
    const motifs = [...new Set(jours.map((j) => j.motif).filter(Boolean))];
    $("#hero-note").textContent = motifs.length ? `Principal facteur : ${motifs[0].toLowerCase()}.` : "";
    return;
  }

  const f = meilleur.meilleureFenetre;
  const dansFenetre = meilleur.heures.filter((x) => x.h.heure >= f.debut && x.h.heure < f.fin);
  const vents = dansFenetre.map((x) => x.h.vent10 ?? 0);
  const rafales = dansFenetre.map((x) => x.h.rafales10 ?? 0);
  const plafonds = dansFenetre.map((x) => x.score.plafond);
  const plafondMin = Math.min(...plafonds);
  const conf = confianceMoyenne(dansFenetre, meilleur.index);

  hero.className = `hero ${meilleur.verdictJour}`;
  $("#hero-verdict").textContent = VERDICT_TEXTE[meilleur.verdictJour];
  $("#hero-quand").innerHTML =
    `<strong>${JOURS_FR[meilleur.date.getDay()]} ${meilleur.date.getDate()} ${MOIS_FR[meilleur.date.getMonth()]}</strong> · ${texteFenetre(f)}`;

  $("#hero-stats").innerHTML = [
    statCell("Vent", `${Math.round(Math.min(...vents))}-${Math.round(Math.max(...vents))}`, "km/h"),
    statCell("Rafales", Math.round(Math.max(...rafales)), "km/h"),
    statCell("Plafond", plafondMin === Infinity ? "Dégagé" : `${plafondMin}`, plafondMin === Infinity ? "" : "m"),
    statCell("Confiance", conf.libelle),
  ].join("");

  const notes = [];
  if (meilleur.motif) notes.push(meilleur.motif.toLowerCase());
  if (meilleur.lointain) notes.push("échéance lointaine, à reconfirmer");
  $("#hero-note").textContent = notes.length ? `À surveiller : ${notes.join(" · ")}.` : "";
}

function confianceMoyenne(heuresScorees, echeanceJours) {
  const niveaux = heuresScorees.map((x) =>
    niveauConfiance(x.h.vent10, [
      { nom: "AROME", vent: x.h.comparaisons?.arome?.vent },
      { nom: "ECMWF", vent: x.h.comparaisons?.ecmwf?.vent },
    ], echeanceJours).niveau);
  const pire = ["faible", "moyenne", "haute", "unique"].find((n) => niveaux.includes(n)) ?? "unique";
  const LIBELLES = { haute: "Haute", moyenne: "Moyenne", faible: "Faible", unique: "1 modèle" };
  return { niveau: pire, libelle: LIBELLES[pire] };
}

// ------------------------------------------------------------
// Vue Jour
// ------------------------------------------------------------
function ouvrirJour(index) {
  etat.jourSelectionne = index;
  etat.heureSelectionnee = null;
  rendreJour();
  basculerVue("jour");
}

function rendreJour() {
  const seuils = seuilsActifs();
  const jour = etat.meteo.jours[etat.jourSelectionne];
  const info = joursOuvertsScores().find((j) => j.index === etat.jourSelectionne);
  if (!jour || !info) return basculerVue("semaine");

  $("#jour-titre").textContent =
    `${JOURS_FR[info.date.getDay()]} ${info.date.getDate()} ${MOIS_FR[info.date.getMonth()]}`;
  $("#jour-soustitre").textContent =
    `${info.ouverture.type === "vendredi" ? "Ouverture dès 16h" : "Ouvert dès 8h30"} → coucher ${heureDe(jour.sunset)}`;

  // Nowcast (aujourd'hui uniquement)
  const actuelEl = $("#actuel");
  const actuel = etat.meteo.actuel;
  if (actuel && jour.date === todayIso()) {
    actuelEl.hidden = false;
    actuelEl.innerHTML =
      `<span class="actuel-point"></span> Maintenant <strong>${Math.round(actuel.vent ?? 0)}</strong> km/h ·
       rafales <strong>${Math.round(actuel.rafales ?? 0)}</strong> · ${cardinal(actuel.direction)} · <strong>${Math.round(actuel.temp ?? 0)}</strong>°C`;
  } else {
    actuelEl.hidden = true;
  }

  // Verdict du jour
  const bloc = $("#jour-verdict");
  bloc.className = `hero hero-compact ${info.verdictJour}`;
  $("#jour-verdict-texte").textContent = VERDICT_TEXTE[info.verdictJour];
  const fenetre = texteFenetre(info.meilleureFenetre);
  $("#jour-verdict-quand").innerHTML = fenetre
    ? `Fenêtre <strong>${fenetre}</strong>${info.motif ? ` · ${info.motif.toLowerCase()}` : ""}`
    : (info.motif ?? "Aucune fenêtre de 2 h consécutives");

  $("#jour-creneaux").innerHTML = info.creneaux
    .map((c) => {
      const f = texteFenetre(c.fenetre);
      return `<span class="badge ${c.verdict}">${c.label}${f ? ` · ${f}` : ""}</span>`;
    })
    .join("");

  // Timeline
  const toutes = info.creneaux.flatMap((c) => c.heures);
  const timeline = $("#timeline");
  timeline.innerHTML = "";

  if (etat.heureSelectionnee === null && toutes.length) {
    const idx = toutes.findIndex((x) => x.score.verdict === "vert");
    const idx2 = idx >= 0 ? idx : toutes.findIndex((x) => x.score.verdict === "orange");
    etat.heureSelectionnee = toutes[idx2 >= 0 ? idx2 : 0].h.heure;
  }

  const estAujourdhui = jour.date === todayIso();
  const heureActuelle = Math.floor(heureCourante());

  for (const { h, score } of toutes) {
    const estMaintenant = estAujourdhui && h.heure === heureActuelle;
    const chip = document.createElement("button");
    chip.className = `chip ${score.verdict}${h.heure === etat.heureSelectionnee ? " actif" : ""}`;
    const rotation = (h.direction10 ?? 0) + 180;
    chip.innerHTML = `
      ${estMaintenant ? `<span class="chip-maintenant">MAINTENANT</span>` : ""}
      <span class="chip-h">${h.heure}h</span>
      <span class="chip-pastille"></span>
      <span class="chip-fleche" style="transform:rotate(${rotation}deg)">➤</span>
      <span class="chip-v">${Math.round(h.vent10 ?? 0)}</span>
      <span class="chip-r">raf ${Math.round(h.rafales10 ?? 0)}</span>`;
    chip.title = `${h.heure}h — vent du ${cardinal(h.direction10)} · ${score.raisons.join(" · ") || "Conditions favorables"}`;
    chip.addEventListener("click", () => {
      etat.heureSelectionnee = h.heure;
      rendreJour();
    });
    timeline.appendChild(chip);
  }

  const chipActif = timeline.querySelector(".chip.actif");
  if (chipActif) chipActif.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });

  const sel = toutes.find((x) => x.h.heure === etat.heureSelectionnee) ?? toutes[0];
  if (sel) rendreDetailHeure(sel.h, sel.score, seuils, info.index);
}

function rendreDetailHeure(h, score, seuils, echeanceJours) {
  // Raisons, typées par sévérité
  const classe = score.verdict === "rouge" ? "bloquant" : "degradant";
  $("#raisons").innerHTML = score.raisons.length
    ? score.raisons.map((r) => `<li class="${classe}">${r}</li>`).join("")
    : `<li class="ok">Conditions favorables pour « ${seuils.label} »</li>`;

  // Confiance
  const confiance = niveauConfiance(h.vent10, [
    { nom: "AROME", vent: h.comparaisons?.arome?.vent },
    { nom: "ECMWF", vent: h.comparaisons?.ecmwf?.vent },
  ], echeanceJours);
  const LABELS = {
    haute: ["Confiance haute", `${confiance.nModeles} modèles s'accordent (écart max ${confiance.ecart} km/h)`],
    moyenne: ["Confiance moyenne", `${confiance.nModeles} modèles proches (écart max ${confiance.ecart} km/h)`],
    faible: ["Confiance faible", `${confiance.nModeles} modèles divergent (écart max ${confiance.ecart} km/h) — à revérifier`],
    unique: ["Modèle unique", "comparaison indisponible pour cette heure"],
  };
  const [titre, detail] = LABELS[confiance.niveau];
  const penalite = confiance.penalite > 0 ? ` · échéance J+${echeanceJours} prise en compte` : "";
  $("#confiance").className = `confiance confiance-${confiance.niveau}`;
  $("#confiance").innerHTML = `<strong>${titre}</strong><span>${detail}${penalite}</span>`;

  // Profil vertical
  const profil = $("#profil");
  profil.innerHTML = "";
  for (const { hpa, role } of NIVEAUX_PRESSION) {
    const n = h.niveaux[hpa];
    profil.appendChild(ligneProfil({
      altitude: n?.agl != null ? `${n.agl} m` : `~${hpa} hPa`,
      role, vent: n?.vent, dir: n?.dir, temp: n?.temp,
    }));
  }
  for (const m of NIVEAUX_AGL) {
    const n = h.niveauxAGL?.[m];
    profil.appendChild(ligneProfil({
      altitude: `${m} m`,
      role: m === 180 ? "Basse couche" : "",
      vent: n?.vent, dir: n?.dir, temp: null,
    }));
  }
  profil.appendChild(ligneProfil({
    altitude: "Sol",
    role: `Rafales ${Math.round(h.rafales10 ?? 0)} km/h`,
    vent: h.vent10, dir: h.direction10, temp: h.t2m, sol: true,
  }));

  // Spot / dérive
  const spot = estimerSpot(h, seuils.hauteurOuverture, DZ.altitudeLargage);
  $("#spot").innerHTML = [
    statCell("Sous voile", formatDistance(spot.voile.distance), cardinal(spot.voile.cap)),
    statCell("En chute", formatDistance(spot.chute.distance), cardinal(spot.chute.cap)),
    statCell("Dérive totale", formatDistance(spot.total.distance), cardinal(spot.total.cap)),
    statCell("Largage", `${String(spot.pointLargage.cap).padStart(3, "0")}°`, cardinal(spot.pointLargage.cap)),
  ].join("");
  $("#spot-note").textContent =
    `Estimation : ouverture ${seuils.hauteurOuverture} m, largage ${DZ.altitudeLargage} m, ` +
    `taux de chute ${VOL.tauxChuteVoile} m/s sous voile et ${VOL.vitesseChuteLibre} m/s en chute, sans pilotage. ` +
    `« Largage » = cap à remonter depuis la zone de poser. Le largueur et la manche à air restent la référence.`;

  // Boussole (axe piste + vent + dérive)
  rendreBoussole(h.direction10 ?? 0, h.vent10 ?? 0, spot.total.cap);
  const vp = ventPiste(h.vent10 ?? 0, h.direction10 ?? 0);
  $("#crosswind").innerHTML = `
    <div class="ligne"><span>Vent au sol</span><strong>${cardinal(h.direction10)} ${Math.round(h.direction10 ?? 0)}°</strong></div>
    <div class="ligne"><span>Traversier</span><strong>${vp.traversier} km/h</strong></div>
    <div class="ligne"><span>De face</span><strong>${vp.face} km/h</strong></div>
    <span class="note">Axe piste ${String(DZ.qfu).padStart(3, "0")}° / ${DZ.qfu + 180}°.
    Indicatif : sous voile on atterrit face à la manche à air, pas dans l'axe de piste.</span>`;

  // Détails
  const plafondTxt = score.plafond === Infinity ? "Dégagé" : `~${score.plafond} m`;
  $("#details").innerHTML = [
    ["Vent / direction", `${Math.round(h.vent10 ?? 0)} km/h ${cardinal(h.direction10)}`],
    ["Plafond estimé", plafondTxt, score.plafond !== Infinity && score.plafond < seuils.plafondMin],
    ["Nuages bas / moy / hauts", `${h.nuagesBas ?? 0}/${h.nuagesMoyens ?? 0}/${h.nuagesHauts ?? 0}%`,
      (h.nuagesMoyens ?? 0) >= 85 || (h.nuagesBas ?? 0) >= 85],
    ["Proba. pluie", `${h.probaPluie ?? 0} %`],
    ["Visibilité", h.visibilite != null ? `${(h.visibilite / 1000).toFixed(0)} km` : "—"],
    ["CAPE", h.cape != null ? `${Math.round(h.cape)} J/kg` : "—"],
    ["T° au largage", h.niveaux[600]?.temp != null ? `${Math.round(h.niveaux[600].temp)} °C` : "—",
      h.niveaux[600]?.temp != null && h.niveaux[600].temp <= -5],
  ].map(([label, valeur, alerte]) =>
    `<div class="detail${alerte ? " alerte" : ""}"><span>${label}</span><strong>${valeur}</strong></div>`
  ).join("");
}

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function ligneProfil({ altitude, role, vent, dir, temp, sol = false }) {
  const div = document.createElement("div");
  div.className = `niveau${sol ? " sol" : ""}`;
  const rotation = dir != null ? dir + 180 : 0;
  div.innerHTML = `
    <div class="niv-alt"><strong>${altitude}</strong><span>${role}</span></div>
    <div class="niv-fleche" title="${dir != null ? Math.round(dir) + "°" : ""}">
      <span class="fleche-icone" style="transform: rotate(${rotation}deg)">➤</span>
      <span class="fleche-cardinal">${cardinal(dir)}</span>
    </div>
    <div class="niv-vent">${vent != null ? Math.round(vent) : "—"}<span>km/h</span></div>
    <div class="niv-temp">${temp != null ? Math.round(temp) : "—"}<span>°C</span></div>`;
  return div;
}

/** Boussole : axe de piste, vent au sol (plein) et dérive estimée (pointillé). */
function rendreBoussole(direction, vitesse, capDerive) {
  const svg = $("#boussole");
  const versOu = direction + 180;
  svg.innerHTML = `
    <circle cx="60" cy="60" r="54" class="b-cercle"/>
    <text x="60" y="16" class="b-cardinal">N</text>
    <text x="107" y="64" class="b-cardinal">E</text>
    <text x="60" y="112" class="b-cardinal">S</text>
    <text x="13" y="64" class="b-cardinal">O</text>
    <g transform="rotate(${DZ.qfu} 60 60)">
      <rect x="55" y="14" width="10" height="92" rx="3" class="b-piste"/>
      <line x1="60" y1="20" x2="60" y2="100" class="b-axe"/>
    </g>
    <g transform="rotate(${capDerive} 60 60)">
      <line x1="60" y1="60" x2="60" y2="30" class="b-derive"/>
      <polygon points="60,20 55,32 65,32" class="b-derive-pointe"/>
    </g>
    <g transform="rotate(${versOu} 60 60)">
      <line x1="60" y1="60" x2="60" y2="26" class="b-vent" style="stroke-width:${Math.min(6, 2 + vitesse / 10)}"/>
      <polygon points="60,16 54,28 66,28" class="b-pointe"/>
    </g>
    <circle cx="60" cy="60" r="4" class="b-centre"/>`;
}

// ------------------------------------------------------------
// Réglages
// ------------------------------------------------------------
function rendreReglages() {
  const select = $("#reglage-niveau");
  select.innerHTML = Object.entries(NIVEAUX_PRATIQUE)
    .map(([cle, n]) => `<option value="${cle}"${cle === etat.reglages.niveau ? " selected" : ""}>${n.label}</option>`)
    .join("");

  const base = NIVEAUX_PRATIQUE[etat.reglages.niveau] ?? NIVEAUX_PRATIQUE.tandem;
  $("#reglage-vent").value = etat.reglages.ventMax ?? base.ventMax;
  $("#reglage-plafond").value = etat.reglages.plafondMin ?? base.plafondMin;
}

function brancherReglages() {
  $("#reglage-niveau").addEventListener("change", (e) => {
    etat.reglages.niveau = e.target.value;
    etat.reglages.ventMax = null;
    etat.reglages.plafondMin = null;
    sauverReglages();
    rendreReglages();
    rendreSemaine();
  });
  $("#reglage-vent").addEventListener("change", (e) => {
    etat.reglages.ventMax = Math.max(5, Math.min(60, Number(e.target.value) || 0));
    sauverReglages();
    rendreSemaine();
  });
  $("#reglage-plafond").addEventListener("change", (e) => {
    etat.reglages.plafondMin = Math.max(300, Math.min(4000, Number(e.target.value) || 0));
    sauverReglages();
    rendreSemaine();
  });
  $("#reglage-reset").addEventListener("click", () => {
    etat.reglages.ventMax = null;
    etat.reglages.plafondMin = null;
    sauverReglages();
    rendreReglages();
    rendreSemaine();
  });
}

// ------------------------------------------------------------
// Navigation & thème
// ------------------------------------------------------------
function basculerVue(nom) {
  for (const v of ["semaine", "jour", "reglages"]) {
    $(`#vue-${v}`).hidden = v !== nom;
  }
  window.scrollTo({ top: 0 });
}

/** Thème auto : planche de bord sombre la nuit, variante claire de jour. */
function appliquerTheme() {
  let nuit;
  const aujourdHui = etat.meteo?.jours?.[0];
  const hd = heureCourante();
  if (aujourdHui?.sunrise && aujourdHui?.sunset) {
    nuit = hd < heureDecimale(aujourdHui.sunrise) || hd > heureDecimale(aujourdHui.sunset);
  } else {
    nuit = hd < 7 || hd >= 21;
  }
  document.documentElement.dataset.theme = nuit ? "nuit" : "jour";
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", nuit ? "#0b1016" : "#e9eef4");
}

// ------------------------------------------------------------
// Fraîcheur des données
// ------------------------------------------------------------
const AGE_PERIME_MIN = 90;

function afficherFraicheur(recupereLeIso) {
  const recupereLe = new Date(recupereLeIso);
  const ageMin = (Date.now() - recupereLe.getTime()) / 60000;
  const heureTxt = recupereLe.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
  const maj = $("#maj");
  if (ageMin > AGE_PERIME_MIN) {
    maj.innerHTML = `⚠️ <strong>Prévisions non rafraîchies depuis ${Math.round(ageMin / 60)} h</strong> (dernier succès réseau à ${heureTxt}) — vérifie ta connexion avant de te fier au verdict.`;
    maj.classList.add("perime");
  } else {
    maj.textContent = `Open-Meteo · ICON-D2 + AROME + ECMWF · mis à jour à ${heureTxt}`;
    maj.classList.remove("perime");
  }
}

// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------
async function init() {
  appliquerTheme();

  $("#lien-gmaps").href = LIENS.gmaps;
  $("#lien-irm").href = LIENS.irm;
  $("#lien-windy").href = LIENS.windy;
  $("#lien-club").href = LIENS.club;
  $("#lien-briefing").href = LIENS.briefing;
  $("#lien-briefing-jour").href = LIENS.briefing;
  $("#version").textContent = `v${VERSION}`;

  const ouvrirReglages = () => { rendreReglages(); basculerVue("reglages"); };
  $("#btn-retour").addEventListener("click", () => basculerVue("semaine"));
  $("#btn-reglages").addEventListener("click", ouvrirReglages);
  $("#btn-niveau").addEventListener("click", ouvrirReglages);
  $("#btn-reglages-retour").addEventListener("click", () => basculerVue("semaine"));
  brancherReglages();

  try {
    etat.meteo = await chargerMeteo();
    appliquerTheme();
    afficherFraicheur(etat.meteo.recupereLe);
    rendreSemaine();
    $("#chargement").hidden = true;
    $("#vue-semaine").hidden = false;
  } catch (err) {
    $("#chargement").innerHTML = `
      <p><strong>Impossible de charger la météo.</strong></p>
      <p>${err.message}</p>
      <button class="btn" onclick="location.reload()">Réessayer</button>`;
    console.error(err);
  }
}

init();

// ------------------------------------------------------------
// Service worker & mise à jour automatique
//
// L'app tourne aussi dans une TWA Android, qui garde la page vivante
// entre deux ouvertures : fermer puis rouvrir l'app ne déclenche PAS de
// nouvelle navigation. Sans les deux mécanismes ci-dessous, rien ne
// vérifie jamais qu'une version plus récente est en ligne et l'app reste
// figée indéfiniment sur la version mise en cache.
// ------------------------------------------------------------
if ("serviceWorker" in navigator) {
  // Suivi du contrôleur courant. À la toute première visite il n'y en a
  // pas : la première prise de contrôle ne doit pas recharger (la page
  // affiche déjà la bonne version). En revanche tout changement SUIVANT
  // signifie qu'une nouvelle version vient de s'activer — y compris dans
  // la même session, d'où le fait de réaffecter la variable plutôt que de
  // figer un booléen au chargement.
  let controleurConnu = navigator.serviceWorker.controller;
  let rechargeEnCours = false;

  // 2e temps : le nouveau service worker prend la main (skipWaiting +
  // clients.claim) -> on recharge pour afficher réellement la nouvelle
  // version.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controleurConnu) {
      controleurConnu = navigator.serviceWorker.controller;
      return;
    }
    if (rechargeEnCours) return;
    rechargeEnCours = true;
    location.reload();
  });

  // updateViaCache "none" : le script du service worker lui-même n'est
  // jamais relu depuis le cache HTTP (max-age=600 sur GitHub Pages).
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
    // 1er temps : on cherche activement une mise à jour chaque fois que
    // l'app revient au premier plan — seul signal fiable dans une TWA, où
    // la page peut ne jamais être rechargée. On écoute trois événements
    // car selon les versions d'Android et de Chrome, la reprise d'une TWA
    // ne déclenche pas toujours le même : visibilitychange (cas courant),
    // pageshow (retour depuis le bfcache), focus (reprise de la fenêtre).
    let derniereVerif = 0;
    const chercherMaj = () => {
      if (document.hidden) return;
      // Garde-fou : pas plus d'une vérification par minute, ces trois
      // événements pouvant se déclencher ensemble sur une même reprise.
      if (Date.now() - derniereVerif < 60000) return;
      derniereVerif = Date.now();
      reg.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", chercherMaj);
    window.addEventListener("pageshow", chercherMaj);
    window.addEventListener("focus", chercherMaj);
    chercherMaj();
  }).catch(() => {});
}
