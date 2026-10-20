import { useEffect, useRef, useState } from 'react';
import { CINE_SECONDS } from '../game/cinematic';
import { cleanName, loadPlayerName, localBoard, savePlayerName, sharedBoard, sharedSubmit, sharedTop, routeKey, typingName, validSubmission } from '../game/leaderboard';
import { BEST_LABEL } from '../game/records';
import { ACTIVE_MOUNTAIN, ACTIVE_ROUTE } from '../game/routes';
import { runtime, useGame } from '../game/store';
import { fmtDistance, fmtElevation, fmtWater } from '../game/units';
import { SUMMIT_FT } from '../game/world';
import { fmtReal } from './ExpeditionLog';
import { fmtClock, fmtDuration } from './format';
import { CameraGestures, isTouchDevice } from './TouchControls';
import { useUnits } from './useUnits';

const LINE_COLORS: Record<string, string> = {
  speed: '#e5484d', // v0.8: red, distinct from the orange used for tabs and buttons
  gems: '#4fd197',
  summit: '#6f95c9',
  clean: '#6fc0c0',
  register: '#a28ad6',
};

/**
 * v0.4 summit flow:
 *   result  — concise card: time + score, name (remembered) with Submit / Skip
 *   cine    — the time-lapse orbit plays (skippable)
 *   details — full breakdown, stats and actions
 */
type Stage = 'result' | 'cine' | 'details';

type SaveState = { status: 'idle' | 'saving' | 'saved'; localRank?: number; sharedRank?: number | null; sharedMsg?: string };

