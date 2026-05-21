// Pumpensimulator - Hardware Telemetry & Simulation Physics

import {
  state,
  EXPANSION_PRESSURE_BAR,
  GAUGE_MAX_BAR,
  HIGH_PRESSURE_ALARM_BAR,
  PASSIVE_MIN_PRESSURE_BAR,
  PUMP_FLOW_L_PER_MIN,
  PUMP_CUT_IN_BAR_DEFAULT,
  RETURN_DISCHARGE_L_PER_MIN,
  FEED_EQUALIZE_TAU_SEC,
  SPRINKLER_FLOW_L_PER_MIN
} from './state.js';
import { addLog } from './logger.js';
import { applyZoneWatering, updatePlants } from './plants.js';

/** Max overflow into expansion when pump output exceeds open discharge demand (L/min at 100%). */
const EXPANSION_OVERFLOW_FILL = PUMP_FLOW_L_PER_MIN * 0.2;

export function isExpansionTankFull() {
  return state.expansionTankVolume >= state.expansionTankMax - 0.05;
}

function countSprinklerZones() {
  let n = 0;
  if (state.valveWater1) n++;
  if (state.valveWater2) n++;
  if (state.valveWater3) n++;
  if (state.valveWater4) n++;
  return n;
}

function countReturnValves() {
  let n = 0;
  if (state.valveReturnA) n++;
  if (state.valveReturnB) n++;
  if (state.valveReturnC) n++;
  return n;
}

function countFeedChannelsWithWater() {
  let n = 0;
  if (state.valveFeedA && state.tankA > 0.05) n++;
  if (state.valveFeedB && state.tankB > 0.05) n++;
  if (state.valveFeedC && state.tankC > 0.05) n++;
  return n;
}

function countFeedValvesOpen() {
  let n = 0;
  if (state.valveFeedA) n++;
  if (state.valveFeedB) n++;
  if (state.valveFeedC) n++;
  return n;
}

/** Tanks tied together by open bottom feed (drain-to-pump) valves with water in them. */
function getFeedLinkedTankKeys() {
  const keys = [];
  if (state.valveFeedA && state.tankA > 0.05) keys.push('tankA');
  if (state.valveFeedB && state.tankB > 0.05) keys.push('tankB');
  if (state.valveFeedC && state.tankC > 0.05) keys.push('tankC');
  return keys;
}

/**
 * Bottom feed valves connect tanks on the shared feed header (feedJunc); levels equalize slowly.
 * Runs with or without the pump motor.
 */
function applyFeedHeaderEqualization(dt) {
  const keys = getFeedLinkedTankKeys();
  if (keys.length < 2) return;

  const sum = keys.reduce((s, key) => s + state[key], 0);
  const avg = sum / keys.length;
  const blend = 1 - Math.exp(-dt / FEED_EQUALIZE_TAU_SEC);

  keys.forEach((key) => {
    const next = state[key] + (avg - state[key]) * blend;
    state[key] = Math.max(0, Math.min(state.tankMax, next));
  });
}

function isFeedHeaderEqualizing(spreadLiters = 0.5) {
  const keys = getFeedLinkedTankKeys();
  if (keys.length < 2) return false;
  const avg = keys.reduce((s, key) => s + state[key], 0) / keys.length;
  return keys.some((key) => Math.abs(state[key] - avg) > spreadLiters);
}

/** Motor runs only when water can enter the pump and go somewhere useful. */
function pumpHasHydraulicWork(feedChannels, dischargeChannels) {
  if (feedChannels === 0) return false;
  if (dischargeChannels > 0) return true;
  return !isExpansionTankFull();
}

/** Demand (L/min) vs fixed 5600 L/h pump; scale each outlet when throttled. */
function planDischargeFlow(pressureFactor = 1) {
  const sprinklers = countSprinklerZones();
  const returns = countReturnValves();
  const demand =
    sprinklers * SPRINKLER_FLOW_L_PER_MIN + returns * RETURN_DISCHARGE_L_PER_MIN;
  const capacity = PUMP_FLOW_L_PER_MIN * pressureFactor;
  const flowRate = demand > 0 ? Math.min(capacity, demand) : 0;
  const scale = demand > 0 ? flowRate / demand : 0;

  return {
    sprinklers,
    returns,
    demand,
    capacity,
    flowRate,
    perSprinklerLpm: SPRINKLER_FLOW_L_PER_MIN * scale,
    perReturnLpm: RETURN_DISCHARGE_L_PER_MIN * scale
  };
}

