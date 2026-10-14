import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr } from '@react-three/drei';
import * as THREE from 'three';
import { Atmosphere, Clouds, DistantLands, Spindrift } from './Environment';
import { GameLoop } from './GameLoop';
import { Landmarks } from './Landmarks';
import { CameraRig, Player } from './Player';
import { Terrain, Trail } from './Terrain';
import { Rocks, Shrubs, TrailMarkers, Trees } from './Vegetation';

export function GameCanvas() {
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 55, near: 0.2, far: 9000, position: [600, 300, 600] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        (window as unknown as { __summitGL: THREE.WebGLRenderer }).__summitGL = gl;
      }}
    >
      <AdaptiveDpr pixelated />
      <Atmosphere />
      <DistantLands />
      <Clouds />
      <Terrain />
      <Trail />
      <Trees />
      <Rocks />
      <Shrubs />
      <TrailMarkers />
      <Landmarks />
      <Player />
      <Spindrift />
      <CameraRig />
      <GameLoop />
    </Canvas>
  );
}
