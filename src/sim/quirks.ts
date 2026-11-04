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
    id: "fulmine_al_via", name: "Partenza da Cartone Animato", polarity: "+", rarity: 2,
    desc: "Al via le zampe girano a elica prima di toccare terra. Poi sparisce in una nuvoletta.",
    setup(r) { r.startDelay *= 0.3; },
    start(r, c) { c.mod(r, { accel: 1.45, dur: 3, label: "partenza a razzo" }); c.quirk(r, "fulmine_al_via", "fa girare le zampe a elica e sparisce in una nuvoletta!"); },
  },
  {
    id: "dormiglione", name: "Russatore Professionista", polarity: "-", rarity: 1,
    desc: "Si addormenta nelle gabbie. Russa. Gli altri cavalli si lamentano col sindacato.",
    setup(r, c) { if (c.rng.chance(0.55)) { r.startDelay += c.rng.range(0.8, 1.7); r.q.dorme = true; } },
    start(r, c) { if (r.q.dorme) c.quirk(r, "dormiglione", "russa nelle gabbie! Il fantino gli tira l'orecchio!"); },
  },
  {
    id: "claustrofobico", name: "Claustrofobico Melodrammatico", polarity: "-", rarity: 1,
    desc: "Nelle gabbie fa la scena madre come in una telenovela.",
    setup(r, c) { r.arousal += 0.5; c.stim(r, "gabbie", 1); if (c.rng.chance(0.4)) { r.startDelay += 0.9; r.q.impenna = true; } },
    start(r, c) { c.quirk(r, "claustrofobico", r.q.impenna ? "va nel panico nelle gabbie e si impenna" : "esce dalle gabbie col cuore a mille"); if (r.q.impenna) c.rear(r, 0.8); },
  },
  {
    id: "impennata", name: "Supereroe Mancato", polarity: "±", rarity: 2,
    desc: "Al via si impenna in posa da supereroe aspettando gli applausi.",
    start(r, c) { c.rear(r, 0.7); c.mod(r, { speed: 1.05, dur: 7, label: "carico dopo l'impennata" }); c.quirk(r, "impennata", "si impenna in posa da supereroe e aspetta gli applausi!"); },
  },
  {
    id: "ballerino", name: "Étoile della Scala", polarity: "±", rarity: 2,
    desc: "Prima di partire fa due piroette. Il fantino ha il mal di mare.",
    setup(r) { r.startDelay += 0.5; },
    start(r, c) { r.arousal = 0; r.q.zen = true; c.quirk(r, "ballerino", "fa due piroette da étoile della Scala!"); },
    tick(r) { if (r.q.zen) r.arousal *= 0.97; },
  },
  {
    id: "partenza_storta", name: "Navigatore Rotto", polarity: "-", rarity: 1,
    desc: "Esce dalle gabbie in diagonale, come se il GPS lo mandasse a Bari.",
    tick(r, c) {
      if (c.t < 2.2 && c.t > 0.6 && running(r) && once(r, "partenza_storta")) {
        const o = c.beside(r);
        c.push(r, r.d > 3 ? -1.6 : 1.6);
        if (o) c.bump(r, o, 0.9);
        c.quirk(r, "partenza_storta", "esce storto come se il navigatore lo mandasse a Bari!", o ?? undefined);
      }
    },
  },
  // ---------------- VOCE ----------------
  {
    id: "urlatore", name: "Soprano Isterico", polarity: "±", rarity: 2,
    desc: "Lancia acuti da soprano che spaccano i bicchieri al bar e terrorizzano i vicini.",
    tick(r, c) {
      if (!running(r) || c.near(r, 4.5, 3).length < 2) return;
      if (c.chance(0.09) && cd(r, "urlatore", c, 9) && uses(r, "urlatore", 3)) {
        c.emit(r, "urla", 7, 1);
        c.energy(r, 1);
        c.quirk(r, "urlatore", "lancia un acuto da soprano! Si sono rotti tutti i bicchieri del bar!");
      }
    },
  },
  {
    id: "nitrito_guerra", name: "Vichingo Mancato", polarity: "+", rarity: 2,
    desc: "Nel finale lancia un urlo di guerra vichingo. Un fantino si mette a piangere.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 420 && once(r, "nitrito_guerra")) {
        c.emit(r, "urla", 5, 0.6);
        c.mod(r, { speed: 1.04, dur: 6, label: "nitrito di guerra" });
        c.quirk(r, "nitrito_guerra", "lancia un urlo vichingo!");
      }
    },
  },
  {
    id: "canterino", name: "Cantante Neomelodico", polarity: "+", rarity: 2,
    desc: "Canta neomelodico mentre corre. I vicini si commuovono e rallentano.",
    tick(r, c) {
      if (!running(r) || !c.chance(0.035)) return;
      const n = c.near(r, 5, 4);
      if (!n.length) return;
      for (const o of n) o.arousal *= 0.6;
      r.arousal *= 0.5;
      if (cd(r, "canterino", c, 15)) c.quirk(r, "canterino", "canta un neomelodico e mezzo gruppo si commuove!");
    },
  },
  {
    id: "sbuffone", name: "Drago Sputafumo", polarity: "±", rarity: 1,
    desc: "Sbuffa in faccia a chi lo segue come un drago con la bronchite.",
    tick(r, c) {
      const b = c.behind(r, 3);
      if (b && running(r) && Math.abs(b.d - r.d) < 1 && c.chance(0.06) && cd(r, "sbuffone", c, 10)) {
        c.arouse(b, 0.2);
        c.mod(b, { speed: 0.97, dur: 2, label: "sbuffata in faccia" });
        c.quirk(r, "sbuffone", "sbuffa come un drago in faccia a chi lo segue!", b);
      }
    },
  },
  {
    id: "gas_propulsore", name: "Razzo Intestinale", polarity: "±", rarity: 2,
    desc: "Fagioli a colazione. Propulsione a reazione. Chi sta dietro sviene.",
    tick(r, c) {
      if (!running(r) || !c.chance(0.04) || !cd(r, "gas", c, 14)) return;
      c.mod(r, { speed: 1.06, dur: 1.5, label: "propulsione" });
      const b = c.behind(r, 4.5);
      if (b) { c.arouse(b, 0.35); c.mod(b, { speed: 0.95, dur: 2, label: "nube tossica" }); c.push(b, b.d > r.d ? 0.8 : -0.8); }
      c.quirk(r, "gas_propulsore", "attiva il razzo intestinale! Chi sta dietro sviene!", b ?? undefined);
    },
  },
  // ---------------- AGGRESSIVITÀ ----------------
  {
    id: "morsicatore", name: "Piranha col Ciuffo", polarity: "-", rarity: 2,
    desc: "Morde i vicini come se fossero un panino al prosciutto.",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && c.chance(0.25) && cd(r, "morso", c, 8)) {
        c.arouse(o, 0.5);
        c.stumble(o, 0.25, "morso");
        c.mod(r, { speed: 0.97, dur: 1.5, label: "distratto dal morso" });
        c.quirk(r, "morsicatore", "morde il vicino scambiandolo per un panino al prosciutto!", o);
      }
    },
  },
  {
    id: "calciatore", name: "Kung Fu Panda", polarity: "-", rarity: 2,
    desc: "Tira calci volanti all'indietro da film di arti marziali.",
    tick(r, c) {
      const b = c.behind(r, 2.6);
      if (b && running(r) && Math.abs(b.d - r.d) < 0.9 && c.chance(0.2) && cd(r, "calcio", c, 10)) {
        c.stumble(b, 0.5, "calcio");
        c.arouse(b, 0.4);
        c.mod(r, { speed: 0.96, dur: 1, label: "scalciata" });
        c.quirk(r, "calciatore", "tira un calcio volante da film di kung fu!", b);
      }
    },
  },
  {
    id: "spallata", name: "Rugbista Neozelandese", polarity: "±", rarity: 1,
    desc: "Nel finale placca chi lo affianca come in una partita di rugby.",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && c.rem(r) < 600 && c.chance(0.3) && cd(r, "spallata", c, 6)) {
        c.bump(r, o, 1.2);
        c.quirk(r, "spallata", "placca il vicino come un rugbista!", o);
      }
    },
  },
  {
    id: "bullo", name: "Bullo del Quartiere", polarity: "±", rarity: 2,
    desc: "Prende di mira i cavalli più piccoli e ruba loro la merenda (e la corsia).",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && o.mass < r.mass * 0.97 && c.chance(0.15) && cd(r, "bullo", c, 7)) {
        c.push(o, o.d > r.d ? 1.4 : -1.4);
        c.arouse(o, 0.3);
        c.quirk(r, "bullo", "fa il bullo e ruba la corsia ai più piccoli!", o);
      }
    },
  },
  {
    id: "vendicativo", name: "Vendetta Siciliana", polarity: "±", rarity: 2,
    desc: "Chi lo tocca riceve la vendetta. Fredda, come un gelato al pistacchio.",
    bumped(r, o, impact, c) {
      if (impact > 0.4 && c.rng.chance(0.6) && cd(r, "vendetta", c, 5)) { r.q.vendetta = { o: o.i, at: c.t + 0.8 }; }
    },
    tick(r, c) {
      const v = r.q.vendetta;
      if (v && c.t >= v.at) {
        r.q.vendetta = null;
        const o = c.runners[v.o];
        if (Math.abs(o.p - r.p) < 3 && Math.abs(o.d - r.d) < 2.5) { c.bump(r, o, 1.1); c.quirk(r, "vendicativo", "consuma la sua vendetta fredda come un gelato!", o); }
      }
    },
  },
  {
    id: "testone", name: "Capra Travestita", polarity: "±", rarity: 1,
    desc: "Se lo chiudono, dà una testata come una capra di montagna.",
    tick(r, c) {
      const a = c.ahead(r, 2.8);
      if (a && running(r) && Math.abs(a.d - r.d) < 0.8) r.q.chiuso = (r.q.chiuso ?? 0) + c.dt; else r.q.chiuso = 0;
      if (a && r.q.chiuso > 2.2 && cd(r, "testata", c, 12)) {
        c.stumble(a, 0.35, "testata");
        c.stumble(r, 0.15, "testata");
        r.q.chiuso = 0;
        c.quirk(r, "testone", "dà una testata da capra di montagna!", a);
      }
    },
  },
  {
    id: "carica_toro", name: "Toro di Pamplona", polarity: "±", rarity: 3,
    desc: "Nel finale abbassa la testa e travolge tutto. Anche le leggi della fisica.",
    tick(r, c) {
      const a = c.ahead(r, 3.5);
      if (a && running(r) && c.rem(r) < 500 && Math.abs(a.d - r.d) < 1 && once(r, "carica_toro")) {
        c.mod(r, { speed: 1.09, accel: 1.4, dur: 4, label: "carica" });
        c.bump(r, a, 1.5);
        c.push(a, a.d > 2 ? 1.6 : -1.6);
        c.quirk(r, "carica_toro", "carica come un toro di Pamplona!", a);
      }
    },
  },
  // ---------------- PAURE ----------------
  {
    id: "agorafobico", name: "Timido Patologico", polarity: "-", rarity: 1,
    desc: "Il pubblico lo fa arrossire. Corre coprendosi gli occhi con lo zoccolo.",
    tick(r, c) {
      if (r.stimNow[SI.folla] > 0.3 && running(r) && c.chance(0.4) && cd(r, "agora", c, 6)) {
        c.arouse(r, 0.45);
        c.mod(r, { speed: 0.96, dur: 2.5, label: "terrore della folla" });
        c.push(r, -0.8);
        c.quirk(r, "agorafobico", "arrossisce davanti al pubblico e si copre gli occhi!");
      }
    },
  },
  {
    id: "ombrofobo", name: "Nemico della Propria Ombra", polarity: "-", rarity: 1,
    desc: "In curva vede la sua ombra, crede sia un rivale e scappa.",
    tick(r, c) {
      if (c.inCurve(r) && running(r) && c.chance(0.04) && cd(r, "ombra", c, 10)) {
        c.push(r, 1.5);
        c.arouse(r, 0.3);
        c.quirk(r, "ombrofobo", "ha paura della sua ombra e scappa!");
      }
    },
  },
  {
    id: "fifone", name: "Coniglio Mannaro", polarity: "-", rarity: 1,
    desc: "Quando lo sorpassano urla come una zia che ha visto un topo.",
    overtaken(r, by, c) {
      if (c.rng.chance(0.35) && cd(r, "fifone", c, 6)) {
        c.arouse(r, 0.4);
        c.mod(r, { speed: 0.95, dur: 2, label: "spaventato" });
        c.quirk(r, "fifone", "urla come una zia che ha visto un topo!", by);
      }
    },
  },
  {
    id: "idrofobo", name: "Gatto Mancato", polarity: "-", rarity: 1,
    desc: "Sotto la pioggia corre come un gatto bagnato: offeso col mondo.",
    start(r, c) {
      if (c.spec.weather === "pioggia" || c.spec.weather === "temporale") {
        c.mod(r, { speed: 0.97, dur: 999, label: "odia la pioggia" });
        c.quirk(r, "idrofobo", "si bagna e si offende col mondo come un gatto!");
      }
    },
  },
  {
    id: "panico_gruppo", name: "Claustrofobico da Metropolitana", polarity: "-", rarity: 1,
    desc: "In mezzo al gruppo crede di essere sulla metro all'ora di punta e fugge.",
    tick(r, c) {
      if (running(r) && c.near(r, 3.5, 2.2).length >= 3 && c.chance(0.15) && cd(r, "panico", c, 10)) {
        c.push(r, 2);
        c.mod(r, { speed: 1.04, cost: 1.35, dur: 3, label: "panico" });
        c.arouse(r, 0.4);
        c.quirk(r, "panico_gruppo", "crede di essere in metro all'ora di punta e scappa!");
      }
    },
  },
  {
    id: "coda_gambe", name: "Depresso Cronico", polarity: "-", rarity: 1,
    desc: "Se è indietro si siede metaforicamente su una panchina a pensare alla vita.",
    tick(r, c) {
      if (running(r) && frac(r, c) > 0.5 && r.rank > c.runners.length * 0.7 && once(r, "coda_gambe")) {
        c.mod(r, { speed: 0.96, dur: 999, label: "si è arreso" });
        c.quirk(r, "coda_gambe", "si deprime e pensa al senso della vita!");
      }
    },
  },
  {
    id: "odia_grigi", name: "Razzista dei Colori", polarity: "-", rarity: 2,
    desc: "Odia i cavalli grigi. Dice che gli ricordano il lunedì mattina.",
    tick(r, c) {
      if (!running(r) || !c.chance(0.3)) return;
      const g = c.near(r, 3, 2.5).find(isGrey);
      if (g && cd(r, "grigi", c, 12)) {
        c.push(r, r.d > g.d ? 1.4 : -1.4);
        c.arouse(r, 0.3);
        c.quirk(r, "odia_grigi", "vede un cavallo grigio e pensa al lunedì mattina!", g);
      }
    },
  },
  {
    id: "terrore_siepi", name: "Siepefobico", polarity: "-", rarity: 1,
    desc: "Le siepi gli sembrano mostri verdi con le braccia.",
    hurdle(r, c) { c.quirk(r, "terrore_siepi", "vede la siepe come un mostro verde!"); return -0.18; },
  },
  {
    id: "paura_tuoni", name: "Cagnolino nel Temporale", polarity: "-", rarity: 1,
    desc: "Ai tuoni vuole infilarsi sotto il letto. Ma in pista non ci sono letti.",
    tick(r, c) {
      if (c.spec.weather === "temporale" && running(r) && c.chance(0.05) && cd(r, "tuono", c, 8)) {
        c.arouse(r, 0.6);
        c.stim(r, "botti", 1);
        c.mod(r, { speed: 0.94, dur: 2, label: "tuono" });
        c.push(r, c.rng.chance(0.5) ? 1 : -1);
        c.quirk(r, "paura_tuoni", "cerca un letto sotto cui nascondersi!");
      }
    },
  },
  // ---------------- MOVIMENTI STRANI ----------------
  {
    id: "retromarcia", name: "Moonwalker", polarity: "-", rarity: 2,
    desc: "Ogni tanto corre all'indietro come Michael Jackson. Senza musica.",
    tick(r, c) {
      if (running(r) && c.t > 5 && c.rem(r) > 200 && c.chance(0.012) && once(r, "retromarcia")) {
        c.rear(r, 1.3);
        r.q.indietro = c.t + 1.3;
        c.quirk(r, "retromarcia", "fa il moonwalk all'indietro in piena gara!");
      }
      if (r.q.indietro && c.t < r.q.indietro) r.v = -1.8;
    },
  },
  {
    id: "gambero", name: "Gambero Rosso", polarity: "-", rarity: 1,
    desc: "Corre di lato come un granchio a cui hanno rubato la spiaggia.",
    tick(r, c) {
      if (running(r) && c.chance(0.03) && cd(r, "gambero", c, 8)) {
        c.push(r, c.rng.chance(0.5) ? 1.8 : -1.8);
        c.mod(r, { speed: 0.98, dur: 1, label: "di sbieco" });
        c.quirk(r, "gambero", "corre di lato come un granchio!");
      }
    },
  },
  {
    id: "zigzag", name: "Ubriaco Molesto", polarity: "-", rarity: 1,
    desc: "Corre a zig zag come lo zio all'uscita del matrimonio.",
    tick(r, c) {
      if (!running(r)) return;
      r.targetD += Math.sin(c.t * 1.3 + r.i) * 0.06;
      if (c.t > 12 && once(r, "zigzag")) c.quirk(r, "zigzag", "zigzaga come lo zio dopo il matrimonio!");
    },
    setup(r) { r.mods.push({ speed: 1, cost: 1.03, lat: 1, accel: 1, until: 999, label: "zigzag" }); },
  },
  {
    id: "giravolta", name: "Trottola Umana (Equina)", polarity: "-", rarity: 2,
    desc: "Una volta per gara gira su sé stesso come una trottola. Non sa perché.",
    tick(r, c) {
      if (running(r) && c.t > 6 && c.rem(r) > 300 && c.chance(0.006) && once(r, "giravolta")) {
        c.stop(r, 1.5);
        c.quirk(r, "giravolta", "gira come una trottola! Nessuno sa perché!");
      }
    },
  },
  {
    id: "saltellatore", name: "Canguro Abusivo", polarity: "±", rarity: 1,
    desc: "Saltella invece di galoppare. È convinto di essere un coniglio.",
    tick(r, c) {
      if (running(r) && c.chance(0.03) && cd(r, "salt", c, 6)) {
        c.energy(r, 1.5);
        c.mod(r, { speed: 1.03, dur: 1, label: "saltello" });
        if (uses(r, "saltellatore_rev", 1)) c.quirk(r, "saltellatore", "saltella convinto di essere un coniglio!");
      }
    },
  },
  {
    id: "pavone", name: "Influencer", polarity: "-", rarity: 2,
    desc: "Davanti alla tribuna si ferma per i selfie coi fan.",
    tick(r, c) {
      if (running(r) && homeStraight(r, c) && r.rank === 1 && once(r, "pavone")) {
        const second = c.order()[1];
        if (second && r.p - second.p > 5) {
          c.mod(r, { speed: 0.92, dur: 3, label: "si pavoneggia" });
          c.quirk(r, "pavone", "si ferma a fare i selfie coi fan!");
        } else r.q.pavone = false;
      }
    },
  },
  {
    id: "brucatore", name: "Vegano Militante", polarity: "-", rarity: 2,
    desc: "Si ferma a mangiare l'insalata. In gara. Con calma.",
    tick(r, c) {
      if (c.spec.venue !== "dolomiti" && running(r) && c.t > 8 && c.rem(r) > 300 && c.chance(0.01) && once(r, "brucatore")) {
        c.stop(r, 2);
        c.quirk(r, "brucatore", "si ferma a mangiare l'insalata! In gara!");
      }
    },
  },
  {
    id: "pisolino", name: "Pensionato Stanco", polarity: "-", rarity: 3,
    desc: "Si sdraia in pista per un pisolino. Ha lavorato troppo, dice.",
    tick(r, c) {
      if (running(r) && c.t > 10 && c.rem(r) > 400 && c.chance(0.003) && once(r, "pisolino")) {
        c.stop(r, 4);
        c.quirk(r, "pisolino", "si sdraia in pista per un pisolino!");
      }
    },
  },
  {
    id: "turista", name: "Turista Giapponese", polarity: "-", rarity: 1,
    desc: "Si guarda intorno, fotografa le tribune, si perde.",
    tick(r, c) {
      if (running(r) && r.stimNow[SI.folla] > 0.2 && c.chance(0.09)) {
        c.push(r, 0.35);
        if (cd(r, "turista", c, 30)) c.quirk(r, "turista", "fotografa le tribune come un turista!");
      }
    },
  },
  {
    id: "passo_danza", name: "Ballerino di Tango", polarity: "±", rarity: 2,
    desc: "Si ferma per un casquè con un cavallo a caso, poi riparte felice.",
    tick(r, c) {
      if (running(r) && c.t > 5 && c.chance(0.01) && once(r, "passo_danza")) {
        c.stop(r, 0.6);
        c.mod(r, { speed: 1.04, dur: 4, label: "ritmo" });
        c.quirk(r, "passo_danza", "fa un casquè di tango e riparte!");
      }
    },
  },
  // ---------------- ARRIVO ----------------
  {
    id: "collo_lungo", name: "Giraffa Sotto Copertura", polarity: "+", rarity: 2,
    desc: "Sul traguardo allunga il collo di mezzo metro. Il fotofinish impazzisce.",
    finish(r, c) {
      const close = c.runners.some((o) => o !== r && (o.status === "run" || o.status === "done") && Math.abs(o.p - r.p) < 2.5);
      if (close) { c.quirk(r, "collo_lungo", "allunga il collo come una giraffa sul traguardo!"); return 0.08; }
      return 0;
    },
  },
  {
    id: "allungo", name: "Elastico di Gomma", polarity: "+", rarity: 2,
    desc: "Nello sprint si allunga come un elastico e poi PING! Sparato.",
    tick(r, c) {
      if (r.kicking && running(r) && once(r, "allungo")) {
        c.mod(r, { speed: 1.04, accel: 1.35, dur: 5, label: "allungo" });
        c.quirk(r, "allungo", "si allunga come un elastico e PING!");
      }
    },
  },
  {
    id: "testa_a_testa", name: "Testardo Testa a Testa", polarity: "+", rarity: 2,
    desc: "Nei duelli digrigna i denti come una nonna al mercato.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 160 && c.beside(r) && cd(r, "duello", c, 3)) {
        c.mod(r, { speed: 1.035, dur: 3, label: "duello" });
        if (uses(r, "tat", 1)) c.quirk(r, "testa_a_testa", "digrigna i denti come una nonna al mercato!", c.beside(r) ?? undefined);
      }
    },
  },
  {
    id: "esultanza", name: "Calciatore Mancato", polarity: "-", rarity: 2,
    desc: "Esulta prima del traguardo con la scivolata sulle ginocchia. Ovviamente rallenta.",
    tick(r, c) {
      if (running(r) && r.rank === 1 && c.rem(r) < 70 && once(r, "esultanza")) {
        const s = c.order()[1];
        if (s && r.p - s.p > 1.5 && c.rng.chance(0.6)) {
          c.mod(r, { speed: 0.87, dur: 999, label: "esulta" });
          c.quirk(r, "esultanza", "esulta prima del traguardo con la scivolata!");
        }
      }
    },
  },
  {
    id: "braccino", name: "Tremarella Cronica", polarity: "-", rarity: 1,
    desc: "In testa nel finale gli tremano le zampe come gelatina.",
    tick(r, c) {
      if (running(r) && r.rank === 1 && c.rem(r) < 200 && once(r, "braccino")) {
        c.mod(r, { speed: 0.96, cost: 1.1, dur: 999, label: "braccino" });
        c.arouse(r, 0.3);
        c.quirk(r, "braccino", "gli tremano le zampe come gelatina!");
      }
    },
  },
  // ---------------- SOCIALI ----------------
  {
    id: "gregario", name: "Pecora Smarrita", polarity: "±", rarity: 1,
    desc: "Segue il cavallo davanti ovunque, anche in bagno.",
    setup(r) { r.plan.patience = Math.max(r.plan.patience, 0.95); },
    tick(r, c) {
      const a = c.ahead(r, 5);
      if (a && running(r) && c.rem(r) > 220) {
        r.targetD += (a.d - r.targetD) * 0.05;
        c.mod(r, { cost: 0.95, dur: 0.1, label: "gregario" });
        if (c.t > 20 && once(r, "gregario")) c.quirk(r, "gregario", "segue l'altro come una pecora!", a);
      }
    },
  },
  {
    id: "innamorato", name: "Romeo con gli Zoccoli", polarity: "±", rarity: 2,
    desc: "Si innamora durante la corsa e rallenta per fare la serenata.",
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
    id: "capobranco", name: "Il Boss", polarity: "+", rarity: 3,
    desc: "Quando comanda, gli altri si inchinano. Qualcuno gli bacia lo zoccolo.",
    tick(r, c) {
      if (running(r) && r.rank === 1) {
        for (const o of c.near(r, 7, 6)) if (o.p < r.p) o.arousal += 0.05 * c.dt * 4;
        r.comfort = Math.max(r.comfort, 0.3);
        if (frac(r, c) > 0.4 && once(r, "capobranco")) c.quirk(r, "capobranco", "fa il boss e tutti si inchinano!");
      }
    },
  },
  {
    id: "pacifista", name: "Hippie Anni '70", polarity: "±", rarity: 1,
    desc: "Evita i contatti, porge l'altra guancia e distribuisce fiori.",
    bumped(r, o, impact, c) { if (once(r, "pacifista_rev")) c.quirk(r, "pacifista", "porge l'altra guancia e distribuisce fiori!", o); },
    tick(r, c) { if (running(r) && c.near(r, 2, 1.6).length >= 2) c.mod(r, { speed: 0.985, dur: 0.1, label: "si tira indietro" }); },
  },
  {
    id: "lepre", name: "Coniglio Energizzato", polarity: "±", rarity: 1,
    desc: "Parte come se avesse le pile nuove. Poi le pile finiscono.",
    setup(r) { r.plan.early *= 1.04; r.plan.mid *= 1.02; },
    tick(r, c) { if (running(r) && frac(r, c) > 0.3 && r.rank <= 2 && once(r, "lepre")) c.quirk(r, "lepre", "parte con le pile cariche!"); },
  },
  {
    id: "maestro_scia", name: "Ciclista del Giro d'Italia", polarity: "+", rarity: 2,
    desc: "Si nasconde nella scia degli altri come un ciclista furbo.",
    tick(r, c) {
      const a = c.ahead(r, 3);
      if (a && running(r) && Math.abs(a.d - r.d) < 0.9) {
        c.mod(r, { cost: 0.9, dur: 0.1, label: "scia" });
        r.q.scia = (r.q.scia ?? 0) + c.dt;
        if (r.q.scia > 10 && once(r, "maestro_scia")) c.quirk(r, "maestro_scia", "si nasconde in scia come al Giro d'Italia!", a);
      }
    },
  },
  {
    id: "calamita", name: "Calamita da Frigo", polarity: "±", rarity: 2,
    desc: "Attira tutti gli altri cavalli. E anche qualche cucchiaino.",
    tick(r, c) {
      if (!running(r)) return;
      const n = c.near(r, 6, 5);
      for (const o of n) o.targetD += (r.d - o.targetD) * 0.01;
      if (n.length >= 3 && once(r, "calamita")) c.quirk(r, "calamita", "attira tutto il gruppo come una calamita da frigo!");
    },
  },
  {
    id: "imitatore", name: "Pappagallo", polarity: "±", rarity: 1,
    desc: "Copia quello che fa il vicino. Anche le smorfie.",
    tick(r, c) {
      const o = c.beside(r) ?? c.ahead(r, 3);
      if (o && running(r) && c.rem(r) > 300 && c.chance(0.05) && cd(r, "imita", c, 12)) {
        r.q.copia = { i: o.i, until: c.t + 5 };
        if (uses(r, "imit_rev", 1)) c.quirk(r, "imitatore", "copia le smorfie del vicino!", o);
      }
      const cp = r.q.copia;
      if (cp && c.t < cp.until) r.v += (c.runners[cp.i].v - r.v) * 0.08;
    },
  },
  {
    id: "ombra", name: "Stalker Molesto", polarity: "±", rarity: 2,
    desc: "Sceglie un rivale e gli sta incollato come un ex geloso.",
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
        if (Math.abs(o.p - r.p) < 3 && c.t > 15 && once(r, "ombra_rev")) c.quirk(r, "ombra", "si incolla al rivale come un ex geloso!", o);
      } else if (Math.abs(o.p - r.p) < 3) c.mod(r, { speed: 1.02, dur: 0.1, label: "ombra" });
    },
  },
  {
    id: "sognatore", name: "Testa tra le Nuvole", polarity: "-", rarity: 1,
    desc: "Si perde a guardare le nuvole a forma di carota.",
    tick(r, c) {
      if (running(r) && c.chance(0.03) && cd(r, "sogno", c, 9)) {
        c.mod(r, { speed: 0.95, dur: 2, label: "sogna" });
        if (uses(r, "sogno_rev", 1)) c.quirk(r, "sognatore", "guarda una nuvola a forma di carota!");
      }
    },
  },
  // ---------------- ENERGIA ----------------
  {
    id: "diesel", name: "Fiat Panda del '92", polarity: "±", rarity: 1,
    desc: "Ci mette un'eternità a scaldarsi, poi non lo ferma più nessuno.",
    tick(r, c) {
      if (!running(r)) return;
      const f = frac(r, c);
      if (f < 0.4) c.mod(r, { speed: 0.965, dur: 0.1, label: "a freddo" });
      else if (f > 0.6) { c.mod(r, { speed: 1.025, cost: 0.95, dur: 0.1, label: "diesel" }); if (once(r, "diesel")) c.quirk(r, "diesel", "si è scaldato come una Panda del '92!"); }
    },
  },
  {
    id: "seconda_giovinezza", name: "Zombie Rianimato", polarity: "+", rarity: 3,
    desc: "Quando sembra morto, risorge. Con gli occhi un po' strani.",
    tick(r, c) {
      if (r.exhausted && running(r) && once(r, "seconda_giovinezza")) {
        r.dprime = r.dmax * 0.35;
        r.exhausted = false;
        c.quirk(r, "seconda_giovinezza", "risorge come uno zombie!");
      }
    },
  },
  {
    id: "fiato_corto", name: "Fumatore Incallito", polarity: "-", rarity: 1,
    desc: "Ha il fiato di un nonno che fuma dal '58.",
    setup(r) { r.dmax *= 0.85; r.dprime = r.dmax; },
    tick(r, c) { if (r.exhausted && once(r, "fiato_corto")) c.quirk(r, "fiato_corto", "ha il fiato corto come un fumatore incallito!"); },
  },
  {
    id: "polmoni_acciaio", name: "Mantice da Fabbro", polarity: "+", rarity: 2,
    desc: "Ha i polmoni di un mantice. Respira e si gonfia la tribuna.",
    setup(r) { r.cs *= 1.02; },
    tick(r, c) { if (running(r) && c.rem(r) < 300 && !r.exhausted && r.rank <= 3 && once(r, "polmoni_acciaio")) c.quirk(r, "polmoni_acciaio", "respira come un mantice e non si stanca mai!"); },
  },
  {
    id: "esplosivo", name: "Petardo con le Zampe", polarity: "+", rarity: 2,
    desc: "Nel finale esplode. Letteralmente: c'è del fumo.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 380 && once(r, "esplosivo")) {
        c.mod(r, { speed: 1.065, accel: 1.5, cost: 1.6, dur: 4, label: "esplosione" });
        c.quirk(r, "esplosivo", "esplode in uno scatto con tanto di fumo!");
      }
    },
  },
  {
    id: "pigro", name: "Divano con le Zampe", polarity: "-", rarity: 1,
    desc: "Corre solo se il fantino lo sveglia con la frusta. E brontola.",
    tick(r, c) {
      if (!running(r)) return;
      if (r.whipT > c.t - 0.1) {
        c.mod(r, { speed: 1.05, dur: 3, label: "svegliato" });
        if (once(r, "pigro")) c.quirk(r, "pigro", "si sveglia solo con la frusta e brontola!");
      } else c.mod(r, { speed: 0.975, dur: 0.1, label: "pigro" });
    },
  },
  {
    id: "stakanovista", name: "Impiegato del Mese", polarity: "+", rarity: 2,
    desc: "Non si stanca mai. Ha anche timbrato il cartellino.",
    setup(r) { r.mods.push({ speed: 1, cost: 0.95, lat: 1, accel: 1, until: 999, label: "efficiente" }); },
    tick(r, c) { if (frac(r, c) > 0.7 && r.dprime / r.dmax > 0.4 && once(r, "stakanovista")) c.quirk(r, "stakanovista", "timbra il cartellino e non si stanca mai!"); },
  },
  {
    id: "falso_sprint", name: "Ritardatario Cronico", polarity: "-", rarity: 1,
    desc: "Crede sempre che sia l'ultimo giro. Non lo è mai.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 950 && c.rem(r) > 700 && once(r, "falso_sprint")) {
        c.mod(r, { speed: 1.06, cost: 1.3, dur: 6, label: "falso sprint" });
        c.quirk(r, "falso_sprint", "crede che sia l'ultimo giro! Non lo è!");
      }
    },
  },
  // ---------------- CONDIZIONI ----------------
  {
    id: "ranocchio", name: "Ranocchio Felice", polarity: "+", rarity: 1,
    desc: "Nel fango sguazza e fa CRA CRA.",
    start(r, c) { if (c.spec.going === "pesante" || c.spec.going === "morbido") { c.mod(r, { speed: 1.04, dur: 999, label: "nel fango" }); c.quirk(r, "ranocchio", "sguazza nel fango e fa CRA CRA!"); } },
  },
  {
    id: "zoccoli_oro", name: "Zoccoli da Discoteca", polarity: "+", rarity: 1,
    desc: "Sul secco brilla come una palla da discoteca.",
    start(r, c) { if (c.spec.going === "secco") { c.mod(r, { speed: 1.03, dur: 999, label: "terreno secco" }); c.quirk(r, "zoccoli_oro", "brilla sul secco come una palla da discoteca!"); } },
  },
  {
    id: "figlio_pioggia", name: "Danzatore della Pioggia", polarity: "+", rarity: 2,
    desc: "Sotto la pioggia balla e accelera. Forse l'ha chiamata lui.",
    start(r, c) { if (c.spec.weather === "pioggia" || c.spec.weather === "temporale") { c.mod(r, { speed: 1.035, dur: 999, label: "pioggia" }); r.arousal = 0; c.quirk(r, "figlio_pioggia", "balla sotto la pioggia e vola!"); } },
  },
  {
    id: "freddoloso", name: "Ghiacciolo Lamentoso", polarity: "-", rarity: 1,
    desc: "Col freddo corre con la sciarpa (immaginaria) e si lamenta.",
    start(r, c) { if (c.spec.venue === "dolomiti" || c.spec.weather === "neve") { c.mod(r, { speed: 0.96, dur: 999, label: "freddo" }); c.quirk(r, "freddoloso", "trema di freddo e si lamenta!"); } },
  },
  {
    id: "re_curve", name: "Pilota di Formula 1", polarity: "+", rarity: 2,
    desc: "In curva fa la traiettoria perfetta e sgomma.",
    tick(r, c) {
      if (c.inCurve(r) && running(r)) {
        c.mod(r, { speed: 1.02, lat: 1.6, dur: 0.1, label: "curva" });
        r.targetD = Math.max(0.5, r.targetD - 0.02);
        if (frac(r, c) > 0.25 && once(r, "re_curve")) c.quirk(r, "re_curve", "sgomma in curva come in Formula 1!");
      }
    },
  },
  {
    id: "largo_curva", name: "Camionista Distratto", polarity: "-", rarity: 1,
    desc: "In curva va larghissimo come un tir in retromarcia.",
    tick(r, c) {
      if (c.inCurve(r) && running(r)) {
        c.push(r, 0.4 * c.dt * 4);
        if (once(r, "largo_curva")) c.quirk(r, "largo_curva", "prende la curva larga come un tir!");
      }
    },
  },
  {
    id: "missile", name: "Missile Balistico", polarity: "+", rarity: 2,
    desc: "Sul rettilineo finale decolla. La NASA è interessata.",
    tick(r, c) { if (running(r) && homeStraight(r, c)) { c.mod(r, { speed: 1.025, dur: 0.1, label: "missile" }); if (once(r, "missile")) c.quirk(r, "missile", "decolla sul rettilineo! La NASA prende appunti!"); } },
  },
  {
    id: "cammello", name: "Cammello Infiltrato", polarity: "+", rarity: 1,
    desc: "Sulla sabbia si sente a casa. Ha anche le gobbe, quasi.",
    start(r, c) { if (c.spec.venue === "saline") { c.mod(r, { speed: 1.04, dur: 999, label: "sabbia" }); c.quirk(r, "cammello", "sulla sabbia diventa un cammello!"); } },
  },
  {
    id: "velista", name: "Velista Mancato", polarity: "±", rarity: 1,
    desc: "Col vento apre le orecchie come vele e plana.",
    start(r, c) { if (c.spec.weather === "vento" || c.spec.weather === "temporale") { c.mod(r, { cost: 0.95, dur: 999, label: "vento" }); c.quirk(r, "velista", "apre le orecchie come vele!"); } },
  },
  // ---------------- SALTO ----------------
  {
    id: "canguro", name: "Canguro Australiano", polarity: "±", rarity: 1,
    desc: "Salta gli ostacoli mezzo metro più in alto del necessario.",
    hurdle(r, c) { c.mod(r, { speed: 0.95, dur: 1, label: "salto alto" }); c.quirk(r, "canguro", "salta altissimo come un canguro!"); return 0.12; },
  },
  {
    id: "rifiutatore", name: "Sindacalista", polarity: "-", rarity: 1,
    desc: "Davanti alla siepe si ferma e chiede un aumento.",
    hurdle(r, c) { r.q.rifiuta = true; return -0.25; },
  },
  {
    id: "saltatore_nato", name: "Ginnasta Olimpico", polarity: "+", rarity: 2,
    desc: "Salta gli ostacoli con il doppio salto carpiato.",
    hurdle(r, c) { c.mod(r, { speed: 1.03, dur: 2, label: "atterraggio" }); c.quirk(r, "saltatore_nato", "fa il doppio salto carpiato!"); return 0.15; },
  },
  {
    id: "ostacoli_immaginari", name: "Visionario", polarity: "-", rarity: 2,
    desc: "Salta ostacoli che esistono solo nella sua testa.",
    tick(r, c) {
      if (!c.spec.hurdles && running(r) && c.chance(0.01) && cd(r, "immag", c, 15)) {
        c.energy(r, 3);
        c.mod(r, { speed: 0.92, dur: 1, label: "salto nel vuoto" });
        c.quirk(r, "ostacoli_immaginari", "salta un ostacolo immaginario!");
      }
    },
  },
  // ---------------- FORTUNA ----------------
  {
    id: "gatto_nero", name: "Iettatore", polarity: "±", rarity: 2,
    desc: "Porta una sfortuna tremenda a chi gli corre vicino. Fate le corna!",
    tick(r, c) {
      if (!running(r) || !c.chance(0.012)) return;
      const n = c.near(r, 3, 2.5);
      if (n.length) {
        const o = c.rng.pick(n);
        c.stumble(o, 0.3, "sfortuna");
        if (once(r, "gatto_nero")) c.quirk(r, "gatto_nero", "porta sfiga! Il vicino inciampa! Fate le corna!", o);
      }
    },
  },
  {
    id: "quadrifoglio", name: "Fortunato Sfacciato", polarity: "+", rarity: 2,
    desc: "Ha un quadrifoglio nella criniera. Evita tutto per miracolo.",
    setup(r) { r.luck += 0.6; },
    hazard(r, hz, c) { if (c.rng.chance(0.6)) { c.quirk(r, "quadrifoglio", "evita il guaio per miracolo, che fortunello!"); return true; } return false; },
  },
  {
    id: "calamita_guai", name: "Fantozzi a Quattro Zampe", polarity: "-", rarity: 1,
    desc: "Se c'è un guaio, lo trova. Anche se non c'è.",
    setup(r) { r.luck -= 0.6; },
    tick(r, c) { if (r.status === "stumble" && once(r, "calamita_guai")) c.quirk(r, "calamita_guai", "trova un guaio come Fantozzi!"); },
  },
  {
    id: "piedi_burro", name: "Piedi di Burro", polarity: "-", rarity: 1,
    desc: "Inciampa nei propri zoccoli. Anche da fermo.",
    tick(r, c) { if (running(r) && c.t > 3 && c.chance(0.008) && cd(r, "burro", c, 20)) { c.stumble(r, 0.3, "piedi di burro"); c.quirk(r, "piedi_burro", "inciampa nei suoi stessi zoccoli!"); } },
  },
  {
    id: "perde_ferri", name: "Seminatore di Ferri", polarity: "-", rarity: 1,
    desc: "Perde i ferri in corsa. Il pubblico li raccoglie come souvenir.",
    tick(r, c) {
      if (running(r) && c.t > 5 && c.chance(0.004) && once(r, "perde_ferri")) {
        c.mod(r, { speed: 0.97, dur: 999, label: "senza un ferro" });
        c.quirk(r, "perde_ferri", "perde un ferro! Un tifoso lo prende al volo!");
      }
    },
  },
  {
    id: "starnutone", name: "Allergico al Fieno", polarity: "-", rarity: 1,
    desc: "Starnutisce così forte che i vicini volano di lato.",
    tick(r, c) {
      if (running(r) && c.chance(0.02) && cd(r, "starn", c, 10)) {
        c.mod(r, { speed: 0.9, dur: 0.8, label: "starnuto" });
        for (const o of c.near(r, 3, 2.5)) c.arouse(o, 0.12);
        if (uses(r, "starn_rev", 1)) c.quirk(r, "starnutone", "fa uno starnuto che sposta i vicini!");
      }
    },
  },
  // ---------------- MENTE ----------------
  {
    id: "monaco_zen", name: "Monaco Shaolin", polarity: "+", rarity: 3,
    desc: "Medita mentre corre. Niente lo turba. Nemmeno le bombe.",
    setup(r) { r.q.zenFactor = 0.25; },
    tick(r, c) { if ((r.stimNow[SI.urla] > 0.3 || r.stimNow[SI.botti] > 0.3) && once(r, "monaco_zen")) c.quirk(r, "monaco_zen", "medita e resta impassibile come un monaco Shaolin!"); },
  },
  {
    id: "distratto", name: "Pesce Rosso", polarity: "-", rarity: 1,
    desc: "Ha la memoria di un pesce rosso: dimentica che sta correndo.",
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
    desc: "Dipende dalla luna, dall'oroscopo e da cosa ha mangiato.",
    setup(r, c) { const good = c.rng.chance(0.5); r.form *= good ? c.rng.range(1.025, 1.05) : c.rng.range(0.95, 0.975); r.q.lun = good; },
    start(r, c) { c.quirk(r, "lunatico", r.q.lun ? "oggi è nella sua giornata di grazia" : "oggi si è svegliato con la luna storta"); },
  },
  {
    id: "orgoglioso", name: "Permaloso d'Assalto", polarity: "+", rarity: 1,
    desc: "Se lo sorpassano, lo prende come un'offesa personale e si vendica correndo.",
    overtaken(r, by, c) {
      if (cd(r, "orgoglio", c, 10)) {
        c.mod(r, { speed: 1.04, dur: 4, label: "orgoglio" });
        if (uses(r, "org_rev", 1)) c.quirk(r, "orgoglioso", "si offende per il sorpasso e si infuria!", by);
      }
    },
  },
  {
    id: "rancoroso", name: "Elefante Rancoroso", polarity: "±", rarity: 2,
    desc: "Non dimentica mai chi gli ha fatto un torto. Neanche dopo dieci anni.",
    tick(r, c) {
      if (!running(r)) return;
      for (const o of c.near(r, 4, 3)) {
        const g = r.h.mind.grudge[o.h.id];
        if (g && Math.abs(g.v) > 0.25) {
          c.mod(r, { speed: 1.03, cost: 1.05, dur: 0.1, label: "rancore" });
          if (once(r, "rancoroso")) c.quirk(r, "rancoroso", "si ricorda del vecchio torto e si infuria!", o);
          break;
        }
      }
    },
  },
  {
    id: "fatalista", name: "Filosofo Esistenzialista", polarity: "±", rarity: 1,
    desc: "Né paura né gioia. Corre pensando a Nietzsche.",
    tick(r, c) {
      r.arousal = 0;
      r.comfort = 0;
      if (r.stimNow[SI.contatto] > 0.3 && once(r, "fatalista")) c.quirk(r, "fatalista", "pensa a Nietzsche e non fa una piega!");
    },
  },
  {
    id: "primadonna", name: "Diva di Hollywood", polarity: "±", rarity: 1,
    desc: "Se non è davanti fa i capricci e vuole parlare col suo agente.",
    tick(r, c) {
      if (!running(r) || frac(r, c) < 0.55) return;
      if (r.rank <= 1) c.mod(r, { speed: 1.02, dur: 0.1, label: "primadonna" });
      else if (r.rank > 3) c.mod(r, { speed: 0.975, dur: 0.1, label: "tiene il muso" });
      if (once(r, "primadonna")) c.quirk(r, "primadonna", r.rank <= 1 ? "è in testa e fa la primadonna" : "non è davanti e tiene il muso da primadonna");
    },
  },
  {
    id: "spaccone", name: "Spaccone da Bar", polarity: "±", rarity: 1,
    desc: "Davanti a tanto pubblico parte a tutta per farsi vedere. Poi paga.",
    start(r, c) { if (c.spec.big || c.spec.spectators > 0.7) { c.mod(r, { speed: 1.04, cost: 1.08, dur: 15, label: "spaccone" }); c.quirk(r, "spaccone", "fa lo spaccone davanti al pubblico!"); } },
  },
  {
    id: "malinconico", name: "Poeta Maledetto", polarity: "-", rarity: 1,
    desc: "Col cielo grigio scrive poesie mentalmente e rallenta.",
    start(r, c) { if (["nuvoloso", "nebbia", "pioggia"].includes(c.spec.weather)) { c.mod(r, { speed: 0.975, dur: 999, label: "malinconia" }); c.quirk(r, "malinconico", "col cielo grigio scrive poesie!"); } },
  },
  {
    id: "testardo", name: "Mulo Ostinato", polarity: "-", rarity: 1,
    desc: "Non cambia corsia nemmeno se c'è un muro davanti.",
    setup(r) { r.q.fisso = true; r.plan.patience = 1; },
    tick(r, c) {
      const a = c.ahead(r, 3);
      if (a && Math.abs(a.d - r.d) < 1 && running(r)) {
        r.q.bloccato = (r.q.bloccato ?? 0) + c.dt;
        if (r.q.bloccato > 3 && once(r, "testardo")) c.quirk(r, "testardo", "non cambia corsia neanche col muro davanti!", a);
      }
    },
  },
  // ---------------- STRAVAGANTI ----------------
  {
    id: "anima_gemella", name: "Coppia di Fatto", polarity: "+", rarity: 2,
    desc: "Lui e il fantino sono un'anima sola. Si tengono per mano (zoccolo).",
    setup(r) { r.q.whipBoost = 2; },
    tick(r, c) { if (r.whipT > c.t - 0.1 && once(r, "anima_gemella")) c.quirk(r, "anima_gemella", "fa coppia fissa col fantino!"); },
  },
  {
    id: "disarcionatore", name: "Toro Meccanico", polarity: "-", rarity: 3,
    desc: "Ogni tanto si scrolla il fantino di dosso come al toro meccanico.",
    tick(r, c) {
      if (running(r) && c.t > 6 && c.chance(0.0025) && once(r, "disarcionatore")) {
        r.riderless = true;
        c.ev({ k: "riderless", a: r.i });
        c.quirk(r, "disarcionatore", "disarciona il fantino come un toro meccanico!");
      }
    },
  },
  {
    id: "mangiatutto", name: "Aspirapolvere Vivente", polarity: "+", rarity: 2,
    desc: "Mangia tutto quello che trova in pista. Bucce di banana comprese.",
    hazard(r, hz, c) {
      if (hz.kind === "buccia" || hz.kind === "olio") { c.quirk(r, "mangiatutto", hz.kind === "buccia" ? "si mangia la buccia di banana!" : "lecca l'olio dalla pista, disgustoso ma efficace"); return true; }
      return false;
    },
  },
  {
    id: "fiuta_trappole", name: "Segugio dell'FBI", polarity: "+", rarity: 2,
    desc: "Fiuta le trappole a distanza come un cane antidroga.",
    hazard(r, hz, c) { if (c.rng.chance(0.85)) { c.push(r, r.d > hz.d ? 1.5 : -1.5); c.quirk(r, "fiuta_trappole", "fiuta la trappola come un segugio dell'FBI!"); return true; } return false; },
  },
  {
    id: "elettrico", name: "Pila Scarica", polarity: "±", rarity: 1,
    desc: "Ogni tanto prende la scossa e scatta come un pazzo.",
    tick(r, c) {
      if (running(r) && c.chance(0.02) && cd(r, "elet", c, 8)) {
        c.mod(r, { speed: 1.07, cost: 1.5, dur: 1.2, label: "scarica" });
        if (uses(r, "elet_rev", 1)) c.quirk(r, "elettrico", "prende la scossa e scatta come un pazzo!");
      }
    },
  },
  {
    id: "tartaruga", name: "Bradipo Olimpico", polarity: "-", rarity: 1,
    desc: "Accelera con la stessa grinta di un bradipo in pensione.",
    setup(r) { r.accel0 *= 0.7; },
    tick(r, c) { if (c.t > 3 && c.t < 7 && r.rank > c.runners.length * 0.6 && once(r, "tartaruga")) c.quirk(r, "tartaruga", "accelera come un bradipo in pensione!"); },
  },
  {
    id: "empatico", name: "Spugna Emotiva", polarity: "±", rarity: 2,
    desc: "Assorbe le ansie di tutti. Poi piange.",
    tick(r, c) {
      if (!running(r)) return;
      const n = c.near(r, 4, 3);
      if (!n.length) return;
      const avg = n.reduce((a, o) => a + o.arousal, 0) / n.length;
      r.arousal += (avg - r.arousal) * 0.05;
      if (avg > 0.4 && once(r, "empatico")) c.quirk(r, "empatico", "assorbe l'ansia di tutti e piange!");
    },
  },
  {
    id: "succhiaruote", name: "Vampiro di Scie", polarity: "±", rarity: 2,
    desc: "Succhia la scia degli altri come un vampiro col sangue.",
    setup(r) { r.plan.patience = 1; r.plan.early = Math.min(r.plan.early, 0.98); },
    tick(r, c) {
      const a = c.ahead(r, 3);
      if (a && running(r) && Math.abs(a.d - r.d) < 1) {
        r.dprime = Math.min(r.dmax, r.dprime + 0.5 * c.dt);
        if (c.t > 25 && once(r, "succhiaruote")) c.quirk(r, "succhiaruote", "succhia la scia come un vampiro!", a);
      }
    },
  },
  {
    id: "fantasma", name: "Fantasma Formaggino", polarity: "+", rarity: 4,
    desc: "Passa attraverso i varchi come se non avesse un corpo. Brrr.",
    setup(r) { r.q.ghost = true; r.luck += 0.3; },
    bumped(r, o, impact, c) { if (once(r, "fantasma")) c.quirk(r, "fantasma", "attraversa il varco come un fantasma!", o); },
  },
  {
    id: "leggenda", name: "Leggenda Vivente", polarity: "+", rarity: 4,
    desc: "Nelle grandi corse brilla di luce propria. Letteralmente.",
    setup(r, c) { if (c.spec.big) { r.vmax *= 1.025; r.cs *= 1.025; } },
    tick(r, c) { if (c.spec.big && c.rem(r) < 400 && once(r, "leggenda")) c.quirk(r, "leggenda", "brilla di luce propria come una leggenda!"); },
  },
  {
    id: "showman", name: "Presentatore del Sabato Sera", polarity: "+", rarity: 2,
    desc: "Più pubblico c'è, più fa lo show. Manca solo la valletta.",
    tick(r, c) {
      if (running(r) && homeStraight(r, c) && c.spec.spectators > 0.3) {
        c.mod(r, { speed: 1 + 0.035 * c.spec.spectators, dur: 0.1, label: "show" });
        if (once(r, "showman")) c.quirk(r, "showman", "fa lo show davanti al pubblico!");
      }
    },
  },
  // ---------------- ALTRI ----------------
  {
    id: "giraffa", name: "Elastico Umano", polarity: "+", rarity: 2,
    desc: "Nel finale si allunga così tanto che sembra due cavalli.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 250 && r.kicking && once(r, "giraffa")) {
        c.mod(r, { speed: 1.03, cost: 1.1, dur: 999, label: "falcata lunga" });
        c.quirk(r, "giraffa", "si allunga così tanto che sembrano due cavalli!");
      }
    },
  },
  {
    id: "ipnotico", name: "Mago Otelma", polarity: "+", rarity: 3,
    desc: "Fissa negli occhi chi lo affianca e lo ipnotizza.",
    tick(r, c) {
      const o = c.beside(r);
      if (o && running(r) && c.chance(0.12) && cd(r, "ipno", c, 12)) {
        c.mod(o, { speed: 0.95, dur: 1.5, label: "ipnotizzato" });
        c.quirk(r, "ipnotico", "ipnotizza il vicino come un mago!", o);
      }
    },
  },
  {
    id: "permaloso", name: "Offeso a Vita", polarity: "-", rarity: 1,
    desc: "Se lo tocchi si offende e non ti parla più.",
    bumped(r, o, impact, c) {
      if (impact > 0.3 && cd(r, "perm", c, 6)) {
        c.mod(r, { speed: 0.96, dur: 3, label: "offeso" });
        if (uses(r, "perm_rev", 1)) c.quirk(r, "permaloso", "si offende e tiene il muso!", o);
      }
    },
  },
  {
    id: "cuor_di_leone", name: "Gladiatore", polarity: "+", rarity: 2,
    desc: "Più lo colpisci, più si carica. Grida 'Al mio segnale scatenate l'inferno'.",
    bumped(r, o, impact, c) {
      if (impact > 0.3 && cd(r, "leone", c, 6)) {
        c.mod(r, { speed: 1.035, dur: 3, label: "cuor di leone" });
        if (uses(r, "leone_rev", 1)) c.quirk(r, "cuor_di_leone", "si carica come un gladiatore!", o);
      }
    },
  },
  {
    id: "corda_magnetica", name: "Innamorato dello Steccato", polarity: "+", rarity: 1,
    desc: "Si struscia sullo steccato interno come un gatto sul divano.",
    setup(r) { r.plan.rail = 1; },
    tick(r, c) { if (running(r) && r.d < 0.9 && c.inCurve(r) && frac(r, c) > 0.3 && once(r, "corda_magnetica")) c.quirk(r, "corda_magnetica", "si struscia sullo steccato come un gatto!"); },
  },
  {
    id: "esterno", name: "Asociale", polarity: "±", rarity: 1,
    desc: "Corre largo lontano da tutti. Dice che la gente lo stressa.",
    setup(r) { r.plan.rail = 0; },
    tick(r, c) { if (running(r)) { r.targetD = Math.max(r.targetD, 5); if (c.t > 12 && once(r, "esterno")) c.quirk(r, "esterno", "corre lontano da tutti, asociale!"); } },
  },
  {
    id: "rimonta_furiosa", name: "Uragano dal Fondo", polarity: "+", rarity: 2,
    desc: "Dalle retrovie parte come un uragano con la tosse.",
    tick(r, c) {
      if (running(r) && c.rem(r) < 500 && r.rank > c.runners.length / 2 && once(r, "rimonta_furiosa")) {
        c.mod(r, { speed: 1.045, dur: 8, label: "rimonta" });
        c.quirk(r, "rimonta_furiosa", "parte dal fondo come un uragano!");
      }
    },
  },
  {
    id: "abitudinario", name: "Pantofolaio", polarity: "±", rarity: 1,
    desc: "Corre bene solo dove ha già vinto. Come il nonno al bar.",
    start(r, c) {
      const won = r.h.venuesWon?.includes(c.spec.venue);
      if (won) { c.mod(r, { speed: 1.025, dur: 999, label: "a casa" }); c.quirk(r, "abitudinario", "qui ha già vinto: si sente a casa"); }
      else c.mod(r, { speed: 0.99, dur: 999, label: "pista nuova" });
    },
  },
  {
    id: "vecchia_volpe", name: "Vecchia Volpe", polarity: "+", rarity: 2,
    desc: "Ha visto tutto. Corre con la furbizia di un vecchio truffatore.",
    setup(r) { r.q.learn2 = true; },
    tick(r, c) { if (r.h.mind.races >= 5 && frac(r, c) > 0.5 && once(r, "vecchia_volpe")) c.quirk(r, "vecchia_volpe", "corre con la furbizia di un vecchio truffatore!"); },
  },
  {
    id: "smemorato", name: "Dory", polarity: "±", rarity: 1,
    desc: "Dimentica tutto: paure, lezioni, il proprio nome.",
    setup(r) { r.q.forget = true; },
    start(r, c) { if (r.h.mind.races >= 3) c.quirk(r, "smemorato", "ha dimenticato tutto, anche il proprio nome!"); },
  },
  {
    id: "tifoso_casa", name: "Idolo delle Folle", polarity: "+", rarity: 2,
    desc: "Il pubblico lo adora. Gli lanciano reggiseni.",
    tick(r, c) {
      if (running(r) && r.stimNow[SI.folla] > 0.3) {
        r.arousal *= 0.95;
        c.mod(r, { speed: 1.02, dur: 0.1, label: "boato" });
        if (once(r, "tifoso_casa")) c.quirk(r, "tifoso_casa", "è l'idolo delle folle, gli lanciano fiori!");
      }
    },
  },
  {
    id: "nervoso", name: "Caffeinomane", polarity: "-", rarity: 1,
    desc: "Ha bevuto dieci caffè. Si agita per niente.",
    tick(r, c) {
      if (running(r)) {
        r.arousal = Math.max(r.arousal, 0.25);
        if (c.t > 8 && once(r, "nervoso")) c.quirk(r, "nervoso", "ha bevuto dieci caffè e trema tutto!");
      }
    },
  },
  {
    id: "sportivo", name: "Crocerossino", polarity: "±", rarity: 1,
    desc: "Se qualcuno cade, si ferma a vedere se sta bene. Che tenerezza.",
    tick(r, c) {
      if (!running(r)) return;
      const f = c.runners.find((o) => o.status === "fallen" && Math.abs(o.p - r.p) < 15);
      if (f && once(r, "sportivo")) { c.mod(r, { speed: 0.9, dur: 2, label: "sportività" }); c.quirk(r, "sportivo", "si ferma a soccorrere il caduto!", f); }
    },
  },
  {
    id: "sciacallo", name: "Avvoltoio", polarity: "+", rarity: 1,
    desc: "Se qualcuno è nei guai, ne approfitta subito. Senza vergogna.",
    tick(r, c) {
      if (!running(r)) return;
      const f = c.near(r, 6, 4).find((o) => o.status === "stumble" || o.status === "rear" || o.status === "fallen");
      if (f && cd(r, "sciac", c, 8)) {
        c.mod(r, { speed: 1.04, dur: 2.5, label: "sciacallo" });
        if (uses(r, "sciac_rev", 1)) c.quirk(r, "sciacallo", "approfitta dei guai altrui come un avvoltoio!", f);
      }
    },
  },
  {
    id: "puntiglioso", name: "Orologio Svizzero", polarity: "+", rarity: 1,
    desc: "Corre con la precisione di un orologio svizzero. Fa anche tic tac.",
    setup(r) { r.form = 1 + (r.form - 1) * 0.3; r.q.reg = true; },
    tick(r, c) { if (frac(r, c) > 0.5 && once(r, "puntiglioso")) c.quirk(r, "puntiglioso", "corre preciso come un orologio svizzero!"); },
  },
  {
    id: "freno_a_mano", name: "Neopatentato", polarity: "-", rarity: 1,
    desc: "In curva tira il freno a mano come al primo giorno di scuola guida.",
    tick(r, c) {
      if (running(r) && c.inCurve(r) && !r.q.inCurva) {
        r.q.inCurva = true;
        c.mod(r, { speed: 0.93, dur: 1.2, label: "frena" });
        if (once(r, "freno_a_mano")) c.quirk(r, "freno_a_mano", "frena in curva come un neopatentato!");
      }
      if (!c.inCurve(r)) r.q.inCurva = false;
    },
  },
  {
    id: "nuvola_polvere", name: "Tempesta di Sabbia", polarity: "±", rarity: 2,
    desc: "Alza così tanta polvere che chi è dietro non vede più niente.",
    tick(r, c) {
      if (!running(r) || (c.spec.venue !== "tavoliere" && c.spec.venue !== "saline")) return;
      const b = c.behind(r, 4);
      if (b && Math.abs(b.d - r.d) < 1.2) {
        c.stim(b, "luci", 0.5);
        c.mod(b, { speed: 0.985, dur: 0.1, label: "polvere" });
        if (once(r, "nuvola_polvere")) c.quirk(r, "nuvola_polvere", "alza una tempesta di polvere!", b);
      }
    },
  },
  {
    id: "sorriso", name: "Sorriso a 32 Denti", polarity: "+", rarity: 3,
    desc: "Sorride sempre. Contagia anche i compagni di scuderia.",
    tick(r, c) {
      if (!running(r)) return;
      const mates = c.runners.filter((o) => o !== r && o.e.ownerId && o.e.ownerId === r.e.ownerId);
      if (mates.length && c.t > 15 && once(r, "sorriso")) {
        for (const m of mates) m.comfort = Math.max(m.comfort, 0.4);
        c.quirk(r, "sorriso", "sorride a 32 denti e contagia tutti!");
      }
    },
  },
  {
    id: "cuore_d_oro", name: "Cuore di Panna", polarity: "+", rarity: 3,
    desc: "Quando è stremato, la grinta lo tiene in piedi. E un po' di zucchero.",
    tick(r, c) {
      if (r.exhausted && running(r) && c.rem(r) < 300) {
        c.mod(r, { speed: 1.035, dur: 0.1, label: "cuore" });
        if (once(r, "cuore_d_oro")) c.quirk(r, "cuore_d_oro", "è stremato ma ha un cuore di panna!");
      }
    },
  },
  {
    id: "superstizioso", name: "Napoletano Doc", polarity: "±", rarity: 1,
    desc: "Col 13 e il 17 corre terrorizzato, col 7 vola. Corna e cornetti in tasca.",
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
