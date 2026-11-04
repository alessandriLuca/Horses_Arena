// Scuderie NPC: giocatori finti con personalità, soggetti alle stesse regole dei giocatori veri.
// Iscrivono e allenano cavalli, comprano, scrivono, sfidano, rispondono e partecipano ai tornei.
import { fail, type Game, type Player } from "./world";
import * as A from "./actions";
import { Rng } from "../sim/rng";
import { canRace } from "../sim/horse";
import { MIN, HOUR } from "./time";

interface Persona { name: string; stable: string; silks: any; mood: "spaccone" | "gentile" | "losco" | "nonno" | "nerd"; }

export const NPCS: Persona[] = [
  { name: "Conte Ugolino", stable: "Scuderia del Conte", silks: { primary: "#6a0dad", secondary: "#ffd700", cap: "#000000", pattern: "stella" }, mood: "spaccone" },
  { name: "Zia Carmela", stable: "Allevamento Zia Carmela", silks: { primary: "#ff6fa8", secondary: "#ffffff", cap: "#ff6fa8", pattern: "pois" }, mood: "gentile" },
  { name: "Er Sorcio", stable: "Scuderia Er Sorcio", silks: { primary: "#222222", secondary: "#9aff00", cap: "#222222", pattern: "diagonale" }, mood: "losco" },
  { name: "Nonno Tonino", stable: "Tenuta Nonno Tonino", silks: { primary: "#8b4513", secondary: "#f5deb3", cap: "#8b4513", pattern: "bande" }, mood: "nonno" },
  { name: "Dott.ssa Yuki", stable: "Laboratorio Yuki Racing", silks: { primary: "#4cc9f0", secondary: "#ffffff", cap: "#f72585", pattern: "quarti" }, mood: "nerd" },
  { name: "Gennaro Lampo", stable: "Lampo Stables", silks: { primary: "#ffcc00", secondary: "#d62828", cap: "#ffcc00", pattern: "strisce" }, mood: "spaccone" },
  { name: "Suor Annunziata", stable: "Scuderia del Convento", silks: { primary: "#ffffff", secondary: "#1b1a3a", cap: "#1b1a3a", pattern: "croce" }, mood: "gentile" },
  { name: "Il Barone Nero", stable: "Baronia Nera", silks: { primary: "#0b0b0b", secondary: "#c0392b", cap: "#c0392b", pattern: "tinta" }, mood: "losco" },
];

const LINES: Record<Persona["mood"], { mail: string[]; reply: string[]; win: string[] }> = {
  spaccone: {
    mail: ["Ho visto i tuoi cavalli correre. Carini. Per essere dei pony.", "Il mio cavallo più lento batte il tuo più veloce. Scommettiamo?", "Ti aspetto in pista. Porta i fazzoletti."],
    reply: ["Parole, parole. Vediamoci in pista.", "Ah sì? Allora sfidami, se hai coraggio."],
    win: ["Visto? Te l'avevo detto."],
  },
  gentile: {
    mail: ["Ciao! Che bei colori ha la tua scuderia. In bocca al lupo per le prossime corse!", "Se ti serve un consiglio sull'allenamento, chiedi pure. La piscina fa miracoli!", "Ho fatto una torta per tutto l'ippodromo, passa al bar!"],
    reply: ["Grazie mille, sei gentilissimo! Buona fortuna!", "Che carino! Ci vediamo in pista, eh."],
    win: ["Che bella gara, complimenti a tutti!"],
  },
  losco: {
    mail: ["Bel cavallo. Sarebbe un peccato se gli succedesse qualcosa... comprati una sorveglianza.", "Ho un amico al mercato nero. Se ti serve qualcosa, sai chi chiamare.", "Ti offro un affare: tu perdi, io vinco, dividiamo. Pensaci."],
    reply: ["Io non so niente. Non ho visto niente.", "Le chiacchiere stanno a zero. I fiorini parlano."],
    win: ["Che fortuna, eh? Proprio fortuna."],
  },
  nonno: {
    mail: ["Ai miei tempi i cavalli si allenavano tirando l'aratro. Tu invece li porti in piscina!", "Caro giovane, ricordati: un cavallo stanco non vince. Fallo riposare.", "Ho visto correre tuo cavallo. Mi ricorda il mio Fulmine del '62."],
    reply: ["Bravo ragazzo. Mangia, che sei sciupato.", "Eh, voi giovani avete sempre fretta."],
    win: ["L'esperienza conta, figliolo."],
  },
  nerd: {
    mail: ["Ho analizzato 400 corse: la tattica 'Attesa e scatto' rende il 12% in più sopra i 2000 m. Prego.", "Il tuo cavallo ha un'alta probabilità di avere un quirk nascosto. Statisticamente.", "Sto testando un siero in laboratorio. Risultati... interessanti."],
    reply: ["Dati insufficienti per una risposta. Ma grazie.", "Interessante. Lo aggiungo al mio dataset."],
    win: ["Come previsto dal modello."],
  },
};

