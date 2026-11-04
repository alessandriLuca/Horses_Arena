// Cuore del client: stato, API, websocket, router, toast, finestre modali.
import { t, lang, setLang, LANGS } from "./i18n.js";
import { initNonna, nonnaSay } from "./nonna.js";
import { esc, money, $, $$ } from "./ui.js";
import { initTutorial, refreshTutorial, tutorialSeen } from "./tutorial.js";
import { coin, click } from "./audio.js";
import * as S from "./screens/index.js";
import { initAssistant } from "./assistant.js";
import { openMenu } from "./menu.js";

export const state = {
  token: null,
  me: null,
  catalog: null,
  serverOffset: 0,
  ws: null,
  online: 0,
  route: "/",
};

try {
  state.token = localStorage.getItem("ha_token");
} catch {
  /* niente */
}

// ------------------------------------------------------------------ API
export async function api(path, body, method) {
  const opts = { method: method ?? (body ? "POST" : "GET"), headers: {} };
  if (body) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  if (state.token) opts.headers.authorization = "Bearer " + state.token;
  const res = await fetch("/api" + path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { error: t("Risposta non valida dal server.") };
  }
  if (!res.ok) {
    const err = new Error(data?.error ?? "Errore");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Esegue un'azione: mostra errori come toast, ricarica il profilo. */
export async function act(path, body, okMsg) {
  try {
    const r = await api(path, body ?? {});
    if (okMsg !== false) toast(typeof okMsg === "string" ? okMsg : r.text ?? t("Fatto!"), "ok");
    await loadMe();
    return r;
  } catch (e) {
    toast(e.message, "err");
    return null;
  }
}

export async function loadMe() {
  if (!state.token) return null;
  try {
    state.me = await api("/me");
    state.serverOffset = state.me.now - Date.now();
    renderTop();
    refreshTutorial();
    return state.me;
  } catch (e) {
    if (e.status === 400 || e.status === 401) {
      logout(false);
    }
    return null;
  }
}

export async function catalog() {
  if (!state.catalog) state.catalog = await api("/catalog");
  return state.catalog;
}

export function quirkName(id) {
  return state.catalog?.quirks?.find((q) => q.id === id)?.name ?? id;
}

export function serverNow() {
  return Date.now() + state.serverOffset;
}

export function logout(reload = true) {
  state.token = null;
  state.me = null;
  try {
    localStorage.removeItem("ha_token");
  } catch {
    /* niente */
  }
  if (reload) location.href = "/";
}

export function setToken(tok) {
  state.token = tok;
  try {
    localStorage.setItem("ha_token", tok);
  } catch {
    /* niente */
  }
}

// ------------------------------------------------------------------ UI comune
export function toast(text, cls = "") {
  const box = $("#toasts");
  const d = document.createElement("div");
  d.className = "toast " + cls;
  d.textContent = text;
  box.appendChild(d);
  setTimeout(() => d.remove(), cls === "err" ? 5200 : 3800);
  return d;
}

export function modal(html, onMount) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal"><button class="btn small ghost close" aria-label="chiudi">✕</button>${html}</div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => {
    if (e.target === bg) close();
  });
  bg.querySelector(".close").onclick = close;
  onMount?.(bg.querySelector(".modal"), close);
  return close;
}

export function confirmBox(text, okLabel = t("Conferma")) {
  return new Promise((resolve) => {
    let done = false;
    const close = modal(`<h3>${t("Sei sicuro?")}</h3><p>${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-no>${t("Annulla")}</button><button class="btn primary" data-ok>${esc(okLabel)}</button></div>`, (m, c) => {
      m.querySelector("[data-no]").onclick = () => { done = true; c(); resolve(false); };
      m.querySelector("[data-ok]").onclick = () => { done = true; c(); resolve(true); };
    });
    void close;
    void done;
  });
}

/** Chiede di scegliere un cavallo della propria scuderia. */
export function pickHorse(title, filter = () => true) {
  const list = (state.me?.horses ?? []).filter((h) => !h.dead && filter(h));
  return new Promise((resolve) => {
    if (!list.length) {
      toast(t("Nessun cavallo adatto nella tua scuderia."), "err");
      return resolve(null);
    }
    modal(`<h3>${esc(title)}</h3><div class="stack">${list
      .map((h) => `<button class="btn block" data-id="${h.id}" style="justify-content:space-between"><span>${h.sex === "M" ? "♂" : "♀"} ${esc(h.name)}</span><small>${t("val.")} ${h.overall} · ${h.rating}</small></button>`)
      .join("")}</div>`, (m, close) => {
      m.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => { close(); resolve(b.dataset.id); }));
    });
  });
}

let lastMoney = null;
export function renderTop() {
  const me = state.me;
  const m = $("#money");
  const bell = $("#bell");
  const nav = $("#nav");
  if (!me) {
    m.classList.add("hidden");
    bell.classList.add("hidden");
    nav.classList.add("hidden");
    $("#mailBtn").classList.add("hidden");
    $("#menuBtn").classList.add("hidden");
    return;
  }
  m.classList.remove("hidden");
  bell.classList.remove("hidden");
  $("#mailBtn").classList.remove("hidden");
  $("#menuBtn").classList.remove("hidden");
  const md = $("#mailDot");
  md.textContent = String(me.mailUnread ?? 0);
  md.classList.toggle("hidden", !me.mailUnread);
  nav.classList.remove("hidden");
  m.textContent = money(me.money);
  m.classList.toggle("neg", me.money < 0);
  if (lastMoney !== null && me.money > lastMoney) coin();
  lastMoney = me.money;
  const unseen = me.notes.filter((n) => !n.seen).length;
  const dot = $("#bellDot");
  dot.textContent = unseen > 9 ? "9+" : String(unseen);
  dot.classList.toggle("hidden", unseen === 0);
  for (const a of $$("#nav a")) {
    const lb = a.querySelector(".lb");
    lb.textContent = t({ home: "Home", scuderia: "Scuderia", corse: "Corse", mercato: "Mercato", altro: "Menu" }[a.dataset.nav]);
  }
}

