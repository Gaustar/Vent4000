// ============================================================
// Vent4000 — Page météo publique du Paraclub de Namur
//
// Source : https://paraclubnamur.be/fr/meteo (refaite en octobre 2026).
// C'est la décision réelle du club : état des activités du jour, heure
// du point météo et vrais jours d'ouverture. L'app l'affiche telle
// quelle, sans l'interpréter : le libellé de l'état est repris mot pour
// mot, il ne modifie jamais le verdict météo.
//
// Le site n'a ni API ni CORS : la page est lue par un relais (relais/,
// Cloudflare Worker) qui renvoie le JSON produit par `lirePageClub`. Ce
// module est pur (aucune dépendance DOM) pour tourner à la fois dans le
// relais, dans l'app et sous Node (tests).
//
// Seule la page PUBLIQUE est lue. La « limite de sauts » de l'espace
// membre n'est pas reprise : elle est réservée aux membres.
// ============================================================

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—", hellip: "…", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç" };

function decoder(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITES[e.toLowerCase()] ?? m;
  });
}

/** Texte visible d'un fragment HTML, espaces normalisés. */
function texte(html) {
  return decoder(html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

const vide = (s) => !s || s === "–" || s === "-" || s === "—";

/** « 8h30 » → 8.5 ; « 16h » → 16 ; sinon null. */
export function heureClub(s) {
  const m = /^(\d{1,2})\s*h\s*(\d{2})?$/i.exec(s ?? "");
  if (!m) return null;
  const h = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  return h >= 0 && h < 24 ? h : null;
}

/** Date ISO locale (AAAA-MM-JJ) à Bruxelles. */
export function isoBruxelles(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * « 31 octobre » → date ISO. La page n'écrit pas l'année : on prend la
 * première occurrence qui ne soit pas dans le passé (la page ne liste que
 * des jours à venir), ce qui gère le passage décembre → janvier.
 */
function dateSansAnnee(jour, mois, maintenant) {
  const aujourdhui = isoBruxelles(maintenant);
  const annee = Number(aujourdhui.slice(0, 4));
  for (const a of [annee, annee + 1]) {
    const iso = `${a}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
    if (iso >= aujourdhui) return iso;
  }
  return null;
}

/** Couleur de l'état, d'après la classe Tailwind du bandeau (affichage seulement). */
function tonDe(html) {
  const m = /\bbg-(gray|slate|green|emerald|lime|red|rose|orange|amber|yellow|blue|sky)-\d{3}\b/.exec(html);
  if (!m) return null;
  return { gray: "gris", slate: "gris", green: "vert", emerald: "vert", lime: "vert", red: "rouge", rose: "rouge",
    orange: "orange", amber: "orange", yellow: "orange", blue: "bleu", sky: "bleu" }[m[1]];
}

/**
 * Lit la page météo publique du club.
 * @param {string} html
 * @param {Date} maintenant  sert à dater les jours (la page ne donne pas l'année)
 * @returns {null | {
 *   maj: string|null,
 *   etat: {libelle:string, ton:string|null, message:string[]} | null,
 *   jours: {date:string, jour:string, pointMeteo:string|null, start:string|null, note:string|null}[]
 * }}  null si la page n'a plus la structure attendue (refonte du site).
 */
export function lirePageClub(html, maintenant = new Date()) {
  if (typeof html !== "string") return null;

  const maj = /Derni[èe]re mise à jour[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/i.exec(html);

  let etat = null;
  const secEtat = /<section[^>]*id="etat"[^>]*>([\s\S]*?)<\/section>/i.exec(html);
  if (secEtat) {
    const corps = secEtat[1].replace(/<h2[\s\S]*?<\/h2>/i, "");
    const blocs = [...corps.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => texte(m[2])).filter(Boolean);
    if (blocs.length) etat = { libelle: blocs[0], ton: tonDe(corps), message: blocs.slice(1) };
  }

  const jours = [];
  const secPlanning = /<section[^>]*aria-labelledby="planning-title"[^>]*>([\s\S]*?)<\/section>/i.exec(html);
  const corpsTable = secPlanning && /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(secPlanning[1]);
  if (corpsTable) {
    for (const [, ligne] of corpsTable[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const entete = /<th\b[^>]*>([\s\S]*?)<\/th>/i.exec(ligne);
      const cellules = [...ligne.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => texte(m[1]));
      if (!entete) continue;
      const libelle = texte(entete[1]);
      const d = new RegExp(`(\\d{1,2})\\s+(${MOIS.join("|")})`, "i").exec(libelle);
      if (!d) continue;
      const date = dateSansAnnee(Number(d[1]), MOIS.indexOf(d[2].toLowerCase()), maintenant);
      if (!date) continue;
      const jour = libelle.slice(0, d.index).trim();
      const note = libelle.slice(d.index + d[0].length).trim();
      jours.push({
        date,
        jour,
        pointMeteo: vide(cellules[0]) ? null : cellules[0],
        start: vide(cellules[1]) ? null : cellules[1],
        note: note || null,
      });
    }
  }

  if (!etat && !secPlanning) return null;
  return { maj: maj ? texte(maj[1]) : null, etat, jours };
}

/**
 * Calendrier réel pour une date, d'après le planning du club.
 * @param {string} iso         date AAAA-MM-JJ
 * @param {object|null} club   réponse du relais ({recu, jours, ...})
 * @returns {"ouvert"|"ferme"|null}  null = le planning ne couvre pas cette date
 *   (on retombe alors sur le calendrier habituel).
 *
 * Le planning couvre du lendemain de la lecture jusqu'au dernier jour
 * listé. Le jour même n'est jamais déclaré fermé par absence : on ne sait
 * pas si la page liste encore le jour en cours ; l'état des activités,
 * affiché à part, fait foi pour aujourd'hui.
 */
export function planningClub(iso, club) {
  const jours = club?.jours;
  if (!Array.isArray(jours) || !jours.length || !club.recu) return null;
  if (jours.some((j) => j.date === iso)) return "ouvert";
  const lu = isoBruxelles(new Date(club.recu));
  const dernier = jours.map((j) => j.date).sort().at(-1);
  return iso > lu && iso <= dernier ? "ferme" : null;
}

// ------------------------------------------------------------
// Chargement dans l'app (via le relais)
// ------------------------------------------------------------
const CLE_CACHE = "vent4000.club";
// Au-delà, une copie locale ne décrit plus le club : mieux vaut ne rien
// afficher qu'un état ou un planning périmé.
const CACHE_MAX_MS = 12 * 3600e3;

/**
 * Réponse du relais, avec repli sur la dernière copie (hors-ligne).
 * @returns {Promise<object|null>}  {recu, maj, etat, jours, source:"relais"|"cache"} ou null
 */
export async function chargerClub(url, fetchImpl = fetch, delaiMs = 8000) {
  if (!url) return null;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  try {
    const rep = await fetchImpl(url, { signal: controleur.signal, cache: "no-store" });
    if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
    const donnees = await rep.json();
    if (!donnees?.recu || !(donnees.etat || Array.isArray(donnees.jours))) throw new Error("réponse inattendue");
    try { localStorage.setItem(CLE_CACHE, JSON.stringify(donnees)); } catch { /* mode privé */ }
    return { ...donnees, source: "relais" };
  } catch {
    try {
      const cache = JSON.parse(localStorage.getItem(CLE_CACHE) || "null");
      if (cache?.recu && Date.now() - new Date(cache.recu).getTime() < CACHE_MAX_MS) return { ...cache, source: "cache" };
    } catch { /* stockage indisponible */ }
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}
