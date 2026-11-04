import { state, api, act, toast, go, loadMe, setToken, logout, connectWs, renderTop, onWsMessage, setCleanup, serverNow } from "../app.js";
import { t, lang, setLang, LANGS, FRENCH_RANT } from "../i18n.js";
import { esc, money, h, timeHM, ago, countdown, horseSvg, silksSvg, statusTags } from "../ui.js";
import { nonnaSay, nonnaSvg, nonnaSilence, pickVoice } from "../nonna.js";
import { settings, saveSettings } from "../settings.js";
import { refreshTutorial, tutorialChecklist, restartTutorial } from "../tutorial.js";
import { initAssistant } from "../assistant.js";

const PATTERNS = ["tinta", "strisce", "bande", "stella", "croce", "pois", "diagonale", "quarti"];

// =============================================================== lingua
export function langButtons(onPick) {
  return `<div class="lang-grid">${LANGS.map((l) => `<button class="btn ${l.id === lang ? "primary" : ""}" data-lang="${l.id}">${l.flag} ${l.name}</button>`).join("")}</div>`;
  void onPick;
}

export function bindLang(root, after) {
  root.querySelectorAll("[data-lang]").forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.lang;
      if (id === "fr") {
        await frenchRant();
        setLang("it");
      } else setLang(id);
      renderTop();
      after?.();
    };
  });
}

/** Chi sceglie il francese si becca la ramanzina. Non si salta. */
export function frenchRant() {
  return new Promise(async (resolve) => {
    const d = document.createElement("div");
    d.className = "rant";
    d.innerHTML = `${nonnaSvg("angry", false, false)}<div class="txt"></div><div class="cnt"></div>`;
    document.body.appendChild(d);
    const txt = d.querySelector(".txt");
    const cnt = d.querySelector(".cnt");
    const svgHost = d;
    let k = 0;
    for (const line of FRENCH_RANT) {
      k++;
      txt.textContent = line.text;
      cnt.textContent = `${k} / ${FRENCH_RANT.length} — non si può saltare 😤`;
      svgHost.querySelector("svg").outerHTML = nonnaSvg(k % 2 ? "yell" : "angry", true, false);
      await speak(line.text, line.l);
    }
    d.remove();
    toast("🇮🇹 Lingua impostata: italiano. Come deve essere.", "gold");
    resolve();
  });
}

function speak(text, l) {
  return new Promise((res) => {
    const ms = Math.max(2600, text.length * 75);
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    try {
      if (settings.voice && "speechSynthesis" in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice(l);
        if (v) u.voice = v;
        u.lang = l;
        u.rate = 1.15;
        u.pitch = 1.35;
        u.onend = () => setTimeout(fin, 300);
        u.onerror = () => setTimeout(fin, ms);
        speechSynthesis.speak(u);
        setTimeout(fin, ms + 6000);
        return;
      }
    } catch {
      /* timer */
    }
    setTimeout(fin, ms);
  });
}

