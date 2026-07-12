// ============================================================
// Vent4000 — Application (UI)
// ============================================================

import { DZ, NIVEAUX_PRESSION, NIVEAUX_PRATIQUE, LIENS, VERSION } from "./config.js";
import { statutOuverture } from "./ouverture.js";
import { scoreHeure, scoreCreneau, meilleurVerdict, ventPiste } from "./scoring.js";
import { chargerMeteo } from "./meteo.js";

// ------------------------------------------------------------
// État & réglages
// ------------------------------------------------------------
const CLE_REGLAGES = "vent4000.reglages";

const etat = {
  meteo: null,
  jourSelectionne: null,   // index dans meteo.jours
  heureSelectionnee: null, // index dans jour.heures
  reglages: chargerReglages(),
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
  localStorage.setItem(CLE_REGLAGES, JSON.stringify(etat.reglages));
}

/** Seuils effectifs = préréglage du niveau + overrides éventuels. */
function seuilsActifs() {
  const base = NIVEAUX_PRATIQUE[etat.reglages.niveau] ?? NIVEAUX_PRATIQUE.tandem;
  return {
    label: base.label,
    ventMax: etat.reglages.ventMax ?? base.ventMax,
    plafondMin: etat.reglages.plafondMin ?? base.plafondMin,
  };
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

const JOURS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const JOURS_COURT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS_FR = ["janv.", "févr.", "mars", "avril", "mai", "juin",
                 "juil.", "août", "sept.", "oct.", "nov.", "déc."];

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

/** Heure actuelle décimale (locale). */
function heureCourante() {
  const n = new Date();
  return n.getHours() + n.getMinutes() / 60;
}

/** Date du jour au format YYYY-MM-DD (local), pour comparer aux dates Open-Meteo. */
function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const CARDINAUX = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
function cardinal(deg) {
  if (deg == null) return "—";
  return CARDINAUX[Math.round(deg / 22.5) % 16];
}

const EMOJI = { vert: "🟢", orange: "🟠", rouge: "🔴" };

// ------------------------------------------------------------
// Calcul des jours d'ouverture scorés
// ------------------------------------------------------------
/**
 * @returns {Array<{index, date, ouverture, verdictJour, creneaux:[{label, verdict, heures:[{h, score}]}], lointain}>}
 */
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
    let creneaux = ouverture.creneaux.map((c) => {
      const fin = c.fin ?? coucher;
      const heures = jour.heures
        .filter((h) => h.heure + 1 > c.debut && h.heure < fin)
        .filter((h) => !estAujourdhui || h.heure >= Math.floor(maintenant))
        .map((h) => ({ h, score: scoreHeure(h, seuils) }));
      return {
        ...c,
        heures,
        verdict: scoreCreneau(heures.map((x) => x.score.verdict)),
      };
    });
    // Aujourd'hui : un créneau déjà entièrement passé ne s'affiche plus
    if (estAujourdhui) creneaux = creneaux.filter((c) => c.heures.length > 0);
    if (estAujourdhui && creneaux.length === 0) return; // journée terminée

    resultat.push({
      index,
      date,
      dateIso: jour.date,
      ouverture,
      creneaux,
      verdictJour: meilleurVerdict(creneaux.map((c) => c.verdict)),
      lointain: index >= 5, // J+6 / J+7 : fiabilité réduite → estompé
      sunset: jour.sunset,
    });
  });

  return resultat;
}

