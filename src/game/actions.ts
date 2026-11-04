// Tutto quello che un giocatore può fare. Ogni funzione valida, muta il mondo e ritorna un esito.
import { Game, fail, botSilks, defaultPlayerData, CLOSE_BEFORE, DIVISIONS, CLASS_INFO, canTrainBlock, type Player } from "./world";
import { Rng, clamp } from "../sim/rng";
import { type Horse, valuation, canRace, canBreed, GESTATION_MS, addFatigue, ageYears, STAT_KEYS, type StatKey } from "../sim/horse";
import { exposeStimulus, type Stim } from "../sim/learning";
import type { Silks } from "../sim/types";
import { OFFERS, offerById, rollBoard } from "./offers";
import { applySession, sessionCost, validatePlan, SESSIONS, INTENSITIES } from "./training";
import { CRIMES, crimeById, SECURITY, DETECTIVES } from "./crime";
import { DISEASES, diseaseById, TREATMENTS, DIAGNOSIS_COST, TRIALS, trialById, applyTrial, POLICIES } from "./health";
import { validateConfig, nextSlot } from "./tournaments";
import { DAY_MS, HOUR, MIN } from "./time";
import { jockeyName } from "../sim/names";

const PATTERNS: Silks["pattern"][] = ["tinta", "strisce", "bande", "stella", "croce", "pois", "diagonale", "quarti"];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function cleanText(s: unknown, max: number): string {
  return String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

function cleanSilks(raw: any): Silks {
  const c = (x: any, d: string) => (typeof x === "string" && COLOR_RE.test(x) ? x : d);
  return {
    primary: c(raw?.primary, "#c0392b"),
    secondary: c(raw?.secondary, "#f1c40f"),
    cap: c(raw?.cap, "#2c3e50"),
    pattern: PATTERNS.includes(raw?.pattern) ? raw.pattern : "tinta",
  };
}

function randomToken(len: number) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
}

// ======================================================= account
export function register(g: Game, body: any) {
  const name = cleanText(body.name, 24);
  const stable = cleanText(body.stable, 32);
  if (name.length < 2) fail("Scegli un nome di almeno 2 lettere.");
  if (stable.length < 3) fail("Il nome della scuderia deve avere almeno 3 lettere.");
  if (g.db.one("SELECT 1 FROM players WHERE lower(stable) = lower(?)", stable)) fail("Esiste già una scuderia con questo nome.");
  const id = g.newId("p");
  const token = randomToken(32);
  const recovery = `${randomToken(4)}-${randomToken(4)}-${randomToken(4)}`;
  const now = g.now();
  g.db.run(
    "INSERT INTO players (id, token, recovery, name, stable, silks, money, created, last_seen, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, token, recovery, name, stable, JSON.stringify(cleanSilks(body.silks)), 30000, now, now, JSON.stringify(defaultPlayerData()),
  );
  g.note(id, "welcome", `Benvenuto a Horses Arena, ${name}! La scuderia "${stable}" ha 30.000 ƒ e ${4} box liberi. Segui il tutorial per cominciare.`);
  return { id, token, recovery };
}

export function login(g: Game, body: any) {
  const code = cleanText(body.recovery, 20).toUpperCase();
  const r = g.db.one<{ token: string; id: string }>("SELECT token, id FROM players WHERE recovery = ?", code);
  if (!r) fail("Codice di recupero non valido.");
  return { token: r!.token, id: r!.id };
}

export function updateProfile(g: Game, p: Player, body: any) {
  if (body.silks) p.silks = cleanSilks(body.silks);
  if (body.name) p.name = cleanText(body.name, 24) || p.name;
  g.savePlayer(p);
  return { ok: true };
}

export function me(g: Game, p: Player) {
  const now = g.now();
  p.last_seen = now;
  g.savePlayer(p);
  const horses = g.horsesOf(p.id, true).map((h) => g.horseView(h, p.id));
  const notes = g.db.all("SELECT id, ts, kind, text, link, seen FROM notes WHERE player = ? ORDER BY id DESC LIMIT 60", p.id);
  const entries = g.db.all(
    "SELECT e.race_id, e.horse_id, r.name, r.start_at, r.status, r.kind FROM entries e JOIN races r ON r.id = e.race_id WHERE e.owner = ? AND r.status IN ('open','closed') ORDER BY r.start_at",
    p.id,
  );
  const challenges = g.db.all("SELECT * FROM challenges WHERE (to_player = ? OR from_player = ?) AND status = 'pending' ORDER BY created DESC", p.id, p.id);
  return {
    id: p.id, name: p.name, stable: p.stable, silks: p.silks, money: p.money, recovery: p.recovery,
    rep: p.data.rep, security: p.data.security, stalls: p.data.stalls, used: horses.filter((h: any) => !h.dead).length,
    crimeBan: p.data.crimeBan, wins: p.data.wins, races: p.data.races, earnings: p.data.earnings, tut: p.data.tut, loans: p.data.loans,
    horses, notes, entries, challenges, season: g.season(), now,
    mailUnread: g.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM mail WHERE recipient = ? AND read = 0", p.id)!.n,
  };
}

export function seenNotes(g: Game, p: Player) {
  g.db.run("UPDATE notes SET seen = 1 WHERE player = ?", p.id);
  return { ok: true };
}

export function markTutorial(g: Game, p: Player, step: string) {
  if (step === "__reset") {
    p.data.tut = {};
    g.savePlayer(p);
    return { ok: true };
  }
  g.tut(p, cleanText(step, 30));
  return { ok: true };
}

// ======================================================= mercato
export function buyHorse(g: Game, p: Player, hid: string) {
  const row = g.db.one<{ data: string; price: number | null; market: number; owner: string | null }>("SELECT data, price, market, owner FROM horses WHERE id = ?", hid);
  if (!row || !row.market || row.price == null) fail("Questo cavallo non è in vendita.");
  if (row!.owner === p.id) fail("È già tuo!");
  if (g.stallsUsed(p.id) >= p.data.stalls) fail(`Non hai box liberi (${p.data.stalls}). Comprane un altro o vendi un cavallo.`);
  const h = JSON.parse(row!.data) as Horse;
  if (h.dead) fail("Questo cavallo non c'è più.");
  const price = row!.price!;
  g.money(p.id, -price, `Acquisto di ${h.name}`);
  const seller = row!.owner;
  if (seller) {
    const net = Math.round(price * 0.95);
    g.money(seller, net, `Vendita di ${h.name}`);
    g.note(seller, "market", `🤝 Hai venduto ${h.name} alla scuderia "${p.stable}" per ${price} ƒ (incassi ${net} ƒ dopo la commissione del 5%).`);
  }
  h.ownerId = p.id;
  h.bot = false;
  h.botStable = undefined;
  h.contracts = [];
  if (h.insurance) h.insurance = null;
  if (!h.jockey) h.jockey = jockeyName(new Rng(h.id));
  g.db.run("DELETE FROM entries WHERE horse_id = ? AND race_id IN (SELECT id FROM races WHERE status = 'open')", h.id);
  g.db.run("DELETE FROM league WHERE horse_id = ? AND season = ?", h.id, g.season().n);
  g.saveHorse(h, { price: null, market: 0, stud: null });
  g.tut(p, "compra");
  return { ok: true, horse: g.horseView(h, p.id) };
}

export function listForSale(g: Game, p: Player, hid: string, price: number | null) {
  const h = g.ownedHorse(p.id, hid);
  if (price === null) {
    g.saveHorse(h, { price: null, market: 0 });
    return { ok: true };
  }
  price = Math.round(Number(price));
  if (!(price >= 100 && price <= 5_000_000)) fail("Prezzo non valido (100 – 5.000.000 ƒ).");
  g.saveHorse(h, { price, market: 1 });
  return { ok: true };
}

