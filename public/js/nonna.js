// Nonna Pina: la stessa della Sagra, ora telecronista all'ippodromo e guida del gioco.
// SVG disegnato a mano (con cuffie da telecronista), nuvoletta e voce sintetizzata.
import { settings } from "./settings.js";
import { lang, voiceLang } from "./i18n.js";

const MOUTHS = {
  happy: '<path d="M40 70 Q50 80 60 70" stroke="#7a2b2b" stroke-width="3" fill="#c0392b" stroke-linecap="round"/>',
  proud: '<path d="M38 68 Q50 84 62 68 Z" fill="#7a2b2b"/><path d="M42 70 Q50 74 58 70" fill="#fff"/>',
  angry: '<path d="M40 75 Q50 67 60 75" stroke="#7a2b2b" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  shock: '<ellipse cx="50" cy="73" rx="6" ry="8" fill="#7a2b2b"/>',
  sly: '<path d="M40 72 Q52 78 62 68" stroke="#7a2b2b" stroke-width="3" fill="none" stroke-linecap="round"/>',
  talk: '<ellipse cx="50" cy="72" rx="8" ry="5" fill="#7a2b2b"/>',
  yell: '<ellipse cx="50" cy="73" rx="10" ry="9" fill="#7a2b2b"/><path d="M43 69 Q50 66 57 69" fill="#fff"/>',
};

const BROWS = {
  happy: '<path d="M30 42 Q36 38 42 41M58 41 Q64 38 70 42" stroke="#9e9e9e" stroke-width="3" fill="none" stroke-linecap="round"/>',
  proud: '<path d="M30 40 Q36 35 42 39M58 39 Q64 35 70 40" stroke="#9e9e9e" stroke-width="3" fill="none" stroke-linecap="round"/>',
  angry: '<path d="M30 38 L43 44M57 44 L70 38" stroke="#757575" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  shock: '<path d="M30 36 Q36 31 42 35M58 35 Q64 31 70 36" stroke="#9e9e9e" stroke-width="3" fill="none" stroke-linecap="round"/>',
  sly: '<path d="M30 42 Q36 40 42 42M58 38 Q64 34 70 38" stroke="#9e9e9e" stroke-width="3" fill="none" stroke-linecap="round"/>',
};
BROWS.yell = BROWS.angry;

export function nonnaSvg(mood = "happy", talking = false, headset = true) {
  const mouth = talking ? (mood === "yell" ? MOUTHS.yell : MOUTHS.talk) : MOUTHS[mood] || MOUTHS.happy;
  const brows = BROWS[mood] || BROWS.happy;
  const phones = headset
    ? `<path d="M16 50 Q16 14 50 14 Q84 14 84 50" stroke="#2a2a2a" stroke-width="5" fill="none"/>
       <rect x="9" y="46" width="12" height="20" rx="5" fill="#2a2a2a"/><rect x="79" y="46" width="12" height="20" rx="5" fill="#2a2a2a"/>
       <path d="M15 64 Q18 84 38 80" stroke="#2a2a2a" stroke-width="2.5" fill="none"/><circle cx="40" cy="80" r="3.5" fill="#d62828"/>`
    : "";
  return `<svg viewBox="0 0 100 115" aria-label="Nonna Pina" role="img">
    <path d="M14 112 Q16 88 50 86 Q84 88 86 112 Z" fill="#7b2cbf"/>
    <path d="M30 92 L50 112 L70 92" fill="#9d4edd"/>
    <circle cx="50" cy="100" r="3" fill="#ffc43d"/>
    <circle cx="50" cy="12" r="11" fill="#d9d9d9" stroke="#bdbdbd" stroke-width="2"/>
    <ellipse cx="50" cy="55" rx="31" ry="33" fill="#f6c9a8"/>
    <path d="M19 52 Q18 20 50 20 Q82 20 81 52 Q76 34 62 30 Q50 38 36 30 Q24 36 19 52 Z" fill="#e0e0e0" stroke="#c4c4c4" stroke-width="1.5"/>
    <circle cx="19" cy="64" r="3.5" fill="#ffc43d"/><circle cx="81" cy="64" r="3.5" fill="#ffc43d"/>
    ${brows}
    <g fill="rgba(255,255,255,.35)" stroke="#4a3426" stroke-width="2.5">
      <circle cx="37" cy="52" r="9"/><circle cx="63" cy="52" r="9"/>
    </g>
    <path d="M46 52 Q50 49 54 52" stroke="#4a3426" stroke-width="2.5" fill="none"/>
    <circle cx="37" cy="53" r="2.8" fill="#2a1b0f"/><circle cx="63" cy="53" r="2.8" fill="#2a1b0f"/>
    <circle cx="28" cy="66" r="6" fill="#ff8fa3" opacity=".55"/><circle cx="72" cy="66" r="6" fill="#ff8fa3" opacity=".55"/>
    <path d="M50 56 Q46 64 50 65 Q54 64 52 60" stroke="#d9967a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="64" cy="73" r="1.4" fill="#6d4c41"/>
    ${mouth}
    ${phones}
  </svg>`;
}

