// Tornei personalizzati (pubblici o privati con codice): calendario a scelta, bot, montepremi.
import type { Game } from "./world";
import { Rng } from "../sim/rng";
import { canRace } from "../sim/horse";
import { DAY_MS, HOUR, MIN, romeParts, romeTime } from "./time";
import { VENUES } from "../../public/js/shared/track.js";

export interface TConfig {
  venue: string; // id oppure "random"
  distance: number;
  hurdles: boolean;
  schedule: { type: "every"; hours: number } | { type: "weekly"; days: number[]; hour: number; min: number };
  rounds: number;
  maxHorses: number;
  fee: number;
  bots: number;
  botLevel: number; // 0..1
  firstAt: number;
  desc?: string;
}

export function nextSlot(cfg: TConfig, after: number): number {
  if (cfg.schedule.type === "every") return after + cfg.schedule.hours * HOUR;
  const s = cfg.schedule;
  for (let k = 0; k < 15; k++) {
    const p = romeParts(after + k * DAY_MS);
    const t = romeTime(p.y, p.m, p.d, s.hour, s.min);
    if (t > after + MIN && s.days.includes(romeParts(t).wd)) return t;
  }
  return after + DAY_MS;
}

function round(g: Game, tid: string) {
  const t = g.db.one<any>("SELECT * FROM tournaments WHERE id = ?", tid);
  if (!t || t.status === "done") return;
  const cfg: TConfig = JSON.parse(t.config);
  const n = t.round + 1;
  if (n > cfg.rounds) return;
  const startAt = Math.max(g.now() + 3 * MIN, t.next_at);
  const rng = new Rng(tid + ":" + n);
  const c = g.conditions(rng, cfg.venue === "random" ? undefined : cfg.venue);
  const id = `t-${tid}-${n}`;
  g.db.run(
    `INSERT OR IGNORE INTO races (id, kind, name, start_at, status, venue, distance, going, weather, hurdles, class, purse, fee, max, ref, round, big, data, result, replay, duration)
     VALUES (?, 'tournament', ?, ?, 'open', ?, ?, ?, ?, ?, 0, 0, 0, 12, ?, ?, ?, ?, NULL, NULL, 0)`,
    id, `${t.name} — ${n}ª prova`, startAt, c.venue, cfg.distance, c.going, c.weather, cfg.hurdles ? 1 : 0, tid, n, n === cfg.rounds ? 1 : 0,
    JSON.stringify({ minField: 2, botQuality: cfg.botLevel, spectators: 0.4 + (n === cfg.rounds ? 0.4 : 0), dopingTest: 0.2, tournament: tid, desc: cfg.desc ?? "" }),
  );
  // iscrivo tutti i membri che possono correre
  const members = g.db.all<{ horse_id: string; owner: string | null }>("SELECT horse_id, owner FROM tmembers WHERE tid = ?", tid);
  for (const m of members) {
    const h = g.horse(m.horse_id);
    if (!h || h.dead) continue;
    if (m.owner && h.ownerId !== m.owner) continue;
    g.addEntry(id, h, m.owner);
  }
  g.schedule("close", id, startAt - 60_000);
  const next = n < cfg.rounds ? nextSlot(cfg, startAt) : 0;
  g.db.run("UPDATE tournaments SET round = ?, next_at = ?, status = 'running' WHERE id = ?", n, next, tid);
  if (next) g.schedule("tround", tid, next - 15 * MIN);
  for (const m of members) if (m.owner) g.note(m.owner, "tournament", `🏟️ ${t.name}: la ${n}ª prova è alle ${new Date(startAt).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}.`, `/corsa/${id}`);
}

function after(g: Game, tid: string) {
  const t = g.db.one<any>("SELECT * FROM tournaments WHERE id = ?", tid);
  if (!t) return;
  const cfg: TConfig = JSON.parse(t.config);
  if (t.round < cfg.rounds) return;
  // è finita l'ultima prova di tutte le batterie?
  const pending = g.db.one("SELECT id FROM races WHERE ref = ? AND kind = 'tournament' AND status IN ('open','closed')", tid);
  if (pending) return;
  const table = g.db.all<{ horse_id: string; owner: string | null; points: number; wins: number }>("SELECT * FROM tmembers WHERE tid = ? ORDER BY points DESC, wins DESC", tid);
  const pot = g.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM tmembers WHERE tid = ? AND owner IS NOT NULL", tid)!.n * cfg.fee;
  const split = [0.5, 0.3, 0.2];
  table.slice(0, 3).forEach((r, k) => {
    const h = g.horse(r.horse_id);
    if (h) {
      (h.trophies ??= []).push(`${["🥇", "🥈", "🥉"][k]} Torneo "${t.name}"`);
      g.saveHorse(h);
    }
    if (r.owner) {
      const prize = Math.round(pot * split[k]);
      if (prize) g.money(r.owner, prize, `Torneo ${t.name}: ${k + 1}° posto`);
      g.note(r.owner, "tournament", `🏆 Torneo "${t.name}" concluso: ${h?.name} è ${k + 1}°!${prize ? ` Premio ${prize} ƒ.` : ""}`);
    }
  });
  g.db.run("UPDATE tournaments SET status = 'done' WHERE id = ?", tid);
}

export const TOURN_MOD = { round, after };

export function validateConfig(raw: any, now: number): TConfig {
  const venue = raw.venue === "random" || VENUES.some((v) => v.id === raw.venue) ? raw.venue : "random";
  const distance = Math.max(1000, Math.min(4000, Math.round(Number(raw.distance) / 100) * 100 || 1600));
  let schedule: TConfig["schedule"];
  if (raw.schedule?.type === "weekly") {
    const days = (Array.isArray(raw.schedule.days) ? raw.schedule.days : []).map(Number).filter((d: number) => d >= 0 && d <= 6);
    schedule = { type: "weekly", days: days.length ? days : [5], hour: Math.max(0, Math.min(23, Number(raw.schedule.hour) || 21)), min: Math.max(0, Math.min(59, Number(raw.schedule.min) || 0)) };
  } else {
    schedule = { type: "every", hours: Math.max(1, Math.min(24 * 7, Number(raw.schedule?.hours) || 24)) };
  }
  const firstAt = Math.max(now + 10 * MIN, Number(raw.firstAt) || now + 30 * MIN);
  return {
    venue, distance, hurdles: !!raw.hurdles, schedule,
    rounds: Math.max(1, Math.min(20, Number(raw.rounds) || 5)),
    maxHorses: Math.max(2, Math.min(36, Number(raw.maxHorses) || 12)),
    fee: Math.max(0, Math.min(100000, Math.round(Number(raw.fee) || 0))),
    bots: Math.max(0, Math.min(11, Number(raw.bots) || 0)),
    botLevel: Math.max(0, Math.min(1, Number(raw.botLevel) || 0.5)),
    firstAt,
    desc: String(raw.desc ?? "").slice(0, 200),
  };
}

export { canRace };
