// Menu completo: tutte le sezioni del gioco, sempre a portata di mano.
import { t } from "./i18n.js";
import { go } from "./app.js";

export const MENU = [
  ["Gioca", [["/corse", "🏁", "Corse"], ["/campionato", "🏆", "Campionato"], ["/tornei", "🏟️", "Tornei"], ["/sfide", "⚔️", "Sfide e amichevoli"]]],
  ["La tua scuderia", [["/scuderia", "🐴", "I miei cavalli"], ["/mercato", "🛒", "Mercato"], ["/riproduzione", "🍼", "Riproduzione"], ["/clinica", "🏥", "Clinica e assicurazioni"], ["/laboratorio", "🧪", "Laboratorio"]]],
  ["Soldi (puliti e sporchi)", [["/bacheca", "📋", "Bacheca ingaggi"], ["/mercato-nero", "🕶️", "Mercato nero"], ["/posta", "✉️", "Posta"]]],
  ["Gente", [["/bar", "💬", "Il Bar"], ["/classifiche", "📊", "Classifiche"], ["/notifiche", "🔔", "Notifiche"]]],
  ["Info", [["/guida", "📖", "Guida"], ["/profilo", "⚙️", "Profilo e lingua"], ["/trailer", "🎬", "Trailer"]]],
];

export function menuGrid() {
  return MENU.map(([g, items]) => `<h4 style="margin:12px 0 6px">${t(g)}</h4><div class="grid tight">${items
    .map(([href, ic, lb]) => `<a class="card menu-tile" href="${href}" ${href === "/trailer" ? 'target="_blank"' : ""}><span>${ic}</span><b>${t(lb)}</b></a>`).join("")}</div>`).join("");
}

export function openMenu() {
  let d = document.getElementById("menuDrawer");
  if (d) { d.remove(); return; }
  d = document.createElement("div");
  d.id = "menuDrawer";
  d.className = "menu-drawer";
  d.innerHTML = `<div class="menu-panel"><div class="row between"><h2 style="margin:0">☰ ${t("Menu")}</h2><button class="btn small" data-x>✕</button></div>${menuGrid()}</div>`;
  document.body.appendChild(d);
  d.addEventListener("click", (e) => {
    if (e.target === d || e.target.closest("[data-x]")) { d.remove(); return; }
    const a = e.target.closest("a[href]");
    if (a) { d.remove(); if (a.target !== "_blank") { e.preventDefault(); e.stopPropagation(); go(a.getAttribute("href")); } }
  });
}
