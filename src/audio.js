// Pumpensimulator - Web Audio API Synthesis Engine

import { state, RETURN_DISCHARGE_L_PER_MIN, SPRINKLER_FLOW_L_PER_MIN } from './state.js';
import { FRESHWATER_FILL_RATE } from './physics.js';
import { addLog } from './logger.js';

let audioCtx = null;
let alarmOsc = null;
let alarmGain = null;
let sprayGain = null;
/** @type {{ master: GainNode; trickleGain: GainNode; streamGain: GainNode } | null} */
let tankDrip = null;

/** @type {ReturnType<typeof buildPumpGraph> | null} */
let pump = null;
let pumpWasRunning = false;

/** Per zone with real flow — sprinkler hiss level (master gain). */
const SPRAY_GAIN_PER_ZONE = 0.078;
const SPRAY_FLOW_MIN_LPM = 0.2;
const TANK_DRIP_FLOW_MIN_LPM = 0.15;

function buildTankDripGraph(ctx) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(1, ctx.currentTime);

  const trickleNoise = ctx.createBufferSource();
  trickleNoise.buffer = makeLoopingNoiseBuffer(ctx, 2);
  trickleNoise.loop = true;

  const trickleHpf = ctx.createBiquadFilter();
  trickleHpf.type = 'highpass';
  trickleHpf.frequency.setValueAtTime(600, ctx.currentTime);

  const trickleBp = ctx.createBiquadFilter();
  trickleBp.type = 'bandpass';
  trickleBp.frequency.setValueAtTime(1400, ctx.currentTime);
  trickleBp.Q.setValueAtTime(0.45, ctx.currentTime);

  const trickleGain = ctx.createGain();
  trickleGain.gain.setValueAtTime(0, ctx.currentTime);

  trickleNoise.connect(trickleHpf);
  trickleHpf.connect(trickleBp);
  trickleBp.connect(trickleGain);
  trickleGain.connect(master);

  const streamNoise = ctx.createBufferSource();
  streamNoise.buffer = makeLoopingNoiseBuffer(ctx, 1.2);
  streamNoise.loop = true;

  const streamLpf = ctx.createBiquadFilter();
  streamLpf.type = 'lowpass';
  streamLpf.frequency.setValueAtTime(2400, ctx.currentTime);

  const streamGain = ctx.createGain();
  streamGain.gain.setValueAtTime(0, ctx.currentTime);

  streamNoise.connect(streamLpf);
  streamLpf.connect(streamGain);
  streamGain.connect(master);

  master.connect(ctx.destination);

  trickleNoise.start();
  streamNoise.start();

  return { master, trickleGain, streamGain };
}

/** Fill + recirc at tank tops — counts and strength from flowPaths. */
function getTankDripState() {
  const p = state.flowPaths;
  const retLpm = state.returnLpmPerOutlet || 0;
  const retFactor =
    retLpm >= TANK_DRIP_FLOW_MIN_LPM ? Math.min(1, retLpm / RETURN_DISCHARGE_L_PER_MIN) : 0;

  let freshCount = 0;
  if (p.freshDropA) freshCount++;
  if (p.freshDropB) freshCount++;
  if (p.freshDropC) freshCount++;

  let recircCount = 0;
  if (p.recircStubA && retFactor > 0) recircCount++;
  if (p.recircStubB && retFactor > 0) recircCount++;
  if (p.recircStubC && retFactor > 0) recircCount++;

  const intensity = freshCount * 0.55 + recircCount * 0.5 * retFactor;
  return { intensity, freshCount, recircCount, retFactor };
}

function updateTankDripAudio(now) {
  if (!tankDrip) return;

  const active =
    state.simulationSpeed > 0 && state.alarmState === 'NORMAL';
  const { intensity, freshCount, recircCount, retFactor } = getTankDripState();

  if (!active || intensity < 0.05) {
    tankDrip.trickleGain.gain.setTargetAtTime(0, now, 0.06);
    tankDrip.streamGain.gain.setTargetAtTime(0, now, 0.06);
    return;
  }

  const fillActive = freshCount > 0;
  const recircActive = recircCount > 0;

  tankDrip.trickleGain.gain.setTargetAtTime(
    recircActive ? 0.07 + 0.06 * recircCount * retFactor : 0,
    now,
    0.12
  );
  tankDrip.streamGain.gain.setTargetAtTime(
    fillActive ? 0.2 + 0.07 * freshCount : 0,
    now,
    0.12
  );
}

