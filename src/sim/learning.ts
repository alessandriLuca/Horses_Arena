// Apprendimento dei cavalli (machine learning classico, niente IA generativa).
//
// 1) Condizionamento associativo (modello di Rescorla-Wagner): per ogni stimolo il cavallo
//    tiene un valore V in [-1, 1]. V > 0 = paura/avversione, V < 0 = fiducia/piacere.
//    Dopo ogni esperienza: ΔV = α·β·(λ − V), con α = velocità di apprendimento (Intelligenza),
//    β = salienza dello stimolo (quanto è stato esposto), λ = esito (danno = +1, successo < 0, niente = 0).
//    Se uno stimolo torna senza conseguenze la paura si estingue (abituazione).
// 2) Tattica di corsa: bandito contestuale (Q-learning a un passo con politica softmax).
//    Il contesto è la distanza + tipo di corsa; le "braccia" sono 6 stili di corsa.
// 3) Regolazione del ritmo: un parametro continuo per contesto (quando lanciare lo sprint)
//    corretto dopo ogni corsa in base a come è finita l'energia (ricompensa a segno).
// 4) Rancori/rivalità verso singoli cavalli (stesso modello associativo, chiave = id del rivale).
import { clamp, type Rng } from "./rng";

export const STIMULI = [
  "folla", "gabbie", "contatto", "gruppo", "frusta", "urla", "pioggia", "fango",
  "ostacoli", "curve", "botti", "luci", "testa", "coda",
] as const;
export type Stim = (typeof STIMULI)[number];
/** Indice numerico di ogni stimolo (per gli array tipizzati della simulazione). */
export const SI = Object.fromEntries(STIMULI.map((s, i) => [s, i])) as Record<Stim, number>;
export const NSTIM = STIMULI.length;

export const STIM_LABEL: Record<Stim, string> = {
  folla: "la folla in tribuna",
  gabbie: "le gabbie di partenza",
  contatto: "i contatti con gli altri cavalli",
  gruppo: "correre in mezzo al gruppo",
  frusta: "la frusta del fantino",
  urla: "i nitriti e le urla",
  pioggia: "la pioggia",
  fango: "il terreno pesante",
  ostacoli: "gli ostacoli",
  curve: "le curve",
  botti: "botti e rumori forti",
  luci: "luci e lampi",
  testa: "stare in testa",
  coda: "stare in fondo al gruppo",
};

export const STRATEGIES = [
  { id: "fuga", name: "Fuga in testa", early: 1.065, mid: 1.0, kick: 300, kickEffort: 1.05, rail: 0.8, patience: 0.2, affinity: 0 },
  { id: "tallone", name: "Tallonatore", early: 1.03, mid: 1.0, kick: 450, kickEffort: 1.08, rail: 0.7, patience: 0.45, affinity: 0.25 },
  { id: "centro", name: "Centro gruppo", early: 1.005, mid: 0.995, kick: 520, kickEffort: 1.09, rail: 0.55, patience: 0.6, affinity: 0.5 },
  { id: "rimonta", name: "Rimonta lunga", early: 0.975, mid: 0.985, kick: 700, kickEffort: 1.08, rail: 0.4, patience: 0.7, affinity: 0.75 },
  { id: "attesa", name: "Attesa e scatto", early: 0.965, mid: 0.98, kick: 380, kickEffort: 1.14, rail: 0.5, patience: 0.85, affinity: 1 },
  { id: "corda", name: "Risparmio alla corda", early: 0.995, mid: 0.99, kick: 450, kickEffort: 1.1, rail: 1.0, patience: 0.9, affinity: 0.55 },
] as const;

export const CONTEXTS = ["Velocità (≤1400m)", "Miglio (≤2000m)", "Media (≤2600m)", "Fondo (>2600m)", "Siepi brevi", "Siepi lunghe"];

export function contextIndex(distance: number, hurdles: boolean): number {
  if (hurdles) return distance <= 2400 ? 4 : 5;
  if (distance <= 1400) return 0;
  if (distance <= 2000) return 1;
  if (distance <= 2600) return 2;
  return 3;
}

export interface Mind {
  v: Record<Stim, number>;
  grudge: Record<string, { v: number; name: string }>;
  q: number[][];
  n: number[][];
  kick: number[]; // aggiustamento metri sul punto di sprint, per contesto
  races: number;
  log: string[]; // ultime cose imparate (per l'interfaccia)
}

