// Pumpensimulator - SVG valve clicks

import { state } from './state.js';
import { addLog } from './logger.js';
import { ensureAudioReady, playClickSound } from './audio.js';
import { updatePumpRunningState } from './physics.js';
import { updateSVGSchedulingStates } from './renderer.js';

export function bindControlListeners() {
  const schematic = document.getElementById('schematic-svg');
  if (schematic) {
    schematic.addEventListener(
      'pointerdown',
      () => ensureAudioReady(),
      { once: true, passive: true }
    );
  }
  const pumpEl = document.getElementById('svg-pump');
  if (pumpEl) {
    pumpEl.addEventListener('click', () => ensureAudioReady());
  }

  bindSVGValveClick('fresh-a', 'valveFreshA', 'Freshwater Fill A');
  bindSVGValveClick('fresh-b', 'valveFreshB', 'Freshwater Fill B');
  bindSVGValveClick('fresh-c', 'valveFreshC', 'Freshwater Fill C');
  bindSVGValveClick('feed-a', 'valveFeedA', 'Feed Valve A');
  bindSVGValveClick('feed-b', 'valveFeedB', 'Feed Valve B');
  bindSVGValveClick('feed-c', 'valveFeedC', 'Feed Valve C');
  bindSVGValveClick('return-a', 'valveReturnA', 'Return Valve A');
  bindSVGValveClick('return-b', 'valveReturnB', 'Return Valve B');
  bindSVGValveClick('return-c', 'valveReturnC', 'Return Valve C');
  bindSVGValveClick('water-1', 'valveWater1', 'Watering Zone 1 Valve');
  bindSVGValveClick('water-2', 'valveWater2', 'Watering Zone 2 Valve');
  bindSVGValveClick('water-3', 'valveWater3', 'Watering Zone 3 Valve');
  bindSVGValveClick('water-4', 'valveWater4', 'Watering Zone 4 Valve');

  function bindSVGValveClick(svgIdSuffix, stateKey, name) {
    const el = document.getElementById(`svg-valve-${svgIdSuffix}`);
    if (!el) return;
    el.addEventListener('click', () => {
      ensureAudioReady();
      state[stateKey] = !state[stateKey];
      playClickSound();
      addLog(`${name} is now ${state[stateKey] ? 'OPEN' : 'CLOSED'}`, 'info');
      updatePumpRunningState();
      updateSVGSchedulingStates();
    });
  }
}