/** Call after user gesture so pump/spray audio can run (browser autoplay policy). */
export function ensureAudioReady() {
  if (!state.soundEnabled) return;
  if (!audioCtx) initAudio();
  if (audioCtx?.state === 'suspended') {
    return audioCtx.resume();
  }
}

function makeLoopingNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < len; i++) {
    brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = brown * 0.6 + (Math.random() * 2 - 1) * 0.4;
  }
  return buf;
}

/** Dense small-room impulse (~pump enclosure / basement). */
function makeSmallRoomIR(ctx, durationSec = 0.18) {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const decay = Math.exp(-t * 28);
      data[i] = (Math.random() * 2 - 1) * decay * (ch === 0 ? 1 : 0.92);
    }
  }
  return buf;
}

function makeSaturationCurve(drive = 3.2) {
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

/** Sine partial on a bus; returns { osc, gain } for live retuning. */
function addPartial(ctx, bus, freq, level, type = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, ctx.currentTime);
  osc.connect(gain);
  gain.connect(bus);
  osc.start();
  return { osc, gain };
}

function buildPumpGraph(ctx) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.9, ctx.currentTime);

  // —— 1. Induction motor: shaft hum + harmonics + mains buzz ——
  const motorBus = ctx.createGain();
  const rotHz = 48;

  const rotor = addPartial(ctx, motorBus, rotHz, 0.16, 'triangle');
  const harmonics = [
    [2, 0.09],
    [3, 0.055],
    [4, 0.032],
    [5, 0.02],
    [6, 0.014]
  ].map(([n, lvl]) => addPartial(ctx, motorBus, rotHz * n, lvl));

  const mains = [
    addPartial(ctx, motorBus, 100, 0.065),
    addPartial(ctx, motorBus, 101.3, 0.04),
    addPartial(ctx, motorBus, 120, 0.045),
    addPartial(ctx, motorBus, 150, 0.022)
  ];

  // Cogging / magnetostriction buzz (AM)
  const cogGain = ctx.createGain();
  cogGain.gain.setValueAtTime(0.038, ctx.currentTime);
  const cogCarrier = addPartial(ctx, cogGain, 420, 1);
  const cogMod = ctx.createOscillator();
  cogMod.type = 'sine';
  cogMod.frequency.setValueAtTime(rotHz * 2, ctx.currentTime);
  const cogModDepth = ctx.createGain();
  cogModDepth.gain.setValueAtTime(0.014, ctx.currentTime);
  cogMod.connect(cogModDepth);
  cogModDepth.connect(cogGain.gain);
  cogGain.connect(motorBus);
  cogMod.start();

  // Bearing / fan whine (quiet, not a synth lead)
  const bearing = addPartial(ctx, motorBus, 1680, 0.018);

  // Strain wobble on shaft speed
  const strainLfo = ctx.createOscillator();
  strainLfo.type = 'sine';
  strainLfo.frequency.setValueAtTime(0.55, ctx.currentTime);
  const strainDepth = ctx.createGain();
  strainDepth.gain.setValueAtTime(1.8, ctx.currentTime);
  strainLfo.connect(strainDepth);
  strainDepth.connect(rotor.osc.frequency);
  harmonics.forEach((h) => strainDepth.connect(h.osc.frequency));
  strainLfo.start();

  const voltLfo = ctx.createOscillator();
  voltLfo.type = 'sine';
  voltLfo.frequency.setValueAtTime(5.5, ctx.currentTime);
  const voltDepth = ctx.createGain();
  voltDepth.gain.setValueAtTime(0.018, ctx.currentTime);
  voltLfo.connect(voltDepth);
  voltDepth.connect(motorBus.gain);
  motorBus.gain.setValueAtTime(1, ctx.currentTime);
  voltLfo.start();

  const saturate = ctx.createWaveShaper();
  saturate.curve = makeSaturationCurve(2.8);
  saturate.oversample = '2x';
  motorBus.connect(saturate);

  const motorBody = ctx.createBiquadFilter();
  motorBody.type = 'bandpass';
  motorBody.frequency.setValueAtTime(165, ctx.currentTime);
  motorBody.Q.setValueAtTime(0.55, ctx.currentTime);

  const motorHpf = ctx.createBiquadFilter();
  motorHpf.type = 'highpass';
  motorHpf.frequency.setValueAtTime(42, ctx.currentTime);

  const motorToneGain = ctx.createGain();
  motorToneGain.gain.setValueAtTime(0.95, ctx.currentTime);
  saturate.connect(motorHpf);
  motorHpf.connect(motorBody);
  motorBody.connect(motorToneGain);

  const cabinet = ctx.createBiquadFilter();
  cabinet.type = 'peaking';
  cabinet.frequency.setValueAtTime(210, ctx.currentTime);
  cabinet.Q.setValueAtTime(1.8, ctx.currentTime);
  cabinet.gain.setValueAtTime(4, ctx.currentTime);
  motorToneGain.connect(cabinet);

  // —— 2. Hydraulic layer (only loud when water is moving) ——
  const turbMaster = ctx.createGain();
  turbMaster.gain.setValueAtTime(0, ctx.currentTime);

  const turbNoise = ctx.createBufferSource();
  turbNoise.buffer = makeLoopingNoiseBuffer(ctx);
  turbNoise.loop = true;

  const turbLpf = ctx.createBiquadFilter();
  turbLpf.type = 'lowpass';
  turbLpf.frequency.setValueAtTime(520, ctx.currentTime);
  turbLpf.Q.setValueAtTime(0.4, ctx.currentTime);

  const turbWetBp = ctx.createBiquadFilter();
  turbWetBp.type = 'bandpass';
  turbWetBp.frequency.setValueAtTime(280, ctx.currentTime);
  turbWetBp.Q.setValueAtTime(1.1, ctx.currentTime);

  const turbDryGain = ctx.createGain();
  turbDryGain.gain.setValueAtTime(0.55, ctx.currentTime);
  const turbWetGain = ctx.createGain();
  turbWetGain.gain.setValueAtTime(0.35, ctx.currentTime);

  turbNoise.connect(turbLpf);
  turbLpf.connect(turbDryGain);
  turbDryGain.connect(turbMaster);
  turbNoise.connect(turbWetBp);
  turbWetBp.connect(turbWetGain);
  turbWetGain.connect(turbMaster);
  turbNoise.start();

  const wetMix = ctx.createGain();
  cabinet.connect(wetMix);
  turbMaster.connect(wetMix);

  // —— 4. Distance + small-room enclosure ——
  const distanceLpf = ctx.createBiquadFilter();
  distanceLpf.type = 'lowpass';
  distanceLpf.frequency.setValueAtTime(4800, ctx.currentTime);
  distanceLpf.Q.setValueAtTime(0.5, ctx.currentTime);

  const airAbsorb = ctx.createBiquadFilter();
  airAbsorb.type = 'highshelf';
  airAbsorb.frequency.setValueAtTime(3200, ctx.currentTime);
  airAbsorb.gain.setValueAtTime(-4, ctx.currentTime);

  wetMix.connect(distanceLpf);
  distanceLpf.connect(airAbsorb);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeSmallRoomIR(ctx);

  const dryGain = ctx.createGain();
  dryGain.gain.setValueAtTime(0.68, ctx.currentTime);
  const wetGain = ctx.createGain();
  wetGain.gain.setValueAtTime(0.32, ctx.currentTime);

  airAbsorb.connect(dryGain);
  airAbsorb.connect(convolver);
  convolver.connect(wetGain);

  const pumpOut = ctx.createGain();
  pumpOut.gain.setValueAtTime(0, ctx.currentTime);
  dryGain.connect(pumpOut);
  wetGain.connect(pumpOut);
  pumpOut.connect(master);
  master.connect(ctx.destination);

  return {
    master,
    pumpOut,
    motorToneGain,
    turbMaster,
    rotor,
    harmonics,
    mains,
    cogCarrier,
    bearing,
    motorBody,
    turbLpf,
    turbWetBp,
    distanceLpf
  };
}

