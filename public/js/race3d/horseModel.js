// Cavallo procedurale in 3D: corpo, collo, testa, criniera, coda, 4 zampe articolate, fantino.
// Ogni cavallo ha mantello, macchie, segni bianchi e proporzioni proprie (dal campo `look`).
import * as THREE from "three";
import { toon, addOutlines } from "./toon.js";

const texCache = new Map();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k)));
  return "#" + c.getHexString();
}

/** Texture del mantello (UV di una sfera: u = giro, v = dall'alto in basso). */
function coatTexture(look) {
  const key = JSON.stringify([look.body, look.pattern, look.patternSeed, look.patchColor, look.points]);
  if (texCache.has(key)) return texCache.get(key);
  const W = 256, H = 128;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  const r = rng(look.patternSeed);
  // base con leggera sfumatura (dorso più scuro, pancia più chiara)
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, shade(look.body, 0.82));
  grad.addColorStop(0.5, look.body);
  grad.addColorStop(1, shade(look.body, 1.12));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // pelo: rumore sottile
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + r() * 0.04})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1);
  }
  if (look.pattern === "dapple") {
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = H * 0.15 + r() * H * 0.6, rad = 4 + r() * 7;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, "rgba(235,235,235,0.75)");
      rg.addColorStop(1, "rgba(235,235,235,0)");
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, rad, 0, 7);
      g.fill();
    }
  } else if (look.pattern === "pinto") {
    g.fillStyle = look.patchColor;
    for (let i = 0; i < 5; i++) {
      const x = r() * W, y = H * 0.3 + r() * H * 0.6;
      g.beginPath();
      for (let a = 0; a < 6.3; a += 0.4) {
        const rad = 18 + r() * 26;
        g.lineTo(x + Math.cos(a) * rad * 1.4, y + Math.sin(a) * rad);
      }
      g.fill();
    }
  } else if (look.pattern === "spots") {
    g.fillStyle = look.patchColor;
    for (let i = 0; i < 160; i++) {
      const y = r() * H;
      g.beginPath();
      g.ellipse(r() * W, y, 2 + r() * 3.5, 1.5 + r() * 3, r() * 3, 0, 7);
      g.fill();
    }
  } else if (look.pattern === "roan") {
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = "rgba(240,240,240,0.35)";
      g.fillRect(r() * W, H * 0.12 + r() * H * 0.75, 1, 1);
    }
  } else if (look.pattern === "dorsal") {
    g.fillStyle = look.points;
    g.fillRect(0, 0, W, 6);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  texCache.set(key, tex);
  return tex;
}

function silksTexture(silks, num) {
  const key = JSON.stringify([silks, num]);
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext("2d");
  g.fillStyle = silks.primary;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = silks.secondary;
  switch (silks.pattern) {
    case "strisce": for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 14, 128); break;
    case "bande": for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 14); break;
    case "stella": star(g, 64, 64, 34); star(g, 0, 64, 22); star(g, 128, 64, 22); break;
    case "croce": g.fillRect(52, 0, 24, 128); g.fillRect(0, 52, 128, 24); break;
    case "pois": for (let x = 12; x < 128; x += 30) for (let y = 12; y < 128; y += 30) { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); } break;
    case "diagonale": g.save(); g.translate(64, 64); g.rotate(0.7); g.fillRect(-100, -14, 200, 28); g.restore(); break;
    case "quarti": g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); break;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
  function star(g, x, y, R) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? R * 0.45 : R;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
  }
}

