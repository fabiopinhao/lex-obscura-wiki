const { noteTitle } = require("./userUtils");

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
}
exports.userMarkdownSetup = userMarkdownSetup;
exports.userEleventySetup = userEleventySetup;