function playPumpTransient(kind, now) {
  if (!audioCtx || !pump) return;

  const thump = audioCtx.createOscillator();
  const thumpGain = audioCtx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(kind === 'start' ? 95 : 70, now);
  thump.frequency.exponentialRampToValueAtTime(kind === 'start' ? 42 : 35, now + 0.14);
  thump.connect(thumpGain);
  thumpGain.connect(pump.master);
  thumpGain.gain.setValueAtTime(kind === 'start' ? 0.22 : 0.14, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  thump.start(now);
  thump.stop(now + 0.2);

  const clack = audioCtx.createOscillator();
  const clackGain = audioCtx.createGain();
  clack.type = 'triangle';
  clack.frequency.setValueAtTime(kind === 'start' ? 240 : 160, now);
  clack.connect(clackGain);
  clackGain.connect(pump.master);
  clackGain.gain.setValueAtTime(0.06, now);
  clackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  clack.start(now);
  clack.stop(now + 0.04);
}

function isPumpMotorOn() {
  return state.simulationSpeed > 0 && state.soundEnabled && state.pumpRunning;
}

function updatePumpSound(now) {
  if (!pump) return;

  const motorOn = isPumpMotorOn();

  if (motorOn && !pumpWasRunning) playPumpTransient('start', now);
  if (!motorOn && pumpWasRunning) playPumpTransient('stop', now);
  pumpWasRunning = motorOn;

  if (!motorOn) {
    pump.pumpOut.gain.setTargetAtTime(0, now, 0.12);
    return;
  }

  const flow = state.flowRate || 0;
  const load = Math.max(0.25, Math.min(1, flow / 50));
  const rotHz = 46 + load * 9;

  pump.rotor.osc.frequency.setTargetAtTime(rotHz, now, 0.12);
  pump.harmonics.forEach(({ osc }, i) => {
    const mult = [2, 3, 4, 5, 6][i];
    osc.frequency.setTargetAtTime(rotHz * mult, now, 0.12);
  });
  pump.cogCarrier.osc.frequency.setTargetAtTime(380 + load * 80, now, 0.15);
  pump.bearing.osc.frequency.setTargetAtTime(1550 + load * 450, now, 0.15);
  pump.motorBody.frequency.setTargetAtTime(155 + load * 45, now, 0.15);
  pump.turbLpf.frequency.setTargetAtTime(400 + load * 350, now, 0.2);
  pump.turbWetBp.frequency.setTargetAtTime(240 + load * 120, now, 0.2);
  pump.distanceLpf.frequency.setTargetAtTime(3800 + load * 1400, now, 0.2);

  let motorLevel = 0.88 + load * 0.12;
  let turbLevel = 0.02 + load * load * 0.14;

  if (state.alarmState === 'DRY_RUN') {
    motorLevel *= 1.08;
    turbLevel *= 0.15;
    pump.rotor.osc.detune.setTargetAtTime(35, now, 0.25);
  } else if (state.alarmState === 'HIGH_PRESSURE') {
    motorLevel *= 1.02;
    turbLevel *= 0.65;
    pump.rotor.osc.detune.setTargetAtTime(0, now, 0.2);
  } else {
    pump.rotor.osc.detune.setTargetAtTime(0, now, 0.2);
  }

  pump.motorToneGain.gain.setTargetAtTime(motorLevel, now, 0.1);
  pump.turbMaster.gain.setTargetAtTime(turbLevel, now, 0.12);
  pump.pumpOut.gain.setTargetAtTime(1, now, 0.15);
}

export function initAudio() {
  if (audioCtx) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    pump = buildPumpGraph(audioCtx);
    tankDrip = buildTankDripGraph(audioCtx);

    alarmGain = audioCtx.createGain();
    alarmGain.gain.setValueAtTime(0, audioCtx.currentTime);
    alarmGain.connect(audioCtx.destination);

    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(920, audioCtx.currentTime);
    noiseFilter.Q.setValueAtTime(0.65, audioCtx.currentTime);

    sprayGain = audioCtx.createGain();
    sprayGain.gain.setValueAtTime(0, audioCtx.currentTime);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(sprayGain);
    sprayGain.connect(audioCtx.destination);
    noiseSource.start();

    addLog('Audio engine initialized successfully', 'success');
  } catch (e) {
    console.error('Failed to initialize audio context', e);
  }
}

