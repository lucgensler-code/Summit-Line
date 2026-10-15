import { useEffect, useState } from 'react';
import { BEST_LABEL } from '../game/records';
import { ACTIVE_MOUNTAIN } from '../game/routes';
import { useGame } from '../game/store';
import { SUMMIT_FT } from '../game/world';
import { fmtReal } from './ExpeditionLog';
import { fmtClock, fmtDuration, fmtInt } from './format';
import { CameraGestures, isTouchDevice } from './TouchControls';

export function SummitScreen() {
  const summary = useGame((s) => s.summary);
  const restart = useGame((s) => s.restart);
  const toTrailhead = useGame((s) => s.toTrailhead);
  const viewMode = useGame((s) => s.viewMode);
  const setViewMode = useGame((s) => s.setViewMode);
  const setLogOpen = useGame((s) => s.setLogOpen);
  const [showSplits, setShowSplits] = useState(false);
  const [banner, setBanner] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [touch] = useState(isTouchDevice);
  useEffect(() => {
    // Let the moment breathe: banner first, the summary slides in once the camera has pulled back.
    const a = setTimeout(() => setSheet(true), 4200);
    const b = setTimeout(() => setBanner(false), 7000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  if (!summary) return null;
  const s = summary;
  return (
    <div className={`summit ${viewMode ? 'view' : ''}`}>
      {touch && <CameraGestures />}
      {banner && !viewMode && (
        <div className="achievement" role="status">
          <span className="ach-icon">▲</span>
          <div>
            <div className="ach-k">Summit reached</div>
            <div className="ach-v">
              {ACTIVE_MOUNTAIN.name} · {fmtInt(SUMMIT_FT)} ft
            </div>
          </div>
        </div>
      )}
      {viewMode ? (
        <div className="view-controls">
          <span className="view-hint">{touch ? 'Drag to orbit · Pinch to zoom' : 'Drag to orbit · Scroll to zoom'}</span>
          <button type="button" className="pill-btn" onClick={() => setViewMode(false)}>
            Show summary
          </button>
        </div>
      ) : (
        sheet && (
          <section className="summary-card" aria-label="Expedition summary">
            <header className="sum-head">
              <div>
                <div className="brand">CLIMB #{s.climbNumber}</div>
                <h2>{s.title}</h2>
                <p className="sub">
                  Topped out at {fmtClock(s.finishHour)} · {fmtDuration(s.hours)} on the mountain · {fmtReal(s.realSeconds)} real time
                </p>
              </div>
            </header>
            {s.bests.length > 0 && (
              <div className="pb-badges">
                {s.bests.map((b) => (
                  <span key={b} className="pb-badge">
                    ★ New best · {BEST_LABEL[b]}
                  </span>
                ))}
              </div>
            )}
            <div className="summary-grid">
              <div>
                <span className="k">Distance</span>
                <span className="v">{s.distMi.toFixed(2)} mi</span>
              </div>
              <div>
                <span className="k">Gained</span>
                <span className="v">+{fmtInt(s.gainFt)} ft</span>
              </div>
              <div>
                <span className="k">On trail</span>
                <span className="v">{Math.round(s.trailPct * 100)}%</span>
              </div>
              <div>
                <span className="k">Stamina</span>
                <span className="v">
                  {Math.round(s.stamina)}
                  <small>/{Math.round(s.maxStamina)}</small>
                </span>
              </div>
              <div>
                <span className="k">Supplies left</span>
                <span className="v">
                  {s.water.toFixed(1)} L · {s.food} bars
                </span>
              </div>
              <div>
                <span className="k">Gems</span>
                <span className="v">
                  {s.gems.total}
                  <small>/{s.gems.available}</small> <span className="gem-dot green">◆</span>
                  {s.gems.green} <span className="gem-dot red">◆</span>
                  {s.gems.red}
                </span>
              </div>
            </div>
            <button type="button" className="splits-toggle" onClick={() => setShowSplits((v) => !v)} aria-expanded={showSplits}>
              Checkpoint times {showSplits ? '▴' : '▾'}
            </button>
            {showSplits && (
              <div className="splits">
                {s.splits.map((sp) => (
                  <div key={sp.name} className="split">
                    <span>{sp.name}</span>
                    <b>{fmtDuration(sp.hours)}</b>
                  </div>
                ))}
              </div>
            )}
            <div className="sum-actions">
              <button type="button" className="btn view" onClick={() => setViewMode(true)}>
                Enjoy the View
              </button>
              <button type="button" className="btn primary" onClick={restart}>
                Climb again
              </button>
              <button type="button" className="btn" onClick={toTrailhead}>
                New expedition
              </button>
              <button type="button" className="btn subtle" onClick={() => setLogOpen(true)}>
                Expedition log
              </button>
            </div>
          </section>
        )
      )}
    </div>
  );
}
