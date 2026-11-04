import { state, api, act, toast, go, loadMe, modal, pickHorse, quirkName, serverNow, setCleanup, catalog } from "../app.js";
import { t } from "../i18n.js";
import { esc, money, timeHM, dayLabel, countdown, silksSvg, horseSvg, formStr, fmtRace } from "../ui.js";
import { openViewer } from "../race3d/viewer.js";
import { goingName, weatherName } from "../race3d/commentary.js";
import { lang } from "../i18n.js";
import { tutorialMark } from "../tutorial.js";
import { nonnaSay } from "../nonna.js";

const KIND = { open: "Corsa libera", cup: "Coppa del Giorno", cup_final: "Finale di Coppa", league: "Campionato", gp: "Gran Premio", friendly: "Amichevole", tournament: "Torneo" };
const W_ICON = { sole: "☀️", nuvoloso: "⛅", vento: "💨", pioggia: "🌧️", temporale: "⛈️", nebbia: "🌫️", neve: "❄️" };

export function raceRow(r, now) {
  const live = r.status === "closed" && now >= r.startAt - 20000;
  const done = r.status === "done";
  return `<div class="race-row ${r.big ? "big" : ""} ${live ? "live" : ""}" data-go="/corsa/${r.id}${live ? "?watch=1" : ""}">
    <div class="time">${timeHM(r.startAt)}<small>${done ? "✓" : live ? "LIVE" : countdown(r.startAt - now)}</small></div>
    <div><div class="nm">${r.big ? "⭐ " : ""}${esc(r.name)}</div>
    <div class="meta">${t(KIND[r.kind] ?? r.kind)} · ${r.distance} m${r.hurdles ? " · " + t("siepi") : ""} · ${W_ICON[r.weather] ?? ""} ${goingName(r.going, lang)} · 💰 ${money(r.purse)}${r.fee ? ` · ${t("iscr.")} ${money(r.fee)}` : ""} · 🐴 ${r.entries}${r.humans ? ` (${r.humans} 👤)` : ""}</div></div>
    ${live ? `<span class="badge-live">LIVE</span>` : done ? `<span class="tag">${t("finita")}</span>` : `<span>›</span>`}
  </div>`;
}

export async function races(view, _p, params) {
  const now = serverNow();
  const data = await api(`/races?from=${now - 3 * 3600_000}&to=${now + 30 * 3600_000}`);
  const horseId = params?.get("horse");
  const filters = [["all", "Tutte"], ["open", "Libere"], ["league", "Campionato"], ["cup", "Coppa"], ["gp", "Gran Premi"], ["friendly", "Amichevoli"], ["done", "Concluse"]];
  let f = sessionStorage.getItem("ha_rf") || "all";
  const draw = () => {
    const list = data.races.filter((r) => {
      if (f === "done") return r.status === "done";
      if (r.status === "done") return false;
      if (f === "all") return r.status !== "void" && (r.kind !== "friendly" || r.open || r.humans);
      if (f === "cup") return r.kind === "cup" || r.kind === "cup_final";
      return r.kind === f;
    });
    const items = (f === "done" ? list.reverse() : list).slice(0, 120);
    let lastDay = "";
    view.querySelector("#list").innerHTML = items.length
      ? items.map((r) => {
          const d = dayLabel(r.startAt);
          const head = d !== lastDay ? `<h4 style="margin:12px 0 6px">${d}</h4>` : "";
          lastDay = d;
          return head + raceRow(r, now);
        }).join("")
      : `<div class="empty">${t("Nessuna corsa qui.")}</div>`;
  };
  view.innerHTML = `<div class="row between"><h2 class="title-pop">🏁 ${t("Corse")}</h2><button class="btn primary" id="fr">🤝 ${t("Amichevole subito")}</button></div>
  ${horseId ? `<div class="card hl">🐴 ${t("Scegli una corsa per {n}: tocca una corsa e premi Iscrivi.", { n: esc(state.me.horses.find((x) => x.id === horseId)?.name ?? "") })}</div>` : ""}
  <div class="card blue" style="font-size:14px;font-weight:700">ℹ️ ${t("Corse libere ogni 30 minuti (8:00–23:30), Coppa del Giorno alle 13:00, Campionato alle 19:00, Gran Premio alle 21:30 (ora italiana). Le iscrizioni chiudono 1 minuto prima.")}</div>
  <div class="tabs">${filters.map(([k, l]) => `<button data-f="${k}" class="${k === f ? "on" : ""}">${t(l)}</button>`).join("")}</div>
  <div id="list"></div>`;
  view.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => {
    f = b.dataset.f;
    sessionStorage.setItem("ha_rf", f);
    view.querySelectorAll("[data-f]").forEach((z) => z.classList.toggle("on", z === b));
    draw();
  }));
  view.querySelector("#fr").onclick = () => friendlyModal();
  draw();
  if (horseId) sessionStorage.setItem("ha_pick", horseId);
}

