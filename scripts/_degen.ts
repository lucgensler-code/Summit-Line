import { CINDERCREST } from '../src/recipes';
import { kitGeometry, cairnKitGeometry } from '../src/kit/catalogue';
const items = CINDERCREST.items as Record<string, { kind: string; variants?: number }>;
for (const [id, it] of Object.entries(items)) {
  if (it.kind === 'model') continue;
  for (const far of [false, true]) {
    const g = kitGeometry(CINDERCREST, id, 0, far);
    const p = g.attributes.position.array as Float32Array, n = g.attributes.normal.array as Float32Array;
    let degen = 0, badN = 0;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i+3]-p[i], ay = p[i+4]-p[i+1], az = p[i+5]-p[i+2], bx = p[i+6]-p[i], by = p[i+7]-p[i+1], bz = p[i+8]-p[i+2];
      const cx = ay*bz-az*by, cy = az*bx-ax*bz, cz = ax*by-ay*bx;
      if (Math.hypot(cx, cy, cz) < 1e-7) degen++;
    }
    for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i+1], n[i+2]); if (!(l > 0.5)) badN++; }
    if (degen || badN) console.log(id, far ? 'far' : 'near', 'tris', p.length / 9, 'degenerate', degen, 'badNormals', badN);
  }
}
for (let v = 0; v < 4; v++) { const g = cairnKitGeometry(CINDERCREST, v); const n = g.attributes.normal.array as Float32Array; let b = 0; for (let i = 0; i < n.length; i += 3) if (!(Math.hypot(n[i], n[i+1], n[i+2]) > 0.5)) b++; if (b) console.log('cairn', v, 'badNormals', b); }
console.log('done');
