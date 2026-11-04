// Assistente "Nonna Pina, segretaria di scuderia": parla col giocatore e FA le cose al posto suo,
// usando Cloudflare Workers AI con function calling. Se il binding AI non c'è, la funzione è spenta.
import { Game, GameError, CLOSE_BEFORE, DIVISIONS, type Player } from "./world";
import * as A from "./actions";
import { canRace, valuation, currentFatigue } from "../sim/horse";
import { SESSIONS } from "./training";

export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const LANG_NAME: Record<string, string> = { it: "italiano", en: "English", de: "Deutsch", ru: "русский", ja: "日本語", zh: "中文" };

const TOOLS = [
  { name: "stato_scuderia", description: "Soldi, box e lista dei cavalli del giocatore con stato (fatica, se può correre, infortuni).", parameters: { type: "object", properties: {} } },
  { name: "info_cavallo", description: "Dettagli di un cavallo del giocatore: statistiche, quirk scoperti, cosa ha imparato.", parameters: { type: "object", properties: { nome: { type: "string", description: "nome (anche parziale) del cavallo" } }, required: ["nome"] } },
  { name: "prossime_corse", description: "Corse in programma nelle prossime ore con id, orario (ora italiana), tipo, classe, distanza, premio e iscrizione.", parameters: { type: "object", properties: { ore: { type: "number", description: "quante ore avanti guardare (default 3)" }, tipo: { type: "string", description: "open, league, cup, gp, friendly (opzionale)" } } } },
  { name: "iscrivi_cavallo", description: "Iscrive un cavallo del giocatore a una corsa.", parameters: { type: "object", properties: { nome_cavallo: { type: "string" }, id_corsa: { type: "string" } }, required: ["nome_cavallo", "id_corsa"] } },
  { name: "allena_cavallo", description: "Fa fare subito una seduta di allenamento. Sedute: " + SESSIONS.map((s) => s.id).join(", ") + ". Intensità: leggera, normale, intensa.", parameters: { type: "object", properties: { nome_cavallo: { type: "string" }, seduta: { type: "string" }, intensita: { type: "string" } }, required: ["nome_cavallo", "seduta"] } },
  { name: "mercato", description: "Cavalli in vendita (id, nome, età, valore stimato, prezzo).", parameters: { type: "object", properties: { prezzo_max: { type: "number" } } } },
  { name: "compra_cavallo", description: "Compra un cavallo dal mercato usando il suo id.", parameters: { type: "object", properties: { id_cavallo: { type: "string" } }, required: ["id_cavallo"] } },
  { name: "bacheca", description: "Le offerte di lavoro/ingaggi disponibili con id, titolo, paga e requisiti.", parameters: { type: "object", properties: {} } },
  { name: "accetta_ingaggio", description: "Accetta un'offerta della bacheca per un cavallo.", parameters: { type: "object", properties: { id_offerta: { type: "string" }, nome_cavallo: { type: "string" } }, required: ["id_offerta"] } },
  { name: "classifica_campionato", description: "Classifica di una divisione del campionato (1 = Serie A ... 4 = Serie D).", parameters: { type: "object", properties: { divisione: { type: "number" } } } },
  { name: "iscrivi_campionato", description: "Iscrive un cavallo al campionato.", parameters: { type: "object", properties: { nome_cavallo: { type: "string" } }, required: ["nome_cavallo"] } },
  { name: "scommetti", description: "Scommette sulla vittoria di un cavallo in una corsa aperta.", parameters: { type: "object", properties: { id_corsa: { type: "string" }, nome_cavallo: { type: "string" }, importo: { type: "number" } }, required: ["id_corsa", "nome_cavallo", "importo"] } },
  { name: "amichevole", description: "Organizza subito un'amichevole contro cavalli del sistema per far fare esperienza a un cavallo.", parameters: { type: "object", properties: { nome_cavallo: { type: "string" } }, required: ["nome_cavallo"] } },
  { name: "notifiche", description: "Le ultime notifiche ricevute dal giocatore.", parameters: { type: "object", properties: {} } },
];

function findMine(g: Game, p: Player, name: string) {
  const hs = g.horsesOf(p.id);
  const n = String(name ?? "").toLowerCase().trim();
  return hs.find((h) => h.name.toLowerCase() === n) ?? hs.find((h) => h.name.toLowerCase().includes(n)) ?? hs.find((h) => h.id === name) ?? null;
}

