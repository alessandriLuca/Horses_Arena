// Tutorial guidato da Nonna Pina: una lista di cose da provare, una alla volta.
import { state, api, go } from "./app.js";
import { t } from "./i18n.js";
import { nonnaSay } from "./nonna.js";
import { esc } from "./ui.js";

export const STEPS = [
  { id: "benvenuto", route: "/", title: "Benvenuto all'ippodromo!", text: "Io sono Nonna Pina, faccio la telecronaca e ti insegno il mestiere. Qui comandi una scuderia: niente controlli in gara, conta come gestisci i cavalli. Andiamo!", manual: true },
  { id: "compra", route: "/mercato", title: "Compra il tuo primo cavallo", text: "Vai al mercato e compra un cavallo. I giovani costano meno e migliorano, i vecchi sono già pronti. Le manie segrete non le conosce nessuno!" },
  { id: "scheda", route: "/scuderia", title: "Guarda la scheda", text: "Apri la scheda del tuo cavallo: statistiche, potenziale (le stelle), attitudini e cosa ha imparato. All'inizio non sa niente, poverino." },
  { id: "allenamento", route: "/scuderia", title: "Allenalo", text: "Dalla scheda fai una seduta di allenamento o imposta il piano settimanale. Occhio alla fatica: un cavallo stanco corre male e si fa male." },
  { id: "iscrizione", route: "/corse", title: "Iscrivilo a una corsa", text: "Le corse libere partono ogni mezz'ora. Scegline una della sua classe e iscrivilo. Gli avversari mancanti li mette il sistema." },
  { id: "guarda", route: "/corse", title: "Guarda una corsa", text: "Quando la corsa parte, guardala in diretta: io faccio la telecronaca! Così scopri anche i quirk dei cavalli." },
  { id: "bacheca", route: "/bacheca", title: "Fai qualche soldo", text: "Nella bacheca degli ingaggi ci sono lavoretti, sponsor e contratti. Ogni 6 ore ne arrivano di nuovi." },
  { id: "campionato", route: "/campionato", title: "Entra nel campionato", text: "Iscrivi un cavallo al campionato: una giornata al giorno, punti, promozioni e retrocessioni. Come il calcio, ma con più fieno." },
  { id: "assicurazione", route: "/clinica", title: "Assicuralo", text: "In clinica puoi assicurare i cavalli: se qualcuno te li ammazza, l'assicurazione paga. E metti un po' di sorveglianza, che di gente cattiva ce n'è." },
  { id: "scommessa", route: "/corse", title: "Fai una scommessa", text: "Nella scheda di una corsa tocca la quota di un cavallo per scommettere. Ma non giocarti la casa, eh." },
  { id: "mercato_nero", route: "/mercato-nero", title: "Il mercato nero", text: "Esiste anche un mercato nero... sicari, doping, sabotaggi. Io non ti ho detto niente. E se sabotano te, assumi un detective!" },
  { id: "amichevole", route: "/sfide", title: "Amichevoli e tornei", text: "Fai un'amichevole per far fare esperienza ai cavalli, oppure crea un torneo privato con gli amici. Brava, hai finito il corso della nonna!" },
];

let el = null;
let minimized = false;
const spoken = new Set();

function done() {
  return state.me?.tut ?? {};
}

export function currentStep() {
  const d = done();
  if (d.__skip) return null;
  return STEPS.find((s) => !d[s.id] && !(s.id === "amichevole" && d.torneo)) ?? null;
}

export function initTutorial() {
  el = document.getElementById("tut");
  try {
    minimized = localStorage.getItem("ha_tutmin") === "1";
  } catch {
    /* niente */
  }
  refreshTutorial();
}

export function refreshTutorial() {
  if (!el) return;
  const st = state.me ? currentStep() : null;
  if (!st) {
    el.innerHTML = "";
    return;
  }
  const idx = STEPS.indexOf(st);
  if (minimized) {
    el.innerHTML = `<div class="tut min">🎓 ${t("Tutorial")} ${idx + 1}/${STEPS.length}</div>`;
    el.firstElementChild.onclick = () => { minimized = false; save(); refreshTutorial(); };
    return;
  }
  el.innerHTML = `<div class="tut"><div class="row between"><span class="prog">🎓 ${idx + 1}/${STEPS.length}</span><button class="btn small ghost" data-x title="${t("Riduci")}">▾</button></div>
    <h4>${esc(t(st.title))}</h4><p>${esc(t(st.text))}</p>
    <div class="row">${st.manual ? `<button class="btn small" data-next>${t("Avanti")} →</button>` : `<button class="btn small" data-go-step>${t("Portami lì")} →</button>`}<button class="btn small ghost" data-skip>${t("Salta il tutorial")}</button></div></div>`;
  el.querySelector("[data-x]").onclick = () => { minimized = true; save(); refreshTutorial(); };
  const nx = el.querySelector("[data-next]");
  if (nx) nx.onclick = () => markServer(st.id);
  const g = el.querySelector("[data-go-step]");
  if (g) g.onclick = () => go(st.route);
  el.querySelector("[data-skip]").onclick = () => markServer("__skip");
  if (!spoken.has(st.id)) {
    spoken.add(st.id);
    setTimeout(() => nonnaSay(t(st.text), "happy", { prio: 1 }), 900);
  }
}

function save() {
  try {
    localStorage.setItem("ha_tutmin", minimized ? "1" : "0");
  } catch {
    /* niente */
  }
}

async function markServer(step) {
  if (!state.me) return;
  state.me.tut = { ...state.me.tut, [step]: true };
  refreshTutorial();
  try {
    await api("/tutorial", { step });
  } catch {
    /* riprova più tardi */
  }
}

/** Segna uno step che si completa guardando (non con un'azione sul server). */
export function tutorialMark(step) {
  if (state.me && !state.me.tut?.[step]) markServer(step);
}

/** Chiamata dal router a ogni cambio pagina. */
export function tutorialSeen(path) {
  void path;
  refreshTutorial();
}

export function restartTutorial() {
  if (!state.me) return;
  for (const s of [...STEPS.map((x) => x.id), "__skip"]) state.me.tut[s] = false;
  spoken.clear();
  minimized = false;
  save();
  api("/tutorial", { step: "__reset" }).catch(() => {});
  refreshTutorial();
}

export function tutorialChecklist() {
  if (!state.me || done().__skip) return "";
  const d = done();
  const n = STEPS.filter((s) => d[s.id]).length;
  if (n === STEPS.length) return "";
  return `<div class="card hl"><h3>🎓 ${t("Il corso di Nonna Pina")} <small>${n}/${STEPS.length}</small></h3><ul class="checklist" style="padding-left:20px;margin:0;font-weight:800">${STEPS.map((s) => `<li class="${d[s.id] ? "done" : ""}">${d[s.id] ? "✅" : "⬜"} ${s.route && !d[s.id] ? `<a href="${s.route}">${esc(t(s.title))}</a>` : esc(t(s.title))}</li>`).join("")}</ul></div>`;
}
