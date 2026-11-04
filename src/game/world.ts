// Il mondo di gioco: uno solo, condiviso da tutti. Gira dentro un Durable Object (o nei test).
// Qui ci sono giocatori, cavalli, calendario delle corse, ciclo di vita delle corse
// (iscrizioni → chiusura → simulazione → diretta → risultati), campionato, coppe, lavori pianificati.
import type { Db } from "./db";
import { migrate } from "./db";
import { Rng, clamp, hashString } from "../sim/rng";
import {
  type Horse, generateHorse, publicHorse, valuation, canRace, tickCondition, addFatigue, ageYears,
  overall, currentFatigue, RETIRE_AGE,
} from "../sim/horse";
import { learnFromRace, STIMULI } from "../sim/learning";
import { simulateRace, type RunnerOutcome } from "../sim/race";
import { quirkById } from "../sim/quirks";
import { botStableNames, jockeyName } from "../sim/names";
import type { RaceEntry, RaceSpec, Silks, HitmanOrder } from "../sim/types";
import { VENUES, GOINGS, WEATHERS } from "../../public/js/shared/track.js";
import { HOUR, MIN, DAY_MS, romeParts, romeTime, romeDayStart, nextRomeClock, dayKey } from "./time";
import { applySession, sessionCost } from "./training";
import { SECURITY, crimeById, DETECTIVES } from "./crime";
import { DISEASES, diseaseById, rollIllness, POLICIES, DEATH_WAITING_MS } from "./health";

export class GameError extends Error {}
export const fail = (msg: string): never => {
  throw new GameError(msg);
};

export interface PlayerData {
  rep: number;
  security: number;
  stalls: number;
  crimeBan: number;
  wins: number;
  races: number;
  earnings: number;
  tut: Record<string, boolean>;
  loans: { id: string; amount: number; due: number; title: string }[];
  boardWindow: number;
  watched: string[]; // id corse seguite (per notifiche)
}

export interface Player {
  id: string;
  token: string;
  recovery: string;
  name: string;
  stable: string;
  silks: Silks;
  money: number;
  created: number;
  last_seen: number;
  data: PlayerData;
}

export interface RaceRow {
  id: string;
  kind: string;
  name: string;
  start_at: number;
  status: string;
  venue: string;
  distance: number;
  going: string;
  weather: string;
  hurdles: number;
  class: number;
  purse: number;
  fee: number;
  max: number;
  ref: string | null;
  round: number;
  big: number;
  data: RaceData;
  result: any;
  duration: number;
}

export interface RaceData {
  cls?: "M" | "C" | "B" | "A" | "X";
  maxRating?: number;
  minField: number;
  botQuality: number;
  spectators: number;
  dopingTest: number;
  heatOf?: string;
  finalId?: string;
  qualify?: number;
  desc?: string;
  division?: number;
  season?: number;
  tournament?: string;
  challenge?: string;
  stake?: number;
  pending?: RunnerOutcome[];
  creator?: string;
  open?: boolean; // amichevole aperta a tutti
}

export const STARTING_MONEY = 30000;
export const BASE_STALLS = 4;
export const MAX_FIELD = 12;
export const CLOSE_BEFORE = 60_000;
export const PURSE_SPLIT = [0.5, 0.22, 0.13, 0.08, 0.04, 0.03];
export const LEAGUE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const DIVISIONS = ["Serie A", "Serie B", "Serie C", "Serie D"];
export const UPKEEP = 120;
export const CLASS_INFO: Record<string, { name: string; maxRating?: number; maiden?: boolean; purse: number; fee: number; quality: number }> = {
  M: { name: "Maiden (cavalli senza vittorie)", maiden: true, purse: 1400, fee: 0, quality: 0.3 },
  C: { name: "Classe C (rating fino a 1050)", maxRating: 1050, purse: 2000, fee: 100, quality: 0.35 },
  B: { name: "Classe B (rating fino a 1200)", maxRating: 1200, purse: 3200, fee: 200, quality: 0.52 },
  A: { name: "Classe A (aperta a tutti)", purse: 5000, fee: 400, quality: 0.68 },
  X: { name: "Aperta", purse: 2500, fee: 150, quality: 0.45 },
};

export type Emit = (player: string | null, msg: any) => void;

export class Game {
  db: Db;
  now: () => number;
  emit: Emit;
  constructor(db: Db, now: () => number = Date.now, emit: Emit = () => {}) {
    this.db = db;
    this.now = now;
    this.emit = emit;
  }

  // =================================================================== base
  init() {
    migrate(this.db);
    if (!this.kv("inited")) {
      this.setKv("inited", "1");
      this.ensureBots();
      this.refreshMarket(true);
    }
    this.ensureSeason();
    this.ensureCalendar();
    this.ensureRecurring();
  }

