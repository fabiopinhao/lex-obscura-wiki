const fs = require("fs");
const path = require("path");

// Two trees can coexist (author's decision, 2026-11-13): English at the root
// (`_wiki_en/`) and Portuguese under /pt/ (`_wiki/`). Before the switch only
// `_wiki/` exists, under /wiki/, and everything below degrades to that.
const NOTES_DIR = "src/site/notes";
const DIRS = { "pt-BR": "_wiki", en: "_wiki_en" };

const SITE_DESCRIPTION = {
  "pt-BR":
    "Registro oficial do universo de Lex Obscura, trilogia de dark fantasy ambientada num império erguido sobre sangue e ossos.",
  en: "Official record of the Lex Obscura universe, a dark fantasy trilogy set in an empire raised on blood and bone.",
};

// Interface strings by language.
const UI = {
  "pt-BR": {
    explore: "Explorar o mundo",
    crumbs: "Trilha de navegação",
    spells: "Feitiços",
    spellsForeign: "",
    untranslated: "",
    homeTitle: "Registro oficial do universo",
    langLabel: "Idioma",
  },
  en: {
    explore: "Explore the world",
    crumbs: "Breadcrumb",
    spells: "Spells",
    spellsForeign:
      "Spells not yet translated open in the Portuguese text.",
    untranslated: "This entry has not been translated into English yet. The text below is the Portuguese original.",
    homeTitle: "Official record of the universe",
    langLabel: "Language",
  },
};

// Strings of the template components (search, backlinks) for English pages;
// Portuguese pages keep the ones from .env (meta.uiStrings).
const UI_STRINGS_EN = {
  backlinkHeader: "Pages that cite this one",
  noBacklinksMessage: "No other page cites this one",
  searchButtonText: "Search",
  searchPlaceholder: "Type to search…",
  searchNotStarted: "Type in the field above",
  searchEnterHotkey: "Enter",
  searchEnterHint: "to open",
  searchNavigateHotkey: "⇅",
  searchNavigateHint: "to navigate",
  searchCloseHotkey: "ESC",
  searchCloseHint: "to close",
  searchNoResults: "No results for",
  searchPreviewPlaceholder: "Select a result to preview",
  backlinkShowAll: "See all",
  backlinkOther: "Other pages",
  tocMobile: "On this page",
};

// The same extra strings for Portuguese pages, from .env (the template's
// meta.js only knows its own keys).
function uiStringsPt() {
  return {
    backlinkShowAll: process.env.UI_BACKLINK_SHOW_ALL || "Ver todas",
    backlinkOther: process.env.UI_BACKLINK_OTHER || "Outras páginas",
    tocMobile: process.env.UI_TOC_MOBILE || "Nesta página",
  };
}

// Side column (author's review of 2026-11-22, D6): the table of contents only
// helps when the page has at least two sections below the title, and short
// index pages (the book pages, Línguas) and the home get neither TOC nor
// backlinks, which there only repeated their own headings.
const TOC_MIN_SECTIONS = 2;
const SHORT_INDEX_MAX_SECTIONS = 2;
function sectionCount(body) {
  let n = 0;
  let fence = false;
  for (const line of body.split(/\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence && /^#{2,6}\s+\S/.test(line)) n++;
  }
  return n;
}

// Folder of the note -> index file (Portuguese file name in both trees).
const SECTION_INDEX = {
  personagens: "Personagens",
  racas: "Raças",
  criaturas: "Raças",
  locais: "Locais",
  organizacoes: "Organizações",
  artefatos: "Artefatos",
  conceitos: "Conceitos",
  linguas: "Línguas",
  cosmologia: "Cosmologia",
  panteao: "Cosmologia",
  eventos: "Cronologia",
  escolas: "Sistema de Magia",
  feiticos: "Sistema de Magia",
  magia: "Sistema de Magia",
};

const NAV_KEYS = [
  "racas",
  "locais",
  "organizacoes",
  "personagens",
  "magia",
  "artefatos",
  "conceitos",
  "linguas",
  "cosmologia",
  "eventos",
];

const SCALES = { menor: "Menor", média: "Média", maior: "Maior", máxima: "Máxima" };
const SCALE_ORDER = ["menor", "média", "maior", "máxima"];
const SCALE_ALIAS = { médio: "média", máximo: "máxima" };

function norm(p) {
  return (p || "").replace(/\\/g, "/");
}

function stripFrontmatter(raw) {
  return raw.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "");
}