export function quickSell(g: Game, p: Player, hid: string) {
  const h = g.ownedHorse(p.id, hid);
  if (h.cond.busy && h.cond.busy.until > g.now() && h.cond.busy.reason === "in gara") fail("Non puoi venderlo mentre corre!");
  const v = valuation(h, g.now());
  const pay = Math.round(v * 0.6);
  g.money(p.id, pay, `Svendita di ${h.name}`);
  h.ownerId = null;
  h.insurance = null;
  h.contracts = [];
  g.db.run("DELETE FROM entries WHERE horse_id = ? AND race_id IN (SELECT id FROM races WHERE status = 'open')", h.id);
  g.db.run("DELETE FROM league WHERE horse_id = ? AND season = ?", h.id, g.season().n);
  g.saveHorse(h, { price: Math.round(v * 1.1 / 50) * 50, market: 1, stud: null });
  return { ok: true, pay };
}

export function renameHorse(g: Game, p: Player, hid: string, name: string) {
  const h = g.ownedHorse(p.id, hid);
  const n = cleanText(name, 28);
  if (n.length < 2) fail("Nome troppo corto.");
  if (h.rec.starts > 0) fail("Si può cambiare nome solo prima della prima corsa.");
  h.name = n;
  g.saveHorse(h);
  return { ok: true };
}

export function upgradeStalls(g: Game, p: Player) {
  const cost = 6000 * (p.data.stalls - 3);
  if (p.data.stalls >= 20) fail("La scuderia è già al massimo (20 box).");
  g.money(p.id, -cost, "Nuovo box in scuderia");
  const pp = g.player(p.id)!;
  pp.data.stalls++;
  g.savePlayer(pp);
  return { ok: true, stalls: pp.data.stalls };
}

export function retireHorse(g: Game, p: Player, hid: string) {
  const h = g.ownedHorse(p.id, hid);
  h.retired = true;
  g.db.run("DELETE FROM entries WHERE horse_id = ? AND race_id IN (SELECT id FROM races WHERE status = 'open')", h.id);
  g.saveHorse(h);
  return { ok: true };
}

// ======================================================= riproduzione
export function setStud(g: Game, p: Player, hid: string, fee: number | null) {
  const h = g.ownedHorse(p.id, hid);
  if (h.sex !== "M") fail("Solo gli stalloni possono fare da riproduttori.");
  if (fee === null) {
    g.saveHorse(h, { stud: null });
    return { ok: true };
  }
  const why = canBreed(h, g.now());
  if (why) fail(`${h.name} ${why}.`);
  fee = Math.round(Number(fee));
  if (!(fee >= 100 && fee <= 500000)) fail("Tariffa non valida.");
  g.saveHorse(h, { stud: fee });
  return { ok: true };
}

export function studList(g: Game, viewer: string | null) {
  return g.db
    .all<{ data: string; stud_fee: number }>("SELECT data, stud_fee FROM horses WHERE stud_fee IS NOT NULL ORDER BY rating DESC LIMIT 60")
    .map((r) => {
      const h = JSON.parse(r.data) as Horse;
      if (h.dead) return null;
      const v = g.horseView(h, viewer);
      v.studFee = r.stud_fee;
      return v;
    })
    .filter(Boolean);
}

export function breed(g: Game, p: Player, mareId: string, sireId: string) {
  const mare = g.ownedHorse(p.id, mareId);
  if (mare.sex !== "F") fail("Serve una cavalla.");
  const why = canBreed(mare, g.now());
  if (why) fail(`${mare.name} ${why}.`);
  if (mare.cond.busy && mare.cond.busy.until > g.now()) fail(`${mare.name} è impegnata.`);
  const sire = g.horse(sireId);
  if (!sire || sire.sex !== "M" || sire.dead) fail("Stallone non valido.");
  const sw = canBreed(sire!, g.now());
  if (sw) fail(`${sire!.name} ${sw}.`);
  if (sire!.ownerId !== p.id) {
    const fee = g.db.one<{ stud_fee: number | null }>("SELECT stud_fee FROM horses WHERE id = ?", sire!.id)?.stud_fee;
    if (fee == null) fail("Questo stallone non è disponibile per la monta.");
    g.money(p.id, -fee!, `Monta di ${sire!.name}`);
    if (sire!.ownerId) {
      g.money(sire!.ownerId, Math.round(fee! * 0.9), `Monta di ${sire!.name} per ${mare.name}`);
      g.note(sire!.ownerId, "breed", `🐴 ${sire!.name} ha coperto ${mare.name} della scuderia "${p.stable}": incassi ${Math.round(fee! * 0.9)} ƒ.`);
    }
  }
  if (g.stallsUsed(p.id) >= p.data.stalls + 2) fail("La scuderia è troppo piena per un altro puledro.");
  const now = g.now();
  addFatigue(sire!, now, 15);
  g.saveHorse(sire!);
  mare.cond.pregnant = { until: now + GESTATION_MS, sireId: sire!.id, sireName: sire!.name };
  g.saveHorse(mare);
  g.schedule("birth", mare.id, now + GESTATION_MS);
  g.tut(p, "riproduzione");
  return { ok: true, due: now + GESTATION_MS };
}

// ======================================================= corse
export function enterRace(g: Game, p: Player, raceId: string, hid: string) {
  const r = g.race(raceId);
  if (!r) fail("Corsa inesistente.");
  if (r!.kind === "league") fail("Al campionato si partecipa iscrivendo il cavallo alla Lega (sezione Campionato).");
  if (r!.kind === "cup_final") fail("Alla finale si accede solo vincendo le batterie.");
  if (r!.kind === "tournament") fail("Per i tornei iscriviti dalla pagina del torneo.");
  if (r!.data.challenge) fail("È una sfida privata.");
  if (r!.kind === "friendly" && !r!.data.open && r!.data.creator !== p.id) fail("Amichevole privata.");
  const h = g.ownedHorse(p.id, hid);
  g.checkEligible(r!, h);
  if (r!.fee) g.money(p.id, -r!.fee, `Iscrizione a ${r!.name}`);
  g.addEntry(r!.id, h, p.id);
  g.tut(p, "iscrizione");
  return { ok: true };
}

const EQUIP_COST = { blinkers: 120, earplugs: 80, rainShoes: 150 };
export function setOrders(g: Game, p: Player, raceId: string, hid: string, o: any) {
  const r = g.race(raceId);
  if (!r || r.status !== "open" || g.now() > r.start_at - CLOSE_BEFORE) fail("Gli ordini si danno prima della chiusura.");
  const e = g.db.one<{ orders: string | null }>("SELECT orders FROM entries WHERE race_id = ? AND horse_id = ? AND owner = ?", raceId, hid, p.id);
  if (!e) fail("Il cavallo non è iscritto a questa corsa.");
  const prev = e!.orders ? JSON.parse(e!.orders) : {};
  const orders = {
    strategy: o?.strategy === null || o?.strategy === undefined || o?.strategy === "" ? null : clamp(Math.round(Number(o.strategy)), 0, 5),
    whip: ["mai", "normale", "tanta"].includes(o?.whip) ? o.whip : "normale",
    lane: ["auto", "corda", "esterno"].includes(o?.lane) ? o.lane : "auto",
    kick: ["presto", "normale", "tardi"].includes(o?.kick) ? o.kick : "normale",
    blinkers: !!o?.blinkers, earplugs: !!o?.earplugs, rainShoes: !!o?.rainShoes,
  };
  let cost = 0;
  for (const k of ["blinkers", "earplugs", "rainShoes"] as const) if (orders[k] && !prev[k]) cost += EQUIP_COST[k];
  if (cost) g.money(p.id, -cost, "Attrezzatura per la corsa");
  g.db.run("UPDATE entries SET orders = ? WHERE race_id = ? AND horse_id = ?", JSON.stringify(orders), raceId, hid);
  return { ok: true, orders, cost };
}

