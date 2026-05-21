// Pumpensimulator - SVG and DOM Dashboard Synchronous Renderer

import { getPlantMood } from './plants.js';
import { state, GAUGE_MAX_BAR } from './state.js';

export function updateSVGSchedulingStates() {
  // Sync Valve Rotation classes in SVG
  syncSVGValve('fresh-a', state.valveFreshA);
  syncSVGValve('fresh-b', state.valveFreshB);
  syncSVGValve('fresh-c', state.valveFreshC);

  syncSVGValve('feed-a', state.valveFeedA);
  syncSVGValve('feed-b', state.valveFeedB);
  syncSVGValve('feed-c', state.valveFeedC);
  
  syncSVGValve('return-a', state.valveReturnA);
  syncSVGValve('return-b', state.valveReturnB);
  syncSVGValve('return-c', state.valveReturnC);
  
  syncSVGValve('water-1', state.valveWater1);
  syncSVGValve('water-2', state.valveWater2);
  syncSVGValve('water-3', state.valveWater3);
  syncSVGValve('water-4', state.valveWater4);
  
  syncPumpMotorSVG();
}

/** One full rotor turn at ramp=1 and 1× sim speed (seconds). */
const PUMP_ROTOR_REV_SEC = 0.8;

let pumpRotorDeg = 0;
let lastPumpRotorTime = 0;

/** Pump rotor — angle integrated from pumpRamp (avoids CSS duration restarts on stop). */
export function syncPumpMotorSVG() {
  const pumpSvg = document.getElementById('svg-pump');
  const rotorGroup = document.getElementById('svg-pump-rotor-group');
  if (!pumpSvg || !rotorGroup) return;

  const ramp = state.pumpRamp;
  const active = ramp > 0.02 && state.simulationSpeed > 0;
  const now = performance.now();

  if (active && lastPumpRotorTime > 0) {
    const dtSec = Math.min(0.1, (now - lastPumpRotorTime) / 1000);
    const degPerSec = (360 / PUMP_ROTOR_REV_SEC) * ramp * state.simulationSpeed;
    pumpRotorDeg = (pumpRotorDeg + degPerSec * dtSec) % 360;
  }

  lastPumpRotorTime = now;
  pumpSvg.classList.toggle('pump-active', active);

  if (active) {
    rotorGroup.style.transform = `rotate(${pumpRotorDeg}deg)`;
  } else {
    pumpRotorDeg = 0;
    lastPumpRotorTime = 0;
    rotorGroup.style.transform = '';
  }
}

export function syncSVGValve(valveKey, isOpen) {
  const valveEl = document.getElementById(`svg-valve-${valveKey}`);
  if (valveEl) {
    if (isOpen) {
      valveEl.classList.add('valve-open');
    } else {
      valveEl.classList.remove('valve-open');
    }
  }
}

export function updateExpansionTankSVG() {
  // Gauge needle: -135deg = 0 bar, +135deg = GAUGE_MAX_BAR (270deg sweep)
  const needle = document.getElementById('svg-gauge-needle');
  if (needle) {
    const angle = -135 + (state.systemPressure / GAUGE_MAX_BAR) * 270;
    needle.setAttribute('transform', `rotate(${angle.toFixed(1)})`);
  }
  const gaugeVal = document.getElementById('svg-gauge-val');
  if (gaugeVal) gaugeVal.textContent = state.systemPressure.toFixed(1);

  // Expansion tank water level (body y=-70..0; connection pipe is in plumbing-graph)
  const expWater = document.getElementById('svg-expansion-water');
  if (expWater) {
    const fillPct = Math.min(1, state.expansionTankVolume / state.expansionTankMax);
    const maxH = 62; // inner fill height (leaves ~4px margin top/bottom)
    const h = fillPct * maxH;
    expWater.setAttribute('height', h.toFixed(1));
    expWater.setAttribute('y', (-4 - h).toFixed(1));
  }

  // Percentage label on tank
  const expPct = document.getElementById('svg-expansion-pct');
  if (expPct) {
    const pct = Math.round((state.expansionTankVolume / state.expansionTankMax) * 100);
    expPct.textContent = `${pct}%`;
  }

  setPipeState('fluid-expansion-line', state.flowPaths.expansionLine, {
    reverse: state.flowReverse.expansionLine || state.flowPaths.expansionLineReverse
  });
}

