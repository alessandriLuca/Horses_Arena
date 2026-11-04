import { writeFileSync } from "node:fs";
import { Rng } from "../src/sim/rng";
import { generateHorse } from "../src/sim/horse";
import { simulateRace } from "../src/sim/race";
const now = Date.now();
const rng = new Rng(process.argv[2] ?? "demo");
const pal = ["#c0392b", "#2c3e50", "#27ae60", "#f1c40f", "#8e44ad", "#e67e22", "#16a085", "#ecf0f1", "#d35400", "#2980b9", "#e84393", "#0a3d62"];
const horses = Array.from({ length: 10 }, (_, i) => generateHorse(rng, { id: "h" + i, ownerId: null, now }));
const res = simulateRace({ id: "demo", seed: process.argv[2] ?? "demo", name: "Gran Premio di Prova", venue: process.argv[3] ?? "vesuvio", distance: Number(process.argv[4] ?? 1400), going: "buono", weather: process.argv[5] ?? "sole", hurdles: process.argv[6] === "h", big: true, spectators: 0.8,
  entries: horses.map((h, i) => ({ horse: h, stable: "Scuderia " + i, ownerId: i === 2 ? "me" : null, silks: { primary: pal[i], secondary: pal[(i + 5) % 12], pattern: (["tinta","strisce","bande","stella","croce","pois","diagonale","quarti"] as const)[i % 8], cap: pal[(i + 3) % 12] }, security: 0 })),
  hitmen: [{ id: "x", service: "buccia", targetId: "h3", byPlayer: "p", at: 0.55 }, { id: "y", service: "petardo", targetId: "h5", byPlayer: "p", at: 0.75 }], dopingTest: 0 }, now);
writeFileSync(process.env.OUT ?? "public/dev-replay.json", JSON.stringify(res.replay));
console.log("ok", res.replay.duration);