/**
 * Motor on/off: needs feed water + (open discharge or expansion not full).
 * With pressure switch: also start/stop on cut-in / tank full.
 */
export function updatePumpRunningState(
  feedChannels = countFeedChannelsWithWater(),
  dischargeChannels = countSprinklerZones() + countReturnValves()
) {
  if (state.simulationSpeed <= 0) {
    state.pumpRunning = false;
    return;
  }

  if (!pumpHasHydraulicWork(feedChannels, dischargeChannels)) {
    state.pumpRunning = false;
    return;
  }

  if (isExpansionTankFull()) {
    if (state.pumpRunning) {
      addLog('Pump switch: expansion tank full — pump stopped.', 'info');
    }
    state.pumpRunning = false;
    return;
  }

  if (!state.pumpRunning && state.systemPressure < PUMP_CUT_IN_BAR_DEFAULT) {
    state.pumpRunning = true;
    addLog(
      `Pump switch: pressure below ${PUMP_CUT_IN_BAR_DEFAULT.toFixed(1)} bar — pump started.`,
      'info'
    );
  }
}

export function calculateFlowPhysics(dt) {
  const sourceA = state.valveFeedA && state.tankA > 0.05;
  const sourceB = state.valveFeedB && state.tankB > 0.05;
  const sourceC = state.valveFeedC && state.tankC > 0.05;
  const feedChannels = countFeedChannelsWithWater();
  const sprinklersOpen = countSprinklerZones();
  const returnsOpen = countReturnValves();
  const dischargeChannels = sprinklersOpen + returnsOpen;

  updatePumpRunningState(feedChannels, dischargeChannels);

  let flowRate = 0;
  let flowIntoTank = 0;
  let flowOutOfTank = 0;
  let perSprinklerLpm = 0;
  let perReturnLpm = 0;

  if (state.simulationSpeed > 0) {
    if (state.pumpRunning) {
      if (feedChannels === 0) {
        flowRate = 0;
        state.powerDraw = 75;
        state.alarmState = 'DRY_RUN';
      } else if (dischargeChannels === 0) {
        state.alarmState = 'NORMAL';
        state.powerDraw = 210 + state.systemPressure * 2;

        if (!isExpansionTankFull()) {
          flowIntoTank = PUMP_FLOW_L_PER_MIN * (dt / 60);
        }
      } else {
        state.alarmState = 'NORMAL';
        const plan = planDischargeFlow();
        flowRate = plan.flowRate;
        perSprinklerLpm = plan.perSprinklerLpm;
        perReturnLpm = plan.perReturnLpm;
        state.powerDraw =
          210 + (flowRate / PUMP_FLOW_L_PER_MIN) * 280 + state.systemPressure * 0.5;

        const excess = plan.capacity - plan.demand;
        if (excess > 0.01 && !isExpansionTankFull()) {
          flowIntoTank = Math.min(excess, EXPANSION_OVERFLOW_FILL) * (dt / 60);
        }
      }
    } else {
      state.powerDraw = state.pumpRunning ? 0 : 3;

      if (
        dischargeChannels > 0 &&
        state.expansionTankVolume > 0.05 &&
        state.systemPressure > PASSIVE_MIN_PRESSURE_BAR
      ) {
        const pressureFactor = state.systemPressure / EXPANSION_PRESSURE_BAR;
        const plan = planDischargeFlow(pressureFactor);
        flowRate = plan.flowRate;
        perSprinklerLpm = plan.perSprinklerLpm;
        perReturnLpm = plan.perReturnLpm;
        flowOutOfTank = flowRate * (dt / 60);
      } else {
        flowRate = 0;
      }
      
      // Check for high pressure alarm if pressure switch is disabled
      if (state.systemPressure > HIGH_PRESSURE_ALARM_BAR) {
        state.alarmState = 'HIGH_PRESSURE';
      } else {
        state.alarmState = 'NORMAL';
      }
    }
  } else {
    state.powerDraw = 0;
    state.alarmState = 'NORMAL';
  }
  
  state.flowRate = flowRate;
  state.sprinklerLpmPerZone = perSprinklerLpm;
  
  // 6. Tank Volume & Pressure updates
  if (flowIntoTank > 0) {
    state.expansionTankVolume = Math.min(state.expansionTankMax, state.expansionTankVolume + flowIntoTank);
  } else if (flowOutOfTank > 0) {
    state.expansionTankVolume = Math.max(0, state.expansionTankVolume - flowOutOfTank);
  }
  
  // Update pressure based on expansion volume
  state.systemPressure =
    (state.expansionTankVolume / state.expansionTankMax) * EXPANSION_PRESSURE_BAR;
  if (state.pumpRunning && dischargeChannels === 0) {
    // Deadheaded pump builds extra head pressure
    state.systemPressure = Math.min(
      GAUGE_MAX_BAR,
      state.systemPressure + 1.0 * dt
    );
  } else if (!state.pumpRunning && state.expansionTankVolume <= 0.01) {
    // Pressure bleeds to 0 when tank is empty
    state.systemPressure = Math.max(0, state.systemPressure - 1.4 * dt);
  }

  // Set alarm states for overpressure
  if (state.systemPressure >= HIGH_PRESSURE_ALARM_BAR) {
    state.alarmState = 'HIGH_PRESSURE';
  }

  updatePumpRunningState(feedChannels, dischargeChannels);

  // 7. Fluid transfer application
  if (flowRate > 0 || flowIntoTank > 0 || flowOutOfTank > 0) {
    const totalLitersTransferred = flowRate * (dt / 60);
    state.totalWaterConsumed += totalLitersTransferred;
    
    // Draw from feeds (only if pump is running)
    const activeFeeds = [];
    if (sourceA) activeFeeds.push('tankA');
    if (sourceB) activeFeeds.push('tankB');
    if (sourceC) activeFeeds.push('tankC');
    
    if (activeFeeds.length > 0 && state.pumpRunning) {
      const pullTotal = Math.max(0, totalLitersTransferred + flowIntoTank - flowOutOfTank);
      const pullPerSource = pullTotal / activeFeeds.length;
      activeFeeds.forEach(source => {
        state[source] = Math.max(0, state[source] - pullPerSource);
      });
    }
    
    // Distribute to open return valves and watering zones
    const activeDischarges = [];
    if (state.valveReturnA) activeDischarges.push({ type: 'return', key: 'tankA' });
    if (state.valveReturnB) activeDischarges.push({ type: 'return', key: 'tankB' });
    if (state.valveReturnC) activeDischarges.push({ type: 'return', key: 'tankC' });
    if (state.valveWater1) activeDischarges.push({ type: 'water', index: 0 });
    if (state.valveWater2) activeDischarges.push({ type: 'water', index: 1 });
    if (state.valveWater3) activeDischarges.push({ type: 'water', index: 2 });
    if (state.valveWater4) activeDischarges.push({ type: 'water', index: 3 });
    
    if (activeDischarges.length > 0) {
      activeDischarges.forEach(dest => {
        const destLpm = dest.type === 'water' ? perSprinklerLpm : perReturnLpm;
        const liters = destLpm * (dt / 60);
        if (dest.type === 'return') {
          state[dest.key] = Math.min(state.tankMax, state[dest.key] + liters);
          if (state[dest.key] >= state.tankMax && Math.random() < 0.01) {
            addLog(
              `Warning: ${dest.key.toUpperCase()} has reached maximum capacity (overflow/recirculation bypassed)!`,
              'warn'
            );
          }
        }
      });
    }
  }

  const zoneLiters = [0, 0, 0, 0];
  if (perSprinklerLpm > 0) {
    const litersEach = perSprinklerLpm * (dt / 60);
    if (state.valveWater1) zoneLiters[0] = litersEach;
    if (state.valveWater2) zoneLiters[1] = litersEach;
    if (state.valveWater3) zoneLiters[2] = litersEach;
    if (state.valveWater4) zoneLiters[3] = litersEach;
  }
  applyZoneWatering(zoneLiters);

  applyFreshwaterFill(dt);

  if (state.simulationSpeed > 0 && countFeedValvesOpen() >= 2) {
    applyFeedHeaderEqualization(dt);
  }

  updateFlowPaths({
    sourceA,
    sourceB,
    sourceC,
    feedChannels,
    dischargeChannels,
    flowRate,
    flowIntoTank,
    flowOutOfTank
  });

  updatePlants(dt);
}

