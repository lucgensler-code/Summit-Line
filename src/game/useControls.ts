import { useEffect } from 'react';
import { isMuted, setMuted } from './audio';
import { input, queueAction } from './input';
import { useGame } from './store';

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'Space',
]);

/** Desktop keyboard + mouse controls. Pointer drag on the canvas rotates the camera. */
export function useDesktopControls(canvasHost: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const g = useGame.getState();
      const target = e.target as HTMLElement | null;
      if (g.phase !== 'playing' && target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON') && e.code === 'Space') return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && !g.mapOpen) {
        if (g.phase === 'playing') g.pause();
        else if (g.phase === 'paused') g.resume();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyM' && g.phase === 'playing') {
        if (!g.mapOpen) g.setMapOpen(true);
        return;
      }
      if (e.code === 'KeyN') {
        setMuted(!isMuted());
        g.toast(isMuted() ? 'Sound off' : 'Sound on');
        return;
      }
      if (g.mapOpen) return;
      if (g.phase !== 'playing') return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      input.keys.add(e.code);
      if (e.code === 'Space') queueAction('interact');
      if (e.code === 'KeyE') queueAction('eat');
      if (e.code === 'KeyQ') queueAction('drink');
      if (e.code === 'KeyR') queueAction('rest');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      input.keys.delete(e.code);
    };
    const onBlur = () => input.keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const host = canvasHost.current;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // touch handled by TouchControls
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      host?.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      input.lookDX += e.clientX - lx;
      input.lookDY += e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (host?.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      input.zoom += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) / 120;
      e.preventDefault();
    };
    host?.addEventListener('pointerdown', onDown);
    host?.addEventListener('pointermove', onMove);
    host?.addEventListener('pointerup', onUp);
    host?.addEventListener('pointercancel', onUp);
    host?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      host?.removeEventListener('pointerdown', onDown);
      host?.removeEventListener('pointermove', onMove);
      host?.removeEventListener('pointerup', onUp);
      host?.removeEventListener('pointercancel', onUp);
      host?.removeEventListener('wheel', onWheel);
    };
  }, [canvasHost]);
}
