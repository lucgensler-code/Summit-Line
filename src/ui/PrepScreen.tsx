import { useMemo } from 'react';
import { loadRecords, personalBests } from '../game/records';
import { localBoard, routeKey } from '../game/leaderboard';
import { ACTIVE_MOUNTAIN, ACTIVE_ROUTE } from '../game/routes';
import { BASE_PACK_KG, GEAR, packWeight, type Loadout } from '../game/sim';
import { useGame } from '../game/store';
import { fmtDistance, fmtElevation, fmtTemp, fmtWater, fmtWeight, fmtWind } from '../game/units';
import { conditionsAt } from '../game/weather';
import { ROUTE_MILES, SUMMIT_FT, TRAILHEAD_FT } from '../game/world';
import { fmtReal } from './ExpeditionLog';
import { RouteProfile } from './RouteProfile';
import { useUnits } from './useUnits';

const DEPARTURES: { hour: number; label: string; time: string; note: string }[] = [
  { hour: 4.5, label: 'Alpine start', time: '4:30 AM', note: 'Dark, cold · firm snow' },
  { hour: 7, label: 'Sunrise', time: '7:00 AM', note: 'Golden light · balanced' },
  { hour: 10, label: 'Late start', time: '10:00 AM', note: 'Warm · soft, deep snow' },
];

function packClass(kg: number) {
  if (kg < 10) return { label: 'Light', cls: 'ok' };
  if (kg < 12.5) return { label: 'Moderate', cls: 'mid' };
  return { label: 'Heavy', cls: 'heavy' };
}

function Stepper({ value, min, max, step, onChange, label, display }: { value: number; min: number; max: number; step: number; label: string; onChange: (v: number) => void; display: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>
        −
      </button>
      <span>{display}</span>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>
        +
      </button>
    </div>
  );
}

