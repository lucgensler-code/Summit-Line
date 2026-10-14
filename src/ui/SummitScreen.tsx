import { useGame } from '../game/store';
import { SUMMIT_FT } from '../game/world';
import { fmtClock, fmtDuration, fmtInt } from './format';

export function SummitScreen() {
  const summary = useGame((s) => s.summary);
  const restart = useGame((s) => s.restart);
  const toTrailhead = useGame((s) => s.toTrailhead);
  if (!summary) return null;
  const s = summary;
  const mins = Math.floor(s.realSeconds / 60);
  const secs = Math.floor(s.realSeconds % 60);
  return (
    <div className="summit">
      <div className="achievement">
        <span className="ach-icon">▲</span>
        <div>
          <div className="ach-k">Summit reached</div>
          <div className="ach-v">Cindercrest · {fmtInt(SUMMIT_FT)} ft</div>
        </div>
      </div>
      <div className="summary-card">
        <div className="brand">SUMMIT LINE</div>
        <h2>{s.title}</h2>
        <p className="sub">
          Topped out at {fmtClock(s.finishHour)} after {fmtDuration(s.hours)} on the mountain.
        </p>
        <div className="summary-grid">
          <div>
            <span className="k">Climbing time</span>
            <span className="v">{fmtDuration(s.hours)}</span>
          </div>
          <div>
            <span className="k">Distance</span>
            <span className="v">{s.distMi.toFixed(2)} mi</span>
          </div>
          <div>
            <span className="k">Elevation gained</span>
            <span className="v">+{fmtInt(s.gainFt)} ft</span>
          </div>
          <div>
            <span className="k">Stamina left</span>
            <span className="v">
              {Math.round(s.stamina)}
              <small>/{Math.round(s.maxStamina)}</small>
            </span>
          </div>
          <div>
            <span className="k">On trail</span>
            <span className="v">{Math.round(s.trailPct * 100)}%</span>
          </div>
          <div>
            <span className="k">Supplies left</span>
            <span className="v">
              {s.water.toFixed(1)} L · {s.food} bars
            </span>
          </div>
        </div>
        <div className="splits">
          {s.splits.map((sp) => (
            <div key={sp.name} className="split">
              <span>{sp.name}</span>
              <b>{fmtDuration(sp.hours)}</b>
            </div>
          ))}
        </div>
        <p className="real">
          Real time {mins}:{secs.toString().padStart(2, '0')} · Hydration {Math.round(s.hydration)}%
        </p>
        <div className="menu row">
          <button type="button" className="btn primary" onClick={restart}>
            Climb again
          </button>
          <button type="button" className="btn" onClick={toTrailhead}>
            New expedition
          </button>
        </div>
      </div>
    </div>
  );
}
