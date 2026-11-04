import { state, api, act, go, loadMe, confirmBox, modal, pickHorse } from "../app.js";
import { t } from "../i18n.js";
import { esc, money, horseSvg, silksSvg, formStr, statusTags, timeHM } from "../ui.js";
import { nonnaSay } from "../nonna.js";

const COAT = { baio: "Baio", baio_scuro: "Baio scuro", sauro: "Sauro", sauro_bruciato: "Sauro bruciato", morello: "Morello", grigio: "Grigio", grigio_pomellato: "Grigio pomellato", palomino: "Palomino", isabella: "Isabella", falbo: "Falbo", roano: "Roano", pezzato: "Pezzato", leopardato: "Leopardato", cremello: "Cremello" };

function sellCard(x, mine) {
  const st = x.stats;
  const top = Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  const label = { speed: "⚡ veloce", accel: "🚀 scattante", stamina: "🫁 resistente", strength: "💪 forte", agility: "🌀 agile", recovery: "♻️ recupera", jumping: "🪵 saltatore", courage: "🦁 coraggioso", calm: "😌 calmo", focus: "🎯 concentrato", grit: "🔥 grintoso", smarts: "🧠 sveglio", consistency: "📏 regolare" };
  return `<div class="card">
    <div class="hcard" data-go="/cavallo/${x.id}"><div class="portrait">${horseSvg(x.look, { silks: x.silks })}</div>
    <div class="info"><div class="name">${x.sex === "M" ? "♂" : "♀"} ${esc(x.name)}</div>
    <div class="muted" style="font-size:13px;font-weight:700">${x.age} ${t("anni")} · ${t(COAT[x.look.coat] ?? x.look.coat)} · ${x.apt.heightCm} cm</div>
    <div style="font-size:12.5px;font-weight:800">${top.map((k) => t(label[k] ?? k)).join(" · ")}</div>
    <div class="muted" style="font-size:12.5px;font-weight:700">${t("val.")} ~${Math.round(x.overall / 5) * 5} · ⭐ ${x.rating} · ${x.rec.starts ? `${x.rec.wins}/${x.rec.starts} · ${formStr(x.rec.form)}` : t("mai corso")}${x.hiddenQuirks ? ` · ❓×${x.hiddenQuirks}` : ""}</div>
    <div class="muted" style="font-size:12.5px">${esc(x.stable)}</div></div></div>
    <div class="row between" style="margin-top:8px"><b style="font-size:18px">${money(x.price)}</b>${mine ? `<span class="tag gold">${t("tuo")}</span>` : `<button class="btn primary small" data-buy="${x.id}" data-price="${x.price}" data-name="${esc(x.name)}">🛒 ${t("Compra")}</button>`}</div>
  </div>`;
}

