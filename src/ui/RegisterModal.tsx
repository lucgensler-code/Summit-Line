import { useEffect, useMemo, useState } from 'react';
import { cleanName, loadPlayerName, savePlayerName, typingName } from '../game/leaderboard';
import { ACTIVE_MOUNTAIN, ACTIVE_ROUTE } from '../game/routes';
import { SCORE_RULES } from '../game/scoring';
import { clockHour } from '../game/sim';
import { runtime, useGame } from '../game/store';
import { fmtClock } from './format';
import { Modal } from './Modal';

interface RegisterEntry {
  name: string;
  date: string;
  departure: number;
  signedAt: number;
  party: number;
}

const KEY = 'summitline.register.v1';
function loadEntries(): RegisterEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** The trail register at Obsidian Tarn Camp: sign in (+score), and read earlier entries from this device. */
export function RegisterModal() {
  const setOpen = useGame((s) => s.setRegisterOpen);
  const toast = useGame((s) => s.toast);
  const [name, setName] = useState(loadPlayerName());
  const [signed, setSigned] = useState(runtime.registerSigned);
  const [entries, setEntries] = useState(loadEntries);
  const recent = useMemo(() => entries.slice().reverse().slice(0, 12), [entries]);
  useEffect(() => {
    setSigned(runtime.registerSigned);
  }, []);

  const sign = () => {
    const n = cleanName(name) || 'CLIMBER';
    const p = runtime.player;
    const e: RegisterEntry = {
      name: n,
      date: new Date().toISOString(),
      departure: runtime.loadout.departureHour,
      signedAt: p ? clockHour(p, runtime.loadout) : runtime.loadout.departureHour,
      party: 1,
    };
    const all = [...entries, e].slice(-100);
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
    savePlayerName(n);
    setEntries(all);
    runtime.registerSigned = true;
    setSigned(true);
    toast(`Register signed · +${SCORE_RULES.register} pts`, 'good', 2);
  };

  return (
    <Modal onClose={() => setOpen(false)} onConfirm={() => (signed ? setOpen(false) : sign())} label="Climbers register" className="register">
      <div className="brand">OBSIDIAN TARN · CLIMBERS REGISTER</div>
      <h2>Sign in before the climb</h2>
      <p className="reg-why">
        Climbers log their route and expected return so rangers know who is on {ACTIVE_MOUNTAIN.name}. Signing in is good practice and earns a{' '}
        <b>+{SCORE_RULES.register} point</b> style bonus on your summit score.
      </p>
      {signed ? (
        <>
          <p className="reg-done">✓ You signed this register on today's climb.</p>
          <button type="button" className="btn primary reg-continue" onClick={() => setOpen(false)}>
            Continue <kbd>Enter</kbd>
          </button>
        </>
      ) : (
        <form
          className="reg-form"
          onSubmit={(e) => {
            e.preventDefault();
            sign();
          }}
        >
          <label htmlFor="reg-name">Name or initials</label>
          <div className="reg-row">
            <input id="reg-name" value={name} maxLength={12} autoComplete="nickname" onChange={(e) => setName(typingName(e.target.value))} placeholder="e.g. LUC" />
            <button type="submit" className="btn primary">
              Sign
            </button>
          </div>
          <small>
            Route: {ACTIVE_ROUTE.name} · left {fmtClock(runtime.loadout.departureHour)} · party of 1
          </small>
        </form>
      )}
      <h3 className="log-sub">Recent entries on this device</h3>
      {recent.length === 0 ? (
        <p className="empty">No entries yet — yours will be the first.</p>
      ) : (
        <ol className="reg-list">
          {recent.map((r, i) => (
            <li key={i}>
              <b>{r.name}</b>
              <span>{new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span>
                left {fmtClock(r.departure)} · signed {fmtClock(r.signedAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