export function withdraw(g: Game, p: Player, raceId: string, hid: string) {
  const r = g.race(raceId);
  if (!r || r.status !== "open" || g.now() > r.start_at - CLOSE_BEFORE) fail("Non puoi più ritirarlo.");
  const e = g.db.one("SELECT 1 FROM entries WHERE race_id = ? AND horse_id = ? AND owner = ?", raceId, hid, p.id);
  if (!e) fail("Non è iscritto.");
  g.db.run("DELETE FROM entries WHERE race_id = ? AND horse_id = ?", raceId, hid);
  if (r!.fee) g.money(p.id, Math.round(r!.fee * 0.5), `Rimborso parziale ${r!.name}`);
  return { ok: true };
}

export function placeBet(g: Game, p: Player, raceId: string, hid: string, amount: number) {
  const r = g.race(raceId);
  if (!r || r.status !== "open" || g.now() > r.start_at - CLOSE_BEFORE) fail("Le scommesse sono chiuse.");
  amount = Math.round(Number(amount));
  if (!(amount >= 10 && amount <= 5000)) fail("Puntata tra 10 e 5.000 ƒ.");
  const tot = g.db.one<{ s: number }>("SELECT COALESCE(SUM(amount), 0) AS s FROM bets WHERE race_id = ? AND player = ?", raceId, p.id)!.s;
  if (tot + amount > 5000) fail("Massimo 5.000 ƒ di puntate per corsa.");
  const odds = g.odds(raceId).get(hid);
  if (!odds) fail("Cavallo non iscritto.");
  g.money(p.id, -amount, `Scommessa su ${r!.name}`);
  g.db.run("INSERT INTO bets (id, race_id, player, horse_id, amount, payout, created) VALUES (?, ?, ?, ?, ?, ?, ?)", g.newId("b"), raceId, p.id, hid, amount, Math.round(odds! * 100), g.now());
  g.tut(p, "scommessa");
  return { ok: true, odds };
}

export function leagueRegister(g: Game, p: Player, hid: string) {
  const h = g.ownedHorse(p.id, hid);
  if (h.retired) fail("È in pensione.");
  if (ageYears(h, g.now()) < 2) fail("È ancora un puledro.");
  const s = g.season();
  if (g.db.one("SELECT 1 FROM league WHERE season = ? AND horse_id = ?", s.n, h.id)) fail("È già iscritto al campionato.");
  const div = g.leagueDivisionFor(h);
  g.db.run("INSERT INTO league (season, horse_id, owner, division, joined) VALUES (?, ?, ?, ?, ?)", s.n, h.id, p.id, div, g.now());
  g.tut(p, "campionato");
  return { ok: true, division: DIVISIONS[div - 1] };
}

export function leagueLeave(g: Game, p: Player, hid: string) {
  g.db.run("DELETE FROM league WHERE season = ? AND horse_id = ? AND owner = ?", g.season().n, hid, p.id);
  return { ok: true };
}

// ---- amichevoli e sfide
export function quickFriendly(g: Game, p: Player, body: any) {
  const h = g.ownedHorse(p.id, body.horseId);
  const why = canRace(h, g.now());
  if (why) fail(`${h.name} non può correre: ${why}.`);
  const rng = new Rng(g.newId("f"));
  const c = g.conditions(rng, VENUE_OK(body.venue));
  const id = g.newId("f-");
  const start = g.now() + (body.open ? 5 * MIN : 100_000);
  const distance = clamp(Math.round(Number(body.distance) / 100) * 100 || 1600, 1000, 4000);
  const bots = clamp(Number(body.bots ?? 7), 0, 11);
  g.db.run(
    `INSERT INTO races (id, kind, name, start_at, status, venue, distance, going, weather, hurdles, class, purse, fee, max, ref, round, big, data, result, replay, duration)
     VALUES (?, 'friendly', ?, ?, 'open', ?, ?, ?, ?, ?, 0, 0, 0, 12, NULL, 0, 0, ?, NULL, NULL, 0)`,
    id, `Amichevole di ${p.stable}`, start, c.venue, distance, c.going, c.weather, body.hurdles ? 1 : 0,
    JSON.stringify({ minField: bots + 1, botQuality: clamp(Number(body.botLevel ?? 0.45), 0, 1), spectators: 0.15, dopingTest: 0, creator: p.id, open: !!body.open, desc: "Amichevole: niente premi, ma si impara." }),
  );
  g.addEntry(id, h, p.id);
  g.schedule("close", id, start - CLOSE_BEFORE);
  g.tut(p, "amichevole");
  return { ok: true, raceId: id, startAt: start };
}
const VENUE_OK = (v: any) => (typeof v === "string" && ["vesuvio", "dogi", "dolomiti", "tavoliere", "lanterna", "saline"].includes(v) ? v : undefined);

export function joinFriendly(g: Game, p: Player, raceId: string, hid: string) {
  const r = g.race(raceId);
  if (!r || r.kind !== "friendly" || !r.data.open) fail("Amichevole non disponibile.");
  const h = g.ownedHorse(p.id, hid);
  g.checkEligible(r!, h);
  g.addEntry(raceId, h, p.id);
  r!.data.minField = Math.max(r!.data.minField, g.raceEntries(raceId).length);
  g.saveRaceData(r!);
  return { ok: true };
}

export function challenge(g: Game, p: Player, body: any) {
  const mine = g.ownedHorse(p.id, body.horseId);
  const target = g.horse(body.targetId);
  if (!target || !target.ownerId || target.dead) fail("Puoi sfidare solo cavalli di altri giocatori.");
  if (target!.ownerId === p.id) fail("Non puoi sfidare te stesso.");
  const stake = clamp(Math.round(Number(body.stake) || 0), 0, 50000);
  if (stake) g.money(p.id, -stake, "Posta della sfida");
  const id = g.newId("c");
  g.db.run(
    "INSERT INTO challenges (id, from_player, from_horse, to_player, to_horse, stake, status, created, race_id, data) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?)",
    id, p.id, mine.id, target!.ownerId, target!.id, stake, g.now(), JSON.stringify({ distance: clamp(Number(body.distance) || 1600, 1000, 4000), bots: clamp(Number(body.bots ?? 0), 0, 10), venue: VENUE_OK(body.venue) ?? null }),
  );
  g.note(target!.ownerId, "challenge", `⚔️ La scuderia "${p.stable}" sfida ${target!.name} con ${mine.name}${stake ? ` — posta ${stake} ƒ` : ""}! Accetti?`, `/sfide`);
  return { ok: true, id };
}

