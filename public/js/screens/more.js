import { state, api, act, toast, go, loadMe, modal, confirmBox, pickHorse, catalog, serverNow, onWsMessage, setCleanup } from "../app.js";
import { t } from "../i18n.js";
import { esc, money, horseSvg, silksSvg, timeHM, countdown, ago, statusTags, dayLabel } from "../ui.js";
import { nonnaSay } from "../nonna.js";
import { tutorialMark } from "../tutorial.js";
import { raceRow, friendlyModal } from "./races.js";

// =============================================================== menu "Altro"
export async function more(view) {
  const tiles = [
    ["/campionato", "🏆", "Campionato", "4 divisioni, promozioni e retrocessioni"],
    ["/tornei", "🏟️", "Tornei", "Crea tornei privati con amici e bot"],
    ["/sfide", "⚔️", "Sfide e amichevoli", "Sfida le altre scuderie"],
    ["/bacheca", "📋", "Bacheca ingaggi", "Oltre 100 modi di fare soldi"],
    ["/clinica", "🏥", "Clinica e assicurazioni", "Malattie, cure, polizze, sorveglianza"],
    ["/laboratorio", "🧪", "Laboratorio", "Sperimentazioni a pagamento"],
    ["/mercato-nero", "🕶️", "Mercato nero", "Sicari, doping, detective e polizia"],
    ["/riproduzione", "🍼", "Riproduzione", "Stalloni e puledri"],
    ["/classifiche", "📊", "Classifiche", "I migliori del mondo"],
    ["/bar", "💬", "Il Bar", "Chat dell'ippodromo"],
    ["/posta", "✉️", "Posta", "Lettere, soldi, cavalli e richieste"],
    ["/guida", "📖", "Guida", "Come funziona tutto"],
    ["/profilo", "⚙️", "Profilo e lingua", "Colori, voce, codice di recupero"],
  ];
  view.innerHTML = `<h2 class="title-pop">✨ ${t("Altro")}</h2><div class="grid tight">${tiles
    .map(([href, ic, ti, d]) => `<a class="card" href="${href}" style="text-decoration:none;color:inherit;margin:0"><div style="font-size:30px">${ic}</div><b>${t(ti)}</b><div class="muted" style="font-size:12.5px;font-weight:700">${t(d)}</div></a>`)
    .join("")}</div>`;
}

// =============================================================== campionato
export async function league(view, _x, params) {
  let div = Number(params?.get("div")) || 1;
  const me = state.me;
  const draw = async () => {
    const d = await api(`/league?div=${div}`);
    const s = d.season;
    const myHorses = me.horses.filter((x) => !x.dead && !x.retired && x.age >= 2);
    view.innerHTML = `<div class="row between"><h2 class="title-pop">🏆 ${t("Campionato")}</h2><span class="pill">${t("Stagione")} ${s.n} · ${t("fine tra")} ${countdown(s.end - serverNow())}</span></div>
    <div class="card blue" style="font-size:14px;font-weight:700">${t("Una giornata al giorno alle 19:00 (ora italiana), 7 giornate a stagione. Punti: 25-18-15-12-10-8-6-4-2-1. A fine stagione i primi 3 salgono, gli ultimi 3 scendono e i primi tre vincono un premio. Chi si iscrive tardi gioca lo stesso, ha solo meno punti. I nuovi partono dalla Serie D.")}</div>
    <div class="card"><h3>✍️ ${t("Iscrivi i tuoi cavalli")}</h3>${myHorses.map((x) => `<div class="row between" style="margin:4px 0"><span>${esc(x.name)}</span><button class="btn small" data-j="${x.id}">${t("Iscrivi")}</button></div>`).join("") || `<p class="muted">${t("Nessun cavallo disponibile.")}</p>`}</div>
    <div class="tabs">${[1, 2, 3, 4].map((k) => `<button data-d="${k}" class="${k === div ? "on" : ""}">${["Serie A", "Serie B", "Serie C", "Serie D"][k - 1]}</button>`).join("")}</div>
    <div class="card"><h3>${esc(d.name)}</h3><table class="t"><tr><th>#</th><th>${t("Cavallo")}</th><th>${t("Pt")}</th><th>${t("Corse")}</th><th>${t("Vitt.")}</th></tr>${d.table.map((r, k) => `<tr class="click ${r.owner === me.id ? "mine" : ""}" data-go="/cavallo/${r.horseId}"><td><b>${r.pos}</b> ${k < 3 && div > 1 ? "⬆️" : ""}${k >= d.table.length - 3 && d.table.length >= 6 && div < 4 ? "⬇️" : ""}</td><td><b>${esc(r.name)}</b><br><small>${esc(r.stable)}</small></td><td><b>${r.points}</b></td><td>${r.races}</td><td>${r.wins}</td></tr>`).join("")}</table></div>`;
    view.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { div = Number(b.dataset.d); draw(); }));
    view.querySelectorAll("[data-j]").forEach((b) => (b.onclick = async () => { const r = await act("/league/join", { horseId: b.dataset.j }, false); if (r) { toast(t("Iscritto in {d}!", { d: r.division }), "ok"); draw(); } }));
  };
  await draw();
}

