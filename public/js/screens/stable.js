import { state, api, act, toast, go, loadMe, modal, confirmBox, catalog, pickHorse } from "../app.js";
import { t } from "../i18n.js";
import { esc, money, horseSvg, silksSvg, statusTags, bar, stars, formStr, fmtRace, ago, timeHM } from "../ui.js";
import { nonnaSay } from "../nonna.js";
import { tutorialMark } from "../tutorial.js";

export const STAT_LABEL = {
  speed: "Velocità di punta", accel: "Accelerazione", stamina: "Resistenza", strength: "Forza", agility: "Agilità", recovery: "Recupero",
  jumping: "Salto", courage: "Coraggio", calm: "Calma", focus: "Concentrazione", grit: "Grinta", smarts: "Intelligenza", consistency: "Regolarità",
};
const STIM_LABEL = {
  folla: "la folla", gabbie: "le gabbie", contatto: "i contatti", gruppo: "il gruppo", frusta: "la frusta", urla: "le urla", pioggia: "la pioggia",
  fango: "il fango", ostacoli: "gli ostacoli", curve: "le curve", botti: "i botti", luci: "luci e lampi", testa: "stare in testa", coda: "stare in coda",
};
const COAT = { baio: "Baio", baio_scuro: "Baio scuro", sauro: "Sauro", sauro_bruciato: "Sauro bruciato", morello: "Morello", grigio: "Grigio", grigio_pomellato: "Grigio pomellato", palomino: "Palomino", isabella: "Isabella", falbo: "Falbo", roano: "Roano", pezzato: "Pezzato", leopardato: "Leopardato", cremello: "Cremello" };

export function horseCard(x, silks) {
  return `<div class="card"><div class="hcard" data-go="/cavallo/${x.id}">
    <div class="portrait">${horseSvg(x.look, { silks })}</div>
    <div class="info"><div class="name">${x.sex === "M" ? "♂" : "♀"} ${esc(x.name)}</div>
    <div class="muted" style="font-size:13px;font-weight:700">${x.age} ${t("anni")} · ${t(COAT[x.look.coat] ?? x.look.coat)} · ${t("val.")} <b>${x.overall}</b> · ⭐ ${x.rating}</div>
    <div class="muted" style="font-size:13px;font-weight:700">${t("Forma")}: ${formStr(x.rec.form)} · ${x.rec.wins}/${x.rec.starts} ${t("vittorie")} · ${money(x.value)}</div>
    <div style="margin-top:4px">${statusTags(x)}</div></div></div>
    ${x.dead ? "" : `<div style="margin-top:8px">${bar(100 - x.cond.fatigue, 100, x.cond.fatigue > 60 ? "red" : "green")}<small>${t("Energia")} ${100 - x.cond.fatigue}% · ${t("morale")} ${x.cond.morale}</small></div>`}
  </div>`;
}

export async function stable(view) {
  await loadMe();
  const me = state.me;
  const alive = me.horses.filter((x) => !x.dead);
  const dead = me.horses.filter((x) => x.dead);
  const nextStall = 6000 * (me.stalls - 3);
  view.innerHTML = `
  <div class="row between"><h2 class="title-pop">🐴 ${esc(me.stable)}</h2><span class="pill">${me.used}/${me.stalls} ${t("box")}</span></div>
  <div class="row" style="margin-bottom:12px"><a class="btn primary" href="/mercato">🛒 ${t("Compra cavalli")}</a><button class="btn" id="stall">➕ ${t("Nuovo box")} (${money(nextStall)})</button><a class="btn" href="/riproduzione">🍼 ${t("Riproduzione")}</a></div>
  ${alive.length ? `<div class="grid">${alive.map((x) => horseCard(x, me.silks)).join("")}</div>` : `<div class="card empty">${t("La scuderia è vuota. Al mercato ci sono cavalli per tutte le tasche!")}</div>`}
  ${dead.length ? `<div class="card"><h3>🕯️ ${t("Nel ricordo")}</h3>${dead.map((x) => `<div class="row between"><a href="/cavallo/${x.id}">${esc(x.name)}</a><small>${esc(x.dead.cause)}</small></div>`).join("")}</div>` : ""}`;
  view.querySelector("#stall").onclick = async () => {
    if (await confirmBox(t("Costruire un nuovo box per {p}?", { p: money(nextStall) }))) {
      await act("/stalls", {}, t("Nuovo box costruito!"));
      stable(view);
    }
  };
}

