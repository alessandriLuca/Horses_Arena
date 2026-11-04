import type { Horse } from "./horse";
import type { Experience, Stim } from "./learning";
import type { Rng } from "./rng";

export interface Silks {
  primary: string;
  secondary: string;
  pattern: "tinta" | "strisce" | "bande" | "stella" | "croce" | "pois" | "diagonale" | "quarti";
  cap: string;
}

export interface Orders {
  strategy?: number | null; // indice in STRATEGIES, null = decide il cavallo
  whip?: "mai" | "normale" | "tanta";
  lane?: "auto" | "corda" | "esterno";
  kick?: "presto" | "normale" | "tardi";
  blinkers?: boolean; // paraocchi
  earplugs?: boolean; // tappi per le orecchie
  rainShoes?: boolean; // ferri da pioggia
}

export interface RaceEntry {
  orders?: Orders;
  horse: Horse;
  stable: string;
  ownerId: string | null;
  silks: Silks;
  security: number; // 0..3 livello di sorveglianza pagato dal proprietario
}

export interface HitmanOrder {
  id: string;
  service: string; // id del servizio (vedi game/crime.ts)
  targetId: string; // id cavallo bersaglio
  byPlayer: string;
  at: number; // frazione di gara (0..1) in cui agire
}

export interface RaceSpec {
  id: string;
  seed: string;
  name: string;
  venue: string;
  distance: number;
  going: string;
  weather: string;
  hurdles: boolean;
  big: boolean; // finali, gran premi
  spectators: number; // 0..1 (più gente => più folla)
  entries: RaceEntry[];
  hitmen: HitmanOrder[];
  dopingTest: number; // probabilità controllo antidoping 0..1
}

export type RunnerStatus = "gate" | "run" | "stumble" | "fallen" | "rear" | "stop" | "done" | "dnf";

export interface Mod {
  speed: number; // moltiplicatore velocità desiderata e massima
  cost: number; // moltiplicatore consumo energia
  lat: number; // moltiplicatore agilità laterale
  accel: number;
  until: number;
  label: string;
}

export interface Runner {
  i: number;
  h: Horse;
  e: RaceEntry;
  p: number; // metri percorsi (sulla corda)
  d: number; // metri dalla corda
  v: number; // velocità lungo il proprio percorso (m/s)
  vd: number; // velocità laterale
  targetD: number;
  vmax: number;
  cs: number; // velocità critica (aerobica)
  dmax: number; // riserva anaerobica (metri sopra cs)
  dprime: number;
  accel0: number;
  latMax: number;
  mass: number;
  recov: number;
  csDecay: number;
  arousal: number;
  comfort: number;
  strat: number;
  plan: { early: number; mid: number; kickAt: number; kickEffort: number; rail: number; patience: number };
  status: RunnerStatus;
  statusT: number; // tempo rimanente nello stato speciale
  mods: Mod[];
  startDelay: number;
  finishT: number;
  finishPos: number;
  exhausted: boolean;
  exhaustedAt: number;
  riderless: boolean;
  kicking: boolean;
  whipT: number;
  stimNow: Float64Array; // intensità attuale per stimolo (indice SI)
  stimLast: Float64Array; // ultimo istante in cui lo stimolo era presente
  expo: Float64Array; // esposizione accumulata
  fearV: Float64Array; // paura appresa + innata (copia veloce)
  exp: Experience;
  q: Record<string, any>; // stato privato dei quirk
  quirks: string[];
  luck: number; // -1..1 (quirk fortunati/sfortunati)
  bumpCd: number;
  rank: number;
  prevRank: number;
  effort: number; // ultimo sforzo richiesto (debug/commento)
  form: number;
  injuredInRace: string | null;
  doped: string[];
  revealed: Set<string>;
  topSpeedSeen: number;
}

export interface RaceEvent {
  t: number;
  k: string; // tipo
  a?: number; // indice corridore
  b?: number; // secondo corridore
  q?: string; // id quirk
  x?: string; // testo
  v?: number; // valore
  it?: string; // testo per la telecronaca
  en?: string;
}

export interface Hazard {
  id: number;
  kind: "buccia" | "olio" | "corda" | "invasore" | "caduto" | "petardo" | "drone" | "laser" | "sicario";
  p: number;
  d: number;
  r: number; // raggio (metri)
  t0: number;
  t1: number;
  vd?: number; // per l'invasore (attraversa)
  owner?: number; // corridore caduto
  target?: number;
  emoji?: string;
}

/** API che la simulazione offre ai quirk. */
export interface QCtx {
  t: number;
  dt: number;
  rng: Rng;
  spec: RaceSpec;
  runners: Runner[];
  distance: number;
  width: number;
  rem(r: Runner): number;
  inCurve(r: Runner): boolean;
  finalStretch(r: Runner): boolean;
  leader(): Runner;
  order(): Runner[]; // in gara, per posizione
  near(r: Runner, dp: number, dd: number): Runner[];
  ahead(r: Runner, maxGap?: number): Runner | null;
  behind(r: Runner, maxGap?: number): Runner | null;
  beside(r: Runner): Runner | null;
  mod(r: Runner, m: Partial<Mod> & { dur: number; label: string }): void;
  push(r: Runner, lateral: number): void;
  stim(r: Runner, s: Stim, intensity: number): void;
  emit(r: Runner, s: Stim, radius: number, intensity: number): void;
  stumble(r: Runner, severity: number, cause: string): void;
  rear(r: Runner, dur: number): void;
  stop(r: Runner, dur: number): void;
  bump(r: Runner, o: Runner, impact: number): void;
  energy(r: Runner, meters: number): void;
  arouse(r: Runner, amount: number): void;
  quirk(r: Runner, id: string, text: string, other?: Runner): void;
  hazard(h: Omit<Hazard, "id">): void;
  ev(e: Omit<RaceEvent, "t">): void;
  chance(perSecond: number): boolean;
}

export interface QuirkDef {
  id: string;
  name: string;
  desc: string;
  polarity: "+" | "-" | "±";
  rarity: 1 | 2 | 3 | 4; // 1 comune .. 4 leggendario
  /** Applicato all'inizio (statistiche runtime). Non rivela il quirk. */
  setup?(r: Runner, c: QCtx): void;
  start?(r: Runner, c: QCtx): void;
  tick?(r: Runner, c: QCtx): void;
  bumped?(r: Runner, o: Runner, impact: number, c: QCtx): void;
  overtaken?(r: Runner, by: Runner, c: QCtx): void;
  overtake?(r: Runner, o: Runner, c: QCtx): void;
  hurdle?(r: Runner, c: QCtx): number; // ritorna aggiustamento alla probabilità di salto pulito
  finish?(r: Runner, c: QCtx): number; // secondi guadagnati (allungo sul palo)
  hazard?(r: Runner, hz: Hazard, c: QCtx): boolean; // true = evitato
}
