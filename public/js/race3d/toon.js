// Stile anime: materiali "cel-shading" a 3 toni e contorni neri (tecnica dello scafo invertito).
import * as THREE from "three";

let grad = null;
export function gradientMap() {
  if (grad) return grad;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  grad = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  return grad;
}

export function toon(params) {
  return new THREE.MeshToonMaterial({ gradientMap: gradientMap(), ...params });
}

const outlineCache = new Map();
export function outlineMaterial(thickness = 0.02, color = 0x1b1530) {
  const key = thickness + ":" + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n transformed += normalize(normal) * ${thickness.toFixed(4)};`);
  };
  outlineCache.set(key, m);
  return m;
}

/** Aggiunge il contorno a tutte le mesh di un gruppo (solo quelle abbastanza grandi). */
export function addOutlines(root, thickness = 0.02, minSize = 0.05) {
  const list = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noOutline && !o.userData.isOutline) list.push(o);
  });
  const v = new THREE.Vector3();
  for (const m of list) {
    m.geometry.computeBoundingSphere?.();
    const r = (m.geometry.boundingSphere?.radius ?? 1) * Math.max(m.scale.x, m.scale.y, m.scale.z);
    if (r < minSize) continue;
    // lo spessore va diviso per la scala della mesh, altrimenti le ellissoidi avrebbero bordi enormi
    const s = Math.max(0.0001, (m.scale.x + m.scale.y + m.scale.z) / 3);
    const o = new THREE.Mesh(m.geometry, outlineMaterial(+(thickness / s).toFixed(4)));
    o.userData.isOutline = true;
    o.castShadow = false;
    m.add(o);
    void v;
  }
}