// =============================================================== home
export async function home(view) {
  if (!state.me) return welcome(view);
  const me = state.me;
  const st = await api("/state");
  const nowS = serverNow();
  const live = st.live ?? [];
  const mine = me.entries ?? [];
  const sick = me.horses.filter((x) => !x.dead && (x.illness || x.cond?.injury));
  const unseen = me.notes.filter((n) => !n.seen).slice(0, 5);
  view.innerHTML = `
  <section class="hero">
    <span class="sparkle" style="right:18px;top:12px">✦</span><span class="sparkle" style="right:60px;top:40px;animation-delay:.6s">✧</span>
    <div class="row" style="gap:12px">
      ${silksSvg(me.silks, 46)}
      <div><h1 style="margin:0">${esc(me.stable)}</h1><p style="margin:2px 0 0">${t("Ciao")} ${esc(me.name)}! · ${money(me.money)} · ${t("Reputazione")} ${me.rep}</p></div>
    </div>
    <div class="row" style="margin-top:12px">
      <a class="btn gold" href="/corse">🏁 ${t("Corse di oggi")}</a>
      <a class="btn" href="/mercato">🛒 ${t("Mercato")}</a>
      <a class="btn" href="/bacheca">📋 ${t("Bacheca")}</a>
    </div>
  </section>
  ${tutorialChecklist()}
  ${live.length ? `<div class="card pink"><h3>🔴 ${t("In diretta adesso")}</h3>${live.map((r) => `<div class="race-row live" data-go="/corsa/${r.id}?watch=1"><div class="time">${timeHM(r.start_at)}</div><div><div class="nm">${esc(r.name)}</div><div class="meta"><span class="badge-live">LIVE</span></div></div><span class="btn small primary">▶ ${t("Guarda")}</span></div>`).join("")}</div>` : ""}
  <div class="grid">
    <div class="card blue">
      <h3>🐴 ${t("La tua scuderia")} <small>${me.used}/${me.stalls} ${t("box")}</small></h3>
      ${me.horses.filter((x) => !x.dead).length === 0 ? `<p class="muted">${t("Non hai ancora cavalli. Vai al mercato e comprane uno!")}</p><a class="btn primary" href="/mercato">🛒 ${t("Compra il primo cavallo")}</a>` : me.horses.filter((x) => !x.dead).slice(0, 4).map((x) => `<div class="hcard" data-go="/cavallo/${x.id}" style="margin-bottom:8px"><div class="portrait">${horseSvg(x.look, { silks: me.silks })}</div><div class="info"><div class="name">${esc(x.name)}</div><div class="muted" style="font-size:13px">${x.sex === "M" ? "♂" : "♀"} ${x.age} ${t("anni")} · ${t("val.")} ${x.overall} · ${t("fatica")} ${x.cond.fatigue}%</div><div>${statusTags(x)}</div></div></div>`).join("")}
      <a href="/scuderia">${t("Vedi tutti")} →</a>
    </div>
    <div class="card">
      <h3>📅 ${t("Le tue prossime corse")}</h3>
      ${mine.length ? mine.map((e) => `<div class="race-row" data-go="/corsa/${e.race_id}"><div class="time">${timeHM(e.start_at)}<small>${countdown(e.start_at - nowS)}</small></div><div><div class="nm">${esc(e.name)}</div><div class="meta">${esc(me.horses.find((x) => x.id === e.horse_id)?.name ?? "")}</div></div><span>›</span></div>`).join("") : `<p class="muted">${t("Nessuna iscrizione. Le corse partono ogni mezz'ora!")}</p>`}
      <div class="sep"></div>
      <h3>🗓️ ${t("Stagione")} ${st.season.n}</h3>
      <p class="muted" style="margin:0">${t("Il campionato finisce tra")} ${countdown(st.season.end - nowS)}. <a href="/campionato">${t("Classifica")} →</a></p>
    </div>
    ${sick.length ? `<div class="card"><h3>🏥 ${t("Da curare")}</h3>${sick.map((x) => `<div class="row between"><span>${esc(x.name)}</span><span>${statusTags(x)}</span></div>`).join("")}<a class="btn small" href="/clinica" style="margin-top:8px">🏥 ${t("Vai in clinica")}</a></div>` : ""}
    <div class="card">
      <h3>🔔 ${t("Novità")}</h3>
      <div class="notes">${unseen.length ? unseen.map((n) => noteHtml(n)).join("") : `<p class="muted">${t("Niente di nuovo.")}</p>`}</div>
      <a href="/notifiche">${t("Tutte le notifiche")} →</a>
    </div>
    <div class="card">
      <h3>⏱️ ${t("Prossime corse")}</h3>
      ${st.upcoming.slice(0, 5).map((r) => `<div class="race-row ${r.big ? "big" : ""}" data-go="/corsa/${r.id}"><div class="time">${timeHM(r.startAt)}</div><div><div class="nm">${esc(r.name)}</div><div class="meta">${r.distance} m · ${money(r.purse)} · ${r.entries} ${t("iscritti")}</div></div><span>›</span></div>`).join("")}
      <a href="/corse">${t("Calendario completo")} →</a>
    </div>
  </div>
  <p class="muted" style="text-align:center">👥 ${st.players} ${t("scuderie")} · 🟢 ${st.online} ${t("online")}</p>`;
  if (!sessionStorage.getItem("ha_greeted")) {
    sessionStorage.setItem("ha_greeted", "1");
    nonnaSay(t("Bentornato {name}! Hai mangiato? I cavalli sì, tu no.", { name: me.name }), "happy");
  }
}