export async function friendlyModal() {
  const hid = await pickHorse(t("Chi corre l'amichevole?"), (x) => !x.canRace);
  if (!hid) return;
  const cat = await catalog();
  modal(`<h3>🤝 ${t("Amichevole")}</h3><p class="muted">${t("Niente premi né punti, ma i cavalli imparano e scopri i loro quirk.")}</p>
    <label class="f">${t("Ippodromo")}</label><select id="ven"><option value="">🎲 ${t("A caso")}</option>${cat.venues.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join("")}</select>
    <label class="f">${t("Distanza")}</label><select id="dist">${[1000, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3200].map((d) => `<option ${d === 1600 ? "selected" : ""}>${d}</option>`).join("")}</select>
    <label class="row" style="margin-top:8px"><input type="checkbox" id="hur"/> ${t("Con le siepi")}</label>
    <label class="f">${t("Avversari del sistema")}: <b id="bv">7</b></label><input type="range" id="bots" min="1" max="11" value="7" style="width:100%"/>
    <label class="f">${t("Livello avversari")}</label><select id="lvl"><option value="0.25">${t("Facili")}</option><option value="0.45" selected>${t("Normali")}</option><option value="0.7">${t("Forti")}</option><option value="0.9">${t("Campioni")}</option></select>
    <label class="row" style="margin-top:8px"><input type="checkbox" id="open"/> ${t("Aperta ad altri giocatori (parte fra 5 minuti)")}</label>
    <button class="btn primary block" id="ok" style="margin-top:12px">🏁 ${t("Via!")}</button>`, (m, close) => {
    m.querySelector("#bots").oninput = (e) => (m.querySelector("#bv").textContent = e.target.value);
    m.querySelector("#ok").onclick = async () => {
      const r = await act("/friendly", { horseId: hid, venue: m.querySelector("#ven").value || undefined, distance: Number(m.querySelector("#dist").value), hurdles: m.querySelector("#hur").checked, bots: Number(m.querySelector("#bots").value), botLevel: Number(m.querySelector("#lvl").value), open: m.querySelector("#open").checked }, false);
      if (r) { close(); go("/corsa/" + r.raceId); }
    };
  });
}

let viewer = null;
let raceTimer = null;
const autoWatched = new Set();
function closeViewer() {
  viewer?.dispose();
  viewer = null;
  const w = document.getElementById("viewerWrap");
  w.classList.add("hidden");
  w.innerHTML = "";
  document.body.classList.remove("in-viewer");
}

export async function watch(r, live) {
  if (viewer) closeViewer();
  let replay;
  try {
    replay = await api(`/race/${r.id}/replay`);
  } catch (e) {
    toast(e.message, "err");
    return;
  }
  await catalog();
  const w = document.getElementById("viewerWrap");
  w.classList.remove("hidden");
  w.innerHTML = `<div id="vroot" style="position:absolute;inset:0"></div><button class="btn small viewer-close" id="vclose">✕ ${t("Chiudi")}</button>`;
  document.body.classList.add("in-viewer");
  viewer = openViewer(w.querySelector("#vroot"), {
    replay, info: r, live, serverNow: serverNow(), myOwner: state.me?.id, quirkName,
    fetchResult: async () => { const d = await api("/race/" + r.id); return d.result; },
    onClose: () => closeViewer(),
  });
  w.querySelector("#vclose").onclick = () => closeViewer();
  tutorialMark("guarda");
  history.replaceState(null, "", `/corsa/${r.id}`);
}

