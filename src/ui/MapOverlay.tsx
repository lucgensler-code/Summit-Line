import { useEffect, useRef, useState } from 'react';
import { runtime, useGame } from '../game/store';
import { smoothstep } from '../game/noise';
import { HALF, LAKE, elevationFt, getWorld, heightAt, snowCover, unitsToMiles } from '../game/world';
import { fmtDistance, fmtElevation } from '../game/units';

// Base map: hillshaded hypsometric terrain rendered once from the real heightfield.
const BASE_RES = 360;
let baseCanvas: HTMLCanvasElement | null = null;

function lerpRGB(a: number[], b: number[], t: number) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function getBase() {
  if (baseCanvas) return baseCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = BASE_RES;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(BASE_RES, BASE_RES);
  const step = (HALF * 2) / BASE_RES;
  const forest = [70, 104, 62];
  const meadow = [150, 156, 96];
  const cinder = [150, 98, 76];
  const rock = [118, 108, 104];
  const snow = [244, 247, 250];
  for (let j = 0; j < BASE_RES; j++) {
    for (let i = 0; i < BASE_RES; i++) {
      const x = -HALF + (i + 0.5) * step;
      const z = -HALF + (j + 0.5) * step;
      const h = heightAt(x, z);
      const hx = heightAt(x + step, z) - h;
      const hz = heightAt(x, z + step) - h;
      const slope = Math.hypot(hx, hz) / step;
      let col = lerpRGB(forest, meadow, smoothstep(105, 135, h));
      col = lerpRGB(col, cinder, smoothstep(160, 190, h));
      col = lerpRGB(col, rock, smoothstep(0.9, 1.3, slope) * 0.6);
      col = lerpRGB(col, snow, smoothstep(0.3, 0.65, snowCover(x, z, h, slope)));
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r && h < LAKE.level) col = [58, 112, 140];
      // Hillshade, light from the north-west.
      const shade = 1 + (hx * 0.9 + hz * 0.9) / step * -0.55;
      // Contours every 20 units (~280 ft), index contour every 100.
      const band = Math.floor(h / 20);
      const contour = Math.floor(heightAt(x + step, z) / 20) !== band || Math.floor(heightAt(x, z + step) / 20) !== band;
      const index = contour && band % 5 === 0;
      const k = (j * BASE_RES + i) * 4;
      const cm = contour ? (index ? 0.72 : 0.86) : 1;
      img.data[k] = Math.min(255, col[0] * shade * cm);
      img.data[k + 1] = Math.min(255, col[1] * shade * cm);
      img.data[k + 2] = Math.min(255, col[2] * shade * cm);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  baseCanvas = c;
  return c;
}

const ZOOMS = [1, 2, 4];

export function MapOverlay() {
  const setMapOpen = useGame((s) => s.setMapOpen);
  const hud = useGame((s) => s.hud);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoomI, setZoomI] = useState(0);
  const [headingUp, setHeadingUp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyM') {
        e.preventDefault();
        e.stopPropagation();
        setMapOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setMapOpen]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const cv = canvas.current;
      const p = runtime.player;
      if (!cv || !p) return;
      const W = getWorld();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = cv.clientWidth;
      if (cv.width !== Math.round(size * dpr)) {
        cv.width = cv.height = Math.round(size * dpr);
      }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const zoom = ZOOMS[zoomI];
      // Whole-route view centres on the route; zoomed views follow the climber.
      const cx = zoom === 1 ? 10 : p.x;
      const cz = zoom === 1 ? 355 : p.z;
      const span = 960 / zoom; // world units across the map
      const s = size / span;
      const rot = headingUp ? p.heading - Math.PI : 0;
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.translate(-cx, -cz);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(getBase(), -HALF, -HALF, HALF * 2, HALF * 2);

      const line = (pts: { x: number; z: number }[], width: number, color: string, dash?: number[]) => {
        ctx.beginPath();
        pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.z) : ctx.moveTo(q.x, q.z)));
        ctx.lineWidth = width / s;
        ctx.strokeStyle = color;
        ctx.setLineDash(dash ? dash.map((d) => d / s) : []);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      };
      // trails
      for (const l of W.lines) {
        line(l.pts, 5, 'rgba(20,16,12,0.55)');
        line(l.pts, 2.6, l.main ? '#fff6e6' : '#e9dcc4', l.main ? undefined : [4, 4]);
      }
      // explored portion of the main route
      const explored = W.main.pts.filter((_, i) => W.main.s[i] <= p.maxProgress);
      if (explored.length > 1) line(explored, 3.4, '#f0a35e');

      const counter = (x: number, z: number, fn: () => void) => {
        ctx.save();
        ctx.translate(x, z);
        ctx.rotate(-rot);
        ctx.scale(1 / s, 1 / s);
        fn();
        ctx.restore();
      };
      // gems still out there
      for (const g of W.gems) {
        if (p.gems[g.id]) continue;
        counter(g.x, g.z, () => {
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = g.kind === 'green' ? '#2fe38a' : '#ff4d4d';
          ctx.strokeStyle = '#0d1218';
          ctx.lineWidth = 1.5;
          ctx.fillRect(-4, -4, 8, 8);
          ctx.strokeRect(-4, -4, 8, 8);
        });
      }
      // checkpoints + trailhead + summit
      const label = (text: string, dy = -12) => {
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(12,16,22,0.85)';
        ctx.strokeText(text, 0, dy);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, 0, dy);
      };
      counter(W.trailhead.x, W.trailhead.z, () => {
        ctx.fillStyle = '#2b6fd6';
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = '#fff';
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('P', 0, 4);
        label('Trailhead', -12);
      });
      for (const cp of W.checkpoints) {
        const reached = p.checkpoints[cp.id] !== undefined;
        counter(cp.x, cp.z, () => {
          if (cp.id === 'summit') {
            ctx.beginPath();
            ctx.moveTo(0, -9);
            ctx.lineTo(8, 6);
            ctx.lineTo(-8, 6);
            ctx.closePath();
            ctx.fillStyle = '#f0a35e';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#0d1218';
            ctx.stroke();
            label(`Summit ${fmtElevation(elevationFt(W.summit.y))}`, -14);
            return;
          }
          ctx.beginPath();
          ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = reached ? '#f0a35e' : '#0d1218';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#f0a35e';
          ctx.stroke();
          label(cp.name.replace('Obsidian Tarn Camp', 'Tarn Camp'));
        });
      }
      // player arrow
      counter(p.x, p.z, () => {
        ctx.rotate(Math.PI - p.heading + rot);
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(7.5, 8);
        ctx.lineTo(0, 4);
        ctx.lineTo(-7.5, 8);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#e8562a';
        ctx.stroke();
      });
      ctx.restore();

      // scale bar (0.5 mi or 0.25 mi)
      const mi = zoom >= 4 ? 0.1 : zoom >= 2 ? 0.25 : 0.5;
      const px = (mi / W.miPerUnit) * s;
      ctx.fillStyle = 'rgba(12,16,22,0.8)';
      ctx.fillRect(10, size - 30, px + 50, 20);
      ctx.fillStyle = '#fff';
      ctx.fillRect(16, size - 22, px, 4);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(fmtDistance(mi, mi < 0.2 ? 2 : 1), 22 + px, size - 16);
      // north arrow
      ctx.save();
      ctx.translate(size - 24, 28);
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(12,16,22,0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -2);
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(4, -7);
      ctx.lineTo(-4, -7);
      ctx.fill();
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [zoomI, headingUp]);

  const W = getWorld();
  return (
    <div className="map-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setMapOpen(false)}>
      <div className="map-sheet" role="dialog" aria-label="Expedition map">
        <header className="map-head">
          <div>
            <h2>Cindercrest · Climbers Trail</h2>
            {hud && (
              <p>
                {fmtElevation(hud.elevFt)} · {fmtDistance(hud.remainMi, 2)} to summit · {Math.round(hud.progress * 100)}% of route
              </p>
            )}
          </div>
          <button type="button" className="icon-btn close" onClick={() => setMapOpen(false)} aria-label="Close map">
            ✕
          </button>
        </header>
        <canvas ref={canvas} className="map-canvas" />
        <div className="map-tools">
          <div className="seg" role="group" aria-label="Zoom">
            {ZOOMS.map((z, i) => (
              <button type="button" key={z} className={i === zoomI ? 'on' : ''} onClick={() => setZoomI(i)}>
                {z === 1 ? 'Route' : `${z}×`}
              </button>
            ))}
          </div>
          <button type="button" className="seg-btn" onClick={() => setHeadingUp((h) => !h)} aria-pressed={headingUp}>
            {headingUp ? 'Heading up' : 'North up'}
          </button>
        </div>
        <ul className="map-legend">
          <li>
            <i className="lg-route" /> Trail
          </li>
          <li>
            <i className="lg-explored" /> Explored
          </li>
          <li>
            <i className="lg-gem green" /> Stamina gem
          </li>
          <li>
            <i className="lg-gem red" /> Speed gem
          </li>
          <li>{fmtDistance(unitsToMiles(W.main.length))} route</li>
        </ul>
      </div>
    </div>
  );
}
