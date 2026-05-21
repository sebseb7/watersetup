// Pumpensimulator - Shared State Management

import { createDefaultPlants } from './plants.js';

/** Pressure limits (bar) — used by physics, gauge, and alarms. */
export const GAUGE_MAX_BAR = 5.5;
export const EXPANSION_PRESSURE_BAR = 4;
export const HIGH_PRESSURE_ALARM_BAR = 5;
export const PASSIVE_MIN_PRESSURE_BAR = 0.15;

/** Pump hysteresis: start when pressure falls below cut-in; stop when expansion tank is full. */
export const PUMP_CUT_IN_BAR_DEFAULT = 1.5;

/** Motor ramp times (seconds at 1× sim speed) for soft start / stop. */
export const PUMP_SOFT_START_SEC = 2.5;
export const PUMP_SOFT_STOP_SEC = 3.5;

/** Rated hydraulic flows (simulation uses L/min internally). */
export const PUMP_FLOW_L_PER_H = 5600;
export const SPRINKLER_FLOW_L_PER_H = 800;
/** Return/recirc outlets use the same nominal rate unless modeled separately later. */
export const RETURN_DISCHARGE_L_PER_H = 800;

export const PUMP_FLOW_L_PER_MIN = PUMP_FLOW_L_PER_H / 60;
export const SPRINKLER_FLOW_L_PER_MIN = SPRINKLER_FLOW_L_PER_H / 60;
export const RETURN_DISCHARGE_L_PER_MIN = RETURN_DISCHARGE_L_PER_H / 60;

/** Time constant (seconds) for feed-header balancing between tanks (bottom drain valves → pump). */
export const FEED_EQUALIZE_TAU_SEC = 45;

/** Storage tanks A/B/C capacity (liters only — SVG size unchanged). */
export const TANK_CAPACITY_L = 250;

export const state = {
  // Simulation settings
  simulationSpeed: 1, // 0 = paused, 1 = 1x, 2 = 2x, 5 = 5x
  soundEnabled: true,
  
  // Tanks (liters; SVG size unchanged)
  tankA: 250,
  tankB: 250,
  tankC: 250,
  tankMax: TANK_CAPACITY_L,
  
  // Valves (false = closed, true = open)
  valveFeedA: false,
  valveFeedB: false,
  valveFeedC: false,
  
  valveReturnA: false,
  valveReturnB: false,
  valveReturnC: false,

  valveFreshA: false,
  valveFreshB: false,
  valveFreshC: false,
  
  valveWater1: false,
  valveWater2: false,
  valveWater3: false,
  valveWater4: false,
  
  // Pump (always enabled; motor run state follows pressure switch / tank level)
  pumpRunning: false,
  /** 0–1 motor ramp (flow, power, rotor, audio); eases toward pumpRunning. */
  pumpRamp: 0,
  
  // Pressure & Expansion Tank
  systemPressure: 0, // bar
  expansionTankVolume: 0, // Current water in Liters
  expansionTankMax: 10, // Max expansion volume in Liters
  
  // Calculated Telemetry
  flowRate: 0, // L/min (total leaving pump / expansion header)
  sprinklerLpmPerZone: 0, // L/min per open watering zone this tick
  returnLpmPerOutlet: 0, // L/min per open return/recirc valve this tick
  powerDraw: 0, // Watts
  totalWaterConsumed: 0, // Liters
  alarmState: 'NORMAL', // 'NORMAL', 'DRY_RUN', 'HIGH_PRESSURE'
  
  // SVG pipe highlights (synced from physics each tick)
  flowPaths: {
    freshTrunk: false,
    freshHdrB: false,
    freshHdrC: false,
    freshDropA: false,
    freshDropB: false,
    freshDropC: false,
    feedPortA: false,
    feedPortB: false,
    feedPortC: false,
    feedA: false,
    feedB: false,
    feedC: false,
    pumpIntake: false,
    pumpDischarge: false,
    pumpDrop: false,
    maniRecircBus: false,
    maniWestTrunk: false,
    maniWestExt: false,
    maniEastTrunk: false,
    maniEastExt: false,
    expansionLine: false,
    /** true = animate toward pump (tank draining); path is drawn pump → tank */
    expansionLineReverse: false,
    recircRise: false,
    recircHeaderEntry: false,
    recircHdrA: false,
    recircHdrB: false,
    recircPortA: false,
    recircPortB: false,
    recircPortC: false,
    recircStubA: false,
    recircStubB: false,
    recircStubC: false,
    waterZone1: false,
    waterZone2: false,
    waterZone3: false,
    waterZone4: false
  },

  /** Dash animation direction for fluid paths (see pipe-reverse in CSS). */
  flowReverse: {
    feedPortA: false,
    feedPortB: false,
    feedPortC: false,
    feedA: false,
    feedB: false,
    feedC: false,
    expansionLine: false
  },
  
  plants: createDefaultPlants()
};
