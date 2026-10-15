import { prepDrag } from './prepOrbit';
import { useEffect } from 'react';
import { isMuted, setMuted } from './audio';
import { input, queueAction } from './input';
import { useGame } from './store';

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);

/** Map +/- (and = / _ / numpad) to virtual zoom keys, independent of keyboard layout. */
function zoomKey(e: KeyboardEvent): 'ZoomIn' | 'ZoomOut' | null {
  if (e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') return 'ZoomIn';
  if (e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_') return 'ZoomOut';
  return null;
}

/**
 * Desktop keyboard + mouse. Default: WASD moves, arrow keys steer the camera (swappable in the
 * pause menu), +/- or the wheel zoom, C recenters, Space acts (or rests when standing still),
 * Shift runs. Nothing fires while a text field has focus.
 */
export function useDesktopControls(canvasHost: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const g = useGame.getState();
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (g.phase !== 'playing' && target && target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
      const overlay = g.mapOpen || g.logOpen || g.registerOpen || g.lbOpen || !!g.reading;
      if ((e.code === 'Escape' || e.code === 'KeyP') && !overlay) {
        if (g.phase === 'playing') g.pause();
        else if (g.phase === 'paused') g.resume();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyN') {
        setMuted(!isMuted());
        g.toast(isMuted() ? 'Sound off' : 'Sound on');
        return;
      }
      const z = zoomKey(e);
      if (z && (g.phase === 'playing' || g.phase === 'summit') && !overlay) {
        input.keys.add(z);
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyM' && g.phase === 'playing' && !overlay) {
        g.setMapOpen(true);
        return;
      }
      if (overlay || g.phase !== 'playing') return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      input.keys.add(e.code);
      if (e.code === 'Space') queueAction('primary');
      if (e.code === 'KeyF') queueAction('interact');
      if (e.code === 'KeyJ') queueAction('jump');
      if (e.code === 'KeyE') queueAction('eat');
      if (e.code === 'KeyQ') queueAction('drink');
      if (e.code === 'KeyR') queueAction('rest');
      if (e.code === 'KeyC') input.recenter = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      input.keys.delete(e.code);
      const z = zoomKey(e);
      if (z) input.keys.delete(z);
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
      // Touch is handled by the gesture layer while climbing; on the home screen any pointer spins the mountain.
      if (e.pointerType === 'touch' && useGame.getState().phase !== 'prep') return;
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      host?.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      if (useGame.getState().phase === 'prep') prepDrag(e.clientX - lx);
      else input.lookDX += e.clientX - lx;
      input.lookDY += e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (host?.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      input.zoom += (Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120)) / 120;
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