export async function publicStable(view, pid) {
  const s = await api("/stable/" + pid);
  view.innerHTML = `<div class="hero"><div class="row">${silksSvg(s.silks, 46)}<div><h1 style="margin:0">${esc(s.stable)}</h1><p style="margin:0">${esc(s.name)} · ${s.wins} ${t("vittorie")} · ${t("Reputazione")} ${s.rep}</p></div></div>${state.me && state.me.id !== s.id ? `<a class="btn" style="margin-top:10px" href="/posta?to=${encodeURIComponent(s.stable)}">✉️ ${t("Scrivi")}</a>` : ""}</div>
  <div class="grid">${s.horses.map((x) => horseCard(x, s.silks)).join("")}</div>`;
}

function mindHtml(m) {
  if (!m) return "";
  const fears = m.fears.filter((f) => Math.abs(f.v) >= 0.05).sort((a, b) => b.v - a.v);
  const fearRows = fears.length
    ? fears.map((f) => {
        const v = f.v;
        const w = Math.abs(v) * 50;
        return `<div class="stat"><span>${v > 0 ? "😨" : "😎"} ${t(STIM_LABEL[f.id] ?? f.label)}</span><b>${v > 0 ? t("paura") : t("fiducia")} ${Math.round(Math.abs(v) * 100)}%</b>
          <div class="bar" style="position:relative"><i style="position:absolute;left:${v < 0 ? 50 - w : 50}%;width:${w}%;background:${v > 0 ? "linear-gradient(90deg,#ff9a3c,#ff4d6d)" : "linear-gradient(90deg,#6ec6ff,#25c26e)"}"></i></div></div>`;
      }).join("")
    : `<p class="muted">${t("Non ha ancora associazioni forti: deve fare esperienza.")}</p>`;
  return `<div class="card blue"><h3>🧠 ${t("Cosa ha imparato")} <small>(${m.races} ${t("corse")})</small></h3>
    <p class="muted" style="margin-top:0">${t("Le paure e le fiducie nascono da quello che gli succede in gara e in allenamento.")}</p>
    <div class="statlist">${fearRows}</div>
    <div class="sep"></div>
    <h4>🎯 ${t("Tattiche preferite")}</h4>
    <table class="t"><tr><th>${t("Tipo di corsa")}</th><th>${t("Tattica")}</th><th>${t("Prove")}</th></tr>${m.prefs.map((p) => `<tr><td>${t(p.context)}</td><td>${t(p.strategy)}</td><td>${p.tried}</td></tr>`).join("")}</table>
    ${m.grudges.length ? `<div class="sep"></div><h4>⚔️ ${t("Rivali")}</h4>${m.grudges.map((g) => `<div>${g.v > 0 ? "😰 " + t("teme") : "🔥 " + t("rivalità con")} <a href="/cavallo/${g.id}">${esc(g.name)}</a></div>`).join("")}` : ""}
    ${m.log.length ? `<div class="sep"></div><h4>📓 ${t("Diario")}</h4><ul style="margin:0;padding-left:18px;font-weight:700;font-size:14px">${m.log.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export async function horse(view, id) {
  await loadMe();
  const cat = await catalog();
  const x = await api("/horse/" + id);
  const mine = state.me && x.ownerId === state.me.id;
  const silks = x.silks ?? (mine ? state.me.silks : null);
  if (mine) tutorialMark("scheda");
  const pot = x.potential;
  const statRows = Object.keys(STAT_LABEL).map((k) => `<div class="stat"><span>${t(STAT_LABEL[k])} ${pot ? stars(pot[k]) : ""}</span><b>${x.stats[k]}${mine ? "" : "±5"}</b>${bar(x.stats[k])}</div>`).join("");
  const apt = x.apt;
  const aptHtml = mine && apt.distance !== undefined ? `
    <dl class="kv">
      <dt>${t("Distanza ideale")}</dt><dd>${apt.distance < 0.33 ? t("velocista") : apt.distance < 0.66 ? t("miglio / media") : t("fondista")} (${Math.round(1000 + apt.distance * 2400)} m)</dd>
      <dt>${t("Terreno preferito")}</dt><dd>${apt.going < -0.3 ? t("secco") : apt.going > 0.3 ? t("pesante") : t("buono")}</dd>
      <dt>${t("Stile innato")}</dt><dd>${apt.style < 0.35 ? t("corre davanti") : apt.style > 0.65 ? t("ama rimontare") : t("versatile")}</dd>
      <dt>${t("Superfici")}</dt><dd>${Object.entries(apt.surface).map(([s, v]) => `${t(s)} ${v >= 1.02 ? "👍" : v <= 0.97 ? "👎" : "·"}`).join(" ")}</dd>
      <dt>${t("Altezza / peso")}</dt><dd>${apt.heightCm} cm · ${apt.weightKg} kg</dd>
    </dl>` : `<dl class="kv"><dt>${t("Altezza / peso")}</dt><dd>${apt.heightCm} cm · ${apt.weightKg} kg</dd></dl>`;
  const quirks = x.quirks.map((q) => `<div class="card ${q.polarity === "+" ? "blue" : q.polarity === "-" ? "pink" : ""}" style="padding:10px;margin-bottom:8px"><b>${q.polarity === "+" ? "✨" : q.polarity === "-" ? "💢" : "🎲"} ${esc(q.name)}</b> ${q.rarity >= 3 ? `<span class="tag gold">${t("raro")}</span>` : ""}<div class="muted" style="font-size:13.5px">${esc(q.desc)}</div></div>`).join("");
  const ill = x.illness;
  const illDis = ill && ill.id ? cat.diseases.find((d) => d.id === ill.id) : null;
  view.innerHTML = `
  <div class="row between"><div><h2 class="title-pop" style="margin:0">${x.sex === "M" ? "♂" : "♀"} ${esc(x.name)}</h2>
    <div class="muted" style="font-weight:800">${esc(x.stable)} · ${x.age} ${t("anni")} · ${t(COAT[x.look.coat] ?? x.look.coat)}${x.sireName ? ` · ${t("figlio di")} ${esc(x.sireName)} × ${esc(x.damName)}` : ""}</div></div>
    <div class="row"><span class="pill">⭐ ${x.rating}</span><span class="pill">${t("val.")} ${x.overall}</span></div></div>
  <div class="grid" style="margin-top:10px">
    <div>
      <div class="portrait big">${horseSvg(x.look, { silks })}</div>
      <div style="margin:10px 0">${statusTags(x)}</div>
      ${x.dead ? `<div class="card"><h3>🕯️ ${t("Riposa in pace")}</h3><p>${esc(x.dead.cause)}</p></div>` : ""}
      ${mine && !x.dead ? actionsHtml(x) : ""}
      ${!mine && !x.dead && state.me ? `<div class="card"><div class="row">${x.price && x.market ? `<button class="btn primary" id="buy">🛒 ${t("Compra")} ${money(x.price)}</button>` : ""}<button class="btn" id="chal">⚔️ ${t("Sfida")}</button>${x.studFee ? `<a class="btn" href="/riproduzione">🍼 ${t("Monta")} ${money(x.studFee)}</a>` : ""}<a class="btn" href="/mercato-nero?target=${x.id}">🕶️ ${t("Mercato nero")}</a></div></div>` : ""}
      ${ill && mine ? `<div class="card pink"><h3>🤒 ${illDis && ill.diagnosed ? esc(illDis.name) : t("Non sta bene")}</h3><p>${ill.treatment ? t("In cura fino a") + " " + timeHM(ill.until) : t("Serve il veterinario!")}</p><a class="btn" href="/clinica">🏥 ${t("Clinica")}</a></div>` : ""}
    </div>
    <div>
      <div class="card"><h3>📊 ${t("Statistiche")} ${mine ? `<small>${t("(le stelle sono il potenziale)")}</small>` : `<small>${t("(stime dell'osservatore)")}</small>`}</h3><div class="statlist">${statRows}</div></div>
      <div class="card"><h3>🧬 ${t("Attitudini")}</h3>${aptHtml}</div>
      ${!x.dead ? `<div class="card"><h3>❤️ ${t("Condizione")}</h3>
        <div class="stat"><span>${t("Energia")}</span><b>${100 - x.cond.fatigue}%</b>${bar(100 - x.cond.fatigue, 100, x.cond.fatigue > 60 ? "red" : "green")}</div>
        <div class="stat"><span>${t("Morale")}</span><b>${x.cond.morale}</b>${bar(x.cond.morale)}</div>
        <div class="stat"><span>${t("Salute")}</span><b>${x.cond.health}</b>${bar(x.cond.health, 100, "green")}</div>
        ${x.cond.effects?.length ? `<p>💉 ${x.cond.effects.map((e) => esc(e.kind)).join(", ")}</p>` : ""}
        ${x.contracts?.length ? `<p>✍️ ${t("Contratti attivi")}: ${x.contracts.length}</p>` : ""}
      </div>` : ""}
    </div>
  </div>
  <div class="card"><h3>🔍 ${t("Quirk scoperti")} <small>${x.hiddenQuirks ? t("{n} ancora nascosti...", { n: x.hiddenQuirks }) : ""}</small></h3>${quirks || `<p class="muted">${t("Nessuno ancora: lo scoprirai vedendolo correre!")}</p>`}</div>
  ${mindHtml(x.mind)}
  <div class="grid">
    <div class="card"><h3>🏅 ${t("Carriera")}</h3><dl class="kv"><dt>${t("Corse")}</dt><dd>${x.rec.starts}</dd><dt>${t("Vittorie")}</dt><dd>${x.rec.wins}</dd><dt>${t("Piazzamenti")}</dt><dd>${x.rec.places}</dd><dt>${t("Guadagni")}</dt><dd>${money(x.rec.earnings)}</dd><dt>${t("Cadute")}</dt><dd>${x.rec.falls}</dd><dt>${t("Forma")}</dt><dd>${formStr(x.rec.form)}</dd><dt>${t("Fantino")}</dt><dd>${esc(x.jockey)}</dd></dl>
      ${Object.keys(x.rec.bestTimes).length ? `<div class="sep"></div><h4>⏱️ ${t("Record personali")}</h4>${Object.entries(x.rec.bestTimes).map(([k, v]) => `<div>${k.replace("s", " " + t("siepi"))} m: <b>${fmtRace(v)}</b></div>`).join("")}` : ""}
      ${x.trophies?.length ? `<div class="sep"></div><h4>🏆 ${t("Trofei")}</h4>${x.trophies.map((tr) => `<div>${esc(tr)}</div>`).join("")}` : ""}
    </div>
    <div class="card"><h3>📜 ${t("Ultime corse")}</h3>${(x.races ?? []).map((r) => `<div class="race-row" data-go="/corsa/${r.id}"><div class="time">${timeHM(r.start_at)}</div><div><div class="nm">${esc(r.name)}</div><div class="meta">${r.distance} m · ${t(r.status)}</div></div><span>›</span></div>`).join("") || `<p class="muted">${t("Nessuna corsa.")}</p>`}</div>
  </div>`;
  if (mine && !x.dead) bindActions(view, x);
  const buy = view.querySelector("#buy");
  if (buy) buy.onclick = async () => { if (await confirmBox(t("Comprare {n} per {p}?", { n: x.name, p: money(x.price) }))) { const r = await act("/market/buy", { horseId: x.id }, t("Comprato! Benvenuto in scuderia.")); if (r) horse(view, id); } };
  const chal = view.querySelector("#chal");
  if (chal) chal.onclick = () => challengeModal(x);
}

function actionsHtml(x) {
  const can = !x.canRace;
  return `<div class="card hl"><h3>🎛️ ${t("Gestione")}</h3><div class="row">
    <a class="btn primary" href="/corse?horse=${x.id}">🏁 ${t("Iscrivi a una corsa")}</a>
    <button class="btn" data-a="train">🏋️ ${t("Allena ora")}</button>
    <button class="btn" data-a="plan">📅 ${t("Piano settimanale")}</button>
    <button class="btn" data-a="league">🏆 ${x.league ? t("Campionato") + " ✓" : t("Iscrivi al campionato")}</button>
    <button class="btn" data-a="friendly">🤝 ${t("Amichevole")}</button>
    <button class="btn" data-a="insure">📄 ${t("Assicurazione")}</button>
    <a class="btn" href="/clinica">🏥 ${t("Veterinario")}</a>
    <a class="btn" href="/laboratorio">🧪 ${t("Laboratorio")}</a>
    ${x.sex === "M" ? `<button class="btn" data-a="stud">🐎 ${x.studFee ? t("Monta") + ": " + money(x.studFee) : t("Offri per la monta")}</button>` : `<a class="btn" href="/riproduzione">🍼 ${t("Fai nascere un puledro")}</a>`}
    <button class="btn" data-a="sell">🏷️ ${x.price ? t("In vendita") + ": " + money(x.price) : t("Metti in vendita")}</button>
    <button class="btn" data-a="quick">💸 ${t("Svendi")} (${money(Math.round(x.value * 0.6))})</button>
    ${x.rec.starts === 0 ? `<button class="btn" data-a="rename">✏️ ${t("Rinomina")}</button>` : ""}
    ${!x.retired ? `<button class="btn ghost" data-a="retire">🏖️ ${t("Pensione")}</button>` : ""}
  </div>${!can ? `<p class="muted" style="margin:8px 0 0">${t("Ora non può correre")}: ${esc(x.canRace)}</p>` : ""}</div>`;
}

function bindActions(view, x) {
  const on = (a, fn) => { const b = view.querySelector(`[data-a="${a}"]`); if (b) b.onclick = fn; };
  const reload = () => horse(view, x.id);
  on("train", () => trainModal(x, reload));
  on("plan", () => planModal(x, reload));
  on("insure", () => insureModal(x, reload));
  on("league", async () => {
    if (x.league) {
      if (await confirmBox(t("Ritirare {n} dal campionato? Perderà i punti.", { n: x.name }))) { await act("/league/leave", { horseId: x.id }); reload(); }
    } else { const r = await act("/league/join", { horseId: x.id }, false); if (r) { toast(t("Iscritto in {d}!", { d: r.division }), "ok"); reload(); } }
  });
  on("friendly", async () => {
    const r = await act("/friendly", { horseId: x.id, bots: 7 }, false);
    if (r) { toast(t("Amichevole tra 90 secondi!"), "ok"); go("/corsa/" + r.raceId); }
  });
  on("sell", () => {
    modal(`<h3>🏷️ ${t("Vendi")} ${esc(x.name)}</h3><p class="muted">${t("Valore stimato")}: ${money(x.value)}. ${t("Commissione 5%.")}</p><input type="number" id="pr" value="${x.price ?? Math.round(x.value * 1.1)}" min="100"/><div class="row" style="margin-top:10px">${x.price ? `<button class="btn" id="un">${t("Ritira dal mercato")}</button>` : ""}<button class="btn primary" id="ok">${t("Metti in vendita")}</button></div>`, (m, close) => {
      m.querySelector("#ok").onclick = async () => { await act("/market/list", { horseId: x.id, price: Number(m.querySelector("#pr").value) }, t("In vendita!")); close(); reload(); };
      const un = m.querySelector("#un");
      if (un) un.onclick = async () => { await act("/market/list", { horseId: x.id, price: null }, t("Ritirato dal mercato.")); close(); reload(); };
    });
  });
  on("quick", async () => {
    if (await confirmBox(t("Svendere {n} all'allevamento per {p}? Non si torna indietro.", { n: x.name, p: money(Math.round(x.value * 0.6)) }))) { const r = await act("/market/quicksell", { horseId: x.id }); if (r) go("/scuderia"); }
  });
  on("stud", () => {
    modal(`<h3>🐎 ${t("Monta")}</h3><p class="muted">${t("Altri giocatori potranno far coprire le loro cavalle da {n} pagando la tariffa (ti arriva il 90%).", { n: x.name })}</p><input type="number" id="fee" value="${x.studFee ?? 2500}" min="100"/><div class="row" style="margin-top:10px">${x.studFee ? `<button class="btn" id="off">${t("Togli dalla monta")}</button>` : ""}<button class="btn primary" id="ok">${t("Conferma")}</button></div>`, (m, close) => {
      m.querySelector("#ok").onclick = async () => { await act(`/horse/${x.id}/stud`, { fee: Number(m.querySelector("#fee").value) }, t("Fatto!")); close(); reload(); };
      const off = m.querySelector("#off");
      if (off) off.onclick = async () => { await act(`/horse/${x.id}/stud`, { fee: null }); close(); reload(); };
    });
  });
  on("rename", () => {
    modal(`<h3>✏️ ${t("Rinomina")}</h3><input type="text" id="nm" value="${esc(x.name)}" maxlength="28"/><button class="btn primary" id="ok" style="margin-top:10px">${t("Salva")}</button>`, (m, close) => {
      m.querySelector("#ok").onclick = async () => { await act(`/horse/${x.id}/rename`, { name: m.querySelector("#nm").value }); close(); reload(); };
    });
  });
  on("retire", async () => { if (await confirmBox(t("Mandare {n} in pensione? Non correrà più, ma potrà riprodursi.", { n: x.name }))) { await act(`/horse/${x.id}/retire`, {}); reload(); } });
}

export async function trainModal(x, after) {
  const cat = await catalog();
  modal(`<h3>🏋️ ${t("Allena")} ${esc(x.name)}</h3><p class="muted">${t("Una seduta extra ogni 12 ore. Energia attuale")}: ${100 - x.cond.fatigue}%</p>
    <div class="tabs" id="int">${cat.intensities.map((i) => `<button data-i="${i.id}" class="${i.id === "normale" ? "on" : ""}">${t(i.name)}</button>`).join("")}</div>
    <div class="stack">${cat.sessions.map((s) => `<button class="btn block" data-s="${s.id}" style="justify-content:space-between;text-align:left;white-space:normal"><span>${s.icon} <b>${t(s.name)}</b><br><small>${t(s.desc)}</small></span><small>${money(s.cost)}</small></button>`).join("")}</div>`, (m, close) => {
    let inten = "normale";
    m.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { inten = b.dataset.i; m.querySelectorAll("[data-i]").forEach((z) => z.classList.toggle("on", z === b)); }));
    m.querySelectorAll("[data-s]").forEach((b) => (b.onclick = async () => {
      const r = await act(`/horse/${x.id}/train`, { session: b.dataset.s, intensity: inten }, false);
      if (r) {
        close();
        toast(r.report.text, "ok");
        if (r.report.notes?.length) nonnaSay(`${x.name} ${r.report.notes.join(", ")}!`, "proud");
        after?.();
      }
    }));
  });
}