export function answerChallenge(g: Game, p: Player, id: string, accept: boolean) {
  const ch = g.db.one<any>("SELECT * FROM challenges WHERE id = ? AND to_player = ? AND status = 'pending'", id, p.id);
  if (!ch) fail("Sfida non trovata.");
  if (!accept) {
    g.db.run("UPDATE challenges SET status = 'declined' WHERE id = ?", id);
    if (ch.stake) g.money(ch.from_player, ch.stake, "Sfida rifiutata: posta restituita");
    g.note(ch.from_player, "challenge", `La tua sfida è stata rifiutata.`);
    return { ok: true };
  }
  const a = g.horse(ch.from_horse), b = g.horse(ch.to_horse);
  if (!a || !b || a.dead || b.dead) fail("Uno dei cavalli non è disponibile.");
  for (const h of [a!, b!]) { const w = canRace(h, g.now()); if (w) fail(`${h.name} non può correre: ${w}.`); }
  if (ch.stake) g.money(p.id, -ch.stake, "Posta della sfida");
  const d = JSON.parse(ch.data);
  const rng = new Rng(id);
  const c = g.conditions(rng, d.venue ?? undefined);
  const rid = "s-" + id;
  const start = g.now() + 2 * MIN;
  g.db.run(
    `INSERT INTO races (id, kind, name, start_at, status, venue, distance, going, weather, hurdles, class, purse, fee, max, ref, round, big, data, result, replay, duration)
     VALUES (?, 'friendly', ?, ?, 'open', ?, ?, ?, ?, 0, 0, 0, 0, 12, NULL, 0, 0, ?, NULL, NULL, 0)`,
    rid, `Sfida: ${a!.name} contro ${b!.name}`, start, c.venue, d.distance, c.going, c.weather,
    JSON.stringify({ minField: 2 + d.bots, botQuality: 0.5, spectators: 0.3, dopingTest: 0, challenge: id, stake: ch.stake, desc: "Una sfida diretta tra due scuderie." }),
  );
  g.addEntry(rid, a!, ch.from_player);
  g.addEntry(rid, b!, ch.to_player);
  g.schedule("close", rid, start - CLOSE_BEFORE);
  g.db.run("UPDATE challenges SET status = 'accepted', race_id = ? WHERE id = ?", rid, id);
  g.note(ch.from_player, "challenge", `⚔️ Sfida accettata! ${a!.name} contro ${b!.name} fra 2 minuti.`, `/corsa/${rid}`);
  return { ok: true, raceId: rid };
}

// ---- tornei
export function createTournament(g: Game, p: Player, body: any) {
  const name = cleanText(body.name, 40);
  if (name.length < 3) fail("Dai un nome al torneo.");
  const cfg = validateConfig(body, g.now());
  const cost = 2000 + cfg.rounds * 200;
  g.money(p.id, -cost, `Organizzazione torneo ${name}`);
  const id = g.newId("t");
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  g.db.run(
    "INSERT INTO tournaments (id, name, owner, code, private, config, status, created, next_at, round) VALUES (?, ?, ?, ?, ?, ?, 'signup', ?, ?, 0)",
    id, name, p.id, code, body.private ? 1 : 0, JSON.stringify(cfg), g.now(), cfg.firstAt,
  );
  // bot partecipanti
  const bots = g.pickBots(cfg.bots, 900 + cfg.botLevel * 450, new Set(), cfg.firstAt);
  for (const b of bots) g.db.run("INSERT OR IGNORE INTO tmembers (tid, horse_id, owner) VALUES (?, ?, NULL)", id, b.id);
  g.schedule("tround", id, cfg.firstAt - 15 * MIN);
  if (body.horseId) joinTournament(g, p, id, body.horseId, code);
  g.tut(p, "torneo");
  return { ok: true, id, code };
}

export function joinTournament(g: Game, p: Player, idOrCode: string, hid: string, code?: string) {
  const t = g.db.one<any>("SELECT * FROM tournaments WHERE id = ? OR code = ?", idOrCode, String(idOrCode).toUpperCase());
  if (!t) fail("Torneo non trovato.");
  if (t.private && t.owner !== p.id && String(code ?? idOrCode).toUpperCase() !== t.code) fail("Questo torneo è privato: serve il codice.");
  if (t.status === "done") fail("Il torneo è finito.");
  const cfg = JSON.parse(t.config);
  const n = g.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM tmembers WHERE tid = ? AND owner IS NOT NULL", t.id)!.n;
  if (n >= cfg.maxHorses) fail("Torneo al completo.");
  const h = g.ownedHorse(p.id, hid);
  if (g.db.one("SELECT 1 FROM tmembers WHERE tid = ? AND horse_id = ?", t.id, h.id)) fail("Già iscritto.");
  if (cfg.fee) g.money(p.id, -cfg.fee, `Iscrizione torneo ${t.name}`);
  g.db.run("INSERT INTO tmembers (tid, horse_id, owner) VALUES (?, ?, ?)", t.id, h.id, p.id);
  // se una prova è già aperta, iscrivi subito
  const open = g.db.one<{ id: string }>("SELECT id FROM races WHERE ref = ? AND kind = 'tournament' AND status = 'open'", t.id);
  if (open && !canRace(h, g.now())) g.addEntry(open.id, h, p.id);
  if (t.owner !== p.id) g.note(t.owner, "tournament", `${p.stable} si è iscritto al tuo torneo "${t.name}" con ${h.name}.`);
  g.tut(p, "torneo");
  return { ok: true, id: t.id };
}

export function tournamentList(g: Game, p: Player | null) {
  const rows = g.db.all<any>("SELECT * FROM tournaments WHERE status != 'done' OR created > ? ORDER BY created DESC LIMIT 60", g.now() - 3 * DAY_MS);
  return rows
    .filter((t) => !t.private || (p && (t.owner === p.id || g.db.one("SELECT 1 FROM tmembers WHERE tid = ? AND owner = ?", t.id, p.id))))
    .map((t) => tournamentView(g, t, p));
}

export function tournamentDetail(g: Game, p: Player | null, id: string) {
  const t = g.db.one<any>("SELECT * FROM tournaments WHERE id = ? OR code = ?", id, String(id).toUpperCase());
  if (!t) fail("Torneo non trovato.");
  const v = tournamentView(g, t, p);
  const table = g.db.all<any>("SELECT m.*, h.data FROM tmembers m JOIN horses h ON h.id = m.horse_id WHERE m.tid = ? ORDER BY m.points DESC, m.wins DESC", t.id).map((r, k) => {
    const h = JSON.parse(r.data) as Horse;
    return { pos: k + 1, horseId: h.id, name: h.name, owner: r.owner, stable: g.stableName(h), points: r.points, races: r.races, wins: r.wins, look: h.look };
  });
  const races = g.db.all("SELECT id, name, start_at, status FROM races WHERE ref = ? AND kind = 'tournament' ORDER BY start_at", t.id);
  return { ...v, table, races };
}

function tournamentView(g: Game, t: any, p: Player | null) {
  const cfg = JSON.parse(t.config);
  const owner = g.player(t.owner);
  return {
    id: t.id, name: t.name, owner: t.owner, ownerStable: owner?.stable, private: !!t.private, code: p && p.id === t.owner ? t.code : null,
    status: t.status, round: t.round, nextAt: t.next_at, config: cfg,
    members: g.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM tmembers WHERE tid = ?", t.id)!.n,
  };
}

