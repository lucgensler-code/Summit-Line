// Scenery kit — hand-made models. Lets a recipe use glTF/GLB models made in Blender (or any 3D
// tool) alongside generated items. A model is flattened into one geometry with vertex colours
// (taken from each mesh's material colour) so it instances and lights exactly like kit items.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeParts } from './core';

/** Convert a loaded glTF scene into a single kit-ready geometry (vertex colours, flat normals). */
export function sceneToKitGeometry(root: THREE.Object3D) {
  const parts: THREE.BufferGeometry[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    g = g.index ? g.toNonIndexed() : g;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const c = mat?.color ?? new THREE.Color(1, 1, 1);
    const n = g.attributes.position.count;
    if (!g.attributes.color) {
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    parts.push(g);
  });
  return mergeParts(parts);
}

const cache = new Map<string, Promise<THREE.BufferGeometry>>();

/** Load a model from a URL (relative to the page) once, as a kit geometry. */
export function loadKitModel(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((gltf) => sceneToKitGeometry(gltf.scene));
    cache.set(url, p);
  }
  return p;
}

/** Parse an in-memory glTF (used by the kit preview to prove the pipeline end to end). */
export function parseKitModel(data: ArrayBuffer | string) {
  return new GLTFLoader().parseAsync(data, '').then((gltf) => sceneToKitGeometry(gltf.scene));
}