export async function race(view, id, params) {
  const r = await api("/race/" + id);
  const now = serverNow();
  const me = state.me;
  const closed = r.status !== "open" || now > r.closeAt;
  const canWatch = (r.status === "closed" || r.status === "done") && now >= r.replayAt;
  const isLive = r.status === "closed" && now < r.startAt + r.duration * 1000 + 3000;
  const pick = sessionStorage.getItem("ha_pick");
  const v = (await catalog()).venues.find((x) => x.id === r.venue);
  const res = r.result;
  view.innerHTML = `
  <div class="hero" style="padding:16px">
    <div class="row between"><div><h2 style="margin:0">${r.big ? "⭐ " : ""}${esc(r.name)}</h2>
    <p style="margin:4px 0 0">${t(KIND[r.kind] ?? r.kind)} · ${esc(v?.name ?? r.venue)} · ${r.distance} m${r.hurdles ? " · " + t("siepi") : ""}</p></div>
    <div style="text-align:right"><div style="font-family:var(--font-title);font-size:26px">${timeHM(r.startAt)}</div><div id="cd" style="font-weight:900"></div></div></div>
    <div class="row" style="margin-top:8px">
      <span class="pill">${W_ICON[r.weather] ?? ""} ${weatherName(r.weather, lang)}</span><span class="pill">🌱 ${goingName(r.going, lang)}</span><span class="pill">💰 ${money(r.purse)}</span>${r.fee ? `<span class="pill">🎟️ ${money(r.fee)}</span>` : ""}
    </div>
    <div class="row" style="margin-top:10px">${canWatch ? `<button class="btn gold" id="watch">${isLive ? "🔴 " + t("Guarda in diretta") : "▶ " + t("Guarda la corsa")}</button>` : ""}
    ${!closed && me && r.kind !== "league" && r.kind !== "cup_final" && r.kind !== "tournament" ? `<button class="btn primary" id="enter">✍️ ${t("Iscrivi un cavallo")}</button>` : ""}
    ${r.kind === "friendly" && r.open && !closed ? `<button class="btn" id="joinF">🤝 ${t("Partecipa")}</button>` : ""}</div>
  </div>
  ${r.desc ? `<div class="card blue" style="font-weight:700">${esc(r.desc)}${r.cls ? ` · ${t("Classe")} ${r.cls}` : ""}</div>` : ""}
  ${res ? `<div class="card hl"><h3>🏁 ${t("Ordine d'arrivo")}</h3><table class="t"><tr><th>#</th><th>${t("Cavallo")}</th><th>${t("Tempo")}</th><th>${t("Premio")}</th></tr>${res.map((x) => `<tr class="click ${x.owner && x.owner === me?.id ? "mine" : ""}" data-go="/cavallo/${x.horseId}"><td><b>${x.pos || "—"}</b></td><td>${silksSvg(x.silks, 18)} <b>${esc(x.name)}</b><br><small>${esc(x.stable)} · ${t(x.strategy)}${x.revealed?.length ? " · 🔍 " + x.revealed.map(esc).join(", ") : ""}${x.injury ? " · 🚑 " + esc(x.injury) : ""}${x.doped ? " · 💉 SQ" : ""}</small></td><td>${x.status === "ok" ? fmtRace(x.time) : `<small>${esc(x.dnfReason ?? x.status)}</small>`}</td><td>${x.prize ? money(x.prize) : ""}</td></tr>`).join("")}</table></div>` : ""}
  <div class="card"><h3>🐴 ${t("Partenti")} <small>${r.entries.length}${r.status === "open" ? " · " + t("i cavalli del sistema si aggiungono alla chiusura") : ""}</small></h3>
    ${r.entries.length ? `<table class="t"><tr><th></th><th>${t("Cavallo")}</th><th>${t("Forma")}</th><th>${r.status === "open" ? t("Quota") : ""}</th></tr>${r.entries.map((e) => `<tr class="${e.mine ? "mine" : ""}"><td style="width:62px"><div class="portrait" style="width:60px;height:44px;border-radius:8px;border:2px solid var(--navy);background:linear-gradient(180deg,#7ccbff,#d2f0ff 66%,#8edb6a 66%)">${horseSvg(e.look, { silks: e.silks })}</div></td><td><a href="/cavallo/${e.id}">${esc(e.name)}</a> <small>${e.sex === "M" ? "♂" : "♀"} ${e.age}</small><br><small>${silksSvg(e.silks, 14)} ${esc(e.stable)} · ⭐ ${e.rating}${e.quirks?.length ? " · 🔍 " + e.quirks.map((q) => esc(q.name)).join(", ") : ""}${e.hidden ? ` · ❓×${e.hidden}` : ""}</small></td><td>${formStr(e.form)}</td><td>${e.odds ? `<button class="btn small gold" data-bet="${e.id}">${e.odds.toFixed(2)}</button>` : ""}${e.mine && r.status === "open" && !closed ? `<button class="btn small blue" data-ord="${e.id}" title="${t("Ordini al fantino")}">🎯</button><button class="btn small ghost" data-wd="${e.id}" title="${t("Ritira")}">✕</button>` : ""}</td></tr>`).join("")}</table>` : `<p class="muted">${t("Ancora nessuno: iscriviti per primo!")}</p>`}
    ${r.bets?.length ? `<div class="sep"></div><h4>🎟️ ${t("Le tue scommesse")}</h4>${r.bets.map((b) => `<div>${esc(r.entries.find((e) => e.id === b.horse_id)?.name ?? "?")}: ${money(b.amount)} @ ${(b.payout / 100).toFixed(2)}</div>`).join("")}` : ""}
  </div>`;
  const cd = view.querySelector("#cd");
  const tick = () => {
    const n = serverNow();
    cd.textContent = r.status === "done" ? t("Conclusa") : n < r.closeAt ? `${t("Chiude tra")} ${countdown(r.closeAt - n)}` : n < r.startAt ? `${t("Parte tra")} ${countdown(r.startAt - n)}` : isLive ? "🔴 LIVE" : "";
    if (viewer) return; // mentre si guarda non si ridisegna niente
    if (!canWatch && r.status !== "open" && n >= r.replayAt) rerender();
    else if (r.status === "open" && n > r.closeAt + 4000) rerender();
    else if (isLive && n > r.startAt + r.duration * 1000 + 6000) rerender();
  };
  // un solo timer per pagina: quello vecchio va fermato a ogni ridisegno
  if (raceTimer) clearInterval(raceTimer);
  let rerendering = false;
  const rerender = () => {
    if (rerendering) return;
    rerendering = true;
    clearInterval(raceTimer);
    raceTimer = null;
    race(view, id, params);
  };
  tick();
  raceTimer = setInterval(tick, 1000);
  setCleanup(() => { clearInterval(raceTimer); raceTimer = null; closeViewer(); });
  const w = view.querySelector("#watch");
  if (w) w.onclick = () => watch(r, isLive);
  if (canWatch && params?.get("watch") && !autoWatched.has(r.id)) {
    autoWatched.add(r.id);
    watch(r, isLive);
  }
  const en = view.querySelector("#enter");
  if (en) en.onclick = async () => {
    const hid = pick && me.horses.some((x) => x.id === pick && !x.canRace) ? pick : await pickHorse(t("Chi iscrivi a {n}?", { n: r.name }), (x) => !x.canRace);
    if (!hid) return;
    sessionStorage.removeItem("ha_pick");
    const ok = await act(`/race/${id}/enter`, { horseId: hid }, t("Iscritto! In bocca al lupo."));
    if (ok) { nonnaSay(t("Iscritto! Adesso incrociamo le dita. E anche le zampe."), "proud"); race(view, id, params); }
  };
  const jf = view.querySelector("#joinF");
  if (jf) jf.onclick = async () => {
    const hid = await pickHorse(t("Chi corre?"), (x) => !x.canRace);
    if (hid && (await act(`/friendly/${id}/join`, { horseId: hid }))) race(view, id, params);
  };
  view.querySelectorAll("[data-bet]").forEach((b) => (b.onclick = () => betModal(r, b.dataset.bet, () => race(view, id, params))));
  view.querySelectorAll("[data-ord]").forEach((b) => (b.onclick = () => ordersModal(r, r.entries.find((e) => e.id === b.dataset.ord), () => race(view, id, params))));
  view.querySelectorAll("[data-wd]").forEach((b) => (b.onclick = async () => { if (await act(`/race/${id}/withdraw`, { horseId: b.dataset.wd })) race(view, id, params); }));
  await loadMe();
}

function betModal(r, hid, after) {
  const e = r.entries.find((x) => x.id === hid);
  modal(`<h3>🎟️ ${t("Scommetti su")} ${esc(e.name)}</h3><p>${t("Quota")} <b>${e.odds.toFixed(2)}</b>: ${t("se vince, ricevi la puntata moltiplicata per la quota.")}</p>
    <input type="number" id="amt" value="100" min="10" max="5000"/><p class="muted" id="win"></p>
    <button class="btn primary block" id="ok">💰 ${t("Punta")}</button>`, (m, close) => {
    const upd = () => (m.querySelector("#win").textContent = `${t("Vincita possibile")}: ${money(Number(m.querySelector("#amt").value) * e.odds)}`);
    m.querySelector("#amt").oninput = upd;
    upd();
    m.querySelector("#ok").onclick = async () => {
      if (await act(`/race/${r.id}/bet`, { horseId: hid, amount: Number(m.querySelector("#amt").value) }, t("Scommessa piazzata!"))) { close(); after(); }
    };
  });
}

const STRATS = ["Fuga in testa", "Tallonatore", "Centro gruppo", "Rimonta lunga", "Attesa e scatto", "Risparmio alla corda"];
function ordersModal(r, e, after) {
  const o = e.orders ?? {};
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur ?? "") === String(v) ? "selected" : ""}>${t(l)}</option>`).join("")}</select>`;
  const prefs = e.prefs ? e.prefs.map((p) => `${t(p.context)}: <b>${t(p.strategy)}</b>`).join(" · ") : "";
  modal(`<h3>🎯 ${t("Ordini al fantino")} — ${esc(e.name)}</h3>
    <p class="muted">${t("Il cavallo può disobbedire: succede più spesso se è poco concentrato o se l'ordine va contro quello che ha imparato.")}</p>
    ${prefs ? `<p style="font-size:13px">🧠 ${t("Preferenze imparate")}: ${prefs}</p>` : ""}
    <label class="f">${t("Tattica")}</label>${sel("st", [["", "Decide il cavallo"], ...STRATS.map((s, k) => [k, s])], o.strategy ?? "")}
    <label class="f">${t("Frusta")}</label>${sel("wh", [["normale", "Normale"], ["mai", "Mai (niente paura, niente spinta)"], ["tanta", "Tanta (più spinta, più fatica e rischio paura)"]], o.whip ?? "normale")}
    <label class="f">${t("Posizione in pista")}</label>${sel("ln", [["auto", "Libera"], ["corda", "Attaccato alla corda (meno strada, rischio di restare chiuso)"], ["esterno", "All'esterno (più strada, sempre libero)"]], o.lane ?? "auto")}
    <label class="f">${t("Sprint finale")}</label>${sel("kk", [["normale", "Normale"], ["presto", "Presto (lungo sprint)"], ["tardi", "Tardi (scatto secco)"]], o.kick ?? "normale")}
    <label class="f">${t("Attrezzatura")}</label>
    <label class="row"><input type="checkbox" id="bl" ${o.blinkers ? "checked" : ""}/> 🕶️ ${t("Paraocchi")} (120 ƒ) — ${t("meno paura di luci e folla, meno agile")}</label>
    <label class="row"><input type="checkbox" id="ep" ${o.earplugs ? "checked" : ""}/> 🎧 ${t("Tappi per le orecchie")} (80 ƒ) — ${t("meno paura di urla e botti")}</label>
    <label class="row"><input type="checkbox" id="rs" ${o.rainShoes ? "checked" : ""}/> 🧲 ${t("Ferri da pioggia")} (150 ƒ) — ${t("meglio sul pesante, peggio sul secco")}</label>
    <button class="btn primary block" id="ok" style="margin-top:12px">📣 ${t("Dai gli ordini")}</button>`, (m, close) => {
    m.querySelector("#ok").onclick = async () => {
      const st = m.querySelector("#st").value;
      const res = await act(`/race/${r.id}/orders`, { horseId: e.id, orders: { strategy: st === "" ? null : Number(st), whip: m.querySelector("#wh").value, lane: m.querySelector("#ln").value, kick: m.querySelector("#kk").value, blinkers: m.querySelector("#bl").checked, earplugs: m.querySelector("#ep").checked, rainShoes: m.querySelector("#rs").checked } }, t("Ordini ricevuti!"));
      if (res) { close(); after(); }
    };
  });
}