// ======================================================= bacheca ingaggi
export function board(g: Game, p: Player) {
  const now = g.now();
  const window = Math.floor(now / (6 * HOUR));
  if (p.data.boardWindow !== window) {
    const rng = new Rng(p.id + ":board:" + window);
    const offers = rollBoard(rng, p.data.rep);
    g.db.run("DELETE FROM offers WHERE player = ? AND status = 'open'", p.id);
    const horses = g.horsesOf(p.id).filter((h) => !h.retired);
    offers.forEach(({ tpl, pay }, k) => {
      let horseId: string | null = null;
      let price = pay;
      if (tpl.kind === "buyout") {
        if (!horses.length) return;
        const h = rng.pick(horses);
        horseId = h.id;
        price = Math.round((valuation(h, now) * pay) / 100 / 50) * 50;
      }
      g.db.run("INSERT OR REPLACE INTO offers (id, player, tpl, data, expires, status, horse_id) VALUES (?, ?, ?, ?, ?, 'open', ?)",
        `${p.id}-${window}-${k}`, p.id, tpl.id, JSON.stringify({ pay: price }), (window + 1) * 6 * HOUR, horseId);
    });
    p.data.boardWindow = window;
    g.savePlayer(p);
  }
  const rows = g.db.all<any>("SELECT * FROM offers WHERE player = ? AND (status = 'open' OR (status != 'open' AND expires > ?)) ORDER BY id", p.id, now - 6 * HOUR);
  g.tut(p, "bacheca");
  return {
    nextRefresh: (window + 1) * 6 * HOUR,
    offers: rows
      .filter((r) => r.expires > now || r.status !== "open")
      .map((r) => {
        const t = offerById(r.tpl);
        if (!t) return null;
        const h = r.horse_id ? g.horse(r.horse_id) : null;
        return {
          id: r.id, status: r.status, kind: t.kind, title: t.title, desc: t.desc, pay: JSON.parse(r.data).pay, hours: t.hours ?? 0, fatigue: t.fatigue ?? 0,
          risk: t.risk ?? 0, sex: t.sex ?? null, minAge: t.minAge ?? null, minOverall: t.minOverall ?? null, shady: !!t.shady, repay: t.repay ?? null,
          cond: t.cond ?? null, scandal: t.scandal ?? 0, penalty: t.penalty ?? 0, horseId: r.horse_id, horseName: h?.name ?? null,
          stims: t.stims ?? null, gains: t.gains ?? null, expires: r.expires,
        };
      })
      .filter(Boolean),
    total: OFFERS.length,
  };
}

export function acceptOffer(g: Game, p: Player, offerId: string, hid?: string) {
  const row = g.db.one<any>("SELECT * FROM offers WHERE id = ? AND player = ?", offerId, p.id);
  if (!row || row.status !== "open" || row.expires < g.now()) fail("Offerta non più disponibile.");
  const t = offerById(row.tpl)!;
  const pay = JSON.parse(row.data).pay as number;
  const now = g.now();
  const rng = new Rng(offerId + now);
  let text = "";
  if (t.kind === "loan") {
    const id = g.newId("l");
    const amount = Math.round(pay * (t.repay ?? 1.2));
    g.money(p.id, pay, t.title);
    const pp = g.player(p.id)!;
    pp.data.loans.push({ id, amount, due: now + (t.hours ?? 72) * HOUR, title: t.title });
    g.savePlayer(pp);
    g.schedule("loan", `${p.id}|${id}`, now + (t.hours ?? 72) * HOUR);
    text = `Hai ricevuto ${pay} ƒ. Dovrai restituirne ${amount}.`;
  } else {
    const h = g.ownedHorse(p.id, t.kind === "buyout" ? row.horse_id : String(hid));
    if (t.kind === "buyout") {
      if (h.cond.busy?.reason === "in gara") fail("Sta correndo!");
      g.money(p.id, pay, `${t.title}: ${h.name}`);
      h.ownerId = null;
      h.bot = true;
      h.insurance = null;
      h.botStable = t.id === "buy_sceicco" ? "Scuderia dello Sceicco" : t.id === "buy_rivale" ? "Scuderia Rivale" : t.id === "buy_film" ? "Cinecittà Cavalli" : t.id === "buy_maneggio" ? "Maneggio del Paese" : "Collezione Privata";
      g.db.run("DELETE FROM entries WHERE horse_id = ? AND race_id IN (SELECT id FROM races WHERE status = 'open')", h.id);
      g.db.run("DELETE FROM league WHERE horse_id = ?", h.id);
      g.saveHorse(h, { market: 0, price: null, stud: null });
      text = `${h.name} ora corre per "${h.botStable}". Incassati ${pay} ƒ.`;
    } else {
      if (t.sex && h.sex !== t.sex) fail(t.sex === "M" ? "Serve uno stallone." : "Serve una cavalla.");
      const age = ageYears(h, now);
      if (t.minAge && age < t.minAge) fail(`Serve un cavallo di almeno ${t.minAge} anni.`);
      if (t.minOverall && Math.round(require_overall(h)) < t.minOverall) fail(`Serve un cavallo di valore almeno ${t.minOverall}.`);
      if (t.kind !== "contract") {
        const block = canTrainBlock(h, now);
        if (block) fail(`${h.name} non è disponibile: ${block}.`);
        if (h.cond.pregnant) fail(`${h.name} è gravida.`);
      }
      if (t.kind === "contract") {
        if (h.retired) fail("È in pensione.");
        (h.contracts ??= []).push({ offer: offerId, tpl: t.id, pay, until: now + 2 * DAY_MS });
        text = `Contratto firmato: vale per la prossima corsa di ${h.name} (entro 48 ore).`;
      } else {
        g.money(p.id, pay, `${t.title} (${h.name})`);
        const hours = t.hours ?? 6;
        h.cond.busy = { until: now + hours * HOUR, reason: t.kind === "surrogate" ? "madre surrogata" : t.kind === "stud" ? "in monta" : t.title };
        if (t.fatigue) addFatigue(h, now, t.fatigue);
        if (t.morale) h.cond.morale = clamp(h.cond.morale + t.morale, 0, 100);
        const notes: string[] = [];
        if (t.stims) for (const [s, l] of Object.entries(t.stims) as [Stim, number][]) { const n = exposeStimulus(h.mind, s, h.stats.smarts, 0.7, l); if (n) notes.push(n); }
        if (t.gains) for (const [k, v] of Object.entries(t.gains) as [StatKey, number][]) h.stats[k] = clamp(Math.round((h.stats[k] + v) * 100) / 100, 5, h.potential[k]);
        if (t.risk && rng.chance(t.risk)) {
          h.cond.injury = { name: rng.pick(["contusione", "zoppia leggera", "ferita", "distorsione"]), until: now + (hours + rng.range(12, 36)) * HOUR };
          notes.push(`si è fatto male (${h.cond.injury.name})`);
        }
        if (t.rep) { const pp = g.player(p.id)!; pp.data.rep = clamp(pp.data.rep + t.rep, 0, 100); g.savePlayer(pp); }
        text = `${h.name} è impegnato per ${hours} ore. Incassati ${pay} ƒ.${notes.length ? " " + h.name + " " + notes.join("; ") + "." : ""}`;
      }
      g.saveHorse(h);
    }
  }
  g.db.run("UPDATE offers SET status = 'accepted', horse_id = COALESCE(horse_id, ?) WHERE id = ?", hid ?? null, offerId);
  g.note(p.id, "offer", `📋 ${t.title}: ${text}`);
  g.tut(p, "ingaggio");
  return { ok: true, text };
}

import { overall as require_overall } from "../sim/horse";

// ======================================================= allenamento
export function setPlan(g: Game, p: Player, hid: string, plan: any) {
  const h = g.ownedHorse(p.id, hid);
  const v = validatePlan(plan);
  if (!v) fail("Piano non valido.");
  h.plan = v!;
  g.saveHorse(h);
  g.tut(p, "allenamento");
  return { ok: true };
}

