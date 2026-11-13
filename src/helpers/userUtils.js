const fs = require("fs");

const SITE_DESCRIPTION =
  "Registro oficial do universo de Lex Obscura, trilogia de dark fantasy ambientada num império erguido sobre sangue e ossos.";

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
  raw = raw || "";
  // Drop the frontmatter block when reading straight from disk.
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
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

function noteTitle(data) {
  const m = rawBody(data).match(/^#\s+(.+?)\s*$/m);
  return m ? plain(m[1]) : "";
}

function noteDescription(data) {
  const paragraphs = rawBody(data).split(/\r?\n\s*\r?\n/);
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
  const p = ((data.page && data.page.inputPath) || "").replace(/\\/g, "/");
  const m = p.match(/\/_wiki\/([^/]+)\/[^/]+$/);
  return (m && SECTIONS[m[1]]) || null;
}

function userComputed(data) {
  const isHome = (data.tags || []).indexOf("gardenEntry") != -1;
  return {
    description: isHome ? SITE_DESCRIPTION : noteDescription(data),
    section: noteSection(data),
    nav: NAV,
  };
}

exports.userComputed = userComputed;
exports.noteTitle = noteTitle;