  kv(k: string): string | null {
    return this.db.one<{ v: string }>("SELECT v FROM kv WHERE k = ?", k)?.v ?? null;
  }
  setKv(k: string, v: string) {
    this.db.run("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, v);
  }

  rng(salt: string) {
    return new Rng(salt + ":" + this.now());
  }

  newId(prefix: string) {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return prefix + Array.from(b, (x) => "abcdefghijkmnpqrstuvwxyz23456789"[x % 32]).join("");
  }

  // =================================================================== giocatori
  rowToPlayer(r: any): Player {
    return { ...r, silks: JSON.parse(r.silks), data: { ...defaultPlayerData(), ...JSON.parse(r.data) } };
  }
  player(id: string): Player | null {
    const r = this.db.one("SELECT * FROM players WHERE id = ?", id);
    return r ? this.rowToPlayer(r) : null;
  }
  playerByToken(token: string): Player | null {
    const r = this.db.one("SELECT * FROM players WHERE token = ?", token);
    return r ? this.rowToPlayer(r) : null;
  }
  savePlayer(p: Player) {
    this.db.run(
      "UPDATE players SET name = ?, stable = ?, silks = ?, last_seen = ?, data = ? WHERE id = ?",
      p.name, p.stable, JSON.stringify(p.silks), p.last_seen, JSON.stringify(p.data), p.id,
    );
  }
  money(pid: string, amount: number, reason: string, allowNegative = false) {
    const p = this.player(pid);
    if (!p) return;
    amount = Math.round(amount);
    if (amount < 0 && !allowNegative && p.money + amount < 0) fail(`Non hai abbastanza fiorini (servono ${-amount} ƒ, ne hai ${p.money}).`);
    this.db.run("UPDATE players SET money = money + ? WHERE id = ?", amount, pid);
    this.db.run("INSERT INTO ledger (player, ts, amount, reason) VALUES (?, ?, ?, ?)", pid, this.now(), amount, reason);
    this.emit(pid, { t: "money", money: p.money + amount, delta: amount, reason });
  }
  note(pid: string | null, kind: string, text: string, link: string | null = null) {
    if (!pid) return;
    this.db.run("INSERT INTO notes (player, ts, kind, text, link) VALUES (?, ?, ?, ?, ?)", pid, this.now(), kind, text, link);
    this.emit(pid, { t: "note", kind, text, link });
  }
  tut(p: Player, step: string) {
    if (!p.data.tut[step]) {
      p.data.tut[step] = true;
      this.savePlayer(p);
      this.emit(p.id, { t: "tutorial", step });
    }
  }
  tutId(pid: string, step: string) {
    const p = this.player(pid);
    if (p) this.tut(p, step);
  }

  // =================================================================== cavalli
  horse(id: string): Horse | null {
    const r = this.db.one<{ data: string }>("SELECT data FROM horses WHERE id = ?", id);
    return r ? (JSON.parse(r.data) as Horse) : null;
  }
  saveHorse(h: Horse, extra?: { price?: number | null; stud?: number | null; market?: number }) {
    const ex = this.db.one<{ price: number | null; stud_fee: number | null; market: number }>("SELECT price, stud_fee, market FROM horses WHERE id = ?", h.id);
    const price = extra && "price" in extra ? extra.price : ex?.price ?? null;
    const stud = extra && "stud" in extra ? extra.stud : ex?.stud_fee ?? null;
    const market = extra?.market ?? ex?.market ?? 0;
    this.db.run(
      `INSERT INTO horses (id, owner, data, price, stud_fee, bot, market, rating, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, data = excluded.data, price = excluded.price, stud_fee = excluded.stud_fee,
       bot = excluded.bot, market = excluded.market, rating = excluded.rating, updated = excluded.updated`,
      h.id, h.ownerId, JSON.stringify(h), price ?? null, stud ?? null, h.bot ? 1 : 0, market, h.rating, this.now(),
    );
  }
  horsesOf(pid: string, includeDead = false): Horse[] {
    return this.db
      .all<{ data: string }>("SELECT data FROM horses WHERE owner = ? ORDER BY rating DESC", pid)
      .map((r) => JSON.parse(r.data) as Horse)
      .filter((h) => includeDead || !h.dead);
  }
  ownedHorse(pid: string, hid: string): Horse {
    const h = this.horse(hid);
    if (!h || h.ownerId !== pid) fail("Questo cavallo non è tuo.");
    if (h!.dead) fail(`${h!.name} è morto.`);
    return h!;
  }
  stallsUsed(pid: string) {
    return this.horsesOf(pid).length;
  }
  horseView(h: Horse, viewer: string | null) {
    const owner = !!viewer && h.ownerId === viewer;
    const v: any = publicHorse(h, this.now(), owner);
    const row = this.db.one<{ price: number | null; stud_fee: number | null; market: number }>("SELECT price, stud_fee, market FROM horses WHERE id = ?", h.id);
    v.price = row?.price ?? null;
    v.studFee = row?.stud_fee ?? null;
    v.market = !!row?.market;
    if (h.ownerId) {
      const p = this.db.one<{ stable: string; name: string; silks: string }>("SELECT stable, name, silks FROM players WHERE id = ?", h.ownerId);
      v.stable = p?.stable ?? "?";
      v.ownerName = p?.name ?? "?";
      v.silks = p ? JSON.parse(p.silks) : null;
    } else {
      v.stable = h.botStable ?? "Allevamento Nazionale";
      v.silks = botSilks(v.stable);
    }
    return v;
  }

  // =================================================================== bot
  ensureBots(target = 110) {
    const n = this.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM horses WHERE bot = 1 AND owner IS NULL")?.n ?? 0;
    const rng = this.rng("bots");
    const stables = botStableNames();
    for (let i = n; i < target; i++) {
      const q = clamp(rng.normal(0.47, 0.18), 0.1, 0.92);
      const h = generateHorse(rng, { id: this.newId("h"), ownerId: null, now: this.now(), quality: q, bot: true, age: rng.range(2.2, 7) });
      h.botStable = rng.pick(stables);
      h.jockey = jockeyName(rng);
      this.saveHorse(h, { market: 0 });
    }
  }

  botHorses(): Horse[] {
    return this.db.all<{ data: string }>("SELECT data FROM horses WHERE bot = 1 AND owner IS NULL").map((r) => JSON.parse(r.data));
  }

  pickBots(count: number, targetRating: number, exclude: Set<string>, startAt: number, filter?: (h: Horse) => boolean): Horse[] {
    if (count <= 0) return [];
    const rng = this.rng("pick" + startAt);
    const busy = new Set(
      this.db.all<{ horse_id: string }>(
        "SELECT e.horse_id FROM entries e JOIN races r ON r.id = e.race_id WHERE r.start_at BETWEEN ? AND ? AND r.status IN ('open','closed')",
        startAt - 12 * MIN, startAt + 12 * MIN,
      ).map((r) => r.horse_id),
    );
    const now = this.now();
    let pool = this.botHorses().filter((h) => !exclude.has(h.id) && !busy.has(h.id) && !canRace(h, now) && (!filter || filter(h)));
    if (pool.length < count) {
      this.ensureBots(this.botHorses().length + count + 10);
      pool = this.botHorses().filter((h) => !exclude.has(h.id) && !busy.has(h.id) && !canRace(h, now) && (!filter || filter(h)));
    }
    pool.sort((a, b) => Math.abs(a.rating - targetRating) + rng.range(0, 90) - (Math.abs(b.rating - targetRating) + rng.range(0, 90)));
    return pool.slice(0, count);
  }

  // =================================================================== lavori pianificati
  schedule(kind: string, ref: string, at: number) {
    this.db.run("INSERT INTO jobs (run_at, kind, ref) VALUES (?, ?, ?)", Math.round(at), kind, ref);
  }
  hasJob(kind: string, ref?: string) {
    return ref === undefined
      ? !!this.db.one("SELECT id FROM jobs WHERE kind = ? LIMIT 1", kind)
      : !!this.db.one("SELECT id FROM jobs WHERE kind = ? AND ref = ? LIMIT 1", kind, ref);
  }
  nextJobAt(): number | null {
    return this.db.one<{ t: number }>("SELECT MIN(run_at) AS t FROM jobs")?.t ?? null;
  }

  /** Esegue i lavori scaduti. Ritorna quanti ne ha eseguiti. */
  runDue(maxJobs = 30): number {
    let done = 0;
    while (done < maxJobs) {
      const j = this.db.one<{ id: number; kind: string; ref: string; run_at: number }>("SELECT * FROM jobs WHERE run_at <= ? ORDER BY run_at, id LIMIT 1", this.now());
      if (!j) break;
      this.db.run("DELETE FROM jobs WHERE id = ?", j.id);
      try {
        this.dispatch(j.kind, j.ref);
      } catch (e) {
        console.error("job fallito", j.kind, j.ref, e);
      }
      done++;
    }
    return done;
  }

  dispatch(kind: string, ref: string) {
    switch (kind) {
      case "close": return this.closeRace(ref);
      case "finish": return this.finishRace(ref);
      case "daily": this.daily(); this.schedule("daily", "", nextRomeClock(this.now() + MIN, 7, 0)); return;
      case "calendar": this.ensureCalendar(); this.schedule("calendar", "", nextRomeClock(this.now() + MIN, 0, 10)); return;
      case "market": this.refreshMarket(); this.schedule("market", "", this.now() + 6 * HOUR); return;
      case "season_end": return this.endSeason();
      case "birth": return this.birth(ref);
      case "loan": return this.loanDue(ref);
      case "tround": return this.tournamentRound(ref);
      case "heal": return this.healCheck(ref);
      case "investigation": return this.investigationDone(ref);
      case "police": return this.policeDone(ref);
    }
  }

  ensureRecurring() {
    if (!this.hasJob("daily")) this.schedule("daily", "", nextRomeClock(this.now(), 7, 0));
    if (!this.hasJob("calendar")) this.schedule("calendar", "", nextRomeClock(this.now(), 0, 10));
    if (!this.hasJob("market")) this.schedule("market", "", this.now() + 6 * HOUR);
    if (!this.hasJob("season_end")) {
      const s = this.season();
      this.schedule("season_end", String(s.n), s.end + 2 * MIN);
    }
  }

  // =================================================================== calendario
  ensureCalendar() {
    const now = this.now();
    for (const off of [0, 1]) {
      const day = romeDayStart(now) + off * DAY_MS + 2 * HOUR; // +2h per stare dentro al giorno anche col cambio d'ora
      this.generateDay(day);
    }
  }

  private makeRace(r: Omit<RaceRow, "status" | "result" | "duration" | "round" | "ref" | "max" | "class"> & Partial<RaceRow>): boolean {
    if (this.db.one("SELECT id FROM races WHERE id = ?", r.id)) return false;
    if (r.start_at - CLOSE_BEFORE < this.now()) return false;
    this.db.run(
      `INSERT INTO races (id, kind, name, start_at, status, venue, distance, going, weather, hurdles, class, purse, fee, max, ref, round, big, data, result, replay, duration)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
      r.id, r.kind, r.name, r.start_at, r.venue, r.distance, r.going, r.weather, r.hurdles, r.class ?? 0, r.purse, r.fee,
      r.max ?? MAX_FIELD, r.ref ?? null, r.round ?? 0, r.big, JSON.stringify(r.data),
    );
    this.schedule("close", r.id, r.start_at - CLOSE_BEFORE);
    return true;
  }

  conditions(rng: Rng, venueId?: string) {
    const venue = venueId ? VENUES.find((v) => v.id === venueId)! : rng.pick(VENUES);
    let weather = rng.weighted(WEATHERS, (w) => ({ sole: 5, nuvoloso: 3, vento: 1.2, pioggia: 1.8, temporale: 0.6, nebbia: 0.8, neve: venue.id === "dolomiti" ? 3 : 0 })[w.id as "sole"] ?? 1);
    if (venue.id === "dolomiti" && weather.id === "temporale") weather = WEATHERS.find((w) => w.id === "neve")!;
    const wet = weather.rain;
    const going = wet > 0.5 ? rng.pick(["morbido", "pesante"]) : wet > 0.2 ? rng.pick(["buono", "morbido"]) : rng.pick(["secco", "buono", "buono"]);
    return { venue: venue.id, weather: weather.id, going };
  }

  generateDay(dayTs: number) {
    const p = romeParts(dayTs);
    const key = dayKey(dayTs);
    const at = (h: number, m: number) => romeTime(p.y, p.m, p.d, h, m);
    const rng = new Rng("day:" + key);
    // corse libere ogni 30 minuti, 8:00 - 23:30
    const classes: ("M" | "C" | "B" | "A" | "X")[] = ["M", "C", "B", "X", "C", "B", "A", "M", "X"];
    let slot = 0;
    for (let h = 8; h <= 23; h++) {
      for (const m of [0, 30]) {
        if ((h === 13 && m === 0) || (h === 19 && m === 0) || (h === 21 && m === 30)) { slot++; continue; }
        const cls = classes[slot % classes.length];
        const ci = CLASS_INFO[cls];
        const c = this.conditions(rng);
        const hurdles = rng.chance(0.15);
        const distance = hurdles ? rng.pick([2000, 2400, 2800, 3200]) : rng.pick([1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2800]);
        const v = VENUES.find((x) => x.id === c.venue)!;
        this.makeRace({
          id: `o-${key}-${String(h).padStart(2, "0")}${m === 0 ? "00" : "30"}`,
          kind: "open",
          name: `${hurdles ? "Siepi" : "Premio"} ${raceTitle(rng)} — ${ci.name.split(" (")[0]}`,
          start_at: at(h, m),
          ...c, distance, hurdles: hurdles ? 1 : 0, purse: ci.purse, fee: ci.fee, big: 0,
          data: { cls, maxRating: ci.maxRating, minField: 8, botQuality: ci.quality, spectators: 0.3 + 0.2 * v.crowd, dopingTest: 0.1, desc: `Corsa libera a ${v.name}.` },
        });
        slot++;
      }
    }
    // Coppa del Giorno: batterie alle 13:00, finale alle 13:20
    {
      const c = this.conditions(rng);
      const dist = rng.pick([1400, 1600, 1800, 2000]);
      const finalId = `cupf-${key}`;
      this.makeRace({
        id: `cup-${key}`, kind: "cup", name: "Coppa del Giorno — Batterie", start_at: at(13, 0), ...c, distance: dist, hurdles: 0,
        purse: 2500, fee: 300, big: 0,
        data: { minField: 8, botQuality: 0.5, spectators: 0.55, dopingTest: 0.25, finalId, qualify: 3, desc: "Batterie di qualificazione: i primi 3 di ogni batteria vanno in finale (con una sola batteria, i primi 6)." },
      });
      this.makeRace({
        id: finalId, kind: "cup_final", name: "Coppa del Giorno — FINALE", start_at: at(13, 20), ...c, distance: dist, hurdles: 0,
        purse: 16000, fee: 0, big: 1,
        data: { minField: 10, botQuality: 0.6, spectators: 0.85, dopingTest: 0.5, desc: "La finale della Coppa del Giorno: si accede solo dalle batterie." },
      });
    }
    // Campionato alle 19:00: una corsa per divisione
    {
      const s = this.season();
      const round = Math.floor((at(19, 0) - s.start) / DAY_MS) + 1;
      if (round >= 1 && round <= 7) {
        const c = this.conditions(rng);
        const dist = rng.pick([1200, 1600, 2000, 2400, 1800, 2200, 1400]);
        DIVISIONS.forEach((dn, k) => {
          this.makeRace({
            id: `lg-${key}-${k + 1}`, kind: "league", name: `${dn} — ${round}ª giornata`, start_at: at(19, 0) + k * 4 * MIN, ...c, distance: dist, hurdles: 0,
            purse: [9000, 6000, 3800, 2400][k], fee: 0, big: k === 0 ? 1 : 0, ref: `${s.n}:${k + 1}`, round,
            data: { minField: 8, botQuality: [0.72, 0.58, 0.45, 0.3][k], spectators: [0.9, 0.7, 0.55, 0.4][k], dopingTest: 0.3, division: k + 1, season: s.n, desc: `Giornata ${round} di 7 della stagione ${s.n}. Punti: ${LEAGUE_POINTS.join("-")}.` },
          });
        });
      }
    }
    // Gran Premio della Sera alle 21:30 (a ostacoli il mercoledì e il sabato)
    {
      const wd = p.wd;
      const hurdles = wd === 2 || wd === 5;
      const c = this.conditions(rng);
      this.makeRace({
        id: `gp-${key}`, kind: "gp", name: hurdles ? `Gran Premio a Ostacoli ${gpName(rng)}` : `Gran Premio ${gpName(rng)}`, start_at: at(21, 30), ...c,
        distance: hurdles ? rng.pick([2800, 3200, 3600]) : rng.pick([1600, 2000, 2400, 2800]), hurdles: hurdles ? 1 : 0,
        purse: hurdles ? 36000 : 42000, fee: 1500, big: 1,
        data: { minField: 10, botQuality: 0.78, spectators: 1, dopingTest: 0.6, desc: "La corsa più importante della giornata. Pubblico delle grandi occasioni." },
      });
    }
  }

  // =================================================================== stagione / campionato
  season(): { n: number; start: number; end: number } {
    const raw = this.kv("season");
    if (raw) return JSON.parse(raw);
    return this.ensureSeason();
  }
  ensureSeason() {
    const raw = this.kv("season");
    if (raw) return JSON.parse(raw);
    const now = this.now();
    const p = romeParts(now);
    const monday = romeDayStart(now - p.wd * DAY_MS + 2 * HOUR);
    const q = romeParts(monday + 7 * DAY_MS + 2 * HOUR);
    const s = { n: 1, start: monday, end: romeTime(q.y, q.m, q.d, 0, 0) };
    this.setKv("season", JSON.stringify(s));
    this.seedLeagueBots(s.n);
    return s;
  }

  seedLeagueBots(season: number) {
    for (let div = 1; div <= 4; div++) {
      const have = this.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM league l JOIN horses h ON h.id = l.horse_id WHERE l.season = ? AND l.division = ? AND h.bot = 1", season, div)?.n ?? 0;
      const want = 8 - have;
      if (want <= 0) continue;
      const target = [1250, 1120, 1000, 880][div - 1];
      const taken = new Set(this.db.all<{ horse_id: string }>("SELECT horse_id FROM league WHERE season = ?", season).map((r) => r.horse_id));
      const bots = this.botHorses().filter((h) => !taken.has(h.id) && !h.retired).sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target)).slice(0, want);
      for (const b of bots) this.db.run("INSERT OR IGNORE INTO league (season, horse_id, owner, division, joined) VALUES (?, ?, NULL, ?, ?)", season, b.id, div, this.now());
    }
  }

  leagueDivisionFor(h: Horse): number {
    return clamp(h.div ?? 4, 1, 4);
  }

  endSeason() {
    const s = this.season();
    const prizes = [[22000, 13000, 8000], [12000, 7000, 4500], [7000, 4000, 2500], [4000, 2500, 1500]];
    const nextDiv = new Map<string, number>();
    for (let div = 1; div <= 4; div++) {
      const rows = this.db.all<{ horse_id: string; owner: string | null; points: number; wins: number; races: number }>(
        "SELECT * FROM league WHERE season = ? AND division = ? ORDER BY points DESC, wins DESC, races ASC", s.n, div,
      );
      const active = rows.filter((r) => r.races > 0);
      active.forEach((r, k) => {
        const h = this.horse(r.horse_id);
        if (!h) return;
        let nd = div;
        if (k < 3 && div > 1) nd = div - 1;
        if (k >= active.length - 3 && active.length >= 6 && div < 4) nd = div + 1;
        nextDiv.set(h.id, nd);
        h.div = nd;
        if (k < 3) {
          (h.trophies ??= []).push(`${["🥇", "🥈", "🥉"][k]} ${DIVISIONS[div - 1]} — stagione ${s.n}`);
          if (r.owner) {
            this.money(r.owner, prizes[div - 1][k], `Premio ${DIVISIONS[div - 1]} stagione ${s.n}`);
            this.note(r.owner, "league", `🏆 ${h.name} chiude la stagione ${s.n} di ${DIVISIONS[div - 1]} al ${k + 1}° posto! Premio: ${prizes[div - 1][k]} ƒ.${nd < div ? ` Promosso in ${DIVISIONS[nd - 1]}!` : ""}`);
          }
        } else if (r.owner && nd > div) {
          this.note(r.owner, "league", `${h.name} retrocede in ${DIVISIONS[nd - 1]}.`);
        }
        this.saveHorse(h);
      });
    }
    // nuova stagione
    const q = romeParts(s.end + 7 * DAY_MS + 2 * HOUR);
    const ns = { n: s.n + 1, start: s.end, end: romeTime(q.y, q.m, q.d, 0, 0) };
    this.setKv("season", JSON.stringify(ns));
    // re-iscrizione automatica dei cavalli dei giocatori che hanno corso
    const prev = this.db.all<{ horse_id: string; owner: string | null; races: number }>("SELECT horse_id, owner, races FROM league WHERE season = ?", s.n);
    for (const r of prev) {
      if (!r.owner || r.races === 0) continue;
      const h = this.horse(r.horse_id);
      if (!h || h.dead || h.retired || h.ownerId !== r.owner) continue;
      this.db.run("INSERT OR IGNORE INTO league (season, horse_id, owner, division, joined) VALUES (?, ?, ?, ?, ?)", ns.n, h.id, r.owner, this.leagueDivisionFor(h), this.now());
    }
    this.seedLeagueBots(ns.n);
    this.schedule("season_end", String(ns.n), ns.end + 2 * MIN);
    this.emit(null, { t: "chat_sys", text: `🏁 È finita la stagione ${s.n}! Comincia la stagione ${ns.n}: promozioni e retrocessioni applicate.` });
  }

  standings(season: number, div: number) {
    return this.db.all<any>(
      `SELECT l.*, h.data AS hdata FROM league l JOIN horses h ON h.id = l.horse_id WHERE l.season = ? AND l.division = ?
       ORDER BY l.points DESC, l.wins DESC, l.races ASC`, season, div,
    ).map((r, k) => {
      const h = JSON.parse(r.hdata) as Horse;
      return { pos: k + 1, horseId: h.id, name: h.name, owner: r.owner, stable: this.stableName(h), points: r.points, races: r.races, wins: r.wins, rating: Math.round(h.rating), look: h.look };
    });
  }

  stableName(h: Horse): string {
    if (h.ownerId) return this.db.one<{ stable: string }>("SELECT stable FROM players WHERE id = ?", h.ownerId)?.stable ?? "?";
    return h.botStable ?? "Allevamento Nazionale";
  }

  // =================================================================== corse
  race(id: string): RaceRow | null {
    const r = this.db.one<any>("SELECT id, kind, name, start_at, status, venue, distance, going, weather, hurdles, class, purse, fee, max, ref, round, big, data, result, duration FROM races WHERE id = ?", id);
    if (!r) return null;
    return { ...r, data: JSON.parse(r.data), result: r.result ? JSON.parse(r.result) : null };
  }
  saveRaceData(r: RaceRow) {
    this.db.run("UPDATE races SET data = ?, status = ?, name = ? WHERE id = ?", JSON.stringify(r.data), r.status, r.name, r.id);
  }

  raceEntries(raceId: string): { horse: Horse; owner: string | null; orders: any }[] {
    return this.db
      .all<{ data: string; owner: string | null; orders: string | null }>("SELECT h.data, e.owner, e.orders FROM entries e JOIN horses h ON h.id = e.horse_id WHERE e.race_id = ? ORDER BY e.created", raceId)
      .map((r) => ({ horse: JSON.parse(r.data) as Horse, owner: r.owner, orders: r.orders ? JSON.parse(r.orders) : null }));
  }

  /** Controlli d'iscrizione comuni. */
  checkEligible(r: RaceRow, h: Horse) {
    const now = this.now();
    if (r.status !== "open" || now > r.start_at - CLOSE_BEFORE) fail("Le iscrizioni per questa corsa sono chiuse.");
    const why = canRace(h, now);
    if (why) fail(`${h.name} non può correre: ${why}.`);
    if (r.data.cls) {
      const ci = CLASS_INFO[r.data.cls];
      if (ci.maiden && h.rec.wins > 0) fail(`${h.name} ha già vinto: non può correre una Maiden.`);
      if (ci.maxRating && h.rating > ci.maxRating) fail(`${h.name} ha rating ${Math.round(h.rating)}: troppo alto per questa classe (max ${ci.maxRating}).`);
    }
    if (this.db.one("SELECT 1 FROM entries WHERE race_id = ? AND horse_id = ?", r.id, h.id)) fail(`${h.name} è già iscritto.`);
    const clash = this.db.one<{ name: string }>(
      "SELECT r.name FROM entries e JOIN races r ON r.id = e.race_id WHERE e.horse_id = ? AND r.status IN ('open','closed') AND ABS(r.start_at - ?) < ?",
      h.id, r.start_at, 15 * MIN,
    );
    if (clash) fail(`${h.name} è già iscritto a "${clash.name}" quasi alla stessa ora.`);
    const n = this.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM entries WHERE race_id = ?", r.id)?.n ?? 0;
    if (r.kind !== "cup" && r.kind !== "league" && n >= r.max) fail("La corsa è al completo.");
  }

  addEntry(raceId: string, h: Horse, owner: string | null) {
    this.db.run("INSERT OR IGNORE INTO entries (race_id, horse_id, owner, created) VALUES (?, ?, ?, ?)", raceId, h.id, owner, this.now());
  }

  closeRace(id: string) {
    const r = this.race(id);
    if (!r || r.status !== "open") return;
    const now = this.now();
    // il campionato iscrive in automatico i cavalli della divisione
    if (r.kind === "league" && r.data.division && r.data.season) {
      const members = this.db.all<{ horse_id: string; owner: string | null }>("SELECT horse_id, owner FROM league WHERE season = ? AND division = ?", r.data.season, r.data.division);
      for (const m of members) {
        const h = this.horse(m.horse_id);
        if (!h || canRace(h, now)) continue;
        if (h.ownerId !== m.owner) continue;
        const busy = this.db.one("SELECT 1 FROM entries e JOIN races x ON x.id = e.race_id WHERE e.horse_id = ? AND x.status IN ('open','closed') AND x.id != ? AND ABS(x.start_at - ?) < ?", h.id, r.id, r.start_at, 10 * MIN);
        if (!busy) this.addEntry(r.id, h, m.owner);
      }
    }
    let entries = this.raceEntries(r.id);
    // chi nel frattempo non può più correre viene ritirato (con rimborso)
    for (const e of entries) {
      const why = canRace(e.horse, now);
      if (why) {
        this.db.run("DELETE FROM entries WHERE race_id = ? AND horse_id = ?", r.id, e.horse.id);
        if (e.owner) {
          if (r.fee) this.money(e.owner, r.fee, `Rimborso iscrizione ${r.name}`);
          this.note(e.owner, "race", `${e.horse.name} è stato ritirato da "${r.name}": ${why}.`);
        }
      }
    }
    entries = this.raceEntries(r.id);
    const humans = entries.filter((e) => e.owner);
    if ((r.kind === "open" || r.kind === "friendly") && humans.length === 0 && !r.data.challenge) {
      r.status = "void";
      this.saveRaceData(r);
      return;
    }
    // batterie: se troppi, divido in più corse alla stessa ora
    const groups: { horse: Horse; owner: string | null }[][] = [];
    if (entries.length > r.max) {
      const sorted = entries.slice().sort((a, b) => b.horse.rating - a.horse.rating);
      const ng = Math.ceil(sorted.length / r.max);
      for (let g = 0; g < ng; g++) groups.push([]);
      sorted.forEach((e, k) => groups[k % ng].push(e)); // serpentina per equilibrio
    } else groups.push(entries);

    const raceIds: string[] = [r.id];
    for (let g = 1; g < groups.length; g++) {
      const nid = `${r.id}-g${g + 1}`;
      this.db.run(
        `INSERT OR IGNORE INTO races (id, kind, name, start_at, status, venue, distance, going, weather, hurdles, class, purse, fee, max, ref, round, big, data, result, replay, duration)
         SELECT ?, kind, ?, start_at + ?, 'open', venue, distance, going, weather, hurdles, class, purse, fee, max, ref, round, big, ?, NULL, NULL, 0 FROM races WHERE id = ?`,
        nid, `${r.name} (gruppo ${g + 1})`, g * 2 * MIN, JSON.stringify({ ...r.data, heatOf: r.id }), r.id,
      );
      for (const e of groups[g]) this.db.run("UPDATE entries SET race_id = ? WHERE race_id = ? AND horse_id = ?", nid, r.id, e.horse.id);
      this.db.run("UPDATE crimes SET race_id = ? WHERE race_id = ? AND target_horse IN (" + groups[g].map(() => "?").join(",") + ")", nid, r.id, ...groups[g].map((e) => e.horse.id));
      raceIds.push(nid);
    }
    if (groups.length > 1) {
      r.name = `${r.name} (gruppo 1)`;
      this.saveRaceData(r);
    }
    for (const rid of raceIds) this.simulateAndSchedule(rid);
  }

  simulateAndSchedule(id: string) {
    const r = this.race(id);
    if (!r || r.status !== "open") return;
    const now = this.now();
    let entries = this.raceEntries(r.id);
    // riempi coi cavalli del sistema
    const minField = Math.min(r.max, r.data.minField);
    if (entries.length < minField) {
      const avg = entries.length ? entries.reduce((a, e) => a + e.horse.rating, 0) / entries.length : 1000 + (r.data.botQuality - 0.45) * 600;
      const target = entries.length ? avg * 0.6 + (1000 + (r.data.botQuality - 0.45) * 600) * 0.4 : avg;
      const ci = r.data.cls ? CLASS_INFO[r.data.cls] : null;
      const bots = this.pickBots(minField - entries.length, target, new Set(entries.map((e) => e.horse.id)), r.start_at, (h) =>
        !ci || ((!ci.maiden || h.rec.wins === 0) && (!ci.maxRating || h.rating <= ci.maxRating)),
      );
      for (const b of bots) this.addEntry(r.id, b, null);
      entries = this.raceEntries(r.id);
    }
    const hitRows = this.db.all<{ id: string; service: string; target_horse: string; by_player: string; data: string }>(
      "SELECT * FROM crimes WHERE race_id = ? AND status = 'pending'", r.id,
    );
    const hitmen: HitmanOrder[] = hitRows
      .filter((c) => crimeById(c.service)?.when === "gara")
      .map((c) => ({ id: c.id, service: c.service, targetId: c.target_horse, byPlayer: c.by_player, at: JSON.parse(c.data || "{}").at ?? 0.6 }));
    const raceEntries: RaceEntry[] = entries.map((e) => {
      const p = e.owner ? this.player(e.owner) : null;
      if (!e.horse.jockey) e.horse.jockey = jockeyName(new Rng(e.horse.id));
      return {
        horse: e.horse,
        stable: p ? p.stable : e.horse.botStable ?? "Allevamento Nazionale",
        ownerId: e.owner,
        silks: p ? p.silks : botSilks(e.horse.botStable ?? "Allevamento Nazionale"),
        security: p ? p.data.security : 1,
        orders: e.orders ?? undefined,
      };
    });
    const spec: RaceSpec = {
      id: r.id, seed: r.id + ":" + r.start_at, name: r.name, venue: r.venue, distance: r.distance, going: r.going, weather: r.weather,
      hurdles: !!r.hurdles, big: !!r.big, spectators: r.data.spectators, entries: raceEntries, hitmen, dopingTest: r.data.dopingTest,
    };
    const res = simulateRace(spec, now);
    r.data.pending = res.outcomes;
    this.db.run(
      "UPDATE races SET status = 'closed', replay = ?, duration = ?, data = ? WHERE id = ?",
      JSON.stringify(res.replay), res.replay.duration, JSON.stringify(r.data), r.id,
    );
    for (const c of hitRows) this.db.run("UPDATE crimes SET status = 'executed' WHERE id = ?", c.id);
    // i cavalli sono "in gara" fino alla fine
    const end = r.start_at + res.replay.duration * 1000 + 3000;
    for (const e of entries) {
      e.horse.cond.busy = { until: end, reason: "in gara" };
      this.saveHorse(e.horse);
    }
    this.schedule("finish", r.id, end);
    for (const e of entries) if (e.owner) this.emit(e.owner, { t: "race_soon", raceId: r.id, name: r.name, startAt: r.start_at });
    this.emit(null, { t: "race_closed", raceId: r.id, name: r.name, startAt: r.start_at, kind: r.kind });
  }

  finishRace(id: string) {
    const r = this.race(id);
    if (!r || r.status !== "closed") return;
    const outcomes = r.data.pending ?? [];
    const now = this.now();
    const field = outcomes.length;
    const ordered = outcomes.slice().sort((a, b) => (a.pos || 99) - (b.pos || 99));
    const horses = new Map<string, Horse>();
    for (const o of outcomes) {
      const h = this.horse(o.horseId);
      if (h) horses.set(h.id, h);
    }
    // ---- rating Elo multi-giocatore
    const ratings = new Map(outcomes.map((o) => [o.horseId, horses.get(o.horseId)?.rating ?? 1000]));
    const K = 34 / Math.max(1, field - 1);
    for (const a of outcomes) {
      let delta = 0;
      for (const b of outcomes) {
        if (a === b) continue;
        const ra = ratings.get(a.horseId)!, rb = ratings.get(b.horseId)!;
        const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
        const pa = a.pos || 99, pb = b.pos || 99;
        const sa = pa < pb ? 1 : pa > pb ? 0 : 0.5;
        delta += K * (sa - ea);
      }
      const h = horses.get(a.horseId);
      if (h) h.rating = Math.round((h.rating + delta) * 10) / 10;
    }
    // ---- premi
    const purse = r.purse;
    const results: any[] = [];
    const prizeOf = (pos: number) => (pos >= 1 && pos <= PURSE_SPLIT.length ? Math.round(purse * PURSE_SPLIT[pos - 1]) : 0);
    const ownerOf = new Map<string, string | null>();
    for (const e of this.db.all<{ horse_id: string; owner: string | null }>("SELECT horse_id, owner FROM entries WHERE race_id = ?", r.id)) ownerOf.set(e.horse_id, e.owner);
    const replayHorses: any[] = JSON.parse(this.db.one<{ replay: string }>("SELECT replay FROM races WHERE id = ?", r.id)?.replay ?? "{}").horses ?? [];

    for (const o of ordered) {
      const h = horses.get(o.horseId);
      const owner = ownerOf.get(o.horseId) ?? null;
      const prize = prizeOf(o.pos);
      const rh = replayHorses.find((x) => x.id === o.horseId);
      results.push({
        num: o.num, horseId: o.horseId, name: o.name, owner, stable: rh?.stable ?? "", silks: rh?.silks ?? null, pos: o.pos, time: o.time, status: o.status,
        dnfReason: o.dnfReason ?? null, prize, strategy: o.strategy, topSpeed: o.topSpeed,
        revealed: o.revealed.map((q) => quirkById(q)?.name ?? q), injury: o.injury, fell: o.fell, doped: o.doped && o.status === "dq",
      });
      if (!h) continue;
      // ---- apprendimento
      const before = JSON.stringify(h.mind.v);
      let notes = learnFromRace(h.mind, o.exp, h.stats.smarts);
      if (h.quirks.includes("vecchia_volpe")) notes = notes.concat(learnFromRace(h.mind, { ...o.exp, strategy: -1 }, h.stats.smarts));
      if (h.quirks.includes("smemorato")) for (const s of STIMULI) h.mind.v[s] *= 0.6;
      void before;
      // ---- quirk scoperti
      const newQ = o.revealed.filter((q) => !h.revealed.includes(q));
      h.revealed.push(...newQ);
      // ---- carriera
      h.rec.starts++;
      if (o.pos === 1) { h.rec.wins++; (h.venuesWon ??= []).includes(r.venue) || h.venuesWon!.push(r.venue); }
      if (o.pos >= 1 && o.pos <= 3) h.rec.places++;
      if (o.fell) h.rec.falls++;
      h.rec.earnings += prize;
      h.rec.form = [o.pos, ...h.rec.form].slice(0, 8);
      if (o.status === "ok") {
        const k = String(r.distance) + (r.hurdles ? "s" : "");
        if (!h.rec.bestTimes[k] || o.time < h.rec.bestTimes[k]) h.rec.bestTimes[k] = o.time;
      }
      if (o.pos === 1 && r.big) (h.trophies ??= []).push(`🏆 ${r.name} (${dayKey(r.start_at)})`);
      // ---- fisico e morale
      h.cond.busy = null;
      addFatigue(h, now, 16 + r.distance / 110 + (o.exhausted ? 8 : 0) + (o.fell ? 20 : 0) + (r.hurdles ? 6 : 0));
      h.cond.morale = clamp(h.cond.morale + (o.pos === 1 ? 10 : o.pos <= 3 && o.pos > 0 ? 4 : o.pos > field / 2 || o.pos === 0 ? -3 : 0) + (o.fell ? -10 : 0), 0, 100);
      if (o.fell) h.cond.health = clamp(h.cond.health - 22, 0, 100);
      if (o.injury) {
        const days = o.fell ? 1 + Math.random() * 2.5 : 0.5 + Math.random();
        h.cond.injury = { name: o.injury, until: now + days * DAY_MS };
        h.cond.health = clamp(h.cond.health - 12, 0, 100);
      }
      h.cond.effects = [];
      if (owner) {
        const p = this.player(owner);
        if (p) {
          p.data.races++;
          if (o.pos === 1) p.data.wins++;
          p.data.earnings += prize;
          this.savePlayer(p);
        }
        if (prize) this.money(owner, prize, `Premio ${r.name} (${o.pos}°)`);
        const posTxt = o.status === "dq" ? "squalificato per doping!" : o.pos ? `${o.pos}° su ${field}` : `non classificato (${o.dnfReason})`;
        let txt = `🏁 ${h.name} — ${r.name}: ${posTxt}${prize ? ` · premio ${prize} ƒ` : ""}.`;
        if (newQ.length) txt += ` 🔍 Quirk scoperti: ${newQ.map((q) => quirkById(q)?.name ?? q).join(", ")}.`;
        if (notes.length) txt += ` 🧠 ${h.name} ${notes.join("; ")}.`;
        if (o.injury) txt += ` 🚑 Infortunio: ${o.injury}.`;
        this.note(owner, "race", txt, `/corsa/${r.id}`);
        if (o.status === "dq") {
          this.money(owner, -Math.round(Math.max(2000, r.purse * 0.3)), `Multa antidoping ${r.name}`, true);
          const pl = this.player(owner);
          if (pl) { pl.data.rep = clamp(pl.data.rep - 12, 0, 100); this.savePlayer(pl); }
        }
        this.resolveContracts(owner, h, o.pos, field, o.status === "ok");
      }
      this.saveHorse(h);
    }
    // ---- campionato / tornei / coppa
    if (r.kind === "league" && r.data.season) {
      for (const o of outcomes) {
        const pts = o.pos >= 1 && o.pos <= LEAGUE_POINTS.length ? LEAGUE_POINTS[o.pos - 1] : 0;
        this.db.run("UPDATE league SET points = points + ?, races = races + 1, wins = wins + ? WHERE season = ? AND horse_id = ?", pts, o.pos === 1 ? 1 : 0, r.data.season, o.horseId);
      }
    }
    if (r.data.tournament) {
      for (const o of outcomes) {
        const pts = o.pos >= 1 && o.pos <= LEAGUE_POINTS.length ? LEAGUE_POINTS[o.pos - 1] : 0;
        this.db.run("UPDATE tmembers SET points = points + ?, races = races + 1, wins = wins + ? WHERE tid = ? AND horse_id = ?", pts, o.pos === 1 ? 1 : 0, r.data.tournament, o.horseId);
      }
    }
    if (r.kind === "cup" && r.data.finalId) this.qualifyCup(r, ordered);
    if (r.data.challenge) this.settleChallenge(r, ordered);
    this.settleBets(r, ordered);
    this.settleCrimes(r, outcomes);
    delete r.data.pending;
    this.db.run("UPDATE races SET status = 'done', result = ?, data = ? WHERE id = ?", JSON.stringify(results), JSON.stringify(r.data), r.id);
    if (r.data.tournament) this.tournamentAfterRace(r.data.tournament);
    this.emit(null, { t: "race_done", raceId: r.id, name: r.name, winner: results[0]?.name ?? null });
  }

  qualifyCup(heat: RaceRow, ordered: RunnerOutcome[]) {
    const finalId = heat.data.finalId!;
    const final = this.race(finalId);
    if (!final || final.status !== "open") return;
    const base = heat.data.heatOf ?? heat.id;
    const heats = this.db.all<{ id: string }>("SELECT id FROM races WHERE id = ? OR json_extract(data, '$.heatOf') = ?", base, base);
    const q = heats.length > 1 ? heat.data.qualify ?? 3 : 6;
    for (const o of ordered.filter((x) => x.pos > 0).slice(0, q)) {
      const h = this.horse(o.horseId);
      if (!h || h.dead) continue;
      const owner = h.bot ? null : h.ownerId;
      this.addEntry(finalId, h, owner);
      if (owner) this.note(owner, "race", `🎉 ${h.name} si è qualificato per la FINALE della Coppa del Giorno (ore ${new Date(final.start_at).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })})!`, `/corsa/${finalId}`);
    }
  }

  // ---- contratti (ingaggi condizionati alla prossima corsa)
  resolveContracts(owner: string, h: Horse, pos: number, field: number, finished: boolean) {
    if (!h.contracts?.length) return;
    const { offerById } = OFFERS_MOD;
    const left: typeof h.contracts = [];
    for (const c of h.contracts) {
      const tpl = offerById(c.tpl);
      if (!tpl?.cond || c.until < this.now()) continue;
      const k = tpl.cond;
      const ok =
        (k.win && pos === 1) ||
        (k.top !== undefined && pos >= 1 && pos <= k.top) ||
        (k.worse !== undefined && (pos === 0 || pos > k.worse)) ||
        (k.finish && finished);
      if (ok) {
        this.money(owner, c.pay, `Contratto: ${tpl.title}`);
        this.note(owner, "offer", `✍️ Contratto "${tpl.title}" rispettato da ${h.name}: incassi ${c.pay} ƒ.`);
        if (tpl.scandal && Math.random() < tpl.scandal) {
          this.money(owner, -(tpl.penalty ?? 5000), `Multa: corsa truccata`, true);
          const p = this.player(owner);
          if (p) { p.data.rep = clamp(p.data.rep + (tpl.rep ?? -10), 0, 100); this.savePlayer(p); }
          this.note(owner, "crime", `🚨 SCANDALO! La commissione ha scoperto che ${h.name} ha corso per perdere. Multa di ${tpl.penalty} ƒ e reputazione a picco.`);
          this.emit(null, { t: "chat_sys", text: `🚨 Scandalo all'ippodromo: la scuderia ${this.player(owner)?.stable} è stata beccata a truccare una corsa!` });
        } else if (tpl.rep) {
          const p = this.player(owner);
          if (p) { p.data.rep = clamp(p.data.rep + tpl.rep, 0, 100); this.savePlayer(p); }
        }
      } else {
        this.note(owner, "offer", `❌ Contratto "${tpl.title}" non rispettato da ${h.name}: niente soldi.`);
      }
    }
    h.contracts = left;
  }

  // ---- scommesse
  odds(raceId: string): Map<string, number> {
    const entries = this.raceEntries(raceId);
    const now = this.now();
    const score = entries.map((e) => {
      const fat = currentFatigue(e.horse, now);
      return e.horse.rating - fat * 1.5 + (e.horse.cond.morale - 60) * 0.8 + (e.horse.illness ? -60 : 0);
    });
    const mx = Math.max(...score, 0);
    const w = score.map((s) => Math.exp((s - mx) / 110));
    const tot = w.reduce((a, b) => a + b, 0) || 1;
    const out = new Map<string, number>();
    entries.forEach((e, k) => out.set(e.horse.id, Math.round(clamp(0.82 / (w[k] / tot), 1.15, 60) * 20) / 20));
    return out;
  }

  settleBets(r: RaceRow, ordered: RunnerOutcome[]) {
    const winner = ordered.find((o) => o.pos === 1);
    const bets = this.db.all<{ id: string; player: string; horse_id: string; amount: number; payout: number }>("SELECT * FROM bets WHERE race_id = ?", r.id);
    for (const b of bets) {
      const odds = b.payout / 100;
      if (winner && b.horse_id === winner.horseId) {
        const win = Math.round(b.amount * odds);
        this.money(b.player, win, `Scommessa vinta: ${r.name}`);
        this.note(b.player, "bet", `💰 Scommessa vinta! ${winner.name} ha vinto "${r.name}": incassi ${win} ƒ (quota ${odds}).`, `/corsa/${r.id}`);
      } else {
        const h = ordered.find((o) => o.horseId === b.horse_id);
        this.note(b.player, "bet", `🎟️ Scommessa persa su ${h?.name ?? "?"} in "${r.name}".`, `/corsa/${r.id}`);
      }
    }
  }

  // ---- sabotaggi: dopo la corsa si scopre se il colpevole è stato beccato
  settleCrimes(r: RaceRow, outcomes: RunnerOutcome[]) {
    const crimes = this.db.all<{ id: string; by_player: string; target_horse: string; target_owner: string | null; service: string; data: string }>(
      "SELECT * FROM crimes WHERE race_id = ? AND status = 'executed'", r.id,
    );
    const replay = JSON.parse(this.db.one<{ replay: string }>("SELECT replay FROM races WHERE id = ?", r.id)?.replay ?? "{}");
    const evs: any[] = replay.events ?? [];
    for (const c of crimes) {
      const svc = crimeById(c.service);
      if (!svc) continue;
      const num = (replay.horses ?? []).find((x: any) => x.id === c.target_horse)?.num;
      const intercepted = evs.some((e) => e.k === "caught" && e.a === (num ?? 0) - 1 && e.x === c.service);
      const caughtP = intercepted ? 0.65 : svc.caught;
      const caught = Math.random() < caughtP;
      this.db.run("UPDATE crimes SET status = ? WHERE id = ?", caught ? "caught" : intercepted ? "failed" : "done", c.id);
      const target = outcomes.find((o) => o.horseId === c.target_horse);
      if (intercepted) this.note(c.by_player, "crime", `🚓 Il tuo sicario (${svc.name}) è stato fermato dalla sorveglianza prima di agire su ${target?.name ?? "il bersaglio"}.`);
      else this.note(c.by_player, "crime", `🕶️ Il sicario ha eseguito "${svc.name}" durante "${r.name}". ${target ? `${target.name} è arrivato ${target.pos ? target.pos + "°" : "non classificato"}.` : ""}`, `/corsa/${r.id}`);
      if (caught) this.punishCrime(c.by_player, svc.name, svc.cost, c.target_owner, target?.name ?? "un cavallo");
      else if (c.target_owner && !intercepted) this.note(c.target_owner, "crime", `🤨 Durante "${r.name}" un losco figuro ha agito contro ${target?.name ?? "il tuo cavallo"}. Il colpevole non è stato identificato.`, `/corsa/${r.id}`);
      else if (c.target_owner) this.note(c.target_owner, "crime", `🛡️ La tua sorveglianza ha fermato un sicario che voleva colpire ${target?.name ?? "il tuo cavallo"} in "${r.name}"!`);
    }
  }

  punishCrime(culprit: string, what: string, cost: number, victim: string | null, targetName: string, mult = 2, banDays = 1) {
    const p = this.player(culprit);
    if (!p) return;
    const fine = cost * mult;
    p.data.rep = clamp(p.data.rep - 15 * mult / 2, 0, 100);
    p.data.crimeBan = this.now() + banDays * DAY_MS;
    this.savePlayer(p);
    this.money(culprit, -fine, `Multa: ${what}`, true);
    this.note(culprit, "crime", `🚨 Ti hanno BECCATO! "${what}" contro ${targetName}. Multa di ${fine} ƒ, reputazione giù e niente mercato nero per ${banDays} giorn${banDays === 1 ? "o" : "i"}.`);
    if (victim) {
      this.money(victim, Math.round(fine * 0.5), `Risarcimento per sabotaggio`);
      this.note(victim, "crime", `⚖️ Scoperto il colpevole: la scuderia "${p.stable}" (${p.name}) aveva ordinato "${what}" contro ${targetName}. Ti spetta un risarcimento di ${Math.round(fine * 0.5)} ƒ.`);
    }
    this.emit(null, { t: "chat_sys", text: `🚨 SCANDALO: la scuderia "${p.stable}" è stata beccata a ordinare "${what}" contro ${targetName}!` });
  }

  settleChallenge(r: RaceRow, ordered: RunnerOutcome[]) {
    const ch = this.db.one<{ id: string; from_player: string; from_horse: string; to_player: string; to_horse: string; stake: number }>("SELECT * FROM challenges WHERE id = ?", r.data.challenge);
    if (!ch) return;
    const pa = ordered.find((o) => o.horseId === ch.from_horse);
    const pb = ordered.find((o) => o.horseId === ch.to_horse);
    const ra = pa?.pos || 99, rb = pb?.pos || 99;
    this.db.run("UPDATE challenges SET status = 'done' WHERE id = ?", ch.id);
    if (ra === rb) {
      if (ch.stake) { this.money(ch.from_player, ch.stake, "Sfida pareggiata"); this.money(ch.to_player, ch.stake, "Sfida pareggiata"); }
      return;
    }
    const winner = ra < rb ? ch.from_player : ch.to_player;
    const loser = winner === ch.from_player ? ch.to_player : ch.from_player;
    const wh = winner === ch.from_player ? pa : pb;
    if (ch.stake) this.money(winner, Math.round(ch.stake * 2 * 0.95), "Sfida vinta");
    this.note(winner, "challenge", `⚔️ Hai vinto la sfida con ${wh?.name}!${ch.stake ? ` Incassi ${Math.round(ch.stake * 1.9)} ƒ.` : ""}`, `/corsa/${r.id}`);
    this.note(loser, "challenge", `⚔️ Hai perso la sfida.${ch.stake ? ` Addio ${ch.stake} ƒ.` : ""}`, `/corsa/${r.id}`);
  }

  // =================================================================== mercato
  refreshMarket(initial = false) {
    const now = this.now();
    // i cavalli del sistema rimasti invenduti da più di un giorno tornano all'allevamento
    const old = this.db.all<{ id: string; updated: number }>("SELECT id, updated FROM horses WHERE market = 1 AND owner IS NULL");
    for (const o of old) if (now - o.updated > 30 * HOUR) this.db.run("DELETE FROM horses WHERE id = ?", o.id);
    const n = this.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM horses WHERE market = 1 AND owner IS NULL")?.n ?? 0;
    const rng = this.rng("market");
    const add = Math.max(0, (initial ? 16 : 12) - n);
    for (let i = 0; i < add; i++) {
      const kind = rng.next();
      const quality = kind < 0.35 ? rng.range(0.1, 0.35) : kind < 0.8 ? rng.range(0.3, 0.6) : rng.range(0.55, 0.85);
      const age = kind < 0.15 ? rng.range(6, 10) : rng.range(2, 4);
      const h = generateHorse(rng, { id: this.newId("h"), ownerId: null, now, quality, age });
      h.jockey = jockeyName(rng);
      h.bornAt = rng.pick(["Allevamento Nazionale", "Haras di Persano", "Tenuta del Sole", "Razza di Mesola", "Stazione di monta di Crema"]);
      this.saveHorse(h, { market: 1, price: Math.round(valuation(h, now) * 1.08 / 50) * 50 });
    }
  }

  marketList() {
    const now = this.now();
    return this.db
      .all<{ data: string; price: number; owner: string | null }>("SELECT data, price, owner FROM horses WHERE market = 1 AND price IS NOT NULL ORDER BY price")
      .map((r) => {
        const h = JSON.parse(r.data) as Horse;
        if (h.dead) return null;
        const v = this.horseView(h, null);
        v.price = r.price;
        v.value = valuation(h, now);
        return v;
      })
      .filter(Boolean);
  }

  // =================================================================== giornaliero
  daily() {
    const now = this.now();
    const rng = this.rng("daily");
    // giocatori: mantenimento, sorveglianza, assicurazioni, allenamenti
    for (const pr of this.db.all<any>("SELECT * FROM players")) {
      const p = this.rowToPlayer(pr);
      const horses = this.horsesOf(p.id);
      let upkeep = 0;
      let premium = 0;
      const wd = romeParts(now).wd;
      const sick = horses.filter((h) => h.illness && (diseaseById(h.illness.id)?.contagious ?? 0) > 0);
      const contagion = sick.reduce((a, h) => a + (diseaseById(h.illness!.id)?.contagious ?? 0), 0);
      for (const h of horses) {
        for (const msg of tickCondition(h, now)) this.note(p.id, "horse", msg);
        upkeep += h.retired ? UPKEEP / 2 : UPKEEP;
        // assicurazione
        if (h.insurance && h.insurance.policy !== "nessuna") {
          const pol = POLICIES.find((x) => x.id === h.insurance!.policy)!;
          premium += Math.round(h.insurance.value * pol.daily);
        }
        // malattie
        if (!h.illness) {
          const d = rollIllness(rng, h, currentFatigue(h, now), sick.includes(h) ? 0 : contagion * 0.6);
          if (d) {
            h.illness = { id: d.id, since: now, diagnosed: false, treatment: null, until: null, untreatedDays: 0 };
            this.note(p.id, "health", `🤒 ${h.name} non sta bene: ${d.symptom}. Portalo dal veterinario!`, `/cavallo/${h.id}`);
          }
        } else this.illnessDay(p, h, rng);
        if (h.dead) { this.saveHorse(h); continue; }
        // piano di allenamento
        if (h.plan?.active && !canTrainBlock(h, now)) {
          const day = h.plan.days[wd];
          const cost = sessionCost(day.s, day.i);
          if (p.money - upkeep - premium >= cost) {
            const rep = applySession(rng, h, day.s, day.i, now);
            if (rep.cost) this.money(p.id, -rep.cost, `Allenamento ${h.name}`, true);
            p.money -= rep.cost;
            this.note(p.id, "training", `🏋️ ${h.name}: ${rep.text}${rep.notes.length ? ". 🧠 " + rep.notes.join("; ") : ""}`, `/cavallo/${h.id}`);
          } else this.note(p.id, "training", `💸 ${h.name} oggi non si allena: non hai i soldi per "${day.s}".`);
        }
        this.saveHorse(h);
      }
      const sec = SECURITY[p.data.security] ?? SECURITY[0];
      if (upkeep) this.money(p.id, -upkeep, `Biada e scuderia (${horses.length} cavalli)`, true);
      if (sec.perDay) this.money(p.id, -sec.perDay, `Sorveglianza: ${sec.name}`, true);
      if (premium) this.money(p.id, -premium, `Premi assicurativi`, true);
      const after = this.player(p.id);
      if (after && after.money < 0) this.note(p.id, "money", `⚠️ Sei in rosso (${after.money} ƒ)! Vendi un cavallo o accetta qualche ingaggio dalla bacheca.`);
    }
    // cavalli del sistema: invecchiano, guariscono, si ritirano; nuovi arrivano
    for (const h of this.botHorses()) {
      tickCondition(h, now);
      if (h.retired || ageYears(h, now) > RETIRE_AGE - 1) {
        this.db.run("DELETE FROM horses WHERE id = ? AND owner IS NULL AND bot = 1", h.id);
        this.db.run("DELETE FROM league WHERE horse_id = ? AND owner IS NULL", h.id);
        continue;
      }
      // i bot si allenano un po'
      if (rng.chance(0.5)) applySession(rng, h, rng.pick(["galoppo", "ripetute", "salite", "slalom", "riposo", "riposo"]), "normale", now);
      this.saveHorse(h);
    }
    this.ensureBots();
    // pulizia vecchie corse vuote e replay vecchi
    this.db.run("DELETE FROM races WHERE status = 'void' AND start_at < ?", now - DAY_MS);
    this.db.run("UPDATE races SET replay = NULL WHERE status = 'done' AND start_at < ? AND big = 0", now - 4 * DAY_MS);
    this.db.run("DELETE FROM notes WHERE ts < ?", now - 10 * DAY_MS);
    this.db.run("DELETE FROM ledger WHERE ts < ?", now - 14 * DAY_MS);
    this.db.run("DELETE FROM chat WHERE id < (SELECT MAX(id) - 300 FROM chat)");
  }

  illnessDay(p: Player, h: Horse, rng: Rng) {
    const ill = h.illness!;
    const d = diseaseById(ill.id);
    if (!d) { h.illness = null; return; }
    if (ill.treatment) return; // in cura: ci pensa il lavoro "heal"
    ill.untreatedDays++;
    h.cond.health = clamp(h.cond.health - d.severity * 4, 0, 100);
    if (d.severity <= 2 && ill.untreatedDays >= d.days[1] + 1 && rng.chance(0.5)) {
      this.note(p.id, "health", `${h.name} è guarito da solo (${ill.diagnosed ? d.name : "il malessere è passato"}).`);
      h.illness = null;
      return;
    }
    if (d.chronic && ill.untreatedDays >= 3 && rng.chance(0.5)) {
      h.potential[d.chronic] = Math.max(15, h.potential[d.chronic] - 3);
      h.stats[d.chronic] = Math.min(h.stats[d.chronic], h.potential[d.chronic]);
      this.note(p.id, "health", `😞 La malattia di ${h.name} trascurata ha lasciato un danno permanente (${d.chronic}).`);
    }
    if (ill.untreatedDays >= 2 && rng.chance(d.lethal * ill.untreatedDays)) this.killHorse(h, "malattia non curata", 0.5);
  }

  healCheck(hid: string) {
    const h = this.horse(hid);
    if (!h || !h.illness || !h.illness.until) return;
    if (h.illness.until > this.now() + 1000) return;
    const d = diseaseById(h.illness.id);
    h.illness = null;
    h.cond.health = clamp(h.cond.health + 20, 0, 100);
    if (h.cond.busy?.reason?.startsWith("ricoverato")) h.cond.busy = null;
    this.saveHorse(h);
    if (h.ownerId) this.note(h.ownerId, "health", `💚 ${h.name} è guarito${d ? ` da ${d.name}` : ""} ed è tornato in scuderia.`, `/cavallo/${h.id}`);
  }

  /** Morte di un cavallo; `coverage` = frazione pagata dalla polizza completa. */
  killHorse(h: Horse, cause: string, coverage = 1) {
    h.dead = { at: this.now(), cause };
    h.cond.busy = null;
    this.db.run("DELETE FROM entries WHERE horse_id = ? AND race_id IN (SELECT id FROM races WHERE status = 'open')", h.id);
    this.db.run("DELETE FROM league WHERE horse_id = ? AND season = ?", h.id, this.season().n);
    this.db.run("DELETE FROM tmembers WHERE horse_id = ?", h.id);
    this.saveHorse(h, { price: null, stud: null, market: 0 });
    if (!h.ownerId) return;
    let txt = `🕯️ ${h.name} è morto (${cause}).`;
    const ins = h.insurance;
    if (ins && ins.policy === "completa") {
      if (this.now() - ins.since < DEATH_WAITING_MS) txt += " La polizza era attiva da meno di 24 ore: niente rimborso (periodo di carenza).";
      else if (coverage > 0) {
        const pay = Math.round(ins.value * coverage);
        this.money(h.ownerId, pay, `Assicurazione: morte di ${h.name}`);
        txt += ` 📄 L'assicurazione ti rimborsa ${pay} ƒ.`;
      } else txt += " La polizza non copre questa causa di morte.";
    } else txt += " Non era assicurato.";
    this.note(h.ownerId, "death", txt, `/cavallo/${h.id}`);
  }

  birth(mareId: string) {
    const mare = this.horse(mareId);
    if (!mare || !mare.cond.pregnant) return;
    const sire = this.horse(mare.cond.pregnant.sireId);
    const owner = mare.ownerId;
    mare.cond.pregnant = null;
    this.saveHorse(mare);
    if (!owner || !sire) return;
    const rng = this.rng("birth" + mareId);
    const foal = BREED_MOD.breedFoal(rng, sire, mare, this.newId("h"), owner, this.now());
    foal.jockey = jockeyName(rng);
    foal.bornAt = this.player(owner)?.stable;
    this.saveHorse(foal);
    this.note(owner, "birth", `🍼 È nato un puledr${foal.sex === "M" ? "o" : "a"}! ${foal.name}, figli${foal.sex === "M" ? "o" : "a"} di ${sire.name} e ${mare.name}. Potrà correre a 2 anni.`, `/cavallo/${foal.id}`);
  }

  loanDue(ref: string) {
    const [pid, lid] = ref.split("|");
    const p = this.player(pid);
    if (!p) return;
    const loan = p.data.loans.find((l) => l.id === lid);
    if (!loan) return;
    p.data.loans = p.data.loans.filter((l) => l.id !== lid);
    this.savePlayer(p);
    this.money(pid, -loan.amount, `Restituzione: ${loan.title}`, true);
    this.note(pid, "money", `🏦 Scaduto "${loan.title}": restituiti ${loan.amount} ƒ.`);
  }

  // ---- indagini
  investigationDone(crimeId: string) {
    const c = this.db.one<any>("SELECT * FROM crimes WHERE id = ?", crimeId);
    if (!c) return;
    const d = JSON.parse(c.data || "{}");
    if (!d.inv || d.inv.done) return;
    const det = DETECTIVES.find((x) => x.id === d.inv.det);
    const svc = crimeById(c.service);
    const h = this.horse(c.target_horse);
    d.inv.done = true;
    const ok = Math.random() < (det?.chance ?? 0.4);
    d.inv.result = ok;
    if (ok) {
      d.solved = true;
      const culprit = this.player(c.by_player);
      this.note(c.target_owner, "crime", `🕵️ ${det?.name}: caso risolto! Dietro "${svc?.name}" contro ${h?.name ?? "il tuo cavallo"} c'è la scuderia "${culprit?.stable}" (${culprit?.name}). Ora puoi denunciarli alla polizia.`, "/mercato-nero?tab=casi");
      this.note(c.by_player, "crime", `😰 Un detective privato ha scoperto che sei stato tu a ordinare "${svc?.name}". Preparati...`);
    } else {
      this.note(c.target_owner, "crime", `🕵️ ${det?.name}: niente da fare, il colpevole ha coperto bene le tracce. Puoi riprovare con un altro detective.`, "/mercato-nero?tab=casi");
    }
    this.db.run("UPDATE crimes SET data = ? WHERE id = ?", JSON.stringify(d), crimeId);
  }

  policeDone(crimeId: string) {
    const c = this.db.one<any>("SELECT * FROM crimes WHERE id = ?", crimeId);
    if (!c) return;
    const d = JSON.parse(c.data || "{}");
    if (!d.police || d.police.done) return;
    d.police.done = true;
    const svc = crimeById(c.service);
    const h = this.horse(c.target_horse);
    const ok = Math.random() < (d.solved ? 0.92 : 0.15);
    d.police.result = ok;
    if (ok && !d.convicted) {
      d.convicted = true;
      d.solved = true;
      const killer = svc?.id === "killer";
      this.punishCrime(c.by_player, svc?.name ?? c.service, svc?.cost ?? 3000, c.target_owner, h?.name ?? "un cavallo", killer ? 3 : 2.5, killer ? 5 : 2);
      this.note(c.target_owner, "crime", `👮 La polizia ha arrestato il mandante! Giustizia è fatta.`);
    } else if (!ok) {
      this.note(c.target_owner, "crime", `👮 La polizia ha archiviato il caso per mancanza di prove. Prova con un detective privato.`, "/mercato-nero?tab=casi");
    }
    this.db.run("UPDATE crimes SET data = ? WHERE id = ?", JSON.stringify(d), crimeId);
  }

  // ---- tornei: implementati in actions.ts (agganci)
  tournamentRound(tid: string) { TOURN_MOD.round(this, tid); }
  tournamentAfterRace(tid: string) { TOURN_MOD.after(this, tid); }
}

