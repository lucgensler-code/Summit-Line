import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { cue, updateWind } from '../game/audio';
import { cameraKeyAxes, input, moveAxes } from '../game/input';
import { getLandmarks } from '../game/landmarks';
import {
  clockHour,
  daylight,
  drink,
  eat,
  jump,
  nearSummit,
  packWeight,
  refill,
  snowSoftness,
  stepPlayer,
  toggleRest,
  type GameEvent,
  type PlayerState,
  SPEED_BOOST,
} from '../game/sim';
import { CAM_MAX, CAM_MIN } from '../game/store';
import { conditionsAt } from '../game/weather';
import { overlayOpen, runtime, useGame, type HudSnapshot } from '../game/store';
import { cardinal, placeName, safeTrailPoint, stepNav, trailDistance } from '../game/navigation';
import { SURFACE_LABEL, elevationFt, getWorld, unitsToMiles } from '../game/world';

interface Interaction {
  label: string;
  run: () => void;
}

function findInteraction(p: PlayerState): Interaction | null {
  const g = useGame.getState();
  if (nearSummit(p)) {
    return {
      label: 'Touch the summit benchmark',
      run: () => {
        p.summited = true;
        runtime.summitAt = 0; // the summit screen starts the cinematic after the name step
        cue('summit');
        g.completeSummit();
      },
    };
  }
  if (p.nearWater) {
    return {
      label: 'Filter water from the tarn',
      run: () => {
        const r = refill(p, runtime.loadout);
        g.toast(r.text, r.ok ? 'good' : 'info');
      },
    };
  }
  for (const lm of getLandmarks()) {
    if (Math.hypot(p.x - lm.x, p.z - lm.z) < 3.6) {
      if (lm.kind === 'register') {
        return {
          label: runtime.registerSigned ? 'Open the climbers register' : 'Sign the climbers register',
          run: () => g.setRegisterOpen(true),
        };
      }
      return {
        label: lm.kind === 'kiosk' ? 'Read the trailhead kiosk' : 'Read the sign',
        run: () => {
          runtime.readSigns.add(lm.id);
          g.setReading({ title: lm.title, text: lm.text });
        },
      };
    }
  }
  return null;
}

function objectiveFor(p: PlayerState) {
  if (nearSummit(p)) return 'You made it — press Space at the summit benchmark';
  const next = getWorld().checkpoints.find((c) => p.checkpoints[c.id] === undefined);
  return next ? next.objective : 'Reach the summit';
}