let el, bubble, face;
let mood = "happy";
let hideTimer = null;
let mouthTimer = null;
let voices = [];
let shownAt = 0;
let pending = null;
let pendingTimer = null;
let token = 0;
let speaking = false;
const MIN_SHOW_MS = 1500;

function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = speechSynthesis.getVoices();
}

export function pickVoice(code) {
  const pref = (code || voiceLang()).toLowerCase();
  const base = pref.slice(0, 2);
  const vs = voices.filter((v) => v.lang && v.lang.toLowerCase().replace("_", "-").startsWith(base));
  const fem = vs.find((v) => /alice|elsa|federica|paola|female|donna|google|milena|anna|kyoko|ting|mei|sara|petra|vicki|samantha/i.test(v.name));
  return fem || vs[0] || null;
}

export function initNonna(container) {
  el = container;
  el.className = "nonna";
  el.innerHTML = "";
  face = document.createElement("div");
  face.className = "nonna-face";
  face.innerHTML = nonnaSvg(mood, false);
  bubble = document.createElement("div");
  bubble.className = "bubble";
  el.appendChild(face);
  el.appendChild(bubble);
  face.addEventListener("click", () => bubble.classList.toggle("show"));
  loadVoices();
  if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

function setFace(m, talking) {
  if (face) face.innerHTML = nonnaSvg(m, talking);
}

/**
 * Fa parlare la nonna. opts.prio alta interrompe quello che sta dicendo;
 * le battute a bassa priorità vengono saltate se è già impegnata (la telecronaca resta al passo).
 */
export function nonnaSay(text, m = "happy", opts = {}) {
  if (!el) return Promise.resolve();
  const prio = opts.prio ?? 1;
  const since = Date.now() - shownAt;
  if (speaking && prio < 2 && !opts.queue) {
    pending = { text, m, opts };
    return Promise.resolve();
  }
  if (since < MIN_SHOW_MS && prio < 3 && !opts.force) {
    pending = { text, m, opts };
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      const p = pending;
      pending = null;
      if (p) show(p.text, p.m, p.opts);
    }, MIN_SHOW_MS - since);
    return Promise.resolve();
  }
  return show(text, m, opts);
}

export function isSpeaking() {
  return speaking;
}

function show(text, m, opts = {}) {
  return new Promise((resolve) => {
    const my = ++token;
    shownAt = Date.now();
    mood = m;
    speaking = true;
    bubble.textContent = text;
    bubble.classList.add("show");
    el.classList.add("talking");
    clearInterval(mouthTimer);
    clearTimeout(hideTimer);
    let open = false;
    mouthTimer = setInterval(() => {
      open = !open;
      setFace(mood, open);
    }, 130);
    const readMs = Math.min(6000, 1100 + text.length * 48);
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      if (my === token) {
        speaking = false;
        clearInterval(mouthTimer);
        el.classList.remove("talking");
        setFace(mood, false);
        hideTimer = setTimeout(() => {
          if (my === token) bubble.classList.remove("show");
        }, opts.linger ?? 2200);
        const p = pending;
        pending = null;
        if (p && !opts.noFollow) setTimeout(() => show(p.text, p.m, p.opts), 150);
      }
      resolve();
    };
    const voice = pickVoice(opts.lang);
    if (settings.voice && voice && "speechSynthesis" in window) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = opts.rate ?? 1.12;
        u.pitch = opts.pitch ?? 1.25;
        u.volume = settings.voiceVolume ?? 1;
        u.onend = done;
        u.onerror = done;
        speechSynthesis.speak(u);
        setTimeout(done, readMs + 6000);
        return;
      } catch {
        /* timer */
      }
    }
    setTimeout(done, readMs);
  });
}

export function nonnaSilence() {
  pending = null;
  clearTimeout(pendingTimer);
  speaking = false;
  token++;
  clearInterval(mouthTimer);
  if (el) el.classList.remove("talking");
  try {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  } catch {
    /* niente */
  }
}

export function nonnaHide() {
  if (bubble) bubble.classList.remove("show");
}

export { lang };