// =============================================================== tornei
export async function tournaments(view) {
  const d = await api("/tournaments");
  view.innerHTML = `<div class="row between"><h2 class="title-pop">🏟️ ${t("Tornei")}</h2><button class="btn primary" id="new">➕ ${t("Crea torneo")}</button></div>
  <div class="card"><h3>🔑 ${t("Hai un codice?")}</h3><div class="row"><input type="text" id="code" placeholder="ABC123" style="flex:1"/><button class="btn" id="join">${t("Entra")}</button></div></div>
  ${d.tournaments.map((x) => `<div class="race-row" data-go="/torneo/${x.id}"><div class="time">${x.private ? "🔒" : "🌍"}</div><div><div class="nm">${esc(x.name)}</div><div class="meta">${esc(x.ownerStable ?? "")} · ${x.members} ${t("iscritti")} · ${t("prova")} ${x.round}/${x.config.rounds} · ${x.config.distance} m · ${t(x.status)}</div></div><span>›</span></div>`).join("") || `<div class="card empty">${t("Nessun torneo: creane uno!")}</div>`}`;
  view.querySelector("#new").onclick = () => createTournament();
  view.querySelector("#join").onclick = async () => {
    const code = view.querySelector("#code").value.trim();
    if (!code) return;
    const hid = await pickHorse(t("Con quale cavallo?"), (x) => !x.dead && !x.retired);
    if (!hid) return;
    const r = await act("/tournament/join", { code, horseId: hid }, t("Iscritto al torneo!"));
    if (r) go("/torneo/" + r.id);
  };
}

async function createTournament() {
  const cat = await catalog();
  const days = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  modal(`<h3>🏟️ ${t("Nuovo torneo")}</h3><p class="muted">${t("Costo di organizzazione")}: 2.000 ƒ + 200 ƒ ${t("per prova")}.</p>
    <label class="f">${t("Nome")}</label><input type="text" id="nm" maxlength="40" placeholder="${t("Coppa degli Amici")}"/>
    <label class="row" style="margin-top:8px"><input type="checkbox" id="priv" checked/> ${t("Privato (si entra col codice)")}</label>
    <label class="f">${t("Ippodromo")}</label><select id="ven"><option value="random">🎲 ${t("Ogni volta diverso")}</option>${cat.venues.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join("")}</select>
    <div class="row"><div style="flex:1"><label class="f">${t("Distanza")}</label><select id="dist">${[1000, 1200, 1400, 1600, 2000, 2400, 3000, 3600].map((d) => `<option ${d === 1600 ? "selected" : ""}>${d}</option>`).join("")}</select></div>
    <div style="flex:1"><label class="f">${t("Prove")}</label><input type="number" id="rounds" value="5" min="1" max="20"/></div></div>
    <label class="row" style="margin-top:8px"><input type="checkbox" id="hur"/> ${t("Con le siepi")}</label>
    <label class="f">${t("Quando si corre")}</label>
    <select id="stype"><option value="every">${t("Ogni tot ore")}</option><option value="weekly">${t("Giorni fissi della settimana")}</option></select>
    <div id="every" class="row"><input type="number" id="hours" value="24" min="1" style="flex:1"/><span>${t("ore")}</span></div>
    <div id="weekly" class="hidden"><div class="row">${days.map((d, k) => `<label><input type="checkbox" data-wd="${k}" ${k === 5 ? "checked" : ""}/> ${t(d)}</label>`).join("")}</div><div class="row"><input type="number" id="hh" value="21" min="0" max="23" style="width:80px"/>:<input type="number" id="mm" value="0" min="0" max="59" style="width:80px"/></div></div>
    <label class="f">${t("Prima prova tra (minuti)")}</label><input type="number" id="first" value="30" min="10"/>
    <div class="row"><div style="flex:1"><label class="f">${t("Bot")}</label><input type="number" id="bots" value="5" min="0" max="11"/></div>
    <div style="flex:1"><label class="f">${t("Livello bot")}</label><select id="lvl"><option value="0.3">${t("Facili")}</option><option value="0.5" selected>${t("Normali")}</option><option value="0.75">${t("Forti")}</option></select></div></div>
    <div class="row"><div style="flex:1"><label class="f">${t("Iscrizione (va nel montepremi)")}</label><input type="number" id="fee" value="500" min="0"/></div>
    <div style="flex:1"><label class="f">${t("Max cavalli")}</label><input type="number" id="max" value="12" min="2" max="36"/></div></div>
    <button class="btn primary block" id="ok" style="margin-top:12px">🏟️ ${t("Crea")}</button>`, (m, close) => {
    m.querySelector("#stype").onchange = (e) => { m.querySelector("#every").classList.toggle("hidden", e.target.value !== "every"); m.querySelector("#weekly").classList.toggle("hidden", e.target.value !== "weekly"); };
    m.querySelector("#ok").onclick = async () => {
      const hid = await pickHorse(t("Con quale cavallo partecipi? (puoi anche solo organizzare)"), (x) => !x.dead && !x.retired);
      const stype = m.querySelector("#stype").value;
      const body = {
        name: m.querySelector("#nm").value, private: m.querySelector("#priv").checked, venue: m.querySelector("#ven").value, distance: Number(m.querySelector("#dist").value),
        rounds: Number(m.querySelector("#rounds").value), hurdles: m.querySelector("#hur").checked, bots: Number(m.querySelector("#bots").value), botLevel: Number(m.querySelector("#lvl").value),
        fee: Number(m.querySelector("#fee").value), maxHorses: Number(m.querySelector("#max").value), firstAt: serverNow() + Number(m.querySelector("#first").value) * 60000, horseId: hid ?? undefined,
        schedule: stype === "every" ? { type: "every", hours: Number(m.querySelector("#hours").value) } : { type: "weekly", days: [...m.querySelectorAll("[data-wd]")].filter((c) => c.checked).map((c) => Number(c.dataset.wd)), hour: Number(m.querySelector("#hh").value), min: Number(m.querySelector("#mm").value) },
      };
      const r = await act("/tournament", body, false);
      if (r) { close(); toast(t("Torneo creato! Codice: {c}", { c: r.code }), "gold"); go("/torneo/" + r.id); }
    };
  });
}