/** L/min per open fresh fill valve — fast municipal fill into small tanks. */
const FRESHWATER_FILL_RATE = 150;

export function applyFreshwaterFill(dt) {
  if (state.simulationSpeed <= 0) return;

  const litersPerTick = (FRESHWATER_FILL_RATE / 60) * dt;
  const tanks = [
    { valve: state.valveFreshA, key: 'tankA', label: 'A' },
    { valve: state.valveFreshB, key: 'tankB', label: 'B' },
    { valve: state.valveFreshC, key: 'tankC', label: 'C' }
  ];

  tanks.forEach(({ valve, key, label }) => {
    if (!valve || state[key] >= state.tankMax - 0.01) return;
    const added = Math.min(litersPerTick, state.tankMax - state[key]);
    state[key] += added;
    state.totalWaterConsumed += added;
    if (state[key] >= state.tankMax - 0.01 && Math.random() < 0.02) {
      addLog(`Freshwater fill: Tank ${label} is full`, 'success');
    }
  });
}

export function resetFlowPaths() {
  Object.keys(state.flowPaths).forEach((key) => {
    state.flowPaths[key] = false;
  });
  Object.keys(state.flowReverse).forEach((key) => {
    state.flowReverse[key] = false;
  });
}

/** Per-tank flow direction for passive feed-header equalization (paths drawn toward feedJunc). */
function getFeedEqualizationDirections() {
  const keys = getFeedLinkedTankKeys();
  const tanks = {};
  if (keys.length < 2 || !isFeedHeaderEqualizing()) {
    return tanks;
  }

  const avg = keys.reduce((s, key) => s + state[key], 0) / keys.length;
  keys.forEach((key) => {
    const vol = state[key];
    tanks[key] = {
      active: Math.abs(vol - avg) > 0.25,
      /** Reverse animation = water into tank (path segment points away from tank). */
      intoTank: vol < avg - 0.25,
      outFromTank: vol > avg + 0.25
    };
  });
  return tanks;
}

