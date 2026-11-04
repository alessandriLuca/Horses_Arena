// Preferenze del giocatore (salvate solo nel browser).
const KEY = "ha_settings";
const defaults = { voice: true, sound: true, voiceVolume: 1, lang: "", quality: "auto", fx: true };

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...defaults };
  }
}

export const settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* modalità privata */
  }
}
