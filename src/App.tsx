import { useEffect, useRef } from 'react';
import { useGame, runtime } from './game/store';
import { useDesktopControls } from './game/useControls';
import { GameCanvas } from './scene/GameCanvas';
import { HUD } from './ui/HUD';
import { PauseMenu } from './ui/PauseMenu';
import { PrepScreen } from './ui/PrepScreen';
import { SummitScreen } from './ui/SummitScreen';
import { TouchControls } from './ui/TouchControls';
import { getWorld } from './game/world';

declare global {
  interface Window {
    __summit?: unknown;
  }
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const phase = useGame((s) => s.phase);
  useDesktopControls(host);

  useEffect(() => {
    // Lightweight debug hooks for automated playtesting.
    window.__summit = { runtime, useGame, getWorld };
    const onVis = () => {
      if (document.hidden) useGame.getState().pause();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <div className={`app phase-${phase}`}>
      <div className="canvas-host" ref={host}>
        <GameCanvas />
      </div>
      {phase === 'prep' && <PrepScreen />}
      {(phase === 'playing' || phase === 'paused') && <HUD />}
      {phase === 'playing' && <TouchControls />}
      {phase === 'paused' && <PauseMenu />}
      {phase === 'summit' && <SummitScreen />}
    </div>
  );
}
