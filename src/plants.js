// Plant care mini-game — keep zones watered or plants wilt and die.

import { state } from './state.js';
import { addLog } from './logger.js';

/** Soil dries when sprinklers are off. */
export const SOIL_DRY_RATE_PER_SEC = 1.2;

/** While a zone valve is open and water is flowing, soil stays wet. */
const IRRIGATION_SOAK_PER_SEC = 14;
const IRRIGATION_DRY_FACTOR = 0.12;

export const HYDRATION_THIRSTY = 25;
export const HYDRATION_OPTIMAL_MIN = 35;
export const HYDRATION_OPTIMAL_MAX = 88;
/** Above optimal range — show dripping pot, mild waterlog damage. */
export const HYDRATION_OVERWATERED = HYDRATION_OPTIMAL_MAX + 1;

export const GROWTH_MIN = 0.32;
export const GROWTH_MAX = 1.45;

const HEALTH_DAMAGE_THIRSTY = 4;
const HEALTH_DAMAGE_WATERLOGGED = 2;
const HEALTH_REGEN_OPTIMAL = 3.5;
const HEALTH_REGEN_WET = 1.2;
const GROWTH_RATE_OPTIMAL = 0.012;
const GROWTH_SHRINK = 0.015;

const WATER_HYDRATION_PER_LITER = 42;
const REVIVE_HYDRATION_NEEDED = 40;
const REVIVE_HEALTH_ON_RESTORE = 30;

function defaultPlant(id) {
  return {
    id,
    hydration: 52,
    health: 72,
    growth: 0.55,
    alive: true,
    deathLogged: false
  };
}

export function createDefaultPlants() {
  return [1, 2, 3, 4].map(defaultPlant);
}

/** @param {number[]} litersByZone — water delivered this tick per zone 0..3 */
export function applyZoneWatering(litersByZone) {
  litersByZone.forEach((liters, index) => {
    const plant = state.plants[index];
    if (!plant) return;

    if (liters > 0) {
      plant.hydration = Math.min(100, plant.hydration + liters * WATER_HYDRATION_PER_LITER);
    }

    if (!plant.alive && plant.hydration >= REVIVE_HYDRATION_NEEDED) {
      plant.alive = true;
      plant.health = Math.max(plant.health, REVIVE_HEALTH_ON_RESTORE);
      plant.deathLogged = false;
      addLog(`Zone ${plant.id}: plant recovered — keep watering!`, 'success');
    }
  });
}

/**
 * @param {number} dt
 * @param {boolean[]} irrigatingZones — valve open and sprinkler flow this tick
 */
export function updatePlants(dt, irrigatingZones = []) {
  if (state.simulationSpeed <= 0 || dt <= 0) return;

  state.plants.forEach((plant, index) => {
    const irrigating = Boolean(irrigatingZones[index]);

    if (irrigating) {
      plant.hydration = Math.min(100, plant.hydration + IRRIGATION_SOAK_PER_SEC * dt);
    }

    const dryRate = irrigating ? SOIL_DRY_RATE_PER_SEC * IRRIGATION_DRY_FACTOR : SOIL_DRY_RATE_PER_SEC;
    plant.hydration = Math.max(0, plant.hydration - dryRate * dt);

    if (!plant.alive) {
      plant.growth = Math.max(GROWTH_MIN * 0.6, plant.growth - GROWTH_SHRINK * 0.5 * dt);
      return;
    }

    const h = plant.hydration;

    if (h >= HYDRATION_OPTIMAL_MIN && h <= HYDRATION_OPTIMAL_MAX) {
      plant.health = Math.min(100, plant.health + HEALTH_REGEN_OPTIMAL * dt);
      plant.growth = Math.min(GROWTH_MAX, plant.growth + GROWTH_RATE_OPTIMAL * dt);
    } else if (h >= HYDRATION_THIRSTY && h < HYDRATION_OPTIMAL_MIN) {
      plant.health = Math.min(100, plant.health + HEALTH_REGEN_WET * dt);
      plant.growth = Math.min(GROWTH_MAX, plant.growth + GROWTH_RATE_OPTIMAL * 0.4 * dt);
    } else if (h < HYDRATION_THIRSTY) {
      plant.health = Math.max(0, plant.health - HEALTH_DAMAGE_THIRSTY * dt);
      plant.growth = Math.max(GROWTH_MIN, plant.growth - GROWTH_SHRINK * dt);
    } else if (h > HYDRATION_OVERWATERED + 5) {
      plant.health = Math.max(0, plant.health - HEALTH_DAMAGE_WATERLOGGED * dt);
    }

    if (plant.health <= 0) {
      plant.health = 0;
      plant.alive = false;
      plant.growth = GROWTH_MIN * 0.55;
      if (!plant.deathLogged) {
        plant.deathLogged = true;
        const reason = irrigating && h >= HYDRATION_OVERWATERED ? 'overwatering' : 'drought';
        addLog(`Zone ${plant.id}: plant died (${reason}) — balance soil moisture`, 'warn');
      }
    }
  });
}

/** @returns {'dead' | 'thirsty' | 'overwatered' | 'stressed' | 'happy'} */
export function getPlantMood(plant) {
  if (!plant.alive) return 'dead';
  if (plant.hydration >= HYDRATION_OVERWATERED) return 'overwatered';
  if (plant.hydration < HYDRATION_THIRSTY || plant.health < 22) return 'thirsty';
  if (
    plant.hydration >= HYDRATION_OPTIMAL_MIN &&
    plant.hydration <= HYDRATION_OPTIMAL_MAX &&
    plant.health > 55
  ) {
    return 'happy';
  }
  return 'stressed';
}