export function GameLoop() {
  const hudTimer = useRef(0);
  const keyCam = useRef({ yaw: 0, pitch: 0 });
  const recenterT = useRef(0);
  const navTimer = useRef(0);
  const flags = useRef({ run: -1, thirsty: false, hungry: false, sunrise: false, soft: false, snow: false });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = useGame.getState();
    const p = runtime.player;
    const cam = runtime.cam;

    // Camera input (applies while playing / paused).
    if (g.phase === 'playing' || g.phase === 'paused' || g.phase === 'summit') {
      const keys = g.phase === 'paused' ? { yaw: 0, pitch: 0, zoom: 0 } : cameraKeyAxes();
      const touched = input.lookDX !== 0 || input.lookDY !== 0 || input.zoom !== 0 || input.zoomMul !== 1 || keys.yaw !== 0 || keys.pitch !== 0 || keys.zoom !== 0;
      // Keyboard camera (arrows by default): eased so a tap nudges and a hold turns smoothly.
      const kc = keyCam.current;
      // v0.5.1: 20% slower turn rate and 20% shorter ease-out than v0.5.
      kc.yaw += (keys.yaw - kc.yaw) * (1 - Math.exp(-dt * 12.5));
      kc.pitch += (keys.pitch - kc.pitch) * (1 - Math.exp(-dt * 12.5));
      cam.yaw -= input.lookDX * 0.0055 + kc.yaw * 1.68 * dt;
      cam.pitch = Math.min(1.25, Math.max(-0.2, cam.pitch + input.lookDY * 0.004 + kc.pitch * 0.72 * dt));
      const zoomRate = Math.pow(1.9, keys.zoom * dt);
      cam.dist = Math.min(CAM_MAX, Math.max(CAM_MIN, (cam.dist * (1 + input.zoom * 0.12) * zoomRate) / input.zoomMul));
      // Recenter: glide the camera behind the climber's direction of travel.
      if (input.recenter && p) {
        input.recenter = false;
        recenterT.current = 0.9;
      }
      if (input.lookDX !== 0 || keys.yaw !== 0) recenterT.current = 0;
      if (recenterT.current > 0 && p) {
        recenterT.current -= dt;
        let d = p.heading + Math.PI - cam.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        cam.yaw += d * (1 - Math.exp(-dt * 7));
        // v0.5: a lower, more upward-looking vantage that shows the slope you're climbing.
        cam.pitch += (0.1 - cam.pitch) * (1 - Math.exp(-dt * 5));
        if (cam.dist > 9) cam.dist += (9 - cam.dist) * (1 - Math.exp(-dt * 4));
      }
      if (touched && !runtime.cameraUsed) {
        runtime.cameraUsed = true;
        g.dismissHint();
      }
    }
    input.lookDX = input.lookDY = input.zoom = 0;
    input.zoomMul = 1;

    if (p) {
      const W = getWorld();
      updateWind((p.y - W.hTrailhead) / (W.hSummit - W.hTrailhead), performance.now() / 1000, g.phase === 'playing' || g.phase === 'summit');
    }
    if (!p || g.phase !== 'playing' || overlayOpen(g)) {
      input.queue.length = 0;
      return;
    }
    const l = runtime.loadout;
    const f = flags.current;
    if (f.run !== runtime.runId) {
      flags.current = { run: runtime.runId, thirsty: false, hungry: false, sunrise: daylight(l.departureHour) > 0.5, soft: false, snow: false };
    }

    const interaction = findInteraction(p);
    while (input.queue.length) {
      const a = input.queue.shift()!;
      if (a === 'interact') {
        // Touch button / F: contextual Action near something interactive, otherwise Jump.
        if (interaction) interaction.run();
        else jump(p);
      } else if (a === 'primary') {
        // Space on desktop: act when there is something to act on; otherwise rest when standing
        // still, or hop while moving.
        if (interaction) interaction.run();
        else if (p.speed < 0.6 || p.resting) {
          const r = toggleRest(p);
          g.toast(r.text, r.ok ? 'info' : 'warn');
        } else jump(p);
      } else if (a === 'jump') {
        jump(p);
      } else if (a === 'eat') {
        const r = eat(p);
        g.toast(r.text, r.ok ? 'good' : 'warn', 2);
      } else if (a === 'drink') {
        const r = drink(p);
        g.toast(r.text, r.ok ? 'good' : 'warn', 2);
      } else if (a === 'rest') {
        const r = toggleRest(p);
        g.toast(r.text, r.ok ? 'info' : 'warn');
      }
    }
    if (useGame.getState().phase !== 'playing') return;

    // Camera-relative movement.
    const { fwd, right, jog } = moveAxes();
    const sy = Math.sin(cam.yaw);
    const cy = Math.cos(cam.yaw);
    const ix = -sy * fwd + cy * right;
    const iz = -cy * fwd - sy * right;

    const emit = (e: GameEvent) => {
      if (e.type === 'checkpoint') {
        const msg: Record<string, string> = {
          treeline: 'Treeline reached',
          camp: 'Tarn Camp · last water',
          snow: 'Snowfield · stay on the boot track',
          rim: 'Crater rim · summit is north',
        };
        g.toast(msg[e.id] ?? e.name, 'good', 2);
      } else if (e.type === 'exhausted') {
        cue('warn');
        g.toast('Exhausted · drink, eat or rest', 'warn', 3);
      } else if (e.type === 'gem') {
        runtime.fx.push({ kind: e.kind, x: e.x, y: e.y, z: e.z, t0: performance.now() / 1000 });
        g.flashGem(e.kind);
        cue(e.kind);
        g.toast(e.kind === 'green' ? 'Stamina restored' : `Speed boost · ${SPEED_BOOST.seconds}s`, 'good', 3);
      } else g.toast(e.text, e.tone);
    };
    stepPlayer(p, l, { x: ix, z: iz, jog }, dt, emit);

    // Condition prompts.
    const hour = clockHour(p, l);
    if (!f.thirsty && p.hydration < 35) {
      f.thirsty = true;
      g.toast('Thirsty · drink water', 'warn');
    } else if (p.hydration > 50) f.thirsty = false;
    if (!f.hungry && p.maxStamina < 55) {
      f.hungry = true;
      g.toast('Energy low · eat a bar', 'warn');
    } else if (p.maxStamina > 70) f.hungry = false;
    if (!f.sunrise && daylight(hour) > 0.5) {
      f.sunrise = true;
      g.toast('Sunrise', 'info');
    }
    if (!f.soft && snowSoftness(hour) > 0.4) {
      f.soft = true;
      g.toast('Snow softening', 'warn');
    }
    if (!f.snow && p.postholing) {
      f.snow = true;
      g.toast('Postholing · find the boot track', 'warn');
    }

    hudTimer.current -= dt;
    if (hudTimer.current <= 0) {
      hudTimer.current = 0.1;
      const W = getWorld();
      // Trail status with hysteresis, and a safe way back when straying.
      const nav = runtime.nav;
      const tDist = p.onTrail ? 0 : trailDistance(p.x, p.z);
      stepNav(nav, p.onTrail, 0.1, tDist);
      navTimer.current -= 0.1;
      if (nav.state === 'on') nav.safe = null;
      else if (navTimer.current <= 0 || !nav.safe) {
        navTimer.current = 0.5;
        nav.safe = safeTrailPoint(p.x, p.z);
      }
      const safe = nav.safe;
      const guide = safe
        ? {
            distFt: Math.hypot(safe.x - p.x, safe.z - p.z) * W.miPerUnit * 5280,
            card: cardinal(Math.atan2(safe.x - p.x, safe.z - p.z)),
            rel: (((cam.yaw + Math.PI - Math.atan2(safe.x - p.x, safe.z - p.z)) * 180) / Math.PI + 540) % 360 - 180,
          }
        : null;
      const hud: HudSnapshot = {
        elevFt: elevationFt(p.y),
        gainFt: p.elevGain * W.ftPerUnit,
        distMi: unitsToMiles(p.distance),
        remainMi: unitsToMiles(p.remaining),
        stamina: p.stamina,
        maxStamina: p.maxStamina,
        hydration: p.hydration,
        water: p.water,
        food: p.food,
        packKg: packWeight(l, p.water, p.food),
        clock: hour,
        elapsed: p.gameTime,
        surface: p.onTrail ? (p.snow > 0.5 ? 'Boot track (snow)' : 'Trail') : SURFACE_LABEL[p.surface],
        onTrail: p.onTrail,
        postholing: p.postholing,
        exhausted: p.exhausted,
        resting: p.resting,
        activity: p.activity,
        heading: -cam.yaw,
        objective: objectiveFor(p),
        prompt: interaction ? interaction.label : null,
        progress: 1 - p.remaining / W.main.length,
        x: p.x,
        z: p.z,
        snowSoft: snowSoftness(hour),
        daylight: daylight(hour),
        checkpoints: Object.keys(p.checkpoints),
        boostLeft: Math.max(0, p.boostUntil - p.realTime),
        limiter: p.limiter,
        gemCount: p.gemCounts.green + p.gemCounts.red,
        gemTotal: W.gems.length,
        canAct: !!interaction,
        ...(() => {
          const c = conditionsAt(elevationFt(p.y), hour);
          return { tempF: c.tempF, windMph: c.windMph, weather: c.label };
        })(),
        consumeKind: p.consumeT > 0 ? p.consumeKind : null,
        trailState: nav.state,
        place: placeName(p.x, p.z),
        guide,
        realSeconds: p.realTime,
      };
      g.setHud(hud);
    }
  });
  return null;
}