function numberTexture(num, silks) {
  const key = "num" + num + silks.primary;
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 96;
  const g = cv.getContext("2d");
  g.fillStyle = "#f7f7f2";
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = silks.primary;
  g.fillRect(0, 0, 128, 10);
  g.fillRect(0, 86, 128, 10);
  g.fillStyle = "#111";
  g.font = "bold 62px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(num), 64, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

const geo = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLow: new THREE.SphereGeometry(1, 12, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
};
// cilindro con base all'origine e che si estende verso il basso (per le zampe)
function legSeg(rTop, rBot, len) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, 9, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

/**
 * Crea un cavallo. Asse del cavallo: +X = muso, +Y = alto, Z = fianchi.
 * Ritorna { root, update(dt, speed, state) }.
 */
export function createHorse(look, silks, num, opts = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // si muove su e giù col galoppo
  root.add(body);
  const lowDetail = !!opts.low;
  const sph = lowDetail ? geo.sphereLow : geo.sphere;

  const coat = toon({ map: coatTexture(look) });
  const plain = toon({ color: look.body });
  const pts = toon({ color: look.points });
  const maneM = toon({ color: look.mane });
  const white = toon({ color: "#fbfaf5" });
  const hoofM = toon({ color: "#3a302a" });
  const dark = new THREE.MeshStandardMaterial({ color: "#0b0b0b", roughness: 0.3 });

  const build = 0.92 + look.build * 0.16; // larghezza
  const L = look.legs;
  const legLen = 0.62 * L;
  const withers = 0.62 + legLen * 2 + 0.05; // altezza del dorso
  const bodyY = withers - 0.32;

  // --- tronco: tre ellissoidi (petto, ventre, groppa)
  const barrel = new THREE.Mesh(sph, coat);
  barrel.scale.set(0.78, 0.36, 0.31 * build);
  barrel.position.set(0, bodyY, 0);
  body.add(barrel);
  const chest = new THREE.Mesh(sph, coat);
  chest.scale.set(0.4, 0.37, 0.3 * build);
  chest.position.set(0.5, bodyY + 0.04, 0);
  body.add(chest);
  const rump = new THREE.Mesh(sph, coat);
  rump.scale.set(0.45, 0.38, 0.32 * build);
  rump.position.set(-0.52, bodyY + 0.05, 0);
  body.add(rump);

  // --- collo e testa
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0.72, bodyY + 0.12, 0);
  body.add(neckPivot);
  const neckLen = 0.78 * look.neck;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.27, neckLen, 12, 1), coat);
  neck.position.set(0, neckLen / 2, 0);
  const neckG = new THREE.Group();
  neckG.rotation.z = -0.78; // inclinato in avanti
  neckG.add(neck);
  neckPivot.add(neckG);
  // criniera
  const maneLen = look.maneStyle === "lunga" ? 0.24 : look.maneStyle === "ribelle" ? 0.2 : look.maneStyle === "intrecciata" ? 0.08 : 0.12;
  const nMane = lowDetail ? 4 : 8;
  for (let i = 0; i < nMane; i++) {
    const m = new THREE.Mesh(geo.box, maneM);
    const t = i / (nMane - 1);
    m.scale.set(0.09, maneLen * (look.maneStyle === "intrecciata" ? 1 : 0.8 + Math.sin(i * 1.7) * 0.25), 0.05);
    m.position.set(-0.13 + t * 0.03, neckLen * (0.08 + t * 0.85), 0);
    m.rotation.z = 0.5;
    if (look.maneStyle === "ribelle") m.rotation.x = Math.sin(i * 2.3) * 0.5;
    neckG.add(m);
  }
  const headPivot = new THREE.Group();
  headPivot.position.set(0, neckLen, 0);
  neckG.add(headPivot);
  const headG = new THREE.Group();
  headG.rotation.z = -1.25; // la testa punta in basso-avanti
  headPivot.add(headG);
  const hs = look.head;
  const skull = new THREE.Mesh(sph, coat);
  skull.scale.set(0.15 * hs, 0.17 * hs, 0.14 * hs);
  skull.position.set(0, 0.06, 0);
  headG.add(skull);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * hs, 0.13 * hs, 0.46 * hs, 10), coat);
  muzzle.position.set(0, 0.3 * hs, 0);
  headG.add(muzzle);
  const nose = new THREE.Mesh(sph, look.face === "muso_bianco" ? white : pts.color.getHex() === plain.color.getHex() ? plain : new THREE.MeshStandardMaterial({ color: shade(look.body, 0.6) }));
  nose.scale.set(0.09 * hs, 0.08 * hs, 0.085 * hs);
  nose.position.set(0, 0.53 * hs, 0);
  headG.add(nose);
  // segni bianchi sulla faccia
  if (look.face !== "none") {
    const w = look.face === "stella" ? 0.05 : look.face === "lista" ? 0.03 : 0.07;
    const len = look.face === "stella" ? 0.06 : 0.42;
    const mark = new THREE.Mesh(geo.box, white);
    mark.scale.set(len, w * 1.6, 0.02);
    mark.position.set(0, (look.face === "stella" ? 0.08 : 0.28) * hs, 0);
    mark.rotation.z = Math.PI / 2;
    // lo appiccico sulla fronte (lato +X locale della testa = davanti)
    const holder = new THREE.Group();
    holder.add(mark);
    mark.position.x = 0.13 * hs;
    mark.rotation.set(0, Math.PI / 2, Math.PI / 2);
    mark.scale.set(w * 1.8, len, 0.02);
    holder.position.set(0, (look.face === "stella" ? 0.06 : 0.25) * hs, 0);
    headG.add(holder);
  }
  // occhi e orecchie
  for (const sz of [-1, 1]) {
    const eye = new THREE.Mesh(geo.sphereLow, look.eyes === "azzurri" ? new THREE.MeshStandardMaterial({ color: "#7fb4d8", roughness: 0.2 }) : dark);
    eye.scale.setScalar(0.036 * hs);
    eye.userData.noOutline = true;
    const shine = new THREE.Mesh(geo.sphereLow, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.scale.setScalar(0.35);
    shine.position.set(0.5, 0.45, sz * 0.55);
    eye.add(shine);
    eye.position.set(0.07 * hs, 0.08 * hs, sz * 0.12 * hs);
    headG.add(eye);
    const ear = new THREE.Mesh(geo.cone, coat);
    ear.scale.set(0.04, 0.13, 0.03);
    ear.position.set(-0.07, -0.06, sz * 0.07);
    ear.rotation.z = Math.PI;
    ear.rotation.x = sz * 0.25;
    headG.add(ear);
  }
  // ciuffo
  const forelock = new THREE.Mesh(geo.box, maneM);
  forelock.scale.set(0.05, 0.1, 0.07);
  forelock.position.set(0.05, -0.02, 0);
  headG.add(forelock);

  // --- coda
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.92, bodyY + 0.2, 0);
  body.add(tailPivot);
  const tailSegs = [];
  let parent = tailPivot;
  const nT = lowDetail ? 3 : 5;
  for (let i = 0; i < nT; i++) {
    const seg = new THREE.Group();
    const len = 0.16;
    const m = new THREE.Mesh(legSeg(0.07 - i * 0.008, 0.06 - i * 0.008, len), maneM);
    seg.add(m);
    seg.rotation.z = i === 0 ? -2.3 : 0.12;
    if (i > 0) seg.position.y = -0.16;
    parent.add(seg);
    tailSegs.push(seg);
    parent = seg;
  }
  const tuft = new THREE.Mesh(geo.cone, maneM);
  tuft.scale.set(0.08, 0.32, 0.08);
  tuft.position.y = -0.3;
  tuft.rotation.z = Math.PI;
  parent.add(tuft);

  // --- zampe
  const legs = [];
  const legDefs = [
    { x: 0.56, z: 0.17, front: true, off: 0.55, sock: look.socks[0] }, // anteriore sinistra
    { x: 0.56, z: -0.17, front: true, off: 0.67, sock: look.socks[1] }, // anteriore destra
    { x: -0.55, z: 0.17, front: false, off: 0.0, sock: look.socks[2] }, // posteriore sinistra
    { x: -0.55, z: -0.17, front: false, off: 0.12, sock: look.socks[3] }, // posteriore destra
  ];
  for (const ld of legDefs) {
    const hip = new THREE.Group();
    hip.position.set(ld.x, bodyY - 0.12, ld.z * build);
    body.add(hip);
    const upper = new THREE.Mesh(legSeg(ld.front ? 0.11 : 0.15, 0.065, legLen), coat);
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -legLen;
    hip.add(knee);
    const lowerMat = ld.sock >= 2 ? white : look.points !== look.body ? pts : plain;
    const lower = new THREE.Mesh(legSeg(0.05, 0.045, legLen * 0.95), lowerMat);
    knee.add(lower);
    if (ld.sock === 3) {
      const st = new THREE.Mesh(legSeg(0.066, 0.06, legLen * 0.35), white);
      st.position.y = -0.0;
      hip.add(st);
      st.position.y = -legLen * 0.65;
    }
    const fetlock = new THREE.Group();
    fetlock.position.y = -legLen * 0.95;
    knee.add(fetlock);
    const pastern = new THREE.Mesh(legSeg(0.05, 0.055, 0.1), ld.sock >= 1 ? white : lowerMat);
    fetlock.add(pastern);
    const hoof = new THREE.Mesh(geo.cyl, hoofM);
    hoof.scale.set(0.065, 0.07, 0.065);
    hoof.position.y = -0.13;
    fetlock.add(hoof);
    legs.push({ ...ld, hip, knee, fetlock });
  }

  // --- sella, numero e fantino
  const jockey = new THREE.Group();
  const silkM = toon({ map: silksTexture(silks, num) });
  const capM = toon({ color: silks.cap });
  const skin = toon({ color: "#ffd9bd" });
  const breeches = toon({ color: "#ffffff" });
  const boots = toon({ color: "#222033" });
  const cloth = new THREE.Mesh(geo.box, toon({ map: numberTexture(num, silks) }));
  cloth.scale.set(0.5, 0.32, 0.02);
  for (const sz of [-1, 1]) {
    const c = cloth.clone();
    c.position.set(0.02, bodyY + 0.12, sz * (0.315 * build));
    if (sz < 0) c.rotation.y = Math.PI;
    body.add(c);
  }
  const saddle = new THREE.Mesh(sph, toon({ color: "#5a3420" }));
  saddle.scale.set(0.24, 0.06, 0.24 * build);
  saddle.position.set(0.12, bodyY + 0.35, 0);
  body.add(saddle);
  jockey.position.set(0.18, bodyY + 0.45, 0);
  body.add(jockey);
  const torso = new THREE.Mesh(sph, silkM);
  torso.scale.set(0.27, 0.13, 0.15);
  torso.position.set(0.08, 0.2, 0);
  torso.rotation.z = -0.25;
  jockey.add(torso);
  const head = new THREE.Mesh(geo.sphereLow, skin);
  head.scale.setScalar(0.09);
  head.position.set(0.38, 0.32, 0);
  jockey.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), capM);
  helmet.scale.setScalar(0.1);
  helmet.position.set(0.38, 0.34, 0);
  helmet.rotation.z = -0.3;
  jockey.add(helmet);
  const visor = new THREE.Mesh(geo.box, capM);
  visor.scale.set(0.08, 0.012, 0.12);
  visor.position.set(0.47, 0.33, 0);
  jockey.add(visor);
  const arms = [];
  for (const sz of [-1, 1]) {
    const thigh = new THREE.Mesh(legSeg(0.05, 0.045, 0.3), breeches);
    thigh.position.set(0.05, 0.08, sz * 0.13);
    thigh.rotation.z = 1.9;
    jockey.add(thigh);
    const shin = new THREE.Mesh(legSeg(0.04, 0.035, 0.3), boots);
    shin.position.set(0.32, -0.02, sz * 0.15);
    shin.rotation.z = -0.6;
    jockey.add(shin);
    const arm = new THREE.Group();
    arm.position.set(0.25, 0.24, sz * 0.13);
    const am = new THREE.Mesh(legSeg(0.035, 0.03, 0.3), silkM);
    arm.add(am);
    arm.rotation.z = 1.0;
    jockey.add(arm);
    arms.push(arm);
  }
  const whip = new THREE.Mesh(legSeg(0.008, 0.005, 0.5), dark);
  whip.position.y = -0.3;
  arms[1].add(whip);
  // redini
  const reinM = new THREE.LineBasicMaterial({ color: "#2b1a10" });
  const reinGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const rein = new THREE.Line(reinGeo, reinM);
  if (!lowDetail) body.add(rein);

  // ombra finta sotto il cavallo (economica, sempre visibile)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(1.3, 0.45, 1);
  blob.position.y = 0.02;
  root.add(blob);

  blob.userData.noOutline = true;
  addOutlines(root, lowDetail ? 0.022 : 0.018, lowDetail ? 0.12 : 0.06);
  root.traverse((o) => {
    if (o.isMesh && o !== blob && !o.userData.isOutline) {
      o.castShadow = !lowDetail;
      o.receiveShadow = false;
    }
  });
  const scale = (look.legs ? 1 : 1) * (0.94 + ((opts.heightCm ?? 163) - 150) / 280);
  root.scale.setScalar(scale);

  let phase = Math.random();
  let fallT = 0;
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

  /**
   * state: { speed (m/s), status (codice), jump (0..1 arco del salto), whip (bool), riderless, t }
   */
  function update(dt, st) {
    const v = Math.max(0, st.speed);
    const moving = v > 0.4 && st.status !== 3;
    const stride = v > 9 ? 6.4 : v > 4 ? 3.6 : 1.8;
    const freq = moving ? Math.min(2.7, v / stride) : 0;
    phase = (phase + freq * dt) % 1;
    const gallop = Math.min(1, v / 12);
    const amp = moving ? 0.25 + 0.45 * gallop : 0;
    const TAU = Math.PI * 2;

    // zampe
    for (const lg of legs) {
      const a = TAU * (phase + lg.off);
      const swing = Math.sin(a) * amp * (lg.front ? 1 : 0.9);
      lg.hip.rotation.z = swing + (st.jump > 0 ? (lg.front ? 0.9 : -0.8) * Math.sin(st.jump * Math.PI) : 0);
      const fold = Math.max(0, Math.sin(a + Math.PI / 2)) * amp * 1.6;
      lg.knee.rotation.z = lg.front ? -fold - (st.jump > 0 ? 1.4 * Math.sin(st.jump * Math.PI) : 0) : fold * 0.8 + (st.jump > 0 ? 1.2 * Math.sin(st.jump * Math.PI) : 0);
      lg.fetlock.rotation.z = lg.front ? fold * 0.4 : -fold * 0.3;
    }
    // corpo: oscillazione verticale e beccheggio
    const bob = moving ? Math.abs(Math.sin(TAU * phase)) * 0.07 * gallop : 0;
    body.position.y = bob + (st.jump > 0 ? Math.sin(st.jump * Math.PI) * 0.95 : 0);
    let pitch = moving ? Math.sin(TAU * phase + 1) * 0.045 * gallop : 0;
    if (st.jump > 0) pitch += Math.cos(st.jump * Math.PI) * 0.25;
    if (st.status === 4) pitch = 0.7; // impennata
    body.rotation.z += (pitch - body.rotation.z) * Math.min(1, dt * 12);
    neckPivot.rotation.z = moving ? Math.sin(TAU * phase + 2.2) * 0.1 * gallop - 0.12 * gallop : Math.sin(st.t * 0.8) * 0.05;
    headPivot.rotation.z = moving ? Math.sin(TAU * phase + 2.6) * 0.08 : 0;
    // coda
    tailSegs.forEach((s, i) => {
      s.rotation.x = Math.sin(st.t * 3 + i) * 0.08;
      if (i === 0) s.rotation.z = -2.3 + gallop * 0.9;
    });
    // fantino
    jockey.visible = !st.riderless && st.status !== 3;
    if (jockey.visible) {
      jockey.position.y = bodyY + 0.45 - bob * 0.6 + Math.sin(TAU * phase) * 0.02;
      arms[0].rotation.z = 1.0 + Math.sin(TAU * phase) * 0.15 * gallop;
      arms[1].rotation.z = st.whip ? 1.0 + Math.sin(st.t * 14) * 0.9 : 1.0 + Math.sin(TAU * phase) * 0.15 * gallop;
    }
    // redini: dalle mani alla bocca
    if (!lowDetail && jockey.visible) {
      arms[0].getWorldPosition(tmpA);
      muzzle.getWorldPosition(tmpB);
      body.worldToLocal(tmpA);
      body.worldToLocal(tmpB);
      const p = rein.geometry.attributes.position;
      p.setXYZ(0, tmpA.x, tmpA.y, 0);
      p.setXYZ(1, tmpB.x, tmpB.y, 0);
      p.needsUpdate = true;
      rein.visible = true;
    } else rein.visible = false;
    // caduta
    if (st.status === 3) {
      fallT = Math.min(1, fallT + dt * 2.5);
    } else fallT = Math.max(0, fallT - dt * 1.5);
    root.rotation.x = fallT * 1.35;
    body.position.y -= fallT * 0.55;
    blob.material.opacity = 0.28 * (1 - Math.min(1, body.position.y / 1.5));
  }

  return { root, update, jockey };
}

/** Piccolo fantino a terra (quando cade). */
export function createFallenJockey(silks) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo.sphere, new THREE.MeshStandardMaterial({ color: silks.primary }));
  m.scale.set(0.3, 0.12, 0.18);
  m.position.y = 0.12;
  g.add(m);
  const h = new THREE.Mesh(geo.sphereLow, new THREE.MeshStandardMaterial({ color: silks.cap }));
  h.scale.setScalar(0.11);
  h.position.set(0.32, 0.12, 0);
  g.add(h);
  return g;
}