// moduli caricati in modo pigro per evitare dipendenze circolari
import * as OFFERS_MOD from "./offers";
import * as BREED_MOD from "../sim/horse";
import { TOURN_MOD } from "./tournaments";

export function defaultPlayerData(): PlayerData {
  return { rep: 50, security: 0, stalls: BASE_STALLS, crimeBan: 0, wins: 0, races: 0, earnings: 0, tut: {}, loans: [], boardWindow: -1, watched: [] };
}

function canTrainBlock(h: Horse, now: number): string | null {
  if (h.dead) return "morto";
  if (h.cond.injury && h.cond.injury.until > now) return "infortunato";
  if (h.cond.busy && h.cond.busy.until > now) return "impegnato";
  if (h.illness) return "malato";
  if (ageYears(h, now) < 1) return "puledro";
  return null;
}
export { canTrainBlock };

export function botSilks(stable: string): Silks {
  const h = hashString(stable);
  const pal = ["#c0392b", "#2c3e50", "#27ae60", "#f1c40f", "#8e44ad", "#e67e22", "#16a085", "#ecf0f1", "#d35400", "#2980b9", "#1abc9c", "#7f8c8d", "#e84393", "#0a3d62"];
  const pats: Silks["pattern"][] = ["tinta", "strisce", "bande", "stella", "croce", "pois", "diagonale", "quarti"];
  return { primary: pal[h % pal.length], secondary: pal[(h >>> 4) % pal.length], pattern: pats[(h >>> 8) % pats.length], cap: pal[(h >>> 12) % pal.length] };
}

const TITLES_A = ["del Mattino", "della Rosa", "dei Pini", "del Faro", "delle Vigne", "del Sindaco", "dell'Amicizia", "del Ponte", "della Luna", "dei Mulini", "del Carnevale", "della Vendemmia", "del Castello", "dei Pescatori", "della Fontana", "dei Tre Colli", "del Campanile", "della Fiera"];
function raceTitle(rng: Rng) {
  return rng.pick(TITLES_A);
}
const GP = ["d'Italia", "del Mediterraneo", "delle Nazioni", "della Repubblica", "del Re", "dell'Imperatore", "delle Alpi", "del Golfo", "dei Dogi", "della Lanterna", "di Primavera", "d'Autunno"];
function gpName(rng: Rng) {
  return rng.pick(GP);
}

export { overall };