export async function tournament(view, id) {
  const d = await api("/tournament/" + id);
  const me = state.me;
  view.innerHTML = `<div class="hero"><h2 style="margin:0">🏟️ ${esc(d.name)}</h2><p style="margin:4px 0 0">${d.private ? "🔒 " + t("Privato") : "🌍 " + t("Pubblico")} · ${t("organizzato da")} ${esc(d.ownerStable ?? "")} · ${t("prova")} ${d.round}/${d.config.rounds} · ${t(d.status)}</p>
    ${d.code ? `<p style="margin:6px 0 0">🔑 ${t("Codice per gli amici")}: <b style="font-size:20px;letter-spacing:2px">${d.code}</b></p>` : ""}
    ${d.nextAt ? `<p style="margin:4px 0 0">⏰ ${t("Prossima prova")}: ${dayLabel(d.nextAt)} ${timeHM(d.nextAt)}</p>` : ""}
    ${d.status !== "done" ? `<button class="btn gold" id="join" style="margin-top:8px">✍️ ${t("Iscrivi un cavallo")}${d.config.fee ? ` (${money(d.config.fee)})` : ""}</button>` : ""}</div>
  <div class="card"><h3>📊 ${t("Classifica")}</h3><table class="t"><tr><th>#</th><th>${t("Cavallo")}</th><th>${t("Pt")}</th><th>${t("Corse")}</th></tr>${d.table.map((r) => `<tr class="click ${r.owner === me.id ? "mine" : ""}" data-go="/cavallo/${r.horseId}"><td>${r.pos}</td><td><b>${esc(r.name)}</b><br><small>${esc(r.stable)}${r.owner ? "" : " 🤖"}</small></td><td><b>${r.points}</b></td><td>${r.races}</td></tr>`).join("")}</table></div>
  <div class="card"><h3>🏁 ${t("Prove")}</h3>${d.races.map((r) => `<div class="race-row" data-go="/corsa/${r.id}"><div class="time">${timeHM(r.start_at)}</div><div><div class="nm">${esc(r.name)}</div><div class="meta">${t(r.status)}</div></div><span>›</span></div>`).join("") || `<p class="muted">${t("La prima prova non è ancora stata creata.")}</p>`}</div>`;
  if (d.owner === me.id && d.status !== "done") {
    const b = document.createElement("button");
    b.className = "btn";
    b.style.marginTop = "8px";
    b.textContent = "🤖 " + t("Invita una scuderia NPC");
    view.querySelector(".hero").appendChild(b);
    b.onclick = async () => {
      const { npcs } = await api("/npcs");
      modal(`<h3>🤖 ${t("Invita una scuderia NPC")}</h3><div class="stack">${npcs.map((n) => `<button class="btn block" data-n="${n.id}" style="justify-content:flex-start">${silksSvg(n.silks, 20)} ${esc(n.stable)} <small>(${esc(n.name)})</small></button>`).join("")}</div>`, (mm, close) => {
        mm.querySelectorAll("[data-n]").forEach((x) => (x.onclick = async () => { if (await act("/tournament/invite", { id: d.id, npcId: x.dataset.n })) { close(); tournament(view, id); } }));
      });
    };
  }
  const j = view.querySelector("#join");
  if (j) j.onclick = async () => {
    const hid = await pickHorse(t("Con quale cavallo?"), (x) => !x.dead && !x.retired);
    if (hid && (await act("/tournament/join", { id: d.id, code: d.code ?? undefined, horseId: hid }, t("Iscritto!")))) tournament(view, id);
  };
}

// =============================================================== sfide
export async function challenges(view) {
  await loadMe();
  const me = state.me;
  const now = serverNow();
  const races = (await api(`/races?from=${now}&to=${now + 3600_000}`)).races.filter((r) => r.kind === "friendly" && r.open && r.status === "open");
  view.innerHTML = `<h2 class="title-pop">⚔️ ${t("Sfide e amichevoli")}</h2>
  <div class="row" style="margin-bottom:12px"><button class="btn primary" id="fr">🤝 ${t("Amichevole")}</button></div>
  <div class="card pink"><h3>📨 ${t("Sfide in sospeso")}</h3>${me.challenges.map((c) => {
    const incoming = c.to_player === me.id;
    return `<div class="row between" style="margin:6px 0"><span>${incoming ? "⬅️ " + t("Ti hanno sfidato") : "➡️ " + t("Hai sfidato")} ${c.stake ? `· ${money(c.stake)}` : ""}</span>${incoming ? `<span class="row"><button class="btn small green" data-acc="${c.id}">${t("Accetta")}</button><button class="btn small" data-dec="${c.id}">${t("Rifiuta")}</button></span>` : `<small>${t("in attesa")}</small>`}</div>`;
  }).join("") || `<p class="muted">${t("Nessuna sfida.")}</p>`}</div>
  <div class="card"><h3>🔎 ${t("Cerca un cavallo da sfidare")}</h3><div class="row"><input type="text" id="q" placeholder="${t("Nome del cavallo")}" style="flex:1"/><button class="btn" id="s">🔎</button></div><div id="res" style="margin-top:8px"></div></div>
  <div class="card"><h3>🌍 ${t("Amichevoli aperte")}</h3>${races.map((r) => raceRow(r, now)).join("") || `<p class="muted">${t("Nessuna amichevole aperta. Creane una aperta a tutti!")}</p>`}</div>`;
  view.querySelector("#fr").onclick = () => friendlyModal();
  view.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = async () => { const r = await act("/challenge/" + b.dataset.acc, { accept: true }, t("Sfida accettata!")); if (r) go("/corsa/" + r.raceId); }));
  view.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = async () => { await act("/challenge/" + b.dataset.dec, { accept: false }); challenges(view); }));
  const search = async () => {
    const r = await api("/search?q=" + encodeURIComponent(view.querySelector("#q").value));
    view.querySelector("#res").innerHTML = r.horses.filter((x) => x.ownerId !== me.id).map((x) => `<div class="race-row" data-go="/cavallo/${x.id}"><div class="time">⚔️</div><div><div class="nm">${esc(x.name)}</div><div class="meta">${esc(x.stable)} · ⭐ ${x.rating}</div></div><span>›</span></div>`).join("") || `<p class="muted">${t("Nessun risultato.")}</p>`;
  };
  view.querySelector("#s").onclick = search;
  view.querySelector("#q").onkeydown = (e) => { if (e.key === "Enter") search(); };
}

