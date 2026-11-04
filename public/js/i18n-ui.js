// Unisce i dizionari: UI["frase italiana"] = { en, de, ru, ja, zh }
import a from "./i18n/ui1.js";
import b from "./i18n/ui2.js";
import c from "./i18n/ui3.js";
import d from "./i18n/ui4.js";
import e from "./i18n/ui5.js";

const LANG_ORDER = ["en", "de", "ru", "ja", "zh"];
export const UI = {};
for (const dict of [a, b, c, d, e]) {
  for (const [it, arr] of Object.entries(dict)) {
    const o = {};
    LANG_ORDER.forEach((l, k) => (o[l] = arr[k]));
    UI[it] = o;
  }
}
