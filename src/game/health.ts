// Salute: malattie, clinica veterinaria, cure sperimentali, sperimentazioni a pagamento, assicurazioni.
import { clamp, type Rng } from "../sim/rng";
import { STAT_KEYS, type Horse, type StatKey } from "../sim/horse";
import { QUIRKS } from "../sim/quirks";

export interface Disease {
  id: string;
  name: string;
  symptom: string; // ciò che vede il proprietario prima della diagnosi
  severity: number; // 1..5
  contagious: number; // probabilità di contagio giornaliera verso i compagni di scuderia
  perf: number; // moltiplicatore di prestazione mentre è malato (si traduce in salute)
  days: [number, number]; // durata naturale (giorni) se curata bene
  lethal: number; // probabilità giornaliera di morte se NON curata dopo i primi giorni
  chronic?: StatKey; // se trascurata lascia un danno permanente a questa statistica
}

export const DISEASES: Disease[] = [
  { id: "raffreddore", name: "Raffreddore equino", symptom: "starnutisce e ha il naso che cola", severity: 1, contagious: 0.15, perf: 0.97, days: [1, 2], lethal: 0 },
  { id: "influenza", name: "Influenza equina", symptom: "tossisce e ha la febbre", severity: 2, contagious: 0.25, perf: 0.92, days: [2, 3], lethal: 0.002, chronic: "stamina" },
  { id: "tosse", name: "Tosse da fieno", symptom: "tossisce quando corre", severity: 1, contagious: 0, perf: 0.96, days: [1, 3], lethal: 0, chronic: "stamina" },
  { id: "colica", name: "Colica", symptom: "si rotola nel box e non mangia", severity: 4, contagious: 0, perf: 0.7, days: [1, 2], lethal: 0.08 },
  { id: "laminite", name: "Laminite", symptom: "zoppica e sposta il peso sugli zoccoli posteriori", severity: 4, contagious: 0, perf: 0.8, days: [3, 5], lethal: 0.02, chronic: "speed" },
  { id: "piroplasmosi", name: "Piroplasmosi", symptom: "è stanchissimo e ha le mucose gialle", severity: 3, contagious: 0.05, perf: 0.85, days: [2, 4], lethal: 0.02, chronic: "recovery" },
  { id: "gastrite", name: "Ulcera gastrica", symptom: "è nervoso e mangia poco", severity: 2, contagious: 0, perf: 0.93, days: [2, 3], lethal: 0, chronic: "calm" },
  { id: "tendinite", name: "Tendinite cronica", symptom: "ha un tendine gonfio e caldo", severity: 3, contagious: 0, perf: 0.85, days: [3, 6], lethal: 0, chronic: "agility" },
  { id: "dermatite", name: "Dermatite da fango", symptom: "ha croste sui garretti", severity: 1, contagious: 0.08, perf: 0.99, days: [1, 2], lethal: 0 },
  { id: "rinite", name: "Rinopolmonite", symptom: "respira a fatica e ha la febbre alta", severity: 3, contagious: 0.3, perf: 0.85, days: [2, 4], lethal: 0.015, chronic: "stamina" },
  { id: "nilo", name: "Febbre del Nilo occidentale", symptom: "barcolla e trema", severity: 5, contagious: 0, perf: 0.6, days: [3, 5], lethal: 0.06, chronic: "focus" },
  { id: "esaurimento", name: "Esaurimento nervoso", symptom: "si spaventa di tutto e non dorme", severity: 2, contagious: 0, perf: 0.94, days: [2, 4], lethal: 0, chronic: "courage" },
  { id: "malinconia", name: "Depressione da box", symptom: "sta con la testa bassa e non nitrisce più", severity: 2, contagious: 0, perf: 0.95, days: [1, 3], lethal: 0, chronic: "grit" },
  { id: "parassiti", name: "Parassiti intestinali", symptom: "dimagrisce anche se mangia", severity: 2, contagious: 0.12, perf: 0.95, days: [1, 2], lethal: 0, chronic: "strength" },
  { id: "strangles", name: "Adenite (stranguglione)", symptom: "ha linfonodi gonfi sotto la mascella", severity: 3, contagious: 0.35, perf: 0.88, days: [2, 4], lethal: 0.01 },
];

export function diseaseById(id: string) {
  return DISEASES.find((d) => d.id === id);
}

