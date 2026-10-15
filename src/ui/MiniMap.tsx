import { useEffect, useRef } from 'react';
import { runtime } from '../game/store';
import { HALF, getWorld } from '../game/world';
import { getBase } from './MapOverlay';

const CARD = ['N', 'E', 'S', 'W'];

/**
 * Heading-up navigation disc: real terrain + trail around the climber, the compass ring (N/E/S/W
 * rotate as you turn), the summit bearing and the next checkpoint. Uses world coordinates.
 */
export function MiniMap({ size = 84 }: { size?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 90) return;
      last = now;
      const c = cv.current;
      const p = runtime.player;
      if (!c || !p) return;
      const W = getWorld();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== size * dpr) c.width = c.height = size * dpr;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const R = size / 2;
      const span = 150; // world units across
      const s = size / span;
      const yaw = runtime.cam.yaw;
      // Rotate so the camera's view direction points up.
      const rot = -Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(R, R);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.translate(-p.x, -p.z);
      ctx.drawImage(getBase(), -HALF, -HALF, HALF * 2, HALF * 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const l of W.lines) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < l.pts.length; i++) {
          const q = l.pts[i];
          if (Math.abs(q.x - p.x) > span || Math.abs(q.z - p.z) > span) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(q.x, q.z);
            started = true;
          } else ctx.lineTo(q.x, q.z);
        }
        ctx.lineWidth = 4 / s;
        ctx.strokeStyle = 'rgba(20,14,8,0.6)';
        ctx.stroke();
        ctx.lineWidth = 2.2 / s;
        ctx.strokeStyle = l.main ? '#fff4e0' : '#e6d6bb';
        ctx.stroke();
      }
      for (const g of W.gems) {
        if (p.gems[g.id] || Math.abs(g.x - p.x) > span || Math.abs(g.z - p.z) > span) continue;
        ctx.fillStyle = g.kind === 'green' ? '#2fe38a' : '#ff4d4d';
        ctx.beginPath();
        ctx.arc(g.x, g.z, 2.6 / s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Player arrow (heading relative to view).
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(rot + Math.PI - p.heading);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#e8562a';
      ctx.stroke();
      ctx.restore();
      // Compass ring
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(R, R, R - 1.5, 0, Math.PI * 2);
      ctx.stroke();
      const rim = (bearing: number, draw: (x: number, y: number) => void) => {
        // bearing: radians clockwise from north
        const a = rot - Math.PI / 2 + bearing;
        draw(R + Math.cos(a) * (R - 9), R + Math.sin(a) * (R - 9));
      };
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      CARD.forEach((t, i) =>
        rim((i * Math.PI) / 2, (x, y) => {
          ctx.fillStyle = 'rgba(10,14,20,0.75)';
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = t === 'N' ? '#ff8a6a' : '#ffffff';
          ctx.fillText(t, x, y + 0.5);
        }),
      );
      // Summit bearing marker on the rim
      const sb = Math.atan2(W.summit.x - p.x, -(W.summit.z - p.z));
      rim(sb, (x, y) => {
        ctx.fillStyle = '#f0a35e';
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 4.5, y + 3.5);
        ctx.lineTo(x - 4.5, y + 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1b1208';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={cv} className="minimap" style={{ width: size, height: size }} aria-hidden="true" />;
}
