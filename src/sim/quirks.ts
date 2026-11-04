// I 100 quirk: tratti innati e nascosti. Il proprietario non sa quali ha il suo cavallo
// finché non si manifestano in gara (allora vengono "rivelati" a tutti).
import type { QuirkDef, Runner, QCtx } from "./types";
import type { Rng } from "./rng";
import { SI } from "./learning";
import { isCurve } from "../../public/js/shared/track.js";

const once = (r: Runner, id: string) => {
  if (r.q[id]) return false;
  r.q[id] = true;
  return true;
};
const cd = (r: Runner, id: string, c: QCtx, sec: number) => {
  const k = id + ":cd";
  if ((r.q[k] ?? -1e9) > c.t) return false;
  r.q[k] = c.t + sec;
  return true;
};
const uses = (r: Runner, id: string, max: number) => {
  const k = id + ":n";
  const n = r.q[k] ?? 0;
  if (n >= max) return false;
  r.q[k] = n + 1;
  return true;
};
const frac = (r: Runner, c: QCtx) => r.p / c.distance;
const running = (r: Runner) => r.status === "run";
const homeStraight = (r: Runner, c: QCtx) => c.rem(r) < 350 && !c.inCurve(r);
const isGrey = (r: Runner) => r.h.look.coat === "grigio" || r.h.look.coat === "grigio_pomellato";

