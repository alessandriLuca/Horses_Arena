// Allenamento: piano settimanale (un tipo di seduta al giorno) eseguito ogni mattina,
// più una seduta extra "subito" ogni 12 ore. Costa soldi e fatica, può causare infortuni
// se il cavallo è stanco; alcune sedute servono a far passare (o venire) le paure.
import { clamp, type Rng } from "../sim/rng";
import { STAT_KEYS, type Horse, type StatKey, ageYears, trainability, currentFatigue, addFatigue } from "../sim/horse";
import { exposeStimulus, type Stim } from "../sim/learning";

export interface Session {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  fatigue: number; // negativo = riposo
  gains: Partial<Record<StatKey, number>>;
  stims?: Partial<Record<Stim, number>>; // λ dell'esposizione (negativo = desensibilizza)
  morale?: number;
  health?: number;
  risk: number; // rischio base d'infortunio
}

export const SESSIONS: Session[] = [
  { id: "riposo", name: "Riposo", icon: "😴", desc: "Box, fieno e silenzio. Recupera fatica.", cost: 0, fatigue: -28, gains: {}, morale: 2, risk: 0 },
  { id: "pascolo", name: "Pascolo libero", icon: "🌿", desc: "Una giornata al prato: morale alle stelle.", cost: 60, fatigue: -18, gains: { calm: 0.3 }, morale: 9, risk: 0 },
  { id: "galoppo", name: "Galoppo lungo", icon: "🏞️", desc: "Chilometri a ritmo costante: resistenza e recupero.", cost: 160, fatigue: 18, gains: { stamina: 1.2, recovery: 0.6 }, risk: 0.004 },
  { id: "ripetute", name: "Ripetute veloci", icon: "⚡", desc: "Scatti brevi al massimo: velocità e accelerazione.", cost: 220, fatigue: 24, gains: { speed: 1.0, accel: 0.9 }, risk: 0.007 },
  { id: "salite", name: "Salite", icon: "⛰️", desc: "Su e giù per le colline: forza e fiato.", cost: 200, fatigue: 26, gains: { strength: 1.1, stamina: 0.6 }, risk: 0.006 },
  { id: "gabbie", name: "Partenze dalle gabbie", icon: "🚪", desc: "Entrare e uscire dalle gabbie finché diventa normale.", cost: 170, fatigue: 10, gains: { accel: 0.6, focus: 0.4 }, stims: { gabbie: -0.4 }, risk: 0.002 },
  { id: "ostacoli", name: "Scuola di salto", icon: "🪵", desc: "Barriere e siepi: salto e coraggio.", cost: 230, fatigue: 18, gains: { jumping: 1.4, courage: 0.3 }, stims: { ostacoli: -0.35 }, risk: 0.008 },
  { id: "piscina", name: "Piscina", icon: "🏊", desc: "Nuoto: fiato senza martellare le gambe.", cost: 320, fatigue: 8, gains: { stamina: 0.7, recovery: 0.8 }, health: 3, risk: 0.001 },
  { id: "slalom", name: "Slalom tra i paletti", icon: "🚩", desc: "Cambi di direzione: agilità e concentrazione.", cost: 160, fatigue: 14, gains: { agility: 1.2, focus: 0.3 }, stims: { curve: -0.25 }, risk: 0.004 },
  { id: "gruppo", name: "Lavoro in gruppo", icon: "🐎", desc: "Galoppi stretti con altri cavalli: abitua ai contatti.", cost: 260, fatigue: 16, gains: { grit: 0.8, agility: 0.3 }, stims: { gruppo: -0.35, contatto: -0.25 }, risk: 0.006 },
  { id: "rumori", name: "Desensibilizzazione", icon: "📢", desc: "Folla registrata, petardi, flash: niente più spaventi.", cost: 280, fatigue: 5, gains: { calm: 0.6, courage: 0.5 }, stims: { folla: -0.3, botti: -0.3, urla: -0.3, luci: -0.3 }, risk: 0 },
  { id: "frusta", name: "Lavoro col fantino", icon: "🏇", desc: "Intesa col fantino e con la frusta.", cost: 190, fatigue: 9, gains: { focus: 0.5, grit: 0.4 }, stims: { frusta: -0.35 }, risk: 0.002 },
  { id: "fango", name: "Pista allagata", icon: "🌧️", desc: "Galoppi sotto la pioggia e nel fango.", cost: 200, fatigue: 20, gains: { strength: 0.6, stamina: 0.5 }, stims: { pioggia: -0.3, fango: -0.3 }, risk: 0.007 },
  { id: "etologo", name: "Seduta con l'etologo", icon: "🧠", desc: "Lavoro mentale: calma, concentrazione, intelligenza.", cost: 420, fatigue: 3, gains: { calm: 0.7, focus: 0.7, smarts: 0.4, consistency: 0.4 }, risk: 0 },
  { id: "spa", name: "Massaggi e veterinario", icon: "💆", desc: "Fisioterapia, ghiaccio e coccole.", cost: 380, fatigue: -32, gains: {}, health: 12, morale: 4, risk: 0 },
];

