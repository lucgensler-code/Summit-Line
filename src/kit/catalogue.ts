// Scenery kit — catalogue. Builds (and caches) the geometry for any item in a recipe, by id and
// variant, in near or far detail. The game, the kit preview page and (later) model export all go
// through here.
import type * as THREE from 'three';
import type { Recipe } from '../recipes';
import type { KitItem } from '../recipes/cindercrest';
import { crystalBaseGeometry, crystalGeometry } from './gems';
import { fernGeometry, flowerGeometry, grassGeometry, shrubGeometry } from './plants';
import { cairnGeometry, rockGeometry } from './rocks';
import { treeGeometry } from './trees';

const cache = new Map<string, THREE.BufferGeometry>();

/** Stable per-item seed so variants never change between builds. */
function seedFor(id: string, variant: number) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (Math.abs(h) % 100000) + variant * 7919 + 11;
}

export function buildItem(item: KitItem, id: string, variant: number, far: boolean): THREE.BufferGeometry {
  const seed = seedFor(id, variant);
  switch (item.kind) {
    case 'tree':
      return treeGeometry(item.settings, seed, far);
    case 'rock':
      return rockGeometry(item.settings, seed, far);
    case 'grass':
      return grassGeometry(item.settings, seed);
    case 'flower':
      return flowerGeometry(item.settings, seed);
    case 'shrub':
      return shrubGeometry(item.settings, seed);
    case 'fern':
      return fernGeometry(item.settings, seed);
    default:
      throw new Error(`kit item ${id} (${item.kind}) has no generator; load it with loadKitModel`);
  }
}

/**
 * Thin foliage (grass blades, fern fronds, flowers) is lit as if facing the sky, the usual trick
 * for low-poly vegetation: it shades like the ground it grows from instead of showing dark backs.
 */
function skyNormals(g: THREE.BufferGeometry) {
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  n.needsUpdate = true;
  return g;
}

export function kitGeometry(recipe: Recipe, id: string, variant: number, far = false) {
  const key = `${id}:${variant}:${far ? 1 : 0}`;
  let g = cache.get(key);
  if (!g) {
    const item = (recipe.items as Record<string, KitItem>)[id];
    g = buildItem(item, id, variant, far);
    if (item.kind === 'grass' || item.kind === 'flower' || item.kind === 'fern') skyNormals(g);
    cache.set(key, g);
  }
  return g;
}

export function cairnKitGeometry(recipe: Recipe, variant: number) {
  const key = `cairn:${variant}`;
  let g = cache.get(key);
  if (!g) {
    const s = recipe.placement.cairns.settings;
    g = cairnGeometry(s[variant % s.length], 500 + variant);
    cache.set(key, g);
  }
  return g;
}

export function gemKitGeometry(recipe: Recipe, kind: 'green' | 'red') {
  const key = `gem:${kind}`;
  let g = cache.get(key);
  if (!g) {
    g = crystalGeometry(recipe.placement.gems.crystal[kind], kind === 'green' ? 71 : 83);
    cache.set(key, g);
  }
  return g;
}

export function gemBaseKitGeometry() {
  let g = cache.get('gem:base');
  if (!g) {
    g = crystalBaseGeometry(97);
    cache.set('gem:base', g);
  }
  return g;
}
