import { Rng } from "../src/sim/rng";
import { generateHorse } from "../src/sim/horse";
import { simulateRace } from "../src/sim/race";
import { learnFromRace } from "../src/sim/learning";
const now = Date.now();
const rng = new Rng("x");
const horses = Array.from({ length: 12 }, (_, i) => generateHorse(rng, { id: "h" + i, ownerId: null, now }));
if (process.env.NOQ) for (const h of horses) h.quirks = [];
const silks = { primary: "#f00", secondary: "#fff", pattern: "tinta" as const, cap: "#00f" };
const dist = Number(process.argv[2] ?? 1600);
const hurdles = process.argv[3] === "h";
let tot = 0;
const counts: Record<string, number> = {};
for (let k = 0; k < Number(process.argv[4] ?? 3); k++) {
  const t0 = performance.now();
  const res = simulateRace({ id: "r", seed: "s" + k, name: "Test", venue: "vesuvio", distance: dist, going: "buono", weather: k % 2 ? "pioggia" : "sole", hurdles, big: false, spectators: 0.6, entries: horses.map((h) => ({ horse: h, stable: "S", ownerId: null, silks, security: 0 })), hitmen: k === 0 ? [{ id: "x", service: "buccia", targetId: "h3", byPlayer: "p", at: 0.6 }] : [], dopingTest: 0.2 }, now);
  tot += performance.now() - t0;
  for (const e of res.events) counts[e.k] = (counts[e.k] ?? 0) + 1;
  if (k === 0) {
    for (const o of res.outcomes.sort((a, b) => (a.pos || 99) - (b.pos || 99))) console.log(o.pos, o.name.padEnd(28), o.time, o.status, o.strategy, "top", o.topSpeed, "en", o.energyLeft, o.revealed.join(","), o.injury ?? "");
    console.log("frames", res.replay.frames.length, "json KB", Math.round(JSON.stringify(res.replay).length / 1024));
    console.log(res.events.filter(e => e.k === "quirk" || e.k==="hitman" || e.k==="hazard" || e.k==="fall").slice(0, 30).map(e => `${e.t} ${e.k} ${e.a} ${e.x ?? ""}`).join("\n"));
  }
  for (const o of res.outcomes) { const h = horses.find(x => x.id === o.horseId)!; learnFromRace(h.mind, o.exp, h.stats.smarts); }
}
console.log("ms/race", (tot / Number(process.argv[4] ?? 3)).toFixed(1), counts);
console.log(JSON.stringify(horses[0].mind.v), horses[0].mind.log);