function applyFeedPipeVisualization({ pumpFromFeeds, feedManifoldActive, sourceA, sourceB, sourceC }) {
  const eq = feedManifoldActive ? getFeedEqualizationDirections() : {};
  const tanks = [
    { key: 'tankA', source: sourceA, valve: state.valveFeedA, port: 'feedPortA', trunk: 'feedA' },
    { key: 'tankB', source: sourceB, valve: state.valveFeedB, port: 'feedPortB', trunk: 'feedB' },
    { key: 'tankC', source: sourceC, valve: state.valveFeedC, port: 'feedPortC', trunk: 'feedC' }
  ];

  tanks.forEach(({ key, source, valve, port, trunk }) => {
    state.flowPaths[port] = false;
    state.flowPaths[trunk] = false;
    state.flowReverse[port] = false;
    state.flowReverse[trunk] = false;

    if (!valve || !source) return;

    if (pumpFromFeeds) {
      state.flowPaths[port] = true;
      state.flowPaths[trunk] = true;
      state.flowReverse[port] = false;
      state.flowReverse[trunk] = false;
    } else if (eq[key]?.active) {
      state.flowPaths[port] = true;
      state.flowPaths[trunk] = true;
      state.flowReverse[port] = eq[key].intoTank;
      state.flowReverse[trunk] = eq[key].intoTank;
    }
  });

  state.flowPaths.pumpIntake = pumpFromFeeds;
  state.flowReverse.pumpIntake = false;
}

