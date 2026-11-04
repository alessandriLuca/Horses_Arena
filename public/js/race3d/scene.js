// La scena 3D della corsa: ippodromo, pubblico, meteo, cavalli, regia televisiva automatica.
import * as THREE from "three";
import { venueById, trackPoint, lapLength, finishS, isCurve } from "../shared/track.js";
import { createHorse, createFallenJockey } from "./horseModel.js";
import { toon, addOutlines } from "./toon.js";

const SURFACE = {
  erba: { a: "#86d45e", b: "#9ae06d" },
  terra: { a: "#c9875a", b: "#d39466" },
  sabbia: { a: "#f2dca4", b: "#f7e5b5" },
  neve: { a: "#eef5fb", b: "#ffffff" },
};
const THEME = {
  vulcano: { sky: ["#2f8ff0", "#c7ecff"], ground: "#5dbb4f", far: "#8e86c9" },
  laguna: { sky: ["#3a9cf2", "#ffe6f2"], ground: "#62c25a", far: "#9fb4e8" },
  montagna: { sky: ["#3b97ee", "#e2f4ff"], ground: "#f4f9ff", far: "#8fa8e6" },
  campagna: { sky: ["#2e94f0", "#fff1c9"], ground: "#a8cf55", far: "#86b06a" },
  mare: { sky: ["#2a8cec", "#d8f3ff"], ground: "#5fbf50", far: "#93aee6" },
  saline: { sky: ["#3aa0f4", "#ffe9f4"], ground: "#e7dcc0", far: "#c9c3ea" },
};

export class RaceScene {
  constructor(container, replay, opts = {}) {
    this.container = container;
    this.rep = replay;
    this.venue = venueById(replay.venue);
    this.opts = opts;
    this.mobile = matchMedia("(max-width: 700px)").matches || navigator.maxTouchPoints > 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.3, 4000);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camTarget = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.mode = "tv";
    this.follow = -1;
    this.shot = { kind: "gate", until: 0, focus: -1 };
    this.time = 0;
    this.buildWorld();
    this.buildHorses();
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 450;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  tp(s, d, y = 0) {
    const p = trackPoint(this.venue, s, d);
    return new THREE.Vector3(p.x, y, p.z);
  }

  // ------------------------------------------------------------------ mondo
  buildWorld() {
    const v = this.venue;
    const th = THEME[v.theme] ?? THEME.campagna;
    const weather = this.rep.weather;
    const grey = weather === "pioggia" || weather === "temporale" || weather === "nebbia" || weather === "neve";
    // cielo
    const skyTop = new THREE.Color(grey ? "#6f86a8" : th.sky[0]);
    const skyBot = new THREE.Color(grey ? "#cdd7e6" : th.sky[1]);
    const skyGeo = new THREE.SphereGeometry(2500, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: skyTop }, bot: { value: skyBot } },
      vertexShader: "varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 bot; varying vec3 vp; void main(){ float h = clamp(normalize(vp).y*1.6+0.1,0.0,1.0); gl_FragColor = vec4(mix(bot, top, h),1.0); }",
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    const fogDens = weather === "nebbia" ? 0.005 : weather === "neve" ? 0.0024 : weather === "temporale" || weather === "pioggia" ? 0.0015 : 0.00045;
    this.scene.fog = new THREE.FogExp2(skyBot.getHex(), fogDens);