export async function planModal(x, after) {
  const cat = await catalog();
  const days = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const plan = x.plan ?? { active: true, days: [["galoppo"], ["ripetute"], ["riposo"], ["slalom"], ["gabbie"], ["pascolo"], ["riposo"]].map(([s]) => ({ s, i: "normale" })) };
  modal(`<h3>📅 ${t("Piano settimanale di")} ${esc(x.name)}</h3><p class="muted">${t("Ogni mattina alle 7:00 il cavallo fa la seduta del giorno (se è disponibile e hai i soldi). Occhio alla fatica: troppa porta infortuni.")}</p>
    <label class="row"><input type="checkbox" id="act" ${plan.active ? "checked" : ""}/> <b>${t("Piano attivo")}</b></label>
    <table class="t">${plan.days.map((d, k) => `<tr><td><b>${t(days[k])}</b></td><td><select data-d="${k}">${cat.sessions.map((s) => `<option value="${s.id}" ${s.id === d.s ? "selected" : ""}>${s.icon} ${t(s.name)} (${s.cost} ƒ)</option>`).join("")}</select></td><td><select data-di="${k}">${cat.intensities.map((i) => `<option value="${i.id}" ${i.id === d.i ? "selected" : ""}>${t(i.name)}</option>`).join("")}</select></td></tr>`).join("")}</table>
    <button class="btn primary block" id="ok" style="margin-top:12px">💾 ${t("Salva piano")}</button>`, (m, close) => {
    m.querySelector("#ok").onclick = async () => {
      const p = { active: m.querySelector("#act").checked, days: [0, 1, 2, 3, 4, 5, 6].map((k) => ({ s: m.querySelector(`[data-d="${k}"]`).value, i: m.querySelector(`[data-di="${k}"]`).value })) };
      const r = await act(`/horse/${x.id}/plan`, { plan: p }, t("Piano salvato!"));
      if (r) { close(); after?.(); }
    };
  });
}

