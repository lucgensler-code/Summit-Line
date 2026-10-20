import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { quality } from './Performance';

/**
 * Filmic colour grade (v0.6.1), applied in linear light before tone mapping: shadows lifted
 * toward a cool lavender, highlights warmed, a touch more saturation in the mid-tones and a
 * soft vignette — the warm, painterly feel of the reference art.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uShadow: { value: new THREE.Color('#2a2c4a') },
    uHighlight: { value: new THREE.Color('#fff1dc') },
    uSat: { value: 1.08 },
    uVignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadow;
    uniform vec3 uHighlight;
    uniform float uSat;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // Soft highlight roll-off so sunlit snow keeps its shading instead of clipping to white.
      float k = l > 0.75 ? (0.75 + (l - 0.75) / (1.0 + (l - 0.75) * 1.6)) / l : 1.0;
      c.rgb *= k;
      l *= k;
      // saturation, gentle in the highlights
      vec3 col = mix(vec3(l), c.rgb, mix(uSat, 1.0, smoothstep(0.6, 1.6, l)));
      // split-tone: cool lift in the shadows, warm in the highlights
      col += uShadow * 0.06 * (1.0 - smoothstep(0.0, 0.35, l));
      col *= mix(vec3(1.0), uHighlight, smoothstep(0.35, 1.4, l) * 0.6);
      // vignette
      vec2 d = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(col, c.a);
    }`,
};

/**
 * Soft glow + colour grade over the whole frame. Takes over rendering (frame priority 1) while
 * `quality.post` is on; the performance governor turns it off first on slower devices, after
 * which the scene renders directly as before.
 */
export function PostFX() {
  const { gl, scene, camera, size, viewport } = useThree();
  const composer = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.5, 1.08));
    c.addPass(new ShaderPass(GradeShader));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setPixelRatio(viewport.dpr);
    composer.setSize(size.width, size.height);
  }, [composer, size, viewport.dpr]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((_, dt) => {
    if (quality.post) composer.render(dt);
    else gl.render(scene, camera);
  }, 1);
  return null;
}
