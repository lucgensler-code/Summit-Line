// Runtime textures built straight from pixel arrays (v0.8).
//
// Safari's anti-fingerprinting protection adds random per-pixel colour noise when a 2D canvas is
// read back — including when it is uploaded as a WebGL texture — which showed up as rainbow
// confetti in the clouds on iPhone. Building textures from typed arrays avoids canvas entirely.
import * as THREE from 'three';

/**
 * A white RGBA texture whose alpha comes from `alpha(u, v)` (u, v in 0…1, v = 0 at the top row).
 * Mipmapped and filtered like a canvas texture.
 */
export function alphaTexture(w: number, h: number, alpha: (u: number, v: number) => number) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = alpha((x + 0.5) / w, (y + 0.5) / h);
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

let dot: THREE.DataTexture | null = null;
/** Soft round dot for point particles (otherwise they draw as hard squares). Shared. */
export function dotTexture() {
  if (!dot)
    dot = alphaTexture(32, 32, (u, v) => {
      const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
      return (1 - r) * (1 - r);
    });
  return dot;
}
