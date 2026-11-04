// Genera la corsa del trailer: cerca il seed con più caos (cadute, imprevisti, quirk visibili).
import { writeFileSync } from "node:fs";
import { Rng } from "../src/sim/rng";
import { generateHorse } from "../src/sim/horse";
import { simulateRace } from "../src/sim/race";

const now = Date.now();
const pal = ["#ff4d6d", "#3fa9ff", "#25c26e", "#ffcc33", "#9b6bff", "#ff9a3c", "#16a085", "#ffffff", "#e84393", "#1b1a3a"];
const SETS = [
  ["gas_propulsore", "urlatore"], ["retromarcia", "giravolta"], ["pisolino", "brucatore"], ["calciatore", "morsicatore"], ["disarcionatore", "piedi_burro"],
  ["innamorato", "pavone"], ["carica_toro", "spallata"], ["collo_lungo", "esultanza"], ["gatto_nero", "starnutone"], ["saltellatore", "zigzag"],
];
const NAMES = ["Peto di Velluto", "Soprano Isterico", "Nonno Turbo", "Lasagna Volante", "Mutanda Volante", "Romeo Zoccoletti", "Toro Seduto", "Collo di Giraffa", "Iettatore Supremo", "Canguro Abusivo"];
let best: any = null;
for (let k = 0; k < 60; k++) {
  const rng = new Rng("trailer" + k);
  const horses = Array.from({ length: 10 }, (_, i) => {
    const h = generateHorse(rng, { id: "h" + i, ownerId: null, now, quality: 0.55 });
    h.quirks = SETS[i];
    h.name = NAMES[i];
    return h;
  });
  const res = simulateRace({
    id: "trailer", seed: "trailer-seed-" + k, name: "Gran Premio della Follia", venue: "vesuvio", distance: 1600, going: "morbido", weather: "sole", hurdles: false, big: true, spectators: 1,
    entries: horses.map((h, i) => ({ horse: h, stable: "Scuderia " + i, ownerId: null, silks: { primary: pal[i], secondary: pal[(i + 4) % 10], pattern: (["tinta", "strisce", "bande", "stella", "croce", "pois", "diagonale", "quarti"] as const)[i % 8], cap: pal[(i + 2) % 10] }, security: 0 })),
    hitmen: [
      { id: "a", service: "inc:ufo", targetId: "h3", byPlayer: "", at: 0.35 },
      { id: "b", service: "inc:merenda", targetId: "h6", byPlayer: "", at: 0.5 },
      { id: "c", service: "buccia", targetId: "h1", byPlayer: "x", at: 0.62 },
      { id: "d", service: "inc:dinosauro", targetId: "h0", byPlayer: "", at: 0.75 },
    ],
    dopingTest: 0,
  }, now);
  const ev = res.replay.events;
  const score = ev.filter((e) => e.k === "fall").length * 4 + ev.filter((e) => e.k === "incident").length * 2 + new Set(ev.filter((e) => e.k === "quirk").map((e) => e.q)).size + ev.filter((e) => e.k === "riderless").length * 2;
  if (!best || score > best.score) best = { score, rep: res.replay, k };
}
writeFileSync("public/trailer-replay.json", JSON.stringify(best.rep));
console.log("seed", best.k, "score", best.score, best.rep.events.filter((e: any) => ["fall", "incident", "quirk", "riderless"].includes(e.k)).map((e: any) => `${e.t}:${e.k}:${e.q ?? e.x ?? ""}`).join(" "));
