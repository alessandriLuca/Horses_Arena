import { describe, it, expect } from "vitest";
import { inviteNpc } from "../src/game/npc";
import { makeGame } from "./helpers";
import * as A from "../src/game/actions";
import { HOUR, MIN, DAY_MS } from "../src/game/time";

describe("mondo di gioco", () => {
  it("registrazione, acquisto, iscrizione, corsa, risultati", () => {
    const { g, clock, advance } = makeGame();
    const reg = A.register(g, { name: "Luca", stable: "Scuderia Test", silks: { primary: "#ff0000" } });
    let p = g.playerByToken(reg.token)!;
    expect(p.money).toBe(30000);
    const market = g.marketList() as any[];
    expect(market.length).toBeGreaterThan(5);
    const cheap = market.filter((m) => m.price < 15000 && m.age >= 2 && !m.canRace)[0];
    A.buyHorse(g, p, cheap.id);
    p = g.player(p.id)!;
    expect(p.money).toBe(30000 - cheap.price);
    // trova una corsa libera aperta a lui
    const races = g.db.all<any>("SELECT id, data, fee FROM races WHERE kind = 'open' AND status = 'open' AND start_at > ? ORDER BY start_at", clock.t + 2 * MIN);
    let entered: string | null = null;
    for (const r of races) {
      try { A.enterRace(g, p, r.id, cheap.id); entered = r.id; break; } catch { /* classe non adatta */ }
    }
    expect(entered).toBeTruthy();
    A.placeBet(g, g.player(p.id)!, entered!, cheap.id, 100);
    const race = g.race(entered!)!;
    advance(race.start_at - clock.t + 10 * MIN);
    const done = g.race(entered!)!;
    expect(done.status).toBe("done");
    expect(done.result.length).toBeGreaterThanOrEqual(8);
    const h = g.horse(cheap.id)!;
    expect(h.rec.starts).toBe(1);
    expect(h.mind.races).toBe(1);
    const notes = g.db.all("SELECT text FROM notes WHERE player = ?", p.id).map((n: any) => n.text);
    expect(notes.some((t: string) => t.includes(h.name) && t.includes("🏁"))).toBe(true);
  });

  it("campionato: giornate, punti e fine stagione con promozioni", () => {
    const { g, clock, advance } = makeGame();
    const reg = A.register(g, { name: "Ana", stable: "Scuderia Lega" });
    const p = g.playerByToken(reg.token)!;
    const m = (g.marketList() as any[]).find((x) => x.price < 25000 && !x.canRace)!;
    A.buyHorse(g, p, m.id);
    A.leagueRegister(g, g.player(p.id)!, m.id);
    const s = g.season();
    advance(s.end - clock.t + 10 * MIN);
    const s2 = g.season();
    expect(s2.n).toBe(s.n + 1);
    const rows = g.db.all<any>("SELECT * FROM league WHERE season = ?", s.n);
    expect(rows.some((r) => r.points > 0)).toBe(true);
    // il cavallo umano è re-iscritto se ha corso
    const mine = g.db.one<any>("SELECT * FROM league WHERE season = ? AND horse_id = ?", s.n, m.id);
    if (mine && mine.races > 0) expect(g.db.one("SELECT 1 FROM league WHERE season = ? AND horse_id = ?", s2.n, m.id)).toBeTruthy();
  });

  it("bacheca ingaggi, allenamento, assicurazione, clinica, laboratorio, mercato nero", () => {
    const { g, clock, advance } = makeGame();
    const a = A.register(g, { name: "Aldo", stable: "Scuderia Alfa" });
    const b = A.register(g, { name: "Bea", stable: "Scuderia Beta" });
    const pa = () => g.player(a.id)!;
    const pb = () => g.player(b.id)!;
    const list = (g.marketList() as any[]).filter((x) => !x.canRace).sort((x, y) => x.price - y.price);
    A.buyHorse(g, pa(), list[0].id);
    A.buyHorse(g, pb(), list[1].id);
    const board = A.board(g, pa());
    expect(board.offers.length).toBeGreaterThan(4);
    const job = board.offers.find((o: any) => o.kind === "job" && !o.minOverall && !o.sex);
    if (job) {
      const r = A.acceptOffer(g, pa(), job.id, list[0].id);
      expect(r.ok).toBe(true);
    }
    advance(2 * DAY_MS);
    { const x = g.horse(list[1].id)!; x.illness = null; x.cond.injury = null; x.cond.busy = null; g.saveHorse(x); }
    A.trainNow(g, pb(), list[1].id, "ripetute", "normale");
    A.insure(g, pb(), list[1].id, "completa");
    advance(DAY_MS + HOUR);
    // il killer: o uccide o fallisce, ma non deve esplodere
    g.money(a.id, 100000, "test");
    const r = A.orderCrime(g, pa(), { service: "killer", targetId: list[1].id });
    expect(r.ok).toBe(true);
    const hb = g.horse(list[1].id)!;
    if (hb.dead) {
      const notes = g.db.all<any>("SELECT text FROM notes WHERE player = ?", b.id).map((n) => n.text).join("\n");
      expect(notes).toMatch(/assicurazione/i);
    }
    // laboratorio
    const ha = g.horse(list[0].id)!;
    ha.cond.busy = null;
    g.saveHorse(ha);
    const t = A.joinTrial(g, pa(), list[0].id, "vitamine");
    expect(t.ok).toBe(true);
    // malattia forzata e cura
    const h2 = g.horse(list[0].id)!;
    h2.illness = { id: "influenza", since: clock.t, diagnosed: false, treatment: null, until: null, untreatedDays: 0 };
    h2.cond.busy = null;
    g.saveHorse(h2);
    A.diagnose(g, pa(), list[0].id);
    A.treat(g, pa(), list[0].id, "intensiva");
    advance(3 * DAY_MS);
    const h3 = g.horse(list[0].id)!;
    expect(h3.dead || !h3.illness || h3.illness.treatment === null).toBe(true);
  });

  it("amichevole rapida e torneo privato con bot", () => {
    const { g, clock, advance } = makeGame();
    const a = A.register(g, { name: "Aldo", stable: "Scuderia Gamma" });
    const m = (g.marketList() as any[]).find((x) => !x.canRace)!;
    A.buyHorse(g, g.player(a.id)!, m.id);
    const f = A.quickFriendly(g, g.player(a.id)!, { horseId: m.id, bots: 5 });
    advance(5 * MIN);
    expect(g.race(f.raceId)!.status).toBe("done");
    advance(3 * HOUR);
    g.money(a.id, 50000, "test");
    const t = A.createTournament(g, g.player(a.id)!, { name: "Coppa degli Amici", private: true, rounds: 2, bots: 5, distance: 1400, schedule: { type: "every", hours: 3 }, firstAt: clock.t + 40 * MIN, horseId: m.id });
    advance(10 * HOUR);
    const d = A.tournamentDetail(g, g.player(a.id), t.id);
    expect(d.status).toBe("done");
    expect(d.table[0].points).toBeGreaterThan(0);
  });
});

describe("scuderie NPC", () => {
  it("vivono: corrono, scrivono, accettano inviti", () => {
    const { g, clock, advance } = makeGame();
    const npcs = g.db.all<any>("SELECT * FROM players WHERE json_extract(data, '$.npc') IS NOT NULL");
    expect(npcs.length).toBeGreaterThanOrEqual(6);
    const a = A.register(g, { name: "Ivo", stable: "Scuderia Umana" });
    g.db.run("UPDATE players SET last_seen = ? WHERE id = ?", clock.t, a.id);
    advance(6 * 3600_000);
    const raced = g.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM entries e JOIN players p ON p.id = e.owner WHERE json_extract(p.data, '$.npc') IS NOT NULL")!.n;
    expect(raced).toBeGreaterThan(0);
    g.money(a.id, 50000, "t");
    const t = A.createTournament(g, g.player(a.id)!, { name: "Con gli NPC", private: true, rounds: 1, bots: 0, schedule: { type: "every", hours: 24 }, firstAt: clock.t + 60 * 60_000 });

    const r = inviteNpc(g, g.player(a.id)!, t.id, npcs[0].id);
    expect(r.ok).toBe(true);
  });
});
