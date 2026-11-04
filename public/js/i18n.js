// Lingue: l'interfaccia è scritta in italiano e ogni frase viene tradotta con t("frase italiana").
import { settings, saveSettings } from "./settings.js";
import { UI } from "./i18n-ui.js";

export const LANGS = [
  { id: "it", name: "Italiano", flag: "🇮🇹", voice: "it-IT" },
  { id: "en", name: "English", flag: "🇬🇧", voice: "en-GB" },
  { id: "de", name: "Deutsch", flag: "🇩🇪", voice: "de-DE" },
  { id: "ru", name: "Русский", flag: "🇷🇺", voice: "ru-RU" },
  { id: "ja", name: "日本語", flag: "🇯🇵", voice: "ja-JP" },
  { id: "zh", name: "中文", flag: "🇨🇳", voice: "zh-CN" },
  { id: "fr", name: "Français", flag: "🇫🇷", voice: "fr-FR", trap: true },
];

function detect() {
  const nav = (navigator.language || "it").slice(0, 2).toLowerCase();
  return LANGS.some((l) => l.id === nav && !l.trap) ? nav : "it";
}

export let lang = settings.lang && LANGS.some((l) => l.id === settings.lang && !l.trap) ? settings.lang : detect();

export function setLang(id) {
  lang = id;
  settings.lang = id;
  saveSettings();
  document.documentElement.lang = id;
}

export function voiceLang(id = lang) {
  return LANGS.find((l) => l.id === id)?.voice ?? "it-IT";
}

/** Traduce una frase italiana; {x} viene sostituito con vars.x */
export function t(it, vars) {
  let s = it;
  if (lang !== "it") {
    const tr = UI[it];
    if (tr && tr[lang]) s = tr[lang];
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "") + "");
  return s;
}

export function fmtNum(n) {
  const loc = { it: "it-IT", en: "en-GB", de: "de-DE", ru: "ru-RU", ja: "ja-JP", zh: "zh-CN" }[lang] ?? "it-IT";
  return Math.round(n).toLocaleString(loc);
}

export function locale() {
  return { it: "it-IT", en: "en-GB", de: "de-DE", ru: "ru-RU", ja: "ja-JP", zh: "zh-CN" }[lang] ?? "it-IT";
}

/** La ramanzina di Nonna Pina per chi sceglie il francese (non si può saltare). */
export const FRENCH_RANT = [
  { l: "it-IT", text: "Francese?! FRANCESE?! Ma ti sei bevuto il cervello? Qui si parla la lingua di Dante, altro che baguette!" },
  { l: "it-IT", text: "Voi cugini d'oltralpe ci avete preso la Gioconda e non ce l'avete mai ridata. Vergogna!" },
  { l: "en-GB", text: "French? Seriously? Even the horses are laughing at you. Go to your room!" },
  { l: "de-DE", text: "Französisch? Nein, nein, nein! Nicht in meinem Hippodrom! Schäm dich!" },
  { l: "ru-RU", text: "Французский? Ты что, с ума сошёл? Бабушка Пина очень недовольна!" },
  { l: "ja-JP", text: "フランス語？ありえない！ピーナおばあちゃんは怒っています！" },
  { l: "zh-CN", text: "法语？不行！皮娜奶奶非常生气！马都在笑你！" },
  { l: "it-IT", text: "E il formaggio che fa la puzza lo chiamano gourmet. Ma per piacere!" },
  { l: "it-IT", text: "Adesso torni all'italiano come una persona perbene. E non farlo mai più, che alla nonna viene la pressione alta." },
];
