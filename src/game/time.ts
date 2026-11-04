// Orari del gioco: tutto il calendario segue l'ora italiana (Europe/Rome), con l'ora legale.
export const TZ = "Europe/Rome";
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY_MS = 86_400_000;

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

export interface RomeParts {
  y: number;
  m: number; // 1..12
  d: number;
  h: number;
  min: number;
  wd: number; // 0 = lunedì .. 6 = domenica
}

const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function romeParts(ts: number): RomeParts {
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ts))) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    min: Number(parts.minute),
    wd: WD[parts.weekday] ?? 0,
  };
}

/** Timestamp UTC di una data/ora "da orologio" italiana. */
export function romeTime(y: number, m: number, d: number, h: number, min: number): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  // l'offset di Roma è +1 o +2: correggo con due iterazioni
  let ts = guess - HOUR;
  for (let i = 0; i < 2; i++) {
    const p = romeParts(ts);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    ts += guess - asUtc;
  }
  return ts;
}

/** Inizio (mezzanotte italiana) del giorno di `ts`. */
export function romeDayStart(ts: number): number {
  const p = romeParts(ts);
  return romeTime(p.y, p.m, p.d, 0, 0);
}

/** Prossimo istante (≥ ts) alle hh:mm italiane. */
export function nextRomeClock(ts: number, h: number, min: number): number {
  const p = romeParts(ts);
  let t = romeTime(p.y, p.m, p.d, h, min);
  if (t < ts) {
    const q = romeParts(ts + DAY_MS);
    t = romeTime(q.y, q.m, q.d, h, min);
  }
  return t;
}

/** Chiave del giorno (es. "2026-11-04"). */
export function dayKey(ts: number): string {
  const p = romeParts(ts);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
