// Utility per l'interfaccia: escape, formati, ritratti SVG dei cavalli, giubbe, barre.
import { t, fmtNum, locale } from "./i18n.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const money = (n) => `${fmtNum(n)} ƒ`;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function timeHM(ts) {
  return new Date(ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}
export function dayLabel(ts) {
  return new Date(ts).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Rome" });
}
export function ago(ts, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return t("adesso");
  if (s < 3600) return t("{n} min fa", { n: Math.round(s / 60) });
  if (s < 86400) return t("{n} ore fa", { n: Math.round(s / 3600) });
  return t("{n} giorni fa", { n: Math.round(s / 86400) });
}
export function countdown(ms) {
  if (ms <= 0) return t("ora");
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, "0")}m`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}
export function fmtRace(s) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}

export function bar(v, max = 100, cls = "") {
  const p = Math.max(0, Math.min(100, (v / max) * 100));
  return `<div class="bar ${cls}"><i style="width:${p}%"></i></div>`;
}
export function stars(n) {
  let s = "";
  for (let i = 1; i <= 5; i++) s += n >= i ? "★" : n >= i - 0.5 ? "⯪" : "☆";
  return `<span class="stars">${s}</span>`;
}

export function silksSvg(s, size = 22) {
  if (!s) return "";
  const id = "s" + Math.random().toString(36).slice(2, 8);
  let pat = "";
  const p = s.primary, q = s.secondary;
  switch (s.pattern) {
    case "strisce": pat = `<rect x="4" width="4" height="24" fill="${q}"/><rect x="12" width="4" height="24" fill="${q}"/><rect x="20" width="4" height="24" fill="${q}"/>`; break;
    case "bande": pat = `<rect y="4" width="24" height="4" fill="${q}"/><rect y="13" width="24" height="4" fill="${q}"/>`; break;
    case "stella": pat = `<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" fill="${q}"/>`; break;
    case "croce": pat = `<rect x="10" width="4" height="24" fill="${q}"/><rect y="10" width="24" height="4" fill="${q}"/>`; break;
    case "pois": pat = `<circle cx="6" cy="6" r="2.4" fill="${q}"/><circle cx="18" cy="6" r="2.4" fill="${q}"/><circle cx="12" cy="13" r="2.4" fill="${q}"/><circle cx="6" cy="19" r="2.4" fill="${q}"/><circle cx="18" cy="19" r="2.4" fill="${q}"/>`; break;
    case "diagonale": pat = `<path d="M0 18L18 0h6v6L6 24H0z" fill="${q}"/>`; break;
    case "quarti": pat = `<rect width="12" height="12" fill="${q}"/><rect x="12" y="12" width="12" height="12" fill="${q}"/>`; break;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="vertical-align:middle"><defs><clipPath id="${id}"><path d="M3 6Q3 2 8 2h8q5 0 5 4v14q0 2-2 2H5q-2 0-2-2z"/></clipPath></defs><g clip-path="url(#${id})"><rect width="24" height="24" fill="${p}"/>${pat}</g><path d="M3 6Q3 2 8 2h8q5 0 5 4v14q0 2-2 2H5q-2 0-2-2z" fill="none" stroke="#1b1a3a" stroke-width="2"/></svg>`;
}

function rngFrom(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Ritratto laterale del cavallo, stile anime con contorni spessi. */
export function horseSvg(look, opts = {}) {
  if (!look) return "";
  const r = rngFrom(look.patternSeed || 7);
  const O = "#1b1a3a";
  const body = look.body, mane = look.mane, pts = look.points;
  const white = "#fbfaf5";
  const uid = "c" + Math.random().toString(36).slice(2, 8);
  const legs = look.legs ?? 1, neck = look.neck ?? 1, head = look.head ?? 1, build = look.build ?? 0.5;
  const by = 62 - (legs - 1) * 30; // altezza del corpo
  const bodyRy = 15 + build * 4;
  let patternEls = "";
  if (look.pattern === "dapple") for (let i = 0; i < 12; i++) patternEls += `<circle cx="${70 + r() * 70}" cy="${by - 8 + r() * 18}" r="${2.5 + r() * 3}" fill="#f2f2f2" opacity=".55"/>`;
  if (look.pattern === "pinto") for (let i = 0; i < 3; i++) patternEls += `<ellipse cx="${75 + r() * 60}" cy="${by - 2 + r() * 12}" rx="${10 + r() * 10}" ry="${7 + r() * 7}" fill="${look.patchColor}"/>`;
  if (look.pattern === "spots") for (let i = 0; i < 26; i++) patternEls += `<circle cx="${68 + r() * 78}" cy="${by - 12 + r() * 26}" r="${1.2 + r() * 1.8}" fill="${look.patchColor}"/>`;
  if (look.pattern === "roan") for (let i = 0; i < 40; i++) patternEls += `<circle cx="${68 + r() * 78}" cy="${by - 12 + r() * 26}" r=".9" fill="#fff" opacity=".6"/>`;
  if (look.pattern === "dorsal") patternEls += `<path d="M70 ${by - bodyRy + 2} Q105 ${by - bodyRy - 2} 140 ${by - bodyRy + 3}" stroke="${pts}" stroke-width="3" fill="none"/>`;
  const sock = (k) => (look.socks?.[k] ?? 0);
  const leg = (x, k, front) => {
    const top = by + 6, len = 44 * legs;
    const s = sock(k);
    const lowerCol = s >= 2 ? white : pts;
    const mid = top + len * 0.55;
    return `<path d="M${x - 5} ${top} L${x + 5} ${top} L${x + 3} ${mid} L${x + 3} ${top + len} L${x - 3} ${top + len} L${x - 3} ${mid} Z" fill="${body}" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M${x - 3} ${s === 3 ? top + len * 0.35 : mid} L${x + 3} ${s === 3 ? top + len * 0.35 : mid} L${x + 3} ${top + len} L${x - 3} ${top + len} Z" fill="${lowerCol}" stroke="${O}" stroke-width="2"/>
      ${s === 1 ? `<rect x="${x - 3.5}" y="${top + len - 5}" width="7" height="4" fill="${white}" stroke="${O}" stroke-width="1.5"/>` : ""}
      <rect x="${x - 4.5}" y="${top + len}" width="9" height="6" rx="1.5" fill="#3a302a" stroke="${O}" stroke-width="2"/>`;
  };
  const nx = 148, ny = by - 10;
  const hx = nx + 26 * neck, hy = ny - 30 * neck;
  const faceMark =
    look.face === "stella" ? `<circle cx="13" cy="-7" r="2.6" fill="${white}"/>` :
    look.face === "lista" ? `<path d="M13 -8 Q22 -4 30 4" stroke="${white}" stroke-width="2.5" fill="none" stroke-linecap="round"/>` :
    look.face === "lista_larga" ? `<path d="M12 -8 Q22 -4 31 5" stroke="${white}" stroke-width="5.5" fill="none" stroke-linecap="round"/>` :
    look.face === "muso_bianco" ? `<path d="M20 2 Q30 -2 34 6 Q34 14 26 15 Q18 14 20 2Z" fill="${white}"/>` : "";
  const maneLong = look.maneStyle === "lunga" ? 9 : look.maneStyle === "ribelle" ? 8 : look.maneStyle === "intrecciata" ? 3 : 5;
  let maneTufts = "";
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const mx = nx - 6 + (hx - nx - 2) * u, my = ny - 8 + (hy - ny + 2) * u;
    maneTufts += look.maneStyle === "intrecciata"
      ? `<circle cx="${mx - 3}" cy="${my - 2}" r="3" fill="${mane}" stroke="${O}" stroke-width="1.5"/>`
      : `<path d="M${mx} ${my} q${-maneLong} ${2 + (i % 2) * 3} ${-maneLong * 0.6} ${maneLong + 4}" fill="${mane}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>`;
  }
  const silk = opts.silks;
  const jockey = silk && opts.jockey !== false
    ? `<g><path d="M95 ${by - bodyRy - 2} q10 -16 26 -14 q8 2 4 9 l-22 9z" fill="${silk.primary}" stroke="${O}" stroke-width="2.2"/><circle cx="127" cy="${by - bodyRy - 22}" r="6.5" fill="${silk.cap}" stroke="${O}" stroke-width="2"/></g>`
    : "";
  return `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="${uid}"><ellipse cx="105" cy="${by}" rx="44" ry="${bodyRy}"/></clipPath></defs>
    <ellipse cx="105" cy="${by + 54 * legs + 6}" rx="50" ry="5" fill="rgba(27,26,58,.18)"/>
    ${leg(80, 2, false)}${leg(132, 0, true)}
    <path d="M62 ${by - 6} q-20 6 -16 34 q4 -6 10 -4 q-4 -18 8 -26" fill="${mane}" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M${nx - 14} ${ny + 4} L${nx + 2} ${ny - 14} L${hx + 4} ${hy - 6} L${hx + 10} ${hy + 8} L${nx + 12} ${ny + 14} Z" fill="${body}" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>
    <ellipse cx="105" cy="${by}" rx="44" ry="${bodyRy}" fill="${body}" stroke="${O}" stroke-width="2.6"/>
    <g clip-path="url(#${uid})">${patternEls}<ellipse cx="96" cy="${by - bodyRy * 0.45}" rx="30" ry="${bodyRy * 0.35}" fill="#fff" opacity=".22"/><ellipse cx="105" cy="${by + bodyRy - 2}" rx="40" ry="6" fill="#000" opacity=".12"/></g>
    ${maneTufts}
    <g transform="translate(${hx} ${hy}) rotate(48) scale(${head * 1.15})" >
      <path d="M-6 -9 Q12 -13 31 0 Q38 9 31 15 Q18 18 4 13 Q-8 7 -6 -9Z" fill="${body}" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M-2 -10 l-3 -11 l9 7z" fill="${body}" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="8" cy="-2" rx="4.2" ry="4.6" fill="#fff" stroke="${O}" stroke-width="1.4"/>
      <circle cx="8.6" cy="-1.6" r="3" fill="${look.eyes === "azzurri" ? "#3fa9ff" : "#3a2414"}"/><circle cx="9.8" cy="-3" r="1.2" fill="#fff"/>
      ${faceMark}
      <ellipse cx="30" cy="8" rx="1.6" ry="1.1" fill="${O}"/>
    </g>
    ${leg(92, 3, false)}${leg(144, 1, true)}
    ${jockey}
  </svg>`;
}

