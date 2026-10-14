import { BASE_PACK_KG, GEAR, packWeight, type Loadout } from '../game/sim';
import { useGame } from '../game/store';
import { ROUTE_MILES, SUMMIT_FT, TRAILHEAD_FT } from '../game/world';
import { fmtInt } from './format';
import { RouteProfile } from './RouteProfile';

const DEPARTURES: { hour: number; label: string; time: string; notes: string[] }[] = [
  { hour: 4.5, label: 'Alpine start', time: '4:30 AM', notes: ['Dark first hour', 'Firm, fast snow', 'Cold — bring layers'] },
  { hour: 7, label: 'Sunrise start', time: '7:00 AM', notes: ['Golden light', 'Snow softens near summit', 'Balanced'] },
  { hour: 10, label: 'Late start', time: '10:00 AM', notes: ['Warm & bright', 'Soft, deep snow', 'Thirsty afternoon'] },
];

function packClass(kg: number) {
  if (kg < 10) return { label: 'Light', cls: 'ok' };
  if (kg < 12.5) return { label: 'Moderate', cls: 'mid' };
  return { label: 'Heavy', cls: 'heavy' };
}

function Stepper({ value, min, max, step, onChange, unit, fmt }: { value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`less ${unit}`} disabled={value <= min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>
        −
      </button>
      <span>
        {fmt ? fmt(value) : value} <small>{unit}</small>
      </span>
      <button type="button" aria-label={`more ${unit}`} disabled={value >= max} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>
        +
      </button>
    </div>
  );
}

export function PrepScreen() {
  const loadout = useGame((s) => s.loadout);
  const setLoadout = useGame((s) => s.setLoadout);
  const start = useGame((s) => s.start);
  const kg = packWeight(loadout);
  const pc = packClass(kg);
  const speedPenalty = Math.max(0, kg - 9) * 1.2;
  const effortPenalty = Math.max(0, kg - 8) * 3.5;

  return (
    <div className="prep">
      <div className="prep-panel">
        <header className="prep-head">
          <div className="brand">SUMMIT LINE</div>
          <h1>Cindercrest</h1>
          <p className="sub">Cascade Range volcano · {fmtInt(SUMMIT_FT)} ft</p>
          <p className="blurb">
            A broad cinder cone with a snow-filled summit crater. The Climbers Trail winds through old-growth hemlock, past an alpine tarn,
            then switchbacks up loose volcanic scree to the crater rim. Non-technical, but long and relentless.
          </p>
        </header>

        <section className="route-card">
          <div className="route-stats">
            <div>
              <span className="k">Distance</span>
              <span className="v">{ROUTE_MILES.toFixed(1)} mi</span>
            </div>
            <div>
              <span className="k">Elevation gain</span>
              <span className="v">+{fmtInt(SUMMIT_FT - TRAILHEAD_FT)} ft</span>
            </div>
            <div>
              <span className="k">Trailhead</span>
              <span className="v">{fmtInt(TRAILHEAD_FT)} ft</span>
            </div>
            <div>
              <span className="k">Est. time</span>
              <span className="v">4–6 h</span>
            </div>
          </div>
          <RouteProfile width={372} height={92} labels />
          <p className="forecast">
            <b>Forecast:</b> clear, light westerly winds. Snow firm until mid‑morning, softening above 8,500 ft after 10 AM. Last water at Obsidian Tarn.
          </p>
        </section>

        <section>
          <h2>Departure time</h2>
          <div className="choice-row">
            {DEPARTURES.map((d) => (
              <button
                type="button"
                key={d.hour}
                className={`choice ${loadout.departureHour === d.hour ? 'selected' : ''}`}
                onClick={() => setLoadout({ departureHour: d.hour })}
              >
                <span className="time">{d.time}</span>
                <span className="label">{d.label}</span>
                <ul>
                  {d.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Equipment</h2>
          <div className="gear-grid">
            {(Object.keys(GEAR) as (keyof typeof GEAR)[]).map((key) => {
              const item = GEAR[key];
              const on = loadout[key as keyof Loadout] as boolean;
              return (
                <button type="button" key={key} className={`gear ${on ? 'on' : ''}`} onClick={() => setLoadout({ [key]: !on } as Partial<Loadout>)} aria-pressed={on}>
                  <span className="check">{on ? '✓' : ''}</span>
                  <span className="gname">{item.label}</span>
                  <span className="gkg">{item.kg.toFixed(2)} kg</span>
                  <span className="gdesc">{item.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2>Supplies</h2>
          <div className="supplies">
            <div className="supply">
              <div>
                <b>Water</b>
                <small>0.5 L per drink · refill at the tarn</small>
              </div>
              <Stepper value={loadout.waterL} min={0.5} max={4} step={0.5} unit="L" onChange={(v) => setLoadout({ waterL: v })} fmt={(v) => v.toFixed(1)} />
            </div>
            <div className="supply">
              <div>
                <b>Food</b>
                <small>trail bars restore energy reserves</small>
              </div>
              <Stepper value={loadout.food} min={0} max={8} step={1} unit="bars" onChange={(v) => setLoadout({ food: v })} />
            </div>
          </div>
          <div className={`pack-meter ${pc.cls}`}>
            <div className="pack-row">
              <span>
                Pack weight <b>{kg.toFixed(1)} kg</b> · {pc.label}
              </span>
              <span className="pack-fx">
                {speedPenalty > 0.5 || effortPenalty > 0.5 ? `−${speedPenalty.toFixed(0)}% speed · +${effortPenalty.toFixed(0)}% effort` : 'No penalty'}
              </span>
            </div>
            <div className="pack-bar">
              <i style={{ width: `${Math.min(100, ((kg - BASE_PACK_KG) / 9) * 100)}%` }} />
            </div>
          </div>
        </section>

        <button type="button" className="start-btn" onClick={start}>
          Start expedition
          <span>→</span>
        </button>
        <p className="controls-hint">
          WASD move · Shift jog · Drag camera · Scroll zoom · Space interact · E eat · Q drink · R rest · Esc pause
        </p>
      </div>
    </div>
  );
}
