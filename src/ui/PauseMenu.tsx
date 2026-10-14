import { useState } from 'react';
import { isMuted, setMuted } from '../game/audio';
import { useGame } from '../game/store';

export function ControlsList() {
  return (
    <div className="controls-list">
      <h3>Desktop</h3>
      <dl>
        <dt>W A S D / Arrows</dt>
        <dd>Move (camera-relative)</dd>
        <dt>Shift</dt>
        <dd>Jog — faster, burns stamina</dd>
        <dt>Mouse drag</dt>
        <dd>Rotate camera</dd>
        <dt>Scroll</dt>
        <dd>Camera distance</dd>
        <dt>Space</dt>
        <dd>Interact (signs, register, water, summit)</dd>
        <dt>E / Q / R</dt>
        <dd>Eat · Drink · Rest</dd>
        <dt>Esc</dt>
        <dd>Pause</dd>
        <dt>M</dt>
        <dd>Mute sound</dd>
      </dl>
      <h3>Touch</h3>
      <dl>
        <dt>Left thumb</dt>
        <dd>Virtual joystick</dd>
        <dt>Right side drag</dt>
        <dd>Rotate camera</dd>
        <dt>Buttons</dt>
        <dd>Jog, Action, Eat, Drink, Rest</dd>
      </dl>
      <h3>Mountaineering tips</h3>
      <ul>
        <li>The trail and boot track are far cheaper than cross-country travel.</li>
        <li>Steep uphill and deep snow drain stamina fast. Stop or rest to recover.</li>
        <li>The faint bar notch is your energy reserve — eat to restore it.</li>
        <li>Refill water at Obsidian Tarn; there is none higher up.</li>
      </ul>
    </div>
  );
}

export function PauseMenu() {
  const { resume, restart, toTrailhead, showControls, setShowControls } = useGame();
  const [muted, setM] = useState(isMuted());
  return (
    <div className="modal-backdrop">
      <div className="modal pause">
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
          </div>
        )}
      </div>
    </div>
  );
}