export function statusTags(hv) {
  const tags = [];
  if (hv.dead) tags.push(`<span class="tag">🕯️ ${t("morto")}</span>`);
  else {
    if (hv.retired) tags.push(`<span class="tag purple">🏖️ ${t("in pensione")}</span>`);
    if (hv.cond?.injury) tags.push(`<span class="tag red">🚑 ${esc(hv.cond.injury.name)}</span>`);
    if (hv.illness) tags.push(`<span class="tag red">🤒 ${t("malato")}</span>`);
    if (hv.cond?.busy) tags.push(`<span class="tag blue">⏳ ${esc(hv.cond.busy.reason)}</span>`);
    if (hv.cond?.pregnant) tags.push(`<span class="tag pink">🍼 ${t("gravida")}</span>`);
    if (hv.insurance && hv.insurance.policy !== "nessuna") tags.push(`<span class="tag green">📄 ${t("assicurato")}</span>`);
    if (hv.price) tags.push(`<span class="tag gold">🏷️ ${money(hv.price)}</span>`);
    if (hv.age < 2) tags.push(`<span class="tag pink">🍼 ${t("puledro")}</span>`);
  }
  return tags.join(" ");
}

export function sexIcon(s) {
  return s === "M" ? "♂" : "♀";
}

export function formStr(form) {
  return (form ?? []).slice(0, 5).map((p) => (p === 0 ? "X" : p > 9 ? "0" : String(p))).join("") || "—";
}
