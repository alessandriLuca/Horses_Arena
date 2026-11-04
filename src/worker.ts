// Worker + Durable Object "World": un unico mondo condiviso da tutti i giocatori.
import { DurableObject } from "cloudflare:workers";
import { doDb } from "./game/db";
import { Game, GameError, CLOSE_BEFORE, DIVISIONS, type Player } from "./game/world";
import * as A from "./game/actions";
import { canRace, valuation, overall } from "./sim/horse";
import { quirkCatalog } from "./sim/quirks";
import { OFFERS } from "./game/offers";
import { VENUES } from "../public/js/shared/track.js";
import { assistantChat } from "./game/assistant";

export interface Env {
  WORLD: DurableObjectNamespace<World>;
  ASSETS: Fetcher;
  AI?: Ai;
  AI_DISABLED?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export class World extends DurableObject<Env> {
  game: Game;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.game = new Game(doDb(ctx.storage.sql), Date.now, (pid, msg) => this.emit(pid, msg));
    ctx.blockConcurrencyWhile(async () => {
      this.game.init();
      await this.arm();
    });
  }

  emit(pid: string | null, msg: any) {
    const data = JSON.stringify(msg);
    const sockets = pid ? this.ctx.getWebSockets(pid) : this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(data);
      } catch {
        /* chiuso */
      }
    }
  }

  async arm() {
    const next = this.game.nextJobAt();
    if (next === null) return;
    const cur = await this.ctx.storage.getAlarm();
    const at = Math.max(next, Date.now() + 200);
    if (cur === null || at < cur) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const t0 = Date.now();
    // esegui i lavori scaduti, ma senza superare qualche secondo di CPU
    while (Date.now() - t0 < 6000) {
      if (this.game.runDue(4) === 0) break;
    }
    const next = this.game.nextJobAt();
    if (next !== null) await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 200));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/ws") return this.openSocket(request, url);
    try {
      const res = await this.route(request, url);
      await this.arm();
      return res;
    } catch (e) {
      if (e instanceof GameError) return json({ error: e.message }, 400);
      console.error(e);
      return json({ error: "Errore interno: " + (e as Error).message }, 500);
    }
  }

  openSocket(request: Request, url: URL): Response {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "serve un websocket" }, 400);
    const token = url.searchParams.get("token") ?? "";
    const p = token ? this.game.playerByToken(token) : null;
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [p ? p.id : "anon"]);
    pair[1].send(JSON.stringify({ t: "hello", online: this.ctx.getWebSockets().length, now: Date.now() }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    let m: any;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    if (m.t === "ping") ws.send(JSON.stringify({ t: "pong", now: Date.now(), online: this.ctx.getWebSockets().length }));
  }

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {
      /* già chiuso */
    }
  }

  // ------------------------------------------------------------------ API
  auth(request: Request): Player | null {
    const h = request.headers.get("authorization") ?? "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    return token ? this.game.playerByToken(token) : null;
  }

  async route(request: Request, url: URL): Promise<Response> {
    const g = this.game;
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method;
    const body: any = method === "POST" ? await request.json().catch(() => ({})) : {};
    const p = this.auth(request);
    const need = (): Player => {
      if (!p) throw new GameError("Devi entrare con la tua scuderia.");
      return p;
    };
    const seg = path.split("/").filter(Boolean);
    const now = Date.now();

    // ---------- pubbliche
    if (path === "/_tick") return json({ ok: true, ran: g.runDue(10) });
    if (path === "/state" && method === "GET") {
      const upcoming = this.upcoming(now, now + 3 * 3600_000, 40);
      const live = g.db.all<any>("SELECT id, name, start_at, duration, kind FROM races WHERE status IN ('closed','done') AND start_at <= ? AND start_at + duration * 1000 + 5000 >= ?", now + 25000, now);
      return json({
        now, season: g.season(), online: this.ctx.getWebSockets().length,
        players: g.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM players")!.n,
        upcoming, live, venues: VENUES,
      });
    }
    if (path === "/assistant/status") return json({ enabled: this.aiEnabled() });
    if (path === "/register" && method === "POST") return json(A.register(g, body));
    if (path === "/login" && method === "POST") return json(A.login(g, body));
    if (path === "/catalog") return json({ ...A.catalogs(), quirks: quirkCatalog(), offers: OFFERS.length, venues: VENUES, divisions: DIVISIONS });
    if (path === "/market" && method === "GET") return json({ horses: g.marketList() });
    if (path === "/stud" && method === "GET") return json({ horses: A.studList(g, p?.id ?? null) });
    if (path === "/races" && method === "GET") {
      const from = Number(url.searchParams.get("from")) || now - 6 * 3600_000;
      const to = Number(url.searchParams.get("to")) || now + 24 * 3600_000;
      return json({ races: this.upcoming(from, to, 400, true), now });
    }
    if (seg[0] === "race" && seg[1] && seg.length === 2) return json(this.raceDetail(seg[1], p));
    if (seg[0] === "race" && seg[1] && seg[2] === "replay") {
      const r = g.db.one<{ replay: string | null; start_at: number; status: string }>("SELECT replay, start_at, status FROM races WHERE id = ?", seg[1]);
      if (!r) return json({ error: "corsa inesistente" }, 404);
      if (!r.replay) return json({ error: r.status === "done" ? "Il filmato di questa corsa non è più disponibile." : "La corsa non è ancora partita." }, 404);
      if (now < r.start_at - 25000) return json({ error: "La corsa non è ancora partita.", startAt: r.start_at }, 425);
      return new Response(r.replay, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": r.status === "done" ? "public, max-age=3600" : "no-store" } });
    }
    if (seg[0] === "horse" && seg[1] && seg.length === 2 && method === "GET") {
      const h = g.horse(seg[1]);
      if (!h) return json({ error: "cavallo inesistente" }, 404);
      const v = g.horseView(h, p?.id ?? null);
      v.races = g.db.all("SELECT r.id, r.name, r.start_at, r.status, r.distance, r.venue FROM entries e JOIN races r ON r.id = e.race_id WHERE e.horse_id = ? ORDER BY r.start_at DESC LIMIT 25", h.id);
      v.league = g.db.one("SELECT division, points, races, wins FROM league WHERE season = ? AND horse_id = ?", g.season().n, h.id);
      return json(v);
    }
    if (path === "/league" && method === "GET") {
      const s = Number(url.searchParams.get("season")) || g.season().n;
      const div = Math.max(1, Math.min(4, Number(url.searchParams.get("div")) || 1));
      return json({ season: g.season(), viewSeason: s, div, name: DIVISIONS[div - 1], table: g.standings(s, div) });
    }
    if (path === "/tournaments" && method === "GET") return json({ tournaments: A.tournamentList(g, p) });
    if (seg[0] === "tournament" && seg[1] && method === "GET") return json(A.tournamentDetail(g, p, seg[1]));
    if (path === "/chat" && method === "GET") return json({ messages: g.db.all("SELECT ts, player, name, text FROM chat ORDER BY id DESC LIMIT 60").reverse() });
    if (path === "/leaderboard") return json(this.leaderboard());
    if (seg[0] === "stable" && seg[1]) return json(this.stable(seg[1], p));
    if (path === "/search") {
      const q = `%${(url.searchParams.get("q") ?? "").slice(0, 30)}%`;
      const rows = g.db.all<{ data: string }>("SELECT data FROM horses WHERE owner IS NOT NULL AND json_extract(data, '$.name') LIKE ? ORDER BY rating DESC LIMIT 20", q);
      return json({ horses: rows.map((r) => g.horseView(JSON.parse(r.data), p?.id ?? null)).filter((h: any) => !h.dead) });
    }

    // ---------- con login
    const me = need();
    if (path === "/me" && method === "GET") return json(A.me(g, me));
    if (path === "/me" && method === "POST") return json(A.updateProfile(g, me, body));
    if (path === "/notes/seen") return json(A.seenNotes(g, me));
    if (path === "/tutorial") return json(A.markTutorial(g, me, body.step));
    if (path === "/market/buy") return json(A.buyHorse(g, me, body.horseId));
    if (path === "/market/list") return json(A.listForSale(g, me, body.horseId, body.price ?? null));
    if (path === "/market/quicksell") return json(A.quickSell(g, me, body.horseId));
    if (path === "/stalls") return json(A.upgradeStalls(g, me));
    if (path === "/breed") return json(A.breed(g, me, body.mareId, body.sireId));
    if (path === "/league/join") return json(A.leagueRegister(g, me, body.horseId));
    if (path === "/league/leave") return json(A.leagueLeave(g, me, body.horseId));
    if (path === "/friendly") return json(A.quickFriendly(g, me, body));
    if (seg[0] === "friendly" && seg[2] === "join") return json(A.joinFriendly(g, me, seg[1], body.horseId));
    if (path === "/challenge") return json(A.challenge(g, me, body));
    if (seg[0] === "challenge" && seg[1]) return json(A.answerChallenge(g, me, seg[1], !!body.accept));
    if (path === "/tournament") return json(A.createTournament(g, me, body));
    if (path === "/tournament/join") return json(A.joinTournament(g, me, body.id ?? body.code, body.horseId, body.code));
    if (path === "/offers" && method === "GET") return json(A.board(g, me));
    if (path === "/offers/accept") return json(A.acceptOffer(g, me, body.offerId, body.horseId));
    if (path === "/crime") return json(A.orderCrime(g, me, body));
    if (path === "/security") return json(A.setSecurity(g, me, Number(body.level)));
    if (path === "/mail" && method === "GET") return json({ mail: A.inbox(g, me) });
    if (path === "/mail" && method === "POST") return json(A.sendMail(g, me, body));
    if (seg[0] === "mail" && seg[1] && seg[2] === "read") return json(A.mailRead(g, me, seg[1]));
    if (seg[0] === "mail" && seg[1] && seg[2] === "pay") return json(A.mailPay(g, me, seg[1], !!body.accept));
    if (path === "/cases" && method === "GET") return json({ cases: A.cases(g, me) });
    if (path === "/investigate") return json(A.investigate(g, me, body.crimeId, body.detective));
    if (path === "/police") return json(A.reportPolice(g, me, body.crimeId));
    if (path === "/chat" && method === "POST") return json(A.chat(g, me, body.text));
    if (path === "/assistant" && method === "POST") {
      if (!this.aiEnabled()) throw new GameError("L'assistente non è attivo su questo server (serve Cloudflare Workers AI).");
      const history = Array.isArray(body.messages) ? body.messages : [];
      try {
        return json(await assistantChat(g, this.env.AI!, me, history, String(body.lang ?? "it")));
      } catch (e) {
        if (e instanceof GameError) throw e;
        console.error("AI", e);
        throw new GameError("Nonna Pina non risponde: il servizio AI ha dato errore. Riprova fra poco.");
      }
    }
    if (seg[0] === "race" && seg[1] && method === "POST") {
      if (seg[2] === "enter") return json(A.enterRace(g, me, seg[1], body.horseId));
      if (seg[2] === "withdraw") return json(A.withdraw(g, me, seg[1], body.horseId));
      if (seg[2] === "bet") return json(A.placeBet(g, me, seg[1], body.horseId, body.amount));
      if (seg[2] === "orders") return json(A.setOrders(g, me, seg[1], body.horseId, body.orders));
    }
    if (seg[0] === "horse" && seg[1] && method === "POST") {
      const id = seg[1];
      switch (seg[2]) {
        case "rename": return json(A.renameHorse(g, me, id, body.name));
        case "retire": return json(A.retireHorse(g, me, id));
        case "plan": return json(A.setPlan(g, me, id, body.plan));
        case "train": return json(A.trainNow(g, me, id, body.session, body.intensity));
        case "insure": return json(A.insure(g, me, id, body.policy));
        case "diagnose": return json(A.diagnose(g, me, id));
        case "treat": return json(A.treat(g, me, id, body.treatment));
        case "trial": return json(A.joinTrial(g, me, id, body.trial));
        case "stud": return json(A.setStud(g, me, id, body.fee ?? null));
      }
    }
    return json({ error: "non trovato" }, 404);
  }

  aiEnabled() {
    return !!this.env.AI && this.env.AI_DISABLED !== "1";
  }

  upcoming(from: number, to: number, limit: number, withDone = false) {
    const g = this.game;
    const rows = g.db.all<any>(
      `SELECT r.id, r.kind, r.name, r.start_at, r.status, r.venue, r.distance, r.going, r.weather, r.hurdles, r.purse, r.fee, r.big, r.duration, r.data,
        (SELECT COUNT(*) FROM entries e WHERE e.race_id = r.id) AS n,
        (SELECT COUNT(*) FROM entries e WHERE e.race_id = r.id AND e.owner IS NOT NULL) AS humans
       FROM races r WHERE r.start_at BETWEEN ? AND ? AND r.status ${withDone ? "!= 'void'" : "IN ('open','closed')"} ORDER BY r.start_at LIMIT ?`,
      from, to, limit,
    );
    return rows.map((r) => {
      const d = JSON.parse(r.data);
      return {
        id: r.id, kind: r.kind, name: r.name, startAt: r.start_at, status: r.status, venue: r.venue, distance: r.distance, going: r.going, weather: r.weather,
        hurdles: !!r.hurdles, purse: r.purse, fee: r.fee, big: !!r.big, duration: r.duration, entries: r.n, humans: r.humans, cls: d.cls ?? null,
        open: d.open ?? null, private: r.kind === "friendly" && !d.open, division: d.division ?? null, desc: d.desc ?? "",
      };
    });
  }

  raceDetail(id: string, p: Player | null) {
    const g = this.game;
    const r = g.race(id);
    if (!r) throw new GameError("Corsa inesistente.");
    const now = Date.now();
    const odds = r.status === "open" ? g.odds(id) : new Map<string, number>();
    const entries = g.raceEntries(id).map((e) => {
      const v = g.horseView(e.horse, p?.id ?? null);
      return {
        id: v.id, name: v.name, stable: v.stable, silks: v.silks, look: v.look, owner: e.owner, rating: v.rating, form: v.rec.form.slice(0, 5),
        age: v.age, sex: v.sex, quirks: v.quirks, hidden: v.hiddenQuirks, odds: odds.get(v.id) ?? null, mine: !!p && e.owner === p.id, fatigue: v.cond.fatigue, jockey: v.jockey,
        orders: p && e.owner === p.id ? e.orders : undefined, prefs: p && e.owner === p.id ? v.mind?.prefs : undefined,
      };
    });
    const finished = r.status === "done";
    const bets = p ? g.db.all("SELECT horse_id, amount, payout FROM bets WHERE race_id = ? AND player = ?", id, p.id) : [];
    const eligible = p && r.status === "open" && now < r.start_at - CLOSE_BEFORE
      ? g.horsesOf(p.id).filter((h) => !canRace(h, now)).map((h) => ({ id: h.id, name: h.name, rating: Math.round(h.rating) }))
      : [];
    const d = r.data;
    return {
      id: r.id, kind: r.kind, name: r.name, startAt: r.start_at, status: r.status, venue: r.venue, distance: r.distance, going: r.going, weather: r.weather,
      hurdles: !!r.hurdles, purse: r.purse, fee: r.fee, big: !!r.big, duration: r.duration, closeAt: r.start_at - CLOSE_BEFORE,
      cls: d.cls ?? null, desc: d.desc ?? "", division: d.division ?? null, tournament: d.tournament ?? null, open: d.open ?? null, creator: d.creator ?? null,
      entries, result: finished ? r.result : null, bets, eligible, now,
      replayAt: r.start_at - 20000,
    };
  }

  leaderboard() {
    const g = this.game;
    const now = Date.now();
    const players = g.db.all<any>("SELECT id, name, stable, silks, money, data FROM players").map((pr) => {
      const hs = g.horsesOf(pr.id);
      const value = hs.reduce((a, h) => a + valuation(h, now), 0);
      const d = JSON.parse(pr.data);
      return { id: pr.id, name: pr.name, stable: pr.stable, silks: JSON.parse(pr.silks), money: pr.money, value, total: pr.money + value, wins: d.wins ?? 0, races: d.races ?? 0, earnings: d.earnings ?? 0, rep: d.rep ?? 50, horses: hs.length };
    });
    const horses = g.db.all<{ data: string }>("SELECT data FROM horses ORDER BY rating DESC LIMIT 40").map((r) => JSON.parse(r.data)).filter((h) => !h.dead)
      .slice(0, 25).map((h) => ({ id: h.id, name: h.name, rating: Math.round(h.rating), stable: g.stableName(h), wins: h.rec.wins, starts: h.rec.starts, earnings: h.rec.earnings, overall: Math.round(overall(h)), look: h.look, bot: !!h.bot }));
    return {
      richest: players.sort((a, b) => b.total - a.total).slice(0, 25),
      winners: players.slice().sort((a, b) => b.wins - a.wins).slice(0, 25),
      horses,
    };
  }

  stable(pid: string, viewer: Player | null) {
    const g = this.game;
    const pl = g.player(pid);
    if (!pl) throw new GameError("Scuderia inesistente.");
    return {
      id: pl.id, name: pl.name, stable: pl.stable, silks: pl.silks, rep: pl.data.rep, wins: pl.data.wins, races: pl.data.races, earnings: pl.data.earnings,
      created: pl.created, horses: g.horsesOf(pl.id, true).map((h) => g.horseView(h, viewer?.id ?? null)),
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const stub = env.WORLD.get(env.WORLD.idFromName("mondo"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_c: ScheduledController, env: Env) {
    const stub = env.WORLD.get(env.WORLD.idFromName("mondo"));
    await stub.fetch("https://interno/api/_tick");
  },
};
