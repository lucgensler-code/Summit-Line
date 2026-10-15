import { useEffect, useState } from 'react';
import { input, keysSwapped, queueAction } from '../game/input';
import { useGame } from '../game/store';
import { elevUnit, elevValue, fmtDistance, fmtShortDistance, fmtTemp, fmtWaterShort, fmtWeight, fmtWind } from '../game/units';
import { fmtReal } from './ExpeditionLog';
import { IconArrow, IconBar, IconBolt, IconBottle, IconClock, IconDrop, IconRecenter, IconRest, IconTimer } from './icons';
import { Modal } from './Modal';
import { isTouchDevice } from './TouchControls';
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

const TRAIL_LABEL = { on: 'On trail', near: 'Near trail', off: 'Off route' } as const;

export function HUD() {
  useUnits();
  const hud = useGame((s) => s.hud);
  const notice = useGame((s) => s.notice);
  const reading = useGame((s) => s.reading);
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
  // One notification slot: queued notices first, then persistent conditions.
  const status = notice ? (
    <div key={notice.id} className={`notice ${notice.tone}`} role="status">
      {notice.text}
    </div>
  ) : hud.exhausted ? (
    <div className="notice warn">Exhausted · drink, eat or rest</div>
  ) : hud.resting ? (
    <div className="notice calm">Resting · clock ×4</div>
  ) : hud.limiter ? (
    <div className="notice calm">{hud.limiter}</div>
  ) : null;

  return (
    <div className={`hud ${phase === 'paused' ? 'dim' : ''}`}>
      <div
        className="vignette"
        style={{ opacity: Math.max(0, (30 - hud.stamina) / 30) * 0.9 + (hud.hydration < 20 ? 0.25 : 0) + (1 - hud.daylight) * 0.25 }}
      />
      {hud.boostLeft > 0 && <div className="boost-edge" />}

      <div className="hud-top">
        {/* Primary: minimap + where am I + elevation + trail status */}
        <button type="button" className={`panel nav trail-${hud.trailState}`} onClick={() => setMapOpen(true)} aria-label="Navigation — open the full map (M)">
          <MiniMap size={72} />
          <span className="nav-text">
            <span className="place">{hud.place}</span>
            <span className="elev">
              {elevValue(hud.elevFt)}
              <small>{elevUnit()}</small>
              <em>{fmtDistance(hud.remainMi)} to go</em>
            </span>
            <span className={`trail-chip ${hud.trailState}`}>
              <i />
              {TRAIL_LABEL[hud.trailState]}
              {hud.guide && hud.trailState !== 'on' && (
                <span className="guide">
                  · trail {fmtShortDistance(hud.guide.distFt)} <IconArrow deg={hud.guide.rel} /> {hud.guide.card}
                </span>
              )}
            </span>
          </span>
          <span className="progress" aria-label={`${Math.round(hud.progress * 100)}% of route`}>
            <i style={{ width: `${Math.max(2, hud.progress * 100)}%` }} />
          </span>
        </button>

        <div className="status">
          <div className="status-row">
            <button type="button" className="panel clock" onClick={() => setDetails((d) => !d)} aria-expanded={details} aria-label="Expedition clock, real time and conditions">
              <span className="sim-time" title="Expedition clock (simulated)">
                <IconClock size={13} />
                {fmtClock(hud.clock)}
                {hud.resting && <em className="ff">×4</em>}
              </span>
              <span className="real-time" title="Real time played">
                <IconTimer size={12} />
                {fmtReal(hud.realSeconds)}
              </span>
            </button>
            <button type="button" className="hud-icon" onClick={() => (input.recenter = true)} aria-label="Recenter camera (C)" title="Recenter camera (C)">
              <IconRecenter size={18} />
            </button>
            <button type="button" className="hud-icon" onClick={pause} aria-label="Pause (Esc)" title="Pause (Esc)">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
              </svg>
            </button>
          </div>
          <div className="conditions">
            {CARDINALS[Math.round(deg / 45) % 8]} {Math.round(deg)}° · {fmtTemp(hud.tempF)} · {fmtWind(hud.windMph)}
          </div>
          {details && (
            <div className="panel status-details">
              <span>Expedition time</span>
              <b>{fmtDuration(hud.elapsed / 3600)}</b>
              <span>Real time</span>
              <b>{fmtReal(hud.realSeconds)}</b>
              <span>Terrain</span>
              <b>{hud.postholing ? 'Deep snow' : hud.onTrail ? (hud.surface === 'Trail' ? 'On trail' : 'Boot track') : `Off trail · ${hud.surface}`}</b>
              <span>Weather</span>
              <b>{hud.weather}</b>
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

      <div className="hud-messages">
        {status}
        {!status && <div className="objective">{hud.objective}</div>}
        {showHint && !reading && <div className="hint">{isTouchDevice() ? 'Drag to look around · Pinch to zoom' : 'Arrow keys or drag to look · Scroll or +/− to zoom'}</div>}
      </div>

      <div className="hud-bottom">
        <div className={`panel vitals ${greenFlash ? 'flash-green' : ''}`}>
          <div className="vital-row" title="Stamina — the striped end is energy you've burned; eat to restore it">
            <span className="vlabel stamina">
              <IconBolt size={14} />
            </span>
            <Bar value={hud.stamina} cap={hud.maxStamina} cls={`stamina ${staminaLow ? 'low' : ''}`} label="Stamina" />
            <span className="vnum">{Math.round(hud.stamina)}</span>
          </div>
          <div className="vital-row" title="Hydration — low hydration slows stamina recovery">
            <span className="vlabel hydration">
              <IconDrop size={14} />
            </span>
            <Bar value={hud.hydration} cls={`hydration ${hud.hydration < 35 ? 'low' : ''}`} label="Hydration" />
            <span className="vnum">{Math.round(hud.hydration)}</span>
          </div>
          <div className="supplies-row">
            <button
              type="button"
              className={`supply-btn ${hud.consumeKind === 'drink' ? 'using' : ''}`}
              onClick={() => queueAction('drink')}
              disabled={hud.water <= 0.01}
              aria-label={`Drink water, ${fmtWaterShort(hud.water)} left (Q)`}
              title="Drink: +hydration and a little stamina (Q)"
            >
              <IconBottle size={15} />
              <span>{fmtWaterShort(hud.water)}</span>
              <kbd>Q</kbd>
            </button>
            <button
              type="button"
              className={`supply-btn ${hud.consumeKind === 'eat' ? 'using' : ''}`}
              onClick={() => queueAction('eat')}
              disabled={hud.food <= 0}
              aria-label={`Eat a trail bar, ${hud.food} left (E)`}
              title="Eat: restores burned energy (striped bar) and some stamina (E)"
            >
              <IconBar size={15} />
              <span>×{hud.food}</span>
              <kbd>E</kbd>
            </button>
            <button type="button" className={`supply-btn ${hud.resting ? 'active' : ''}`} onClick={() => queueAction('rest')} aria-label="Rest (R)" title="Rest: fast stamina recovery, clock runs ×4 (R)">
              <IconRest size={15} />
              <span>Rest</span>
              <kbd>R</kbd>
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
              <IconBolt size={13} />
              <span>Speed boost</span>
              <b>{Math.ceil(hud.boostLeft)}s</b>
            </div>
          )}
        </div>

        <div className="keys-hint desktop-only">
          <span>
            <kbd>{keysSwapped() ? '↑←↓→' : 'WASD'}</kbd> move <kbd>Shift</kbd> run <kbd>Space</kbd> act/rest/jump
          </span>
          <span>
            <kbd>{keysSwapped() ? 'WASD' : '↑←↓→'}</kbd> camera <kbd>+ −</kbd> zoom <kbd>C</kbd> recenter <kbd>M</kbd> map
          </span>
        </div>
      </div>
      {reading && <SignModal />}
    </div>
  );
}

/** Trailhead kiosk / trail signs: a proper dialog; the expedition clock is paused while it's open. */
function SignModal() {
  const reading = useGame((s) => s.reading);
  const setReading = useGame((s) => s.setReading);
  if (!reading) return null;
  return (
    <Modal onClose={() => setReading(null)} label={reading.title} className="sign">
      <div className="sign-k">Clock paused while reading</div>
      <h2>{reading.title}</h2>
      {reading.text.split('\n').map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      <button type="button" className="btn primary" onClick={() => setReading(null)}>
        Continue
      </button>
    </Modal>
  );
}