// ------------------------------------------------------------
// Vue Semaine
// ------------------------------------------------------------
function rendreSemaine() {
  const seuils = seuilsActifs();
  const jours = joursOuvertsScores();
  const conteneur = $("#vue-semaine .jours");
  conteneur.innerHTML = "";

  $("#niveau-actif").textContent = seuils.label;

  if (jours.length === 0) {
    conteneur.innerHTML = `
      <div class="vide">
        <p><strong>Aucun jour d'ouverture</strong> dans les 7 prochains jours.</p>
        <p>Le club ouvre les week-ends et jours fériés de mars à mi-décembre,
        plus les vendredis dès 16h de mai à septembre.</p>
      </div>`;
    return;
  }

  for (const j of jours) {
    const carte = document.createElement("button");
    carte.className = `carte-jour ${j.verdictJour}${j.lointain ? " lointain" : ""}`;
    carte.setAttribute("aria-label",
      `${JOURS_FR[j.date.getDay()]} ${j.date.getDate()} — verdict ${j.verdictJour}`);

    const badges = j.creneaux
      .map((c) => `<span class="badge ${c.verdict}">${EMOJI[c.verdict]} ${c.label}</span>`)
      .join("");

    carte.innerHTML = `
      <div class="carte-date">
        <span class="carte-dow">${JOURS_FR[j.date.getDay()]}</span>
        <span class="carte-num">${j.date.getDate()} ${MOIS_FR[j.date.getMonth()]}</span>
        ${j.ouverture.type === "ferie" ? `<span class="tag">Férié</span>` : ""}
        ${j.lointain ? `<span class="tag">Indicatif</span>` : ""}
      </div>
      <div class="carte-verdict pastille-${j.verdictJour}"></div>
      <div class="carte-badges">${badges}</div>`;

    carte.addEventListener("click", () => ouvrirJour(j.index));
    conteneur.appendChild(carte);
  }
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
    `${info.ouverture.type === "vendredi" ? "Ouverture dès 16h" : "Ouvert 8h30"} → coucher ${heureDe(jour.sunset)}`;

  // Badges de créneaux
  $("#jour-creneaux").innerHTML = info.creneaux
    .map((c) => `<span class="badge grand ${c.verdict}">${EMOJI[c.verdict]} ${c.label}</span>`)
    .join("");

  // Timeline horaire
  const toutes = info.creneaux.flatMap((c) => c.heures);
  const timeline = $("#timeline");
  timeline.innerHTML = "";

  // Heure par défaut : première verte, sinon première orange, sinon première
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
    chip.className = `chip ${score.verdict}${h.heure === etat.heureSelectionnee ? " actif" : ""}${estMaintenant ? " maintenant" : ""}`;
    const rotation = (h.direction10 ?? 0) + 180;
    chip.innerHTML = `
      ${estMaintenant ? `<span class="chip-maintenant">MAINTENANT</span>` : ""}
      <span class="chip-h">${h.heure}h</span>
      <span class="chip-fleche" style="transform:rotate(${rotation}deg)">➤</span>
      <span class="chip-v">${Math.round(h.vent10 ?? 0)}<small>km/h</small></span>`;
    chip.title = `Vent du ${cardinal(h.direction10)} (${Math.round(h.direction10 ?? 0)}°) · ${score.raisons.join(" · ") || "Conditions favorables"}`;
    chip.addEventListener("click", () => {
      etat.heureSelectionnee = h.heure;
      rendreJour();
    });
    timeline.appendChild(chip);
  }

  const chipActif = timeline.querySelector(".chip.actif");
  if (chipActif) chipActif.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });

  // Détail de l'heure sélectionnée
  const sel = toutes.find((x) => x.h.heure === etat.heureSelectionnee) ?? toutes[0];
  if (sel) rendreDetailHeure(sel.h, sel.score, seuils);
}

