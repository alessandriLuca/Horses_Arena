// Il "televisore": scena 3D + grafica TV + telecronaca di Nonna Pina + audio.
import { RaceScene } from "./scene.js";
import { Commentary } from "./commentary.js";
import { nonnaSay, nonnaSilence } from "../nonna.js";
import { startAmbience, setAmbience, stopAmbience, bell, bang, neigh, cheer } from "../audio.js";
import { t, lang } from "../i18n.js";
import { venueById } from "../shared/track.js";
import { QUIRK_FX } from "./quirkfx.js";

const STATUS_TXT = { 2: "inciampa", 3: "a terra", 4: "impennato", 5: "fermo", 7: "ritirato" };

export function openViewer(root, opts) {
  const { replay, info, live, serverNow, quirkName, myOwner } = opts;
  root.innerHTML = "";
  root.classList.add("viewer");
  const stage = el("div", "viewer-stage");
  root.appendChild(stage);
  const speedLines = el("div", "speedlines");
  root.appendChild(speedLines);
  const hud = el("div", "viewer-hud");
  root.appendChild(hud);
  const top = el("div", "vh-top");
  const title = el("div", "vh-title");
  title.innerHTML = `<b>${esc(info?.name ?? "")}</b><span>${esc(venueById(replay.venue).name)} · ${replay.distance} m${replay.hurdles.length ? " · " + t("siepi") : ""}</span>`;
  const clock = el("div", "vh-clock");
  top.append(title, clock);
  const liveBadge = el("div", "vh-live", "● " + t("DIRETTA"));
  if (!live) liveBadge.style.display = "none";
  top.appendChild(liveBadge);
  hud.appendChild(top);
  const board = el("ol", "vh-board");
  hud.appendChild(board);
  const toastBox = el("div", "vh-toasts");
  hud.appendChild(toastBox);
  const bar = el("div", "vh-controls");
  hud.appendChild(bar);
  const callouts = el("div", "vh-callouts");
  hud.appendChild(callouts);
  const results = el("div", "vh-results hidden");
  hud.appendChild(results);

  const scene = new RaceScene(stage, replay, {});
  const myIdx = replay.horses.findIndex((h) => myOwner && h.ownerId === myOwner);
  const favorite = (() => {
    if (!info?.entries) return null;
    const fav = info.entries.filter((e) => e.odds).sort((a, b) => a.odds - b.odds)[0] ?? info.entries.slice().sort((a, b) => b.rating - a.rating)[0];
    return fav ? replay.horses.findIndex((h) => h.id === fav.id) : null;
  })();

  // --- comandi
  let speed = 1, paused = false, boardOpen = !matchMedia("(max-width: 700px)").matches;
  const btn = (label, title_, fn, cls = "") => {
    const b = el("button", "vh-btn " + cls, label);
    b.title = title_;
    b.onclick = (e) => { e.stopPropagation(); fn(b); };
    bar.appendChild(b);
    return b;
  };
  const playBtn = btn("⏸", t("Pausa"), (b) => { paused = !paused; b.textContent = paused ? "▶" : "⏸"; if (paused) nonnaSilence(); });
  const spBtn = btn("1×", t("Velocità"), (b) => { speed = speed === 1 ? 2 : speed === 2 ? 4 : speed === 4 ? 0.5 : 1; b.textContent = speed + "×"; });
  const camModes = [["tv", "📺", t("Regia TV")], ["follow", "🎯", t("Segui il mio cavallo")], ["heli", "🚁", t("Elicottero")], ["side", "🎥", t("Laterale")]];
  let camIdx = 0;
  const camBtn = btn("📺", t("Telecamera"), (b) => {
    camIdx = (camIdx + 1) % camModes.length;
    const [mode, icon] = camModes[camIdx];
    b.textContent = icon;
    scene.setMode(mode, mode === "follow" ? (followIdx >= 0 ? followIdx : myIdx >= 0 ? myIdx : 0) : undefined);
    toast(camModes[camIdx][2]);
  });
  btn("📋", t("Classifica"), () => { boardOpen = !boardOpen; board.classList.toggle("collapsed", !boardOpen); });
  if (!boardOpen) board.classList.add("collapsed");
  btn("⏪", t("Ricomincia"), () => { raceT = -6; com = makeCom(); com.seek(-6); results.classList.add("hidden"); scene.camJustReset = true; });
  if (live) spBtn.style.display = "none";
  void playBtn;
  void camBtn;
  let followIdx = -1;
  board.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (!li) return;
    followIdx = Number(li.dataset.i);
    camIdx = 1;
    camBtn.textContent = "🎯";
    scene.setMode("follow", followIdx);
    toast(t("Segui") + ": " + replay.horses[followIdx].name);
  });

  function toast(text, cls = "") {
    const d = el("div", "vh-toast " + cls, text);
    toastBox.appendChild(d);
    setTimeout(() => d.classList.add("out"), 2600);
    setTimeout(() => d.remove(), 3200);
  }

  // --- telecronaca
  const venueName = venueById(replay.venue).name;
  function makeCom() {
    return new Commentary(replay, { venueName, favorite }, lang, {
      say: (text, mood, prio) => nonnaSay(text, mood, { prio, rate: prio >= 3 ? 1.28 : 1.15 }),
      focus: (i, tt) => scene.focusEvent(i, tt),
      quirk: (e) => {
        const nm = quirkName?.(e.q) ?? e.q;
        toast(`🔍 ${replay.horses[e.a]?.name}: ${nm}`, "quirk");
      },
      quirkName: (id) => quirkName?.(id) ?? id,
    });
  }
  let com = makeCom();

  // --- tempo
  const offset = serverNow ? serverNow - Date.now() : 0;
  const startAt = info?.startAt ?? 0;
  let raceT = live ? (Date.now() + offset - startAt) / 1000 : opts.startT ?? -15;
  if (raceT > -14) com.seek(raceT);
  const endT = replay.duration + 1;
  let lastFrame = performance.now();
  let raf = 0;
  let disposed = false;
  let rang = false;
  const firedFx = new Set();
  startAmbience();

  function order(states) {
    const idx = states.map((_, i) => i);
    const fin = new Map(replay.finish.map((f) => [f.num, f]));
    return idx.sort((a, b) => {
      const sa = states[a], sb = states[b];
      const da = sa.status === 7 || sa.riderless, db = sb.status === 7 || sb.riderless;
      if (da !== db) return da ? 1 : -1;
      if (sa.status === 6 && sb.status === 6) return (fin.get(replay.horses[a].num)?.time || 999) - (fin.get(replay.horses[b].num)?.time || 999);
      return sb.p - sa.p;
    });
  }

  let lastOrder = replay.horses.map((_, i) => i);
  let slowUntil = -99;
  let lastCallout = -99;
  function callout(text, cls = "", force = false) {
    const now = performance.now();
    if (!force && now - lastCallout < 900) return;
    lastCallout = now;
    const d = el("div", "vh-callout " + cls, text);
    callouts.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }
  const POP = { fall: "☠️", stumble: "❗", bump: "💢", spook: "😱", rear: "😱", stop: "❓", quirk: "🌀", refuse: "🙅", hurdle_fall: "☠️", hazard: "⚠️", riderless: "🏳️", disobey: "😤", exhausted: "😵", leap: "🦘", avoid: "😎" };
  let boardT = 0;

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const slow = !live && raceT < slowUntil ? 0.35 : 1;
    if (!paused) raceT += dt * (live ? 1 : speed) * slow;
    if (live) {
      const target = (Date.now() + offset - startAt) / 1000;
      if (Math.abs(target - raceT) > 2) raceT = target;
    }
    const tt = Math.min(raceT, endT + 6);
    const states = scene.render(tt, paused ? 0 : dt * speed, lastOrder, { speed, excitement: excitement(tt), whips: whipSet(tt) });
    lastOrder = order(states);
    if (!paused) com.tick(tt, states, lastOrder);
    if (!rang && tt >= 0) { rang = true; bell(); }
    // effetti sonori sugli eventi
    for (const e of replay.events) {
      if (e.t > tt || e.t < tt - 0.3 || firedFx.has(e)) continue;
      firedFx.add(e);
      if ((e.k === "hitman" || e.k === "incident") && e.x === "petardo") bang();
      const nm = e.a !== undefined ? replay.horses[e.a]?.name ?? "" : "";
      if (e.k === "quirk" && e.a !== undefined) scene.pop(e.a, QUIRK_FX[e.q]?.[1] ?? "🌀", 2.6);
      else if (e.a !== undefined && POP[e.k] && (e.k !== "bump" || (e.v ?? 0) > 0.3)) scene.pop(e.a, POP[e.k]);
      const GAGQ = { giravolta: "spin", retromarcia: "shake", saltellatore: "bounce", giraffa: "stretch", collo_lungo: "stretch", impennata: "flip", gas_propulsore: "bounce", elettrico: "shake", esplosivo: "stretch", passo_danza: "spin", ballerino: "spin", urlatore: "giant", nitrito_guerra: "giant", pisolino: "squash", starnutone: "shake", ostacoli_immaginari: "flip", carica_toro: "giant", esultanza: "flip", fantasma: "tiny", capobranco: "giant", canguro: "bounce", saltatore_nato: "flip" };
      if (e.a !== undefined) {
        if (e.k === "quirk") {
          const fx = QUIRK_FX[e.q];
          scene.gag(e.a, fx?.[0] ?? GAGQ[e.q] ?? "spin", 1.6);
          if (fx?.[2] && e.b !== undefined) setTimeout(() => scene.gag(e.b, fx[2], 1.3), 250);
        }
        else if (e.k === "fall" || e.k === "hurdle_fall") { scene.gag(e.a, "flip", 1.2); scene.pop(e.a, "💫", 3); }
        else if (e.k === "bump" && (e.v ?? 0) > 0.3) { scene.gag(e.a, "squash", 0.6); if (e.b !== undefined) scene.gag(e.b, "shake", 0.8); }
        else if (e.k === "stumble") scene.gag(e.a, "shake", 0.7);
        else if (e.k === "spook" || e.k === "rear") scene.gag(e.a, "bounce", 1.2);
        else if (e.k === "incident" && (e.x === "ufo" || e.x === "ufo2")) scene.gag(e.a, "float", 2.6);
        else if (e.k === "incident") scene.gag(e.a, "shake", 1);
        else if (e.k === "finish" && e.v === 1) setTimeout(() => scene.gag(e.a, "flip", 1.6), 600);
        else if (e.k === "leap") scene.gag(e.a, "flip", 1);
      }
      if (e.k === "fall" || e.k === "hurdle_fall") { callout(`☠️ ${t("CADUTO!")} ${nm}`, "red", true); slowUntil = tt + 2.2; }
      else if (e.k === "hitman") { callout(`🕶️ ${t("SICARIO!")}`, "dark", true); slowUntil = tt + 2.5; }
      else if (e.k === "incident") { callout(`${e.q ?? "⚠️"} ${t("IMPREVISTO!")}`, "dark", true); slowUntil = tt + 2; if (e.a !== undefined) scene.pop(e.a, e.q ?? "⚠️", 3); }
      else if (e.k === "quirk") callout(`${QUIRK_FX[e.q]?.[1] ?? "🌀"} ${quirkName?.(e.q) ?? e.q}!`, "purple");
      else if (e.k === "bump" && (e.v ?? 0) > 0.45) callout(`💥 ${t("SCONTRO!")}`, "");
      else if (e.k === "refuse") callout(`🙅 ${t("RIFIUTO!")} ${nm}`, "");
      else if (e.k === "riderless") callout(`🏳️ ${t("SENZA FANTINO!")}`, "red");
      else if (e.k === "photo") callout(`📸 ${t("FOTOFINISH!")}`, "gold", true);
      if (e.k === "quirk" && /urlo|nitrito|urla/.test(e.x ?? "")) neigh();
      if (e.k === "finish" && e.v === 1) cheer();
    }
    // HUD
    const lead = states[lastOrder[0]];
    const rem = Math.max(0, replay.distance - lead.p);
    clock.textContent = tt < 0 ? `${t("Partenza tra")} ${Math.ceil(-tt)}s` : rem > 0 ? `${Math.round(rem)} m · ${fmtTime(tt)}` : `${t("Arrivo")} · ${fmtTime(Math.min(tt, replay.duration))}`;
    const hoof = tt > 0 ? Math.min(1, lead.v / 17) : 0;
    setAmbience(excitement(tt), hoof);
    speedLines.style.opacity = tt > 0 && rem < 320 && rem > 0 ? String(Math.min(0.85, (320 - rem) / 220)) : "0";
    if (now - boardT > 250) {
      boardT = now;
      drawBoard(states);
    }
    if (tt > endT && results.classList.contains("hidden")) showResults();
  }

  function excitement(tt) {
    if (tt < 0) return 0.15;
    const lead = scene.sample(lastOrder[0], tt);
    const rem = replay.distance - lead.p;
    return rem < 0 ? 0.6 : Math.max(0.2, Math.min(1, 1 - rem / 700));
  }

  function whipSet(tt) {
    const s = new Set();
    for (let i = 0; i < replay.horses.length; i++) {
      const st = scene.sample(i, tt);
      if (replay.distance - st.p < 380 && st.status === 1 && !st.riderless) s.add(i);
    }
    return s;
  }

  function drawBoard(states) {
    const leadP = states[lastOrder[0]].p;
    const max = board.classList.contains("collapsed") ? 3 : replay.horses.length;
    board.innerHTML = lastOrder
      .slice(0, max)
      .map((i, k) => {
        const h = replay.horses[i];
        const st = states[i];
        const gap = k === 0 ? "" : st.status === 7 || st.riderless ? t("rit.") : `+${((leadP - st.p) / 2.4).toFixed(1)}`;
        const mine = myOwner && h.ownerId === myOwner;
        const stx = STATUS_TXT[st.status] ? `<em>${t(STATUS_TXT[st.status])}</em>` : "";
        return `<li data-i="${i}" class="${mine ? "mine" : ""} ${i === followIdx ? "follow" : ""}"><span class="pos">${k + 1}</span><span class="num" style="background:${h.silks.primary};color:${contrast(h.silks.primary)};border-color:${h.silks.secondary}">${h.num}</span><span class="nm">${esc(h.name)} ${stx}</span><span class="gap">${gap}</span></li>`;
      })
      .join("");
  }

  async function showResults() {
    let rows = null;
    try {
      if (opts.fetchResult) rows = await opts.fetchResult();
    } catch {
      /* uso il replay */
    }
    const fin = replay.finish.slice().sort((a, b) => (a.pos || 99) - (b.pos || 99));
    const list = rows ?? fin.map((f) => {
      const h = replay.horses.find((x) => x.num === f.num);
      return { pos: f.pos, name: h.name, stable: h.stable, time: f.time, status: f.status, prize: 0, silks: h.silks, num: f.num };
    });
    results.innerHTML = `<div class="vr-card"><h3>🏁 ${t("Ordine d'arrivo")}</h3><ol>${list
      .map((r) => `<li class="${r.owner && r.owner === myOwner ? "mine" : ""}"><span class="pos">${r.pos || "—"}</span><span class="num" style="background:${r.silks?.primary ?? "#999"}">${r.num ?? ""}</span><span class="nm">${esc(r.name)}<small>${esc(r.stable ?? "")}${r.revealed?.length ? " · 🔍 " + r.revealed.map(esc).join(", ") : ""}</small></span><span class="tm">${r.status === "ok" ? fmtTime(r.time) : r.status === "dq" ? "SQ" : t("rit.")}${r.prize ? `<b>${r.prize} ƒ</b>` : ""}</span></li>`)
      .join("")}</ol><div class="vr-actions"><button class="btn small" data-act="replay">⏪ ${t("Rivedi")}</button>${opts.onClose ? `<button class="btn small primary" data-act="close">${t("Chiudi")}</button>` : ""}</div></div>`;
    results.classList.remove("hidden");
    results.querySelector('[data-act="replay"]').onclick = () => { results.classList.add("hidden"); raceT = -3; com = makeCom(); com.seek(-3); scene.camJustReset = true; };
    const c = results.querySelector('[data-act="close"]');
    if (c) c.onclick = () => opts.onClose();
  }

  raf = requestAnimationFrame(frame);
  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      nonnaSilence();
      stopAmbience();
      scene.dispose();
      root.classList.remove("viewer");
      root.innerHTML = "";
    },
    scene,
    seek(x) { raceT = x; com.seek(x); scene.camJustReset = true; },
    setCam(mode, i) { scene.setMode(mode, i); },
  };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function fmtTime(s) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${r}`;
}
function contrast(hex) {
  const c = parseInt(hex.slice(1), 16);
  const l = ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
  return l > 150 ? "#111" : "#fff";
}
