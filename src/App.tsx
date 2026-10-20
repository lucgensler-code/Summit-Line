import { useEffect, useRef } from 'react';
import { useGame, runtime } from './game/store';
import { useDesktopControls } from './game/useControls';
import { GameCanvas } from './scene/GameCanvas';
import { DebugPanel, FpsOverlay } from './scene/Performance';
import { HUD } from './ui/HUD';
import { PauseMenu } from './ui/PauseMenu';
import { PrepScreen } from './ui/PrepScreen';
import { SummitScreen } from './ui/SummitScreen';
import { TouchControls, isTouchDevice } from './ui/TouchControls';
import { MapOverlay } from './ui/MapOverlay';
import { ExpeditionLog } from './ui/ExpeditionLog';
import { Leaderboard } from './ui/Leaderboard';
import { RegisterModal } from './ui/RegisterModal';
import { getWorld } from './game/world';
import { summitCinematic } from './game/cinematic';

declare global {
  interface Window {
    __summit?: unknown;
  }
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const phase = useGame((s) => s.phase);
  const mapOpen = useGame((s) => s.mapOpen);
  const logOpen = useGame((s) => s.logOpen);
  const viewMode = useGame((s) => s.viewMode);
  const registerOpen = useGame((s) => s.registerOpen);
  const lbOpen = useGame((s) => s.lbOpen);
  useDesktopControls(host);

  useEffect(() => {
    // Lightweight debug hooks for automated playtesting.
    window.__summit = { runtime, useGame, getWorld, summitCinematic };
    const onVis = () => {
      if (document.hidden) useGame.getState().pause();
    };
    document.addEventListener('visibilitychange', onVis);
    // Stop iOS Safari's own pinch-zoom / page scrolling from fighting the game's gestures.
    const block = (e: Event) => e.preventDefault();
    const blockTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) return e.preventDefault();
      const scrollable = (e.target as Element | null)?.closest?.('.modal, .summary-card, .prep-panel, .map-sheet, .lb-table-wrap');
      if (!scrollable && useGame.getState().phase !== 'prep') e.preventDefault();
    };
    document.addEventListener('gesturestart', block);
    document.addEventListener('gesturechange', block);
    document.addEventListener('touchmove', blockTouch, { passive: false });
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('gesturechange', block);
      document.removeEventListener('touchmove', blockTouch);
    };
  }, []);

  return (
    <div className={`app phase-${phase} ${isTouchDevice() ? 'is-touch' : 'is-desktop'} ${viewMode ? 'view-mode' : ''}`}>
      <div className="canvas-host" ref={host}>
        <GameCanvas />
      </div>
      {phase === 'prep' && <PrepScreen />}
      {phase === 'playing' && !mapOpen && <TouchControls />}
      {(phase === 'playing' || phase === 'paused') && <HUD />}
      {mapOpen && (phase === 'playing' || phase === 'paused') && <MapOverlay />}
      {phase === 'paused' && <PauseMenu />}
      {phase === 'summit' && <SummitScreen />}
      {registerOpen && phase === 'playing' && <RegisterModal />}
      {/* Overlays render last so nothing (e.g. the summit gesture layer) can sit on top of them. */}
      {logOpen && <ExpeditionLog />}
      {lbOpen && <Leaderboard />}
      <FpsOverlay />
      <DebugPanel />
    </div>
  );
}