export function renderSVGSynchronousPhysics() {
  syncPumpMotorSVG();

  // 1. Render tank liquid heights and text
  updateSVGTank('a', state.tankA);
  updateSVGTank('b', state.tankB);
  updateSVGTank('c', state.tankC);
  
  // 2. Pipe highlights — driven by physics flowPaths (see updateFlowPaths in physics.js)
  const p = state.flowPaths;
  const rev = state.flowReverse;
  setPipeState('fluid-fresh-trunk', p.freshTrunk);
  setPipeState('fluid-fresh-hdr-b', p.freshHdrB);
  setPipeState('fluid-fresh-hdr-c', p.freshHdrC);
  setPipeState('fluid-fresh-drop-a', p.freshDropA);
  setPipeState('fluid-fresh-drop-b', p.freshDropB);
  setPipeState('fluid-fresh-drop-c', p.freshDropC);
  setPipeState('fluid-feed-port-a', p.feedPortA, { reverse: rev.feedPortA });
  setPipeState('fluid-feed-port-b', p.feedPortB, { reverse: rev.feedPortB });
  setPipeState('fluid-feed-port-c', p.feedPortC, { reverse: rev.feedPortC });
  setPipeState('fluid-feed-a', p.feedA, { reverse: rev.feedA });
  setPipeState('fluid-feed-b', p.feedB, { reverse: rev.feedB });
  setPipeState('fluid-feed-c', p.feedC, { reverse: rev.feedC });
  setPipeState('fluid-pump-intake', p.pumpIntake, { reverse: rev.pumpIntake });
  setPipeState('fluid-pump-discharge', p.pumpDischarge);
  setPipeState('fluid-pump-drop', p.pumpDrop);
  setPipeState('fluid-mani-recirc-bus', p.maniRecircBus);
  setPipeState('fluid-mani-west-trunk', p.maniWestTrunk);
  setPipeState('fluid-mani-west-ext', p.maniWestExt);
  setPipeState('fluid-mani-east-trunk', p.maniEastTrunk);
  setPipeState('fluid-mani-east-ext', p.maniEastExt);
  setPipeState('fluid-recirc-rise', p.recircRise);
  setPipeState('fluid-recirc-header-entry', p.recircHeaderEntry);
  setPipeState('fluid-recirc-hdr-a', p.recircHdrA);
  setPipeState('fluid-recirc-hdr-b', p.recircHdrB);
  setPipeState('fluid-recirc-port-a', p.recircPortA);
  setPipeState('fluid-recirc-port-b', p.recircPortB);
  setPipeState('fluid-recirc-port-c', p.recircPortC);
  setPipeState('fluid-recirc-stub-a', p.recircStubA);
  setPipeState('fluid-recirc-stub-b', p.recircStubB);
  setPipeState('fluid-recirc-stub-c', p.recircStubC);
  setPipeState('fluid-water-zone-1', p.waterZone1);
  setPipeState('fluid-water-zone-2', p.waterZone2);
  setPipeState('fluid-water-zone-3', p.waterZone3);
  setPipeState('fluid-water-zone-4', p.waterZone4);
  
  for (let z = 1; z <= 4; z++) {
    syncSVGPlantZone(z, p[`waterZone${z}`]);
  }
}

export function updateSVGTank(tankKey, volume) {
  const waterRect = document.getElementById(`tank-${tankKey}-water`);
  const textEl = document.getElementById(`tank-${tankKey}-volume-text`);
  if (!waterRect || !textEl) return;
  
  // SVG level formulas
  const fillPct = volume / state.tankMax;
  const maxHeight = 174; // 180 - padding margins
  const height = fillPct * maxHeight;
  const y = 277 - height;
  
  waterRect.setAttribute('height', height);
  waterRect.setAttribute('y', y);
  
  if (volume <= 0.5) {
    waterRect.classList.add('tank-water-empty');
  } else {
    waterRect.classList.remove('tank-water-empty');
  }
  
  textEl.textContent = `${Math.round(volume)} L`;
}

export function setPipeState(pipeId, isActive, { reverse = false } = {}) {
  const path = document.getElementById(pipeId);
  if (!path) return;
  path.classList.toggle('pipe-active', isActive);
  path.classList.toggle('pipe-reverse', isActive && reverse);
}