function rendreDetailHeure(h, score, seuils) {
  // Raisons
  $("#raisons").innerHTML = score.raisons.length
    ? score.raisons.map((r) => `<li>${r}</li>`).join("")
    : `<li class="ok">Conditions favorables pour « ${seuils.label} »</li>`;

  // ---- Profil vertical (signature de l'app) ----
  const profil = $("#profil");
  profil.innerHTML = "";

  for (const { hpa, role } of NIVEAUX_PRESSION) {
    const n = h.niveaux[hpa];
    profil.appendChild(ligneProfil({
      altitude: n?.agl != null ? `${n.agl} m` : `~${hpa} hPa`,
      role,
      vent: n?.vent,
      dir: n?.dir,
      temp: n?.temp,
    }));
  }

  // Ligne sol (avec rafales)
  profil.appendChild(ligneProfil({
    altitude: "Sol",
    role: `Rafales ${Math.round(h.rafales10 ?? 0)} km/h`,
    vent: h.vent10,
    dir: h.direction10,
    temp: h.t2m,
    sol: true,
  }));

  // ---- Boussole piste + crosswind ----
  rendreBoussole(h.direction10 ?? 0, h.vent10 ?? 0);
  const vp = ventPiste(h.vent10 ?? 0, h.direction10 ?? 0);
  $("#crosswind").innerHTML =
    `Vent du <strong>${cardinal(h.direction10)}</strong> (${Math.round(h.direction10 ?? 0)}°) —
     Traversier <strong>${vp.traversier} km/h</strong> · De face <strong>${vp.face} km/h</strong>
     <span class="note">axe piste ${String(DZ.qfu).padStart(3, "0")}° / ${DZ.qfu + 180}°</span>`;

  // ---- Grille de détails ----
  const plafondTxt = score.plafond === Infinity ? "Dégagé" : `~${score.plafond} m`;
  $("#details").innerHTML = [
    ["Direction / vitesse sol", `${cardinal(h.direction10)} · ${Math.round(h.vent10 ?? 0)} km/h`],
    ["Plafond estimé", plafondTxt, score.plafond !== Infinity && score.plafond < seuils.plafondMin],
    ["Proba. pluie", `${h.probaPluie ?? 0} %`],
    ["Visibilité", h.visibilite != null ? `${(h.visibilite / 1000).toFixed(0)} km` : "—"],
    ["CAPE", h.cape != null ? `${Math.round(h.cape)} J/kg` : "—"],
    ["Nuages bas/moy/hauts", `${h.nuagesBas ?? 0} / ${h.nuagesMoyens ?? 0} / ${h.nuagesHauts ?? 0} %`],
    ["T° au largage", h.niveaux[600]?.temp != null ? `${Math.round(h.niveaux[600].temp)} °C` : "—",
      h.niveaux[600]?.temp != null && h.niveaux[600].temp <= -5],
  ].map(([label, valeur, alerte]) =>
    `<div class="detail${alerte ? " alerte" : ""}"><span>${label}</span><strong>${valeur}</strong></div>`
  ).join("");
}

/** Une ligne du profil vertical : altitude, flèche orientée, vitesse, température. */
function ligneProfil({ altitude, role, vent, dir, temp, sol = false }) {
  const div = document.createElement("div");
  div.className = `niveau${sol ? " sol" : ""}`;
  // La flèche pointe dans le sens où va le vent (dir météo = d'où il vient → +180°)
  const rotation = dir != null ? dir + 180 : 0;
  div.innerHTML = `
    <div class="niv-alt"><strong>${altitude}</strong><span>${role}</span></div>
    <div class="niv-fleche" title="${dir != null ? Math.round(dir) + "°" : ""}">
      <span class="fleche-icone" style="transform: rotate(${rotation}deg)">➤</span>
      <span class="fleche-cardinal">${cardinal(dir)}</span>
    </div>
    <div class="niv-vent">${vent != null ? Math.round(vent) : "—"}<span> km/h</span></div>
    <div class="niv-temp">${temp != null ? Math.round(temp) : "—"}<span> °C</span></div>`;
  return div;
}

