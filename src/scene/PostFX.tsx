import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { debugFlags, quality } from './Performance';

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
      // Guard against non-finite pixels (some GPUs) so they can't flash across the frame.
      if (!(c.r < 65000.0 && c.g < 65000.0 && c.b < 65000.0)) c.rgb = vec3(0.0);
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
 *
 * v0.8: the HDR scene target is no longer multisampled. MSAA resolves HDR values before tone
 * mapping, so a dark edge against sunlit snow (linear values well above 1) averaged to near
 * white — a bright outline around trees, rocks and grass that shimmered as edges moved. Edges
 * are now smoothed with FXAA after tone mapping instead. Devices without half-float render
 * targets fall back to 8-bit.
 */
export function PostFX() {
  const { gl, scene, camera, size, viewport } = useThree();
  const composer = useMemo(() => {
    const half = gl.extensions.has('EXT_color_buffer_half_float') || gl.extensions.has('EXT_color_buffer_float');
    const target = new THREE.WebGLRenderTarget(1, 1, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 0 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.5, 1.08);
    // Same guard as the grade: a non-finite pixel must never seed the glow.
    const hp = bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace(
      'vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = texture2D( tDiffuse, vUv ); if (!(texel.r < 65000.0 && texel.g < 65000.0 && texel.b < 65000.0)) texel = vec4(0.0);',
    );
    hp.needsUpdate = true;
    c.addPass(bloom);
    c.addPass(new ShaderPass(GradeShader));
    c.addPass(new OutputPass());
    c.addPass(new FXAAPass());
    return { c, bloom };
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.c.setPixelRatio(viewport.dpr);
    composer.c.setSize(size.width, size.height);
  }, [composer, size, viewport.dpr]);
  useEffect(() => () => composer.c.dispose(), [composer]);
  useFrame((_, dt) => {
    composer.bloom.enabled = debugFlags.bloom;
    if (quality.post) composer.c.render(dt);
    else gl.render(scene, camera);
  }, 1);
  return null;
}
