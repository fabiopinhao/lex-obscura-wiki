const fs = require("fs");
const path = require("path");

const SITE_DESCRIPTION =
  "Registro oficial do universo de Lex Obscura, trilogia de dark fantasy ambientada num império erguido sobre sangue e ossos.";

const WIKI_DIR = "src/site/notes/_wiki";

// Folder of the note -> index page that lists it.
const SECTIONS = {
  personagens: { label: "Personagens", url: "/wiki/indices/personagens/" },
  racas: { label: "Raças", url: "/wiki/indices/racas/" },
  criaturas: { label: "Raças", url: "/wiki/indices/racas/" },
  locais: { label: "Locais", url: "/wiki/indices/locais/" },
  organizacoes: { label: "Organizações", url: "/wiki/indices/organizacoes/" },
  artefatos: { label: "Artefatos", url: "/wiki/indices/artefatos/" },
  conceitos: { label: "Conceitos", url: "/wiki/indices/conceitos/" },
  linguas: { label: "Línguas", url: "/wiki/indices/linguas/" },
  cosmologia: { label: "Cosmologia", url: "/wiki/indices/cosmologia/" },
  panteao: { label: "Cosmologia", url: "/wiki/indices/cosmologia/" },
  eventos: { label: "Cronologia", url: "/wiki/indices/cronologia/" },
  escolas: { label: "Sistema de Magia", url: "/wiki/indices/sistema-de-magia/" },
  feiticos: { label: "Sistema de Magia", url: "/wiki/indices/sistema-de-magia/" },
  magia: { label: "Sistema de Magia", url: "/wiki/indices/sistema-de-magia/" },
};

const NAV = [
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
].map((k) => SECTIONS[k]);

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
  return SITE_DESCRIPTION;
}

function noteSection(data) {
  const m = norm(data.page && data.page.inputPath).match(/\/_wiki\/([^/]+)\/[^/]+$/);
  return (m && SECTIONS[m[1]]) || null;
}

function readNote(folder, slug) {
  const raw = fs.readFileSync(path.join(WIKI_DIR, folder, slug + ".md"), "utf8").replace(/\r\n/g, "\n");
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const body = stripFrontmatter(raw);
  return { permalink: fm ? JSON.parse(fm[1]).permalink : "", body, title: titleOf(body) };
}

// Spells are published inside the page of their school. The school and the
// scale come from the opening sentence of the spell ("... é um feitiço da
// escola de [[_wiki/escolas/phobos\|Phobos]], de escala Maior"). A spell whose
// school cannot be read keeps its own page.
let spellCache = null;
function spellIndex() {
  if (spellCache) return spellCache;
  const bySlug = {};
  const dir = path.join(WIKI_DIR, "feiticos");
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
      try {
        schools[school] = readNote("escolas", school);
      } catch {
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

function schoolSpellsOf(inputPath) {
  const m = norm(inputPath).match(/\/_wiki\/escolas\/([^/]+)\.md$/);
  return (m && spellIndex().bySchool[m[1]]) || null;
}

function userComputed(data) {
  const isHome = (data.tags || []).indexOf("gardenEntry") != -1;
  const inputPath = data.page && data.page.inputPath;
  return {
    description: isHome ? SITE_DESCRIPTION : noteDescription(data),
    section: noteSection(data),
    nav: NAV,
    spell: spellOf(inputPath),
    schoolSpells: schoolSpellsOf(inputPath),
  };
}

exports.userComputed = userComputed;
exports.noteTitle = noteTitle;
exports.spellIndex = spellIndex;
exports.spellOf = spellOf;
