import { useEffect, useState } from 'react';
import { cleanName, loadPlayerName, localBoard, savePlayerName, sharedBoard, sharedSubmit, sharedTop, routeKey } from '../game/leaderboard';
import { BEST_LABEL } from '../game/records';
import { ACTIVE_MOUNTAIN, ACTIVE_ROUTE } from '../game/routes';
import { useGame } from '../game/store';
import { fmtDistance, fmtElevation, fmtWater } from '../game/units';
import { SUMMIT_FT } from '../game/world';
import { fmtReal } from './ExpeditionLog';
import { fmtClock, fmtDuration } from './format';
import { CameraGestures, isTouchDevice } from './TouchControls';
import { useUnits } from './useUnits';

const LINE_COLORS: Record<string, string> = {
  summit: '#6f95c9',
  speed: '#e9a25f',
  resources: '#78b07e',
  route: '#a28ad6',
  gems: '#c97a7a',
  expedition: '#6fc0c0',
};

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
  const [banner, setBanner] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [touch] = useState(isTouchDevice);
  const [name, setName] = useState(loadPlayerName());
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [sharedAvail, setSharedAvail] = useState<boolean | null>(null);
  useEffect(() => {
    const a = setTimeout(() => setSheet(true), 4200);
    const b = setTimeout(() => setBanner(false), 7000);
    sharedBoard().then((s) => setSharedAvail(!!s));
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  if (!summary) return null;
  const s = summary;
  const newBest = s.score.total > s.bestScoreBefore;

  const saveScore = async () => {
    const n = cleanName(name);
    if (!n || save.status !== 'idle') return;
    savePlayerName(n);
    setSave({ status: 'saving' });
    const sub = {
      name: n,
      score: s.score.total,
      realSeconds: s.realSeconds,
      mountainId: ACTIVE_MOUNTAIN.id,
      mountainName: ACTIVE_MOUNTAIN.name,
      routeId: ACTIVE_ROUTE.id,
      routeName: ACTIVE_ROUTE.name,
      gemsAvailable: s.gems.available,
    };
    const local = localBoard.add(sub);
    let sharedRank: number | null = null;
    let sharedMsg = '';
    const res = await sharedSubmit(sub);
    if (res === 'ok') {
      const top = await sharedTop(routeKey(ACTIVE_MOUNTAIN.id, ACTIVE_ROUTE.id), 'score', 100).catch(() => null);
      const i = top?.findIndex((r) => r.mine) ?? -1;
      sharedRank = i >= 0 ? i + 1 : null;
      sharedMsg = 'Posted to the shared leaderboard';
    } else if (res === 'denied') sharedMsg = 'Saved on this device (you have view-only access to the shared board)';
    else sharedMsg = 'Saved on this device';
    setSave({ status: 'saved', localRank: local.rankScore, sharedRank, sharedMsg });
  };

  return (
    <div className={`summit ${viewMode ? 'view' : ''}`}>
      {touch && <CameraGestures />}
      {banner && !viewMode && (
        <div className="achievement" role="status">
          <span className="ach-icon">▲</span>
          <div>
            <div className="ach-k">Summit reached</div>
            <div className="ach-v">
              {ACTIVE_MOUNTAIN.name} · {fmtElevation(SUMMIT_FT)}
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
              <div className="sum-score">
                <span className="k">Summit score</span>
                <b>{s.score.total.toLocaleString('en-US')}</b>
              </div>
              <div className="sum-time">
                <span className="k">Summit time</span>
                <b>{fmtReal(s.realSeconds)}</b>
                {newBest && <span className="new-best">🏆 New best</span>}
              </div>
            </header>
            <p className="sub">
              {s.title} · topped out {fmtClock(s.finishHour)} after {fmtDuration(s.hours)} on the trail clock
            </p>

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
                    <span className="k">Real time</span>
                    <span className="v">{fmtReal(s.realSeconds)}</span>
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

            <form
              className={`hs-entry ${s.qualifies ? 'qualifies' : ''}`}
              onSubmit={(e) => {
                e.preventDefault();
                void saveScore();
              }}
            >
              {save.status === 'saved' ? (
                <p className="hs-done">
                  ✓ {save.sharedMsg}
                  {save.sharedRank ? ` · #${save.sharedRank} overall` : ''}
                  {save.localRank ? ` · #${save.localRank} on this device` : ''}
                </p>
              ) : (
                <>
                  <label htmlFor="hs-name">{s.qualifies ? '🏆 New high score — enter your name' : 'Save to the leaderboard'}</label>
                  <div className="reg-row">
                    <input id="hs-name" value={name} maxLength={12} autoComplete="nickname" placeholder="Initials" onChange={(e) => setName(cleanName(e.target.value))} />
                    <button type="submit" className="btn primary" disabled={!cleanName(name) || save.status === 'saving'}>
                      {save.status === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {sharedAvail === false && <small>Scores stay on this device here; the shared board needs the published link while signed in.</small>}
                </>
              )}
            </form>

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
              <button type="button" className="btn subtle" onClick={() => setLbOpen(true)}>
                Leaderboard
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
