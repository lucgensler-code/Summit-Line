import { useEffect, useState } from 'react';
import { localBoard, routeKey, sharedBoard, sharedTop, type LbEntry, type LbSort } from '../game/leaderboard';
import { ACTIVE_MOUNTAIN, ACTIVE_ROUTE } from '../game/routes';
import { useGame } from '../game/store';
import { fmtReal } from './ExpeditionLog';
import { Modal } from './Modal';

type Source = 'shared' | 'local';

/** Arcade-style high scores: Highest Scores / Fastest Summits, shared (everyone) or this device. */
export function Leaderboard({ highlightId }: { highlightId?: string }) {
  const setOpen = useGame((s) => s.setLbOpen);
  const [sort, setSort] = useState<LbSort>('score');
  const [source, setSource] = useState<Source>('local');
  const [sharedOk, setSharedOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<LbEntry[] | null>(null);
  const rk = routeKey(ACTIVE_MOUNTAIN.id, ACTIVE_ROUTE.id);

  useEffect(() => {
    let live = true;
    sharedBoard().then((s) => {
      if (!live) return;
      setSharedOk(!!s);
      if (s) setSource('shared');
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setRows(null);
    if (source === 'local') setRows(localBoard.top(rk, sort, 25));
    else
      sharedTop(rk, sort, 25)
        .then((r) => live && setRows(r ?? []))
        .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [source, sort, rk]);

  const best = rows && rows.length ? rows.find((r) => r.mine) : undefined;
  return (
    <Modal onClose={() => setOpen(false)} label="Leaderboard" className="lb">
      <div className="brand">HIGH SCORES</div>
      <h2>
        {ACTIVE_MOUNTAIN.name} · {ACTIVE_ROUTE.name}
      </h2>
      <div className="lb-tabs">
        <div className="seg" role="tablist" aria-label="Sort">
          <button type="button" role="tab" aria-selected={sort === 'score'} className={sort === 'score' ? 'on' : ''} onClick={() => setSort('score')}>
            Highest Scores
          </button>
          <button type="button" role="tab" aria-selected={sort === 'time'} className={sort === 'time' ? 'on' : ''} onClick={() => setSort('time')}>
            Fastest Summits
          </button>
        </div>
        <div className="seg small" role="tablist" aria-label="Board">
          <button type="button" className={source === 'shared' ? 'on' : ''} disabled={!sharedOk} onClick={() => setSource('shared')} title={sharedOk ? 'Everyone who plays this link' : 'Shared board unavailable here'}>
            Everyone
          </button>
          <button type="button" className={source === 'local' ? 'on' : ''} onClick={() => setSource('local')}>
            This device
          </button>
        </div>
      </div>
      {sharedOk === false && (
        <p className="lb-note">The shared board works when you play the published link signed in to Claude. Showing scores saved on this device.</p>
      )}
      {rows === null ? (
        <p className="empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No scores yet. Reach the summit to set the first one.</p>
      ) : (
        <div className="lb-table-wrap">
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th className="num">Score</th>
                <th className="num">Time</th>
                <th className="hide-narrow">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={`${r.mine && source === 'shared' ? 'mine' : ''} ${r.id === highlightId ? 'hl' : ''}`}>
                  <td className="rank">{i + 1}</td>
                  <td>
                    {r.name}
                    {r === best && source === 'shared' && <span className="pb-tag">YOU</span>}
                    {source === 'local' && i === 0 && <span className="pb-tag">PB</span>}
                    {r.migrated && (
                      <span className="pb-tag old" title="Recomputed from a v0.3 climb (older pacing, no clean-climb data)">
                        v0.3
                      </span>
                    )}
                  </td>
                  <td className="num">{r.score.toLocaleString('en-US')}</td>
                  <td className="num">{fmtReal(r.realSeconds)}</td>
                  <td className="hide-narrow">{r.date ? new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="lb-foot">
        Times are real-world play time. Score = speed (up to 6,000) + 150 per gem + 1,000 summit + clean climb 400 + register 200.
        {source === 'shared' ? ' Each player’s five best runs can appear.' : ''}
      </p>
    </Modal>
  );
}