export interface Illness {
  id: string;
  since: number;
  diagnosed: boolean;
  treatment: string | null; // id della cura in corso
  until: number | null; // guarigione prevista (se curato)
  untreatedDays: number;
}

export const TREATMENTS = [
  { id: "riposo_cure", name: "Riposo in scuderia con farmaci", cost: 400, speed: 1, success: 0.9, hospital: false, desc: "Cure base dal veterinario di fiducia." },
  { id: "clinica", name: "Ricovero in clinica", cost: 1800, speed: 1.8, success: 0.97, hospital: true, desc: "Ricovero con assistenza 24 ore su 24. Più veloce e sicuro." },
  { id: "intensiva", name: "Terapia intensiva", cost: 5000, speed: 2.6, success: 0.995, hospital: true, desc: "Il meglio della medicina veterinaria. Carissimo." },
  { id: "sperimentale", name: "Cura sperimentale", cost: 900, speed: 3, success: 0.75, hospital: true, desc: "Un farmaco nuovo dell'università: miracoloso o disastroso. Può lasciare effetti strani." },
  { id: "omeopatia", name: "Rimedi della nonna", cost: 80, speed: 0.6, success: 0.6, hospital: false, desc: "Camomilla, cataplasmi e preghiere. Economico." },
] as const;

export const DIAGNOSIS_COST = 250;

/** Sperimentazioni a pagamento in laboratorio. */
export interface Trial {
  id: string;
  name: string;
  desc: string;
  pay: [number, number];
  days: number;
  risks: { illness?: number; quirk?: number; statUp?: number; statDown?: number; death?: number };
  focus?: StatKey[];
}

export const TRIALS: Trial[] = [
  { id: "vitamine", name: "Vitamine di nuova generazione", desc: "Un integratore vitaminico. Di solito innocuo.", pay: [800, 1400], days: 0.5, risks: { statUp: 0.25, illness: 0.03 }, focus: ["recovery", "stamina"] },
  { id: "antinfiammatorio", name: "Antinfiammatorio sperimentale", desc: "Un farmaco contro i dolori articolari.", pay: [1500, 2500], days: 1, risks: { statUp: 0.2, statDown: 0.1, illness: 0.05 }, focus: ["agility"] },
  { id: "dna", name: "Terapia genica", desc: "Ritocchi al DNA. La scienza del futuro, o un mostro.", pay: [5000, 9000], days: 2, risks: { statUp: 0.35, statDown: 0.25, quirk: 0.35, death: 0.02 }, focus: ["speed", "stamina", "strength"] },
  { id: "nootropo", name: "Farmaco per la memoria", desc: "Dovrebbe rendere i cavalli più intelligenti.", pay: [2500, 4200], days: 1, risks: { statUp: 0.35, quirk: 0.15, illness: 0.04 }, focus: ["smarts", "focus"] },
  { id: "ansiolitico", name: "Ansiolitico a rilascio lento", desc: "Studio sulla paura nei cavalli da corsa.", pay: [1800, 3000], days: 1, risks: { statUp: 0.4, statDown: 0.1, quirk: 0.1 }, focus: ["calm", "courage"] },
  { id: "ferro_bionico", name: "Zoccoli bionici", desc: "Una resina che rinforza gli zoccoli. Prototipo.", pay: [2200, 3600], days: 1, risks: { statUp: 0.3, statDown: 0.15, illness: 0.06 }, focus: ["speed", "agility"] },
  { id: "camera_iperbarica", name: "Camera iperbarica", desc: "Ossigeno ad alta pressione. Recupero record?", pay: [1200, 2000], days: 0.5, risks: { statUp: 0.3 }, focus: ["recovery"] },
  { id: "vaccino", name: "Vaccino sperimentale", desc: "Un nuovo vaccino contro l'influenza equina.", pay: [1000, 1800], days: 1, risks: { illness: 0.12, statDown: 0.05 } },
  { id: "dieta_spaziale", name: "Dieta per astronauti", desc: "Pastiglie liofilizzate dell'agenzia spaziale.", pay: [3000, 5000], days: 1.5, risks: { statUp: 0.25, statDown: 0.2, quirk: 0.12, illness: 0.08 }, focus: ["stamina", "strength"] },
  { id: "elettrostimolazione", name: "Elettrostimolazione muscolare", desc: "Scosse ai muscoli mentre dorme.", pay: [2000, 3400], days: 1, risks: { statUp: 0.35, statDown: 0.1, quirk: 0.08 }, focus: ["accel", "strength"] },
  { id: "ipnosi", name: "Ipnosi equina", desc: "Un mago ipnotizzatore giura di poter cambiare la mente dei cavalli.", pay: [1500, 2600], days: 0.5, risks: { quirk: 0.4, statUp: 0.15 }, focus: ["focus", "calm"] },
  { id: "siero_misterioso", name: "Il siero misterioso", desc: "Un laboratorio senza insegna. Pagano tantissimo. Nessuno sa cosa c'è dentro.", pay: [9000, 15000], days: 2, risks: { statUp: 0.4, statDown: 0.4, quirk: 0.5, illness: 0.2, death: 0.06 }, focus: ["speed", "stamina", "grit"] },
];