export function newMind(style: number): Mind {
  const v = Object.fromEntries(STIMULI.map((s) => [s, 0])) as Record<Stim, number>;
  // un po' di diffidenza innata verso gabbie e botti
  v.gabbie = 0.1;
  v.botti = 0.15;
  const q = CONTEXTS.map(() => STRATEGIES.map((st) => 0.45 + 0.12 * (1 - Math.abs(st.affinity - style) * 1.6)));
  const n = CONTEXTS.map(() => STRATEGIES.map(() => 0));
  return { v, grudge: {}, q, n, kick: CONTEXTS.map(() => 0), races: 0, log: [] };
}

/** Scelta della tattica: softmax sui valori Q, più l'intelligenza è alta più sfrutta quel che sa. */
export function chooseStrategy(m: Mind, ctx: number, smarts: number, rng: Rng): number {
  const tau = 0.22 - 0.16 * (smarts / 100);
  const qs = m.q[ctx];
  const mx = Math.max(...qs);
  const w = qs.map((q) => Math.exp((q - mx) / tau));
  const tot = w.reduce((a, b) => a + b, 0);
  let r = rng.next() * tot;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

export function learningRate(smarts: number): number {
  return 0.08 + 0.27 * (smarts / 100);
}

/** Un singolo aggiornamento di Rescorla-Wagner. Ritorna la variazione. */
export function rwUpdate(m: Mind, s: Stim, alpha: number, beta: number, lambda: number): number {
  const before = m.v[s];
  const after = clamp(before + alpha * beta * (lambda - before), -1, 1);
  m.v[s] = after;
  return after - before;
}

/** Esperienza di un cavallo durante una corsa (raccolta dalla simulazione). */
export interface Experience {
  exposure: Partial<Record<Stim, number>>; // secondi·intensità
  harm: Partial<Record<Stim, number>>; // 0..1: danni avvenuti mentre lo stimolo era presente
  grudges: Record<string, { harm: number; name: string; duel: number }>;
  ctx: number;
  strategy: number;
  position: number; // 1 = primo, 0 = non arrivato
  field: number;
  energyAtFinish: number; // frazione di riserva anaerobica rimasta (0..1)
  exhaustedAt: number; // metri dalla fine in cui ha finito l'energia (0 = mai)
  fell: boolean;
}

export function emptyExperience(ctx: number, strategy: number): Experience {
  return { exposure: {}, harm: {}, grudges: {}, ctx, strategy, position: 0, field: 1, energyAtFinish: 0, exhaustedAt: 0, fell: false };
}

/** Prestazione normalizzata 0..1 (1 = vittoria). */
export function performance(e: Experience): number {
  if (e.position <= 0) return 0;
  if (e.field <= 1) return 1;
  return 1 - (e.position - 1) / (e.field - 1);
}

/**
 * Apprendimento a fine corsa. Ritorna frasi in italiano su cosa ha imparato
 * (solo cambiamenti significativi).
 */
export function learnFromRace(m: Mind, e: Experience, smarts: number): string[] {
  const alpha = learningRate(smarts);
  const perf = performance(e);
  const goodness = 0.65 * perf * perf + (e.position === 1 ? 0.15 : 0);
  const notes: string[] = [];

  for (const s of STIMULI) {
    const ex = e.exposure[s] ?? 0;
    if (ex <= 0.05) continue;
    const beta = clamp(ex / 8, 0.05, 1);
    const harm = clamp(e.harm[s] ?? 0, 0, 1);
    // danno => paura; altrimenti l'esito della corsa colora l'esperienza
    const lambda = harm > 0 ? clamp(harm + (1 - harm) * (0.2 - goodness), -1, 1) : clamp(0.08 - goodness, -1, 1);
    const before = m.v[s];
    rwUpdate(m, s, alpha, beta, lambda);
    const after = m.v[s];
    if (before < 0.35 && after >= 0.35) notes.push(`ha cominciato ad avere paura ${STIM_OF[s]}`);
    else if (before >= 0.35 && after < 0.2) notes.push(`non ha più paura ${STIM_OF[s]}`);
    else if (before > -0.3 && after <= -0.3) notes.push(`ha preso fiducia con ${STIM_LABEL[s]}`);
  }

  // rancori e rivalità
  for (const [id, g] of Object.entries(e.grudges)) {
    const cur = m.grudge[id]?.v ?? 0;
    const lambda = g.harm > 0 ? clamp(g.harm, 0, 1) : g.duel > 0 ? -0.7 * (perf > 0.5 ? 1 : 0.4) : 0;
    const beta = clamp(g.harm + g.duel / 6, 0.1, 1);
    const nv = clamp(cur + alpha * beta * (lambda - cur), -1, 1);
    if (Math.abs(nv) < 0.04) {
      delete m.grudge[id];
      continue;
    }
    if (cur < 0.4 && nv >= 0.4) notes.push(`ora teme ${g.name}`);
    if (cur > -0.4 && nv <= -0.4) notes.push(`ha una rivalità accesa con ${g.name}`);
    m.grudge[id] = { v: nv, name: g.name };
  }
  // tieni solo i 10 rancori più forti
  const entries = Object.entries(m.grudge).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v));
  m.grudge = Object.fromEntries(entries.slice(0, 10));

  // tattica: aggiornamento del valore dell'azione scelta
  if (e.strategy >= 0) {
    const reward = clamp(perf + (e.position === 1 ? 0.2 : 0) - (e.fell ? 0.3 : 0), 0, 1.2);
    const lr = 0.12 + 0.22 * (smarts / 100);
    const q = m.q[e.ctx];
    const old = q[e.strategy];
    q[e.strategy] = old + lr * (reward - old);
    m.n[e.ctx][e.strategy]++;
    const best = q.indexOf(Math.max(...q));
    if (best === e.strategy && m.n[e.ctx][e.strategy] === 3) notes.push(`sta imparando a correre in modalità "${STRATEGIES[best].name}" (${CONTEXTS[e.ctx]})`);
  }

  // regolazione del ritmo: se è rimasto senza energia troppo presto, la prossima volta parte più tardi
  if (e.position > 0 || e.exhaustedAt > 0) {
    const lr = 0.25 + 0.5 * (smarts / 100);
    let delta = 0;
    if (e.exhaustedAt > 60) delta = -Math.min(160, e.exhaustedAt * 0.6) * lr; // parti più tardi
    else if (e.energyAtFinish > 0.15) delta = Math.min(150, e.energyAtFinish * 500) * lr; // potevi partire prima
    m.kick[e.ctx] = clamp(m.kick[e.ctx] + delta, -350, 350);
    if (Math.abs(delta) > 40) notes.push(delta < 0 ? "ha capito che deve dosare meglio le energie" : "ha capito che può lanciare lo sprint prima");
  }

  m.races++;
  if (notes.length) {
    m.log.unshift(...notes);
    m.log = m.log.slice(0, 12);
  }
  return notes;
}