export function SummitScreen() {
  useUnits();
  const summary = useGame((s) => s.summary);
  const restart = useGame((s) => s.restart);
  const toTrailhead = useGame((s) => s.toTrailhead);
  const viewMode = useGame((s) => s.viewMode);
  const setViewMode = useGame((s) => s.setViewMode);
  const setLogOpen = useGame((s) => s.setLogOpen);
  const setLbOpen = useGame((s) => s.setLbOpen);
  const [tab, setTab] = useState<'score' | 'stats'>('score');
  const [stage, setStage] = useState<Stage>('result');
  const [touch] = useState(isTouchDevice);
  const [name, setName] = useState(loadPlayerName());
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [sharedAvail, setSharedAvail] = useState<boolean | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    sharedBoard().then((s) => setSharedAvail(!!s));
    // Don't pop the keyboard on phones; on desktop the name is ready to confirm with Enter.
    if (!isTouchDevice()) nameRef.current?.focus({ preventScroll: true });
    return () => {
      runtime.summitAt = 0;
    };
  }, []);
  useEffect(() => {
    if (stage !== 'cine') return;
    runtime.summitAt = performance.now() / 1000;
    const t = setTimeout(() => setStage('details'), CINE_SECONDS * 1000 + 600);
    return () => clearTimeout(t);
  }, [stage]);
  const startCinematic = () => setStage('cine');
  const skipCinematic = () => {
    // Jump the time-lapse to its end so the alpenglow hold shows behind the details.
    runtime.summitAt = performance.now() / 1000 - CINE_SECONDS;
    setStage('details');
  };
  if (!summary) return null;
  const s = summary;
  const newBest = s.score.total > s.bestScoreBefore;

  const saveScore = async () => {
    const n = cleanName(name);
    if (!n || save.status !== 'idle') return;
    startCinematic();
    savePlayerName(n);
    setSave({ status: 'saving' });
    const sub = {
      name: n,
      score: s.score.total,
      realSeconds: s.realSeconds,
      gems: s.gems.total,
      mountainId: ACTIVE_MOUNTAIN.id,
      mountainName: ACTIVE_MOUNTAIN.name,
      routeId: ACTIVE_ROUTE.id,
      routeName: ACTIVE_ROUTE.name,
      gemsAvailable: s.gems.available,
    };
    const rk = routeKey(ACTIVE_MOUNTAIN.id, ACTIVE_ROUTE.id);
    // Local runs that never reached the shared board (offline, or older saves) ride along.
    const pending = localBoard.unsynced(rk);
    if (!validSubmission(sub)) {
      setSave({ status: 'saved', sharedMsg: 'Not saved — this run’s time or score failed the sanity check' });
      return;
    }
    const local = localBoard.add(sub);
    let sharedRank: number | null = null;
    let sharedMsg = '';
    const res = await sharedSubmit(sub, pending);
    if (res === 'ok') localBoard.markSynced([local.id, ...pending.map((p) => p.id)]);
    if (res === 'ok') {
      const top = await sharedTop(routeKey(ACTIVE_MOUNTAIN.id, ACTIVE_ROUTE.id), 'score', 100).catch(() => null);
      const i = top?.findIndex((r) => r.mine) ?? -1;
      sharedRank = i >= 0 ? i + 1 : null;
      sharedMsg = 'Posted to the shared leaderboard';
    } else if (res === 'denied') sharedMsg = 'Saved on this device (you have view-only access to the shared board)';
    else sharedMsg = navigator.onLine === false ? 'Saved on this device — will post to the shared board next time you save online' : 'Saved on this device';
    setSave({ status: 'saved', localRank: local.rankScore, sharedRank, sharedMsg });
  };

  const saveLine = save.status === 'saved' && (
    <p className="hs-done">
      ✓ {save.sharedMsg}
      {save.sharedRank ? ` · #${save.sharedRank} overall` : ''}
      {save.localRank ? ` · #${save.localRank} on this device` : ''}
    </p>
  );

  return (
    <div className={`summit stage-${stage} ${viewMode ? 'view' : ''}`}>
      {touch && stage !== 'result' && <CameraGestures />}
      {viewMode ? (
        <div className="view-controls">
          <span className="view-hint">{touch ? 'Drag to orbit · Pinch to zoom' : 'Drag to orbit · Scroll to zoom'}</span>
          <button type="button" className="pill-btn" onClick={() => setViewMode(false)}>
            Show summary
          </button>
        </div>
      ) : stage === 'result' ? (
        <section className="result-card" aria-label="Summit result">
          <div className="result-k">
            ▲ Summit · {ACTIVE_MOUNTAIN.name} · {fmtElevation(SUMMIT_FT)}
          </div>
          <div className="result-main">
            <div>
              <span className="k">Time</span>
              <b>{fmtReal(s.realSeconds)}</b>
            </div>
            <div>
              <span className="k">Score</span>
              <b>{s.score.total.toLocaleString('en-US')}</b>
            </div>
          </div>
          <p className="result-sub">
            {s.gems.total}/{s.gems.available} gems · {s.exhaustions === 0 ? 'clean climb' : `exhausted ${s.exhaustions}×`}
            {newBest && <span className="new-best"> · 🏆 personal best</span>}
          </p>
          <p className="result-why">
            {s.score.lines
              .filter((l) => l.points > 0)
              .map((l) => `${l.id === 'speed' ? 'Time' : l.label.replace(/ \(.*\)$/, '')} ${l.points.toLocaleString('en-US')}`)
              .join(' + ')}
          </p>
          <form
            className={`hs-entry ${s.qualifies ? 'qualifies' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              void saveScore();
            }}
          >
            <label htmlFor="hs-name">{s.qualifies ? 'New high score — your name for the board' : 'Your name for the leaderboard'}</label>
            <div className="reg-row">
              <input
                id="hs-name"
                ref={nameRef}
                value={name}
                maxLength={12}
                autoComplete="nickname"
                enterKeyHint="done"
                placeholder="Name or initials"
                onChange={(e) => setName(typingName(e.target.value))}
              />
              <button type="submit" className="btn primary" disabled={!cleanName(name)}>
                Submit
              </button>
            </div>
            <button type="button" className="btn subtle skip" onClick={startCinematic}>
              Skip — don’t save
            </button>
            {sharedAvail === false && <small>Scores stay on this device here; the shared board needs the published link while signed in.</small>}
          </form>
        </section>
      ) : stage === 'cine' ? (
        <div className="cine-controls">
          <div className="achievement" role="status">
            <span className="ach-icon">▲</span>
            <div>
              <div className="ach-k">Summit reached</div>
              <div className="ach-v">
                {fmtReal(s.realSeconds)} · {s.score.total.toLocaleString('en-US')} pts
              </div>
            </div>
          </div>
          <button type="button" className="pill-btn" onClick={skipCinematic}>
            Skip ›
          </button>
        </div>
      ) : (
        <section className="summary-card" aria-label="Expedition summary">
          <header className="sum-head">
            <div className="sum-score">
              <span className="k">Summit score</span>
              <b>{s.score.total.toLocaleString('en-US')}</b>
            </div>
            <div className="sum-time">
              <span className="k">Real time</span>
              <b>{fmtReal(s.realSeconds)}</b>
              {newBest && <span className="new-best">🏆 New best</span>}
            </div>
          </header>
          <p className="sub">
            {s.title} · topped out {fmtClock(s.finishHour)} after {fmtDuration(s.hours)} of expedition time
          </p>
          {saveLine}
          {save.status === 'saving' && <p className="hs-done dim">Saving…</p>}

          <div className="seg sum-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'score'} className={tab === 'score' ? 'on' : ''} onClick={() => setTab('score')}>
              Score
            </button>
            <button type="button" role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>
              Climb stats
            </button>
          </div>

          {tab === 'score' ? (
            <ul className="score-lines">
              {s.score.lines.map((l) => (
                <li key={l.id} title={l.hint}>
                  <div className="sl-top">
                    <span>{l.label}</span>
                    <b>+{l.points.toLocaleString('en-US')}</b>
                  </div>
                  <div className="sl-bar">
                    <i style={{ width: `${l.max ? (l.points / l.max) * 100 : 0}%`, background: LINE_COLORS[l.id] }} />
                  </div>
                  {l.points < l.max && <small>{l.hint}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <>
              {s.bests.length > 0 && (
                <div className="pb-badges">
                  {s.bests.map((b) => (
                    <span key={b} className="pb-badge">
                      ★ {BEST_LABEL[b]}
                    </span>
                  ))}
                </div>
              )}
              <div className="summary-grid">
                <div>
                  <span className="k">Distance</span>
                  <span className="v">{fmtDistance(s.distMi, 2)}</span>
                </div>
                <div>
                  <span className="k">Gained</span>
                  <span className="v">+{fmtElevation(s.gainFt)}</span>
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
                  <span className="k">Water used</span>
                  <span className="v">{fmtWater(s.waterUsed)}</span>
                </div>
                <div>
                  <span className="k">Left</span>
                  <span className="v">
                    {fmtWater(s.water)} · {s.food} bars
                  </span>
                </div>
                <div>
                  <span className="k">Gems</span>
                  <span className="v">
                    {s.gems.total}
                    <small>/{s.gems.available}</small>
                  </span>
                </div>
                <div>
                  <span className="k">Expedition time</span>
                  <span className="v">{fmtDuration(s.hours)}</span>
                </div>
                <div>
                  <span className="k">Exhausted</span>
                  <span className="v">{s.exhaustions}×</span>
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
            </>
          )}

          {save.status === 'idle' && (
            <form
              className="hs-entry"
              onSubmit={(e) => {
                e.preventDefault();
                void saveScore();
              }}
            >
              <label htmlFor="hs-name2">Save to the leaderboard</label>
              <div className="reg-row">
                <input id="hs-name2" value={name} maxLength={12} autoComplete="nickname" placeholder="Name or initials" onChange={(e) => setName(typingName(e.target.value))} />
                <button type="submit" className="btn primary" disabled={!cleanName(name)}>
                  Submit
                </button>
              </div>
            </form>
          )}

          <div className="sum-actions">
            <button type="button" className="btn primary" onClick={restart}>
              Climb again
            </button>
            <button type="button" className="btn" onClick={toTrailhead}>
              New expedition
            </button>
            <button type="button" className="btn view" onClick={() => setViewMode(true)}>
              Enjoy the view
            </button>
            <button type="button" className="btn subtle" onClick={() => setLbOpen(true)}>
              Leaderboard
            </button>
            <button type="button" className="btn subtle" onClick={() => setLogOpen(true)}>
              Expedition log
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