// =============================================================== bacheca
const KIND_ICON = { job: "💼", stud: "🐎", surrogate: "🤰", contract: "✍️", buyout: "💰", loan: "🏦" };
export async function offers(view) {
  await loadMe();
  const d = await api("/offers");
  const me = state.me;
  view.innerHTML = `<div class="row between"><h2 class="title-pop">📋 ${t("Bacheca ingaggi")}</h2><span class="pill">🔄 ${countdown(d.nextRefresh - serverNow())}</span></div>
  <div class="card blue" style="font-size:14px;font-weight:700">${t("Ogni 6 ore arrivano nuove proposte (ce ne sono {n} tipi diversi). Fai soldi, ma attento: impegnano il cavallo, lo stancano e a volte gli cambiano il carattere.", { n: d.total })}</div>
  <div class="grid">${d.offers.map((o) => {
    const info = [];
    if (o.hours) info.push(`⏳ ${o.hours}h`);
    if (o.fatigue) info.push(`${o.fatigue > 0 ? "😓" : "😌"} ${o.fatigue > 0 ? "+" : ""}${o.fatigue} ${t("fatica")}`);
    if (o.risk) info.push(`🚑 ${Math.round(o.risk * 100)}%`);
    if (o.sex) info.push(o.sex === "M" ? "♂ " + t("stallone") : "♀ " + t("cavalla"));
    if (o.minOverall) info.push(`${t("val.")} ≥ ${o.minOverall}`);
    if (o.cond) info.push("🏁 " + (o.cond.win ? t("deve vincere") : o.cond.top ? t("primi {n}", { n: o.cond.top }) : o.cond.worse ? t("dopo il {n}°", { n: o.cond.worse }) : t("arrivare al traguardo")));
    if (o.scandal) info.push(`🚨 ${t("rischio scandalo")} ${Math.round(o.scandal * 100)}%`);
    if (o.repay) info.push(`🔁 ${t("restituisci")} ${money(Math.round(o.pay * o.repay))}`);
    if (o.stims) info.push("🧠 " + Object.entries(o.stims).map(([s, v]) => `${v > 0 ? "😨" : "😎"}${t(s)}`).join(" "));
    if (o.gains) info.push("📈 " + Object.entries(o.gains).map(([s, v]) => `${s} ${v > 0 ? "+" : ""}${v}`).join(", "));
    return `<div class="card ${o.shady ? "danger" : o.kind === "contract" ? "hl" : ""}" style="${o.status !== "open" ? "opacity:.55" : ""}">
      <span class="corner">${KIND_ICON[o.kind] ?? "📋"} ${money(o.pay)}</span>
      <h3>${esc(o.title)}</h3><p style="font-size:14px;font-weight:700;margin:4px 0 8px">${esc(o.desc)}</p>
      ${o.horseName ? `<p><b>🐴 ${esc(o.horseName)}</b></p>` : ""}
      <div style="font-size:12.5px;font-weight:800" class="${o.shady ? "" : "muted"}">${info.join(" · ")}</div>
      ${o.status === "open" ? `<button class="btn ${o.shady ? "red" : "primary"} small" data-o="${o.id}" data-k="${o.kind}" style="margin-top:10px">${t("Accetta")}</button>` : `<span class="tag green" style="margin-top:8px">✓ ${t("accettato")}</span>`}
    </div>`;
  }).join("")}</div>`;
  view.querySelectorAll("[data-o]").forEach((b) => (b.onclick = async () => {
    let hid;
    if (b.dataset.k !== "loan" && b.dataset.k !== "buyout") {
      hid = await pickHorse(t("Quale cavallo?"), (x) => !x.dead);
      if (!hid) return;
    } else if (!(await confirmBox(t("Accettare l'offerta?")))) return;
    const r = await act("/offers/accept", { offerId: b.dataset.o, horseId: hid }, false);
    if (r) { toast(r.text, "ok"); nonnaSay(t("Bravo, i soldi non crescono sugli alberi. Crescono sui cavalli."), "sly"); offers(view); }
  }));
  void me;
}