const STIM_OF: Record<Stim, string> = {
  folla: "della folla in tribuna",
  gabbie: "delle gabbie di partenza",
  contatto: "dei contatti con gli altri cavalli",
  gruppo: "di correre in mezzo al gruppo",
  frusta: "della frusta del fantino",
  urla: "dei nitriti e delle urla",
  pioggia: "della pioggia",
  fango: "del terreno pesante",
  ostacoli: "degli ostacoli",
  curve: "delle curve",
  botti: "dei botti e dei rumori forti",
  luci: "di luci e lampi",
  testa: "di stare in testa",
  coda: "di stare in fondo al gruppo",
};

/** Esposizione controllata (allenamento di desensibilizzazione, ingaggi, sabotaggi notturni). */
export function exposeStimulus(m: Mind, s: Stim, smarts: number, beta: number, lambda: number): string | null {
  const before = m.v[s];
  rwUpdate(m, s, learningRate(smarts), beta, lambda);
  const after = m.v[s];
  let note: string | null = null;
  if (before < 0.35 && after >= 0.35) note = `ha cominciato ad avere paura ${STIM_OF[s]}`;
  else if (before >= 0.35 && after < 0.2) note = `non ha più paura ${STIM_OF[s]}`;
  else if (before > -0.3 && after <= -0.3) note = `ha preso fiducia con ${STIM_LABEL[s]}`;
  if (note) {
    m.log.unshift(note);
    m.log = m.log.slice(0, 12);
  }
  return note;
}

/** Riassunto leggibile della mente del cavallo (per il proprietario). */
export function mindSummary(h: { mind: Mind }) {
  const m = h.mind;
  const fears = STIMULI.map((s) => ({ id: s, label: STIM_LABEL[s], v: Math.round(m.v[s] * 100) / 100 }));
  const prefs = CONTEXTS.map((c, i) => {
    const q = m.q[i];
    const best = q.indexOf(Math.max(...q));
    const tried = m.n[i].reduce((a, b) => a + b, 0);
    return { context: c, strategy: STRATEGIES[best].name, confidence: Math.round(q[best] * 100) / 100, tried, kick: Math.round(m.kick[i]) };
  });
  const grudges = Object.entries(m.grudge).map(([id, g]) => ({ id, name: g.name, v: Math.round(g.v * 100) / 100 }));
  return { fears, prefs, grudges, races: m.races, log: m.log };
}