export function isNpc(p: Player | null) {
  return !!p && !!(p.data as any).npc;
}

export function ensureNpcs(g: Game) {
  if (g.kv("npcs")) return;
  g.setKv("npcs", "1");
  const rng = new Rng("npc:" + g.now());
  for (const n of NPCS) {
    if (g.db.one("SELECT 1 FROM players WHERE stable = ?", n.stable)) continue;
    const r = A.register(g, { name: n.name, stable: n.stable, silks: n.silks });
    const p = g.player(r.id)!;
    (p.data as any).npc = n.mood;
    p.data.tut = { __skip: true };
    p.data.stalls = 6;
    g.savePlayer(p);
    g.money(p.id, 30000, "Capitale iniziale");
    g.db.run("DELETE FROM notes WHERE player = ?", p.id);
    // compra 3 cavalli dal mercato (o dai bot se il mercato è vuoto)
    for (let k = 0; k < 3; k++) {
      const list = (g.marketList() as any[]).filter((x) => !x.ownerId && x.age >= 2);
      const pick = list.length ? list[Math.floor(rng.next() * list.length)] : null;
      if (pick) { try { A.buyHorse(g, g.player(p.id)!, pick.id); } catch { /* niente */ } }
    }
    for (const h of g.horsesOf(p.id)) { h.plan = { active: true, days: ["galoppo", "ripetute", "riposo", "slalom", "gabbie", "pascolo", "riposo"].map((s) => ({ s, i: "normale" as const })) }; g.saveHorse(h); }
    g.refreshMarket(true);
  }
  if (!g.hasJob("npc")) g.schedule("npc", "", g.now() + 5 * MIN);
}

export function npcPlayers(g: Game): Player[] {
  return g.db.all<any>("SELECT * FROM players WHERE json_extract(data, '$.npc') IS NOT NULL").map((r) => g.rowToPlayer(r));
}