    // luci
    const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, grey ? 1.5 : 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6ea, grey ? 1.4 : 2.2);
    sun.position.set(120, 180, 90);
    sun.castShadow = true;
    const sz = this.mobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 10; sc.far = 500;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // terreno
    const groundTex = noiseTexture(th.ground, 0.05);
    groundTex.repeat.set(60, 60);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), toon({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // pista (nastro lungo tutto l'ovale)
    const lap = lapLength(v);
    const surf = SURFACE[v.surface] ?? SURFACE.erba;
    const pos = [], uv = [], idx = [];
    const step = 2;
    const n = Math.ceil(lap / step);
    for (let i = 0; i <= n; i++) {
      const s = i * step;
      const a = trackPoint(v, s, -0.6), b = trackPoint(v, s, v.width + 0.6);
      pos.push(a.x, 0.01, a.z, b.x, 0.01, b.z);
      uv.push(s / 8, 0, s / 8, 1);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const trackTex = stripeTexture(surf.a, surf.b, v.surface);
    const track = new THREE.Mesh(tg, toon({ map: trackTex }));
    track.receiveShadow = true;
    this.scene.add(track);

    // steccati
    const railMat = toon({ color: 0xffffff });
    for (const d of [-0.5, v.width + 0.5]) {
      const pts = [];
      for (let s = 0; s <= lap; s += 4) pts.push(this.tp(s, d, 1.05));
      const curve = new THREE.CatmullRomCurve3(pts, true);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.ceil(lap / 3), 0.07, 6, true), railMat);
      tube.castShadow = true;
      this.scene.add(tube);
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), railMat, Math.ceil(lap / 6));
      const m = new THREE.Matrix4();
      let k = 0;
      for (let s = 0; s < lap; s += 6) {
        const p = this.tp(s, d, 0.52);
        m.makeTranslation(p.x, p.y, p.z);
        posts.setMatrixAt(k++, m);
      }
      posts.count = k;
      this.scene.add(posts);
    }

    // traguardo
    const fs = finishS(v);
    const lineGeo = new THREE.PlaneGeometry(0.5, v.width + 1.2);
    const line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const fp = this.tp(fs, v.width / 2, 0.03);
    line.position.copy(fp);
    line.rotation.x = -Math.PI / 2;
    this.scene.add(line);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 10), postMat);
    pole.position.copy(this.tp(fs, -1.2, 3));
    this.scene.add(pole);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xd62828 }));
    disc.rotation.x = Math.PI / 2;
    disc.position.copy(this.tp(fs, -1.2, 6));
    this.scene.add(disc);
    // traguardo: portale con scritta
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, v.width + 3), new THREE.MeshStandardMaterial({ map: textTexture("ARRIVO", "#d62828", "#ffffff"), roughness: 0.6 }));
    banner.position.copy(this.tp(fs, v.width / 2, 8));
    this.scene.add(banner);
    for (const d of [-1.8, v.width + 1.8]) {
      const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8.5, 8), postMat);
      pp.position.copy(this.tp(fs, d, 4.2));
      this.scene.add(pp);
    }
    // paletti dei metri
    const start = this.rep.startS;
    for (let m = 200; m < this.rep.distance; m += 200) {
      const s = start + this.rep.distance - m;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6), new THREE.MeshStandardMaterial({ color: m % 1000 === 0 ? 0xd62828 : m === 400 || m === 200 ? 0x1f6feb : 0xffffff }));
      p.position.copy(this.tp(s, -1.4, 1.2));
      this.scene.add(p);
    }
    // gabbie di partenza
    const gate = new THREE.Group();
    const gMat = toon({ color: 0x35b0e8 });
    const nG = Math.max(8, this.rep.horses.length);
    for (let i = 0; i <= nG; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.5, 0.12), gMat);
      bar.position.set(0, 1.25, 0.24 + i * 1.12);
      gate.add(bar);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.4, nG * 1.12 + 0.6), gMat);
    top.position.set(0, 2.6, (nG * 1.12) / 2 + 0.24);
    gate.add(top);
    const gp = trackPoint(v, start, 0);
    gate.position.set(gp.x, 0, gp.z);
    gate.rotation.y = Math.atan2(-gp.hz, gp.hx);
    // la gabbia si sposta verso l'esterno: in locale z = d. Uso una matrice manuale
    gate.children.forEach((c) => {
      const local = c.position.clone();
      const w = trackPoint(v, start - 1.2, local.z);
      c.position.set(0, local.y, 0);
      c.userData.w = w;
    });
    this.gate = this.placeGate(start);
    this.scene.add(this.gate);

    // siepi
    this.hurdleMeshes = [];
    for (const hp of this.rep.hurdles) {
      const s = start + hp;
      const g = new THREE.Group();
      const brush = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, v.width), new THREE.MeshStandardMaterial({ color: 0x35592c, roughness: 1 }));
      brush.position.y = 0.52;
      brush.castShadow = true;
      g.add(brush);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, v.width + 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      frame.position.y = 0.12;
      g.add(frame);
      const p = trackPoint(v, s, v.width / 2);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = Math.atan2(-p.hz, p.hx);
      this.scene.add(g);
    }

    this.buildStands();
    this.buildScenery(th);
    this.buildClouds(grey);
    this.buildWeather(weather);
  }

  placeGate(s) {
    const v = this.venue;
    const g = new THREE.Group();
    const gMat = toon({ color: 0x35b0e8 });
    const nG = Math.max(8, this.rep.horses.length);
    const p = trackPoint(v, s - 0.6, 0);
    const ang = Math.atan2(-p.hz, p.hx);
    for (let i = 0; i <= nG; i++) {
      const d = 0.24 + i * 1.12;
      const q = trackPoint(v, s - 0.6, d);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.1), gMat);
      bar.position.set(q.x, 1.2, q.z);
      bar.rotation.y = ang;
      g.add(bar);
    }
    const q0 = trackPoint(v, s - 0.6, 0.24 + (nG * 1.12) / 2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, nG * 1.12 + 0.4), gMat);
    top.position.set(q0.x, 2.55, q0.z);
    top.rotation.y = ang;
    g.add(top);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.4, nG * 1.12 + 0.2), new THREE.MeshStandardMaterial({ map: textTexture("HORSES ARENA", "#ff5fa2", "#ffffff"), roughness: 0.6 }));
    sign.position.set(q0.x, 2.55, q0.z);
    sign.rotation.y = ang;
    sign.scale.set(1.01, 1, 1);
    g.add(sign);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    addOutlines(g, 0.04, 0.2);
    return g;
  }

  buildStands() {
    const v = this.venue;
    const fs = finishS(v);
    const standLen = Math.min(220, v.L * 0.6);
    const g = new THREE.Group();
    const concrete = toon({ color: 0xf4f1ff });
    const roofM = toon({ color: 0xff5fa2 });
    const baseZ = v.R + v.width + 6;
    const cx = trackPoint(v, fs - standLen * 0.35, 0).x;
    const tiers = 8;
    for (let t = 0; t < tiers; t++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(standLen, 0.8, 2.2), concrete);
      step.position.set(cx, 0.4 + t * 0.8, baseZ + t * 2.2);
      step.receiveShadow = true;
      g.add(step);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(standLen, 9, 1), concrete);
    back.position.set(cx, 4.5, baseZ + tiers * 2.2 + 0.4);
    g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(standLen + 4, 0.5, tiers * 2.2 + 5), roofM);
    roof.position.set(cx, 11, baseZ + tiers * 1.1);
    roof.rotation.x = -0.06;
    roof.castShadow = true;
    g.add(roof);
    for (let x = -standLen / 2; x <= standLen / 2; x += 20) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 11, 8), concrete);
      col.position.set(cx + x, 5.5, baseZ - 0.5);
      g.add(col);
    }
    // pubblico: tante persone instanziate che saltellano
    const crowdN = Math.round((this.mobile ? 700 : 1600) * (0.35 + 0.65 * v.crowd));
    const personGeo = new THREE.BoxGeometry(0.45, 0.9, 0.35);
    const mat = toon({});
    const crowd = new THREE.InstancedMesh(personGeo, mat, crowdN);
    const pal = ["#d62828", "#f77f00", "#fcbf49", "#2a9d8f", "#264653", "#e76f51", "#8338ec", "#3a86ff", "#ffffff", "#222222", "#ff70a6", "#06d6a0"];
    const col = new THREE.Color();
    this.crowdBase = [];
    const m = new THREE.Matrix4();
    for (let i = 0; i < crowdN; i++) {
      const t = Math.floor(Math.random() * tiers);
      const x = cx + (Math.random() - 0.5) * (standLen - 4);
      const y = 0.8 + t * 0.8 + 0.45;
      const z = baseZ + t * 2.2 + (Math.random() - 0.5) * 1.2;
      this.crowdBase.push([x, y, z, Math.random() * 6.28]);
      m.makeTranslation(x, y, z);
      crowd.setMatrixAt(i, m);
      crowd.setColorAt(i, col.set(pal[i % pal.length]));
    }
    this.crowd = crowd;
    g.add(crowd);
    // tabellone
    const board = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x111111 }));
    board.position.set(cx + standLen / 2 + 14, 9, baseZ + 4);
    g.add(board);
    this.boardCanvas = document.createElement("canvas");
    this.boardCanvas.width = 512;
    this.boardCanvas.height = 224;
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 6.4), new THREE.MeshBasicMaterial({ map: this.boardTex }));
    screen.position.set(cx + standLen / 2 + 14, 9, baseZ + 3.68);
    screen.rotation.y = Math.PI;
    g.add(screen);
    // bandiere
    for (let x = -standLen / 2; x <= standLen / 2; x += 30) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), concrete);
      pole.position.set(cx + x, 13.5, baseZ + 2);
      g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshStandardMaterial({ color: pal[(x / 30 + 20) % pal.length | 0], side: THREE.DoubleSide }));
      flag.position.set(cx + x + 1, 15.3, baseZ + 2);
      g.add(flag);
    }
    this.scene.add(g);
  }

  buildScenery(th) {
    const v = this.venue;
    const far = toon({ color: th.far });
    const g = new THREE.Group();
    const R = Math.max(v.L, v.R * 2) + 420;
    if (v.theme === "vulcano") {
      const c = new THREE.Mesh(new THREE.ConeGeometry(420, 360, 40, 1, true), far);
      c.position.set(-300, 170, -R - 400);
      g.add(c);
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(70, 10, 8), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, transparent: true, opacity: 0.6 }));
      smoke.position.set(-300, 380, -R - 400);
      g.add(smoke);
    }
    if (v.theme === "montagna" || v.theme === "vulcano" || v.theme === "campagna") {
      for (let i = 0; i < 14; i++) {
        const h = 120 + Math.random() * 260;
        const c = new THREE.Mesh(new THREE.ConeGeometry(160 + Math.random() * 200, h, 36), far);
        const a = (i / 14) * Math.PI * 2;
        c.position.set(Math.cos(a) * (R + 500), h / 2 - 5, Math.sin(a) * (R + 500));
        g.add(c);
        if (v.theme === "montagna") {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(60, h * 0.28, 36), toon({ color: 0xffffff }));
          cap.position.set(c.position.x, h - h * 0.14 - 5, c.position.z);
          cap.scale.setScalar((160 + 100) / 160 * 0.9);
          g.add(cap);
        }
      }
    }
    if (v.theme === "laguna" || v.theme === "mare" || v.theme === "saline") {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 1400), new THREE.MeshStandardMaterial({ color: v.theme === "saline" ? 0xa8d4e6 : 0x2f6f9f, roughness: 0.15, metalness: 0.3 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.02, -R - 700);
      g.add(water);
    }
    if (v.theme === "mare") {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 70, 12), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
      tower.position.set(300, 35, -R - 60);
      g.add(tower);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 10, 12), new THREE.MeshStandardMaterial({ color: 0xd62828, emissive: 0x551111 }));
      lamp.position.set(300, 75, -R - 60);
      g.add(lamp);
    }
    if (v.theme === "laguna") {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(14, 90, 14), new THREE.MeshStandardMaterial({ color: 0xb5562f }));
      tower.position.set(-200, 45, -R - 80);
      g.add(tower);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(10, 26, 4), new THREE.MeshStandardMaterial({ color: 0x5e7c5a }));
      spire.position.set(-200, 103, -R - 80);
      g.add(spire);
    }
    if (v.theme === "saline") {
      for (let i = 0; i < 4; i++) {
        const mill = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 22, 10), new THREE.MeshStandardMaterial({ color: 0xf0e8d8 }));
        body.position.y = 11;
        mill.add(body);
        const blades = new THREE.Mesh(new THREE.BoxGeometry(1, 28, 2), new THREE.MeshStandardMaterial({ color: 0x8a6a48 }));
        blades.position.set(0, 22, 6);
        mill.add(blades);
        const b2 = blades.clone();
        b2.rotation.z = Math.PI / 2;
        mill.add(b2);
        mill.position.set(-400 + i * 260, 0, -R - 40);
        g.add(mill);
        (this.spinners ??= []).push(blades, b2);
      }
    }
    // alberi intorno all'ippodromo
    const nTrees = this.mobile ? 120 : 260;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.6, 4, 6), toon({ color: 0x8a5a3a }), nTrees);
    const crown = new THREE.InstancedMesh(
      v.theme === "montagna" || v.theme === "mare" ? new THREE.ConeGeometry(3.2, 10, 7) : new THREE.IcosahedronGeometry(4, 0),
      toon({ color: v.theme === "montagna" ? 0x3f8a5c : v.theme === "saline" ? 0xa8c060 : 0x4fae4a }),
      nTrees,
    );
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < nTrees * 3 && k < nTrees; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = (v.L / 2 + v.R + v.width) * (1.25 + Math.random() * 1.4);
      const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.8;
      if (z > v.R + v.width && Math.abs(x) < 200) continue; // non davanti alle tribune
      const s = 0.7 + Math.random() * 0.8;
      m.makeScale(s, s, s).setPosition(x, 2 * s, z);
      trunk.setMatrixAt(k, m);
      m.makeScale(s, s, s).setPosition(x, 7 * s, z);
      crown.setMatrixAt(k, m);
      k++;
    }
    trunk.count = crown.count = k;
    g.add(trunk, crown);
    // prato interno: aiuole e laghetto
    const pond = new THREE.Mesh(new THREE.CircleGeometry(Math.min(40, v.R * 0.45), 32), new THREE.MeshStandardMaterial({ color: v.surface === "neve" ? 0xcfe3ef : 0x3f7fae, roughness: 0.2 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(0, 0.03, 0);
    g.add(pond);
    this.scene.add(g);
  }

  buildClouds(grey) {
    const tex = cloudTexture();
    const n = this.mobile ? 14 : 26;
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: grey ? 0xc9d2de : 0xffffff, transparent: true, depthWrite: false, fog: false });
      const sp = new THREE.Sprite(m);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const r = 1100 + Math.random() * 700;
      sp.position.set(Math.cos(a) * r, 160 + Math.random() * 260, Math.sin(a) * r);
      const sc = 260 + Math.random() * 300;
      sp.scale.set(sc * 1.8, sc, 1);
      this.scene.add(sp);
    }
  }

  buildWeather(w) {
    this.particles = null;
    if (w === "sole" || w === "nuvoloso" || w === "vento") {
      // petali di sakura che volano
      const n = this.mobile ? 160 : 400;
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = (Math.random() - 0.5) * 120;
        arr[i * 3 + 1] = Math.random() * 25;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 120;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({ map: petalTexture(), color: 0xffffff, size: 0.45, transparent: true, depthWrite: false, alphaTest: 0.1 });
      this.particles = new THREE.Points(geo, mat);
      this.particles.userData = { speed: 0.9, snow: true, petals: true };
      this.scene.add(this.particles);
      return;
    }
    const rain = w === "pioggia" || w === "temporale";
    const snow = w === "neve";
    if (!rain && !snow) return;
    const n = this.mobile ? 2500 : 6000;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 160;
      arr[i * 3 + 1] = Math.random() * 60;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: snow ? 0xffffff : 0xaec6dd, size: snow ? 0.35 : 0.12, transparent: true, opacity: snow ? 0.9 : 0.6, depthWrite: false });
    this.particles = new THREE.Points(geo, mat);
    this.particles.userData = { speed: snow ? 2.5 : 22, snow };
    this.scene.add(this.particles);
    if (w === "temporale") this.lightning = 0;
  }

  // ------------------------------------------------------------------ cavalli
  buildHorses() {
    this.horses = this.rep.horses.map((h, i) => {
      const model = createHorse(h.look, h.silks, h.num, { low: this.mobile && this.rep.horses.length > 10, heightCm: h.heightCm });
      this.scene.add(model.root);
      const fj = createFallenJockey(h.silks);
      fj.visible = false;
      this.scene.add(fj);
      return { ...model, info: h, fallenJockey: fj, yaw: 0, lastPos: null };
    });
    // oggetti dei sicari
    this.hazardMeshes = new Map();
  }

  /** Stato di un corridore all'istante t (interpolato fra i frame). */
  sample(i, t) {
    const F = this.rep.frames;
    const ft = Math.max(0, t / this.rep.dt);
    const k = Math.min(F.length - 2, Math.floor(ft));
    const a = F[Math.max(0, k)], b = F[Math.max(0, k + 1)] ?? a;
    const u = Math.min(1, Math.max(0, ft - k));
    const o = i * 4;
    const p = (a[o] + (b[o] - a[o]) * u) / 10;
    const d = (a[o + 1] + (b[o + 1] - a[o + 1]) * u) / 100;
    const v = (a[o + 2] + (b[o + 2] - a[o + 2]) * u) / 10;
    const code = (u < 0.5 ? a : b)[o + 3];
    return { p, d, v, status: code & 7, riderless: code >= 8 };
  }

  hazardAt(hz, t) {
    let m = this.hazardMeshes.get(hz.id);
    const active = t >= hz.t0 && t <= hz.t1 + (hz.kind === "buccia" || hz.kind === "olio" ? 300 : 0);
    if (!m) {
      m = makeHazardMesh(hz, this.venue);
      if (!m) return;
      if (hz.emoji && hz.kind !== "petardo" && hz.kind !== "laser") {
        // l'imprevisto si vede: emoji grande sopra l'oggetto
        const cv = document.createElement("canvas");
        cv.width = cv.height = 128;
        const g = cv.getContext("2d");
        g.font = "100px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(hz.emoji, 64, 70);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
        const big = hz.kind === "invasore" || hz.kind === "drone";
        sp.scale.set(big ? 2.4 : 1.6, big ? 2.4 : 1.6, 1);
        sp.position.y = hz.kind === "drone" ? 0.6 : big ? 1.2 : 0.8;
        if (hz.kind === "invasore") m.children.forEach((c) => (c.visible = false));
        m.add(sp);
      }
      this.hazardMeshes.set(hz.id, m);
      this.scene.add(m);
    }
    m.visible = active && hz.kind !== "caduto";
    if (!m.visible) return;
    const s = this.rep.startS;
    if (hz.kind === "invasore") {
      const u = (t - hz.t0) / Math.max(0.1, hz.t1 - hz.t0);
      const d = hz.d + (hz.vd ?? -5) * (t - hz.t0);
      const p = trackPoint(this.venue, s + hz.p, d);
      m.position.set(p.x, 0, p.z);
      m.rotation.y = Math.atan2(p.hx, p.hz) + Math.PI / 2;
      m.children[0].rotation.x = Math.sin(t * 14) * 0.5;
      void u;
    } else if (hz.kind === "drone" && hz.target !== undefined) {
      const st = this.sample(hz.target, t);
      const p = trackPoint(this.venue, s + st.p + 2, st.d);
      m.position.set(p.x, 3 + Math.sin(t * 3) * 0.5, p.z);
      m.rotation.y = t * 4;
    } else if (hz.kind === "laser" && hz.target !== undefined) {
      const st = this.sample(hz.target, t);
      const a = this.tp(s + st.p, this.venue.width + 25, 6);
      const b = this.tp(s + st.p + 0.8, st.d, 2.3);
      const pos = m.geometry.attributes.position;
      pos.setXYZ(0, a.x, a.y, a.z);
      pos.setXYZ(1, b.x, b.y, b.z);
      pos.needsUpdate = true;
    } else if (hz.kind === "petardo") {
      const u = (t - hz.t0) / (hz.t1 - hz.t0);
      const p = this.tp(s + hz.p, hz.d, 1.5);
      m.position.copy(p);
      m.scale.setScalar(1 + u * 9);
      m.material.opacity = Math.max(0, 1 - u);
    } else {
      const p = trackPoint(this.venue, s + hz.p, hz.d);
      m.position.set(p.x, hz.kind === "sicario" ? 0 : 0.03, p.z);
      if (hz.kind === "sicario") m.rotation.y = Math.atan2(p.hx, p.hz) - Math.PI / 2;
    }
  }

  // ------------------------------------------------------------------ regia
  setMode(mode, follow) {
    this.mode = mode;
    if (follow !== undefined) this.follow = follow;
    this.shot.until = 0;
  }

  /** Emoji che compare sopra un cavallo (stile manga). */
  pop(i, emoji, dur = 2.2) {
    const hm = this.horses[i];
    if (!hm) return;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "#fff";
    g.strokeStyle = "#1b1a3a";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(64, 60, 50, 0, 7);
    g.fill();
    g.stroke();
    g.font = "64px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(emoji, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(1.8, 1.8, 1);
    sp.position.set(0, 4.2, 0);
    sp.renderOrder = 999;
    hm.root.add(sp);
    (this.pops ??= []).push({ sp, until: this.time + dur, born: this.time, hm });
  }

  /** Il commento segnala eventi interessanti: la regia può fare un primo piano. */
  focusEvent(i, t, dur = 3.2) {
    if (this.mode !== "tv") return;
    if (this.shot.kind === "finish") return;
    this.shot = { kind: "event", until: t + dur, focus: i, side: Math.random() < 0.5 ? 1 : -1 };
  }

  chooseShot(t, states, order) {
    const leader = states[order[0]];
    const rem = this.rep.distance - leader.p;
    if (t < 0) return { kind: "gate", until: 0 };
    if (rem < 170 || leader.status === 6) return { kind: "finish", until: t + 999 };
    if (rem < 420 && !isCurve(this.venue, this.rep.startS + leader.p)) return { kind: Math.random() < 0.5 ? "headon" : "side", until: t + 6 };
    const opts = ["side", "side", "chase", "rail", "chase", "side", "heli"];
    return { kind: opts[Math.floor(Math.random() * opts.length)], until: t + 5 + Math.random() * 4 };
  }

  updateCamera(t, dt, states, order) {
    const s0 = this.rep.startS;
    const v = this.venue;
    const lead = states[order[0]];
    const runningIdx = order.filter((i) => states[i].status !== 7);
    const packN = Math.min(5, runningIdx.length);
    let packP = 0, packD = 0;
    for (let k = 0; k < packN; k++) { packP += states[runningIdx[k]].p; packD += states[runningIdx[k]].d; }
    packP /= packN || 1;
    packD /= packN || 1;
    let kind = this.shot.kind, focus = -1;
    if (this.mode === "follow" && this.follow >= 0) kind = "chase", focus = this.follow;
    else if (this.mode === "heli") kind = "heli";
    else if (this.mode === "side") kind = "side";
    else if (this.mode === "tv") {
      if (t > this.shot.until) this.shot = this.chooseShot(t, states, order);
      kind = this.shot.kind;
      focus = this.shot.focus ?? -1;
    }
    const P = this.camTarget.pos, Lk = this.camTarget.look;
    const sp = (p, d, y) => this.tp(s0 + p, d, y);
    // sul rettilineo d'arrivo le tribune sono all'esterno: le telecamere laterali stanno dentro l'ovale
    const homeStraight = (p) => trackPoint(v, s0 + p, 0).seg === 0;
    const outside = (p, dist) => (homeStraight(p) ? -dist : v.width + dist);
    switch (kind) {
      case "gate": {
        P.copy(sp(16, v.width * 0.75, 3.2));
        Lk.copy(sp(-1, Math.min(v.width, this.rep.horses.length * 1.12) * 0.45, 1.4));
        break;
      }
      case "side": {
        P.copy(sp(packP - 4, outside(packP, this.camera.aspect < 1 ? 10 : 18), this.camera.aspect < 1 ? 4.5 : 6.5));
        Lk.copy(sp(packP + 2, packD, 1.3));
        break;
      }
      case "heli": {
        P.copy(sp(packP - 24, packD + 6, 16));
        Lk.copy(sp(packP + 10, packD, 0));
        break;
      }
      case "rail": {
        P.copy(sp(lead.p + 6, -2.4, 1.6));
        Lk.copy(sp(packP - 3, packD, 1.3));
        break;
      }
      case "headon": {
        P.copy(sp(this.rep.distance + 30, v.width * 0.45, 3.2));
        Lk.copy(sp(lead.p - 4, v.width * 0.4, 1.4));
        break;
      }
      case "finish": {
        P.copy(sp(this.rep.distance - 3, -15, 4.2));
        Lk.copy(sp(this.rep.distance - 9, v.width * 0.45, 1.2));
        break;
      }
      case "chase":
      case "event": {
        const i = focus >= 0 ? focus : order[0];
        const st = states[i];
        const side = this.shot.side ?? 1;
        if (kind === "event") {
          P.copy(sp(st.p + 4, st.d + side * 9, 3.2));
          Lk.copy(sp(st.p, st.d, 1.3));
        } else {
          P.copy(sp(st.p - 9, st.d + 2.5, 3.6));
          Lk.copy(sp(st.p + 6, st.d, 1.5));
        }
        break;
      }
    }
    const jump = this.camPos.distanceTo(P) > 60 || this.camJustReset;
    const k = jump ? 1 : 1 - Math.pow(0.0025, dt);
    this.camPos.lerp(P, k);
    this.camLook.lerp(Lk, jump ? 1 : 1 - Math.pow(0.0008, dt));
    this.camJustReset = false;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // il sole e le ombre seguono il gruppo
    const c = sp(packP, packD, 0);
    this.sun.position.set(c.x + 60, 120, c.z + 50);
    this.sun.target.position.copy(c);
    if (this.particles) this.particles.position.set(this.camPos.x, 0, this.camPos.z);
  }

  /** Disegna il frame al tempo di gara t (secondi, negativo prima del via). */
  render(t, dt, order, extra = {}) {
    this.time += dt;
    const tt = Math.max(0, t);
    const s0 = this.rep.startS;
    const states = this.horses.map((_, i) => this.sample(i, tt));
    this.horses.forEach((hm, i) => {
      const st = states[i];
      const s = s0 + st.p;
      const tp = trackPoint(this.venue, s, st.d);
      // prima del via sono nelle gabbie
      hm.root.position.set(tp.x, 0, tp.z);
      const sAhead = trackPoint(this.venue, s + 1.5, st.d);
      let yaw = Math.atan2(-(sAhead.z - tp.z), sAhead.x - tp.x);
      const st2 = this.sample(i, tt + 0.2);
      yaw += Math.max(-0.35, Math.min(0.35, -(st2.d - st.d) * 1.2));
      if (st.v < 0) yaw += Math.PI;
      hm.yaw += angDiff(yaw, hm.yaw) * Math.min(1, dt * 8);
      hm.root.rotation.y = hm.yaw;
      // salto delle siepi
      let jump = 0;
      for (const hp of this.rep.hurdles) {
        const dd = st.p - hp;
        if (dd > -2.6 && dd < 2.6 && (st.status === 1 || st.status === 2)) jump = (dd + 2.6) / 5.2;
      }
      const whip = extra.whips?.has(i) ?? false;
      hm.update(dt * (extra.speed ?? 1), { speed: t < 0 ? 0 : Math.abs(st.v), status: st.status, jump, whip, riderless: st.riderless, t: this.time });
      hm.root.visible = true;
      // fantino a terra
      if (st.riderless && !hm.fallenJockey.visible) {
        const fp = trackPoint(this.venue, s, Math.min(this.venue.width - 1, st.d + 1.2));
        hm.fallenJockey.position.set(fp.x, 0, fp.z);
        hm.fallenJockey.visible = true;
      }
      if (!st.riderless) hm.fallenJockey.visible = false;
    });
    for (const hz of this.rep.hazards) this.hazardAt(hz, tt);
    this.gate.visible = t < 6;
    // pubblico che salta (aggiorno una parte per frame)
    if (this.crowd) {
      const m = new THREE.Matrix4();
      const ex = extra.excitement ?? 0.3;
      const n = this.crowdBase.length;
      const step = this.mobile ? 6 : 3;
      const off = Math.floor(this.time * 60) % step;
      for (let i = off; i < n; i += step) {
        const b = this.crowdBase[i];
        const jumpY = Math.max(0, Math.sin(this.time * (5 + ex * 6) + b[3])) * 0.35 * ex;
        m.makeTranslation(b[0], b[1] + jumpY, b[2]);
        this.crowd.setMatrixAt(i, m);
      }
      this.crowd.instanceMatrix.needsUpdate = true;
    }
    if (this.spinners) for (const s of this.spinners) s.rotation.z += dt * 0.8;
    if (this.pops) {
      this.pops = this.pops.filter((p) => {
        const age = this.time - p.born;
        p.sp.position.y = 4.2 + Math.min(1, age * 3) * 0.6 + Math.sin(age * 8) * 0.08;
        const k = Math.min(1, age * 6);
        p.sp.scale.set(1.8 * k, 1.8 * k, 1);
        if (this.time > p.until) { p.hm.root.remove(p.sp); p.sp.material.map.dispose(); p.sp.material.dispose(); return false; }
        return true;
      });
    }
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position;
      const sp = this.particles.userData.speed;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - sp * dt;
        if (y < 0) y += this.particles.userData.petals ? 25 : 60;
        pos.setY(i, y);
        if (this.particles.userData.snow) pos.setX(i, pos.getX(i) + Math.sin(this.time + i) * 0.02 + (this.particles.userData.petals ? dt * 2 : 0));
        if (this.particles.userData.petals && pos.getX(i) > 60) pos.setX(i, -60);
      }
      pos.needsUpdate = true;
    }
    if (this.lightning !== undefined) {
      if (Math.random() < dt * 0.08) this.lightning = 0.25;
      this.lightning = Math.max(0, this.lightning - dt);
      this.renderer.toneMappingExposure = 1.05 + this.lightning * 4;
    }
    this.drawBoard(states, order, t);
    this.updateCamera(t, dt, states, order);
    this.renderer.render(this.scene, this.camera);
    return states;
  }

  drawBoard(states, order, t) {
    if (!this.boardCanvas || (this._boardT && this.time - this._boardT < 0.5)) return;
    this._boardT = this.time;
    const g = this.boardCanvas.getContext("2d");
    g.fillStyle = "#06120a";
    g.fillRect(0, 0, 512, 224);
    g.fillStyle = "#ffc43d";
    g.font = "bold 30px monospace";
    const lead = states[order[0]];
    const rem = Math.max(0, Math.round(this.rep.distance - lead.p));
    g.fillText(t < 0 ? "PARTENZA" : rem > 0 ? `${rem} m` : "ARRIVO!", 16, 38);
    g.fillStyle = "#e8f5e9";
    g.font = "bold 26px monospace";
    order.slice(0, 5).forEach((i, k) => {
      const h = this.rep.horses[i];
      g.fillStyle = h.silks.primary;
      g.fillRect(16, 56 + k * 33, 22, 24);
      g.fillStyle = "#e8f5e9";
      g.fillText(`${k + 1}. ${String(h.num).padStart(2)} ${h.name.slice(0, 22)}`, 46, 77 + k * 33);
    });
    this.boardTex.needsUpdate = true;
  }
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function noiseTexture(color, amt) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * amt})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripeTexture(a, b, surface) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext("2d");
  g.fillStyle = a;
  g.fillRect(0, 0, 256, 64);
  if (surface === "erba") {
    g.fillStyle = b;
    g.fillRect(0, 0, 128, 64);
  }
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * 0.09})`;
    g.fillRect(Math.random() * 256, Math.random() * 64, 2, 1);
  }
  // segni degli zoccoli
  if (surface !== "erba") {
    g.strokeStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 40; i++) {
      const y = Math.random() * 64;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y + (Math.random() - 0.5) * 6);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function textTexture(text, bg, fg) {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 64;
  const g = cv.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = fg;
  g.font = "bold 44px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeHazardMesh(hz, venue) {
  const g = new THREE.Group();
  switch (hz.kind) {
    case "buccia": {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 6, 10, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0xf5d020 }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.06;
      g.add(m);
      return g;
    }
    case "olio": {
      const m = new THREE.Mesh(new THREE.CircleGeometry(hz.r, 20), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.05, metalness: 0.6 }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.03;
      g.add(m);
      return g;
    }
    case "corda": {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, hz.r * 2, 6), new THREE.MeshStandardMaterial({ color: 0xc8a165 }));
      m.rotation.x = Math.PI / 2;
      m.position.y = 0.45;
      g.add(m);
      return g;
    }
    case "invasore":
    case "sicario": {
      const coatC = hz.kind === "sicario" ? 0x151515 : 0x2a9d4b;
      const body = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 0.28), new THREE.MeshStandardMaterial({ color: coatC }));
      torso.position.y = 1.25;
      body.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd9a882 }));
      head.position.y = 1.78;
      body.add(head);
      if (hz.kind === "sicario") {
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
        hat.position.y = 1.9;
        body.add(hat);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.18, 12), hat.material);
        top.position.y = 1.99;
        body.add(top);
        const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.26), new THREE.MeshStandardMaterial({ color: 0x000000 }));
        glasses.position.set(0.13, 1.8, 0);
        body.add(glasses);
      }
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.85, 0.15), new THREE.MeshStandardMaterial({ color: 0x223355 }));
        leg.position.set(0, 0.45, sz * 0.1);
        body.add(leg);
      }
      g.add(body);
      return g;
    }
    case "petardo": {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 1 }));
      return m;
    }
    case "drone": {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      g.add(body);
      for (const [x, z] of [[0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.6 }));
        r.position.set(x, 0.08, z);
        g.add(r);
      }
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
      led.position.y = -0.08;
      g.add(led);
      return g;
    }
    case "laser": {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff1a1a }));
    }
  }
  void venue;
  return null;
}

function cloudTexture() {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext("2d");
  const puffs = [[70, 80, 42], [120, 62, 52], [175, 78, 40], [100, 92, 36], [150, 92, 38], [205, 92, 28], [45, 96, 26]];
  // ombra azzurra sotto, bianco sopra: tipico cielo anime
  for (const [x, y, r] of puffs) {
    g.fillStyle = "#cfe3ff";
    g.beginPath();
    g.arc(x, y + 6, r, 0, 7);
    g.fill();
  }
  for (const [x, y, r] of puffs) {
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(x, y - 2, r * 0.92, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function petalTexture() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d");
  g.fillStyle = "#ffb7d5";
  g.beginPath();
  g.ellipse(16, 16, 12, 7, 0.6, 0, 7);
  g.fill();
  g.fillStyle = "#ffd9ea";
  g.beginPath();
  g.ellipse(13, 14, 5, 3, 0.6, 0, 7);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