export function playClickSound() {
  if (!state.soundEnabled) return;
  ensureAudioReady();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.08);

  gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.09);
}

/** Ball-valve style clunk — distinct from UI click; open vs close differ slightly. */
export function playValveSound(isOpen) {
  if (!state.soundEnabled) return;
  ensureAudioReady();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const bus = audioCtx.createGain();
  bus.gain.setValueAtTime(0.28, now);
  bus.connect(audioCtx.destination);

  const thump = audioCtx.createOscillator();
  const thumpG = audioCtx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(isOpen ? 165 : 105, now);
  thump.frequency.exponentialRampToValueAtTime(isOpen ? 75 : 48, now + 0.05);
  thumpG.gain.setValueAtTime(0.4, now);
  thumpG.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  thump.connect(thumpG);
  thumpG.connect(bus);

  const clackLen = Math.floor(audioCtx.sampleRate * 0.045);
  const clackBuf = audioCtx.createBuffer(1, clackLen, audioCtx.sampleRate);
  const cd = clackBuf.getChannelData(0);
  for (let i = 0; i < clackLen; i++) {
    cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.007));
  }
  const clack = audioCtx.createBufferSource();
  clack.buffer = clackBuf;
  const clackBp = audioCtx.createBiquadFilter();
  clackBp.type = 'bandpass';
  clackBp.frequency.setValueAtTime(isOpen ? 2200 : 1400, now);
  clackBp.Q.setValueAtTime(isOpen ? 0.9 : 1.4, now);
  const clackG = audioCtx.createGain();
  clackG.gain.setValueAtTime(isOpen ? 0.22 : 0.3, now);
  clackG.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  clack.connect(clackBp);
  clackBp.connect(clackG);
  clackG.connect(bus);

  const seat = audioCtx.createOscillator();
  const seatG = audioCtx.createGain();
  seat.type = 'square';
  seat.frequency.setValueAtTime(isOpen ? 520 : 380, now);
  seat.frequency.exponentialRampToValueAtTime(80, now + 0.025);
  seatG.gain.setValueAtTime(0.04, now);
  seatG.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  seat.connect(seatG);
  seatG.connect(bus);

  thump.start(now);
  thump.stop(now + 0.08);
  clack.start(now);
  clack.stop(now + 0.05);
  seat.start(now);
  seat.stop(now + 0.035);
}