export function trainNow(g: Game, p: Player, hid: string, session: string, intensity: any) {
  const h = g.ownedHorse(p.id, hid);
  const now = g.now();
  const block = canTrainBlock(h, now);
  if (block) fail(`${h.name} non può allenarsi: ${block}.`);
  if (h.trainedAt && now - h.trainedAt < 12 * HOUR) fail(`${h.name} si è già allenato extra nelle ultime 12 ore.`);
  const i = INTENSITIES.find((x) => x.id === intensity)?.id ?? "normale";
  const cost = sessionCost(session, i);
  if (!SESSIONS.some((s) => s.id === session)) fail("Seduta sconosciuta.");
  if (cost) g.money(p.id, -cost, `Allenamento di ${h.name}`);
  const rep = applySession(new Rng(h.id + now), h, session, i, now);
  h.trainedAt = now;
  g.saveHorse(h);
  g.tut(p, "allenamento");
  return { ok: true, report: rep, horse: g.horseView(h, p.id) };
}

// ======================================================= mercato nero
export function orderCrime(g: Game, p: Player, body: any) {
  const svc = crimeById(body.service);
  if (!svc) fail("Servizio sconosciuto.");
  const now = g.now();
  if (p.data.crimeBan > now) fail("Dopo l'ultimo scandalo il mercato nero non ti risponde. Riprova più tardi.");
  const h = g.horse(body.targetId);
  if (!h || h.dead) fail("Bersaglio non valido.");
  g.tut(p, "mercato_nero");
  if (svc!.self) {
    if (h!.ownerId !== p.id) fail("Il doping si fa solo sui propri cavalli.");
    g.money(p.id, -svc!.cost, `Mercato nero: ${svc!.name}`);
    h!.cond.effects.push({ kind: svc!.id, until: now + 36 * HOUR });
    g.saveHorse(h!);
    return { ok: true, text: `${svc!.icon} ${h!.name} è stato trattato con ${svc!.name}. Vale per la prossima corsa (entro 36 ore). Occhio all'antidoping.` };
  }
  if (h!.ownerId === p.id) fail("Non puoi sabotare i tuoi cavalli (l'assicurazione se ne accorgerebbe).");
  const victim = h!.ownerId;
  const vsec = victim ? g.player(victim)?.data.security ?? 0 : 1;
  const intercept = SECURITY[vsec]?.intercept ?? 0;
  if (svc!.when === "gara") {
    const next = g.db.one<{ id: string; name: string; start_at: number }>(
      "SELECT r.id, r.name, r.start_at FROM entries e JOIN races r ON r.id = e.race_id WHERE e.horse_id = ? AND r.status = 'open' AND r.start_at > ? ORDER BY r.start_at LIMIT 1",
      h!.id, now + CLOSE_BEFORE,
    );
    if (!next) fail(`${h!.name} non è iscritto a nessuna corsa: il sicario non saprebbe dove trovarlo.`);
    const atMap: Record<string, number> = { presto: 0.3, meta: 0.5, curva: 0.72, rettilineo: 0.86 };
    const at = atMap[String(body.when)] ?? 0.6;
    g.money(p.id, -svc!.cost, `Mercato nero: ${svc!.name}`);
    g.db.run("INSERT INTO crimes (id, by_player, target_horse, target_owner, service, race_id, status, ts, data) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
      g.newId("x"), p.id, h!.id, victim, svc!.id, next!.id, now, JSON.stringify({ at }));
    return { ok: true, text: `${svc!.icon} Affare fatto. Il sicario sarà a bordo pista durante "${next!.name}". Non è detto che vada liscia.` };
  }
  // prima della corsa
  g.money(p.id, -svc!.cost, `Mercato nero: ${svc!.name}`);
  const rng = new Rng(g.newId("cr"));
  const crimeId = g.newId("x");
  if (rng.chance(intercept)) {
    g.db.run("INSERT INTO crimes (id, by_player, target_horse, target_owner, service, race_id, status, ts, data) VALUES (?, ?, ?, ?, ?, NULL, 'failed', ?, '{}')", crimeId, p.id, h!.id, victim, svc!.id, now);
    if (victim) g.note(victim, "crime", `🛡️ La sorveglianza ha messo in fuga qualcuno che si aggirava intorno al box di ${h!.name} (${svc!.name}).`);
    if (rng.chance(0.6)) g.punishCrime(p.id, svc!.name, svc!.cost, victim, h!.name, svc!.id === "killer" ? 2 : 1.5, svc!.id === "killer" ? 3 : 1);
    return { ok: true, text: `🚓 La sorveglianza di ${h!.name} ha fermato il tuo uomo. Soldi persi.` };
  }
  let text = "";
  switch (svc!.id) {
    case "killer": {
      if (rng.chance(0.45)) {
        g.killHorse(h!, "assassinato da un sicario", 1);
        text = `☠️ Il lavoro è fatto. ${h!.name} non correrà mai più.`;
      } else {
        h!.cond.health = clamp(h!.cond.health - 35, 0, 100);
        h!.cond.injury = { name: "ferite da aggressione", until: now + 2 * DAY_MS };
        exposeStimulus(h!.mind, "botti", h!.stats.smarts, 1, 1);
        exposeStimulus(h!.mind, "folla", h!.stats.smarts, 0.8, 0.8);
        g.saveHorse(h!);
        if (victim) g.note(victim, "crime", `😱 Qualcuno ha cercato di uccidere ${h!.name} stanotte! È sopravvissuto, ferito e traumatizzato.`, `/cavallo/${h!.id}`);
        text = `🩸 Il killer ha fallito: ${h!.name} è sopravvissuto, ferito e terrorizzato.`;
      }
      break;
    }
    case "incubi": {
      exposeStimulus(h!.mind, "botti", h!.stats.smarts, 0.9, 0.9);
      exposeStimulus(h!.mind, "folla", h!.stats.smarts, 0.7, 0.7);
      exposeStimulus(h!.mind, "luci", h!.stats.smarts, 0.7, 0.8);
      addFatigue(h!, now, 15);
      g.saveHorse(h!);
      text = `👻 Notte d'inferno per ${h!.name}: ora ha paura di botti, luci e folla.`;
      break;
    }
    case "biada_avariata": {
      addFatigue(h!, now, 35);
      h!.cond.health = clamp(h!.cond.health - 15, 0, 100);
      g.saveHorse(h!);
      text = `🤢 ${h!.name} ha mangiato la biada avariata.`;
      break;
    }
    default: {
      h!.cond.effects.push({ kind: svc!.id, until: now + 36 * HOUR, by: p.id, secret: true });
      g.saveHorse(h!);
      text = `${svc!.icon} Fatto: ${svc!.name} avrà effetto alla prossima corsa di ${h!.name}.`;
    }
  }
  const caught = rng.chance(svc!.caught);
  g.db.run("INSERT INTO crimes (id, by_player, target_horse, target_owner, service, race_id, status, ts, data) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, '{}')", crimeId, p.id, h!.id, victim, svc!.id, caught ? "caught" : "done", now);
  if (caught) g.punishCrime(p.id, svc!.name, svc!.cost, victim, h!.name, svc!.id === "killer" ? 2 : 2, svc!.id === "killer" ? 3 : 1);
  return { ok: true, text };
}

export function setSecurity(g: Game, p: Player, level: number) {
  level = clamp(Math.round(level), 0, 3);
  p.data.security = level;
  g.savePlayer(p);
  return { ok: true, level };
}