export const QUIRKS: QuirkDef[] = [
  // ---------------- PARTENZA ----------------
  {
    id: "fulmine_al_via", name: "Fulmine al via", polarity: "+", rarity: 2,
    desc: "Schizza fuori dalle gabbie prima di tutti.",
    setup(r) { r.startDelay *= 0.3; },
    start(r, c) { c.mod(r, { accel: 1.45, dur: 3, label: "partenza a razzo" }); c.quirk(r, "fulmine_al_via", "schizza fuori dalle gabbie come un fulmine"); },
  },
  {
    id: "dormiglione", name: "Dormiglione", polarity: "-", rarity: 1,
    desc: "A volte si addormenta nelle gabbie e parte in ritardo.",
    setup(r, c) { if (c.rng.chance(0.55)) { r.startDelay += c.rng.range(0.8, 1.7); r.q.dorme = true; } },
    start(r, c) { if (r.q.dorme) c.quirk(r, "dormiglione", "si è addormentato nelle gabbie e parte in ritardo"); },
  },
  {
    id: "claustrofobico", name: "Claustrofobico", polarity: "-", rarity: 1,
    desc: "Le gabbie di partenza lo mandano nel panico.",
    setup(r, c) { r.arousal += 0.5; c.stim(r, "gabbie", 1); if (c.rng.chance(0.4)) { r.startDelay += 0.9; r.q.impenna = true; } },
    start(r, c) { c.quirk(r, "claustrofobico", r.q.impenna ? "va nel panico nelle gabbie e si impenna" : "esce dalle gabbie col cuore a mille"); if (r.q.impenna) c.rear(r, 0.8); },
  },
  {
    id: "impennata", name: "Impennata d'esordio", polarity: "±", rarity: 2,
    desc: "Si impenna al via per farsi vedere, poi parte carichissimo.",
    start(r, c) { c.rear(r, 0.7); c.mod(r, { speed: 1.05, dur: 7, label: "carico dopo l'impennata" }); c.quirk(r, "impennata", "si impenna al via davanti a tutti"); },
  },
  {
    id: "ballerino", name: "Ballerino", polarity: "±", rarity: 2,
    desc: "Fa due passi di danza prima di partire: perde tempo ma si scioglie e resta calmissimo.",
    setup(r) { r.startDelay += 0.5; },
    start(r, c) { r.arousal = 0; r.q.zen = true; c.quirk(r, "ballerino", "fa due passi di danza prima di partire"); },
    tick(r) { if (r.q.zen) r.arousal *= 0.97; },
  },
  {
    id: "partenza_storta", name: "Partenza storta", polarity: "-", rarity: 1,
    desc: "Esce dalle gabbie di traverso, addosso al vicino.",
    tick(r, c) {
      if (c.t < 2.2 && c.t > 0.6 && running(r) && once(r, "partenza_storta")) {
        const o = c.beside(r);
        c.push(r, r.d > 3 ? -1.6 : 1.6);
        if (o) c.bump(r, o, 0.9);
        c.quirk(r, "partenza_storta", "esce storto dalle gabbie", o ?? undefined);
      }
    },
  },
  // ---------------- VOCE ----------------
  {
    id: "urlatore", name: "Urlatore", polarity: "±", rarity: 2,
    desc: "Lancia urla terrificanti che spaventano i cavalli vicini.",
    tick(r, c) {
      if (!running(r) || c.near(r, 4.5, 3).length < 2) return;
      if (c.chance(0.09) && cd(r, "urlatore", c, 9) && uses(r, "urlatore", 3)) {
        c.emit(r, "urla", 7, 1);
        c.energy(r, 1);
        c.quirk(r, "urlatore", "lancia un urlo terrificante: i vicini si spaventano");
      }
    },
  },
  {
    id: "nitrito_guerra", name: "Nitrito di guerra", polarity: "+", rarity: 2,
    desc: "Nel finale lancia un nitrito che lo carica e intimidisce gli avversari.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 420 && once(r, "nitrito_guerra")) {
        c.emit(r, "urla", 5, 0.6);
        c.mod(r, { speed: 1.04, dur: 6, label: "nitrito di guerra" });
        c.quirk(r, "nitrito_guerra", "lancia il suo nitrito di guerra");
      }
    },
  },
  {
    id: "canterino", name: "Canterino", polarity: "+", rarity: 2,
    desc: "Canticchia correndo: calma sé stesso e i cavalli vicini.",
    tick(r, c) {
      if (!running(r) || !c.chance(0.035)) return;
      const n = c.near(r, 5, 4);
      if (!n.length) return;
      for (const o of n) o.arousal *= 0.6;
      r.arousal *= 0.5;
      if (cd(r, "canterino", c, 15)) c.quirk(r, "canterino", "canticchia e calma i cavalli intorno");
    },
  },
  {
    id: "sbuffone", name: "Sbuffone", polarity: "±", rarity: 1,
    desc: "Sbuffa in faccia a chi gli sta dietro.",
    tick(r, c) {
      const b = c.behind(r, 3);
      if (b && running(r) && Math.abs(b.d - r.d) < 1 && c.chance(0.06) && cd(r, "sbuffone", c, 10)) {
        c.arouse(b, 0.2);
        c.mod(b, { speed: 0.97, dur: 2, label: "sbuffata in faccia" });
        c.quirk(r, "sbuffone", "sbuffa in faccia a chi lo segue", b);
      }
    },
  },
  {
    id: "gas_propulsore", name: "Gas propulsore", polarity: "±", rarity: 2,
    desc: "Flatulenze leggendarie: lui accelera, chi sta dietro sbanda.",
    tick(r, c) {
      if (!running(r) || !c.chance(0.04) || !cd(r, "gas", c, 14)) return;
      c.mod(r, { speed: 1.06, dur: 1.5, label: "propulsione" });
      const b = c.behind(r, 4.5);
      if (b) { c.arouse(b, 0.35); c.mod(b, { speed: 0.95, dur: 2, label: "nube tossica" }); c.push(b, b.d > r.d ? 0.8 : -0.8); }
      c.quirk(r, "gas_propulsore", "una flatulenza leggendaria! Chi sta dietro sbanda", b ?? undefined);
    },
  },
  // ---------------- AGGRESSIVITÀ ----------------
  {
    id: "morsicatore", name: "Morsicatore", polarity: "-", rarity: 2,
    desc: "Morde i cavalli che gli corrono accanto.",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && c.chance(0.25) && cd(r, "morso", c, 8)) {
        c.arouse(o, 0.5);
        c.stumble(o, 0.25, "morso");
        c.mod(r, { speed: 0.97, dur: 1.5, label: "distratto dal morso" });
        c.quirk(r, "morsicatore", "morde il vicino", o);
      }
    },
  },
  {
    id: "calciatore", name: "Calciatore", polarity: "-", rarity: 2,
    desc: "Scalcia all'indietro contro chi gli sta incollato.",
    tick(r, c) {
      const b = c.behind(r, 2.6);
      if (b && running(r) && Math.abs(b.d - r.d) < 0.9 && c.chance(0.2) && cd(r, "calcio", c, 10)) {
        c.stumble(b, 0.5, "calcio");
        c.arouse(b, 0.4);
        c.mod(r, { speed: 0.96, dur: 1, label: "scalciata" });
        c.quirk(r, "calciatore", "tira un calcio all'indietro", b);
      }
    },
  },
  {
    id: "spallata", name: "Spallata", polarity: "±", rarity: 1,
    desc: "Nel finale dà spallate a chi prova ad affiancarlo.",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && c.rem(r) < 600 && c.chance(0.3) && cd(r, "spallata", c, 6)) {
        c.bump(r, o, 1.2);
        c.quirk(r, "spallata", "rifila una spallata", o);
      }
    },
  },
  {
    id: "bullo", name: "Bullo", polarity: "±", rarity: 2,
    desc: "Se la prende con i cavalli più piccoli di lui e li spinge via.",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && o.mass < r.mass * 0.97 && c.chance(0.15) && cd(r, "bullo", c, 7)) {
        c.push(o, o.d > r.d ? 1.4 : -1.4);
        c.arouse(o, 0.3);
        c.quirk(r, "bullo", "fa il bullo e spinge via", o);
      }
    },
  },
  {
    id: "vendicativo", name: "Vendicativo", polarity: "±", rarity: 2,
    desc: "Chi lo urta se la vede brutta: restituisce il colpo.",
    bumped(r, o, impact, c) {
      if (impact > 0.4 && c.rng.chance(0.6) && cd(r, "vendetta", c, 5)) { r.q.vendetta = { o: o.i, at: c.t + 0.8 }; }
    },
    tick(r, c) {
      const v = r.q.vendetta;
      if (v && c.t >= v.at) {
        r.q.vendetta = null;
        const o = c.runners[v.o];
        if (Math.abs(o.p - r.p) < 3 && Math.abs(o.d - r.d) < 2.5) { c.bump(r, o, 1.1); c.quirk(r, "vendicativo", "si vendica e restituisce il colpo", o); }
      }
    },
  },
  {
    id: "testone", name: "Testone", polarity: "±", rarity: 1,
    desc: "Se resta chiuso dà una testata al cavallo davanti.",
    tick(r, c) {
      const a = c.ahead(r, 2.8);
      if (a && running(r) && Math.abs(a.d - r.d) < 0.8) r.q.chiuso = (r.q.chiuso ?? 0) + c.dt; else r.q.chiuso = 0;
      if (a && r.q.chiuso > 2.2 && cd(r, "testata", c, 12)) {
        c.stumble(a, 0.35, "testata");
        c.stumble(r, 0.15, "testata");
        r.q.chiuso = 0;
        c.quirk(r, "testone", "dà una testata a chi lo chiude", a);
      }
    },
  },
  {
    id: "carica_toro", name: "Carica del toro", polarity: "±", rarity: 3,
    desc: "Nel finale, se è chiuso, carica a testa bassa travolgendo chi c'è davanti.",
    tick(r, c) {
      const a = c.ahead(r, 3.5);
      if (a && running(r) && c.rem(r) < 500 && Math.abs(a.d - r.d) < 1 && once(r, "carica_toro")) {
        c.mod(r, { speed: 1.09, accel: 1.4, dur: 4, label: "carica" });
        c.bump(r, a, 1.5);
        c.push(a, a.d > 2 ? 1.6 : -1.6);
        c.quirk(r, "carica_toro", "carica come un toro e si apre la strada", a);
      }
    },
  },
  // ---------------- PAURE ----------------
  {
    id: "agorafobico", name: "Agorafobico", polarity: "-", rarity: 1,
    desc: "La folla in tribuna lo terrorizza.",
    tick(r, c) {
      if (r.stimNow[SI.folla] > 0.3 && running(r) && c.chance(0.4) && cd(r, "agora", c, 6)) {
        c.arouse(r, 0.45);
        c.mod(r, { speed: 0.96, dur: 2.5, label: "terrore della folla" });
        c.push(r, -0.8);
        c.quirk(r, "agorafobico", "si spaventa del boato della tribuna");
      }
    },
  },
  {
    id: "ombrofobo", name: "Ombrofobo", polarity: "-", rarity: 1,
    desc: "In curva si spaventa della propria ombra e scarta.",
    tick(r, c) {
      if (c.inCurve(r) && running(r) && c.chance(0.04) && cd(r, "ombra", c, 10)) {
        c.push(r, 1.5);
        c.arouse(r, 0.3);
        c.quirk(r, "ombrofobo", "si spaventa della propria ombra e scarta in curva");
      }
    },
  },
  {
    id: "fifone", name: "Fifone", polarity: "-", rarity: 1,
    desc: "Quando viene superato si spaventa e rallenta.",
    overtaken(r, by, c) {
      if (c.rng.chance(0.35) && cd(r, "fifone", c, 6)) {
        c.arouse(r, 0.4);
        c.mod(r, { speed: 0.95, dur: 2, label: "spaventato" });
        c.quirk(r, "fifone", "si spaventa mentre viene superato", by);
      }
    },
  },
  {
    id: "idrofobo", name: "Odia la pioggia", polarity: "-", rarity: 1,
    desc: "Sotto la pioggia corre controvoglia.",
    start(r, c) {
      if (c.spec.weather === "pioggia" || c.spec.weather === "temporale") {
        c.mod(r, { speed: 0.97, dur: 999, label: "odia la pioggia" });
        c.quirk(r, "idrofobo", "odia la pioggia e corre a testa bassa");
      }
    },
  },
  {
    id: "panico_gruppo", name: "Panico da gruppo", polarity: "-", rarity: 1,
    desc: "Stretto in mezzo al gruppo perde la testa e scappa verso l'esterno.",
    tick(r, c) {
      if (running(r) && c.near(r, 3.5, 2.2).length >= 3 && c.chance(0.15) && cd(r, "panico", c, 10)) {
        c.push(r, 2);
        c.mod(r, { speed: 1.04, cost: 1.35, dur: 3, label: "panico" });
        c.arouse(r, 0.4);
        c.quirk(r, "panico_gruppo", "va nel panico in mezzo al gruppo e scappa all'esterno");
      }
    },
  },
  {
    id: "coda_gambe", name: "Coda tra le gambe", polarity: "-", rarity: 1,
    desc: "Se si ritrova nelle retrovie a metà gara, si arrende.",
    tick(r, c) {
      if (running(r) && frac(r, c) > 0.5 && r.rank > c.runners.length * 0.7 && once(r, "coda_gambe")) {
        c.mod(r, { speed: 0.96, dur: 999, label: "si è arreso" });
        c.quirk(r, "coda_gambe", "si ritrova dietro e mette la coda tra le gambe");
      }
    },
  },
  {
    id: "odia_grigi", name: "Odia i grigi", polarity: "-", rarity: 2,
    desc: "Non sopporta i cavalli grigi: se uno gli si avvicina, scarta.",
    tick(r, c) {
      if (!running(r) || !c.chance(0.3)) return;
      const g = c.near(r, 3, 2.5).find(isGrey);
      if (g && cd(r, "grigi", c, 12)) {
        c.push(r, r.d > g.d ? 1.4 : -1.4);
        c.arouse(r, 0.3);
        c.quirk(r, "odia_grigi", "scarta: non sopporta i cavalli grigi", g);
      }
    },
  },
  {
    id: "terrore_siepi", name: "Terrore delle siepi", polarity: "-", rarity: 1,
    desc: "Gli ostacoli lo terrorizzano.",
    hurdle(r, c) { c.quirk(r, "terrore_siepi", "arriva sulla siepe terrorizzato"); return -0.18; },
  },
  {
    id: "paura_tuoni", name: "Paura dei tuoni", polarity: "-", rarity: 1,
    desc: "Durante i temporali ogni tuono lo fa impazzire.",
    tick(r, c) {
      if (c.spec.weather === "temporale" && running(r) && c.chance(0.05) && cd(r, "tuono", c, 8)) {
        c.arouse(r, 0.6);
        c.stim(r, "botti", 1);
        c.mod(r, { speed: 0.94, dur: 2, label: "tuono" });
        c.push(r, c.rng.chance(0.5) ? 1 : -1);
        c.quirk(r, "paura_tuoni", "un tuono lo fa impazzire");
      }
    },
  },
  // ---------------- MOVIMENTI STRANI ----------------
  {
    id: "retromarcia", name: "Retromarcia", polarity: "-", rarity: 2,
    desc: "Ogni tanto indietreggia, in piena gara.",
    tick(r, c) {
      if (running(r) && c.t > 5 && c.rem(r) > 200 && c.chance(0.012) && once(r, "retromarcia")) {
        c.rear(r, 1.3);
        r.q.indietro = c.t + 1.3;
        c.quirk(r, "retromarcia", "fa retromarcia in mezzo alla pista!");
      }
      if (r.q.indietro && c.t < r.q.indietro) r.v = -1.8;
    },
  },
  {
    id: "gambero", name: "Gambero", polarity: "-", rarity: 1,
    desc: "Corre di sbieco, scartando di lato senza motivo.",
    tick(r, c) {
      if (running(r) && c.chance(0.03) && cd(r, "gambero", c, 8)) {
        c.push(r, c.rng.chance(0.5) ? 1.8 : -1.8);
        c.mod(r, { speed: 0.98, dur: 1, label: "di sbieco" });
        c.quirk(r, "gambero", "scarta di lato come un gambero");
      }
    },
  },
  {
    id: "zigzag", name: "Zigzag", polarity: "-", rarity: 1,
    desc: "Non riesce a tenere una linea dritta: zigzaga e fa più strada.",
    tick(r, c) {
      if (!running(r)) return;
      r.targetD += Math.sin(c.t * 1.3 + r.i) * 0.06;
      if (c.t > 12 && once(r, "zigzag")) c.quirk(r, "zigzag", "zigzaga per tutta la pista");
    },
    setup(r) { r.mods.push({ speed: 1, cost: 1.03, lat: 1, accel: 1, until: 999, label: "zigzag" }); },
  },
  {
    id: "giravolta", name: "Giravolta", polarity: "-", rarity: 2,
    desc: "Una volta per gara fa una giravolta completa su sé stesso.",
    tick(r, c) {
      if (running(r) && c.t > 6 && c.rem(r) > 300 && c.chance(0.006) && once(r, "giravolta")) {
        c.stop(r, 1.5);
        c.quirk(r, "giravolta", "fa una giravolta completa su sé stesso!");
      }
    },
  },
  {
    id: "saltellatore", name: "Saltellatore", polarity: "±", rarity: 1,
    desc: "Saltella come un capriolo: brevi scatti che costano energia.",
    tick(r, c) {
      if (running(r) && c.chance(0.03) && cd(r, "salt", c, 6)) {
        c.energy(r, 1.5);
        c.mod(r, { speed: 1.03, dur: 1, label: "saltello" });
        if (uses(r, "saltellatore_rev", 1)) c.quirk(r, "saltellatore", "saltella come un capriolo");
      }
    },
  },
  {
    id: "pavone", name: "Pavone", polarity: "-", rarity: 2,
    desc: "Se è in testa davanti alla tribuna, si pavoneggia e rallenta.",
    tick(r, c) {
      if (running(r) && homeStraight(r, c) && r.rank === 1 && once(r, "pavone")) {
        const second = c.order()[1];
        if (second && r.p - second.p > 5) {
          c.mod(r, { speed: 0.92, dur: 3, label: "si pavoneggia" });
          c.quirk(r, "pavone", "si pavoneggia davanti alla tribuna");
        } else r.q.pavone = false;
      }
    },
  },
  {
    id: "brucatore", name: "Brucatore", polarity: "-", rarity: 2,
    desc: "Sull'erba può fermarsi a brucare. In gara.",
    tick(r, c) {
      if (c.spec.venue !== "dolomiti" && running(r) && c.t > 8 && c.rem(r) > 300 && c.chance(0.01) && once(r, "brucatore")) {
        c.stop(r, 2);
        c.quirk(r, "brucatore", "si ferma a brucare l'erba!");
      }
    },
  },
  {
    id: "pisolino", name: "Pisolino", polarity: "-", rarity: 3,
    desc: "Rarissimo: si sdraia in pista per un pisolino.",
    tick(r, c) {
      if (running(r) && c.t > 10 && c.rem(r) > 400 && c.chance(0.003) && once(r, "pisolino")) {
        c.stop(r, 4);
        c.quirk(r, "pisolino", "si sdraia in pista a fare un pisolino!");
      }
    },
  },
  {
    id: "turista", name: "Turista", polarity: "-", rarity: 1,
    desc: "Sul rettilineo guarda la gente e si allarga.",
    tick(r, c) {
      if (running(r) && r.stimNow[SI.folla] > 0.2 && c.chance(0.09)) {
        c.push(r, 0.35);
        if (cd(r, "turista", c, 30)) c.quirk(r, "turista", "si gira a guardare il pubblico e si allarga");
      }
    },
  },
  {
    id: "passo_danza", name: "Passo di danza", polarity: "±", rarity: 2,
    desc: "Si ferma un attimo per un passo di danza, poi riparte con brio.",
    tick(r, c) {
      if (running(r) && c.t > 5 && c.chance(0.01) && once(r, "passo_danza")) {
        c.stop(r, 0.6);
        c.mod(r, { speed: 1.04, dur: 4, label: "ritmo" });
        c.quirk(r, "passo_danza", "fa un passo di danza e riparte con brio");
      }
    },
  },
  // ---------------- ARRIVO ----------------
  {
    id: "collo_lungo", name: "Collo lungo", polarity: "+", rarity: 2,
    desc: "Sul palo allunga il collo come una giraffa: vince i fotofinish.",
    finish(r, c) {
      const close = c.runners.some((o) => o !== r && (o.status === "run" || o.status === "done") && Math.abs(o.p - r.p) < 2.5);
      if (close) { c.quirk(r, "collo_lungo", "allunga il collo come una giraffa sul palo"); return 0.08; }
      return 0;
    },
  },
  {
    id: "allungo", name: "Allungo bruciante", polarity: "+", rarity: 2,
    desc: "Quando lancia lo sprint ha un'accelerazione devastante.",
    tick(r, c) {
      if (r.kicking && running(r) && once(r, "allungo")) {
        c.mod(r, { speed: 1.04, accel: 1.35, dur: 5, label: "allungo" });
        c.quirk(r, "allungo", "piazza un allungo bruciante");
      }
    },
  },
  {
    id: "testa_a_testa", name: "Testa a testa", polarity: "+", rarity: 2,
    desc: "Nei duelli ravvicinati del finale tira fuori qualcosa in più.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 160 && c.beside(r) && cd(r, "duello", c, 3)) {
        c.mod(r, { speed: 1.035, dur: 3, label: "duello" });
        if (uses(r, "tat", 1)) c.quirk(r, "testa_a_testa", "non molla nel testa a testa", c.beside(r) ?? undefined);
      }
    },
  },
  {
    id: "esultanza", name: "Esultanza precoce", polarity: "-", rarity: 2,
    desc: "Quando è in testa nel finale esulta prima del traguardo.",
    tick(r, c) {
      if (running(r) && r.rank === 1 && c.rem(r) < 70 && once(r, "esultanza")) {
        const s = c.order()[1];
        if (s && r.p - s.p > 1.5 && c.rng.chance(0.6)) {
          c.mod(r, { speed: 0.87, dur: 999, label: "esulta" });
          c.quirk(r, "esultanza", "esulta prima del traguardo!");
        }
      }
    },
  },
  {
    id: "braccino", name: "Braccino", polarity: "-", rarity: 1,
    desc: "In testa nel finale sente la pressione e si irrigidisce.",
    tick(r, c) {
      if (running(r) && r.rank === 1 && c.rem(r) < 200 && once(r, "braccino")) {
        c.mod(r, { speed: 0.96, cost: 1.1, dur: 999, label: "braccino" });
        c.arouse(r, 0.3);
        c.quirk(r, "braccino", "sente la pressione: gli viene il braccino");
      }
    },
  },
  // ---------------- SOCIALI ----------------
  {
    id: "gregario", name: "Gregario", polarity: "±", rarity: 1,
    desc: "Segue chi gli sta davanti come un'ombra: risparmia energia ma attacca tardi.",
    setup(r) { r.plan.patience = Math.max(r.plan.patience, 0.95); },
    tick(r, c) {
      const a = c.ahead(r, 5);
      if (a && running(r) && c.rem(r) > 220) {
        r.targetD += (a.d - r.targetD) * 0.05;
        c.mod(r, { cost: 0.95, dur: 0.1, label: "gregario" });
        if (c.t > 20 && once(r, "gregario")) c.quirk(r, "gregario", "si accoda come un gregario", a);
      }
    },
  },
  {
    id: "innamorato", name: "Innamorato", polarity: "±", rarity: 2,
    desc: "Si innamora facilmente e rallenta per correre accanto alla sua fiamma.",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && o.h.sex !== r.h.sex && c.chance(0.2) && cd(r, "amore", c, 15)) {
        c.mod(r, { speed: 0.97, dur: 3, label: "innamorato" });
        r.targetD = o.d + (r.d > o.d ? 1 : -1);
        c.quirk(r, "innamorato", `si è innamorato di ${o.h.name}`, o);
      }
    },
  },
  {
    id: "capobranco", name: "Capobranco", polarity: "+", rarity: 3,
    desc: "Quando comanda il gruppo, chi lo insegue si sente in soggezione.",
    tick(r, c) {
      if (running(r) && r.rank === 1) {
        for (const o of c.near(r, 7, 6)) if (o.p < r.p) o.arousal += 0.05 * c.dt * 4;
        r.comfort = Math.max(r.comfort, 0.3);
        if (frac(r, c) > 0.4 && once(r, "capobranco")) c.quirk(r, "capobranco", "detta legge da capobranco");
      }
    },
  },
  {
    id: "pacifista", name: "Pacifista", polarity: "±", rarity: 1,
    desc: "Evita ogni contatto: incassa meglio i colpi ma nel traffico si tira indietro.",
    bumped(r, o, impact, c) { if (once(r, "pacifista_rev")) c.quirk(r, "pacifista", "incassa il colpo senza scomporsi", o); },
    tick(r, c) { if (running(r) && c.near(r, 2, 1.6).length >= 2) c.mod(r, { speed: 0.985, dur: 0.1, label: "si tira indietro" }); },
  },
  {
    id: "lepre", name: "Lepre", polarity: "±", rarity: 1,
    desc: "Nato per fare l'andatura: parte fortissimo, poi paga.",
    setup(r) { r.plan.early *= 1.04; r.plan.mid *= 1.02; },
    tick(r, c) { if (running(r) && frac(r, c) > 0.3 && r.rank <= 2 && once(r, "lepre")) c.quirk(r, "lepre", "fa la lepre e detta un ritmo infernale"); },
  },
  {
    id: "maestro_scia", name: "Maestro della scia", polarity: "+", rarity: 2,
    desc: "Sfrutta la scia degli altri come nessuno.",
    tick(r, c) {
      const a = c.ahead(r, 3);
      if (a && running(r) && Math.abs(a.d - r.d) < 0.9) {
        c.mod(r, { cost: 0.9, dur: 0.1, label: "scia" });
        r.q.scia = (r.q.scia ?? 0) + c.dt;
        if (r.q.scia > 10 && once(r, "maestro_scia")) c.quirk(r, "maestro_scia", "succhia la scia come un ciclista", a);
      }
    },
  },
  {
    id: "calamita", name: "Calamita", polarity: "±", rarity: 2,
    desc: "Attira gli altri cavalli: intorno a lui si fa sempre mucchio.",
    tick(r, c) {
      if (!running(r)) return;
      const n = c.near(r, 6, 5);
      for (const o of n) o.targetD += (r.d - o.targetD) * 0.01;
      if (n.length >= 3 && once(r, "calamita")) c.quirk(r, "calamita", "attira tutto il gruppo come una calamita");
    },
  },
  {
    id: "imitatore", name: "Imitatore", polarity: "±", rarity: 1,
    desc: "Copia il ritmo di chi ha accanto.",
    tick(r, c) {
      const o = c.beside(r) ?? c.ahead(r, 3);
      if (o && running(r) && c.rem(r) > 300 && c.chance(0.05) && cd(r, "imita", c, 12)) {
        r.q.copia = { i: o.i, until: c.t + 5 };
        if (uses(r, "imit_rev", 1)) c.quirk(r, "imitatore", "si mette a copiare il ritmo di", o);
      }
      const cp = r.q.copia;
      if (cp && c.t < cp.until) r.v += (c.runners[cp.i].v - r.v) * 0.08;
    },
  },
  {
    id: "ombra", name: "Ombra", polarity: "±", rarity: 2,
    desc: "Sceglie un rivale e gli si incolla al fianco per tutta la gara.",
    start(r, c) {
      let best: Runner | null = null;
      for (const o of c.runners) if (o !== r && (!best || Math.abs(o.h.rating - r.h.rating) < Math.abs(best.h.rating - r.h.rating))) best = o;
      if (best) r.q.ombra = best.i;
    },
    tick(r, c) {
      if (r.q.ombra === undefined || !running(r)) return;
      const o = c.runners[r.q.ombra];
      if (o.status === "dnf" || o.status === "fallen") return;
      if (c.rem(r) > 250) {
        r.targetD += (o.d + 1.1 - r.targetD) * 0.03;
        if (Math.abs(o.p - r.p) < 3 && c.t > 15 && once(r, "ombra_rev")) c.quirk(r, "ombra", "si è incollato come un'ombra a", o);
      } else if (Math.abs(o.p - r.p) < 3) c.mod(r, { speed: 1.02, dur: 0.1, label: "ombra" });
    },
  },
  {
    id: "sognatore", name: "Sognatore", polarity: "-", rarity: 1,
    desc: "Ogni tanto si perde nei suoi pensieri e rallenta.",
    tick(r, c) {
      if (running(r) && c.chance(0.03) && cd(r, "sogno", c, 9)) {
        c.mod(r, { speed: 0.95, dur: 2, label: "sogna" });
        if (uses(r, "sogno_rev", 1)) c.quirk(r, "sognatore", "si perde nei suoi sogni");
      }
    },
  },
  // ---------------- ENERGIA ----------------
  {
    id: "diesel", name: "Diesel", polarity: "±", rarity: 1,
    desc: "Lento a scaldarsi, poi non si ferma più.",
    tick(r, c) {
      if (!running(r)) return;
      const f = frac(r, c);
      if (f < 0.4) c.mod(r, { speed: 0.965, dur: 0.1, label: "a freddo" });
      else if (f > 0.6) { c.mod(r, { speed: 1.025, cost: 0.95, dur: 0.1, label: "diesel" }); if (once(r, "diesel")) c.quirk(r, "diesel", "si è scaldato: ora va come un diesel"); }
    },
  },
  {
    id: "seconda_giovinezza", name: "Seconda giovinezza", polarity: "+", rarity: 3,
    desc: "Quando sembra finito, trova energie insperate.",
    tick(r, c) {
      if (r.exhausted && running(r) && once(r, "seconda_giovinezza")) {
        r.dprime = r.dmax * 0.35;
        r.exhausted = false;
        c.quirk(r, "seconda_giovinezza", "sembrava finito e invece trova energie insperate!");
      }
    },
  },
  {
    id: "fiato_corto", name: "Fiato corto", polarity: "-", rarity: 1,
    desc: "Ha meno riserva per gli sprint.",
    setup(r) { r.dmax *= 0.85; r.dprime = r.dmax; },
    tick(r, c) { if (r.exhausted && once(r, "fiato_corto")) c.quirk(r, "fiato_corto", "ha il fiato corto e si pianta"); },
  },
  {
    id: "polmoni_acciaio", name: "Polmoni d'acciaio", polarity: "+", rarity: 2,
    desc: "Regge ritmi altissimi senza stancarsi.",
    setup(r) { r.cs *= 1.02; },
    tick(r, c) { if (running(r) && c.rem(r) < 300 && !r.exhausted && r.rank <= 3 && once(r, "polmoni_acciaio")) c.quirk(r, "polmoni_acciaio", "ha polmoni d'acciaio: non cala di un metro"); },
  },
  {
    id: "esplosivo", name: "Esplosivo", polarity: "+", rarity: 2,
    desc: "Nel finale ha uno scatto esplosivo, breve ma devastante.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 380 && once(r, "esplosivo")) {
        c.mod(r, { speed: 1.065, accel: 1.5, cost: 1.6, dur: 4, label: "esplosione" });
        c.quirk(r, "esplosivo", "esplode in uno scatto devastante");
      }
    },
  },
  {
    id: "pigro", name: "Pigro", polarity: "-", rarity: 1,
    desc: "Corre al risparmio finché il fantino non lo sveglia con la frusta.",
    tick(r, c) {
      if (!running(r)) return;
      if (r.whipT > c.t - 0.1) {
        c.mod(r, { speed: 1.05, dur: 3, label: "svegliato" });
        if (once(r, "pigro")) c.quirk(r, "pigro", "era pigro: solo la frusta lo sveglia");
      } else c.mod(r, { speed: 0.975, dur: 0.1, label: "pigro" });
    },
  },
  {
    id: "stakanovista", name: "Stakanovista", polarity: "+", rarity: 2,
    desc: "Efficiente come un orologio: consuma meno di tutti.",
    setup(r) { r.mods.push({ speed: 1, cost: 0.95, lat: 1, accel: 1, until: 999, label: "efficiente" }); },
    tick(r, c) { if (frac(r, c) > 0.7 && r.dprime / r.dmax > 0.4 && once(r, "stakanovista")) c.quirk(r, "stakanovista", "ha ancora energie da vendere: è uno stakanovista"); },
  },
  {
    id: "falso_sprint", name: "Falso sprint", polarity: "-", rarity: 1,
    desc: "Si lancia troppo presto, convinto che sia il finale.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 950 && c.rem(r) > 700 && once(r, "falso_sprint")) {
        c.mod(r, { speed: 1.06, cost: 1.3, dur: 6, label: "falso sprint" });
        c.quirk(r, "falso_sprint", "parte troppo presto: crede sia già il finale");
      }
    },
  },
  // ---------------- CONDIZIONI ----------------
  {
    id: "ranocchio", name: "Ranocchio", polarity: "+", rarity: 1,
    desc: "Nel fango ci sguazza.",
    start(r, c) { if (c.spec.going === "pesante" || c.spec.going === "morbido") { c.mod(r, { speed: 1.04, dur: 999, label: "nel fango" }); c.quirk(r, "ranocchio", "nel fango ci sguazza come un ranocchio"); } },
  },
  {
    id: "zoccoli_oro", name: "Zoccoli d'oro", polarity: "+", rarity: 1,
    desc: "Sul terreno secco vola.",
    start(r, c) { if (c.spec.going === "secco") { c.mod(r, { speed: 1.03, dur: 999, label: "terreno secco" }); c.quirk(r, "zoccoli_oro", "sul secco ha gli zoccoli d'oro"); } },
  },
  {
    id: "figlio_pioggia", name: "Figlio della pioggia", polarity: "+", rarity: 2,
    desc: "Sotto la pioggia diventa un altro cavallo.",
    start(r, c) { if (c.spec.weather === "pioggia" || c.spec.weather === "temporale") { c.mod(r, { speed: 1.035, dur: 999, label: "pioggia" }); r.arousal = 0; c.quirk(r, "figlio_pioggia", "è figlio della pioggia: si trasforma"); } },
  },
  {
    id: "freddoloso", name: "Freddoloso", polarity: "-", rarity: 1,
    desc: "Col freddo e la neve si irrigidisce.",
    start(r, c) { if (c.spec.venue === "dolomiti" || c.spec.weather === "neve") { c.mod(r, { speed: 0.96, dur: 999, label: "freddo" }); c.quirk(r, "freddoloso", "è freddoloso e corre irrigidito"); } },
  },
  {
    id: "re_curve", name: "Re delle curve", polarity: "+", rarity: 2,
    desc: "In curva resta incollato alla corda e guadagna terreno.",
    tick(r, c) {
      if (c.inCurve(r) && running(r)) {
        c.mod(r, { speed: 1.02, lat: 1.6, dur: 0.1, label: "curva" });
        r.targetD = Math.max(0.5, r.targetD - 0.02);
        if (frac(r, c) > 0.25 && once(r, "re_curve")) c.quirk(r, "re_curve", "pennella la curva come un campione");
      }
    },
  },
  {
    id: "largo_curva", name: "Largo in curva", polarity: "-", rarity: 1,
    desc: "In curva va sempre largo e fa più strada.",
    tick(r, c) {
      if (c.inCurve(r) && running(r)) {
        c.push(r, 0.4 * c.dt * 4);
        if (once(r, "largo_curva")) c.quirk(r, "largo_curva", "va larghissimo in curva");
      }
    },
  },
  {
    id: "missile", name: "Missile da rettilineo", polarity: "+", rarity: 2,
    desc: "Sul rettilineo finale è un missile.",
    tick(r, c) { if (running(r) && homeStraight(r, c)) { c.mod(r, { speed: 1.025, dur: 0.1, label: "missile" }); if (once(r, "missile")) c.quirk(r, "missile", "sul rettilineo diventa un missile"); } },
  },
  {
    id: "cammello", name: "Cammello", polarity: "+", rarity: 1,
    desc: "Sulla sabbia è a casa sua.",
    start(r, c) { if (c.spec.venue === "saline") { c.mod(r, { speed: 1.04, dur: 999, label: "sabbia" }); c.quirk(r, "cammello", "sulla sabbia va come un cammello"); } },
  },
  {
    id: "velista", name: "Velista", polarity: "±", rarity: 1,
    desc: "Col vento forte sa ripararsi e soffre meno.",
    start(r, c) { if (c.spec.weather === "vento" || c.spec.weather === "temporale") { c.mod(r, { cost: 0.95, dur: 999, label: "vento" }); c.quirk(r, "velista", "sa sfruttare il vento come un velista"); } },
  },
  // ---------------- SALTO ----------------
  {
    id: "canguro", name: "Canguro", polarity: "±", rarity: 1,
    desc: "Salta altissimo: sicuro ma perde tempo.",
    hurdle(r, c) { c.mod(r, { speed: 0.95, dur: 1, label: "salto alto" }); c.quirk(r, "canguro", "salta l'ostacolo come un canguro: altissimo"); return 0.12; },
  },
  {
    id: "rifiutatore", name: "Rifiutatore", polarity: "-", rarity: 1,
    desc: "Tende a rifiutare gli ostacoli.",
    hurdle(r, c) { r.q.rifiuta = true; return -0.25; },
  },
  {
    id: "saltatore_nato", name: "Saltatore nato", polarity: "+", rarity: 2,
    desc: "Salta come se volasse e riatterra più veloce.",
    hurdle(r, c) { c.mod(r, { speed: 1.03, dur: 2, label: "atterraggio" }); c.quirk(r, "saltatore_nato", "vola sopra l'ostacolo"); return 0.15; },
  },
  {
    id: "ostacoli_immaginari", name: "Ostacoli immaginari", polarity: "-", rarity: 2,
    desc: "In piano salta ostacoli che vede solo lui.",
    tick(r, c) {
      if (!c.spec.hurdles && running(r) && c.chance(0.01) && cd(r, "immag", c, 15)) {
        c.energy(r, 3);
        c.mod(r, { speed: 0.92, dur: 1, label: "salto nel vuoto" });
        c.quirk(r, "ostacoli_immaginari", "salta un ostacolo che vede solo lui!");
      }
    },
  },
  // ---------------- FORTUNA ----------------
  {
    id: "gatto_nero", name: "Gatto nero", polarity: "±", rarity: 2,
    desc: "Porta sfortuna a chi gli corre vicino.",
    tick(r, c) {
      if (!running(r) || !c.chance(0.012)) return;
      const n = c.near(r, 3, 2.5);
      if (n.length) {
        const o = c.rng.pick(n);
        c.stumble(o, 0.3, "sfortuna");
        if (once(r, "gatto_nero")) c.quirk(r, "gatto_nero", "porta sfortuna: inciampa chi gli è vicino", o);
      }
    },
  },
  {
    id: "quadrifoglio", name: "Quadrifoglio", polarity: "+", rarity: 2,
    desc: "Fortunato: inciampa raramente ed evita i guai.",
    setup(r) { r.luck += 0.6; },
    hazard(r, hz, c) { if (c.rng.chance(0.6)) { c.quirk(r, "quadrifoglio", "evita il pericolo per un pelo: che fortuna!"); return true; } return false; },
  },
  {
    id: "calamita_guai", name: "Calamita dei guai", polarity: "-", rarity: 1,
    desc: "Sfortunato cronico: se c'è un guaio, capita a lui.",
    setup(r) { r.luck -= 0.6; },
    tick(r, c) { if (r.status === "stumble" && once(r, "calamita_guai")) c.quirk(r, "calamita_guai", "è una calamita per i guai"); },
  },
  {
    id: "piedi_burro", name: "Piedi di burro", polarity: "-", rarity: 1,
    desc: "Inciampa da solo, anche senza motivo.",
    tick(r, c) { if (running(r) && c.t > 3 && c.chance(0.008) && cd(r, "burro", c, 20)) { c.stumble(r, 0.3, "piedi di burro"); c.quirk(r, "piedi_burro", "inciampa nei suoi stessi zoccoli"); } },
  },
  {
    id: "perde_ferri", name: "Perde i ferri", polarity: "-", rarity: 1,
    desc: "Ogni tanto perde un ferro durante la corsa.",
    tick(r, c) {
      if (running(r) && c.t > 5 && c.chance(0.004) && once(r, "perde_ferri")) {
        c.mod(r, { speed: 0.97, dur: 999, label: "senza un ferro" });
        c.quirk(r, "perde_ferri", "perde un ferro: vola via sulla pista!");
      }
    },
  },
  {
    id: "starnutone", name: "Starnutone", polarity: "-", rarity: 1,
    desc: "Starnutisce correndo, e spaventa chi gli sta vicino.",
    tick(r, c) {
      if (running(r) && c.chance(0.02) && cd(r, "starn", c, 10)) {
        c.mod(r, { speed: 0.9, dur: 0.8, label: "starnuto" });
        for (const o of c.near(r, 3, 2.5)) c.arouse(o, 0.12);
        if (uses(r, "starn_rev", 1)) c.quirk(r, "starnutone", "fa uno starnuto colossale");
      }
    },
  },
  // ---------------- MENTE ----------------
  {
    id: "monaco_zen", name: "Monaco zen", polarity: "+", rarity: 3,
    desc: "Niente lo spaventa: urla, botti e folla gli scivolano addosso.",
    setup(r) { r.q.zenFactor = 0.25; },
    tick(r, c) { if ((r.stimNow[SI.urla] > 0.3 || r.stimNow[SI.botti] > 0.3) && once(r, "monaco_zen")) c.quirk(r, "monaco_zen", "resta impassibile come un monaco zen"); },
  },
  {
    id: "distratto", name: "Distratto", polarity: "-", rarity: 1,
    desc: "Si distrae facilmente: un piccione, una bandierina...",
    tick(r, c) {
      if (running(r) && c.chance(0.025) && cd(r, "distr", c, 10)) {
        c.mod(r, { speed: 0.94, dur: 2, label: "distratto" });
        c.push(r, c.rng.range(-0.6, 0.6));
        if (uses(r, "distr_rev", 1)) c.quirk(r, "distratto", c.rng.pick(["si distrae a guardare un piccione", "si incanta a guardare una bandierina", "si gira a guardare un elicottero"]));
      }
    },
  },
  {
    id: "lunatico", name: "Lunatico", polarity: "±", rarity: 1,
    desc: "Ha giornate di grazia e giornate no, senza vie di mezzo.",
    setup(r, c) { const good = c.rng.chance(0.5); r.form *= good ? c.rng.range(1.025, 1.05) : c.rng.range(0.95, 0.975); r.q.lun = good; },
    start(r, c) { c.quirk(r, "lunatico", r.q.lun ? "oggi è nella sua giornata di grazia" : "oggi si è svegliato con la luna storta"); },
  },
  {
    id: "orgoglioso", name: "Orgoglioso", polarity: "+", rarity: 1,
    desc: "Se lo superano, reagisce d'orgoglio.",
    overtaken(r, by, c) {
      if (cd(r, "orgoglio", c, 10)) {
        c.mod(r, { speed: 1.04, dur: 4, label: "orgoglio" });
        if (uses(r, "org_rev", 1)) c.quirk(r, "orgoglioso", "reagisce d'orgoglio dopo il sorpasso di", by);
      }
    },
  },
  {
    id: "rancoroso", name: "Rancoroso", polarity: "±", rarity: 2,
    desc: "Non dimentica: vicino ai rivali di sempre corre arrabbiato.",
    tick(r, c) {
      if (!running(r)) return;
      for (const o of c.near(r, 4, 3)) {
        const g = r.h.mind.grudge[o.h.id];
        if (g && Math.abs(g.v) > 0.25) {
          c.mod(r, { speed: 1.03, cost: 1.05, dur: 0.1, label: "rancore" });
          if (once(r, "rancoroso")) c.quirk(r, "rancoroso", "vede il suo vecchio rivale e si infuria:", o);
          break;
        }
      }
    },
  },
  {
    id: "fatalista", name: "Fatalista", polarity: "±", rarity: 1,
    desc: "Né paura né entusiasmo: corre e basta.",
    tick(r, c) {
      r.arousal = 0;
      r.comfort = 0;
      if (r.stimNow[SI.contatto] > 0.3 && once(r, "fatalista")) c.quirk(r, "fatalista", "non fa una piega: è un fatalista");
    },
  },
  {
    id: "primadonna", name: "Primadonna", polarity: "±", rarity: 1,
    desc: "Deve stare davanti: se è in testa vola, se no tiene il muso.",
    tick(r, c) {
      if (!running(r) || frac(r, c) < 0.55) return;
      if (r.rank <= 1) c.mod(r, { speed: 1.02, dur: 0.1, label: "primadonna" });
      else if (r.rank > 3) c.mod(r, { speed: 0.975, dur: 0.1, label: "tiene il muso" });
      if (once(r, "primadonna")) c.quirk(r, "primadonna", r.rank <= 1 ? "è in testa e fa la primadonna" : "non è davanti e tiene il muso da primadonna");
    },
  },
  {
    id: "spaccone", name: "Spaccone", polarity: "±", rarity: 1,
    desc: "Nelle grandi occasioni parte a tutta per farsi vedere.",
    start(r, c) { if (c.spec.big || c.spec.spectators > 0.7) { c.mod(r, { speed: 1.04, cost: 1.08, dur: 15, label: "spaccone" }); c.quirk(r, "spaccone", "fa lo spaccone e parte a tutta davanti al pubblico"); } },
  },
  {
    id: "malinconico", name: "Malinconico", polarity: "-", rarity: 1,
    desc: "Il grigio del cielo gli mette tristezza.",
    start(r, c) { if (["nuvoloso", "nebbia", "pioggia"].includes(c.spec.weather)) { c.mod(r, { speed: 0.975, dur: 999, label: "malinconia" }); c.quirk(r, "malinconico", "il cielo grigio gli mette malinconia"); } },
  },
  {
    id: "testardo", name: "Testardo", polarity: "-", rarity: 1,
    desc: "Non cambia corsia neanche se è chiuso.",
    setup(r) { r.q.fisso = true; r.plan.patience = 1; },
    tick(r, c) {
      const a = c.ahead(r, 3);
      if (a && Math.abs(a.d - r.d) < 1 && running(r)) {
        r.q.bloccato = (r.q.bloccato ?? 0) + c.dt;
        if (r.q.bloccato > 3 && once(r, "testardo")) c.quirk(r, "testardo", "è chiuso ma testardo: non cambia corsia", a);
      }
    },
  },
  // ---------------- STRAVAGANTI ----------------
  {
    id: "anima_gemella", name: "Anima gemella del fantino", polarity: "+", rarity: 2,
    desc: "Col fantino c'è un'intesa perfetta: la frusta lo esalta.",
    setup(r) { r.q.whipBoost = 2; },
    tick(r, c) { if (r.whipT > c.t - 0.1 && once(r, "anima_gemella")) c.quirk(r, "anima_gemella", "ha un'intesa perfetta col fantino"); },
  },
  {
    id: "disarcionatore", name: "Disarcionatore", polarity: "-", rarity: 3,
    desc: "Può disarcionare il fantino in piena corsa.",
    tick(r, c) {
      if (running(r) && c.t > 6 && c.chance(0.0025) && once(r, "disarcionatore")) {
        r.riderless = true;
        c.ev({ k: "riderless", a: r.i });
        c.quirk(r, "disarcionatore", "disarciona il fantino! Corre scosso");
      }
    },
  },
  {
    id: "mangiatutto", name: "Mangiatutto", polarity: "+", rarity: 2,
    desc: "Mangia qualsiasi cosa trovi in pista. Bucce di banana comprese.",
    hazard(r, hz, c) {
      if (hz.kind === "buccia" || hz.kind === "olio") { c.quirk(r, "mangiatutto", hz.kind === "buccia" ? "si mangia la buccia di banana!" : "lecca l'olio dalla pista, disgustoso ma efficace"); return true; }
      return false;
    },
  },
  {
    id: "fiuta_trappole", name: "Fiuta-trappole", polarity: "+", rarity: 2,
    desc: "Sente il pericolo da lontano e lo schiva.",
    hazard(r, hz, c) { if (c.rng.chance(0.85)) { c.push(r, r.d > hz.d ? 1.5 : -1.5); c.quirk(r, "fiuta_trappole", "fiuta la trappola e la schiva"); return true; } return false; },
  },
  {
    id: "elettrico", name: "Elettrico", polarity: "±", rarity: 1,
    desc: "Scatti improvvisi e imprevedibili, come una scarica elettrica.",
    tick(r, c) {
      if (running(r) && c.chance(0.02) && cd(r, "elet", c, 8)) {
        c.mod(r, { speed: 1.07, cost: 1.5, dur: 1.2, label: "scarica" });
        if (uses(r, "elet_rev", 1)) c.quirk(r, "elettrico", "ha una scarica elettrica improvvisa");
      }
    },
  },
  {
    id: "tartaruga", name: "Accelerazione da tartaruga", polarity: "-", rarity: 1,
    desc: "Ci mette un'eternità a prendere velocità.",
    setup(r) { r.accel0 *= 0.7; },
    tick(r, c) { if (c.t > 3 && c.t < 7 && r.rank > c.runners.length * 0.6 && once(r, "tartaruga")) c.quirk(r, "tartaruga", "accelera come una tartaruga"); },
  },
  {
    id: "empatico", name: "Empatico", polarity: "±", rarity: 2,
    desc: "Assorbe le emozioni dei cavalli intorno a lui.",
    tick(r, c) {
      if (!running(r)) return;
      const n = c.near(r, 4, 3);
      if (!n.length) return;
      const avg = n.reduce((a, o) => a + o.arousal, 0) / n.length;
      r.arousal += (avg - r.arousal) * 0.05;
      if (avg > 0.4 && once(r, "empatico")) c.quirk(r, "empatico", "assorbe l'agitazione dei vicini");
    },
  },
  {
    id: "succhiaruote", name: "Succhiaruote", polarity: "±", rarity: 2,
    desc: "In scia recupera energie, ma non vuole mai stare davanti prima del finale.",
    setup(r) { r.plan.patience = 1; r.plan.early = Math.min(r.plan.early, 0.98); },
    tick(r, c) {
      const a = c.ahead(r, 3);
      if (a && running(r) && Math.abs(a.d - r.d) < 1) {
        r.dprime = Math.min(r.dmax, r.dprime + 0.5 * c.dt);
        if (c.t > 25 && once(r, "succhiaruote")) c.quirk(r, "succhiaruote", "sta succhiando le ruote di", a);
      }
    },
  },
  {
    id: "fantasma", name: "Fantasma", polarity: "+", rarity: 4,
    desc: "Leggendario: passa nei varchi più stretti come se non ci fosse.",
    setup(r) { r.q.ghost = true; r.luck += 0.3; },
    bumped(r, o, impact, c) { if (once(r, "fantasma")) c.quirk(r, "fantasma", "passa nel varco come un fantasma", o); },
  },
  {
    id: "leggenda", name: "Leggenda", polarity: "+", rarity: 4,
    desc: "Leggendario: nelle grandi corse diventa imbattibile.",
    setup(r, c) { if (c.spec.big) { r.vmax *= 1.025; r.cs *= 1.025; } },
    tick(r, c) { if (c.spec.big && c.rem(r) < 400 && once(r, "leggenda")) c.quirk(r, "leggenda", "nelle grandi corse diventa una leggenda"); },
  },
  {
    id: "showman", name: "Showman", polarity: "+", rarity: 2,
    desc: "Più pubblico c'è, meglio corre.",
    tick(r, c) {
      if (running(r) && homeStraight(r, c) && c.spec.spectators > 0.3) {
        c.mod(r, { speed: 1 + 0.035 * c.spec.spectators, dur: 0.1, label: "show" });
        if (once(r, "showman")) c.quirk(r, "showman", "si esalta davanti al pubblico: è uno showman");
      }
    },
  },
  // ---------------- ALTRI ----------------
  {
    id: "giraffa", name: "Si allunga", polarity: "+", rarity: 2,
    desc: "Quando lo sprint si fa duro allunga la falcata a dismisura.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 250 && r.kicking && once(r, "giraffa")) {
        c.mod(r, { speed: 1.03, cost: 1.1, dur: 999, label: "falcata lunga" });
        c.quirk(r, "giraffa", "si allunga in una falcata infinita");
      }
    },
  },
  {
    id: "ipnotico", name: "Sguardo ipnotico", polarity: "+", rarity: 3,
    desc: "Fissa i rivali che lo affiancano e li paralizza per un attimo.",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && c.chance(0.12) && cd(r, "ipno", c, 12)) {
        c.mod(o, { speed: 0.95, dur: 1.5, label: "ipnotizzato" });
        c.quirk(r, "ipnotico", "fissa negli occhi e ipnotizza", o);
      }
    },
  },
  {
    id: "permaloso", name: "Permaloso", polarity: "-", rarity: 1,
    desc: "Se lo toccano si offende e rallenta.",
    bumped(r, o, impact, c) {
      if (impact > 0.3 && cd(r, "perm", c, 6)) {
        c.mod(r, { speed: 0.96, dur: 3, label: "offeso" });
        if (uses(r, "perm_rev", 1)) c.quirk(r, "permaloso", "si offende per il contatto con", o);
      }
    },
  },
  {
    id: "cuor_di_leone", name: "Cuor di leone", polarity: "+", rarity: 2,
    desc: "Più è dura, più dà: dopo un contatto reagisce con rabbia.",
    bumped(r, o, impact, c) {
      if (impact > 0.3 && cd(r, "leone", c, 6)) {
        c.mod(r, { speed: 1.035, dur: 3, label: "cuor di leone" });
        if (uses(r, "leone_rev", 1)) c.quirk(r, "cuor_di_leone", "ha un cuore di leone: il contatto lo carica", o);
      }
    },
  },
  {
    id: "corda_magnetica", name: "Calamitato alla corda", polarity: "+", rarity: 1,
    desc: "Si incolla allo steccato interno e risparmia metri preziosi.",
    setup(r) { r.plan.rail = 1; },
    tick(r, c) { if (running(r) && r.d < 0.9 && c.inCurve(r) && frac(r, c) > 0.3 && once(r, "corda_magnetica")) c.quirk(r, "corda_magnetica", "corre incollato allo steccato"); },
  },
  {
    id: "esterno", name: "Amante dell'esterno", polarity: "±", rarity: 1,
    desc: "Odia la corda: corre sempre largo, lontano da tutti.",
    setup(r) { r.plan.rail = 0; },
    tick(r, c) { if (running(r)) { r.targetD = Math.max(r.targetD, 5); if (c.t > 12 && once(r, "esterno")) c.quirk(r, "esterno", "corre larghissimo, lontano da tutti"); } },
  },
  {
    id: "rimonta_furiosa", name: "Rimonta furiosa", polarity: "+", rarity: 2,
    desc: "Dalle retrovie, nel finale, si scatena.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 500 && r.rank > c.runners.length / 2 && once(r, "rimonta_furiosa")) {
        c.mod(r, { speed: 1.045, dur: 8, label: "rimonta" });
        c.quirk(r, "rimonta_furiosa", "dalle retrovie scatena una rimonta furiosa");
      }
    },
  },
  {
    id: "abitudinario", name: "Abitudinario", polarity: "±", rarity: 1,
    desc: "Nell'ippodromo dove ha già vinto si sente a casa.",
    start(r, c) {
      const won = r.h.venuesWon?.includes(c.spec.venue);
      if (won) { c.mod(r, { speed: 1.025, dur: 999, label: "a casa" }); c.quirk(r, "abitudinario", "qui ha già vinto: si sente a casa"); }
      else c.mod(r, { speed: 0.99, dur: 999, label: "pista nuova" });
    },
  },
  {
    id: "vecchia_volpe", name: "Vecchia volpe", polarity: "+", rarity: 2,
    desc: "Con l'esperienza impara il doppio dalle corse.",
    setup(r) { r.q.learn2 = true; },
    tick(r, c) { if (r.h.mind.races >= 5 && frac(r, c) > 0.5 && once(r, "vecchia_volpe")) c.quirk(r, "vecchia_volpe", "corre con l'astuzia di una vecchia volpe"); },
  },
  {
    id: "smemorato", name: "Smemorato", polarity: "±", rarity: 1,
    desc: "Dimentica in fretta: sia le paure sia le lezioni.",
    setup(r) { r.q.forget = true; },
    start(r, c) { if (r.h.mind.races >= 3) c.quirk(r, "smemorato", "non si ricorda niente delle corse precedenti"); },
  },
  {
    id: "tifoso_casa", name: "Beniamino del pubblico", polarity: "+", rarity: 2,
    desc: "La folla lo adora e lo spinge: il boato lo trascina.",
    tick(r, c) {
      if (running(r) && r.stimNow[SI.folla] > 0.3) {
        r.arousal *= 0.95;
        c.mod(r, { speed: 1.02, dur: 0.1, label: "boato" });
        if (once(r, "tifoso_casa")) c.quirk(r, "tifoso_casa", "è il beniamino del pubblico: il boato lo trascina");
      }
    },
  },
  {
    id: "nervoso", name: "Nervoso", polarity: "-", rarity: 1,
    desc: "Si agita per niente e spreca energie.",
    tick(r, c) {
      if (running(r)) {
        r.arousal = Math.max(r.arousal, 0.25);
        if (c.t > 8 && once(r, "nervoso")) c.quirk(r, "nervoso", "è nervosissimo e spreca energie");
      }
    },
  },
  {
    id: "sportivo", name: "Sportivo", polarity: "±", rarity: 1,
    desc: "Se un rivale cade, rallenta per controllare che stia bene.",
    tick(r, c) {
      if (!running(r)) return;
      const f = c.runners.find((o) => o.status === "fallen" && Math.abs(o.p - r.p) < 15);
      if (f && once(r, "sportivo")) { c.mod(r, { speed: 0.9, dur: 2, label: "sportività" }); c.quirk(r, "sportivo", "rallenta per vedere se sta bene", f); }
    },
  },
  {
    id: "sciacallo", name: "Sciacallo", polarity: "+", rarity: 1,
    desc: "Quando qualcuno vicino è in difficoltà, ne approfitta.",
    tick(r, c) {
      if (!running(r)) return;
      const f = c.near(r, 6, 4).find((o) => o.status === "stumble" || o.status === "rear" || o.status === "fallen");
      if (f && cd(r, "sciac", c, 8)) {
        c.mod(r, { speed: 1.04, dur: 2.5, label: "sciacallo" });
        if (uses(r, "sciac_rev", 1)) c.quirk(r, "sciacallo", "approfitta dei guai di", f);
      }
    },
  },
  {
    id: "puntiglioso", name: "Puntiglioso", polarity: "+", rarity: 1,
    desc: "Corre con un ritmo regolarissimo, metro dopo metro.",
    setup(r) { r.form = 1 + (r.form - 1) * 0.3; r.q.reg = true; },
    tick(r, c) { if (frac(r, c) > 0.5 && once(r, "puntiglioso")) c.quirk(r, "puntiglioso", "ha un ritmo regolare come un metronomo"); },
  },
  {
    id: "freno_a_mano", name: "Freno a mano", polarity: "-", rarity: 1,
    desc: "Frena in vista dell'ostacolo o della curva, anche quando non serve.",
    tick(r, c) {
      if (running(r) && c.inCurve(r) && !r.q.inCurva) {
        r.q.inCurva = true;
        c.mod(r, { speed: 0.93, dur: 1.2, label: "frena" });
        if (once(r, "freno_a_mano")) c.quirk(r, "freno_a_mano", "tira il freno a mano all'ingresso della curva");
      }
      if (!c.inCurve(r)) r.q.inCurva = false;
    },
  },
  {
    id: "nuvola_polvere", name: "Nuvola di polvere", polarity: "±", rarity: 2,
    desc: "Alza così tanta terra che chi lo segue non vede niente.",
    tick(r, c) {
      if (!running(r) || (c.spec.venue !== "tavoliere" && c.spec.venue !== "saline")) return;
      const b = c.behind(r, 4);
      if (b && Math.abs(b.d - r.d) < 1.2) {
        c.stim(b, "luci", 0.5);
        c.mod(b, { speed: 0.985, dur: 0.1, label: "polvere" });
        if (once(r, "nuvola_polvere")) c.quirk(r, "nuvola_polvere", "alza una nuvola di polvere in faccia a", b);
      }
    },
  },
  {
    id: "sorriso", name: "Sorriso contagioso", polarity: "+", rarity: 3,
    desc: "Il suo buonumore contagia: quando vince, i suoi compagni di scuderia corrono meglio.",
    tick(r, c) {
      if (!running(r)) return;
      const mates = c.runners.filter((o) => o !== r && o.e.ownerId && o.e.ownerId === r.e.ownerId);
      if (mates.length && c.t > 15 && once(r, "sorriso")) {
        for (const m of mates) m.comfort = Math.max(m.comfort, 0.4);
        c.quirk(r, "sorriso", "col suo sorriso contagia i compagni di scuderia");
      }
    },
  },
  {
    id: "cuore_d_oro", name: "Cuore d'oro", polarity: "+", rarity: 3,
    desc: "Non si arrende mai: quando è stremato, la grinta lo tiene in piedi.",
    tick(r, c) {
      if (r.exhausted && running(r) && c.rem(r) < 300) {
        c.mod(r, { speed: 1.035, dur: 0.1, label: "cuore" });
        if (once(r, "cuore_d_oro")) c.quirk(r, "cuore_d_oro", "è stremato ma ha un cuore d'oro: non molla");
      }
    },
  },
  {
    id: "superstizioso", name: "Superstizioso", polarity: "±", rarity: 1,
    desc: "Col numero 13 o 17 corre malissimo, col 7 benissimo.",
    start(r, c) {
      const n = r.i + 1;
      if (n === 13 || n === 17) { c.mod(r, { speed: 0.96, dur: 999, label: "numero sfortunato" }); c.quirk(r, "superstizioso", `ha il numero ${n} e corre terrorizzato`); }
      else if (n === 7) { c.mod(r, { speed: 1.03, dur: 999, label: "numero fortunato" }); c.quirk(r, "superstizioso", "ha il 7, il suo numero fortunato"); }
    },
  },
];