export async function insureModal(x, after) {
  const cat = await catalog();
  const cur = x.insurance?.policy ?? "nessuna";
  modal(`<h3>📄 ${t("Assicura")} ${esc(x.name)}</h3><p class="muted">${t("Valore attuale")}: ${money(x.value)}. ${t("La copertura in caso di morte vale dopo 24 ore. Le sperimentazioni non sono coperte.")}</p>
    <div class="stack">${cat.policies.map((p) => `<button class="btn block ${p.id === cur ? "primary" : ""}" data-p="${p.id}" style="justify-content:space-between;white-space:normal;text-align:left"><span><b>${t(p.name)}</b><br><small>${p.id === "nessuna" ? t("Nessuna copertura.") : `${t("Rimborso spese veterinarie")} ${Math.round(p.vet * 100)}%${p.death ? " · " + t("rimborso totale se muore (anche ucciso da un sicario)") : ""}`}</small></span><small>${p.daily ? money(Math.round(x.value * p.daily)) + "/" + t("giorno") : ""}</small></button>`).join("")}</div>`, (m, close) => {
    m.querySelectorAll("[data-p]").forEach((b) => (b.onclick = async () => {
      const r = await act(`/horse/${x.id}/insure`, { policy: b.dataset.p }, t("Polizza aggiornata!"));
      if (r) { close(); after?.(); }
    }));
  });
}