// ======================================================= indagini: detective e polizia
export function cases(g: Game, p: Player) {
  const rows = g.db.all<any>("SELECT * FROM crimes WHERE target_owner = ? AND ts > ? ORDER BY ts DESC LIMIT 40", p.id, g.now() - 10 * DAY_MS);
  return rows.map((c) => {
    const d = JSON.parse(c.data || "{}");
    const svc = crimeById(c.service);
    const h = g.horse(c.target_horse);
    const known = c.status === "caught" || d.solved;
    const culprit = known ? g.player(c.by_player) : null;
    return {
      id: c.id, ts: c.ts, service: svc?.name ?? c.service, icon: svc?.icon ?? "❓", horse: h?.name ?? "?", horseId: c.target_horse,
      status: c.status, solved: !!known, culprit: culprit ? `${culprit.stable} (${culprit.name})` : null,
      inv: d.inv ?? null, police: d.police ?? null, convicted: !!d.convicted || c.status === "caught",
    };
  });
}

export function investigate(g: Game, p: Player, crimeId: string, det: string) {
  const c = g.db.one<any>("SELECT * FROM crimes WHERE id = ? AND target_owner = ?", crimeId, p.id);
  if (!c) fail("Caso non trovato.");
  const d = JSON.parse(c.data || "{}");
  if (c.status === "caught" || d.solved) fail("Il colpevole è già noto.");
  if (d.inv && !d.inv.done) fail("C'è già un detective al lavoro.");
  const dt = DETECTIVES.find((x) => x.id === det);
  if (!dt) fail("Detective sconosciuto.");
  g.money(p.id, -dt!.cost, `Detective: ${dt!.name}`);
  d.inv = { det: dt!.id, name: dt!.name, until: g.now() + dt!.hours * HOUR, done: false };
  g.db.run("UPDATE crimes SET data = ? WHERE id = ?", JSON.stringify(d), crimeId);
  g.schedule("investigation", crimeId, d.inv.until);
  return { ok: true, text: `${dt!.icon} ${dt!.name} si mette al lavoro. Avrai notizie fra ${dt!.hours} ore.` };
}

export function reportPolice(g: Game, p: Player, crimeId: string) {
  const c = g.db.one<any>("SELECT * FROM crimes WHERE id = ? AND target_owner = ?", crimeId, p.id);
  if (!c) fail("Caso non trovato.");
  const d = JSON.parse(c.data || "{}");
  if (d.police && !d.police.done) fail("La denuncia è già stata presentata.");
  if (d.convicted || c.status === "caught") fail("Il colpevole è già stato punito.");
  d.police = { until: g.now() + (d.solved ? 2 : 24) * HOUR, done: false, withEvidence: !!d.solved };
  g.db.run("UPDATE crimes SET data = ? WHERE id = ?", JSON.stringify(d), crimeId);
  g.schedule("police", crimeId, d.police.until);
  return { ok: true, text: d.solved ? "👮 Denuncia presentata con le prove del detective: la polizia interviene entro 2 ore." : "👮 Denuncia presentata. Senza prove la polizia ci metterà un giorno, e non è detto che trovi qualcosa." };
}

// ======================================================= salute e assicurazioni
export function insure(g: Game, p: Player, hid: string, policy: string) {
  const h = g.ownedHorse(p.id, hid);
  const pol = POLICIES.find((x) => x.id === policy);
  if (!pol) fail("Polizza sconosciuta.");
  if (pol!.id === "nessuna") {
    h.insurance = null;
  } else {
    if (h.illness || (h.cond.injury && h.cond.injury.until > g.now())) fail("Nessuno assicura un cavallo malato o infortunato.");
    const value = valuation(h, g.now());
    g.money(p.id, -Math.round(value * pol!.daily), `Primo premio: ${pol!.name} per ${h.name}`);
    h.insurance = { policy: pol!.id, value, since: g.now() };
  }
  g.saveHorse(h);
  g.tut(p, "assicurazione");
  return { ok: true };
}

function vetRefund(g: Game, p: Player, h: Horse, cost: number, what: string) {
  const pol = h.insurance ? POLICIES.find((x) => x.id === h.insurance!.policy) : null;
  if (pol && pol.vet > 0) {
    const back = Math.round(cost * pol.vet);
    g.money(p.id, back, `Rimborso assicurazione: ${what}`);
    return back;
  }
  return 0;
}