// =============================================================== clinica
export async function clinic(view) {
  await loadMe();
  const cat = await catalog();
  const me = state.me;
  const horses = me.horses.filter((x) => !x.dead);
  const sec = cat.security;
  view.innerHTML = `<h2 class="title-pop">🏥 ${t("Clinica e assicurazioni")}</h2>
  <div class="card pink"><h3>🤒 ${t("Malati e infortunati")}</h3>${horses.filter((x) => x.illness || x.cond.injury).map((x) => {
    const ill = x.illness;
    const dis = ill ? cat.diseases.find((d) => d.id === ill.id) : null;
    return `<div class="card" style="margin:8px 0"><div class="row between"><b>${esc(x.name)}</b><span>${statusTags(x)}</span></div>
      ${ill ? `<p style="margin:6px 0">${ill.diagnosed && dis ? `🩺 <b>${esc(dis.name)}</b> (${t("gravità")} ${dis.severity}/5${dis.contagious ? ", " + t("contagiosa") : ""})` : `❓ ${t("Sintomi strani. Serve una diagnosi.")}`}${ill.treatment ? `<br>💊 ${t("In cura fino alle")} ${timeHM(ill.until)}` : ill.untreatedDays ? `<br>⚠️ ${t("Non curato da {n} giorni!", { n: ill.untreatedDays })}` : ""}</p>
      <div class="row">${!ill.diagnosed ? `<button class="btn small" data-diag="${x.id}">🩺 ${t("Diagnosi")} (${money(cat.diagnosisCost)})</button>` : ""}${!ill.treatment ? cat.treatments.map((tr) => `<button class="btn small ${tr.id === "sperimentale" ? "red" : ""}" data-tr="${tr.id}" data-h="${x.id}" title="${esc(t(tr.desc))}">${t(tr.name)} ~${money(tr.cost)}</button>`).join("") : ""}</div>` : `<p style="margin:6px 0">🚑 ${esc(x.cond.injury.name)} — ${t("guarisce alle")} ${timeHM(x.cond.injury.until)}</p>`}
    </div>`;
  }).join("") || `<p class="muted">${t("Tutti sani! Ogni tanto fai fare una visita di controllo: i cavalli stanchi si ammalano più spesso.")}</p>`}
    <div class="row"><button class="btn small" id="check">🩺 ${t("Visita di controllo")}</button></div></div>
  <div class="card"><h3>📄 ${t("Assicurazioni")}</h3><p class="muted" style="margin-top:0">${t("La Polizza Completa ti rimborsa il valore del cavallo se muore (anche se te lo ammazza un sicario) e l'80% delle spese veterinarie.")}</p>
    <table class="t"><tr><th>${t("Cavallo")}</th><th>${t("Polizza")}</th><th></th></tr>${horses.map((x) => `<tr><td>${esc(x.name)}<br><small>${money(x.value)}</small></td><td>${x.insurance ? t(cat.policies.find((p) => p.id === x.insurance.policy)?.name ?? "") + `<br><small>${money(x.insurance.value)}</small>` : "—"}</td><td><button class="btn small" data-ins="${x.id}">📄</button></td></tr>`).join("")}</table></div>
  <div class="card"><h3>🛡️ ${t("Sorveglianza della scuderia")}</h3><p class="muted" style="margin-top:0">${t("Ferma i sabotatori prima che agiscano (anche i sicari in pista). Si paga ogni giorno.")}</p>
    <div class="stack">${sec.map((s) => `<button class="btn block ${s.level === me.security ? "primary" : ""}" data-sec="${s.level}" style="justify-content:space-between"><span>${["🚪", "👴", "👮", "🐕‍🦺"][s.level]} ${t(s.name)} · ${t("blocca il")} ${Math.round(s.intercept * 100)}%</span><small>${s.perDay ? money(s.perDay) + "/" + t("giorno") : ""}</small></button>`).join("")}</div></div>`;
  view.querySelectorAll("[data-diag]").forEach((b) => (b.onclick = async () => { const r = await act(`/horse/${b.dataset.diag}/diagnose`, {}); if (r) clinic(view); }));
  view.querySelectorAll("[data-tr]").forEach((b) => (b.onclick = async () => { const r = await act(`/horse/${b.dataset.h}/treat`, { treatment: b.dataset.tr }); if (r) clinic(view); }));
  view.querySelectorAll("[data-ins]").forEach((b) => (b.onclick = async () => { const { insureModal } = await import("./stable.js"); insureModal(horses.find((x) => x.id === b.dataset.ins), () => clinic(view)); }));
  view.querySelectorAll("[data-sec]").forEach((b) => (b.onclick = async () => { await act("/security", { level: Number(b.dataset.sec) }, t("Sorveglianza aggiornata!")); clinic(view); }));
  view.querySelector("#check").onclick = async () => { const hid = await pickHorse(t("Chi visitiamo?")); if (hid && (await act(`/horse/${hid}/diagnose`, {}))) clinic(view); };
}

