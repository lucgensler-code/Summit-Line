import { useMemo, useState } from 'react';
import { BEST_LABEL, clearRecords, loadRecords, personalBests, efficiency, type BestKind, type ExpeditionRecord } from '../game/records';
import { ACTIVE_MOUNTAIN, ACTIVE_ROUTE } from '../game/routes';
import { useGame } from '../game/store';
import { fmtClock, fmtDuration } from './format';

export const fmtReal = (sec: number) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;

function bestValue(kind: BestKind, r: ExpeditionRecord) {
  switch (kind) {
    case 'fastestReal':
      return `${fmtReal(r.realSeconds)} real`;
    case 'fastestGame':
      return `${fmtDuration(r.gameSeconds / 3600)} on trail clock`;
    case 'fewestResources':
      return `${r.waterUsedL.toFixed(1)} L water · ${r.foodUsed} bars`;
    case 'mostEfficient':
      return `${Math.round(efficiency(r, ACTIVE_ROUTE.miles) * 100)}% · ${r.distanceMi.toFixed(2)} mi`;
  }
}

export function ExpeditionLog() {
  const setLogOpen = useGame((s) => s.setLogOpen);
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const records = useMemo(() => loadRecords().slice().reverse(), [version]);
  const pb = useMemo(() => personalBests(records, ACTIVE_MOUNTAIN.id, ACTIVE_ROUTE.id, ACTIVE_ROUTE.miles), [records]);
  const kinds: BestKind[] = ['fastestReal', 'fastestGame', 'fewestResources', 'mostEfficient'];
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setLogOpen(false)}>
      <div className="modal log" role="dialog" aria-label="Expedition log">
        <header className="log-head">
          <div>
            <div className="brand">EXPEDITION LOG</div>
            <h2>
              {ACTIVE_MOUNTAIN.name} · {ACTIVE_ROUTE.name}
            </h2>
          </div>
          <button type="button" className="icon-btn close" onClick={() => setLogOpen(false)} aria-label="Close log">
            ✕
          </button>
        </header>
        <div className="pb-grid">
          <div className="pb">
            <span className="k">Summits</span>
            <span className="v">{pb.climbs}</span>
          </div>
          {kinds.map((k) => {
            const r = pb[k];
            return (
              <div className="pb" key={k}>
                <span className="k">{BEST_LABEL[k]}</span>
                <span className="v">{r ? bestValue(k, r) : '—'}</span>
              </div>
            );
          })}
        </div>
        <h3 className="log-sub">History</h3>
        {records.length === 0 ? (
          <p className="empty">No summits yet. Your completed climbs will appear here with times, supplies and gems.</p>
        ) : (
          <ol className="history">
            {records.map((r) => (
              <li key={r.id}>
                <div className="h-top">
                  <b>{new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</b>
                  <span>Left {fmtClock(r.departureHour)}</span>
                </div>
                <div className="h-stats">
                  <span>
                    <i>Real</i> {fmtReal(r.realSeconds)}
                  </span>
                  <span>
                    <i>Trail clock</i> {fmtDuration(r.gameSeconds / 3600)}
                  </span>
                  <span>
                    <i>Distance</i> {r.distanceMi.toFixed(2)} mi
                  </span>
                  <span>
                    <i>On trail</i> {Math.round(r.trailPct * 100)}%
                  </span>
                  <span>
                    <i>Supplies</i> {r.waterUsedL.toFixed(1)} L · {r.foodUsed} bars
                  </span>
                  <span>
                    <i>Gems</i> {r.gems.total} ({r.gems.green}◆ {r.gems.red}◆)
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {records.length > 0 && (
          <div className="log-foot">
            {confirm ? (
              <>
                <span>Delete all {records.length} records?</span>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    clearRecords();
                    setConfirm(false);
                    setVersion((v) => v + 1);
                  }}
                >
                  Delete
                </button>
                <button type="button" className="btn" onClick={() => setConfirm(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="btn subtle" onClick={() => setConfirm(true)}>
                Clear history
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
