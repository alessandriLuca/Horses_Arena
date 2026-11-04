// @ts-nocheck
import { DatabaseSync } from "node:sqlite";
import type { Db } from "../src/game/db";
import { Game } from "../src/game/world";

export function memDb(): Db {
  const d = new DatabaseSync(":memory:");
  const conv = (a: unknown[]) => a.map((x) => (typeof x === "boolean" ? (x ? 1 : 0) : x === undefined ? null : x)) as any[];
  return {
    all: (q, ...a) => d.prepare(q).all(...conv(a)).map((r) => ({ ...r })) as any[],
    one: (q, ...a) => { const r = d.prepare(q).get(...conv(a)); return r ? ({ ...r } as any) : null; },
    run: (q, ...a) => { d.prepare(q).run(...conv(a)); },
  };
}

export function makeGame(start = Date.UTC(2026, 10, 4, 8, 0)) {
  const clock = { t: start };
  const events: any[] = [];
  const g = new Game(memDb(), () => clock.t, (p, m) => events.push([p, m]));
  g.init();
  /** Avanza il tempo eseguendo i lavori pianificati lungo la strada. */
  const advance = (ms: number) => {
    const end = clock.t + ms;
    for (;;) {
      const next = g.nextJobAt();
      if (next === null || next > end) break;
      clock.t = Math.max(clock.t, next);
      g.runDue(50);
    }
    clock.t = end;
  };
  return { g, clock, advance, events };
}