// =============================================================== laboratorio
export async function lab(view) {
  const cat = await catalog();
  view.innerHTML = `<h2 class="title-pop">🧪 ${t("Laboratorio")}</h2>
  <div class="card danger"><h3>⚠️ ${t("Sperimentazioni")}</h3><p>${t("Le aziende pagano per provare farmaci e terapie sui tuoi cavalli. A volte migliorano, a volte peggiorano, a volte sviluppano manie nuove. Raramente... non tornano. Le sperimentazioni non sono coperte dall'assicurazione.")}</p></div>
  <div class="grid">${cat.trials.map((tr) => `<div class="card"><span class="corner">💰 ${money(tr.pay[0])}–${money(tr.pay[1])}</span><h3>🧪 ${t(tr.name)}</h3><p style="font-size:14px;font-weight:700">${t(tr.desc)}</p>
    <div class="muted" style="font-size:12.5px;font-weight:800">⏳ ${Math.round(tr.days * 24)}h · ${tr.risks.statUp ? `📈 ${Math.round(tr.risks.statUp * 100)}% ` : ""}${tr.risks.statDown ? `📉 ${Math.round(tr.risks.statDown * 100)}% ` : ""}${tr.risks.quirk ? `🌀 ${Math.round(tr.risks.quirk * 100)}% ` : ""}${tr.risks.illness ? `🤒 ${Math.round(tr.risks.illness * 100)}% ` : ""}${tr.risks.death ? `💀 ${Math.round(tr.risks.death * 100)}%` : ""}</div>
    <button class="btn primary small" data-tr="${tr.id}" style="margin-top:10px">${t("Partecipa")}</button></div>`).join("")}</div>`;
  view.querySelectorAll("[data-tr]").forEach((b) => (b.onclick = async () => {
    const hid = await pickHorse(t("Quale cavallo mandi in laboratorio?"), (x) => !x.dead);
    if (!hid) return;
    const r = await act(`/horse/${hid}/trial`, { trial: b.dataset.tr }, false);
    if (r) { modal(`<h3>🧪 ${t("Risultato")}</h3><p style="font-weight:800">${esc(r.text)}</p>`); loadMe(); }
  }));
}

// =============================================================== mercato nero
export async function crime(view, _x, params) {
  await loadMe();
  const cat = await catalog();
  const me = state.me;
  let tab = params?.get("tab") || "servizi";
  const target = params?.get("target");
  let targetHorse = target ? await api("/horse/" + target).catch(() => null) : null;
  tutorialMark("mercato_nero");
  const draw = async () => {
    const banned = me.crimeBan > serverNow();
    let body = "";
    if (tab === "servizi") {
      const groups = [["prima", "🌙 Prima della corsa"], ["gara", "🎯 Durante la corsa (sicario in pista)"], ["doping", "💉 Doping (sui tuoi cavalli)"]];
      body = `${banned ? `<div class="card danger">🚫 ${t("Dopo lo scandalo nessuno ti vende niente fino alle")} ${timeHM(me.crimeBan)}.</div>` : ""}
      <div class="card"><h3>🎯 ${t("Bersaglio")}</h3>${targetHorse ? `<div class="row between"><b>${esc(targetHorse.name)}</b><small>${esc(targetHorse.stable)}</small><button class="btn small" id="chg">${t("Cambia")}</button></div>` : `<div class="row"><input type="text" id="q" placeholder="${t("Cerca il cavallo da colpire")}" style="flex:1"/><button class="btn" id="s">🔎</button></div><div id="res"></div>`}</div>
      ${groups.map(([w, title]) => `<h3>${t(title)}</h3><div class="grid">${cat.crimes.filter((c) => c.when === w).map((c) => `<div class="card danger"><span class="corner">${money(c.cost)}</span><h3>${c.icon} ${t(c.name)}</h3><p style="font-size:14px">${t(c.desc)}</p>${c.caught ? `<small>🚨 ${t("rischio di essere beccati")} ~${Math.round(c.caught * 100)}%</small><br>` : ""}<button class="btn red small" data-c="${c.id}" data-w="${c.when}" style="margin-top:8px" ${banned ? "disabled" : ""}>${t("Ordina")}</button></div>`).join("")}</div>`).join("")}`;
    } else {
      const cs = (await api("/cases")).cases;
      body = `<div class="card blue" style="font-weight:700;font-size:14px">${t("Ogni sabotaggio subito apre un caso. Un detective privato può scoprire il mandante; con le prove la polizia lo arresta quasi sempre (multa, risarcimento per te, reputazione a picco). Senza prove la polizia è lenta e raramente conclude qualcosa.")}</div>
      ${cs.map((c) => `<div class="card ${c.solved ? "hl" : ""}"><div class="row between"><b>${c.icon} ${esc(c.service)} → ${esc(c.horse)}</b><small>${ago(c.ts, serverNow())}</small></div>
        <p style="margin:6px 0;font-weight:700">${c.convicted ? "⚖️ " + t("Colpevole punito") + (c.culprit ? `: ${esc(c.culprit)}` : "") : c.solved ? "🕵️ " + t("Colpevole") + `: <b>${esc(c.culprit)}</b>` : "❓ " + t("Colpevole sconosciuto")}</p>
        ${c.inv && !c.inv.done ? `<p>🕵️ ${esc(c.inv.name)} ${t("indaga, risposta alle")} ${timeHM(c.inv.until)}</p>` : ""}
        ${c.police && !c.police.done ? `<p>👮 ${t("La polizia indaga, risposta alle")} ${timeHM(c.police.until)}</p>` : ""}
        <div class="row">${!c.solved && !(c.inv && !c.inv.done) ? cat.detectives.map((d) => `<button class="btn small" data-inv="${c.id}" data-d="${d.id}" title="${esc(t(d.desc))}">${d.icon} ${t(d.name)} · ${money(d.cost)} · ${Math.round(d.chance * 100)}%</button>`).join("") : ""}
        ${!c.convicted && !(c.police && !c.police.done) ? `<button class="btn small blue" data-pol="${c.id}">👮 ${t("Denuncia alla polizia")}</button>` : ""}</div></div>`).join("") || `<div class="card empty">${t("Nessun caso aperto. Per ora nessuno ce l'ha con te.")}</div>`}`;
    }
    view.innerHTML = `<h2 class="title-pop">🕶️ ${t("Mercato nero")}</h2>
      <div class="tabs"><button data-t="servizi" class="${tab === "servizi" ? "on" : ""}">💼 ${t("Servizi")}</button><button data-t="casi" class="${tab === "casi" ? "on" : ""}">🕵️ ${t("I tuoi casi (detective e polizia)")}</button></div>${body}`;
    view.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
    const s = view.querySelector("#s");
    if (s) {
      const search = async () => {
        const r = await api("/search?q=" + encodeURIComponent(view.querySelector("#q").value));
        view.querySelector("#res").innerHTML = r.horses.filter((x) => x.ownerId !== me.id).map((x) => `<button class="btn block small" data-tg="${x.id}" style="margin-top:6px;justify-content:space-between"><span>${esc(x.name)}</span><small>${esc(x.stable)}</small></button>`).join("") || `<p class="muted">${t("Nessun risultato.")}</p>`;
        view.querySelectorAll("[data-tg]").forEach((b) => (b.onclick = async () => { targetHorse = await api("/horse/" + b.dataset.tg); draw(); }));
      };
      s.onclick = search;
    }
    const chg = view.querySelector("#chg");
    if (chg) chg.onclick = () => { targetHorse = null; draw(); };
    view.querySelectorAll("[data-c]").forEach((b) => (b.onclick = async () => {
      let tid = targetHorse?.id;
      if (b.dataset.w === "doping") {
        tid = await pickHorse(t("Chi dopi?"), (x) => !x.dead);
        if (!tid) return;
      } else if (!tid) return toast(t("Scegli prima un bersaglio."), "err");
      let when;
      if (b.dataset.w === "gara") {
        when = await new Promise((res) => modal(`<h3>⏱️ ${t("Quando deve agire il sicario?")}</h3><div class="stack">${[["presto", "Subito dopo la partenza"], ["meta", "A metà corsa"], ["curva", "All'ultima curva"], ["rettilineo", "Sul rettilineo finale"]].map(([k, l]) => `<button class="btn block" data-w="${k}">${t(l)}</button>`).join("")}</div>`, (m, close) => m.querySelectorAll("[data-w]").forEach((x) => (x.onclick = () => { close(); res(x.dataset.w); }))));
        if (!when) return;
      }
      if (!(await confirmBox(t("Sei proprio sicuro? Se ti beccano sono guai."), t("Fallo")))) return;
      const r = await act("/crime", { service: b.dataset.c, targetId: tid, when }, false);
      if (r) { modal(`<h3>🕶️</h3><p style="font-weight:800">${esc(r.text)}</p>`); nonnaSay(t("Io non ho visto niente. Non ho visto niente!"), "shock"); }
    }));
    view.querySelectorAll("[data-inv]").forEach((b) => (b.onclick = async () => { if (await act("/investigate", { crimeId: b.dataset.inv, detective: b.dataset.d })) draw(); }));
    view.querySelectorAll("[data-pol]").forEach((b) => (b.onclick = async () => { if (await act("/police", { crimeId: b.dataset.pol })) draw(); }));
  };
  await draw();
}