function hm(ts: number) {
  return new Date(ts).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
}

export function runTool(g: Game, p: Player, name: string, args: any): unknown {
  const now = g.now();
  const fresh = () => g.player(p.id)!;
  const need = (h: any, n: string) => {
    if (!h) throw new GameError(`Non trovo un tuo cavallo che si chiama "${n}".`);
    return h;
  };
  switch (name) {
    case "stato_scuderia": {
      const pl = fresh();
      return {
        soldi: pl.money, box: `${g.stallsUsed(p.id)}/${pl.data.stalls}`, reputazione: pl.data.rep,
        cavalli: g.horsesOf(p.id).map((h) => ({ nome: h.name, sesso: h.sex, eta: Math.round(((now - h.birth) / (3 * 86400000)) * 10) / 10, valore: valuation(h, now), rating: Math.round(h.rating), fatica: Math.round(currentFatigue(h, now)), puo_correre: canRace(h, now) ?? "sì", vittorie: h.rec.wins, corse: h.rec.starts })),
      };
    }
    case "info_cavallo": {
      const h = need(findMine(g, p, args.nome), args.nome);
      const v = g.horseView(h, p.id);
      return { nome: v.name, statistiche: v.stats, quirk_scoperti: v.quirks.map((q: any) => `${q.name}: ${q.desc}`), quirk_nascosti: v.hiddenQuirks, condizione: v.cond, mente: v.mind ? { paure: v.mind.fears.filter((f: any) => Math.abs(f.v) > 0.15), diario: v.mind.log.slice(0, 5) } : null };
    }
    case "prossime_corse": {
      const ore = Math.max(1, Math.min(24, Number(args.ore) || 3));
      const rows = g.db.all<any>("SELECT id, kind, name, start_at, distance, purse, fee, data, hurdles FROM races WHERE status = 'open' AND start_at BETWEEN ? AND ? ORDER BY start_at LIMIT 25", now + CLOSE_BEFORE, now + ore * 3600000);
      return rows.filter((r) => !args.tipo || r.kind === args.tipo || (args.tipo === "cup" && r.kind === "cup")).map((r) => ({ id: r.id, ora: hm(r.start_at), nome: r.name, tipo: r.kind, classe: JSON.parse(r.data).cls ?? null, distanza: r.distance, siepi: !!r.hurdles, premio: r.purse, iscrizione: r.fee }));
    }
    case "iscrivi_cavallo": {
      const h = need(findMine(g, p, args.nome_cavallo), args.nome_cavallo);
      A.enterRace(g, fresh(), String(args.id_corsa), h.id);
      return { ok: true, messaggio: `${h.name} iscritto.` };
    }
    case "allena_cavallo": {
      const h = need(findMine(g, p, args.nome_cavallo), args.nome_cavallo);
      const r = A.trainNow(g, fresh(), h.id, String(args.seduta), args.intensita ?? "normale");
      return { ok: true, esito: r.report.text, note: r.report.notes };
    }
    case "mercato": {
      const max = Number(args.prezzo_max) || 1e12;
      return (g.marketList() as any[]).filter((x) => x.price <= max).slice(0, 12).map((x) => ({ id: x.id, nome: x.name, sesso: x.sex, eta: x.age, valore_stimato: x.overall, prezzo: x.price, venditore: x.stable }));
    }
    case "compra_cavallo": {
      const r = A.buyHorse(g, fresh(), String(args.id_cavallo));
      return { ok: true, comprato: r.horse.name };
    }
    case "bacheca": {
      return A.board(g, fresh()).offers.filter((o: any) => o.status === "open").map((o: any) => ({ id: o.id, titolo: o.title, tipo: o.kind, paga: o.pay, ore: o.hours, fatica: o.fatigue, sesso: o.sex, cavallo: o.horseName, losco: o.shady }));
    }
    case "accetta_ingaggio": {
      const h = args.nome_cavallo ? need(findMine(g, p, args.nome_cavallo), args.nome_cavallo) : null;
      const r = A.acceptOffer(g, fresh(), String(args.id_offerta), h?.id);
      return { ok: true, esito: r.text };
    }
    case "classifica_campionato": {
      const div = Math.max(1, Math.min(4, Number(args.divisione) || 1));
      return { divisione: DIVISIONS[div - 1], classifica: g.standings(g.season().n, div).slice(0, 12).map((r) => ({ pos: r.pos, cavallo: r.name, scuderia: r.stable, punti: r.points })) };
    }
    case "iscrivi_campionato": {
      const h = need(findMine(g, p, args.nome_cavallo), args.nome_cavallo);
      return A.leagueRegister(g, fresh(), h.id);
    }
    case "scommetti": {
      const r = g.race(String(args.id_corsa));
      if (!r) throw new GameError("Corsa inesistente.");
      const n = String(args.nome_cavallo).toLowerCase();
      const e = g.raceEntries(r.id).find((x) => x.horse.name.toLowerCase().includes(n));
      if (!e) throw new GameError("Quel cavallo non è iscritto a questa corsa.");
      return A.placeBet(g, fresh(), r.id, e.horse.id, Number(args.importo));
    }
    case "amichevole": {
      const h = need(findMine(g, p, args.nome_cavallo), args.nome_cavallo);
      const r = A.quickFriendly(g, fresh(), { horseId: h.id, bots: 7 });
      return { ok: true, id_corsa: r.raceId, ora: hm(r.startAt) };
    }
    case "notifiche":
      return g.db.all<any>("SELECT text FROM notes WHERE player = ? ORDER BY id DESC LIMIT 8", p.id).map((n) => n.text);
  }
  throw new GameError("Strumento sconosciuto: " + name);
}

