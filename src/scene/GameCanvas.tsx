import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Atmosphere, Clouds, DistantLands, Spindrift, ValleyMist } from './Environment';
import { PostFX } from './PostFX';
import { GameLoop } from './GameLoop';
import { PerfGovernor, PrepMode } from './Performance';
import { Gems } from './Gems';
import { Wildlife } from './Wildlife';
import { Landmarks } from './Landmarks';
import { CameraRig, Player } from './Player';
import { FarTerrain, Terrain, Trail } from './Terrain';
import { Ecology, Rocks, Shrubs, TrailMarkers, Trees, ShaderWarmup, WindSway } from './Vegetation';

export function GameCanvas() {
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={1}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 60, near: 0.2, far: 9000, position: [600, 300, 600] }}
      onCreated={({ gl, scene }) => {
        (window as unknown as { __summitScene: THREE.Scene }).__summitScene = scene;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02; // v0.6: a touch lower so snow keeps its shading
        (window as unknown as { __summitGL: THREE.WebGLRenderer }).__summitGL = gl;
      }}
    >
      <PerfGovernor />
      <PrepMode />
      <Atmosphere />
      <DistantLands />
      <Clouds />
      <ValleyMist />
      <Terrain />
      <FarTerrain />
      <Trail />
      <Trees />
      <Rocks />
      <Shrubs />
      <WindSway />
      <ShaderWarmup />
      <Ecology />
      <TrailMarkers />
      <Landmarks />
      <Gems />
      <Wildlife />
      <Player />
      <Spindrift />
      <CameraRig />
      <GameLoop />
      <PostFX />
    </Canvas>
  );
}
