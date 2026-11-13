require("dotenv").config();
const settings = require("../../helpers/constants");
const { spellOf } = require("../../helpers/userUtils");

const allSettings = settings.ALL_NOTE_SETTINGS;

module.exports = {
  eleventyComputed: {
    layout: (data) => {
      // Lex Obscura: both homes (English at /, Portuguese at /pt/) use the home layout.
      if (data.tags.indexOf("gardenEntry") != -1 || data.lexHome === true) {
        return "layouts/index.njk";
      }
      // Lex Obscura: a spell is shown inside the page of its school; its own
      // URL only forwards there.
      if (spellOf(data.page && data.page.inputPath)) {
        return "layouts/spell.njk";
      }
      return "layouts/note.njk";
    },
    permalink: (data) => {
      if (data.tags.indexOf("gardenEntry") != -1) {
        return "/";
      }
      return data.permalink || undefined;
    },
    settings: (data) => {
      const noteSettings = {};
      allSettings.forEach((setting) => {
        let noteSetting = data[setting];
        let globalSetting = process.env[setting];

        let settingValue =
          noteSetting || (globalSetting === "true" && noteSetting !== false);
        noteSettings[setting] = settingValue;
      });
      return noteSettings;
    },
  },
};
