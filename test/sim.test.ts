import { describe, it, expect } from "vitest";
import { Rng } from "../src/sim/rng";
import { generateHorse } from "../src/sim/horse";
import { simulateRace } from "../src/sim/race";
import { QUIRKS } from "../src/sim/quirks";
import { OFFERS } from "../src/game/offers";
import { learnFromRace, newMind, rwUpdate } from "../src/sim/learning";
import type { RaceSpec } from "../src/sim/types";

const now = Date.UTC(2026, 10, 4);
const silks = { primary: "#f00", secondary: "#fff", pattern: "tinta" as const, cap: "#00f" };
function spec(seed: string, extra: Partial<RaceSpec> = {}, n = 10): RaceSpec {
  const rng = new Rng("cavalli" + seed);
  const horses = Array.from({ length: n }, (_, i) => generateHorse(rng, { id: "h" + i, ownerId: null, now }));
  return { id: "r", seed, name: "T", venue: "vesuvio", distance: 1600, going: "buono", weather: "sole", hurdles: false, big: false, spectators: 0.5,
    entries: horses.map((h) => ({ horse: h, stable: "S", ownerId: null, silks, security: 0 })), hitmen: [], dopingTest: 0, ...extra };
}

describe("simulazione", () => {
  it("ha almeno 100 quirk unici e 100 ingaggi", () => {
    expect(new Set(QUIRKS.map((q) => q.id)).size).toBe(QUIRKS.length);
    expect(QUIRKS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(OFFERS.map((o) => o.id)).size).toBe(OFFERS.length);
    expect(OFFERS.length).toBeGreaterThanOrEqual(100);
  });
  it("è deterministica", () => {
    const a = simulateRace(spec("x"), now);
    const b = simulateRace(spec("x"), now);
    expect(a.outcomes.map((o) => o.time)).toEqual(b.outcomes.map((o) => o.time));
  });
  it("tempi realistici su varie distanze", () => {
    for (const [d, lo, hi] of [[1200, 65, 85], [2000, 115, 140], [3000, 180, 225]]) {
      const r = simulateRace(spec("d" + d, { distance: d }), now);
      const t = r.winnerTime;
      expect(t).toBeGreaterThan(lo);
      expect(t).toBeLessThan(hi);
    }
  });
  it("ogni quirk gira senza errori in ogni condizione", () => {
    for (let k = 0; k < QUIRKS.length; k += 6) {
      const s = spec("q" + k, { hurdles: k % 12 === 0, weather: k % 3 ? "temporale" : "sole", venue: k % 2 ? "saline" : "dolomiti", distance: 2400, big: true }, 12);
      s.entries.forEach((e, i) => (e.horse.quirks = QUIRKS.slice(k, k + 6).map((q) => q.id).slice(i % 6, i % 6 + 2)));
      s.hitmen = [{ id: "a", service: "buccia", targetId: "h1", byPlayer: "p", at: 0.5 }, { id: "b", service: "petardo", targetId: "h2", byPlayer: "p", at: 0.7 }, { id: "c", service: "invasore", targetId: "h3", byPlayer: "p", at: 0.4 }];
      const r = simulateRace(s, now);
      expect(r.outcomes.length).toBe(12);
    }
  });
  it("Rescorla-Wagner: paura con danno, estinzione senza", () => {
    const m = newMind(0.5);
    for (let i = 0; i < 8; i++) rwUpdate(m, "botti", 0.3, 1, 1);
    expect(m.v.botti).toBeGreaterThan(0.8);
    for (let i = 0; i < 20; i++) rwUpdate(m, "botti", 0.3, 1, 0);
    expect(m.v.botti).toBeLessThan(0.1);
  });
  it("il cavallo impara dalla corsa", () => {
    const s = spec("learn");
    const r = simulateRace(s, now);
    const o = r.outcomes[0];
    const h = s.entries.find((e) => e.horse.id === o.horseId)!.horse;
    const before = JSON.stringify(h.mind.q);
    learnFromRace(h.mind, o.exp, h.stats.smarts);
    expect(JSON.stringify(h.mind.q)).not.toBe(before);
    expect(h.mind.races).toBe(1);
  });
});