interface Msg {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
}

const usage = new Map<string, number[]>();

export async function assistantChat(g: Game, ai: Ai, p: Player, history: { role: string; content: string }[], lang: string) {
  const now = g.now();
  const u = (usage.get(p.id) ?? []).filter((t) => now - t < 3600000);
  if (u.length >= 40) throw new GameError("Nonna Pina è stanca: massimo 40 messaggi l'ora. Riprova più tardi.");
  u.push(now);
  usage.set(p.id, u);
  const langName = LANG_NAME[lang] ?? "italiano";
  const sys: Msg = {
    role: "system",
    content:
      `Sei Nonna Pina, la nonna italiana simpatica e brontolona che fa da segretaria alla scuderia "${p.stable}" del giocatore ${p.name} nel gioco Horses Arena (corse di cavalli online). ` +
      `Rispondi SEMPRE in ${langName}, in modo breve (massimo 3-4 frasi), con umorismo da nonna (cibo, nipoti, "ai miei tempi"), ma dando informazioni precise. ` +
      `Puoi agire nel gioco usando gli strumenti: usali quando il giocatore chiede di fare qualcosa o vuole sapere qualcosa sul suo account; non inventare dati. ` +
      `Prima di spese sopra i 15000 fiorini chiedi conferma. Non aiutare a fare cose fuori dal gioco. Ora: ${hm(now)} (ora italiana).`,
  };
  const msgs: Msg[] = [sys, ...history.slice(-12).map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as Msg["role"], content: String(m.content).slice(0, 1500) }))];
  const actions: string[] = [];
  for (let step = 0; step < 5; step++) {
    const res: any = await ai.run(AI_MODEL as any, { messages: msgs, tools: TOOLS, max_tokens: 600 } as any);
    const calls: any[] = res?.tool_calls ?? [];
    if (!calls.length) {
      return { reply: String(res?.response ?? "").trim() || "...", actions };
    }
    for (const c of calls.slice(0, 3)) {
      let out: unknown;
      try {
        const args = typeof c.arguments === "string" ? JSON.parse(c.arguments || "{}") : c.arguments ?? {};
        out = runTool(g, g.player(p.id)!, c.name, args);
        actions.push(c.name);
      } catch (e) {
        out = { errore: (e as Error).message };
      }
      msgs.push({ role: "assistant", content: JSON.stringify({ name: c.name, arguments: c.arguments }) });
      msgs.push({ role: "tool", name: c.name, content: JSON.stringify(out).slice(0, 3500) });
    }
  }
  return { reply: "Ho fatto un po' di cose, controlla la scuderia!", actions };
}