const QMAP = new Map(QUIRKS.map((q) => [q.id, q]));
export function quirkById(id: string): QuirkDef | undefined {
  return QMAP.get(id);
}

// quirk che non possono coesistere
const EXCLUSIVE: string[][] = [
  ["fulmine_al_via", "dormiglione", "tartaruga"],
  ["polmoni_acciaio", "fiato_corto"],
  ["quadrifoglio", "calamita_guai"],
  ["monaco_zen", "nervoso", "fatalista", "agorafobico"],
  ["re_curve", "largo_curva"],
  ["corda_magnetica", "esterno"],
  ["saltatore_nato", "rifiutatore", "terrore_siepi"],
  ["zoccoli_oro", "ranocchio"],
  ["figlio_pioggia", "idrofobo"],
  ["permaloso", "cuor_di_leone", "pacifista"],
  ["agorafobico", "tifoso_casa", "showman"],
  ["fantasma", "leggenda"],
  ["lepre", "succhiaruote", "gregario"],
];

function compatible(list: string[], id: string): boolean {
  if (list.includes(id)) return false;
  for (const g of EXCLUSIVE) if (g.includes(id) && list.some((x) => g.includes(x))) return false;
  return true;
}

const RARITY_W = { 1: 10, 2: 5, 3: 1.6, 4: 0.35 } as const;

function addRandom(rng: Rng, list: string[]) {
  for (let tries = 0; tries < 50; tries++) {
    const q = rng.weighted(QUIRKS, (x) => RARITY_W[x.rarity]);
    if (compatible(list, q.id)) {
      list.push(q.id);
      return;
    }
  }
}

export function rollQuirks(rng: Rng): string[] {
  const r = rng.next();
  const n = r < 0.3 ? 1 : r < 0.72 ? 2 : r < 0.94 ? 3 : 4;
  const out: string[] = [];
  for (let i = 0; i < n; i++) addRandom(rng, out);
  return out;
}

export function inheritQuirks(rng: Rng, a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (const id of [...a, ...b]) if (rng.chance(0.3) && compatible(out, id)) out.push(id);
  const target = rng.int(1, 3);
  while (out.length < target) addRandom(rng, out);
  return out.slice(0, 4);
}

export function quirkCatalog() {
  return QUIRKS.map((q) => ({ id: q.id, name: q.name, desc: q.desc, polarity: q.polarity, rarity: q.rarity }));
}

export { isCurve };