export const INTENSITIES = [
  { id: "leggera", name: "Leggera", k: 0.6 },
  { id: "normale", name: "Normale", k: 1 },
  { id: "intensa", name: "Intensa", k: 1.5 },
] as const;

export interface PlanDay {
  s: string; // id seduta
  i: "leggera" | "normale" | "intensa";
}

export interface TrainingPlan {
  days: PlanDay[]; // 7 giorni: lunedì..domenica
  active: boolean;
}

export function defaultPlan(): TrainingPlan {
  const d = (s: string, i: PlanDay["i"] = "normale"): PlanDay => ({ s, i });
  return { active: false, days: [d("galoppo"), d("ripetute"), d("riposo"), d("slalom"), d("gabbie"), d("pascolo"), d("riposo")] };
}

export function sessionById(id: string) {
  return SESSIONS.find((s) => s.id === id);
}

export interface TrainingReport {
  ok: boolean;
  text: string;
  gains: Partial<Record<StatKey, number>>;
  injury: string | null;
  cost: number;
  notes: string[];
}

/** Applica una seduta di allenamento al cavallo (muta il cavallo). Il costo va scalato fuori. */
export function applySession(rng: Rng, h: Horse, sessionId: string, intensity: PlanDay["i"], now: number): TrainingReport {
  const s = sessionById(sessionId);
  if (!s) return { ok: false, text: "seduta sconosciuta", gains: {}, injury: null, cost: 0, notes: [] };
  const k = INTENSITIES.find((x) => x.id === intensity)?.k ?? 1;
  const age = ageYears(h, now);
  const fat = currentFatigue(h, now);
  const fatigueFactor = clamp(1 - fat / 140, 0.3, 1);
  const gains: Partial<Record<StatKey, number>> = {};
  for (const key of Object.keys(s.gains) as StatKey[]) {
    const base = s.gains[key]!;
    const cur = h.stats[key];
    const pot = h.potential[key];
    const room = Math.max(0, (pot - cur) / Math.max(1, pot));
    let g = base * k * trainability(age) * Math.pow(room, 0.6) * (0.7 + h.stats.smarts / 300) * fatigueFactor;
    g *= rng.range(0.7, 1.3);
    const nv = Math.min(pot, cur + g);
    gains[key] = Math.round((nv - cur) * 100) / 100;
    h.stats[key] = Math.round(nv * 100) / 100;
  }
  const notes: string[] = [];
  if (s.stims) {
    for (const [st, lambda] of Object.entries(s.stims) as [Stim, number][]) {
      const note = exposeStimulus(h.mind, st, h.stats.smarts, 0.5 * Math.min(1.3, k), lambda);
      if (note) notes.push(note);
    }
  }
  const fatigueDelta = s.fatigue > 0 ? s.fatigue * k : s.fatigue * (k === 0.6 ? 0.8 : k === 1.5 ? 1.2 : 1);
  addFatigue(h, now, fatigueDelta);
  if (s.morale) h.cond.morale = clamp(h.cond.morale + s.morale, 0, 100);
  if (s.fatigue > 15 && k > 1) h.cond.morale = clamp(h.cond.morale - 2, 0, 100);
  if (s.health) h.cond.health = clamp(h.cond.health + s.health * k, 0, 100);
  let injury: string | null = null;
  const risk = s.risk * k * k * (1 + Math.pow(fat / 40, 2)) * (age > 9 ? 1.5 : 1);
  if (rng.chance(risk)) {
    injury = rng.pick(["stiramento", "piccola tendinite", "contusione", "zoccolo infiammato", "mal di schiena"]);
    const days = rng.range(0.5, 2);
    h.cond.injury = { name: injury, until: now + days * 86400000 };
    h.cond.health = clamp(h.cond.health - 15, 0, 100);
  }
  const gainTxt = Object.entries(gains)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([key, v]) => `${key} +${v}`)
    .join(", ");
  return {
    ok: true,
    text: `${s.icon} ${s.name} (${intensity})${gainTxt ? ": " + gainTxt : ""}${injury ? ` — infortunio: ${injury}!` : ""}`,
    gains,
    injury,
    cost: Math.round(s.cost * k),
    notes,
  };
}

export function sessionCost(sessionId: string, intensity: PlanDay["i"]): number {
  const s = sessionById(sessionId);
  const k = INTENSITIES.find((x) => x.id === intensity)?.k ?? 1;
  return s ? Math.round(s.cost * k) : 0;
}

export function validatePlan(p: any): TrainingPlan | null {
  if (!p || !Array.isArray(p.days) || p.days.length !== 7) return null;
  const days: PlanDay[] = [];
  for (const d of p.days) {
    if (!d || !sessionById(d.s)) return null;
    const i = INTENSITIES.find((x) => x.id === d.i)?.id ?? "normale";
    days.push({ s: d.s, i });
  }
  return { days, active: !!p.active };
}

export { STAT_KEYS };