// =============================================================== classifiche
export async function leaderboard(view) {
  const d = await api("/leaderboard");
  let tab = "rich";
  const draw = () => {
    let body = "";
    if (tab === "rich") body = `<table class="t"><tr><th>#</th><th>${t("Scuderia")}</th><th>${t("Patrimonio")}</th></tr>${d.richest.map((p, k) => `<tr class="click ${p.id === state.me.id ? "mine" : ""}" data-go="/scuderia/${p.id}"><td>${k + 1}</td><td>${silksSvg(p.silks, 18)} <b>${esc(p.stable)}</b><br><small>${esc(p.name)} · ${p.horses} 🐴</small></td><td><b>${money(p.total)}</b></td></tr>`).join("")}</table>`;
    if (tab === "wins") body = `<table class="t"><tr><th>#</th><th>${t("Scuderia")}</th><th>${t("Vittorie")}</th><th>${t("Guadagni")}</th></tr>${d.winners.map((p, k) => `<tr class="click" data-go="/scuderia/${p.id}"><td>${k + 1}</td><td>${silksSvg(p.silks, 18)} <b>${esc(p.stable)}</b></td><td>${p.wins}/${p.races}</td><td>${money(p.earnings)}</td></tr>`).join("")}</table>`;
    if (tab === "horses") body = `<table class="t"><tr><th>#</th><th>${t("Cavallo")}</th><th>⭐</th><th>${t("Vittorie")}</th></tr>${d.horses.map((x, k) => `<tr class="click" data-go="/cavallo/${x.id}"><td>${k + 1}</td><td><b>${esc(x.name)}</b>${x.bot ? " 🤖" : ""}<br><small>${esc(x.stable)}</small></td><td>${x.rating}</td><td>${x.wins}/${x.starts}</td></tr>`).join("")}</table>`;
    view.innerHTML = `<h2 class="title-pop">📊 ${t("Classifiche")}</h2><div class="tabs">${[["rich", "Più ricchi"], ["wins", "Più vittorie"], ["horses", "Cavalli migliori"]].map(([k, l]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}">${t(l)}</button>`).join("")}</div><div class="card">${body}</div>`;
    view.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
  };
  draw();
}

// =============================================================== bar
export async function chat(view) {
  const d = await api("/chat");
  view.innerHTML = `<h2 class="title-pop">💬 ${t("Il Bar dell'ippodromo")}</h2><div class="card"><div id="msgs" style="max-height:55vh;overflow:auto"></div>
    <div class="row" style="margin-top:10px"><input type="text" id="tx" maxlength="300" placeholder="${t("Scrivi qualcosa...")}" style="flex:1"/><button class="btn primary" id="send">➤</button></div></div>`;
  const box = view.querySelector("#msgs");
  const add = (m) => {
    const div = document.createElement("div");
    div.className = "note";
    div.innerHTML = `<b ${m.player ? `data-go="/scuderia/${m.player}" style="cursor:pointer"` : ""}>${esc(m.name)}</b> <small style="display:inline">${timeHM(m.ts)}</small><br>${esc(m.text)}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  };
  d.messages.forEach(add);
  const send = async () => {
    const tx = view.querySelector("#tx");
    if (!tx.value.trim()) return;
    try { await api("/chat", { text: tx.value }); tx.value = ""; } catch (e) { toast(e.message, "err"); }
  };
  view.querySelector("#send").onclick = send;
  view.querySelector("#tx").onkeydown = (e) => { if (e.key === "Enter") send(); };
  const off = onWsMessage((m) => {
    if (m.t === "chat") add(m.msg);
    if (m.t === "chat_sys") add({ ts: serverNow(), name: "📢 Ippodromo", text: m.text });
  });
  setCleanup(off);
}