export function playNotificationSound() {
  if (!state.soundEnabled) return;
  ensureAudioReady();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, now);
  osc.frequency.setValueAtTime(659.25, now + 0.1);

  gainNode.gain.setValueAtTime(0.1, now);
  gainNode.gain.setValueAtTime(0.1, now + 0.1);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  osc.start();
  osc.stop(now + 0.35);
}

export function updateSynthNodes() {
  if (!state.soundEnabled) {
    if (audioCtx && pump) {
      const now = audioCtx.currentTime;
      pump.pumpOut.gain.setTargetAtTime(0, now, 0.08);
      sprayGain?.gain.setTargetAtTime(0, now, 0.1);
      tankDrip?.master.gain.setTargetAtTime(0, now, 0.1);
      alarmGain?.gain.setTargetAtTime(0, now, 0.1);
    }
    pumpWasRunning = false;
    return;
  }

  const tankDripOn = getTankDripState().intensity > 0.05;
  if (isPumpMotorOn() || tankDripOn) ensureAudioReady();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  updatePumpSound(now);

  const isAlarm =
    state.alarmState !== 'NORMAL' &&
    state.pumpRunning &&
    state.simulationSpeed > 0;

  if (isAlarm) {
    if (!alarmOsc) {
      alarmOsc = audioCtx.createOscillator();
      alarmOsc.type = 'sine';
      alarmOsc.frequency.setValueAtTime(900, now);
      alarmOsc.connect(alarmGain);
      alarmOsc.start();
    }
    const cycle = Math.floor(Date.now() / 300) % 2;
    alarmGain.gain.setTargetAtTime(cycle === 0 ? 0.08 : 0, now, 0.05);
  } else if (alarmGain) {
    alarmGain.gain.setTargetAtTime(0, now, 0.1);
  }

  if (sprayGain) {
    const p = state.flowPaths;
    const lpm = state.sprinklerLpmPerZone || 0;
    let zonesWithFlow = 0;
    if (p.waterZone1) zonesWithFlow++;
    if (p.waterZone2) zonesWithFlow++;
    if (p.waterZone3) zonesWithFlow++;
    if (p.waterZone4) zonesWithFlow++;

    const hasFlow =
      state.simulationSpeed > 0 &&
      state.alarmState === 'NORMAL' &&
      zonesWithFlow > 0 &&
      lpm >= SPRAY_FLOW_MIN_LPM;

    if (hasFlow) {
      const flowFactor = Math.min(1, lpm / SPRINKLER_FLOW_L_PER_MIN);
      sprayGain.gain.setTargetAtTime(
        SPRAY_GAIN_PER_ZONE * zonesWithFlow * flowFactor,
        now,
        0.15
      );
    } else {
      sprayGain.gain.setTargetAtTime(0, now, 0.12);
    }
  }

  updateTankDripAudio(now);
}
