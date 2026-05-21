// Pumpensimulator - Web Audio API Synthesis Engine

import { state } from './state.js';
import { addLog } from './logger.js';

let audioCtx = null;
let pumpNoiseSource = null;
let pumpFilter = null;
let pumpHumOsc = null;
let pumpHumGain = null;
let pumpNoiseGain = null;
let pumpBus = null;
let alarmOsc = null;
let alarmGain = null;
let sprayGain = null;

/** Call after user gesture so pump/spray audio can run (browser autoplay policy). */
export function ensureAudioReady() {
  if (!state.soundEnabled) return;
  if (!audioCtx) initAudio();
  if (audioCtx?.state === 'suspended') {
    return audioCtx.resume();
  }
}

export function initAudio() {
  if (audioCtx) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    pumpBus = audioCtx.createGain();
    pumpBus.gain.setValueAtTime(1, audioCtx.currentTime);
    pumpBus.connect(audioCtx.destination);

    // Motor hum (steady when pump runs)
    pumpHumOsc = audioCtx.createOscillator();
    pumpHumOsc.type = 'sine';
    pumpHumOsc.frequency.setValueAtTime(110, audioCtx.currentTime);
    pumpHumGain = audioCtx.createGain();
    pumpHumGain.gain.setValueAtTime(0, audioCtx.currentTime);
    pumpHumOsc.connect(pumpHumGain);
    pumpHumGain.connect(pumpBus);
    pumpHumOsc.start();

    // Hydraulic rumble (filtered noise)
    pumpNoiseGain = audioCtx.createGain();
    pumpNoiseGain.gain.setValueAtTime(0, audioCtx.currentTime);

    const pumpBufLen = audioCtx.sampleRate * 2;
    const pumpBuffer = audioCtx.createBuffer(1, pumpBufLen, audioCtx.sampleRate);
    const pumpData = pumpBuffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < pumpBufLen; i++) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      pumpData[i] = brown;
    }
    pumpNoiseSource = audioCtx.createBufferSource();
    pumpNoiseSource.buffer = pumpBuffer;
    pumpNoiseSource.loop = true;

    pumpFilter = audioCtx.createBiquadFilter();
    pumpFilter.type = 'bandpass';
    pumpFilter.frequency.setValueAtTime(220, audioCtx.currentTime);
    pumpFilter.Q.setValueAtTime(0.85, audioCtx.currentTime);

    pumpNoiseSource.connect(pumpFilter);
    pumpFilter.connect(pumpNoiseGain);
    pumpNoiseGain.connect(pumpBus);
    pumpNoiseSource.start();

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
    noiseFilter.frequency.setValueAtTime(1000, audioCtx.currentTime);
    noiseFilter.Q.setValueAtTime(1, audioCtx.currentTime);

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

function updatePumpSound(now) {
  if (!pumpHumGain || !pumpNoiseGain || !pumpFilter || !pumpHumOsc) return;

  // Motor on (pressure switch) — not only when flowRate > 0 (spray can run on passive pressure)
  const motorOn =
    state.simulationSpeed > 0 &&
    state.soundEnabled &&
    (state.pumpRunning || state.powerDraw > 40);

  if (!motorOn) {
    pumpHumGain.gain.setTargetAtTime(0, now, 0.15);
    pumpNoiseGain.gain.setTargetAtTime(0, now, 0.15);
    return;
  }

  const load = Math.max(0.4, Math.min(1, (state.flowRate || 0) / 60));
  const humHz = 95 + load * 45;
  const bandHz = 180 + load * 120;

  pumpHumOsc.frequency.setTargetAtTime(humHz, now, 0.12);
  pumpFilter.frequency.setTargetAtTime(bandHz, now, 0.15);

  let humLevel = 0.11 + load * 0.06;
  let noiseLevel = 0.07 + load * 0.09;

  if (state.alarmState === 'DRY_RUN') {
    humLevel *= 0.85;
    noiseLevel *= 1.2;
    pumpFilter.frequency.setTargetAtTime(bandHz * 1.15, now, 0.15);
  } else if (state.alarmState === 'HIGH_PRESSURE') {
    humLevel *= 1.1;
    noiseLevel *= 0.8;
    pumpFilter.frequency.setTargetAtTime(bandHz * 0.9, now, 0.15);
  }

  pumpHumGain.gain.setTargetAtTime(humLevel, now, 0.08);
  pumpNoiseGain.gain.setTargetAtTime(noiseLevel, now, 0.08);
}

export function updateSynthNodes() {
  if (!state.soundEnabled) {
    if (audioCtx && pumpHumGain) {
      const now = audioCtx.currentTime;
      pumpHumGain.gain.setTargetAtTime(0, now, 0.1);
      pumpNoiseGain?.gain.setTargetAtTime(0, now, 0.1);
      sprayGain?.gain.setTargetAtTime(0, now, 0.1);
      alarmGain?.gain.setTargetAtTime(0, now, 0.1);
    }
    return;
  }

  if (state.pumpRunning || state.powerDraw > 40) ensureAudioReady();
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

  const isSpraying =
    state.simulationSpeed > 0 &&
    state.alarmState === 'NORMAL' &&
    (state.valveWater1 ||
      state.valveWater2 ||
      state.valveWater3 ||
      state.valveWater4);

  if (isSpraying && sprayGain) {
    let activeZones = 0;
    if (state.valveWater1) activeZones++;
    if (state.valveWater2) activeZones++;
    if (state.valveWater3) activeZones++;
    if (state.valveWater4) activeZones++;
    sprayGain.gain.setTargetAtTime(0.02 * activeZones, now, 0.2);
  } else if (sprayGain) {
    sprayGain.gain.setTargetAtTime(0, now, 0.15);
  }
}
