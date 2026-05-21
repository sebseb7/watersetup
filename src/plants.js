// Plant care mini-game — keep zones watered or plants wilt and die.

import { state } from './state.js';
import { addLog } from './logger.js';

/** Soil dries out in ~45–60 s from full at 1× speed. */
export const SOIL_DRY_RATE_PER_SEC = 1.65;

export const HYDRATION_THIRSTY = 28;
export const HYDRATION_OPTIMAL_MIN = 38;
export const HYDRATION_OPTIMAL_MAX = 75;

export const GROWTH_MIN = 0.32;
export const GROWTH_MAX = 1.45;

const HEALTH_DAMAGE_THIRSTY = 5.5;
const HEALTH_DAMAGE_STRESSED = 1.2;
const HEALTH_REGEN_OPTIMAL = 3.2;
const GROWTH_RATE_OPTIMAL = 0.012;
const GROWTH_SHRINK = 0.018;

const WATER_HYDRATION_PER_LITER = 38;
const REVIVE_HYDRATION_NEEDED = 42;
const REVIVE_HEALTH_ON_RESTORE = 22;

function defaultPlant(id) {
  return {
    id,
    hydration: 52,
    health: 68,
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
    if (liters <= 0) return;
    const plant = state.plants[index];
    if (!plant) return;

    const boost = liters * WATER_HYDRATION_PER_LITER;
    plant.hydration = Math.min(100, plant.hydration + boost);

    if (!plant.alive && plant.hydration >= REVIVE_HYDRATION_NEEDED) {
      plant.alive = true;
      plant.health = Math.max(plant.health, REVIVE_HEALTH_ON_RESTORE);
      plant.deathLogged = false;
      addLog(`Zone ${plant.id}: plant recovered — keep watering!`, 'success');
    }
  });
}

export function updatePlants(dt) {
  if (state.simulationSpeed <= 0 || dt <= 0) return;

  state.plants.forEach((plant) => {
    plant.hydration = Math.max(0, plant.hydration - SOIL_DRY_RATE_PER_SEC * dt);

    if (!plant.alive) {
      plant.growth = Math.max(GROWTH_MIN * 0.6, plant.growth - GROWTH_SHRINK * 0.5 * dt);
      return;
    }

    const h = plant.hydration;

    if (h >= HYDRATION_OPTIMAL_MIN && h <= HYDRATION_OPTIMAL_MAX) {
      plant.health = Math.min(100, plant.health + HEALTH_REGEN_OPTIMAL * dt);
      plant.growth = Math.min(GROWTH_MAX, plant.growth + GROWTH_RATE_OPTIMAL * dt);
    } else if (h < HYDRATION_THIRSTY) {
      plant.health = Math.max(0, plant.health - HEALTH_DAMAGE_THIRSTY * dt);
      plant.growth = Math.max(GROWTH_MIN, plant.growth - GROWTH_SHRINK * dt);
    } else {
      plant.health = Math.max(0, plant.health - HEALTH_DAMAGE_STRESSED * dt);
      plant.growth = Math.max(GROWTH_MIN, plant.growth - GROWTH_SHRINK * 0.6 * dt);
    }

    if (plant.health <= 0) {
      plant.health = 0;
      plant.alive = false;
      plant.growth = GROWTH_MIN * 0.55;
      if (!plant.deathLogged) {
        plant.deathLogged = true;
        addLog(`Zone ${plant.id}: plant died from drought — water to revive`, 'warn');
      }
    }
  });
}

/** @returns {'dead' | 'thirsty' | 'stressed' | 'happy'} */
export function getPlantMood(plant) {
  if (!plant.alive) return 'dead';
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