export function trialById(id: string) {
  return TRIALS.find((t) => t.id === id);
}

/** Polizze assicurative. Il premio si paga ogni giorno, in percentuale del valore assicurato. */
export const POLICIES = [
  { id: "nessuna", name: "Nessuna", daily: 0, vet: 0, death: 0 },
  { id: "base", name: "Polizza Base", daily: 0.003, vet: 0.5, death: 0 },
  { id: "completa", name: "Polizza Completa", daily: 0.008, vet: 0.8, death: 1 },
] as const;
export type PolicyId = (typeof POLICIES)[number]["id"];
export const DEATH_WAITING_MS = 24 * 3600 * 1000; // carenza: la copertura morte vale dopo 24 ore

export interface Insurance {
  policy: PolicyId;
  value: number; // valore assicurato
  since: number;
}

/** Tira una possibile malattia giornaliera (fatica e salute bassa la rendono più probabile). */
export function rollIllness(rng: Rng, h: Horse, fatigue: number, exposure: number): Disease | null {
  if ((h as any).illness) return null;
  const p = 0.025 + (fatigue / 100) * 0.05 + ((100 - h.cond.health) / 100) * 0.05 + exposure;
  if (!rng.chance(p)) return null;
  return rng.weighted(DISEASES, (d) => (6 - d.severity) * (d.contagious > 0 ? 1.2 : 1));
}

/** Effetti di una sperimentazione. Ritorna frasi da notificare. */
export function applyTrial(rng: Rng, h: Horse, t: Trial): { notes: string[]; died: boolean; illness: Disease | null } {
  const notes: string[] = [];
  const keys = t.focus && t.focus.length ? t.focus : (STAT_KEYS as readonly StatKey[]).slice();
  if (t.risks.statUp && rng.chance(t.risks.statUp)) {
    const k = rng.pick(keys);
    const g = rng.range(2, 6);
    h.potential[k] = clamp(Math.round(h.potential[k] + g * 0.6), 10, 100);
    h.stats[k] = clamp(Math.round((h.stats[k] + g) * 10) / 10, 0, h.potential[k]);
    notes.push(`effetto positivo: ${k} +${g.toFixed(1)}`);
  }
  if (t.risks.statDown && rng.chance(t.risks.statDown)) {
    const k = rng.pick(STAT_KEYS as readonly StatKey[]);
    const g = rng.range(2, 7);
    h.stats[k] = clamp(Math.round((h.stats[k] - g) * 10) / 10, 5, 100);
    h.potential[k] = clamp(Math.round(h.potential[k] - g * 0.5), 10, 100);
    notes.push(`effetto collaterale: ${k} −${g.toFixed(1)}`);
  }
  if (t.risks.quirk && rng.chance(t.risks.quirk) && h.quirks.length < 5) {
    const q = rng.pick(QUIRKS);
    if (!h.quirks.includes(q.id)) {
      h.quirks.push(q.id);
      notes.push("si comporta in modo strano... potrebbe aver sviluppato un nuovo tratto nascosto");
    }
  }
  let illness: Disease | null = null;
  if (t.risks.illness && rng.chance(t.risks.illness)) {
    illness = rng.pick(DISEASES);
  }
  const died = !!t.risks.death && rng.chance(t.risks.death);
  return { notes, died, illness };
}

export function illnessPerf(h: Horse): number {
  const ill = (h as any).illness as Illness | undefined;
  if (!ill) return 1;
  const d = diseaseById(ill.id);
  return d ? d.perf : 1;
}