// ------------------------------------------------------------------ websocket
let wsRetry = 1000;
export function connectWs() {
  try {
    state.ws?.close();
  } catch {
    /* niente */
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/api/ws${state.token ? "?token=" + encodeURIComponent(state.token) : ""}`);
  state.ws = ws;
  ws.onopen = () => (wsRetry = 1000);
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    onWs(m);
  };
  ws.onclose = () => {
    setTimeout(connectWs, wsRetry);
    wsRetry = Math.min(30000, wsRetry * 2);
  };
  setInterval(() => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: "ping" }));
  }, 30000);
}

const listeners = new Set();
export function onWsMessage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function onWs(m) {
  if (m.online) state.online = m.online;
  for (const fn of listeners) fn(m);
  switch (m.t) {
    case "money":
      if (state.me) {
        state.me.money = m.money;
        renderTop();
      }
      break;
    case "note":
      toast(m.text, m.kind === "crime" || m.kind === "death" ? "err" : "");
      if (/🏁|🏆|💰/.test(m.text)) nonnaSay(m.text.slice(0, 160), "proud", { prio: 1 });
      loadMe();
      break;
    case "race_soon": {
      const tt = toast(`🏇 ${m.name}: ${t("sta per partire! Tocca qui per guardarla.")}`, "gold");
      tt.style.cursor = "pointer";
      tt.onclick = () => go("/corsa/" + m.raceId + "?watch=1");
      break;
    }
    case "chat_sys":
      toast(m.text, "gold");
      break;
  }
}

// ------------------------------------------------------------------ router
const ROUTES = [
  [/^\/$/, S.home],
  [/^\/scuderia$/, S.stable],
  [/^\/scuderia\/([\w-]+)$/, S.publicStable],
  [/^\/cavallo\/([\w-]+)$/, S.horse],
  [/^\/corse$/, S.races],
  [/^\/corsa\/([\w-]+)$/, S.race],
  [/^\/mercato$/, S.market],
  [/^\/altro$/, S.more],
  [/^\/campionato$/, S.league],
  [/^\/tornei$/, S.tournaments],
  [/^\/torneo\/([\w-]+)$/, S.tournament],
  [/^\/sfide$/, S.challenges],
  [/^\/bacheca$/, S.offers],
  [/^\/clinica$/, S.clinic],
  [/^\/laboratorio$/, S.lab],
  [/^\/mercato-nero$/, S.crime],
  [/^\/riproduzione$/, S.breeding],
  [/^\/classifiche$/, S.leaderboard],
  [/^\/bar$/, S.chat],
  [/^\/profilo$/, S.profile],
  [/^\/notifiche$/, S.notifications],
  [/^\/guida$/, S.guide],
  [/^\/posta$/, S.mail],
];

let cleanup = null;
export function go(path, replace = false) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  render();
}

export function setCleanup(fn) {
  cleanup = fn;
}

export async function render() {
  const url = new URL(location.href);
  const path = url.pathname;
  state.route = path;
  try {
    cleanup?.();
  } catch {
    /* niente */
  }
  cleanup = null;
  const view = $("#view");
  for (const a of $$("#nav a")) {
    const p = a.getAttribute("href");
    a.classList.toggle("active", p === "/" ? path === "/" : path.startsWith(p) || (p === "/altro" && /^\/(campionato|tornei|torneo|sfide|bacheca|clinica|laboratorio|mercato-nero|riproduzione|classifiche|bar|profilo|guida|notifiche|posta)/.test(path)));
  }
  if (!state.me && path !== "/") {
    if (state.token) await loadMe();
    if (!state.me) return go("/", true);
  }
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) {
      view.innerHTML = `<div class="empty">⏳</div>`;
      try {
        await fn(view, ...m.slice(1), url.searchParams);
      } catch (e) {
        console.error(e);
        view.innerHTML = `<div class="card"><h3>😵 ${t("Ops")}</h3><p>${esc(e.message)}</p><button class="btn" onclick="history.back()">${t("Indietro")}</button></div>`;
      }
      window.scrollTo(0, 0);
      tutorialSeen(path);
      return;
    }
  }
  view.innerHTML = `<div class="card"><h3>404</h3><p>${t("Pagina non trovata.")}</p></div>`;
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='/'], [data-go]");
  if (!a || e.metaKey || e.ctrlKey) return;
  const href = a.getAttribute("href") ?? a.dataset.go;
  if (!href || a.target === "_blank") return;
  e.preventDefault();
  click();
  go(href);
});
window.addEventListener("popstate", render);

// ------------------------------------------------------------------ avvio
async function boot() {
  document.documentElement.lang = lang;
  initNonna($("#nonna"));
  $("#bell").onclick = () => go("/notifiche");
  $("#mailBtn").onclick = () => go("/posta");
  $("#menuBtn").onclick = () => openMenu();
  try {
    await catalog();
  } catch {
    /* offline */
  }
  if (state.token) await loadMe();
  renderTop();
  initTutorial();
  connectWs();
  await render();
  initAssistant();
}

boot();

export { LANGS, setLang };
