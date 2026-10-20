// Kit preview page (kit.html, dev only): renders every recipe item with its variants and
// settings, plus a glTF round trip (export a kit rock → load it back as a hand-made model) to
// prove the hand-made model path.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { CINDERCREST } from '../recipes';
import type { KitItem } from '../recipes/cindercrest';
import { cairnKitGeometry, gemBaseKitGeometry, gemKitGeometry, kitGeometry } from './catalogue';
import { parseKitModel } from './models';

const grid = document.getElementById('grid')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(460, 400);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

function scene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color('#b9c8dc');
  s.add(new THREE.HemisphereLight('#c9d4ec', '#5d5246', 1.1));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.position.set(4, 7, 5);
  s.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#7d8a58' }));
  s.add(ground);
  return s;
}

const solid = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const plant = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

function cell(title: string, info: unknown, geos: THREE.BufferGeometry[], mat = solid) {
  const s = scene();
  const group = new THREE.Group();
  const box = new THREE.Box3();
  geos.forEach((g, i) => {
    const m = new THREE.Mesh(g, mat);
    g.computeBoundingBox();
    const w = g.boundingBox!.getSize(new THREE.Vector3());
    m.position.x = (i - (geos.length - 1) / 2) * Math.max(w.x, w.z) * 1.25;
    group.add(m);
  });
  s.add(group);
  box.setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z);
  const cam = new THREE.PerspectiveCamera(35, 460 / 400, 0.01, 1000);
  const c = box.getCenter(new THREE.Vector3());
  cam.position.set(c.x + r * 0.15, c.y + r * 0.35, c.z + r * 1.5);
  cam.lookAt(c);
  renderer.render(s, cam);
  const el = document.createElement('div');
  el.className = 'cell';
  const img = document.createElement('canvas');
  img.width = 460;
  img.height = 400;
  img.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
  const b = document.createElement('b');
  b.textContent = title;
  const pre = document.createElement('pre');
  pre.textContent = typeof info === 'string' ? info : JSON.stringify(info, null, 1);
  el.append(img, b, pre);
  grid.append(el);
}

const items = CINDERCREST.items as Record<string, KitItem>;
for (const [id, item] of Object.entries(items)) {
  if (item.kind === 'model') continue;
  const n = Math.min(3, item.variants);
  const geos = Array.from({ length: n }, (_, v) => kitGeometry(CINDERCREST, id, v));
  const isPlant = item.kind !== 'tree' && item.kind !== 'rock';
  cell(`${id} · ${item.kind}`, item.settings, geos, isPlant ? plant : solid);
}
cell('cairns', CINDERCREST.placement.cairns.settings, [0, 1, 2, 3].map((v) => cairnKitGeometry(CINDERCREST, v)));
cell('gems', CINDERCREST.placement.gems.crystal, [gemKitGeometry(CINDERCREST, 'green'), gemBaseKitGeometry(), gemKitGeometry(CINDERCREST, 'red')]);

// Hand-made model path: export a kit rock as glTF, load it back through the model loader.
const exported = await new GLTFExporter().parseAsync(new THREE.Mesh(kitGeometry(CINDERCREST, 'basaltBoulder', 0), new THREE.MeshStandardMaterial({ vertexColors: true })), { binary: true });
const loaded = await parseKitModel(exported as ArrayBuffer);
cell('glTF round trip (hand-made model path)', 'basaltBoulder exported as .glb, then loaded with loadKitModel / parseKitModel', [loaded]);
document.title = 'Summit Line Kit · ready';
