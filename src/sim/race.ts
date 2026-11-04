// Motore della corsa: simulazione fisica deterministica a 20 Hz.
//
// Modello energetico: velocità critica (CS, aerobica, sostenibile) + riserva anaerobica D'
// (in metri): correndo sopra CS si consuma D', sotto CS si recupera. Finita la riserva il cavallo
// "si pianta" e non riesce più a superare CS. È il modello usato in fisiologia dello sport.
// In curva chi corre largo fa più strada; in scia si consuma meno; il vento penalizza chi è in testa.
// Collisioni laterali e di tallone, inciampi, cadute (con cavallo che diventa un ostacolo),
// siepi, oggetti in pista lanciati dai sicari, paura e fiducia apprese (vedi learning.ts).
import { Rng, clamp, lerp } from "./rng";
import type { Horse } from "./horse";
import { ageYears, ageFactor, currentFatigue } from "./horse";
import { STIMULI, SI, NSTIM, chooseStrategy, contextIndex, emptyExperience, STRATEGIES, type Stim } from "./learning";
import { quirkById } from "./quirks";
import { illnessPerf } from "../game/health";
import type { Hazard, Mod, QCtx, RaceEntry, RaceEvent, RaceSpec, Runner, RunnerStatus } from "./types";
import {
  venueById, trackPoint, railFactor, isCurve, startS, hurdlePositions, GOINGS, WEATHERS, mod as modn, lapLength,
} from "../../public/js/shared/track.js";

export const DT = 0.05;
const FRAME_EVERY = 4; // 5 frame al secondo nel replay
const BODY = 2.4; // lunghezza cavallo (m)
const WIDTH = 0.85; // ingombro laterale per le collisioni (m)

const DESIRED_RANK = [0, 0.2, 0.45, 0.7, 0.82, 0.5];
const STATUS_CODE: Record<RunnerStatus, number> = { gate: 0, run: 1, stumble: 2, fallen: 3, rear: 4, stop: 5, done: 6, dnf: 7 };

/** Paura innata (si somma a quella appresa). */
const INNATE: Partial<Record<Stim, number>> = { botti: 0.35, urla: 0.25, contatto: 0.1, luci: 0.2, gabbie: 0.05 };

export interface RunnerOutcome {
  horseId: string;
  name: string;
  num: number;
  pos: number; // 0 = non classificato
  time: number;
  status: "ok" | "dnf" | "dq";
  dnfReason?: string;
  revealed: string[];
  exp: ReturnType<typeof emptyExperience>;
  fell: boolean;
  injury: string | null;
  exhausted: boolean;
  topSpeed: number;
  strategy: string;
  energyLeft: number;
  doped: boolean;
}

export interface Replay {
  v: 1;
  venue: string;
  distance: number;
  startS: number;
  width: number;
  hurdles: number[];
  going: string;
  weather: string;
  dt: number;
  duration: number;
  horses: { num: number; id: string; name: string; look: Horse["look"]; silks: RaceEntry["silks"]; stable: string; jockey: string; ownerId: string | null; sex: string; age: number }[];
  frames: number[][]; // per frame: [p*10, d*100, v*10, codice] per corridore
  events: RaceEvent[];
  hazards: Hazard[];
  finish: { num: number; pos: number; time: number; status: string }[];
}

export interface RaceResult {
  outcomes: RunnerOutcome[];
  replay: Replay;
  events: RaceEvent[];
  winnerTime: number;
}

