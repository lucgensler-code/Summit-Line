import { useState } from 'react';
import { isMuted, setMuted } from '../game/audio';
import { keysSwapped, setKeysSwapped } from '../game/input';
import { useGame } from '../game/store';
import { getUnits, setUnits } from '../game/units';
import { useUnits } from './useUnits';

export function ControlsList() {
  const swapped = keysSwapped();
  return (
    <div className="controls-list">
      <h3>Desktop</h3>
      <dl>
        <dt>{swapped ? 'Arrow keys' : 'W A S D'}</dt>
        <dd>Move (camera-relative)</dd>
        <dt>{swapped ? 'W A S D' : 'Arrow keys'}</dt>
        <dd>Turn and tilt the camera</dd>
        <dt>Shift</dt>
        <dd>Dash — faster, burns stamina</dd>
        <dt>Mouse drag · Scroll · + / −</dt>
        <dd>Rotate camera · Zoom</dd>
        <dt>C</dt>
        <dd>Recenter the camera behind you</dd>
        <dt>Space</dt>
        <dd>Action near signs, the register, water and the summit — otherwise rest when stopped, jump when moving</dd>
        <dt>F · J</dt>
        <dd>Action · Jump</dd>
        <dt>E / Q / R</dt>
        <dd>Eat · Drink · Rest</dd>
        <dt>M · Esc · N</dt>
        <dd>Map · Pause · Mute</dd>
      </dl>
      <h3>Touch</h3>
      <dl>
        <dt>Left thumb</dt>
        <dd>Virtual joystick</dd>
        <dt>Drag anywhere else</dt>
        <dd>Rotate camera</dd>
        <dt>Two-finger pinch</dt>
        <dd>Zoom from over-the-shoulder to wide view</dd>
        <dt>Buttons</dt>
        <dd>Dash, Jump/Action; eat, drink and rest in the status panel</dd>
      </dl>
      <h3>Mountaineering tips</h3>
      <ul>
        <li>The trail and boot track are far cheaper than cross-country travel.</li>
        <li>Steep uphill and deep snow drain stamina fast. Stop or rest to recover.</li>
        <li>The hatched end of the stamina bar is energy you have burned — only food restores it.</li>
        <li>Low hydration slows recovery and makes dashing costly. Drink before you are thirsty.</li>
        <li>Green gems (on the steep cut-offs) restore stamina; red gems (at the start of long gentle stretches) give 15 s of extra speed — run with them.</li>
        <li>Eat and drink on the move: water gives an instant stamina lift, food restores energy.</li>
        <li>Score is mostly speed: 20 points for every second under 15:00, plus 50 per gem, 500 for the summit, 200 for a clean climb and 100 for signing the register.</li>
        <li>Refill water at Obsidian Tarn; there is none higher up.</li>
      </ul>
    </div>
  );
}

export function PauseMenu() {
  const { resume, restart, toTrailhead, showControls, setShowControls } = useGame();
  const [muted, setM] = useState(isMuted());
  const [swap, setSwap] = useState(keysSwapped());
  const units = useUnits();
  const setLbOpen = useGame((s) => s.setLbOpen);
  return (
    <div className="modal-backdrop">
      <div className="modal pause" role="dialog" aria-label="Paused">
        <h2>Paused</h2>
        {showControls ? (
          <>
            <ControlsList />
            <button type="button" className="btn" onClick={() => setShowControls(false)}>
              Back
            </button>
          </>
        ) : (
          <div className="menu">
            <button type="button" className="btn primary" onClick={resume} autoFocus>
              Resume
            </button>
            <button type="button" className="btn" onClick={restart}>
              Restart climb
            </button>
            <button type="button" className="btn" onClick={() => setShowControls(true)}>
              Controls
            </button>
            <button type="button" className="btn" onClick={toTrailhead}>
              Return to trailhead
            </button>
            <button
              type="button"
              className="btn subtle"
              onClick={() => {
                setMuted(!muted);
                setM(!muted);
              }}
            >
              Sound: {muted ? 'Off' : 'On'}
            </button>
            <button type="button" className="btn subtle" onClick={() => setUnits(getUnits() === 'us' ? 'metric' : 'us')}>
              Units: {units === 'us' ? 'US (ft, mi, lb, fl oz)' : 'Metric (m, km, kg, L)'}
            </button>
            <button
              type="button"
              className="btn subtle"
              onClick={() => {
                setKeysSwapped(!swap);
                setSwap(!swap);
              }}
            >
              Keys: {swap ? 'Arrows move · WASD camera' : 'WASD move · Arrows camera'}
            </button>
            <button type="button" className="btn subtle" onClick={() => setLbOpen(true)}>
              High scores
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
