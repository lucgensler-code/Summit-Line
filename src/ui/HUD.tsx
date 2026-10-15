import { useEffect, useState } from 'react';
import { queueAction } from '../game/input';
import { useGame } from '../game/store';
import { elevUnit, elevValue, fmtDistance, fmtTemp, fmtWaterShort, fmtWeight, fmtWind } from '../game/units';
import { fmtClock, fmtDuration } from './format';
import { MiniMap } from './MiniMap';
import { useUnits } from './useUnits';

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function Bar({ value, max = 100, cap, cls, label }: { value: number; max?: number; cap?: number; cls: string; label: string }) {
  return (
    <div className={`bar ${cls}`} role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
      {cap !== undefined && <i className="cap" style={{ left: `${(cap / max) * 100}%` }} />}
      <i className="fill" style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

function useFlash(at: number | undefined, ms = 900) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!at) return;
    setOn(true);
    const id = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(id);
  }, [at, ms]);
  return on;
}

export function HUD() {
  useUnits();
  const hud = useGame((s) => s.hud);
  const notice = useGame((s) => s.notice);
  const reading = useGame((s) => s.reading);
  const setReading = useGame((s) => s.setReading);
  const phase = useGame((s) => s.phase);
  const gemFlash = useGame((s) => s.gemFlash);
  const showHint = useGame((s) => s.showHint);
  const setMapOpen = useGame((s) => s.setMapOpen);
  const pause = useGame((s) => s.pause);
  const [details, setDetails] = useState(false);
  const greenFlash = useFlash(gemFlash?.kind === 'green' ? gemFlash.at : undefined);
  if (!hud) return null;
  const staminaLow = hud.stamina < 25;
  const deg = ((hud.heading * 180) / Math.PI + 360) % 360;
  const status = notice ? (
    <em key={notice.id} className={`notice ${notice.tone}`}>
      {notice.text}
    </em>
  ) : hud.exhausted ? (
    <em className="notice warn">Exhausted · drink, eat or rest</em>
  ) : hud.limiter ? (
    <em className="limiter">{hud.limiter}</em>
  ) : hud.resting ? (
    <em className="limiter">Resting · clock ×4</em>
  ) : null;

  return (
    <div className={`hud ${phase === 'paused' ? 'dim' : ''}`}>
      <div
        className="vignette"
        style={{ opacity: Math.max(0, (30 - hud.stamina) / 30) * 0.9 + (hud.hydration < 20 ? 0.25 : 0) + (1 - hud.daylight) * 0.25 }}
      />
      {hud.boostLeft > 0 && <div className="boost-edge" />}

      <div className="hud-top">
        {/* Navigation: mini-map + compass + elevation + distance + progress + objective */}
        <button type="button" className="panel nav" onClick={() => setMapOpen(true)} aria-label="Navigation — open the full map">
          <MiniMap size={78} />
          <span className="nav-text">
            <span className="elev">
              {elevValue(hud.elevFt)}
              <small>{elevUnit()}</small>
            </span>
            <span className="togo">{fmtDistance(hud.remainMi)} to summit</span>
            <span className="heading">
              {CARDINALS[Math.round(deg / 45) % 8]} {Math.round(deg)}°
            </span>
            <span className="progress" aria-label={`${Math.round(hud.progress * 100)}% of route`}>
              <i style={{ width: `${Math.max(2, hud.progress * 100)}%` }} />
            </span>
          </span>
          <span className="objective">{hud.objective}</span>
        </button>

        <div className="status">
          <button type="button" className="panel clock" onClick={() => setDetails((d) => !d)} aria-expanded={details} aria-label="Expedition time and conditions">
            <span className="time">
              {fmtClock(hud.clock)}
              {hud.resting && <em className="ff"> ▸▸</em>}
            </span>
            <i className={`trail-dot ${hud.onTrail ? 'on' : 'off'}`} title={hud.onTrail ? 'On trail' : 'Off trail'} />
          </button>
          <button type="button" className="pause-btn" onClick={pause} aria-label="Pause (Esc)" title="Pause (Esc)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 6h3v12H8zM13 6h3v12h-3z" fill="currentColor" />
            </svg>
          </button>
          {details && (
            <div className="panel status-details">
              <span>Elapsed</span>
              <b>{fmtDuration(hud.elapsed / 3600)}</b>
              <span>Terrain</span>
              <b>{hud.postholing ? 'Deep snow' : hud.onTrail ? (hud.surface === 'Trail' ? 'On trail' : 'Boot track') : `Off trail · ${hud.surface}`}</b>
              <span>Weather</span>
              <b>
                {fmtTemp(hud.tempF)} · {fmtWind(hud.windMph)}
              </b>
              {hud.snowSoft > 0.3 && (
                <>
                  <span>Snow</span>
                  <b className="warn">{hud.snowSoft > 0.7 ? 'Slushy' : 'Softening'}</b>
                </>
              )}
              <span>Pack</span>
              <b>{fmtWeight(hud.packKg)}</b>
              <span>Gems</span>
              <b>
                {hud.gemCount}/{hud.gemTotal}
              </b>
            </div>
          )}
        </div>
      </div>

      {(showHint || reading) && (
        <div className="hud-messages">
          {showHint && <div className="hint">Drag to look around · Pinch to zoom</div>}
          {reading && (
            <button type="button" className="reading" onClick={() => setReading(null)} aria-label="Close sign">
              <h3>{reading.title}</h3>
              {reading.text.split('\n').map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </button>
          )}
        </div>
      )}

      <div className="hud-bottom">
        <div className={`panel vitals ${greenFlash ? 'flash-green' : ''}`}>
          <div className="vstatus" aria-live="polite">
            {status}
          </div>
          <div className="vital-row">
            <span className="vlabel" aria-hidden="true">
              ⚡
            </span>
            <Bar value={hud.stamina} cap={hud.maxStamina} cls={`stamina ${staminaLow ? 'low' : ''}`} label="Stamina" />
            <span className="vnum">{Math.round(hud.stamina)}</span>
          </div>
          <div className="vital-row">
            <span className="vlabel" aria-hidden="true">
              💧
            </span>
            <Bar value={hud.hydration} cls={`hydration ${hud.hydration < 35 ? 'low' : ''}`} label="Hydration" />
            <span className="vnum">{Math.round(hud.hydration)}</span>
          </div>
          <div className="supplies-row">
            <button type="button" className={`supply-btn ${hud.consumeKind === 'drink' ? 'using' : ''}`} onClick={() => queueAction('drink')} aria-label="Drink water (Q)">
              💧 {fmtWaterShort(hud.water)}
              <kbd>Q</kbd>
            </button>
            <button type="button" className={`supply-btn ${hud.consumeKind === 'eat' ? 'using' : ''}`} onClick={() => queueAction('eat')} aria-label={`Eat a trail bar, ${hud.food} left (E)`}>
              🍫 {hud.food}
              <kbd>E</kbd>
            </button>
            <button type="button" className={`supply-btn ${hud.resting ? 'active' : ''}`} onClick={() => queueAction('rest')} aria-label="Rest (R)">
              ⛺ Rest<kbd>R</kbd>
            </button>
          </div>
        </div>

        <div className="center-bottom desktop-only">
          {hud.prompt && (
            <button type="button" className="prompt" onClick={() => queueAction('interact')}>
              <kbd>Space</kbd> {hud.prompt}
            </button>
          )}
          {hud.boostLeft > 0 && (
            <div className="boost-chip">
              <span>⚡ Speed boost</span>
              <b>{Math.ceil(hud.boostLeft)}s</b>
            </div>
          )}
        </div>

        <div className="keys-hint desktop-only">
          <span>
            <kbd>WASD</kbd> move <kbd>Shift</kbd> jog <kbd>Space</kbd> jump/act
          </span>
          <span>
            <kbd>E</kbd> eat <kbd>Q</kbd> drink <kbd>R</kbd> rest <kbd>M</kbd> map
          </span>
        </div>
      </div>
    </div>
  );
}