/** Un "turno" degli NPC: ogni 20 minuti. */
export function npcTick(g: Game) {
  const now = g.now();
  const rng = new Rng("npctick:" + now);
  const humans = g.db.all<{ id: string }>("SELECT id FROM players WHERE json_extract(data, '$.npc') IS NULL AND last_seen > ?", now - 3 * 86400000).map((r) => r.id);
  for (let p of npcPlayers(g)) {
    const mood = (p.data as any).npc as Persona["mood"];
    const L = LINES[mood] ?? LINES.gentile;
    const safe = (fn: () => void) => { try { fn(); } catch { /* le regole valgono anche per loro */ } p = g.player(p.id)!; };
    if (p.money < 4000) safe(() => g.money(p.id, 12000, "Sponsor"));
    const horses = g.horsesOf(p.id);
    // iscrizioni alle corse
    for (const h of horses) {
      if (canRace(h, now) || !rng.chance(0.35)) continue;
      const busy = g.db.one("SELECT 1 FROM entries e JOIN races r ON r.id = e.race_id WHERE e.horse_id = ? AND r.status IN ('open','closed')", h.id);
      if (busy) continue;
      const races = g.db.all<{ id: string }>("SELECT id FROM races WHERE status = 'open' AND kind IN ('open','gp','cup') AND start_at BETWEEN ? AND ? ORDER BY start_at LIMIT 8", now + 2 * MIN, now + 2 * HOUR);
      for (const r of rng.shuffle(races)) {
        let ok = false;
        safe(() => { A.enterRace(g, p, r.id, h.id); ok = true; });
        if (ok) break;
      }
      if (rng.chance(0.3)) safe(() => A.leagueRegister(g, p, h.id));
    }
    // allenamento extra
    if (horses.length && rng.chance(0.25)) safe(() => A.trainNow(g, p, rng.pick(horses).id, rng.pick(["ripetute", "galoppo", "rumori", "gruppo", "piscina"]), "normale"));
    // acquisti
    if (p.money > 35000 && horses.length < p.data.stalls && rng.chance(0.15)) {
      const list = (g.marketList() as any[]).filter((x) => x.ownerId !== p.id && x.price < p.money * 0.5 && x.age >= 2).sort((a, b) => b.overall - a.overall);
      if (list[0]) safe(() => A.buyHorse(g, p, list[0].id));
    }
    // vende i cavalli vecchi
    for (const h of horses) if (h.retired && rng.chance(0.3)) safe(() => A.quickSell(g, p, h.id));
    // risponde alla posta e paga (a volte) le richieste
    for (const m of g.db.all<any>("SELECT * FROM mail WHERE recipient = ? AND read = 0", p.id)) {
      g.db.run("UPDATE mail SET read = 1 WHERE id = ?", m.id);
      if (m.status === "request") safe(() => A.mailPay(g, p, m.id, m.request <= 1500 && rng.chance(0.5)));
      const sender = g.player(m.sender);
      if (sender && !isNpc(sender)) safe(() => A.sendMail(g, p, { to: sender.id, subject: "Re: " + m.subject, body: rng.pick(L.reply) }));
    }
    // sfide ricevute
    for (const c of g.db.all<any>("SELECT id FROM challenges WHERE to_player = ? AND status = 'pending'", p.id)) safe(() => A.answerChallenge(g, p, c.id, rng.chance(0.75)));
    // scrive ai giocatori e li sfida
    if (humans.length && rng.chance(0.06)) safe(() => A.sendMail(g, p, { to: rng.pick(humans), subject: rng.pick(["Ciao!", "Un pensiero", "Ehi tu", "Messaggio dall'ippodromo"]), body: rng.pick(L.mail) }));
    if (humans.length && horses.length && rng.chance(mood === "spaccone" ? 0.06 : 0.025)) {
      const target = g.horsesOf(rng.pick(humans)).filter((h) => !canRace(h, now))[0];
      const mine = horses.filter((h) => !canRace(h, now))[0];
      if (target && mine) safe(() => A.challenge(g, p, { horseId: mine.id, targetId: target.id, stake: rng.pick([0, 500, 1000, 2000]), distance: rng.pick([1200, 1600, 2000]) }));
    }
    // tornei pubblici
    if (horses.length && rng.chance(0.1)) {
      const t = g.db.one<{ id: string }>("SELECT id FROM tournaments WHERE private = 0 AND status != 'done' AND owner != ? ORDER BY created DESC LIMIT 1", p.id);
      if (t) safe(() => A.joinTournament(g, p, t.id, horses[0].id));
    }
  }
  g.schedule("npc", "", now + 20 * MIN);
}

/** Il proprietario di un torneo invita una scuderia NPC (entra col suo cavallo migliore). */
export function inviteNpc(g: Game, owner: Player, tid: string, npcId: string) {
  const t = g.db.one<any>("SELECT * FROM tournaments WHERE id = ? AND owner = ?", tid, owner.id);
  if (!t) fail("Solo chi organizza il torneo può invitare.");
  const npc = g.player(npcId);
  if (!isNpc(npc)) fail("Scuderia non valida.");
  const h = g.horsesOf(npc!.id).filter((x) => !x.retired).sort((a, b) => b.rating - a.rating)[0];
  if (!h) fail(`${npc!.stable} non ha cavalli disponibili.`);
  const cfg = JSON.parse(t.config);
  if (cfg.fee && npc!.money < cfg.fee) g.money(npc!.id, cfg.fee, "Sponsor");
  A.joinTournament(g, g.player(npc!.id)!, t.id, h.id, t.code);
  return { ok: true, text: `${npc!.stable} accetta l'invito con ${h.name}!` };
}
