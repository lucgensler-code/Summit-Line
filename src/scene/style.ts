// Summit Line v0.6 art direction: one shared palette and a few material helpers, so every
// mountain uses the same naturalistic low-poly look — muted matte surfaces, warm sunlight, cool
// blue-lavender shadows and progressively paler distance.
import * as THREE from 'three';

const C = (hex: string) => new THREE.Color(hex);

export const STYLE = {
  // Forest
  pine: ['#3d5a3c', '#46633f', '#344f37', '#52683f', '#2f4834'].map(C),
  sage: C('#6f7d52'),
  trunk: C('#6a4a34'),
  frost: C('#c9d2d6'),
  forestFloor: C('#50693f'),
  needleDuff: C('#6f6a48'),
  earth: C('#8a7254'),
  moss: C('#4d6538'),
  meadowDry: C('#9c9668'),
  meadowGreen: C('#7c8a4e'),
  // Upper mountain
  cinder: C('#8a5442'),
  cinderDark: C('#5e4038'),
  pumice: C('#a39183'),
  basalt: C('#4d4545'),
  snow: C('#dfe3eb'),
  snowShade: C('#a9b3d2'),
  // Rocks and markers
  rockWarm: C('#8b7f78'),
  rockCool: C('#6d6670'),
  rockDark: C('#4f4848'),
  lichen: C('#8d8c66'),
  // Distance
  farForest: C('#3c5440'),
  farRock: C('#5f6278'), // v0.8: a touch darker so rock reads against the snow caps
  farSnow: C('#e4e8f2'),
};

let gradientTex: THREE.DataTexture | null = null;
/** 1×64 linear ramp (0 → 1) used as an emissive map: uv.y carries a per-vertex haze amount. */
export function hazeRamp() {
  if (gradientTex) return gradientTex;
  const n = 64;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round((i / (n - 1)) * 255);
    data.set([v, v, v, 255], i * 4);
  }
  gradientTex = new THREE.DataTexture(data, 1, n);
  gradientTex.magFilter = THREE.LinearFilter;
  gradientTex.minFilter = THREE.LinearFilter;
  gradientTex.needsUpdate = true;
  return gradientTex;
}

/**
 * Distant scenery material with its own atmospheric perspective (scene fog would erase it): each
 * vertex carries its albedo already dimmed by (1 − haze) and its haze amount in uv.y; the emissive
 * colour (set every frame to the current haze colour) is added in proportion to that haze. One
 * cheap Lambert material, no transparency.
 */
export function hazeMaterial() {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    fog: false,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: hazeRamp(),
  });
}