/** Boussole SVG : axe de piste + flèche du vent au sol. */
function rendreBoussole(direction, vitesse) {
  const svg = $("#boussole");
  const versOu = direction + 180; // sens du flux
  svg.innerHTML = `
    <circle cx="60" cy="60" r="54" class="b-cercle"/>
    <text x="60" y="16" class="b-cardinal">N</text>
    <text x="106" y="64" class="b-cardinal">E</text>
    <text x="60" y="112" class="b-cardinal">S</text>
    <text x="14" y="64" class="b-cardinal">O</text>
    <g transform="rotate(${DZ.qfu} 60 60)">
      <rect x="55" y="14" width="10" height="92" rx="3" class="b-piste"/>
      <line x1="60" y1="20" x2="60" y2="100" class="b-axe"/>
    </g>
    <g transform="rotate(${versOu} 60 60)">
      <line x1="60" y1="60" x2="60" y2="22" class="b-vent" style="stroke-width:${Math.min(6, 2 + vitesse / 10)}"/>
      <polygon points="60,14 54,26 66,26" class="b-pointe"/>
    </g>
    <circle cx="60" cy="60" r="4" class="b-centre"/>`;
}

// ------------------------------------------------------------
// Vue Réglages
// ------------------------------------------------------------
function rendreReglages() {
  const select = $("#reglage-niveau");
  select.innerHTML = Object.entries(NIVEAUX_PRATIQUE)
    .map(([cle, n]) => `<option value="${cle}"${cle === etat.reglages.niveau ? " selected" : ""}>${n.label}</option>`)
    .join("");

  const base = NIVEAUX_PRATIQUE[etat.reglages.niveau];
  $("#reglage-vent").value = etat.reglages.ventMax ?? base.ventMax;
  $("#reglage-plafond").value = etat.reglages.plafondMin ?? base.plafondMin;
}

function brancherReglages() {
  $("#reglage-niveau").addEventListener("change", (e) => {
    etat.reglages.niveau = e.target.value;
    etat.reglages.ventMax = null;     // retour aux préréglages du niveau
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
// Navigation entre vues & thème
// ------------------------------------------------------------
function basculerVue(nom) {
  for (const v of ["semaine", "jour", "reglages"]) {
    $(`#vue-${v}`).hidden = v !== nom;
  }
  window.scrollTo({ top: 0 });
}

/** Thème auto jour/nuit basé sur le lever/coucher du soleil du jour courant. */
function appliquerTheme() {
  let nuit;
  const aujourdHui = etat.meteo?.jours?.[0];
  if (aujourdHui?.sunrise && aujourdHui?.sunset) {
    const maintenant = new Date();
    const hd = maintenant.getHours() + maintenant.getMinutes() / 60;
    nuit = hd < heureDecimale(aujourdHui.sunrise) || hd > heureDecimale(aujourdHui.sunset);
  } else {
    const h = new Date().getHours();
    nuit = h < 7 || h >= 21;
  }
  document.documentElement.dataset.theme = nuit ? "nuit" : "jour";
}

// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------
async function init() {
  appliquerTheme();

  // Liens externes
  $("#lien-gmaps").href = LIENS.gmaps;
  $("#lien-waze").href = LIENS.waze;
  $("#lien-irm").href = LIENS.irm;
  $("#lien-windy").href = LIENS.windy;
  $("#lien-club").href = LIENS.club;
  $("#version").textContent = `v${VERSION}`;

  // Navigation
  $("#btn-retour").addEventListener("click", () => basculerVue("semaine"));
  $("#btn-reglages").addEventListener("click", () => { rendreReglages(); basculerVue("reglages"); });
  $("#btn-reglages-retour").addEventListener("click", () => basculerVue("semaine"));
  brancherReglages();

  try {
    etat.meteo = await chargerMeteo();
    appliquerTheme();
    $("#maj").textContent =
      `Prévisions Open-Meteo · mises à jour à ${new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}`;
    rendreSemaine();
    $("#chargement").hidden = true;
    $("#vue-semaine").hidden = false;
  } catch (err) {
    $("#chargement").innerHTML = `
      <p><strong>Impossible de charger la météo.</strong></p>
      <p>Vérifie ta connexion puis réessaie.</p>
      <button class="btn" onclick="location.reload()">Réessayer</button>`;
    console.error(err);
  }
}

init();

// Service worker (PWA installable + offline)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
