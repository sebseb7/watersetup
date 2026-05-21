// Pumpensimulator - Simulation Engine Main Entry Point

import { state } from './state.js';
import { addLog } from './logger.js';
import { updateSynthNodes } from './audio.js';
import { calculateFlowPhysics, resetFlowPaths, updatePumpRunningState } from './physics.js';
import { renderSVGSynchronousPhysics, updateSVGSchedulingStates, updateExpansionTankSVG } from './renderer.js';
import { bindControlListeners } from './events.js';
import { mountPlumbing } from './plumbing-graph.js';
import { applySchematicViewBox, bindSchematicFit, fitSchematic } from './fit-schematic.js';

let lastTime = performance.now();

function simLoop(timeNow) {
  requestAnimationFrame(simLoop);
  
  let dt = (timeNow - lastTime) / 1000; // in seconds
  lastTime = timeNow;
  
  // Limit extreme deltas (tab suspended/unfocused)
  if (dt > 1) dt = 1;
  
  // Apply speed scaling
  dt *= state.simulationSpeed;
  
  if (state.simulationSpeed > 0) {
    calculateFlowPhysics(dt);
  } else {
    // Stalled stats when paused
    state.flowRate = 0;
    state.sprinklerLpmPerZone = 0;
    state.powerDraw = 0;
    resetFlowPaths();
  }
  
  renderSVGSynchronousPhysics();
  updateExpansionTankSVG();
  updateSynthNodes();
}

// --- INIT APP RUNNER ---
window.addEventListener('DOMContentLoaded', () => {
  addLog('System online.', 'success');
  mountPlumbing();
  applySchematicViewBox();
  bindSchematicFit();
  fitSchematic();
  if (import.meta.hot) {
    import.meta.hot.accept('./plumbing-graph.js', () => {
      mountPlumbing();
      fitSchematic();
    });
  }
  bindControlListeners();
  updatePumpRunningState();
  updateSVGSchedulingStates();
  
  // Start loop
  requestAnimationFrame(simLoop);
});
