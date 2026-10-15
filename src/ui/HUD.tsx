import { useEffect, useMemo, useState } from 'react';
import { queueAction } from '../game/input';
import { useGame, type HudSnapshot } from '../game/store';
import { getWorld } from '../game/world';
import { fmtClock, fmtDuration, fmtInt } from './format';
import { RouteProfile } from './RouteProfile';

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function Compass({ hud }: { hud: HudSnapshot }) {
  const W = getWorld();
  const heading = ((hud.heading * 180) / Math.PI + 360) % 360;
  const next = W.checkpoints.find((c) => !hud.checkpoints.includes(c.id));
  const bearingTo = (x: number, z: number) => ((Math.atan2(x - hud.x, -(z - hud.z)) * 180) / Math.PI + 360) % 360;
  const marks = useMemo(() => {
    const out: { deg: number; label: string; major: boolean }[] = [];
    for (let d = 0; d < 360; d += 15) out.push({ deg: d, label: d % 45 === 0 ? CARDINALS[d / 45] : '', major: d % 45 === 0 });
    return out;
  }, []);
  const SPAN = 120;
  const pos = (deg: number) => ((deg - heading + 540) % 360) - 180;
  const summitB = pos(bearingTo(W.summit.x, W.summit.z));
  const nextB = next && next.id !== 'summit' ? pos(bearingTo(next.x, next.z)) : null;
  return (
    <div className="compass" aria-label={`Heading ${Math.round(heading)} degrees`}>
      {marks.map((m) => {
        const d = pos(m.deg);
        if (Math.abs(d) > SPAN / 2) return null;
        return (
          <span key={m.deg} className={`tick ${m.major ? 'major' : ''}`} style={{ left: `${50 + (d / SPAN) * 100}%` }}>
            {m.label}
          </span>
        );
      })}
      {Math.abs(summitB) <= SPAN / 2 ? (
        <span className="poi summit" style={{ left: `${50 + (summitB / SPAN) * 100}%` }} title="Summit">
          ▲
        </span>
      ) : (
        <span className={`poi-edge ${summitB < 0 ? 'left' : 'right'}`}>{summitB < 0 ? '◂▲' : '▲▸'}</span>
      )}
      {nextB !== null && Math.abs(nextB) <= SPAN / 2 && (
        <span className="poi next" style={{ left: `${50 + (nextB / SPAN) * 100}%` }} title={next!.name}>
          ◆
        </span>
      )}
      <i className="compass-needle" />
    </div>
  );
}

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
  const hud = useGame((s) => s.hud);
  const toasts = useGame((s) => s.toasts);
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
  return (
    <div className={`hud ${phase === 'paused' ? 'dim' : ''}`}>
      <div
        className="vignette"
        style={{ opacity: Math.max(0, (30 - hud.stamina) / 30) * 0.9 + (hud.hydration < 20 ? 0.25 : 0) + (1 - hud.daylight) * 0.3 }}
      />
      {hud.boostLeft > 0 && <div className="boost-edge" />}

      <div className="hud-top">
        <button type="button" className="panel stats" onClick={() => setDetails((d) => !d)} aria-expanded={details} aria-label="Elevation and distance; tap for details">
          <span className="elev">
            {fmtInt(hud.elevFt)}
            <small>ft</small>
          </span>
          <span className="togo">{hud.remainMi.toFixed(1)} mi to summit</span>
          {details && (
            <span className="stat-grid">
              <span>Gained</span>
              <b>+{fmtInt(hud.gainFt)} ft</b>
              <span>Traveled</span>
              <b>{hud.distMi.toFixed(2)} mi</b>
              <span>Gems</span>
              <b>
                {hud.gemCount}/{hud.gemTotal}
              </b>
              <RouteProfile progress={hud.progress} width={170} height={38} reached={hud.checkpoints} />
            </span>
          )}
        </button>

        <div className="center-top">
          <Compass hud={hud} />
          <div className="objective" title={hud.objective}>
            {hud.objective}
          </div>
        <div className="hud-messages">
          {showHint && <div className="hint">Drag to look around · Pinch to zoom</div>}
          {reading && (
            <div className="reading">
              <h3>{reading.title}</h3>
              {reading.text.split('\n').map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          )}
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone}`}>
              {t.text}
            </div>
          ))}
        </div>
        </div>

        <div className="top-right">
          <div className="panel clock">
            <span className="time">
              {fmtClock(hud.clock)}
              {hud.resting && <em className="ff"> ▸▸</em>}
            </span>
            <span className="elapsed">{fmtDuration(hud.elapsed / 3600)} out</span>
            <span className={`terrain-chip ${hud.onTrail ? 'on' : 'off'}`}>{hud.postholing ? 'Deep snow' : hud.onTrail ? (hud.surface === 'Trail' ? 'On trail' : 'Boot track') : `Off trail · ${hud.surface}`}</span>
          </div>
          <div className="icon-col">
            <button type="button" className="icon-btn" onClick={() => setMapOpen(true)} aria-label="Open map (M)" title="Map (M)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 2.2 6 2v11.6l-6-2V6.2Z" fill="currentColor" />
              </svg>
            </button>
            <button type="button" className="icon-btn" onClick={pause} aria-label="Pause (Esc)" title="Pause (Esc)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="hud-bottom">
        <div className={`panel vitals ${greenFlash ? 'flash-green' : ''}`}>
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
          <div className="vstatus">
            {hud.exhausted ? <em className="bad">Exhausted — rest or eat</em> : hud.limiter ? <em>{hud.limiter}</em> : hud.resting ? <em>Resting · clock ×4</em> : null}
          </div>
          <div className="supplies-row">
            <button type="button" className="supply-btn" onClick={() => queueAction('drink')} aria-label={`Drink water, ${hud.water.toFixed(1)} litres left (Q)`}>
              💧 {hud.water.toFixed(1)}L<kbd>Q</kbd>
            </button>
            <button type="button" className="supply-btn" onClick={() => queueAction('eat')} aria-label={`Eat a trail bar, ${hud.food} left (E)`}>
              🍫 {hud.food}
              <kbd>E</kbd>
            </button>
            <button type="button" className={`supply-btn ${hud.resting ? 'active' : ''}`} onClick={() => queueAction('rest')} aria-label="Rest (R)">
              ⛺ Rest<kbd>R</kbd>
            </button>
          </div>
        </div>

        <div className="center-bottom">
          {hud.prompt && (
            <button type="button" className="prompt desktop-only" onClick={() => queueAction('interact')}>
              <kbd>Space</kbd> {hud.prompt}
            </button>
          )}
          {hud.boostLeft > 0 && (
            <div className="boost-chip desktop-only">
              <span>⚡ Speed boost</span>
              <b>{Math.ceil(hud.boostLeft)}s</b>
            </div>
          )}
        </div>

        <div className="keys-hint desktop-only">
          <span>
            <kbd>WASD</kbd> move <kbd>Shift</kbd> jog
          </span>
          <span>
            <kbd>Space</kbd> jump / act <kbd>M</kbd> map
          </span>
          <span>
            <kbd>Drag</kbd> look <kbd>Scroll</kbd> zoom
          </span>
        </div>
      </div>
    </div>
  );
}