const POT_DRIP_CFG = [
  { cx: -9, y0: 17, y1: 34, dur: 0.95, delay: 0, lineX: -9 },
  { cx: 0, y0: 18, y1: 35, dur: 0.85, delay: 0.3, lineX: 0 },
  { cx: 9, y0: 17, y1: 34, dur: 1, delay: 0.55, lineX: 9 }
];

function tickPotDrips(dripsEl) {
  const t = performance.now() / 1000;
  const circles = dripsEl.querySelectorAll('.pot-drip');
  const streaks = dripsEl.querySelectorAll('.pot-drip-streak');
  POT_DRIP_CFG.forEach((cfg, i) => {
    const elapsed = t - cfg.delay;
    const phase = elapsed <= 0 ? 0 : (elapsed % cfg.dur) / cfg.dur;
    const cy = cfg.y0 + (cfg.y1 - cfg.y0) * phase;
    const opacity =
      phase < 0.12 ? phase / 0.12 : phase > 0.82 ? (1 - phase) / 0.18 : 1;
    const circle = circles[i];
    const streak = streaks[i];
    if (circle) {
      circle.setAttribute('cy', cy.toFixed(1));
      circle.setAttribute('opacity', opacity.toFixed(2));
    }
    if (streak) {
      streak.setAttribute('x1', cfg.lineX);
      streak.setAttribute('x2', cfg.lineX);
      streak.setAttribute('y1', cfg.y0);
      streak.setAttribute('y2', cy.toFixed(1));
      streak.setAttribute('opacity', (opacity * 0.9).toFixed(2));
    }
  });
}

export function syncSVGPlantZone(zoneId, isWatering) {
  const zoneGroup = document.getElementById(`zone-${zoneId}-group`);
  const sprayGroup = document.getElementById(`spray-${zoneId}`);
  const plant = state.plants[zoneId - 1];
  if (!zoneGroup || !sprayGroup || !plant) return;

  if (isWatering) {
    sprayGroup.classList.add('spraying');
  } else {
    sprayGroup.classList.remove('spraying');
  }

  const mood = getPlantMood(plant);
  zoneGroup.classList.toggle('plant-dead', mood === 'dead');
  zoneGroup.classList.toggle('plant-dry', mood === 'thirsty');
  zoneGroup.classList.toggle('plant-overwatered', mood === 'overwatered');
  zoneGroup.classList.toggle('plant-healthy', mood === 'happy');

  const drips = document.getElementById(`plant-${zoneId}-drips`);
  if (drips) {
    const showDrips = mood === 'overwatered';
    drips.classList.toggle('is-active', showDrips);
    if (showDrips) {
      drips.removeAttribute('visibility');
      drips.style.visibility = 'visible';
      drips.style.opacity = '1';
      tickPotDrips(drips);
    } else {
      drips.setAttribute('visibility', 'hidden');
      drips.style.visibility = 'hidden';
      drips.style.opacity = '0';
    }
  }

  const thirstFill = document.getElementById(`plant-${zoneId}-thirst`);
  if (thirstFill) {
    const w = Math.max(0, Math.min(36, (plant.hydration / 100) * 36));
    thirstFill.setAttribute('width', w.toFixed(1));
  }

  const statusEl = document.getElementById(`plant-${zoneId}-status`);
  if (statusEl) {
    const labels = {
      dead: 'DEAD',
      thirsty: 'THIRSTY',
      overwatered: 'TOO WET',
      stressed: 'OK',
      happy: 'GROWING'
    };
    statusEl.textContent = labels[mood];
  }

  const foliage = document.getElementById(`plant-${zoneId}-foliage`);
  if (foliage) {
    let scale = plant.growth;
    let wilt = 1;
    let droop = 0;
    if (mood === 'dead') {
      scale = 0.22;
      wilt = 0.7;
      droop = 14;
    } else if (mood === 'thirsty') {
      wilt = 0.82;
      droop = 10;
    } else if (mood === 'overwatered') {
      wilt = 0.92;
      droop = 4;
    } else if (mood === 'happy') {
      wilt = 1.05;
    }
    foliage.setAttribute(
      'transform',
      `translate(0, 15) rotate(${droop}) scale(${scale}, ${scale * wilt}) translate(0, -15)`
    );
  }
}