export function noteHtml(n) {
  const link = n.link ? `data-go="${esc(n.link)}" style="cursor:pointer"` : "";
  return `<div class="note ${n.seen ? "" : "new"}" ${link}>${esc(n.text)}<small>${ago(n.ts, serverNow())}</small></div>`;
}

function welcome(view) {
  view.innerHTML = `
  <section class="hero" style="text-align:center;padding:30px 16px">
    <span class="sparkle" style="left:20px;top:16px">✦</span><span class="sparkle" style="right:24px;top:30px;animation-delay:.5s">✧</span><span class="sparkle" style="right:60px;bottom:20px;animation-delay:1s">✦</span>
    <h1 style="font-size:34px">🏇 Horses Arena</h1>
    <p style="font-size:17px;max-width:560px;margin:8px auto">${t("L'ippodromo online di tutto il mondo. Compra cavalli, allenali, falli correre in 3D. Imparano dai loro errori, nascondono manie segrete e la telecronaca la fa Nonna Pina.")}</p>
  </section>
  <div class="card"><h3>🌍 ${t("Lingua")}</h3>${langButtons()}</div>
  <div class="grid">
    <div class="card pink">
      <h3>✨ ${t("Apri la tua scuderia")}</h3>
      <label class="f">${t("Il tuo nome")}</label><input type="text" id="rName" maxlength="24" placeholder="Luca" />
      <label class="f">${t("Nome della scuderia")}</label><input type="text" id="rStable" maxlength="32" placeholder="${t("Scuderia della Luna")}" />
      <label class="f">${t("I colori della tua giubba")}</label>
      <div class="row"><input type="color" id="c1" value="#ff4d6d"/><input type="color" id="c2" value="#ffffff"/><input type="color" id="c3" value="#1b1a3a"/>
        <select id="pat" style="flex:1">${PATTERNS.map((p) => `<option value="${p}">${t(p)}</option>`).join("")}</select><span id="silkPrev"></span></div>
      <button class="btn primary block" id="reg" style="margin-top:14px">🏇 ${t("Inizia a giocare (30.000 ƒ in regalo)")}</button>
    </div>
    <div class="card">
      <h3>🔑 ${t("Hai già una scuderia?")}</h3>
      <p class="muted">${t("Inserisci il codice di recupero che ti è stato dato all'iscrizione.")}</p>
      <input type="text" id="rec" placeholder="ABCD-EFGH-IJKL" />
      <button class="btn block" id="login" style="margin-top:10px">${t("Entra")}</button>
      <div class="sep"></div>
      <h3>🎮 ${t("Come funziona")}</h3>
      <ul style="padding-left:18px;margin:0;font-weight:700;font-size:14px">
        <li>${t("Un solo mondo per tutti: corse ogni mezz'ora, campionato con promozioni e retrocessioni, coppe e Gran Premi.")}</li>
        <li>${t("Nessun controllo in gara: conta come allevi, alleni e gestisci i tuoi cavalli.")}</li>
        <li>${t("Ogni cavallo ha manie nascoste (oltre 100!) che scopri solo vedendolo correre.")}</li>
        <li>${t("I cavalli imparano: paure, fiducia, tattiche. Nel bene e nel male.")}</li>
        <li>${t("Sicari, doping, assicurazioni, malattie, sperimentazioni... e Nonna Pina che commenta tutto.")}</li>
      </ul>
    </div>
  </div>`;
  bindLang(view, () => welcome(view));
  const prev = () => {
    view.querySelector("#silkPrev").innerHTML = silksSvg(silks(), 34);
  };
  const silks = () => ({ primary: view.querySelector("#c1").value, secondary: view.querySelector("#c2").value, cap: view.querySelector("#c3").value, pattern: view.querySelector("#pat").value });
  view.querySelectorAll("#c1,#c2,#c3,#pat").forEach((x) => (x.oninput = prev));
  prev();
  view.querySelector("#reg").onclick = async () => {
    try {
      const r = await api("/register", { name: view.querySelector("#rName").value, stable: view.querySelector("#rStable").value, silks: silks() });
      setToken(r.token);
      await loadMe();
      connectWs();
      initAssistant();
      toast(t("Scuderia aperta! Il tuo codice di recupero è {code}: segnatelo!", { code: r.recovery }), "gold");
      go("/", true);
    } catch (e) {
      toast(e.message, "err");
    }
  };
  view.querySelector("#login").onclick = async () => {
    try {
      const r = await api("/login", { recovery: view.querySelector("#rec").value });
      setToken(r.token);
      await loadMe();
      connectWs();
      go("/", true);
    } catch (e) {
      toast(e.message, "err");
    }
  };
  setTimeout(() => nonnaSay(t("Benvenuto all'ippodromo! Io sono Nonna Pina. Apri la tua scuderia, che i cavalli non si comprano da soli."), "happy"), 600);
}

