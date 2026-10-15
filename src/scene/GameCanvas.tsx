import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Atmosphere, Clouds, DistantLands, Spindrift } from './Environment';
import { GameLoop } from './GameLoop';
import { PerfGovernor } from './Performance';
import { Gems } from './Gems';
import { Wildlife } from './Wildlife';
import { Landmarks } from './Landmarks';
import { CameraRig, Player } from './Player';
import { FarTerrain, Terrain, Trail } from './Terrain';
import { Ecology, Rocks, Shrubs, TrailMarkers, Trees } from './Vegetation';

export function GameCanvas() {
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={1}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 55, near: 0.2, far: 9000, position: [600, 300, 600] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        (window as unknown as { __summitGL: THREE.WebGLRenderer }).__summitGL = gl;
      }}
    >
      <PerfGovernor />
      <Atmosphere />
      <DistantLands />
      <Clouds />
      <Terrain />
      <FarTerrain />
      <Trail />
      <Trees />
      <Rocks />
      <Shrubs />
      <Ecology />
      <TrailMarkers />
      <Landmarks />
      <Gems />
      <Wildlife />
      <Player />
      <Spindrift />
      <CameraRig />
      <GameLoop />
    </Canvas>
  );
}