export function diagnose(g: Game, p: Player, hid: string) {
  const h = g.ownedHorse(p.id, hid);
  if (!h.illness) {
    g.money(p.id, -Math.round(DIAGNOSIS_COST / 2), `Visita di controllo a ${h.name}`);
    return { ok: true, text: `Il veterinario ha visitato ${h.name}: è sano come un pesce.` };
  }
  g.money(p.id, -DIAGNOSIS_COST, `Diagnosi per ${h.name}`);
  const back = vetRefund(g, p, h, DIAGNOSIS_COST, "diagnosi");
  h.illness.diagnosed = true;
  g.saveHorse(h);
  const d = diseaseById(h.illness.id)!;
  g.tut(p, "clinica");
  return { ok: true, text: `Diagnosi: ${d.name} (gravità ${d.severity}/5).${d.contagious ? " È contagiosa: attenzione agli altri cavalli!" : ""}${back ? ` L'assicurazione rimborsa ${back} ƒ.` : ""}`, disease: d };
}

export function treat(g: Game, p: Player, hid: string, tid: string) {
  const h = g.ownedHorse(p.id, hid);
  const tr = TREATMENTS.find((x) => x.id === tid);
  if (!tr) fail("Cura sconosciuta.");
  if (!h.illness) fail(`${h.name} non è malato.`);
  const ill = h.illness!;
  if (ill.treatment) fail("È già in cura.");
  if (!ill.diagnosed && tr!.id !== "omeopatia") fail("Prima serve la diagnosi del veterinario.");
  const d = diseaseById(ill.id)!;
  const cost = Math.round(tr!.cost * (0.6 + d.severity * 0.25));
  g.money(p.id, -cost, `${tr!.name} per ${h.name}`);
  const back = vetRefund(g, p, h, cost, tr!.name);
  const now = g.now();
  const rng = new Rng(h.id + now);
  const baseDays = rng.range(d.days[0], d.days[1]);
  let text = "";
  if (rng.chance(tr!.success)) {
    const days = baseDays / tr!.speed;
    ill.treatment = tr!.id;
    ill.until = now + days * DAY_MS;
    if (tr!.hospital) h.cond.busy = { until: ill.until, reason: "ricoverato in clinica" };
    g.schedule("heal", h.id, ill.until);
    text = `${tr!.name}: ${h.name} guarirà in circa ${Math.max(1, Math.round(days * 24))} ore.`;
    if (tr!.id === "sperimentale") {
      const side = applyTrial(rng, h, { id: "cura", name: "cura", desc: "", pay: [0, 0], days: 0, risks: { statUp: 0.25, statDown: 0.2, quirk: 0.15 } });
      if (side.notes.length) text += ` Effetti della cura sperimentale: ${side.notes.join("; ")}.`;
    }
  } else {
    h.cond.health = clamp(h.cond.health - 10, 0, 100);
    ill.untreatedDays++;
    text = `${tr!.name} non ha funzionato. ${h.name} sta peggio.`;
    if (tr!.id === "sperimentale" && rng.chance(0.08)) {
      g.saveHorse(h);
      g.killHorse(h, "complicazioni della cura sperimentale", 0);
      return { ok: true, text: `💀 La cura sperimentale ha avuto complicazioni fatali. ${h.name} è morto.` };
    }
  }
  if (back) text += ` L'assicurazione rimborsa ${back} ƒ.`;
  g.saveHorse(h);
  g.tut(p, "clinica");
  return { ok: true, text };
}

export function joinTrial(g: Game, p: Player, hid: string, trialId: string) {
  const h = g.ownedHorse(p.id, hid);
  const t = trialById(trialId);
  if (!t) fail("Sperimentazione sconosciuta.");
  const now = g.now();
  const block = canTrainBlock(h, now);
  if (block) fail(`${h.name} non è disponibile: ${block}.`);
  const rng = new Rng(h.id + trialId + Math.floor(now / HOUR));
  const pay = Math.round(rng.range(t!.pay[0], t!.pay[1]) / 50) * 50;
  g.money(p.id, pay, `Sperimentazione: ${t!.name}`);
  h.cond.busy = { until: now + t!.days * DAY_MS, reason: `in laboratorio (${t!.name})` };
  const res = applyTrial(rng, h, t!);
  let text = `🧪 ${h.name} partecipa a "${t!.name}": incassi ${pay} ƒ.`;
  if (res.notes.length) text += ` Risultati: ${res.notes.join("; ")}.`;
  if (res.illness) {
    h.illness = { id: res.illness.id, since: now, diagnosed: true, treatment: null, until: null, untreatedDays: 0 };
    text += ` Purtroppo ha contratto: ${res.illness.name}.`;
  }
  g.saveHorse(h);
  if (res.died) {
    g.killHorse(h, `sperimentazione "${t!.name}"`, 0);
    text += ` 💀 Reazione fatale: ${h.name} non ce l'ha fatta (le sperimentazioni non sono coperte dall'assicurazione).`;
  }
  g.note(p.id, "lab", text, `/cavallo/${h.id}`);
  g.tut(p, "laboratorio");
  return { ok: true, text };
}

// ======================================================= posta tra giocatori
export function findPlayer(g: Game, who: string): Player | null {
  const w = cleanText(who, 40);
  const r = g.db.one<any>("SELECT * FROM players WHERE id = ? OR lower(stable) = lower(?) OR lower(name) = lower(?) LIMIT 1", w, w, w);
  return r ? g.rowToPlayer(r) : null;
}

export function sendMail(g: Game, p: Player, b: any) {
  const to = findPlayer(g, String(b.to ?? ""));
  if (!to) fail("Destinatario non trovato (scrivi il nome della scuderia).");
  if (to!.id === p.id) fail("Non puoi scrivere a te stesso.");
  const sent = g.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM mail WHERE sender = ? AND ts > ?", p.id, g.now() - HOUR)!.n;
  if (sent >= 30) fail("Hai mandato troppe lettere: aspetta un po'.");
  const subject = cleanText(b.subject, 80) || "(senza oggetto)";
  const body = cleanText(b.body, 2000);
  const money = Math.max(0, Math.round(Number(b.money) || 0));
  const request = Math.max(0, Math.round(Number(b.request) || 0));
  if (money > 1_000_000 || request > 1_000_000) fail("Cifra troppo alta.");
  let horseName: string | null = null;
  let horseId: string | null = null;
  if (b.horseId) {
    const h = g.ownedHorse(p.id, String(b.horseId));
    if (h.cond.busy?.reason === "in gara") fail("Non puoi spedirlo mentre corre.");
    if (g.stallsUsed(to!.id) >= to!.data.stalls) fail(`${to!.stable} non ha box liberi.`);
    h.ownerId = to!.id;
    h.contracts = [];
    h.insurance = null;
    g.db.run("DELETE FROM entries WHERE horse_id = ? AND race_id IN (SELECT id FROM races WHERE status = 'open')", h.id);
    g.db.run("DELETE FROM league WHERE horse_id = ? AND season = ?", h.id, g.season().n);
    g.saveHorse(h, { price: null, market: 0, stud: null });
    horseName = h.name;
    horseId = h.id;
  }
  if (money) {
    g.money(p.id, -money, `Posta: soldi a ${to!.stable}`);
    g.money(to!.id, money, `Posta: soldi da ${p.stable}`);
  }
  const id = g.newId("m");
  g.db.run(
    "INSERT INTO mail (id, sender, recipient, ts, subject, body, money, horse_id, horse_name, request, status, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
    id, p.id, to!.id, g.now(), subject, body, money, horseId, horseName, request, request ? "request" : "sent",
  );
  const extra = [money ? `💰 ${money} ƒ` : "", horseName ? `🐴 ${horseName}` : "", request ? `🙏 chiede ${request} ƒ` : ""].filter(Boolean).join(" · ");
  g.note(to!.id, "mail", `✉️ Posta da "${p.stable}": ${subject}${extra ? " — " + extra : ""}`, "/posta");
  return { ok: true, text: `Lettera spedita a ${to!.stable}.` };
}

export function inbox(g: Game, p: Player) {
  const rows = g.db.all<any>("SELECT * FROM mail WHERE recipient = ? OR sender = ? ORDER BY ts DESC LIMIT 80", p.id, p.id);
  const names = new Map<string, string>();
  const nm = (id: string) => {
    if (!names.has(id)) names.set(id, g.db.one<{ stable: string }>("SELECT stable FROM players WHERE id = ?", id)?.stable ?? "?");
    return names.get(id)!;
  };
  return rows.map((m) => ({ ...m, mine: m.sender === p.id, fromName: nm(m.sender), toName: nm(m.recipient) }));
}

export function mailRead(g: Game, p: Player, id: string) {
  g.db.run("UPDATE mail SET read = 1 WHERE id = ? AND recipient = ?", id, p.id);
  return { ok: true };
}

export function mailPay(g: Game, p: Player, id: string, accept: boolean) {
  const m = g.db.one<any>("SELECT * FROM mail WHERE id = ? AND recipient = ? AND status = 'request'", id, p.id);
  if (!m) fail("Richiesta non trovata.");
  if (accept) {
    g.money(p.id, -m.request, `Pagamento richiesto da posta`);
    g.money(m.sender, m.request, `Pagamento ricevuto da ${p.stable}`);
    g.note(m.sender, "mail", `💰 "${p.stable}" ha pagato la tua richiesta di ${m.request} ƒ.`, "/posta");
  } else g.note(m.sender, "mail", `🙅 "${p.stable}" ha rifiutato la tua richiesta di ${m.request} ƒ.`, "/posta");
  g.db.run("UPDATE mail SET status = ?, read = 1 WHERE id = ?", accept ? "paid" : "declined", id);
  return { ok: true };
}

// ======================================================= chat
export function chat(g: Game, p: Player, text: string) {
  const t = cleanText(text, 300);
  if (!t) fail("Messaggio vuoto.");
  const last = g.db.one<{ ts: number }>("SELECT ts FROM chat WHERE player = ? ORDER BY id DESC LIMIT 1", p.id);
  if (last && g.now() - last.ts < 1500) fail("Piano, piano!");
  g.db.run("INSERT INTO chat (ts, player, name, text) VALUES (?, ?, ?, ?)", g.now(), p.id, `${p.name} (${p.stable})`, t);
  g.emit(null, { t: "chat", msg: { ts: g.now(), player: p.id, name: `${p.name} (${p.stable})`, text: t } });
  return { ok: true };
}

// ======================================================= cataloghi per l'interfaccia
export function catalogs() {
  return {
    sessions: SESSIONS, intensities: INTENSITIES, crimes: CRIMES, security: SECURITY, diseases: DISEASES.map((d) => ({ id: d.id, name: d.name, severity: d.severity, contagious: d.contagious > 0 })),
    treatments: TREATMENTS, trials: TRIALS, detectives: DETECTIVES, policies: POLICIES, diagnosisCost: DIAGNOSIS_COST, divisions: DIVISIONS, classes: CLASS_INFO,
    stats: STAT_KEYS,
  };
}

export { nextSlot, botSilks };
