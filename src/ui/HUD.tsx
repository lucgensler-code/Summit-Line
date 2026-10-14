import { useMemo } from 'react';
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
  const SPAN = 120; // degrees visible
  const pos = (deg: number) => {
    let d = deg - heading;
    d = ((d + 540) % 360) - 180;
    return d;
  };
  const summitB = pos(bearingTo(W.summit.x, W.summit.z));
  const nextB = next && next.id !== 'summit' ? pos(bearingTo(next.x, next.z)) : null;
  return (
    <div className="compass" aria-label={`Heading ${Math.round(heading)} degrees`}>
      <div className="compass-strip">
        {marks.map((m) => {
          const d = pos(m.deg);
          if (Math.abs(d) > SPAN / 2) return null;
          return (
            <span key={m.deg} className={`tick ${m.major ? 'major' : ''}`} style={{ left: `${50 + (d / SPAN) * 100}%` }}>
              {m.label}
            </span>
          );
        })}
        {Math.abs(summitB) <= SPAN / 2 && (
          <span className="poi summit" style={{ left: `${50 + (summitB / SPAN) * 100}%` }} title="Summit">
            ▲
          </span>
        )}
        {nextB !== null && Math.abs(nextB) <= SPAN / 2 && (
          <span className="poi next" style={{ left: `${50 + (nextB / SPAN) * 100}%` }} title={next!.name}>
            ◆
          </span>
        )}
        {Math.abs(summitB) > SPAN / 2 && <span className={`poi-edge ${summitB < 0 ? 'left' : 'right'}`}>▲</span>}
      </div>
      <div className="compass-needle" />
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

export function HUD() {
  const hud = useGame((s) => s.hud);
  const toasts = useGame((s) => s.toasts);
  const reading = useGame((s) => s.reading);
  const phase = useGame((s) => s.phase);
  if (!hud) return null;
  const staminaLow = hud.stamina < 25;
  return (
    <div className={`hud ${phase === 'paused' ? 'dim' : ''}`}>
      <div
        className="vignette"
        style={{ opacity: Math.max(0, (30 - hud.stamina) / 30) * 0.9 + (hud.hydration < 20 ? 0.25 : 0) + (1 - hud.daylight) * 0.35 }}
      />
      <div className="hud-top">
        <div className="panel stats">
          <div className="elev">
            <span className="big">{fmtInt(hud.elevFt)}</span>
            <span className="unit">ft</span>
          </div>
          <div className="stat-grid">
            <span>Gained</span>
            <b>+{fmtInt(hud.gainFt)} ft</b>
            <span>Traveled</span>
            <b>{hud.distMi.toFixed(2)} mi</b>
            <span>To summit</span>
            <b>{hud.remainMi.toFixed(2)} mi</b>
          </div>
          <RouteProfile progress={hud.progress} width={208} height={46} reached={hud.checkpoints} />
        </div>

        <div className="center-top">
          <Compass hud={hud} />
          <div className="objective">
            <span className="tag">Objective</span>
            {hud.objective}
          </div>
        </div>

        <div className="panel clock">
          <div className="time">{fmtClock(hud.clock)}</div>
          <div className="elapsed">Elapsed {fmtDuration(hud.elapsed / 3600)}</div>
          <div className={`terrain-chip ${hud.onTrail ? 'on' : 'off'}`}>{hud.onTrail ? '● On trail' : '○ Off trail'}</div>
          <div className="surface">{hud.postholing ? 'Postholing — deep snow' : hud.surface}</div>
          {hud.snowSoft > 0.3 && <div className="surface warn">Snow: {hud.snowSoft > 0.7 ? 'slushy' : 'softening'}</div>}
        </div>
      </div>

      <div className="hud-bottom">
        <div className="panel vitals">
          <div className="vital">
            <span className="vlabel">
              Stamina {hud.exhausted && <em className="warn">EXHAUSTED</em>}
              {hud.resting && <em>resting</em>}
            </span>
            <Bar value={hud.stamina} cap={hud.maxStamina} cls={`stamina ${staminaLow ? 'low' : ''}`} label="Stamina" />
          </div>
          <div className="vital">
            <span className="vlabel">Hydration</span>
            <Bar value={hud.hydration} cls={`hydration ${hud.hydration < 30 ? 'low' : ''}`} label="Hydration" />
          </div>
          <div className="supplies-row">
            <button type="button" className="supply-btn" onClick={() => queueAction('drink')} title="Drink (Q)">
              <span className="ico">💧</span>
              {hud.water.toFixed(1)} L<kbd>Q</kbd>
            </button>
            <button type="button" className="supply-btn" onClick={() => queueAction('eat')} title="Eat (E)">
              <span className="ico">🍫</span>
              {hud.food}
              <kbd>E</kbd>
            </button>
            <button type="button" className={`supply-btn ${hud.resting ? 'active' : ''}`} onClick={() => queueAction('rest')} title="Rest (R)">
              <span className="ico">⛺</span>
              Rest<kbd>R</kbd>
            </button>
            <span className="pack">{hud.packKg.toFixed(1)} kg</span>
          </div>
        </div>

        <div className="center-bottom">
          {reading && (
            <div className="reading">
              <h3>{reading.title}</h3>
              {reading.text.split('\n').map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          )}
          {hud.prompt && (
            <button type="button" className="prompt" onClick={() => queueAction('interact')}>
              <kbd>Space</kbd> {hud.prompt}
            </button>
          )}
          <div className="toasts">
            {toasts.map((t) => (
              <div key={t.id} className={`toast ${t.tone}`}>
                {t.text}
              </div>
            ))}
          </div>
        </div>

        <div className="keys-hint">
          <span>
            <kbd>WASD</kbd> move
          </span>
          <span>
            <kbd>Shift</kbd> jog
          </span>
          <span>
            <kbd>Drag</kbd> look
          </span>
          <span>
            <kbd>Esc</kbd> pause
          </span>
        </div>
      </div>
    </div>
  );
}