export function PrepScreen() {
  useUnits();
  const loadout = useGame((s) => s.loadout);
  const setLoadout = useGame((s) => s.setLoadout);
  const start = useGame((s) => s.start);
  const setLogOpen = useGame((s) => s.setLogOpen);
  const setLbOpen = useGame((s) => s.setLbOpen);
  const logOpen = useGame((s) => s.logOpen);
  const pb = useMemo(() => personalBests(loadRecords(), ACTIVE_MOUNTAIN.id, ACTIVE_ROUTE.id, ACTIVE_ROUTE.miles), [logOpen]); // re-read after the log closes
  const top = useMemo(() => localBoard.top(routeKey(ACTIVE_MOUNTAIN.id, ACTIVE_ROUTE.id), 'score', 1)[0], [logOpen]);
  const kg = packWeight(loadout);
  const pc = packClass(kg);
  const speedPenalty = Math.max(0, kg - 9) * 1.2;
  const effortPenalty = Math.max(0, kg - 8) * 3.5;
  const wxTrail = conditionsAt(TRAILHEAD_FT, loadout.departureHour);
  const wxTop = conditionsAt(SUMMIT_FT, loadout.departureHour + 4);

  return (
    <div className="prep">
      <div className="prep-hero" aria-hidden="true" />
      <div className="prep-panel">
        <header className="prep-head">
          <div className="brand">SUMMIT LINE</div>
          <h1>{ACTIVE_MOUNTAIN.name}</h1>
          <p className="sub">
            {ACTIVE_MOUNTAIN.range} · {fmtElevation(SUMMIT_FT)} · {ACTIVE_ROUTE.name}
          </p>
          <p className="blurb">Old-growth forest, an alpine tarn, cinder switchbacks and a snow-filled crater. Non-technical, but long and relentless.</p>
        </header>

        <section className="route-card">
          <div className="route-stats">
            <div>
              <span className="k">Distance</span>
              <span className="v">{fmtDistance(ROUTE_MILES)}</span>
            </div>
            <div>
              <span className="k">Gain</span>
              <span className="v">+{fmtElevation(SUMMIT_FT - TRAILHEAD_FT)}</span>
            </div>
            <div>
              <span className="k">Trailhead</span>
              <span className="v">{fmtElevation(TRAILHEAD_FT)}</span>
            </div>
            <div>
              <span className="k">Play time</span>
              <span className="v">
                {ACTIVE_ROUTE.estMinutes[0]}–{ACTIVE_ROUTE.estMinutes[1]} min
              </span>
            </div>
          </div>
          <RouteProfile width={360} height={96} labels fluid />
          <p className="forecast">
            <b>Forecast</b> · {fmtTemp(wxTrail.tempF)} at the trailhead, {fmtTemp(wxTop.tempF)} and {fmtWind(wxTop.windMph)} wind on the summit. Snow softens after 10 AM. Last water at
            Obsidian Tarn.
          </p>
        </section>

        <section>
          <h2>Departure</h2>
          <div className="choice-row">
            {DEPARTURES.map((d) => (
              <button type="button" key={d.hour} className={`choice ${loadout.departureHour === d.hour ? 'selected' : ''}`} onClick={() => setLoadout({ departureHour: d.hour })} aria-pressed={loadout.departureHour === d.hour}>
                <span className="time">{d.time}</span>
                <span className="label">{d.label}</span>
                <span className="note">{d.note}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Gear</h2>
          <div className="gear-grid">
            {(Object.keys(GEAR) as (keyof typeof GEAR)[]).map((key) => {
              const item = GEAR[key];
              const on = loadout[key as keyof Loadout] as boolean;
              return (
                <button type="button" key={key} className={`gear ${on ? 'on' : ''}`} onClick={() => setLoadout({ [key]: !on } as Partial<Loadout>)} aria-pressed={on}>
                  <span className="check">{on ? '✓' : ''}</span>
                  <span className="gname">{item.label}</span>
                  <span className="gkg">{fmtWeight(item.kg)}</span>
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
                <small>{fmtWater(0.5)} per drink · refill at the tarn</small>
              </div>
              <Stepper value={loadout.waterL} min={0.5} max={4} step={0.5} label="water" onChange={(v) => setLoadout({ waterL: v })} display={fmtWater(loadout.waterL)} />
            </div>
            <div className="supply">
              <div>
                <b>Trail bars</b>
                <small>restore energy · eat on the move</small>
              </div>
              <Stepper value={loadout.food} min={0} max={8} step={1} label="food" onChange={(v) => setLoadout({ food: v })} display={`${loadout.food} bars`} />
            </div>
          </div>
          <div className={`pack-meter ${pc.cls}`}>
            <div className="pack-row">
              <span>
                Pack <b>{fmtWeight(kg)}</b> · {pc.label}
              </span>
              <span className="pack-fx">{speedPenalty > 0.5 || effortPenalty > 0.5 ? `−${speedPenalty.toFixed(0)}% speed · +${effortPenalty.toFixed(0)}% effort` : 'No penalty'}</span>
            </div>
            <div className="pack-bar">
              <i style={{ width: `${Math.min(100, ((kg - BASE_PACK_KG) / 9) * 100)}%` }} />
            </div>
          </div>
        </section>

        <div className="prep-links">
          <button type="button" className="log-btn" onClick={() => setLbOpen(true)}>
            <span>
              <b>High scores</b>
              <small>{top ? `Best ${top.score.toLocaleString('en-US')} · ${top.name}` : 'Set the first score'}</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="log-btn" onClick={() => setLogOpen(true)}>
            <span>
              <b>Expedition log</b>
              <small>{pb.climbs ? `${pb.climbs} summit${pb.climbs > 1 ? 's' : ''} · best ${fmtReal(pb.fastestReal!.realSeconds)}` : 'No summits yet'}</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <div className="start-dock">
          <button type="button" className="start-btn" onClick={start}>
            Start expedition
            <span>→</span>
          </button>
        </div>
        <p className="controls-hint">WASD move · Arrows look · Shift dash · Space act/rest/jump · C recenter · +/− zoom · M map · E eat · Q drink · R rest</p>
      </div>
    </div>
  );
}