export async function market(view) {
  const data = await api("/market");
  const me = state.me;
  let tab = sessionStorage.getItem("ha_mt") || "sys";
  const draw = () => {
    let list = data.horses;
    if (tab === "sys") list = list.filter((x) => !x.ownerId);
    if (tab === "pl") list = list.filter((x) => x.ownerId);
    if (tab === "young") list = list.filter((x) => x.age < 3.2);
    if (tab === "cheap") list = list.filter((x) => x.price <= 12000);
    view.querySelector("#list").innerHTML = list.length ? list.map((x) => sellCard(x, x.ownerId === me.id)).join("") : `<div class="card empty">${t("Niente in vendita qui. L'allevamento rifornisce il mercato ogni 6 ore.")}</div>`;
    view.querySelectorAll("[data-buy]").forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      if (await confirmBox(t("Comprare {n} per {p}?", { n: b.dataset.name, p: money(Number(b.dataset.price)) }))) {
        const r = await act("/market/buy", { horseId: b.dataset.buy }, t("Comprato! Benvenuto in scuderia."));
        if (r) {
          nonnaSay(t("Che bel cavallo! Trattalo bene, e dagli da mangiare. Non come fai tu."), "proud");
          go("/cavallo/" + b.dataset.buy);
        }
      }
    }));
  };
  view.innerHTML = `<div class="row between"><h2 class="title-pop">🛒 ${t("Mercato")}</h2><span class="pill money">${money(me.money)}</span></div>
  <div class="card blue" style="font-size:14px;font-weight:700">💡 ${t("Le statistiche di chi non è tuo sono stime. I quirk non li conosce nessuno: lo scoprirai in gara! I puledri giovani costano meno ma hanno margine; i vecchi sono già fatti ma calano.")}</div>
  <div class="tabs">${[["sys", "Allevamento"], ["pl", "Giocatori"], ["young", "Giovani"], ["cheap", "Economici"], ["all", "Tutti"]].map(([k, l]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}">${t(l)}</button>`).join("")}</div>
  <div class="grid" id="list"></div>`;
  view.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
    tab = b.dataset.t;
    sessionStorage.setItem("ha_mt", tab);
    view.querySelectorAll("[data-t]").forEach((z) => z.classList.toggle("on", z === b));
    draw();
  }));
  draw();
}

export async function breeding(view) {
  await loadMe();
  const me = state.me;
  const studs = (await api("/stud")).horses;
  const mares = me.horses.filter((x) => x.sex === "F" && !x.dead);
  const myStallions = me.horses.filter((x) => x.sex === "M" && !x.dead && x.age >= 3);
  const pregnant = mares.filter((x) => x.cond.pregnant);
  view.innerHTML = `<h2 class="title-pop">🍼 ${t("Riproduzione")}</h2>
  <div class="card blue" style="font-size:14px;font-weight:700">${t("Accoppia una tua cavalla (almeno 3 anni) con uno stallone: tuo, oppure di un altro giocatore pagando la monta. Il puledro eredita il potenziale dei genitori (con qualche sorpresa genetica), a volte anche i loro quirk. Nasce dopo un giorno e mezzo e corre dai 2 anni.")}</div>
  ${pregnant.length ? `<div class="card pink"><h3>🤰 ${t("In attesa")}</h3>${pregnant.map((x) => `<div>${esc(x.name)} × ${esc(x.cond.pregnant.sireName)} — ${t("nascita alle")} ${timeHM(x.cond.pregnant.until)}</div>`).join("")}</div>` : ""}
  <div class="card"><h3>🐎 ${t("Stalloni disponibili")}</h3>
    ${myStallions.map((x) => `<div class="race-row" data-sire="${x.id}"><div class="time">♂</div><div><div class="nm">${esc(x.name)} <span class="tag gold">${t("tuo")}</span></div><div class="meta">${t("val.")} ${x.overall} · ⭐ ${x.rating} · ${x.rec.wins} ${t("vittorie")}</div></div><span class="btn small">${t("Scegli")}</span></div>`).join("")}
    ${studs.filter((s) => s.ownerId !== me.id).map((x) => `<div class="race-row" data-sire="${x.id}"><div class="time">♂</div><div><div class="nm">${esc(x.name)}</div><div class="meta">${esc(x.stable)} · ⭐ ${x.rating} · ${x.rec.wins}/${x.rec.starts} · ${x.quirks.length ? "🔍 " + x.quirks.map((q) => esc(q.name)).join(", ") : ""}</div></div><span class="btn small primary">${money(x.studFee)}</span></div>`).join("") || `<p class="muted">${t("Nessuno stallone in monta al momento.")}</p>`}
  </div>
  <div class="card"><h3>♀ ${t("Le tue cavalle")}</h3>${mares.map((x) => `<div class="row between"><a href="/cavallo/${x.id}">${esc(x.name)}</a><span>${statusTags(x)}</span></div>`).join("") || `<p class="muted">${t("Non hai cavalle.")}</p>`}</div>`;
  view.querySelectorAll("[data-sire]").forEach((b) => (b.onclick = async () => {
    const mare = await pickHorse(t("Quale cavalla?"), (x) => x.sex === "F" && x.age >= 3 && !x.cond.pregnant);
    if (!mare) return;
    if (await confirmBox(t("Procedere con l'accoppiamento?"))) {
      const r = await act("/breed", { mareId: mare, sireId: b.dataset.sire }, t("Fatto! Fra un giorno e mezzo nasce il puledro."));
      if (r) { nonnaSay(t("Auguri! Diventi nonno anche tu. Di un cavallo, ma va bene lo stesso."), "proud"); breeding(view); }
    }
  }));
  void silksSvg;
  void modal;
}