// =============================================================== notifiche
export async function notifications(view) {
  await loadMe();
  const me = state.me;
  view.innerHTML = `<div class="card"><div class="row between"><h2>🔔 ${t("Notifiche")}</h2><button class="btn small" id="seen">✓ ${t("Segna come lette")}</button></div><div class="notes">${me.notes.map(noteHtml).join("") || `<p class="empty">${t("Niente di nuovo.")}</p>`}</div></div>`;
  view.querySelector("#seen").onclick = async () => {
    await api("/notes/seen", {});
    await loadMe();
    notifications(view);
  };
  setTimeout(() => api("/notes/seen", {}).then(loadMe).catch(() => {}), 2500);
}

// =============================================================== profilo
export async function profile(view) {
  const me = state.me;
  view.innerHTML = `
  <div class="card"><h2>⚙️ ${t("Profilo")}</h2>
    <label class="f">${t("Il tuo nome")}</label><input type="text" id="pName" value="${esc(me.name)}" maxlength="24"/>
    <label class="f">${t("I colori della tua giubba")}</label>
    <div class="row"><input type="color" id="c1" value="${me.silks.primary}"/><input type="color" id="c2" value="${me.silks.secondary}"/><input type="color" id="c3" value="${me.silks.cap}"/>
    <select id="pat" style="flex:1">${PATTERNS.map((p) => `<option value="${p}" ${p === me.silks.pattern ? "selected" : ""}>${t(p)}</option>`).join("")}</select><span id="silkPrev">${silksSvg(me.silks, 34)}</span></div>
    <button class="btn primary" id="save" style="margin-top:12px">💾 ${t("Salva")}</button>
  </div>
  <div class="card"><h3>🌍 ${t("Lingua")}</h3>${langButtons()}</div>
  <div class="card"><h3>🔊 ${t("Audio")}</h3>
    <label class="row"><input type="checkbox" id="sVoice" ${settings.voice ? "checked" : ""}/> ${t("Voce di Nonna Pina (sintesi vocale)")}</label>
    <label class="row"><input type="checkbox" id="sSound" ${settings.sound ? "checked" : ""}/> ${t("Effetti sonori e pubblico")}</label>
    <button class="btn small" id="test">🎙️ ${t("Prova la voce")}</button>
  </div>
  <div class="card"><h3>🎓 ${t("Tutorial")}</h3><button class="btn" id="tutR">↺ ${t("Ricomincia il tutorial")}</button></div>
  <div class="card danger"><h3>🔑 ${t("Codice di recupero")}</h3><p>${t("Serve per entrare da un altro dispositivo. Non darlo a nessuno.")}</p><p style="font-size:22px;font-weight:900;letter-spacing:2px">${esc(me.recovery)}</p><button class="btn red" id="out">🚪 ${t("Esci")}</button></div>`;
  const silks = () => ({ primary: view.querySelector("#c1").value, secondary: view.querySelector("#c2").value, cap: view.querySelector("#c3").value, pattern: view.querySelector("#pat").value });
  view.querySelectorAll("#c1,#c2,#c3,#pat").forEach((x) => (x.oninput = () => (view.querySelector("#silkPrev").innerHTML = silksSvg(silks(), 34))));
  view.querySelector("#save").onclick = () => act("/me", { name: view.querySelector("#pName").value, silks: silks() }, t("Salvato!"));
  bindLang(view, () => profile(view));
  view.querySelector("#sVoice").onchange = (e) => { settings.voice = e.target.checked; saveSettings(); if (!settings.voice) nonnaSilence(); };
  view.querySelector("#sSound").onchange = (e) => { settings.sound = e.target.checked; saveSettings(); };
  view.querySelector("#test").onclick = () => nonnaSay(t("Pronto, pronto? Si sente? Ai miei tempi il microfono era un imbuto."), "happy", { prio: 3 });
  view.querySelector("#tutR").onclick = () => { restartTutorial(); go("/"); };
  view.querySelector("#out").onclick = () => logout();
}

