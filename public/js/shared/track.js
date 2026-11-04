// Geometria delle piste: condivisa tra server (simulazione) e client (3D).
// Una pista è un ovale: due rettilinei lunghi L e due curve semicircolari di raggio R.
// Coordinata s = metri lungo la corda (lo steccato interno), crescente nel verso di corsa.
// Coordinata d = metri di distanza dalla corda verso l'esterno (0 = attaccato allo steccato).
// Il rettilineo d'arrivo è davanti alle tribune (z positivo) e si corre verso +x.

/** @typedef {{id:string,name:string,city:string,L:number,R:number,width:number,surface:'erba'|'sabbia'|'terra'|'neve',theme:string,crowd:number,finishBack:number}} Venue */

/** @type {Venue[]} */
export const VENUES = [
  { id: "vesuvio", name: "Ippodromo del Vesuvio", city: "Napoli", L: 420, R: 95, width: 24, surface: "erba", theme: "vulcano", crowd: 1.0, finishBack: 60 },
  { id: "dogi", name: "Prato dei Dogi", city: "Venezia", L: 380, R: 110, width: 22, surface: "erba", theme: "laguna", crowd: 0.8, finishBack: 50 },
  { id: "dolomiti", name: "Arena delle Dolomiti", city: "Cortina", L: 340, R: 85, width: 20, surface: "neve", theme: "montagna", crowd: 0.6, finishBack: 45 },
  { id: "tavoliere", name: "Piana del Tavoliere", city: "Foggia", L: 460, R: 100, width: 26, surface: "terra", theme: "campagna", crowd: 0.7, finishBack: 70 },
  { id: "lanterna", name: "Ippodromo della Lanterna", city: "Genova", L: 360, R: 90, width: 22, surface: "erba", theme: "mare", crowd: 0.9, finishBack: 55 },
  { id: "saline", name: "Circuito delle Saline", city: "Trapani", L: 400, R: 105, width: 24, surface: "sabbia", theme: "saline", crowd: 0.65, finishBack: 60 },
];

export function venueById(id) {
  return VENUES.find((v) => v.id === id) || VENUES[0];
}

export function lapLength(v) {
  return 2 * v.L + 2 * Math.PI * v.R;
}

/** Posizione s (sulla corda) del traguardo. */
export function finishS(v) {
  return v.L - v.finishBack;
}

export function mod(a, n) {
  return ((a % n) + n) % n;
}

/**
 * Punto 3D (piano x,z) per coordinate pista.
 * @returns {{x:number,z:number,hx:number,hz:number,curve:boolean,seg:number}} hx,hz = direzione di corsa
 */
export function trackPoint(v, s, d) {
  const L = v.L, R = v.R;
  const lap = lapLength(v);
  s = mod(s, lap);
  const r = R + d;
  if (s < L) {
    return { x: -L / 2 + s, z: r, hx: 1, hz: 0, curve: false, seg: 0 };
  }
  s -= L;
  if (s < Math.PI * R) {
    const t = s / R;
    return { x: L / 2 + r * Math.sin(t), z: r * Math.cos(t), hx: Math.cos(t), hz: -Math.sin(t), curve: true, seg: 1 };
  }
  s -= Math.PI * R;
  if (s < L) {
    return { x: L / 2 - s, z: -r, hx: -1, hz: 0, curve: false, seg: 2 };
  }
  s -= L;
  const t = s / R;
  return { x: -L / 2 - r * Math.sin(t), z: -r * Math.cos(t), hx: -Math.cos(t), hz: Math.sin(t), curve: true, seg: 3 };
}

/** È in curva la coordinata s? */
export function isCurve(v, s) {
  const L = v.L, R = v.R;
  s = mod(s, lapLength(v));
  return (s >= L && s < L + Math.PI * R) || s >= 2 * L + Math.PI * R;
}

/** Metri alla prossima curva (0 se già in curva). */
export function distToNextCurve(v, s) {
  const L = v.L, R = v.R;
  const lap = lapLength(v);
  s = mod(s, lap);
  if (isCurve(v, s)) return 0;
  if (s < L) return L - s;
  return 2 * L + Math.PI * R - s;
}

/**
 * Fattore di avanzamento: quanti metri di corda si guadagnano per metro percorso a distanza d.
 * In curva chi corre largo fa più strada.
 */
export function railFactor(v, s, d) {
  return isCurve(v, s) ? v.R / (v.R + d) : 1;
}

/** Coordinata s di partenza per una corsa di `distance` metri. */
export function startS(v, distance) {
  return mod(finishS(v) - distance, lapLength(v));
}

/** Posizioni (in metri di gara percorsi) delle siepi per le corse a ostacoli: evita le curve. */
export function hurdlePositions(v, distance) {
  const out = [];
  const s0 = startS(v, distance);
  const spacing = 230;
  for (let p = 180; p < distance - 120; p += spacing) {
    // sposta l'ostacolo fuori dalla curva
    let q = p;
    for (let k = 0; k < 40 && isCurve(v, s0 + q); k++) q += 10;
    if (q < distance - 100 && (out.length === 0 || q - out[out.length - 1] > 120)) out.push(Math.round(q));
  }
  return out;
}

export const GOINGS = [
  { id: "secco", name: "secco", speed: 1.02, cost: 0.97, slip: 0.9 },
  { id: "buono", name: "buono", speed: 1.0, cost: 1.0, slip: 1.0 },
  { id: "morbido", name: "morbido", speed: 0.97, cost: 1.06, slip: 1.15 },
  { id: "pesante", name: "pesante", speed: 0.93, cost: 1.14, slip: 1.35 },
];

export const WEATHERS = [
  { id: "sole", name: "sole", rain: 0, wind: 0.3 },
  { id: "nuvoloso", name: "nuvoloso", rain: 0, wind: 0.5 },
  { id: "vento", name: "vento forte", rain: 0, wind: 1.0 },
  { id: "pioggia", name: "pioggia", rain: 0.6, wind: 0.5 },
  { id: "temporale", name: "temporale", rain: 1.0, wind: 0.9 },
  { id: "nebbia", name: "nebbia", rain: 0.1, wind: 0.1 },
  { id: "neve", name: "neve", rain: 0.4, wind: 0.4 },
];
