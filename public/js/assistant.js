// "Chiedi alla Nonna": chat scritta o parlata con l'assistente AI (Cloudflare Workers AI).
import { state, api, loadMe, toast } from "./app.js";
import { t, lang, voiceLang } from "./i18n.js";
import { nonnaSay, nonnaSvg } from "./nonna.js";
import { esc } from "./ui.js";

let enabled = false;
const history = [];

export async function initAssistant() {
  try {
    enabled = (await api("/assistant/status")).enabled;
  } catch {
    enabled = false;
  }
  const fab = document.getElementById("askFab");
  if (fab) fab.remove();
  if (!enabled || !state.me) return;
  const b = document.createElement("button");
  b.id = "askFab";
  b.className = "ask-fab";
  b.innerHTML = `${nonnaSvg("happy", false)}<span>${t("Chiedi alla Nonna")}</span>`;
  b.onclick = openPanel;
  document.body.appendChild(b);
}

function openPanel() {
  let panel = document.getElementById("askPanel");
  if (panel) {
    panel.remove();
    return;
  }
  panel = document.createElement("div");
  panel.id = "askPanel";
  panel.className = "ask-panel";
  panel.innerHTML = `<div class="row between"><b>🎙️ ${t("Nonna Pina, segretaria di scuderia")}</b><button class="btn small ghost" data-x>✕</button></div>
    <p class="muted" style="margin:4px 0 8px;font-size:12.5px">${t("Scrivile o parlale: può comprare cavalli, iscriverli alle corse, allenarli, accettare ingaggi, scommettere e darti informazioni.")}</p>
    <div class="ask-msgs" id="askMsgs"></div>
    <div class="row" style="flex-wrap:nowrap"><input type="text" id="askTx" placeholder="${t("Es: iscrivi il mio cavallo più riposato alla prossima corsa")}" style="flex:1"/>
    <button class="btn" id="askMic" title="${t("Parla")}">🎤</button><button class="btn primary" id="askSend">➤</button></div>`;
  document.body.appendChild(panel);
  const msgs = panel.querySelector("#askMsgs");
  const draw = () => {
    msgs.innerHTML = history.map((m) => `<div class="ask-m ${m.role}">${esc(m.content)}${m.actions?.length ? `<small>⚙️ ${m.actions.join(", ")}</small>` : ""}</div>`).join("") || `<div class="ask-m assistant">${t("Dimmi tutto, tesoro. Ma fai presto che ho il sugo sul fuoco.")}</div>`;
    msgs.scrollTop = msgs.scrollHeight;
  };
  draw();
  panel.querySelector("[data-x]").onclick = () => panel.remove();
  const tx = panel.querySelector("#askTx");
  const send = async (text) => {
    text = (text ?? tx.value).trim();
    if (!text) return;
    tx.value = "";
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: "…", pending: true });
    draw();
    try {
      const r = await api("/assistant", { messages: history.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content })), lang });
      history.pop();
      history.push({ role: "assistant", content: r.reply, actions: r.actions });
      draw();
      nonnaSay(r.reply, "happy", { prio: 3 });
      if (r.actions?.length) loadMe();
    } catch (e) {
      history.pop();
      history.push({ role: "assistant", content: "😵 " + e.message });
      draw();
    }
  };
  panel.querySelector("#askSend").onclick = () => send();
  tx.onkeydown = (e) => {
    if (e.key === "Enter") send();
  };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = panel.querySelector("#askMic");
  if (!SR) mic.style.display = "none";
  else
    mic.onclick = () => {
      const rec = new SR();
      rec.lang = voiceLang();
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      mic.classList.add("primary");
      mic.textContent = "🔴";
      rec.onresult = (ev) => send(ev.results[0][0].transcript);
      rec.onerror = () => toast(t("Non ho capito. Riprova."), "err");
      rec.onend = () => {
        mic.classList.remove("primary");
        mic.textContent = "🎤";
      };
      rec.start();
    };
  tx.focus();
}