// =============================================================== guida
export async function guide(view) {
  view.innerHTML = `<div class="card"><h2>📖 ${t("Guida dell'ippodromo")}</h2>
  ${[
    ["🧬", t("Statistiche"), t("Ogni cavallo ha 13 statistiche (velocità, accelerazione, resistenza, forza, agilità, recupero, salto, coraggio, calma, concentrazione, grinta, intelligenza, regolarità) e un potenziale genetico: l'allenamento lo avvicina al tetto, l'età lo cambia (picco tra 4 e 6 anni). Un anno di vita del cavallo dura 3 giorni reali.")],
    ["⚡", t("La fisica della corsa"), t("Ogni cavallo ha una velocità critica (che può tenere a lungo) e una riserva per gli scatti: se la brucia troppo presto si pianta. In curva chi sta largo fa più strada, in scia si risparmia, il vento colpisce chi è in testa, i contatti possono far inciampare e cadere.")],
    ["🧠", t("I cavalli imparano"), t("Usano il machine learning classico: associano gli stimoli (folla, contatti, frusta, botti...) a quello che è successo, e ne prendono paura o fiducia. Scelgono la tattica con un algoritmo di rinforzo e imparano a dosare le energie. Un cavallo intelligente impara più in fretta, nel bene e nel male.")],
    ["🔍", t("Quirk nascosti"), t("Ogni cavallo nasce con 1-4 manie segrete (ce ne sono più di 100). Non sai quali ha finché non le mostra in gara: si allunga sul palo, urla e spaventa gli altri, morde, fa retromarcia, si ferma a brucare...")],
    ["🏆", t("Campionato"), t("Stagioni di una settimana, una giornata al giorno alle 19:00, quattro divisioni con promozioni e retrocessioni. Ci si iscrive quando si vuole: chi arriva tardi ha solo meno punti.")],
    ["🕶️", t("Mercato nero"), t("Puoi pagare gente losca per sabotare i rivali prima della corsa o con un sicario in pista. Gli oggetti in pista colpiscono chiunque ci passi sopra! Se ti beccano: multe, reputazione a picco e risarcimenti. Proteggiti con sorveglianza e assicurazioni.")],
    ["🏥", t("Salute"), t("I cavalli si ammalano, soprattutto se stanchi. Il veterinario fa la diagnosi, poi scegli la cura: base, clinica, intensiva o sperimentale. Le malattie trascurate lasciano danni o peggio.")],
  ].map(([i, ti, tx]) => `<h3>${i} ${ti}</h3><p>${tx}</p>`).join("")}
  </div>`;
}

export { onWsMessage, setCleanup, h };