void horseSvg;

// =============================================================== posta
export async function mail(view, _x, params) {
  await loadMe();
  const d = await api("/mail");
  const me = state.me;
  const to = params?.get("to") ?? "";
  view.innerHTML = `<div class="row between"><h2 class="title-pop">✉️ ${t("Posta")}</h2><button class="btn primary" id="new">✍️ ${t("Scrivi")}</button></div>
  ${d.mail.map((m) => `<div class="card ${!m.mine && !m.read ? "pink" : ""}" data-m="${m.id}">
    <div class="row between"><b>${m.mine ? "➡️ " + t("a") + " " + esc(m.toName) : "⬅️ " + t("da") + " " + esc(m.fromName)}</b><small>${ago(m.ts, serverNow())}</small></div>
    <h3 style="margin:6px 0">${esc(m.subject)}</h3>${m.body ? `<p style="white-space:pre-wrap;font-weight:700;margin:0 0 6px">${esc(m.body)}</p>` : ""}
    <div class="row">${m.money ? `<span class="tag gold">💰 ${money(m.money)}</span>` : ""}${m.horse_name ? `<span class="tag blue">🐴 ${esc(m.horse_name)}</span>` : ""}${m.request ? `<span class="tag red">🙏 ${t("richiesta")} ${money(m.request)} · ${t(m.status)}</span>` : ""}</div>
    <div class="row" style="margin-top:8px">${!m.mine && m.status === "request" ? `<button class="btn small green" data-pay="${m.id}">💸 ${t("Paga")} ${money(m.request)}</button><button class="btn small" data-no="${m.id}">${t("Rifiuta")}</button>` : ""}${!m.mine ? `<button class="btn small" data-re="${esc(m.fromName)}" data-sub="${esc(m.subject)}">↩️ ${t("Rispondi")}</button>` : ""}</div>
  </div>`).join("") || `<div class="card empty">${t("Nessuna lettera. Scrivi a qualcuno!")}</div>`}`;
  const compose = (who = "", subj = "") => modal(`<h3>✍️ ${t("Nuova lettera")}</h3>
    <label class="f">${t("A (nome della scuderia)")}</label><input type="text" id="to" value="${esc(who)}"/>
    <label class="f">${t("Oggetto")}</label><input type="text" id="sub" value="${esc(subj)}" maxlength="80"/>
    <label class="f">${t("Messaggio")}</label><textarea id="body" rows="4" maxlength="2000"></textarea>
    <div class="row"><div style="flex:1"><label class="f">💰 ${t("Allega soldi")}</label><input type="number" id="mon" value="0" min="0"/></div>
    <div style="flex:1"><label class="f">🙏 ${t("Chiedi soldi")}</label><input type="number" id="req" value="0" min="0"/></div></div>
    <label class="f">🐴 ${t("Spedisci un cavallo (diventa suo!)")}</label><select id="hs"><option value="">—</option>${me.horses.filter((x) => !x.dead).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
    <button class="btn primary block" id="ok" style="margin-top:12px">📮 ${t("Spedisci")}</button>`, (m, close) => {
    m.querySelector("#ok").onclick = async () => {
      const body = { to: m.querySelector("#to").value, subject: m.querySelector("#sub").value, body: m.querySelector("#body").value, money: Number(m.querySelector("#mon").value), request: Number(m.querySelector("#req").value), horseId: m.querySelector("#hs").value || undefined };
      if (body.horseId && !(await confirmBox(t("Il cavallo passerà per sempre all'altra scuderia. Confermi?")))) return;
      if (await act("/mail", body)) { close(); mail(view, _x, new URLSearchParams()); }
    };
  });
  view.querySelector("#new").onclick = () => compose();
  if (to) compose(to);
  view.querySelectorAll("[data-pay]").forEach((b) => (b.onclick = async () => { if (await act(`/mail/${b.dataset.pay}/pay`, { accept: true }, t("Pagato!"))) mail(view, _x, new URLSearchParams()); }));
  view.querySelectorAll("[data-no]").forEach((b) => (b.onclick = async () => { if (await act(`/mail/${b.dataset.no}/pay`, { accept: false })) mail(view, _x, new URLSearchParams()); }));
  view.querySelectorAll("[data-re]").forEach((b) => (b.onclick = () => compose(b.dataset.re, "Re: " + b.dataset.sub)));
  for (const m of d.mail) if (!m.mine && !m.read) api(`/mail/${m.id}/read`, {}).catch(() => {});
  setTimeout(loadMe, 1500);
}