/** Derive SVG pipe highlights from the same conditions as the flow model. */
function updateFlowPaths({ sourceA, sourceB, sourceC, feedChannels, dischargeChannels, flowRate, flowIntoTank, flowOutOfTank }) {
  const sim = state.simulationSpeed > 0;
  const dryRun = sim && state.pumpRunning && feedChannels === 0;
  const deadheadCharge = sim && state.pumpRunning && feedChannels > 0 && dischargeChannels === 0;
  const pumpedDischarge = sim && state.pumpRunning && feedChannels > 0 && dischargeChannels > 0 && flowRate > 0.01;
  const passiveDischarge = sim && !state.pumpRunning && dischargeChannels > 0 && flowRate > 0.01;

  const fluidCirculating = sim && !dryRun && (pumpedDischarge || deadheadCharge || passiveDischarge);
  const pumpFromFeeds = sim && state.pumpRunning && feedChannels > 0 && !dryRun;
  const pumpOutletActive = fluidCirculating && (pumpFromFeeds || passiveDischarge);

  const returnOpen = state.valveReturnA || state.valveReturnB || state.valveReturnC;
  const waterOpen = state.valveWater1 || state.valveWater2 || state.valveWater3 || state.valveWater4;
  const recircFromPump =
    pumpOutletActive && returnOpen && (pumpedDischarge || passiveDischarge);
  const recircRoute = recircFromPump;
  const waterRoute = pumpOutletActive && waterOpen && (pumpedDischarge || passiveDischarge);

  const feedManifoldActive = sim && countFeedValvesOpen() >= 2 && isFeedHeaderEqualizing();

  const freshA = sim && state.valveFreshA && state.tankA < state.tankMax - 0.01;
  const freshB = sim && state.valveFreshB && state.tankB < state.tankMax - 0.01;
  const freshC = sim && state.valveFreshC && state.tankC < state.tankMax - 0.01;
  const freshAny = freshA || freshB || freshC;

  const expansionInto = deadheadCharge || flowIntoTank > 0;
  const expansionOut = flowOutOfTank > 0;
  const expansionLineActive = sim && !dryRun && (expansionInto || expansionOut);

  const waterManifoldActive = waterRoute && waterOpen;

  state.flowPaths = {
    freshTrunk: freshAny,
    freshHdrB: freshB || freshC,
    freshHdrC: freshC,
    freshDropA: freshA,
    freshDropB: freshB,
    freshDropC: freshC,
    feedPortA: false,
    feedPortB: false,
    feedPortC: false,
    feedA: false,
    feedB: false,
    feedC: false,
    pumpIntake: false,
    pumpDischarge: pumpFromFeeds,
    pumpDrop: waterManifoldActive,
    maniRecircBus: recircFromPump,
    maniWestTrunk:
      waterManifoldActive && (state.valveWater1 || state.valveWater2),
    maniWestExt: waterManifoldActive && state.valveWater1,
    maniEastTrunk:
      waterManifoldActive && (state.valveWater3 || state.valveWater4),
    maniEastExt: waterManifoldActive && state.valveWater4,
    expansionLine: expansionLineActive,
    expansionLineReverse: expansionLineActive && expansionOut > expansionInto,
    recircRise: recircRoute,
    recircHeaderEntry: recircRoute && returnOpen,
    /** Header runs past closed return valves to reach farther tanks. */
    recircHdrA: recircRoute && (state.valveReturnB || state.valveReturnC),
    recircHdrB: recircRoute && state.valveReturnC,
    recircPortA: recircRoute && state.valveReturnA,
    recircPortB: recircRoute && state.valveReturnB,
    recircPortC: recircRoute && state.valveReturnC,
    recircStubA: recircRoute && state.valveReturnA,
    recircStubB: recircRoute && state.valveReturnB,
    recircStubC: recircRoute && state.valveReturnC,
    waterZone1: waterRoute && state.valveWater1,
    waterZone2: waterRoute && state.valveWater2,
    waterZone3: waterRoute && state.valveWater3,
    waterZone4: waterRoute && state.valveWater4
  };

  state.flowReverse.expansionLine = state.flowPaths.expansionLineReverse;

  applyFeedPipeVisualization({
    pumpFromFeeds,
    feedManifoldActive,
    sourceA,
    sourceB,
    sourceC
  });
}
