import lunr from "C:\\Users\\98999\\Desktop\\Mountify-docs\\node_modules\\lunr\\lunr.js";
require("C:\\Users\\98999\\Desktop\\Mountify-docs\\node_modules\\lunr-languages\\lunr.stemmer.support.js")(lunr);
require("C:\\Users\\98999\\Desktop\\Mountify-docs\\node_modules\\@easyops-cn\\docusaurus-search-local\\dist\\client\\shared\\lunrLanguageZh.js").lunrLanguageZh(lunr);
require("C:\\Users\\98999\\Desktop\\Mountify-docs\\node_modules\\lunr-languages\\lunr.multi.js")(lunr);
export const removeDefaultStopWordFilter = [];
export const language = ["en","zh"];
export const searchIndexUrl = "search-index{dir}.json?_=2c2c4c84";
export const searchResultLimits = 8;
export const fuzzyMatchingDistance = 1;