export async function challengeModal(target) {
  const myHorse = await pickHorse(t("Con quale cavallo sfidi {n}?", { n: target.name }), (hh) => !hh.canRace);
  if (!myHorse) return;
  modal(`<h3>⚔️ ${t("Sfida")} ${esc(target.name)}</h3>
    <label class="f">${t("Posta in gioco (ognuno mette la stessa cifra)")}</label><input type="number" id="stake" value="1000" min="0"/>
    <label class="f">${t("Distanza")}</label><select id="dist">${[1000, 1200, 1400, 1600, 2000, 2400, 3000].map((d) => `<option ${d === 1600 ? "selected" : ""}>${d}</option>`).join("")}</select>
    <label class="f">${t("Cavalli del sistema in gara")}</label><input type="number" id="bots" value="0" min="0" max="10"/>
    <button class="btn primary block" id="ok" style="margin-top:12px">⚔️ ${t("Lancia la sfida")}</button>`, (m, close) => {
    m.querySelector("#ok").onclick = async () => {
      const r = await act("/challenge", { horseId: myHorse, targetId: target.id, stake: Number(m.querySelector("#stake").value), distance: Number(m.querySelector("#dist").value), bots: Number(m.querySelector("#bots").value) }, t("Sfida inviata! Aspetta che accetti."));
      if (r) close();
    };
  });
}

export { ago };