function rawBody(data) {
  const page = data.page || {};
  let raw = page.rawInput;
  if (typeof raw !== "string" && page.inputPath) {
    try {
      raw = fs.readFileSync(page.inputPath, "utf8");
    } catch {
      raw = "";
    }
  }
  // Drop the frontmatter block when reading straight from disk.
  return stripFrontmatter(raw || "");
}

function plain(md) {
  return md
    .replace(/\[\[[^\]|\\]*\\?\|([^\]]*)\]\]/g, "$1") // [[target\|Display]]
    .replace(/\[\[([^\]]*)\]\]/g, (m, t) => t.split("/").pop()) // [[target]]
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(body) {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m ? plain(m[1]) : "";
}

function firstParagraph(body) {
  for (const p of body.split(/\n\s*\n/)) {
    const t = p.trim();
    if (t && !/^(#|---)/.test(t)) return t;
  }
  return "";
}

function noteTitle(data) {
  return titleOf(rawBody(data));
}

function langOf(data) {
  return data.lexLang === "en" ? "en" : "pt-BR";
}

function noteDescription(data) {
  const paragraphs = rawBody(data).split(/\n\s*\n/);
  for (const p of paragraphs) {
    const t = p.trim();
    if (!t || /^(#|[-*>|]|\d+\.|---)/.test(t)) continue;
    const text = plain(t);
    if (text.length < 60) continue;
    if (text.length <= 170) return text;
    const cut = text.slice(0, 170);
    return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.]$/, "") + "…";
  }
  return SITE_DESCRIPTION[langOf(data)];
}

const noteCache = {};
function readNote(folder, slug, dir = DIRS["pt-BR"]) {
  const key = `${dir}/${folder}/${slug}`;
  if (key in noteCache) return noteCache[key];
  let note = null;
  try {
    const raw = fs
      .readFileSync(path.join(NOTES_DIR, dir, folder, slug + ".md"), "utf8")
      .replace(/\r\n/g, "\n");
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
    const body = stripFrontmatter(raw);
    note = { permalink: fm ? JSON.parse(fm[1]).permalink : "", body, title: titleOf(body) };
  } catch {
    note = null;
  }
  noteCache[key] = note;
  return note;
}

// Index page of a section in the given language; falls back to Portuguese.
function sectionFor(key, lang) {
  const file = SECTION_INDEX[key];
  if (!file) return null;
  const note = readNote("indices", file, DIRS[lang]) || readNote("indices", file);
  return note ? { label: note.title || file, url: note.permalink } : null;
}

function navFor(lang) {
  const seen = new Set();
  const out = [];
  for (const k of NAV_KEYS) {
    const s = sectionFor(k, lang);
    if (s && !seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
  }
  return out;
}

function noteSection(data) {
  const m = norm(data.page && data.page.inputPath).match(/\/_wiki(?:_en)?\/([^/]+)\/[^/]+$/);
  return m ? sectionFor(m[1], langOf(data)) : null;
}

// Spells are published inside the page of their school. The school and the
// scale come from the opening sentence of the spell ("... é um feitiço da
// escola de [[_wiki/escolas/phobos\|Phobos]], de escala Maior"). A spell whose
// school cannot be read keeps its own page. Spells exist only in Portuguese.
let spellCache = null;
function spellIndex() {
  if (spellCache) return spellCache;
  const bySlug = {};
  const dir = path.join(NOTES_DIR, DIRS["pt-BR"], "feiticos");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  const schools = {};
  for (const file of files.sort()) {
    const slug = file.replace(/\.md$/, "");
    const note = readNote("feiticos", slug);
    const first = firstParagraph(note.body);
    const sm = first.match(/\[\[_wiki\/escolas\/([^\]\\|#]+)/);
    if (!sm || !note.permalink) {
      console.warn(`[lex] feitiço sem escola legível, mantém página própria: ${slug}`);
      continue;
    }
    const school = sm[1];
    if (!schools[school]) {
      schools[school] = readNote("escolas", school);
      if (!schools[school]) {
        console.warn(`[lex] escola inexistente para o feitiço ${slug}: ${school}`);
        continue;
      }
    }
    const lower = first.toLowerCase();
    // "de escala média", "feitiço menor", "maldição maior"; four articles
    // carry the typo "feitício", accepted here so they are not left unlabeled.
    const scm =
      lower.match(/escala (menor|média|maior|máxima)/) ||
      lower.match(/(?:feitiço|feitício|maldição) (menor|maior|médio|média|máximo|máxima)/);
    const scale = scm ? SCALE_ALIAS[scm[1]] || scm[1] : "";
    const anchor = note.permalink.replace(/\/$/, "").split("/").pop();
    bySlug[slug] = {
      slug,
      title: note.title || slug,
      url: note.permalink,
      anchor,
      school,
      schoolTitle: schools[school].title,
      schoolUrl: schools[school].permalink,
      target: `${schools[school].permalink}#${anchor}`,
      scale,
      scaleLabel: SCALES[scale] || "",
      rank: scale ? SCALE_ORDER.indexOf(scale) : SCALE_ORDER.length,
    };
  }
  const bySchool = {};
  const byUrl = {};
  for (const s of Object.values(bySlug)) {
    (bySchool[s.school] = bySchool[s.school] || []).push(s);
    byUrl[s.url] = s.target;
  }
  for (const list of Object.values(bySchool)) {
    list.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, "pt-BR"));
  }
  spellCache = { bySlug, bySchool, byUrl };
  return spellCache;
}

// English view of a spell: its translated text when there is one (shown as a
// block in the English school page), otherwise a link to the Portuguese block.
const SCALES_EN = { menor: "Minor", média: "Medium", maior: "Major", máxima: "Maximum" };
function enSpell(s) {
  const note = readNote("feiticos", s.slug, DIRS.en);
  const school = readNote("escolas", s.school, DIRS.en);
  const scaleEn = SCALES_EN;
  if (!note || !school || !note.permalink) {
    return Object.assign({}, s, { translated: false, scaleLabel: scaleEn[s.scale] || "" });
  }
  return Object.assign({}, s, {
    translated: true,
    title: note.title || s.title,
    url: note.permalink,
    schoolTitle: school.title,
    schoolUrl: school.permalink,
    target: `${school.permalink}#${s.anchor}`,
    scaleLabel: scaleEn[s.scale] || "",
  });
}

let enSpellUrls = null;
function enSpellByUrl() {
  if (enSpellUrls) return enSpellUrls;
  enSpellUrls = {};
  for (const s of Object.values(spellIndex().bySlug)) {
    const e = enSpell(s);
    if (e.translated) enSpellUrls[e.url] = e.target;
  }
  return enSpellUrls;
}

function spellOf(inputPath) {
  const m = norm(inputPath).match(/\/_wiki(_en)?\/feiticos\/([^/]+)\.md$/);
  const s = m && spellIndex().bySlug[m[2]];
  if (!s) return null;
  if (!m[1]) return s;
  const e = enSpell(s);
  return e.translated ? e : null;
}

// The school page of either language lists its spells; in English, each one
// is the translated block or a link to the Portuguese text.
function schoolSpellsOf(inputPath) {
  const m = norm(inputPath).match(/\/_wiki(_en)?\/escolas\/([^/]+)\.md$/);
  const list = m && spellIndex().bySchool[m[2]];
  if (!list) return null;
  return m[1] ? list.map(enSpell) : list;
}

function userComputed(data) {
  const isHome = (data.tags || []).indexOf("gardenEntry") != -1 || data.lexHome === true;
  const inputPath = data.page && data.page.inputPath;
  const lang = langOf(data);
  const bilingual = Boolean(data.lexLang);
  const homeUrl = bilingual && lang === "pt-BR" ? "/pt/" : "/";
  const self = data.permalink || (data.page && data.page.url) || "/";
  const alt = data.lexAlt || "";
  const sections = sectionCount(rawBody(data));
  const isIndex = /\/_wiki(?:_en)?\/indices\/[^/]+$/.test(norm(inputPath));
  const shortIndex = isIndex && sections <= SHORT_INDEX_MAX_SECTIONS;
  const langs = bilingual
    ? [
        { code: "en", label: "EN", url: lang === "en" ? self : alt, current: lang === "en" },
        { code: "pt-BR", label: "PT", url: lang === "pt-BR" ? self : alt, current: lang === "pt-BR" },
      ]
    : [];
  return {
    lang,
    bilingual,
    isEn: lang === "en",
    homeUrl,
    alt,
    langs,
    ui: UI[lang],
    uiStrings: lang === "en" ? UI_STRINGS_EN : null,
    lexStrings: lang === "en" ? UI_STRINGS_EN : uiStringsPt(),
    showToc: !isHome && !shortIndex && sections >= TOC_MIN_SECTIONS,
    showBacklinks: !isHome && !shortIndex,
    untranslated: bilingual && lang === "pt-BR" && !alt && !isHome,
    description: isHome ? SITE_DESCRIPTION[lang] : noteDescription(data),
    section: noteSection(data),
    nav: navFor(lang),
    spell: spellOf(inputPath),
    schoolSpells: schoolSpellsOf(inputPath),
  };
}

// "Pages that cite this one" (D2): the ten most cited of the citing pages
// first, then all of them grouped by section, in the order of the menu.
const BACKLINK_TOP = 10;
function backlinksOf(graph, url, lang) {
  const nodes = (graph && graph.nodes) || {};
  // Same lookup as the template's sidebar: the home falls back to its alias.
  const node = nodes[url] || nodes[graph && graph.homeAlias];
  if (!node) return { count: 0, top: [], groups: [], more: false };
  const items = node.backLinks
    .map((u) => nodes[u])
    .filter((n) => n && n.url !== url)
    .map((n) => ({ url: n.url, title: n.title, icon: n.noteIcon, group: n.group, weight: n.backLinks.length }));
  const coll = new Intl.Collator(lang, { sensitivity: "base" });
  const byTitle = (a, b) => coll.compare(a.title, b.title);
  const top = items
    .slice()
    .sort((a, b) => b.weight - a.weight || byTitle(a, b))
    .slice(0, BACKLINK_TOP);
  const order = NAV_KEYS.map((k) => SECTION_INDEX[k] || k);
  const groups = new Map();
  for (const it of items) {
    const s = sectionFor(it.group, lang);
    const key = s ? s.url : "";
    if (!groups.has(key)) {
      const file = SECTION_INDEX[it.group];
      const rank = file ? order.indexOf(file) : -1;
      groups.set(key, { label: s ? s.label : "", rank: rank < 0 ? 99 : rank, items: [] });
    }
    groups.get(key).items.push(it);
  }
  const list = Array.from(groups.values()).sort((a, b) => a.rank - b.rank || coll.compare(a.label, b.label));
  list.forEach((g) => g.items.sort(byTitle));
  return { count: items.length, top, groups: list, more: items.length > BACKLINK_TOP };
}

exports.userComputed = userComputed;
exports.backlinksOf = backlinksOf;
exports.noteTitle = noteTitle;
exports.spellIndex = spellIndex;
exports.spellOf = spellOf;
exports.enSpellByUrl = enSpellByUrl;
