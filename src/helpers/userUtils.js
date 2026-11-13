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
      "The spell entries of this school have not been translated yet; each link opens the Portuguese text.",
    untranslated: "This entry has not been translated into English yet. The text below is the Portuguese original.",
    homeTitle: "Official record of the universe",
    langLabel: "Language",
  },
};

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

function spellOf(inputPath) {
  const m = norm(inputPath).match(/\/_wiki\/feiticos\/([^/]+)\.md$/);
  return (m && spellIndex().bySlug[m[1]]) || null;
}

// The school page of either language lists the (Portuguese) spells.
function schoolSpellsOf(inputPath) {
  const m = norm(inputPath).match(/\/_wiki(?:_en)?\/escolas\/([^/]+)\.md$/);
  return (m && spellIndex().bySchool[m[1]]) || null;
}

function userComputed(data) {
  const isHome = (data.tags || []).indexOf("gardenEntry") != -1 || data.lexHome === true;
  const inputPath = data.page && data.page.inputPath;
  const lang = langOf(data);
  const bilingual = Boolean(data.lexLang);
  const homeUrl = bilingual && lang === "pt-BR" ? "/pt/" : "/";
  const self = data.permalink || (data.page && data.page.url) || "/";
  const alt = data.lexAlt || "";
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
    untranslated: bilingual && lang === "pt-BR" && !alt && !isHome,
    description: isHome ? SITE_DESCRIPTION[lang] : noteDescription(data),
    section: noteSection(data),
    nav: navFor(lang),
    spell: spellOf(inputPath),
    schoolSpells: schoolSpellsOf(inputPath),
  };
}

exports.userComputed = userComputed;
exports.noteTitle = noteTitle;
exports.spellIndex = spellIndex;
exports.spellOf = spellOf;
