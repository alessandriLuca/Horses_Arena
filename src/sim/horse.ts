// Modello del cavallo: genetica, statistiche, aspetto, età, valore, riproduzione.
import { Rng, clamp, lerp } from "./rng";
import { horseName } from "./names";
import { newMind, type Mind } from "./learning";
import { QUIRKS, rollQuirks, inheritQuirks } from "./quirks";

export const STAT_KEYS = [
  "speed", "accel", "stamina", "strength", "agility", "recovery", "jumping",
  "courage", "calm", "focus", "grit", "smarts", "consistency",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, string> = {
  speed: "Velocità di punta",
  accel: "Accelerazione",
  stamina: "Resistenza",
  strength: "Forza",
  agility: "Agilità",
  recovery: "Recupero",
  jumping: "Salto",
  courage: "Coraggio",
  calm: "Calma",
  focus: "Concentrazione",
  grit: "Grinta",
  smarts: "Intelligenza",
  consistency: "Regolarità",
};

export type Surface = "erba" | "sabbia" | "terra" | "neve";

/** Attitudini genetiche, fisse per tutta la vita. */
export interface Aptitude {
  distance: number; // 0 = velocista puro, 1 = fondista puro
  going: number; // -1 ama il terreno secco, +1 ama il pesante
  surface: Record<Surface, number>; // 0.9..1.08
  style: number; // 0 = corre davanti, 1 = ama rimontare
  heightCm: number;
  weightKg: number;
}

export type CoatId =
  | "baio" | "baio_scuro" | "sauro" | "sauro_bruciato" | "morello" | "grigio" | "grigio_pomellato"
  | "palomino" | "isabella" | "falbo" | "roano" | "pezzato" | "leopardato" | "cremello";

export interface Appearance {
  coat: CoatId;
  body: string; // colore principale #rrggbb
  points: string; // gambe/criniera (estremità)
  mane: string;
  patchColor: string; // macchie (pezzato/leopardato)
  pattern: "none" | "dapple" | "pinto" | "spots" | "roan" | "dorsal";
  patternSeed: number;
  face: "none" | "stella" | "lista" | "lista_larga" | "muso_bianco";
  socks: [number, number, number, number]; // 0 niente, 1 corona, 2 balzana, 3 calza alta (AS, AD, PS, PD)
  maneStyle: "corta" | "lunga" | "intrecciata" | "ribelle";
  eyes: "scuri" | "azzurri";
  neck: number; // 0.9..1.1
  legs: number; // 0.92..1.08
  head: number; // 0.92..1.08
  build: number; // 0 snello .. 1 massiccio
}

export interface Condition {
  fatigue: number; // 0..100
  fatigueTs: number;
  morale: number; // 0..100
  health: number; // 0..100
  injury: { name: string; until: number } | null;
  busy: { until: number; reason: string } | null;
  pregnant: { until: number; sireId: string; sireName: string } | null;
  effects: RaceEffect[]; // effetti (doping, sabotaggi) sulla prossima corsa
}

export interface RaceEffect {
  kind: string; // es. "stimolante", "sonnifero"
  until: number;
  by?: string; // id giocatore (sabotaggi)
  secret?: boolean;
}

export interface Record_ {
  starts: number;
  wins: number;
  places: number; // arrivi nei primi 3
  earnings: number;
  form: number[]; // ultimi piazzamenti (0 = non arrivato)
  bestTimes: Record<string, number>; // distanza -> secondi
  falls: number;
}

export interface Horse {
  id: string;
  name: string;
  ownerId: string | null; // null = allevamento/mercato del sistema
  sex: "M" | "F";
  birth: number; // ms
  stats: Stats; // livello attuale
  potential: Stats; // tetto genetico
  apt: Aptitude;
  look: Appearance;
  quirks: string[]; // id quirk (nascosti finché non si manifestano)
  revealed: string[]; // quirk già visti in gara
  cond: Condition;
  mind: Mind;
  rec: Record_;
  rating: number; // stile Elo
  sireId: string | null;
  damId: string | null;
  sireName?: string;
  damName?: string;
  generation: number;
  jockey: string;
  bot?: boolean;
  retired?: boolean;
  botStable?: string; // nome della scuderia (per i cavalli del sistema)
  plan?: { days: { s: string; i: "leggera" | "normale" | "intensa" }[]; active: boolean };
  trainedAt?: number; // ultima seduta extra
  contracts?: { offer: string; tpl: string; pay: number; until: number }[];
  div?: number; // divisione di campionato per la prossima stagione
  trophies?: string[];
  venuesWon?: string[];
  bornAt?: string; // allevamento d'origine
  illness?: { id: string; since: number; diagnosed: boolean; treatment: string | null; until: number | null; untreatedDays: number } | null;
  insurance?: { policy: "nessuna" | "base" | "completa"; value: number; since: number } | null;
  dead?: { at: number; cause: string } | null;
}

// --- tempo di gioco ---------------------------------------------------------
export const DAY = 24 * 3600 * 1000;
/** Un anno di vita del cavallo dura 3 giorni reali. */
export const YEAR_MS = 3 * DAY;
export const RACING_AGE = 2;
export const RETIRE_AGE = 14;

export function ageYears(h: Horse, now: number): number {
  return (now - h.birth) / YEAR_MS;
}

/** Fattore di rendimento dovuto all'età (picco 4-6 anni). */
export function ageFactor(age: number): number {
  if (age < 2) return 0.85;
  if (age < 3) return lerp(0.95, 0.985, age - 2);
  if (age < 4) return lerp(0.985, 1, age - 3);
  if (age <= 6.5) return 1;
  if (age <= 9) return lerp(1, 0.965, (age - 6.5) / 2.5);
  return Math.max(0.85, lerp(0.965, 0.9, (age - 9) / 4));
}

/** Quanto un cavallo migliora con l'allenamento in base all'età. */
export function trainability(age: number): number {
  if (age < 3) return 1.25;
  if (age < 5) return 1.0;
  if (age < 7) return 0.75;
  if (age < 9) return 0.5;
  return 0.3;
}

// --- generazione ------------------------------------------------------------
const COATS: { id: CoatId; w: number; body: string[]; points: string[]; mane: string[]; pattern: Appearance["pattern"] }[] = [
  { id: "baio", w: 18, body: ["#7a4524", "#8a4f2a", "#6e3d1f"], points: ["#1a1210"], mane: ["#15100d"], pattern: "none" },
  { id: "baio_scuro", w: 10, body: ["#4a2a18", "#3e2314"], points: ["#120c0a"], mane: ["#0e0a08"], pattern: "none" },
  { id: "sauro", w: 14, body: ["#a0522d", "#b35d2e", "#9a4a22"], points: ["#a0522d"], mane: ["#8f4521", "#d9a066"], pattern: "none" },
  { id: "sauro_bruciato", w: 6, body: ["#5e2a14", "#6b3017"], points: ["#5a2812"], mane: ["#4a2210", "#c8a080"], pattern: "none" },
  { id: "morello", w: 8, body: ["#141414", "#1c1a1a"], points: ["#101010"], mane: ["#0a0a0a"], pattern: "none" },
  { id: "grigio", w: 9, body: ["#b8b8b4", "#c9c8c2", "#a8a8a6"], points: ["#77757a"], mane: ["#d8d8d8", "#666666"], pattern: "none" },
  { id: "grigio_pomellato", w: 7, body: ["#9a9a98", "#a9a8a4"], points: ["#5b5a5e"], mane: ["#e0e0e0", "#4a4a4a"], pattern: "dapple" },
  { id: "palomino", w: 5, body: ["#d9a94e", "#e0b25a", "#cf9f45"], points: ["#d9a94e"], mane: ["#f4ecd8"], pattern: "none" },
  { id: "isabella", w: 5, body: ["#c9a46a", "#d1ac72"], points: ["#1b1410"], mane: ["#17110d"], pattern: "none" },
  { id: "falbo", w: 4, body: ["#b39468", "#a88a5e"], points: ["#3a2a1c"], mane: ["#2e2218"], pattern: "dorsal" },
  { id: "roano", w: 4, body: ["#8b5a4a", "#7d6a70"], points: ["#2a1e1c"], mane: ["#231816"], pattern: "roan" },
  { id: "pezzato", w: 5, body: ["#6e3d1f", "#141414", "#a0522d"], points: ["#f2efe8"], mane: ["#1a1210", "#f2efe8"], pattern: "pinto" },
  { id: "leopardato", w: 3, body: ["#ece8df", "#e5dfd2"], points: ["#3a2a22"], mane: ["#3a2a22", "#ddd"], pattern: "spots" },
  { id: "cremello", w: 2, body: ["#efe3c6", "#f3e9d2"], points: ["#efe3c6"], mane: ["#fbf6ea"], pattern: "none" },
];

export function randomAppearance(rng: Rng): Appearance {
  const c = rng.weighted(COATS, (x) => x.w);
  return makeAppearance(rng, c.id);
}

function makeAppearance(rng: Rng, coat: CoatId): Appearance {
  const c = COATS.find((x) => x.id === coat)!;
  const body = rng.pick(c.body);
  const patch = c.pattern === "pinto" ? "#f2efe8" : c.pattern === "spots" ? rng.pick(["#2a1e18", "#5a3420", "#1a1a1a"]) : body;
  const sockRoll = () => rng.weighted([0, 1, 2, 3], (k) => [10, 2, 3, 1.5][k]);
  return {
    coat,
    body,
    points: rng.pick(c.points),
    mane: rng.pick(c.mane),
    patchColor: patch,
    pattern: c.pattern,
    patternSeed: rng.int(1, 1e9),
    face: rng.weighted(["none", "stella", "lista", "lista_larga", "muso_bianco"] as const, (f) => ({ none: 8, stella: 4, lista: 3, lista_larga: 2, muso_bianco: 0.6 })[f]),
    socks: [sockRoll(), sockRoll(), sockRoll(), sockRoll()],
    maneStyle: rng.weighted(["corta", "lunga", "intrecciata", "ribelle"] as const, (m) => ({ corta: 4, lunga: 4, intrecciata: 1.5, ribelle: 1.5 })[m]),
    eyes: rng.chance(coat === "cremello" || c.pattern === "pinto" ? 0.35 : 0.03) ? "azzurri" : "scuri",
    neck: rng.range(0.92, 1.1),
    legs: rng.range(0.93, 1.07),
    head: rng.range(0.93, 1.07),
    build: rng.range(0, 1),
  };
}

function emptyStats(): Stats {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Stats;
}

/** Potenziale genetico; `quality` 0..1 sposta la media. */
function randomPotential(rng: Rng, quality: number): Stats {
  const p = emptyStats();
  const base = 45 + quality * 35;
  for (const k of STAT_KEYS) p[k] = clamp(Math.round(rng.normal(base, 11)), 20, 100);
  return p;
}

function aptitudeFor(rng: Rng, p: Stats): Aptitude {
  const distance = clamp(rng.normal(0.5, 0.22) + (p.stamina - p.speed) / 250, 0, 1);
  const surface: Record<Surface, number> = {
    erba: rng.range(0.94, 1.06),
    terra: rng.range(0.93, 1.06),
    sabbia: rng.range(0.9, 1.07),
    neve: rng.range(0.88, 1.08),
  };
  const heightCm = Math.round(clamp(rng.normal(163, 5), 150, 178));
  const weightKg = Math.round(clamp(420 + (heightCm - 150) * 4 + (p.strength - 50) * 1.2 + rng.normal(0, 14), 400, 600));
  return {
    distance,
    going: clamp(rng.normal(0, 0.45), -1, 1),
    surface,
    style: clamp(rng.normal(0.5, 0.25), 0, 1),
    heightCm,
    weightKg,
  };
}

export function newCondition(now: number): Condition {
  return { fatigue: 10, fatigueTs: now, morale: 70, health: 100, injury: null, busy: null, pregnant: null, effects: [] };
}

function newRecord(): Record_ {
  return { starts: 0, wins: 0, places: 0, earnings: 0, form: [], bestTimes: {}, falls: 0 };
}

/** Stats iniziali: una frazione del potenziale (cavalli giovani hanno margine). */
function startingStats(rng: Rng, pot: Stats, age: number): Stats {
  const s = emptyStats();
  const dev = clamp(0.62 + (age - 2) * 0.07, 0.6, 0.93);
  for (const k of STAT_KEYS) {
    // le doti mentali innate sono già quasi tutte presenti
    const mental = k === "courage" || k === "calm" || k === "focus" || k === "smarts" || k === "consistency" || k === "grit";
    const f = mental ? clamp(dev + 0.15, 0, 0.97) : dev;
    s[k] = clamp(Math.round(pot[k] * rng.range(f - 0.05, f + 0.05)), 10, pot[k]);
  }
  return s;
}

export interface GenOpts {
  id: string;
  ownerId: string | null;
  now: number;
  age?: number;
  quality?: number;
  sex?: "M" | "F";
  bot?: boolean;
}

export function generateHorse(rng: Rng, o: GenOpts): Horse {
  const quality = o.quality ?? rng.range(0.15, 0.75);
  const age = o.age ?? rng.range(2, 4.5);
  const pot = randomPotential(rng, quality);
  const apt = aptitudeFor(rng, pot);
  const h: Horse = {
    id: o.id,
    name: horseName(rng),
    ownerId: o.ownerId,
    sex: o.sex ?? (rng.chance(0.5) ? "M" : "F"),
    birth: o.now - age * YEAR_MS,
    stats: startingStats(rng, pot, age),
    potential: pot,
    apt,
    look: randomAppearance(rng),
    quirks: rollQuirks(rng),
    revealed: [],
    cond: newCondition(o.now),
    mind: newMind(apt.style),
    rec: newRecord(),
    rating: 0,
    sireId: null,
    damId: null,
    generation: 0,
    jockey: "",
    bot: o.bot,
  };
  h.rating = Math.round(1000 + (overall(h) - 50) * 12);
  return h;
}

// --- valutazioni -----------------------------------------------------------
/** Valore complessivo 0..100 (pesato per l'importanza in gara). */
export function overall(h: Horse, useStats: Stats = h.stats): number {
  const s = useStats;
  return (
    s.speed * 0.2 + s.stamina * 0.17 + s.accel * 0.12 + s.strength * 0.07 + s.agility * 0.07 + s.recovery * 0.07 +
    s.courage * 0.06 + s.calm * 0.05 + s.focus * 0.05 + s.grit * 0.06 + s.smarts * 0.03 + s.consistency * 0.03 + s.jumping * 0.02
  );
}

export function quirkValue(h: Horse): number {
  let v = 0;
  for (const id of h.revealed) {
    const q = QUIRKS.find((x) => x.id === id);
    if (q) v += q.polarity === "+" ? 0.12 : q.polarity === "-" ? -0.1 : 0.02;
  }
  return v;
}

/** Prezzo di mercato indicativo in fiorini. */
export function valuation(h: Horse, now: number): number {
  const age = ageYears(h, now);
  const o = overall(h);
  const p = overall(h, h.potential);
  let v = 1500 + Math.pow(Math.max(0, o - 25), 2.15) * 6 + Math.max(0, p - o) * 120;
  if (age < 2) v *= 0.7;
  else if (age > 7) v *= Math.max(0.15, 1 - (age - 7) * 0.13);
  v *= 1 + Math.min(0.6, h.rec.wins * 0.04) + quirkValue(h);
  if (h.cond.injury) v *= 0.7;
  if (h.retired) v *= 0.35;
  return Math.max(300, Math.round(v / 50) * 50);
}

// --- riproduzione ----------------------------------------------------------
export function canBreed(h: Horse, now: number): string | null {
  const age = ageYears(h, now);
  if (age < 3) return "è troppo giovane per riprodursi (servono 3 anni)";
  if (age > 20) return "è troppo vecchio per riprodursi";
  if (h.cond.injury) return "è infortunato";
  if (h.cond.pregnant) return "è già gravida";
  return null;
}

export const GESTATION_MS = 1.5 * DAY;

export function breedFoal(rng: Rng, sire: Horse, dam: Horse, id: string, ownerId: string, now: number): Horse {
  const pot = emptyStats();
  for (const k of STAT_KEYS) {
    const mid = (sire.potential[k] + dam.potential[k]) / 2;
    // varianza genetica + rara mutazione forte
    const mutation = rng.chance(0.06) ? rng.normal(0, 14) : 0;
    pot[k] = clamp(Math.round(mid + rng.normal(0, 7) + mutation), 15, 100);
  }
  const apt = aptitudeFor(rng, pot);
  apt.distance = clamp((sire.apt.distance + dam.apt.distance) / 2 + rng.normal(0, 0.1), 0, 1);
  apt.going = clamp((sire.apt.going + dam.apt.going) / 2 + rng.normal(0, 0.2), -1, 1);
  apt.style = clamp((sire.apt.style + dam.apt.style) / 2 + rng.normal(0, 0.15), 0, 1);
  for (const s of Object.keys(apt.surface) as Surface[]) {
    apt.surface[s] = clamp((sire.apt.surface[s] + dam.apt.surface[s]) / 2 + rng.normal(0, 0.025), 0.86, 1.1);
  }
  // mantello: da uno dei genitori, a volte una sorpresa
  const r = rng.next();
  const coat = r < 0.45 ? sire.look.coat : r < 0.9 ? dam.look.coat : rng.weighted(COATS, (x) => x.w).id;
  const look = makeAppearance(rng, coat);
  look.neck = clamp((sire.look.neck + dam.look.neck) / 2 + rng.normal(0, 0.03), 0.9, 1.12);
  look.legs = clamp((sire.look.legs + dam.look.legs) / 2 + rng.normal(0, 0.02), 0.92, 1.08);
  look.build = clamp((sire.look.build + dam.look.build) / 2 + rng.normal(0, 0.12), 0, 1);
  const foal: Horse = {
    id,
    name: horseName(rng),
    ownerId,
    sex: rng.chance(0.5) ? "M" : "F",
    birth: now,
    stats: startingStats(rng, pot, 0),
    potential: pot,
    apt,
    look,
    quirks: inheritQuirks(rng, sire.quirks, dam.quirks),
    revealed: [],
    cond: newCondition(now),
    mind: newMind(apt.style),
    rec: newRecord(),
    rating: 0,
    sireId: sire.id,
    damId: dam.id,
    sireName: sire.name,
    damName: dam.name,
    generation: Math.max(sire.generation, dam.generation) + 1,
    jockey: "",
  };
  // i puledri partono sotto, ma crescono
  for (const k of STAT_KEYS) foal.stats[k] = Math.round(foal.stats[k] * 0.85);
  foal.rating = Math.round(1000 + (overall(foal) - 50) * 12);
  return foal;
}

// --- condizione nel tempo ---------------------------------------------------
/** Fatica attuale: recupera col tempo in base al Recupero. */
export function currentFatigue(h: Horse, now: number): number {
  const hours = Math.max(0, (now - h.cond.fatigueTs) / 3600000);
  const perHour = 1.2 + h.stats.recovery / 40; // 1.2..3.7 punti/ora
  return clamp(h.cond.fatigue - hours * perHour, 0, 100);
}

export function addFatigue(h: Horse, now: number, amount: number) {
  h.cond.fatigue = clamp(currentFatigue(h, now) + amount, 0, 100);
  h.cond.fatigueTs = now;
}

/** Pulisce stati scaduti (infortuni, impegni, effetti). Ritorna eventi da notificare. */
export function tickCondition(h: Horse, now: number): string[] {
  const out: string[] = [];
  if (h.cond.injury && h.cond.injury.until <= now) {
    out.push(`${h.name} è guarito da: ${h.cond.injury.name}.`);
    h.cond.injury = null;
  }
  if (h.cond.busy && h.cond.busy.until <= now) {
    h.cond.busy = null;
  }
  h.cond.effects = h.cond.effects.filter((e) => e.until > now);
  if (!h.retired && ageYears(h, now) >= RETIRE_AGE) {
    h.retired = true;
    out.push(`${h.name} ha compiuto ${RETIRE_AGE} anni e va in pensione (può ancora riprodursi).`);
  }
  return out;
}

export function canRace(h: Horse, now: number): string | null {
  if (h.dead) return "è morto";
  if (h.retired) return "è in pensione";
  if (ageYears(h, now) < RACING_AGE) return "è ancora un puledro (corre dai 2 anni)";
  if (h.cond.injury && h.cond.injury.until > now) return `è infortunato (${h.cond.injury.name})`;
  if (h.cond.busy && h.cond.busy.until > now) return `è impegnato: ${h.cond.busy.reason}`;
  if (h.cond.pregnant) return "è gravida";
  if (currentFatigue(h, now) > 92) return "è troppo stanco";
  return null;
}

/** Vista pubblica: niente quirk nascosti, statistiche come stime. */
export function publicHorse(h: Horse, now: number, owner: boolean) {
  const age = ageYears(h, now);
  const est = (v: number) => (owner ? Math.round(v) : Math.round(v / 10) * 10);
  return {
    id: h.id,
    name: h.name,
    ownerId: h.ownerId,
    sex: h.sex,
    age: Math.round(age * 10) / 10,
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, est(h.stats[k])])),
    potential: owner ? Object.fromEntries(STAT_KEYS.map((k) => [k, potentialStars(h.potential[k])])) : null,
    apt: owner
      ? { distance: h.apt.distance, going: h.apt.going, surface: h.apt.surface, style: h.apt.style, heightCm: h.apt.heightCm, weightKg: h.apt.weightKg }
      : { heightCm: h.apt.heightCm, weightKg: h.apt.weightKg },
    look: h.look,
    quirks: h.revealed.map((id) => {
      const q = QUIRKS.find((x) => x.id === id);
      return q ? { id: q.id, name: q.name, desc: q.desc, polarity: q.polarity, rarity: q.rarity } : { id, name: id, desc: "", polarity: "±", rarity: 1 };
    }),
    hiddenQuirks: Math.max(0, h.quirks.length - h.revealed.length),
    cond: {
      fatigue: Math.round(currentFatigue(h, now)),
      morale: Math.round(h.cond.morale),
      health: Math.round(h.cond.health),
      injury: h.cond.injury,
      busy: h.cond.busy,
      pregnant: h.cond.pregnant ? { until: h.cond.pregnant.until, sireName: h.cond.pregnant.sireName } : null,
      effects: owner ? h.cond.effects.filter((e) => !e.secret).map((e) => ({ kind: e.kind, until: e.until })) : [],
    },
    rec: h.rec,
    rating: Math.round(h.rating),
    overall: Math.round(overall(h)),
    value: valuation(h, now),
    sireName: h.sireName ?? null,
    damName: h.damName ?? null,
    generation: h.generation,
    jockey: h.jockey,
    retired: !!h.retired,
    dead: h.dead ?? null,
    illness: h.illness ? (owner ? h.illness : { sick: true }) : null,
    insurance: owner ? h.insurance ?? null : null,
    plan: owner ? h.plan ?? null : null,
    trainedAt: owner ? h.trainedAt ?? 0 : 0,
    contracts: owner ? h.contracts ?? [] : [],
    trophies: h.trophies ?? [],
    botStable: h.botStable ?? null,
    bot: !!h.bot,
    canRace: canRace(h, now),
    mind: owner ? mindSummary(h) : null,
  };
}

function potentialStars(v: number): number {
  return Math.round(clamp((v - 20) / 16, 0, 5) * 2) / 2;
}

import { mindSummary } from "./learning";
