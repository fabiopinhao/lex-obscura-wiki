const { noteTitle, spellIndex, enSpellByUrl } = require("./userUtils");

function userMarkdownSetup(md) {
  // The md parameter stands for the markdown-it instance used throughout the site generator.
  // Feel free to add any plugin you want here instead of /.eleventy.js
}
function userEleventySetup(eleventyConfig) {
  // Notes are exported without a `title` in the frontmatter, so the template
  // falls back to the file slug ("arothistar", "Home"). Take the title from the
  // note's own H1 instead: it feeds <title>, search, backlinks and the TOC.
  eleventyConfig.addGlobalData("eleventyComputed.title", () => (data) => {
    const inputPath = (data.page && data.page.inputPath) || "";
    if (!inputPath.replace(/\\/g, "/").includes("/notes/")) {
      return undefined;
    }
    return noteTitle(data) || data.page.fileSlug;
  });

  // Finds the collection item of a spell so its rendered body can be shown
  // inside the page of its school.
  eleventyConfig.addFilter("lexNoteBySlug", (notes, folder, slug, dir) => {
    const end = `/${dir || "_wiki"}/${folder}/${slug}.md`;
    return (notes || []).find((n) => n.inputPath.replace(/\\/g, "/").endsWith(end));
  });

  // Body of a spell as a block of the school page: no H1 of its own, inner
  // headings one level below the spell name, and no heading ids (ten spells
  // would repeat id="custo" on the same page).
  eleventyConfig.addFilter("lexSpellBody", (html) =>
    (html || "")
      .replace(/<h1[^>]*>[\s\S]*?<\/h1>/, "")
      .replace(/<(\/?)h[2-4]\b[^>]*>/g, (m, close) => `<${close}h4>`)
  );

  // Links to a spell point to its block in the school page.
  eleventyConfig.addTransform("lex-spell-links", function (content) {
    const out = (this.page && this.page.outputPath) || "";
    if (!out.endsWith(".html")) return content;
    const { byUrl } = spellIndex();
    const enUrl = enSpellByUrl();
    return content.replace(/href="(\/(?:(?:wiki|pt)\/)?feiticos\/[^"#]+\/)"/g, (m, url) =>
      byUrl[url] ? `href="${byUrl[url]}"` : enUrl[url] ? `href="${enUrl[url]}"` : m
    );
  });
}
exports.userMarkdownSetup = userMarkdownSetup;
exports.userEleventySetup = userEleventySetup;