export function simulateRace(spec: RaceSpec, now: number): RaceResult {
  const rng = new Rng(spec.seed);
  const venue = venueById(spec.venue);
  const going = GOINGS.find((g) => g.id === spec.going) ?? GOINGS[1];
  const weather = WEATHERS.find((w) => w.id === spec.weather) ?? WEATHERS[0];
  const D = spec.distance;
  const s0 = startS(venue, D);
  const W = venue.width;
  const hurdles: number[] = spec.hurdles ? hurdlePositions(venue, D) : [];
  const ctxIdx = contextIndex(D, spec.hurdles);
  const goingIdx = { secco: -1, buono: -0.33, morbido: 0.33, pesante: 1 }[going.id as "secco"] ?? 0;

  const events: RaceEvent[] = [];
  const hazards: Hazard[] = [];
  let hazardId = 1;
  let t = 0;

  // ---- preparazione corridori ----
  const entries = rng.shuffle(spec.entries.slice()); // sorteggio dei numeri/gabbie
  const runners: Runner[] = entries.map((e, i) => makeRunner(e, i));

  function makeRunner(e: RaceEntry, i: number): Runner {
    const h = e.horse;
    const s = h.stats;
    const age = ageYears(h, now);
    const fat = currentFatigue(h, now);
    const surf = 1 + ((h.apt.surface[venue.surface as keyof typeof h.apt.surface] ?? 1) - 1) * 0.6;
    const goingPref = 1 - 0.018 * Math.abs(goingIdx - h.apt.going);
    const formSd = 0.005 + 0.02 * (1 - s.consistency / 100);
    const form = 1 + rng.normal(0, formSd);
    const perf =
      ageFactor(age) *
      (1 - Math.pow(fat / 100, 1.5) * 0.12) *
      (1 - ((100 - h.cond.health) / 100) * 0.1) *
      (1 + ((h.cond.morale - 60) / 100) * 0.03) *
      illnessPerf(h) *
      surf * goingPref * going.speed;
    const strat = chooseStrategy(h.mind, ctxIdx, s.smarts, rng);
    const st = STRATEGIES[strat];
    const r: Runner = {
      i, h, e,
      p: 0,
      d: 0.8 + i * 1.12,
      v: 0,
      vd: 0,
      targetD: 0.8 + i * 1.12,
      vmax: (16.7 + 2.9 * (s.speed / 100) + 0.35 * (0.5 - h.apt.distance)) * perf,
      cs: (14.35 + 1.3 * (s.stamina / 100) + 0.35 * (h.apt.distance - 0.5)) * perf,
      dmax: 115 + 90 * ((0.5 * s.speed + 0.3 * s.accel + 0.2 * s.strength) / 100) + 50 * (0.5 - h.apt.distance),
      dprime: 0,
      accel0: 2.3 + 3.0 * (s.accel / 100),
      latMax: 0.7 + 1.3 * (s.agility / 100),
      mass: h.apt.weightKg * (0.75 + 0.5 * (s.strength / 100)),
      recov: 0.28 + 0.6 * (s.recovery / 100),
      csDecay: Math.max(0.001, 0.011 + 0.018 * (1 - h.apt.distance) - 0.009 * (s.stamina / 100)),
      arousal: 0.1 + 0.25 * (1 - s.calm / 100),
      comfort: 0,
      strat,
      plan: { early: st.early, mid: st.mid, kickAt: st.kick, kickEffort: st.kickEffort, rail: st.rail, patience: st.patience },
      status: "gate",
      statusT: 0,
      mods: [],
      startDelay: 0.12 + rng.range(0, 0.25) + (1 - s.focus / 100) * 0.2,
      finishT: 0,
      finishPos: 0,
      exhausted: false,
      exhaustedAt: 0,
      riderless: false,
      kicking: false,
      whipT: -99,
      stimNow: new Float64Array(NSTIM),
      stimLast: new Float64Array(NSTIM).fill(-1e9),
      expo: new Float64Array(NSTIM),
      fearV: Float64Array.from(STIMULI, (st) => h.mind.v[st] + (INNATE[st] ?? 0)),
      exp: emptyExperience(ctxIdx, strat),
      q: {},
      quirks: h.quirks.slice(),
      luck: 0,
      bumpCd: 0,
      rank: i + 1,
      prevRank: i + 1,
      effort: 1,
      form,
      injuredInRace: null,
      doped: [],
      revealed: new Set(),
      topSpeedSeen: 0,
    };
    r.dprime = r.dmax;
    r.vmax *= form;
    r.cs *= form;
    // paura delle gabbie
    const gateFear = Math.max(0, h.mind.v.gabbie + (INNATE.gabbie ?? 0));
    r.startDelay += gateFear * 0.5 * (1.3 - s.courage / 100);
    // effetti prima della corsa (doping, sabotaggi)
    for (const ef of h.cond.effects) applyEffect(r, ef.kind);
    return r;
  }

  function applyEffect(r: Runner, kind: string) {
    switch (kind) {
      case "stimolante": r.vmax *= 1.025; r.cs *= 1.025; r.arousal += 0.2; r.doped.push(kind); break;
      case "epo": r.cs *= 1.045; r.dmax *= 1.05; r.dprime = r.dmax; r.doped.push(kind); break;
      case "calmante": r.arousal = 0; r.q.zenFactor = 0.5; r.doped.push(kind); break;
      case "sonnifero": r.vmax *= 0.965; r.cs *= 0.97; r.startDelay += 0.6; r.q.sabotato = true; break;
      case "lassativo": r.q.lassativo = 0.25 + rng.range(0, 0.55); r.q.sabotato = true; break;
      case "chiodo": r.vmax *= 0.975; r.q.chiodo = true; r.q.sabotato = true; break;
      case "fantino_corrotto": r.plan.early = 1.11; r.plan.mid = 1.05; r.plan.kickAt = 900; r.q.sabotato = true; break;
      case "ferri_nuovi": r.vmax *= 1.01; break;
      case "massaggio": r.recov *= 1.1; break;
    }
  }

  const finishedOrder: Runner[] = [];

  // ---- utilità ----
  const isActive = (r: Runner) => r.status !== "done" && r.status !== "dnf" && r.status !== "gate";
  const onTrack = (r: Runner) => r.status !== "dnf" && r.status !== "gate" && !(r.status === "done");
  const trackS = (r: Runner) => s0 + r.p;
  const remOf = (r: Runner) => D - r.p;

  function ev(e: Omit<RaceEvent, "t">) {
    events.push({ t: Math.round(t * 100) / 100, ...e });
  }

  function addMod(r: Runner, m: Partial<Mod> & { dur: number; label: string }) {
    // i mod con la stessa etichetta si rinnovano
    const until = t + m.dur;
    const ex = r.mods.find((x) => x.label === m.label);
    if (ex) {
      ex.until = Math.max(ex.until, until);
      return;
    }
    r.mods.push({ speed: m.speed ?? 1, cost: m.cost ?? 1, lat: m.lat ?? 1, accel: m.accel ?? 1, until, label: m.label });
  }

  function stim(r: Runner, s: Stim, intensity: number) {
    if (intensity <= 0) return;
    const k = SI[s];
    if (intensity > r.stimNow[k]) r.stimNow[k] = intensity;
  }
  function touch(r: Runner, s: Stim, amount: number) {
    const k = SI[s];
    r.stimLast[k] = t;
    r.expo[k] += amount;
  }

  function harm(r: Runner, sev: number) {
    for (let k = 0; k < NSTIM; k++) {
      if (t - r.stimLast[k] < 1.6) {
        const s = STIMULI[k];
        r.exp.harm[s] = Math.max(r.exp.harm[s] ?? 0, sev);
      }
    }
  }

  function grudge(victim: Runner, by: Runner, h: number, duel = 0) {
    const g = (victim.exp.grudges[by.h.id] ??= { harm: 0, name: by.h.name, duel: 0 });
    g.harm = Math.min(1, g.harm + h);
    g.duel += duel;
  }

  const luckF = (r: Runner) => clamp(1 - r.luck * 0.6, 0.25, 2);

  function stumble(r: Runner, sev: number, cause: string) {
    if (r.status !== "run") return;
    sev *= luckF(r);
    if (r.q.ghost) sev *= 0.4;
    if (sev < 0.08) return;
    r.status = "stumble";
    r.statusT = 0.45 + sev * 0.8;
    r.v *= 1 - 0.22 * Math.min(1, sev);
    harm(r, Math.min(1, 0.35 + sev * 0.5));
    ev({ k: "stumble", a: r.i, x: cause, v: Math.round(sev * 100) / 100 });
    // può cadere
    const fallP = clamp(sev * 0.16 * (1 - r.h.stats.agility / 160) * going.slip * luckF(r), 0, 0.5);
    if (rng.chance(fallP)) fall(r, cause);
  }

  function fall(r: Runner, cause: string) {
    if (r.status === "fallen" || r.status === "done" || r.status === "dnf") return;
    r.status = "fallen";
    r.statusT = rng.range(2.5, 4.5);
    r.exp.fell = true;
    harm(r, 1);
    ev({ k: "fall", a: r.i, x: cause });
    hazards.push({ id: hazardId++, kind: "caduto", p: r.p, d: r.d, r: 1.0, t0: t, t1: t + r.statusT, owner: r.i });
    if (rng.chance(0.35 * luckF(r))) r.injuredInRace = rng.pick(["distorsione al nodello", "contusione alla spalla", "tendinite", "ferita alla gamba", "stiramento"]);
  }

  function rear(r: Runner, dur: number) {
    if (r.status !== "run" && r.status !== "gate") return;
    r.status = "rear";
    r.statusT = dur;
    harm(r, 0.25);
    ev({ k: "rear", a: r.i });
  }

  function stopR(r: Runner, dur: number) {
    if (r.status !== "run") return;
    r.status = "stop";
    r.statusT = dur;
    ev({ k: "stop", a: r.i });
  }

  function arouse(r: Runner, amt: number) {
    const sens = (1.3 - r.h.stats.courage / 100) * (r.q.zenFactor ?? 1);
    r.arousal = clamp(r.arousal + amt * sens, 0, 1.5);
  }

  function bump(a: Runner, b: Runner, impact: number) {
    if (b.q.ghost) impact *= 0.3;
    ev({ k: "bump", a: a.i, b: b.i, v: Math.round(impact * 100) / 100 });
    stim(a, "contatto", Math.min(1, impact));
    stim(b, "contatto", Math.min(1, impact));
    touch(a, "contatto", impact);
    touch(b, "contatto", impact);
    grudge(b, a, impact * 0.35);
    const ratio = a.mass / (a.mass + b.mass);
    const dir = b.d >= a.d ? 1 : -1;
    b.vd += dir * impact * 1.6 * ratio;
    a.vd -= dir * impact * 0.6 * (1 - ratio);
    arouse(b, 0.15 * impact);
    for (const id of b.quirks) quirkById(id)?.bumped?.(b, a, impact, ctx);
    for (const id of a.quirks) quirkById(id)?.bumped?.(a, b, impact * 0.5, ctx);
    const sp = 0.16 * impact * going.slip * (1 - b.h.stats.agility / 150);
    if (rng.chance(sp)) stumble(b, impact * 0.55, "contatto");
    else if (rng.chance(sp * 0.4)) stumble(a, impact * 0.4, "contatto");
  }

  function emit(src: Runner, s: Stim, radius: number, intensity: number) {
    for (const o of runners) {
      if (o === src || !onTrack(o)) continue;
      const dist = Math.hypot(o.p - src.p, o.d - src.d);
      if (dist < radius) {
        const k = intensity * (1 - dist / radius);
        stim(o, s, k);
        arouse(o, k * 0.5 * (0.5 + Math.max(0, o.fearV[SI[s]])));
        if (s === "urla") grudge(o, src, k * 0.2);
      }
    }
  }

  function revealQuirk(r: Runner, id: string, text: string, other?: Runner) {
    r.revealed.add(id);
    ev({ k: "quirk", a: r.i, q: id, x: text, b: other?.i });
  }

  let cachedOrder: Runner[] | null = null;
  function order(): Runner[] {
    if (cachedOrder) return cachedOrder;
    return (cachedOrder = computeOrder());
  }
  function computeOrder(): Runner[] {
    return runners.filter((r) => r.status !== "dnf" && !r.riderless).sort((a, b) => {
      if (a.status === "done" && b.status === "done") return a.finishT - b.finishT;
      if (a.status === "done") return -1;
      if (b.status === "done") return 1;
      return b.p - a.p;
    });
  }

  // indice spaziale: corridori in pista ordinati per p (ricostruito a ogni tick)
  let byP: Runner[] = [];
  const slot = new Int32Array(runners.length).fill(-1);
  function rebuildIndex() {
    byP = runners.filter(onTrack).sort((a, b) => a.p - b.p);
    slot.fill(-1);
    byP.forEach((r, k) => (slot[r.i] = k));
  }
  /** Visita i corridori con |Δp| < range (margine di 1.5 m per i movimenti nel tick). */
  function scan(r: Runner, back: number, fwd: number, fn: (o: Runner) => boolean | void) {
    const k = slot[r.i];
    if (k < 0) {
      for (const o of byP) if (o !== r && o.p > r.p - back - 1.5 && o.p < r.p + fwd + 1.5 && fn(o)) return;
      return;
    }
    for (let j = k + 1; j < byP.length; j++) {
      const o = byP[j];
      if (o.p > r.p + fwd + 1.5) break;
      if (fn(o)) return;
    }
    for (let j = k - 1; j >= 0; j--) {
      const o = byP[j];
      if (o.p < r.p - back - 1.5) break;
      if (fn(o)) return;
    }
  }

  function near(r: Runner, dp: number, dd: number): Runner[] {
    const out: Runner[] = [];
    scan(r, dp, dp, (o) => { if (onTrack(o) && o.status !== "fallen" && Math.abs(o.p - r.p) < dp && Math.abs(o.d - r.d) < dd) out.push(o); });
    return out;
  }

  function aheadOf(r: Runner, maxGap = 4): Runner | null {
    let best: Runner | null = null;
    scan(r, 0, maxGap, (o) => {
      if (!onTrack(o)) return;
      const gp = o.p - r.p;
      if (gp > 0 && gp < maxGap && Math.abs(o.d - r.d) < 1.0 && (!best || gp < best.p - r.p)) best = o;
    });
    return best;
  }

  function behindOf(r: Runner, maxGap = 4): Runner | null {
    let best: Runner | null = null;
    scan(r, maxGap, 0, (o) => {
      if (!onTrack(o) || o.status === "fallen") return;
      const gp = r.p - o.p;
      if (gp > 0 && gp < maxGap && Math.abs(o.d - r.d) < 1.0 && (!best || gp < r.p - best.p)) best = o;
    });
    return best;
  }

  function besideOf(r: Runner): Runner | null {
    let res: Runner | null = null;
    scan(r, 1.5, 1.5, (o) => {
      if (!onTrack(o) || o.status === "fallen") return;
      if (Math.abs(o.p - r.p) < 1.5 && Math.abs(o.d - r.d) < 1.35) { res = o; return true; }
    });
    return res;
  }

  const ctx: QCtx = {
    get t() { return t; },
    dt: DT,
    rng,
    spec,
    runners,
    distance: D,
    width: W,
    rem: remOf,
    inCurve: (r) => isCurve(venue, trackS(r)),
    finalStretch: (r) => remOf(r) < 400 && !isCurve(venue, trackS(r)),
    leader: () => order()[0],
    order,
    near,
    ahead: aheadOf,
    behind: behindOf,
    beside: besideOf,
    mod: addMod,
    push: (r, lat) => { r.vd += lat; },
    stim,
    emit,
    stumble,
    rear,
    stop: stopR,
    bump,
    energy: (r, m) => { r.dprime = Math.max(0, r.dprime - m); },
    arouse,
    quirk: revealQuirk,
    hazard: (h) => { hazards.push({ ...h, id: hazardId++ }); },
    ev,
    chance: (ps) => rng.next() < ps * DT,
  };

  // setup dei quirk
  for (const r of runners) for (const id of r.quirks) quirkById(id)?.setup?.(r, ctx);
  for (const r of runners) r.dprime = Math.min(r.dprime, r.dmax);

  // ---- sicari ----
  const pendingHits = spec.hitmen
    .map((hm) => ({ hm, r: runners.find((x) => x.h.id === hm.targetId) }))
    .filter((x) => x.r) as { hm: RaceSpec["hitmen"][number]; r: Runner }[];

  function executeHit(hm: RaceSpec["hitmen"][number], target: Runner) {
    const sec = target.e.security ?? 0;
    const intercept = [0, 0.3, 0.55, 0.75][clamp(sec, 0, 3)];
    const sideD = W + 2.5;
    hazards.push({ id: hazardId++, kind: "sicario", p: target.p + 12, d: sideD, r: 0.5, t0: t, t1: t + 4, target: target.i });
    if (rng.chance(intercept)) {
      ev({ k: "caught", a: target.i, x: hm.service });
      return;
    }
    ev({ k: "hitman", a: target.i, x: hm.service });
    const lead = target.v * 1.3 + 4;
    switch (hm.service) {
      case "buccia": {
        // mira imprecisa: può colpire chiunque
        hazards.push({ id: hazardId++, kind: "buccia", p: target.p + lead, d: clamp(target.d + rng.normal(0, 0.7), 0.4, W - 0.5), r: 0.55, t0: t + 0.4, t1: t + 120 });
        break;
      }
      case "olio": {
        hazards.push({ id: hazardId++, kind: "olio", p: target.p + lead + 4, d: clamp(target.d + rng.normal(0, 0.8), 1, W - 1), r: 1.8, t0: t + 0.3, t1: t + 120 });
        break;
      }
      case "corda": {
        hazards.push({ id: hazardId++, kind: "corda", p: target.p + lead, d: clamp(target.d, 1.5, W - 1.5), r: 2.4, t0: t + 0.4, t1: t + 2.2 });
        break;
      }
      case "invasore": {
        hazards.push({ id: hazardId++, kind: "invasore", p: target.p + lead + 10, d: W + 1, r: 0.7, t0: t + 0.5, t1: t + 6, vd: -(W + 2) / 4.5 });
        break;
      }
      case "petardo": {
        hazards.push({ id: hazardId++, kind: "petardo", p: target.p + 3, d: W + 0.5, r: 22, t0: t, t1: t + 1.2 });
        for (const o of runners) {
          if (!onTrack(o)) continue;
          const dist = Math.hypot(o.p - (target.p + 3), o.d - W);
          if (dist < 22) {
            const k = 1 - dist / 22;
            stim(o, "botti", k);
            touch(o, "botti", 0);
            arouse(o, k * (0.6 + Math.max(0, o.h.mind.v.botti)));
            if (rng.chance(k * 0.5 * (1.3 - o.h.stats.courage / 100))) spook(o, "il petardo");
          }
        }
        break;
      }
      case "laser": {
        hazards.push({ id: hazardId++, kind: "laser", p: target.p, d: W + 3, r: 0.3, t0: t, t1: t + 5, target: target.i });
        target.q.laser = t + 5;
        break;
      }
      case "drone": {
        hazards.push({ id: hazardId++, kind: "drone", p: target.p, d: target.d, r: 10, t0: t, t1: t + 7, target: target.i });
        target.q.drone = t + 7;
        break;
      }
      case "fischietto": {
        stim(target, "urla", 1);
        touch(target, "urla", 0);
        arouse(target, 0.8);
        if (rng.chance(0.6)) spook(target, "il fischio a ultrasuoni");
        for (const o of near(target, 6, 4)) arouse(o, 0.2);
        break;
      }
    }
  }

  function spook(r: Runner, cause: string) {
    if (r.status !== "run") return;
    r.vd += (rng.chance(0.5) ? 1 : -1) * (1 + r.arousal);
    addMod(r, { speed: 0.92, dur: 1.1, label: "spavento" });
    harm(r, 0.3);
    ev({ k: "spook", a: r.i, x: cause });
  }

  // ---- registrazione replay ----
  const frames: number[][] = [];
  function snapshot() {
    const f: number[] = [];
    for (const r of runners) {
      f.push(Math.round(r.p * 10), Math.round(r.d * 100), Math.round(r.v * 10), STATUS_CODE[r.status] + (r.riderless ? 8 : 0));
    }
    frames.push(f);
  }

  // ---- loop principale ----
  ev({ k: "start" });
  let tick = 0;
  let lastLeader = -1;
  let leaderSince = 0;
  let announcedLeader = -1;
  const maxT = D / 11 + 50;
  let allDoneAt = -1;
  const nextHurdle = runners.map(() => 0);
  const rankHist: number[][] = runners.map(() => []);

  snapshot();
  while (t < maxT) {
    t += DT;
    tick++;

    // partenza
    for (const r of runners) {
      if (r.status === "gate" && t >= r.startDelay) {
        r.status = r.statusT > 0 ? "rear" : "run";
        for (const id of r.quirks) quirkById(id)?.start?.(r, ctx);
      }
    }

    // classifica corrente
    rebuildIndex();
    cachedOrder = null;
    const ord = order();
    ord.forEach((r, k) => { r.prevRank = r.rank; r.rank = k + 1; });
    const field = ord.length;

    // stimoli ambientali
    for (const r of runners) {
      r.stimNow.fill(0);
      if (!onTrack(r)) continue;
      const sT = trackS(r);
      const curve = isCurve(venue, sT);
      const rem = remOf(r);
      if (t < r.startDelay + 0.6) stim(r, "gabbie", 1);
      if (!curve && rem < 450 && rem > -60) stim(r, "folla", venue.crowd * (0.4 + 0.6 * spec.spectators) * (0.45 + 0.55 * (r.d / W)));
      let nn = 0;
      scan(r, 3.2, 3.2, (o) => { if (o.status !== "fallen" && Math.abs(o.p - r.p) < 3.2 && Math.abs(o.d - r.d) < 2) nn++; });
      if (nn) stim(r, "gruppo", Math.min(1, nn / 3));
      stim(r, "pioggia", weather.rain);
      stim(r, "fango", going.id === "pesante" ? 1 : going.id === "morbido" ? 0.45 : 0);
      if (curve) stim(r, "curve", 0.6);
      if (r.rank === 1 && t > 3) stim(r, "testa", 1);
      if (field > 4 && r.rank >= field - 1 && t > 3) stim(r, "coda", 1);
      const nh = nextHurdle[r.i];
      if (nh < hurdles.length && hurdles[nh] - r.p < 25 && hurdles[nh] - r.p > 0) stim(r, "ostacoli", 0.6);
      if (r.q.laser && t < r.q.laser) stim(r, "luci", 1);
      if (r.q.drone && t < r.q.drone) { stim(r, "luci", 0.6); stim(r, "botti", 0.3); for (const o of near(r, 8, 6)) { stim(o, "luci", 0.4); } }
      if (spec.weather === "temporale" && rng.chance(0.02 * DT)) stim(r, "luci", 0.8);
    }

    // quirk
    for (const r of runners) {
      if (r.status === "dnf" || r.status === "gate") continue;
      for (const id of r.quirks) quirkById(id)?.tick?.(r, ctx);
    }

    // sicari
    for (let k = pendingHits.length - 1; k >= 0; k--) {
      const { hm, r } = pendingHits[k];
      if (r.status === "gate") continue;
      if (r.p >= hm.at * D || r.status === "done" || r.status === "dnf" || t > maxT - 20) {
        pendingHits.splice(k, 1);
        if (onTrack(r)) executeHit(hm, r);
      }
    }

    // dinamica
    for (const r of runners) {
      if (r.status === "gate" || r.status === "dnf") continue;
      stepRunner(r, field);
    }

    resolveCollisions();
    checkHazards();

    // ostacoli e arrivo
    for (const r of runners) {
      if (r.status === "gate" || r.status === "dnf") continue;
      const prevP = r.q._prevP ?? 0;
      const nh = nextHurdle[r.i];
      if (nh < hurdles.length && prevP < hurdles[nh] && r.p >= hurdles[nh]) {
        nextHurdle[r.i]++;
        if (r.status === "run" || r.status === "stumble") jumpHurdle(r);
      }
      if (r.status !== "done" && prevP < D && r.p >= D) {
        const frac = (D - prevP) / Math.max(1e-6, r.p - prevP);
        let ft = t - DT + frac * DT;
        for (const id of r.quirks) ft -= quirkById(id)?.finish?.(r, ctx) ?? 0;
        if (r.riderless) {
          r.status = "dnf";
          r.q.dnfReason = "senza fantino";
          ev({ k: "riderless_finish", a: r.i });
        } else {
          r.status = "done";
          r.finishT = ft;
          r.exp.energyAtFinish = r.dprime / r.dmax;
          finishedOrder.push(r);
          ev({ k: "finish", a: r.i, v: finishedOrder.length });
        }
      }
      r.q._prevP = r.p;
    }

    // cambio di leader e sorpassi
    cachedOrder = null;
    const ord2 = order();
    const leader = ord2[0];
    if (leader && leader.status !== "done") {
      if (leader.i !== lastLeader) { lastLeader = leader.i; leaderSince = t; }
      if (t - leaderSince > 0.8 && announcedLeader !== leader.i && t > 4) {
        announcedLeader = leader.i;
        ev({ k: "lead", a: leader.i });
      }
    }
    ord2.forEach((r, k) => { r.prevRank = r.rank; r.rank = k + 1; });
    for (const r of ord2) {
      if (r.status === "done" || r.rank >= r.prevRank) continue;
      // r ha guadagnato posizioni: chi ha superato?
      for (const o of ord2) {
        if (o !== r && o.rank === r.rank + 1 && o.prevRank < r.prevRank && Math.abs(o.p - r.p) < 6 && o.status !== "done") {
          for (const id of o.quirks) quirkById(id)?.overtaken?.(o, r, ctx);
          for (const id of r.quirks) quirkById(id)?.overtake?.(r, o, ctx);
        }
      }
    }
    if (tick % 20 === 0) {
      for (const r of ord2) {
        const h = rankHist[r.i];
        h.push(r.rank);
        if (h.length > 6) h.shift();
        if (h.length >= 5 && h[0] - r.rank >= 3 && r.status === "run" && t > 10) {
          ev({ k: "surge", a: r.i, v: h[0] - r.rank });
          rankHist[r.i] = [r.rank];
        }
      }
    }

    // fatica e ultimi 400
    if (tick % FRAME_EVERY === 0) snapshot();

    // tutti arrivati?
    let remaining = 0;
    for (const r of runners) if (r.status !== "done" && r.status !== "dnf" && !r.riderless) remaining++;
    if (remaining === 0) {
      if (allDoneAt < 0) allDoneAt = t;
      if (t - allDoneAt > 3.5) break;
    }
  }

  // chi non è arrivato
  for (const r of runners) {
    if (r.status !== "done" && r.status !== "dnf") {
      r.status = "dnf";
      r.q.dnfReason = r.q.dnfReason ?? (r.riderless ? "senza fantino" : "non ha finito la corsa");
    }
    if (r.riderless && r.status === "done") r.status = "dnf";
  }
  snapshot();

  // ordine d'arrivo per tempo (i quirk di arrivo possono ribaltare un fotofinish)
  finishedOrder.sort((a, b) => a.finishT - b.finishT);
  finishedOrder.forEach((r, k) => (r.finishPos = k + 1));
  if (finishedOrder.length >= 2 && finishedOrder[1].finishT - finishedOrder[0].finishT < 0.06) {
    ev({ k: "photo", a: finishedOrder[0].i, b: finishedOrder[1].i });
  }

  // antidoping
  const dq = new Set<number>();
  for (const r of runners) {
    if (r.doped.length && rng.chance(spec.dopingTest)) {
      dq.add(r.i);
      ev({ k: "dq", a: r.i, x: r.doped.join(", ") });
    }
  }
  let pos = 0;
  const finalPos = new Map<number, number>();
  for (const r of finishedOrder) if (!dq.has(r.i)) finalPos.set(r.i, ++pos);

  const field = runners.length;
  const outcomes: RunnerOutcome[] = runners.map((r) => {
    const p = finalPos.get(r.i) ?? 0;
    for (let k = 0; k < NSTIM; k++) if (r.expo[k] > 0) r.exp.exposure[STIMULI[k]] = Math.round(r.expo[k] * 100) / 100;
    r.exp.position = p;
    r.exp.field = field;
    r.exp.exhaustedAt = r.exhaustedAt;
    if (r.status !== "done") r.exp.energyAtFinish = r.dprime / r.dmax;
    let injury = r.injuredInRace;
    // sforzo estremo / chiodo nel ferro
    if (!injury && r.q.chiodo && rng.chance(0.3)) injury = "zoppia da chiodo nel ferro";
    if (!injury && rng.chance(0.004 + (r.exhausted ? 0.01 : 0) + (r.h.cond.health < 60 ? 0.02 : 0))) injury = rng.pick(["affaticamento muscolare", "piccola infiammazione al tendine", "dolore alla schiena"]);
    return {
      horseId: r.h.id,
      name: r.h.name,
      num: r.i + 1,
      pos: p,
      time: r.status === "done" ? Math.round(r.finishT * 100) / 100 : 0,
      status: dq.has(r.i) ? "dq" : r.status === "done" ? "ok" : "dnf",
      dnfReason: r.status !== "done" ? (r.q.dnfReason ?? (r.exp.fell ? "caduto" : "ritirato")) : undefined,
      revealed: [...r.revealed],
      exp: r.exp,
      fell: r.exp.fell,
      injury,
      exhausted: r.exhaustedAt > 0,
      topSpeed: Math.round(r.topSpeedSeen * 3.6 * 10) / 10,
      strategy: STRATEGIES[r.strat].name,
      energyLeft: Math.round((r.dprime / r.dmax) * 100) / 100,
      doped: r.doped.length > 0,
    };
  });

  const winner = finishedOrder.find((r) => !dq.has(r.i));
  const replay: Replay = {
    v: 1,
    venue: venue.id,
    distance: D,
    startS: s0,
    width: W,
    hurdles,
    going: going.id,
    weather: weather.id,
    dt: DT * FRAME_EVERY,
    duration: Math.round(t * 100) / 100,
    horses: runners.map((r) => ({
      num: r.i + 1, id: r.h.id, name: r.h.name, look: r.h.look, silks: r.e.silks, stable: r.e.stable,
      jockey: r.h.jockey, ownerId: r.e.ownerId, sex: r.h.sex, age: Math.floor(ageYears(r.h, now)),
    })),
    frames,
    events,
    hazards,
    finish: outcomes.map((o) => ({ num: o.num, pos: o.pos, time: o.time, status: o.status })),
  };
  return { outcomes, replay, events, winnerTime: winner ? Math.round(winner.finishT * 100) / 100 : 0 };

  // ===================================================================
  function stepRunner(r: Runner, field: number) {
    const h = r.h;
    const s = h.stats;
    const sT = trackS(r);
    const curve = isCurve(venue, sT);
    const rem = remOf(r);

    // pulizia mod scaduti
    if (r.mods.length) {
      let expired = false;
      for (const m of r.mods) if (m.until <= t) { expired = true; break; }
      if (expired) r.mods = r.mods.filter((m) => m.until > t);
    }
    let mSpeed = 1, mCost = 1, mLat = 1, mAcc = 1;
    for (const m of r.mods) { mSpeed *= m.speed; mCost *= m.cost; mLat *= m.lat; mAcc *= m.accel; }

    // esposizione agli stimoli + paura/fiducia
    const sens = (1.3 - s.courage / 100) * (r.q.zenFactor ?? 1);
    let fearIn = 0;
    let comfortIn = 0;
    for (let k = 0; k < NSTIM; k++) {
      const inten = r.stimNow[k];
      if (!inten) continue;
      r.stimLast[k] = t;
      r.expo[k] += inten * DT;
      const v = r.fearV[k];
      if (v > 0) fearIn += inten * v;
      else comfortIn += inten * -v;
    }
    const decay = 0.35 + 0.7 * (s.calm / 100);
    r.arousal = clamp(r.arousal + (sens * fearIn * 1.1 - r.arousal * decay) * DT, 0, 1.5);
    r.comfort += (Math.min(1, comfortIn) - r.comfort) * DT * 0.8;
    if (r.status === "run" && r.arousal > 0.7 && (r.q.spookCd ?? 0) < t && rng.chance((r.arousal - 0.7) * 0.8 * (1 - s.focus / 220) * DT)) {
      let best: Stim | null = null;
      let bestV = 0;
      for (let k = 0; k < NSTIM; k++) {
        const x = r.stimNow[k] * r.fearV[k];
        if (x > bestV) { bestV = x; best = STIMULI[k]; }
      }
      r.q.spookCd = t + 7;
      spook(r, best ?? "niente");
    }

    // lassativo: bisogno impellente
    if (r.q.lassativo && r.status === "run" && r.p > r.q.lassativo * D) {
      r.q.lassativo = 0;
      stopR(r, rng.range(2, 3.5));
      ev({ k: "sabotage_effect", a: r.i, x: "lassativo" });
    }

    // stati speciali
    if (r.status === "stumble" || r.status === "rear" || r.status === "stop" || r.status === "fallen") {
      r.statusT -= DT;
      if (r.status === "fallen") {
        r.v *= 1 - 3.5 * DT;
        r.vd = 0;
        if (r.statusT <= 0) {
          // si rialza senza fantino
          r.status = "run";
          r.riderless = true;
          r.q.dnfReason = "caduto";
          ev({ k: "riderless", a: r.i });
        }
      } else if (r.status === "stumble") {
        r.v *= 1 - 0.55 * DT;
        if (r.statusT <= 0) r.status = "run";
      } else {
        if (r.q.indietro && t < r.q.indietro) { /* retromarcia gestita dal quirk */ }
        else r.v *= 1 - 5 * DT;
        if (r.statusT <= 0) r.status = "run";
      }
      advance(r, curve, mLat);
      return;
    }

    if (r.status === "done") {
      // dopo il traguardo: rallenta
      r.v = Math.max(5, r.v - 1.2 * DT);
      r.targetD = r.d;
      advance(r, curve, mLat);
      return;
    }

    // ---- velocità desiderata ----
    const csNow = r.cs * (1 - r.csDecay * (r.p / 1000)) * (r.riderless ? 0.95 : 1);
    const st = STRATEGIES[r.strat];
    const kickAt = clamp(r.plan.kickAt + h.mind.kick[ctxIdx] + (D - 1600) * 0.07, 150, D * 0.6);
    let effort: number;
    let target: number;
    const rankFrac = field > 1 ? (r.rank - 1) / (field - 1) : 0;
    const desiredRank = DESIRED_RANK[r.strat];

    if (r.riderless) {
      effort = 0.97 + 0.04 * Math.sin(t * 0.7 + r.i);
      target = csNow * effort;
    } else if (r.p < 110) {
      effort = 1.15;
      target = r.vmax * 0.95;
    } else if (rem > kickAt) {
      effort = r.p < D * 0.35 ? r.plan.early : r.plan.mid;
      if (rankFrac > desiredRank + 0.18) effort += 0.014 * (1 - r.plan.patience);
      else if (rankFrac < desiredRank - 0.22) effort -= 0.012 * r.plan.patience;
      // ritmo di crociera: spendi la riserva disponibile (meno quella tenuta per lo sprint) sui metri che mancano allo sprint
      const reserve = r.dmax * 0.38;
      const avail = Math.max(0, r.dprime - reserve);
      const dyn = csNow / Math.max(0.3, 1 - avail / Math.max(50, rem - kickAt));
      if (r.q.vEven === undefined) r.q.vEven = dyn;
      const skill = 0.3 + 0.65 * (s.smarts / 100);
      target = lerp(r.q.vEven, dyn, skill) * effort;
    } else {
      if (!r.kicking) { r.kicking = true; ev({ k: "kick", a: r.i }); }
      const vOpt = csNow / Math.max(0.05, 1 - r.dprime / Math.max(1, rem));
      const skill = 0.35 + 0.6 * (s.smarts / 100);
      target = lerp(csNow * r.plan.kickEffort, vOpt, skill);
      effort = target / csNow;
      // frusta
      if (rem < 380 && !r.riderless && t - r.whipT > 1.6 + rng.range(0, 1.2)) {
        r.whipT = t;
        stim(r, "frusta", 1);
        const fv = h.mind.v.frusta;
        if (fv > 0.3 && !r.q.whipBoost) arouse(r, fv * 0.35);
        else addMod(r, { speed: 1 + 0.012 * (r.q.whipBoost ?? 1) * (fv < -0.2 ? 1.6 : 1), dur: 1.2, label: "frusta" });
      }
    }

    // duello: la grinta tira fuori qualcosa in più
    if (rem < 500 && r.status === "run" && !r.riderless) {
      const b = besideOf(r);
      if (b) {
        target *= 1 + 0.025 * (s.grit / 100);
        grudge(r, b, 0, DT);
        const g = h.mind.grudge[b.h.id];
        if (g && g.v < -0.3) target *= 1.012; // rivalità
      }
    }
    // emozioni
    target *= 1 + 0.02 * r.comfort + 0.03 * Math.min(1, r.arousal);
    mCost *= 1 + 0.35 * r.arousal;
    const vcapBase = r.vmax * mSpeed;
    let vcap = vcapBase;
    if (r.exhausted) {
      r.q.deep = (r.q.deep ?? 0) + DT * 0.004;
      vcap = Math.min(vcap, csNow * (0.97 - r.q.deep));
    }
    target = Math.min(target * mSpeed, vcap);

    // ---- blocchi e cambi di corsia ----
    const a = aheadOf(r, BODY + 0.6 + r.v * 0.35);
    let blocked = false;
    if (a && a.v < target - 0.15) {
      blocked = true;
      r.q.blockT = (r.q.blockT ?? 0) + DT;
      const wantsOut = rem < kickAt + 120 || rng.next() > r.plan.patience || r.q.blockT > 4 || a.status !== "run";
      if (wantsOut && !r.q.fisso && (r.q.laneT ?? 0) <= t) {
        r.q.laneT = t + 0.3;
        const opts = [r.d + 1.35, r.d - 1.35, r.d + 2.6];
        let chosen: number | null = null;
        for (const od of opts) {
          if (od < 0.5 || od > W - 0.6) continue;
          if (laneFree(r, od)) { chosen = od; break; }
        }
        if (chosen !== null) r.targetD = chosen;
      }
      const gap = a.p - r.p;
      target = Math.min(target, a.v + Math.max(-1, (gap - BODY - 0.2) * 0.9));
      if (r.q.blockT > 1.5) stim(r, "gruppo", 1);
    } else {
      r.q.blockT = 0;
      // torna verso la corda se c'è spazio
      const railD = lerp(4.2, 0.6, r.plan.rail);
      if ((r.q.laneT ?? 0) <= t && Math.abs(r.targetD - railD) > 0.3) {
        r.q.laneT = t + 0.5;
        const step = r.targetD > railD ? -1.0 : 1.0;
        const nd = r.targetD + step;
        if (laneFree(r, nd, true)) r.targetD = nd;
      }
    }
    // in partenza tutti convergono lentamente verso la corda
    if (r.p < 250 && !blocked) r.targetD -= DT * 0.25 * r.plan.rail;
    r.targetD = clamp(r.targetD, 0.5, W - 0.6);
    r.effort = effort;

    // ---- dinamica longitudinale ----
    const amax = r.accel0 * mAcc * Math.max(0.1, 1 - r.v / Math.max(1, vcapBase * 1.02));
    const acc = clamp((target - r.v) * 2.0, -3.5, amax);
    r.v = Math.max(0, r.v + acc * DT);
    if (r.v > r.topSpeedSeen) r.topSpeedSeen = r.v;

    // ---- energia ----
    let draft = 1;
    const dr = aheadOf(r, 3.6);
    if (dr && Math.abs(dr.d - r.d) < 0.9) draft = 0.94;
    let wind = 1;
    if (r.rank === 1 && !aheadOf(r, 9)) wind = 1 + 0.045 * weather.wind;
    const vEff = r.v * going.cost * mCost * draft * wind;
    if (vEff > csNow) {
      r.dprime -= (vEff - csNow) * DT;
    } else {
      r.dprime = Math.min(r.dmax, r.dprime + (csNow - vEff) * r.recov * DT);
    }
    if (r.dprime <= 0) {
      r.dprime = 0;
      if (!r.exhausted) {
        r.exhausted = true;
        if (!r.exhaustedAt) r.exhaustedAt = Math.max(1, rem);
        if (rem > 50) ev({ k: "exhausted", a: r.i, v: Math.round(rem) });
      }
    } else if (r.exhausted && r.dprime > r.dmax * 0.12) {
      r.exhausted = false;
    }

    advance(r, curve, mLat);
  }

  function laneFree(r: Runner, d: number, strict = false): boolean {
    let free = true;
    const lim = strict ? 3.4 : 3.0;
    scan(r, lim, lim + 2, (o) => {
      if (!onTrack(o)) return;
      const dp = o.p - r.p;
      if (dp > -lim && dp < lim + (o.v < r.v ? 2 : 0) && Math.abs(o.d - d) < 0.95) { free = false; return true; }
      // non attraversare un cavallo che sta in mezzo
      if (Math.abs(dp) < 1.8 && o.d > Math.min(r.d, d) && o.d < Math.max(r.d, d)) { free = false; return true; }
    });
    if (!free) return false;
    for (const hz of hazards) {
      if ((hz.kind === "caduto" || hz.kind === "invasore") && t >= hz.t0 && t <= hz.t1 && hz.p - r.p > 0 && hz.p - r.p < 20 && Math.abs(hz.d - d) < 1.2) return false;
    }
    return true;
  }

  function advance(r: Runner, curve: boolean, mLat: number) {
    const s = r.h.stats;
    // sterzo verso la corsia desiderata
    const latLim = r.latMax * mLat * (1 - 0.3 * Math.min(1, r.v / 20));
    const desired = clamp((r.targetD - r.d) * 1.6, -latLim, latLim);
    r.vd += (desired - r.vd) * Math.min(1, DT * 4);
    // forza centrifuga in curva per chi è poco agile
    if (curve && r.status === "run") r.vd += ((r.v * r.v) / venue.R) * 0.012 * (1 - s.agility / 140) * DT * 10;
    r.d += r.vd * DT;
    if (r.status === "fallen") r.d -= r.vd * DT;
    // steccati
    if (r.d < 0.4) { r.d = 0.4; if (r.vd < -0.8 && r.status === "run") { stim(r, "contatto", 0.5); r.v *= 0.995; } r.vd = Math.abs(r.vd) * 0.2; }
    if (r.d > W - 0.45) { r.d = W - 0.45; r.vd = -Math.abs(r.vd) * 0.2; }
    // avanzamento lungo la corda
    r.p += r.v * railFactor(venue, trackS(r), r.d) * DT;
  }

  function resolveCollisions() {
    const list = runners.filter((r) => r.status !== "gate" && r.status !== "dnf" && r.status !== "done").sort((a, b) => a.p - b.p);
    for (let x = 0; x < list.length; x++) {
      const A = list[x];
      for (let y = x + 1; y < list.length; y++) {
        const B = list[y];
        const dp = B.p - A.p; // B davanti (o pari)
        if (dp > BODY + 0.2) break;
        const dd = B.d - A.d;
        const add = Math.abs(dd);
        if (add >= WIDTH) continue;
        if (A.status === "fallen" || B.status === "fallen") {
          const fallen = A.status === "fallen" ? A : B;
          const other = fallen === A ? B : A;
          if (other.status !== "run" || other.q["salto:" + fallen.i]) continue;
          other.q["salto:" + fallen.i] = true;
          const ok = rng.chance(0.5 + 0.4 * (other.h.stats.agility / 100) + 0.1 * (other.h.stats.jumping / 100));
          if (ok) { ev({ k: "leap", a: other.i, b: fallen.i }); addMod(other, { speed: 0.9, dur: 1, label: "salto del caduto" }); other.dprime -= 3; }
          else { stumble(other, 0.9, "cavallo a terra"); }
          continue;
        }
        if (dp < BODY * 0.7) {
          // contatto laterale
          const overlap = WIDTH - add;
          const dir = dd >= 0 ? 1 : -1;
          const mSum = A.mass + B.mass;
          A.d -= dir * overlap * (B.mass / mSum);
          B.d += dir * overlap * (A.mass / mSum);
          const rel = (A.vd - B.vd) * dir; // >0 se si avvicinano
          const impact = overlap * 1.6 + Math.max(0, rel) * 0.6;
          if (impact > 0.38 && A.bumpCd <= t && B.bumpCd <= t) {
            A.bumpCd = B.bumpCd = t + 1.2;
            // chi si muoveva verso l'altro è il "colpevole"
            const culprit = Math.abs(A.vd) > Math.abs(B.vd) ? A : B;
            bump(culprit, culprit === A ? B : A, Math.min(1.5, impact));
          }
          const avg = (A.vd + B.vd) / 2;
          A.vd = avg - dir * 0.1;
          B.vd = avg + dir * 0.1;
        } else if (add < WIDTH * 0.85) {
          // tallonamento: A dietro, B davanti
          const closing = A.v - B.v;
          if (closing > 0) {
            A.v = Math.min(A.v, B.v + 0.1);
            if (closing > 0.7 && A.bumpCd <= t) {
              A.bumpCd = t + 1.5;
              stim(A, "contatto", 0.6);
              if (rng.chance(0.3 * closing * going.slip)) stumble(A, 0.45, "ha toccato i posteriori di " + B.h.name);
            }
          }
        }
      }
    }
  }

  function checkHazards() {
    for (const hz of hazards) {
      if (t < hz.t0 || t > hz.t1) continue;
      if (hz.kind === "invasore" && hz.vd) {
        hz.d += hz.vd * DT;
        if (hz.d < -1) hz.t1 = t;
      }
      if (hz.kind === "caduto" && hz.owner !== undefined) {
        const o = runners[hz.owner];
        hz.p = o.p; hz.d = o.d;
        if (o.status !== "fallen") hz.t1 = t;
        continue;
      }
      if (hz.kind === "petardo" || hz.kind === "laser" || hz.kind === "sicario") continue;
      if (hz.kind === "drone" && hz.target !== undefined) {
        const tg = runners[hz.target];
        hz.p = tg.p + 2; hz.d = tg.d;
        continue;
      }
      for (const r of runners) {
        if (r.status !== "run" && r.status !== "stumble") continue;
        const prevP = r.q._prevP ?? r.p;
        const crossing = hz.kind === "invasore" ? Math.abs(r.p - hz.p) < 1.3 : prevP <= hz.p + hz.r && r.p >= hz.p - hz.r;
        if (!crossing || Math.abs(r.d - hz.d) > hz.r + 0.3) continue;
        const key = "hz:" + hz.id;
        if (r.q[key]) continue;
        r.q[key] = true;
        let avoided = false;
        for (const id of r.quirks) if (!avoided) avoided = quirkById(id)?.hazard?.(r, hz, ctx) ?? false;
        if (!avoided && rng.chance(0.08 * (r.h.stats.focus / 100) + 0.05 * (r.h.stats.agility / 100))) {
          avoided = true;
          r.vd += r.d > hz.d ? 1.2 : -1.2;
        }
        if (avoided) { ev({ k: "avoid", a: r.i, x: hz.kind }); continue; }
        ev({ k: "hazard", a: r.i, x: hz.kind });
        switch (hz.kind) {
          case "buccia": stumble(r, 0.95, "buccia di banana"); if (rng.chance(0.25)) fall(r, "buccia di banana"); hz.t1 = t; break;
          case "olio": r.vd += rng.chance(0.5) ? 1.6 : -1.6; stumble(r, 0.65, "olio in pista"); break;
          case "corda": if (!rng.chance(0.25 + 0.5 * (r.h.stats.jumping / 100))) stumble(r, 0.9, "corda tesa"); else ev({ k: "leap", a: r.i }); break;
          case "invasore": stumble(r, 0.75, "invasore di pista"); arouse(r, 0.5); break;
        }
      }
    }
  }

  function jumpHurdle(r: Runner) {
    const s = r.h.stats;
    let clean = 0.935 + 0.06 * (s.jumping / 100) - 0.07 * Math.min(1, r.arousal) - 0.12 * Math.max(0, r.h.mind.v.ostacoli) + (r.exhausted ? -0.05 : 0);
    if (r.status === "stumble") clean -= 0.25;
    for (const id of r.quirks) clean += quirkById(id)?.hurdle?.(r, ctx) ?? 0;
    r.dprime = Math.max(0, r.dprime - (2 + (1 - s.jumping / 100) * 3));
    stim(r, "ostacoli", 1);
    touch(r, "ostacoli", 0);
    if (rng.chance(clamp(clean, 0.3, 0.995))) {
      r.v *= 0.985 - 0.02 * (1 - s.jumping / 100);
      return;
    }
    const refuseP = clamp(0.22 + Math.max(0, r.h.mind.v.ostacoli) * 0.4 + (r.q.rifiuta ? 0.35 : 0), 0, 0.85);
    if (rng.chance(refuseP)) {
      r.p -= 1.5;
      stopR(r, rng.range(1.8, 3));
      harm(r, 0.5);
      ev({ k: "refuse", a: r.i });
      if (r.q.rifiuta) revealQuirk(r, "rifiutatore", "rifiuta l'ostacolo e si pianta");
    } else if (rng.chance(0.16 * luckF(r))) {
      ev({ k: "hurdle_fall", a: r.i });
      fall(r, "siepe");
    } else {
      ev({ k: "hurdle_clip", a: r.i });
      stumble(r, 0.6, "ha urtato la siepe");
    }
  }
}

/** Utilità per i test e il client: posizione 3D di un corridore in un frame. */
export function framePosition(rep: Replay, frame: number, idx: number) {
  const f = rep.frames[frame];
  const p = f[idx * 4] / 10;
  const d = f[idx * 4 + 1] / 100;
  return trackPoint(venueById(rep.venue), rep.startS + p, d);
}

export { lapLength, modn };
