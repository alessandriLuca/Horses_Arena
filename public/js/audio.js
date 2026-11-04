// Suoni sintetizzati al volo con Web Audio: niente file da scaricare.
import { settings } from "./settings.js";

let ctx = null;
let master = null;
let crowd = null;
let hooves = null;

export function audioCtx() {
  if (!settings.sound) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function noiseBuffer(c, seconds = 2, brown = false) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return b;
}

export function startAmbience() {
  const c = audioCtx();
  if (!c || crowd) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 3, true);
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 600;
  bp.Q.value = 0.6;
  const g = c.createGain();
  g.gain.value = 0.05;
  src.connect(bp).connect(g).connect(master);
  src.start();
  crowd = { src, g, bp };
  // zoccoli: rumore filtrato a impulsi
  const hs = c.createBufferSource();
  hs.buffer = noiseBuffer(c, 1);
  hs.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 380;
  const hg = c.createGain();
  hg.gain.value = 0;
  const lfo = c.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 7;
  const lfoG = c.createGain();
  lfoG.gain.value = 0;
  lfo.connect(lfoG).connect(hg.gain);
  hs.connect(lp).connect(hg).connect(master);
  hs.start();
  lfo.start();
  hooves = { hs, hg, lfo, lfoG };
}

/** excitement 0..1, hoof 0..1 (velocità*vicinanza) */
export function setAmbience(excitement, hoof) {
  if (!crowd || !ctx) return;
  const t = ctx.currentTime;
  crowd.g.gain.setTargetAtTime(0.04 + excitement * 0.32, t, 0.4);
  crowd.bp.frequency.setTargetAtTime(500 + excitement * 600, t, 0.5);
  hooves.lfoG.gain.setTargetAtTime(hoof * 0.25, t, 0.2);
  hooves.lfo.frequency.setTargetAtTime(4 + hoof * 8, t, 0.3);
}

export function stopAmbience() {
  try {
    crowd?.src.stop();
    hooves?.hs.stop();
    hooves?.lfo.stop();
  } catch {
    /* già fermi */
  }
  crowd = hooves = null;
}

export function bell() {
  const c = audioCtx();
  if (!c) return;
  for (let k = 0; k < 3; k++) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = 1320;
    g.gain.setValueAtTime(0.0001, c.currentTime + k * 0.18);
    g.gain.exponentialRampToValueAtTime(0.4, c.currentTime + k * 0.18 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + k * 0.18 + 0.16);
    o.connect(g).connect(master);
    o.start(c.currentTime + k * 0.18);
    o.stop(c.currentTime + k * 0.18 + 0.2);
  }
}

export function bang() {
  const c = audioCtx();
  if (!c) return;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c, 0.6);
  const g = c.createGain();
  g.gain.setValueAtTime(1, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1500;
  s.connect(lp).connect(g).connect(master);
  s.start();
}

export function neigh() {
  const c = audioCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  const t = c.currentTime;
  o.frequency.setValueAtTime(900, t);
  for (let i = 0; i < 8; i++) o.frequency.linearRampToValueAtTime(i % 2 ? 700 : 1000 - i * 50, t + 0.07 * (i + 1));
  o.frequency.linearRampToValueAtTime(300, t + 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.15, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1200;
  o.connect(bp).connect(g).connect(master);
  o.start(t);
  o.stop(t + 1);
}

export function cheer() {
  const c = audioCtx();
  if (!c || !crowd) return;
  crowd.g.gain.setTargetAtTime(0.5, c.currentTime, 0.1);
  crowd.g.gain.setTargetAtTime(0.12, c.currentTime + 2.5, 1.2);
}

export function click() {
  const c = audioCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = 660;
  g.gain.setValueAtTime(0.08, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + 0.09);
}

export function coin() {
  const c = audioCtx();
  if (!c) return;
  for (const [f, d] of [[988, 0], [1319, 0.08]]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.06, c.currentTime + d);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d + 0.25);
    o.connect(g).connect(master);
    o.start(c.currentTime + d);
    o.stop(c.currentTime + d + 0.3);
  }
}
