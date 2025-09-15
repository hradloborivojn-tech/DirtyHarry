/**
 * Materials database for cellular automata fire simulation.
 * 
 * Each material defines physical properties that drive simulation behavior:
 * - Thermal properties (conductivity, heat capacity, ignition temp)
 * - Combustion properties (flammability, burn rate, fuel content)
 * - Fluid properties (density, viscosity, buoyancy)
 * - Extinguishing properties (wetness effects, steam generation)
 */

export const MATERIAL_IDS = {
  AIR: 0,
  WATER: 1,
  OIL: 2,
  WOOD: 3,
  STONE: 4,
  METAL: 5,
  STEAM: 6,
  SMOKE: 7,
  GASOLINE: 8,
  FIRE_GAS: 9,
  CHAR: 10,
  ASH: 11
};

/**
 * Material property definitions
 * @typedef {Object} MaterialDef
 * @property {string} name - Human readable name
 * @property {number} density - Mass per unit (affects fluid flow) 
 * @property {number} thermalConductivity - Heat transfer rate to neighbors
 * @property {number} heatCapacity - Energy needed to change temperature
 * @property {number} ignitionTemp - Temperature at which combustion starts (°C)
 * @property {number} maxTemp - Maximum temperature this material can reach
 * @property {number} flammability - Base combustion rate multiplier
 * @property {number} burnRate - Fuel consumption rate per second
 * @property {number} smokeYield - Amount of smoke produced when burning
 * @property {number} steamYield - Amount of steam produced when hot + wet
 * @property {number} buoyancyFactor - Upward movement bias for hot gases
 * @property {number} spreadBiasUp - Additional upward spread tendency
 * @property {number} wetness - Water absorption capacity
 * @property {number} extinguishThreshold - Wetness level that stops burning
 * @property {number} volatileThreshold - Temperature that triggers explosion
 * @property {boolean} isFluid - Can flow and settle
 * @property {boolean} isGas - Rises due to buoyancy
 * @property {string} color - Debug visualization color
 */

export const MATERIALS = {
  [MATERIAL_IDS.AIR]: {
    name: 'Air',
    density: 0.001,
    thermalConductivity: 0.1,
    heatCapacity: 1.0,
    ignitionTemp: 999999,  // doesn't burn
    maxTemp: 2000,
    flammability: 0,
    burnRate: 0,
    smokeYield: 0,
    steamYield: 0,
    buoyancyFactor: 0.1,
    spreadBiasUp: 0,
    wetness: 0,
    extinguishThreshold: 0,
    volatileThreshold: 999999,
    isFluid: true,
    isGas: true,
    color: '#87CEEB'
  },

  [MATERIAL_IDS.WATER]: {
    name: 'Water',
    density: 1.0,
    thermalConductivity: 0.6,
    heatCapacity: 4.2,  // high heat capacity for cooling
    ignitionTemp: 999999,
    maxTemp: 100,  // converts to steam
    flammability: 0,
    burnRate: 0,
    smokeYield: 0,
    steamYield: 1.0,  // produces steam when heated
    buoyancyFactor: 0,
    spreadBiasUp: 0,
    wetness: 1.0,  // extinguishes fires
    extinguishThreshold: 0,
    volatileThreshold: 999999,
    isFluid: true,
    isGas: false,
    color: '#4682B4'
  },

  [MATERIAL_IDS.OIL]: {
    name: 'Oil',
    density: 0.8,  // floats on water
    thermalConductivity: 0.2,
    heatCapacity: 2.0,
    ignitionTemp: 250,
    maxTemp: 800,
    flammability: 0.8,
    burnRate: 0.5,
    smokeYield: 0.3,
    steamYield: 0,
    buoyancyFactor: 0.2,
    spreadBiasUp: 0.1,
    wetness: 0.1,  // slightly absorbent
    extinguishThreshold: 0.6,
    volatileThreshold: 999999,
    isFluid: true,
    isGas: false,
    color: '#8B4513'
  },

  [MATERIAL_IDS.WOOD]: {
    name: 'Wood',
    density: 0.6,
    thermalConductivity: 0.15,
    heatCapacity: 1.7,
    ignitionTemp: 300,
    maxTemp: 600,
    flammability: 0.6,
    burnRate: 0.3,
    smokeYield: 0.4,
    steamYield: 0.1,
    buoyancyFactor: 0,
    spreadBiasUp: 0,
    wetness: 0.3,
    extinguishThreshold: 0.8,
    volatileThreshold: 999999,
    isFluid: false,
    isGas: false,
    color: '#8B4513'
  },

  [MATERIAL_IDS.STONE]: {
    name: 'Stone',
    density: 2.5,
    thermalConductivity: 0.8,  // conducts heat well
    heatCapacity: 0.8,
    ignitionTemp: 999999,
    maxTemp: 1200,
    flammability: 0,
    burnRate: 0,
    smokeYield: 0,
    steamYield: 0,
    buoyancyFactor: 0,
    spreadBiasUp: 0,
    wetness: 0.1,
    extinguishThreshold: 0,
    volatileThreshold: 999999,
    isFluid: false,
    isGas: false,
    color: '#696969'
  },

  [MATERIAL_IDS.METAL]: {
    name: 'Metal',
    density: 7.8,
    thermalConductivity: 2.0,  // excellent heat conductor
    heatCapacity: 0.5,
    ignitionTemp: 999999,
    maxTemp: 1500,
    flammability: 0,
    burnRate: 0,
    smokeYield: 0,
    steamYield: 0,
    buoyancyFactor: 0,
    spreadBiasUp: 0,
    wetness: 0,
    extinguishThreshold: 0,
    volatileThreshold: 999999,
    isFluid: false,
    isGas: false,
    color: '#C0C0C0'
  },

  [MATERIAL_IDS.STEAM]: {
    name: 'Steam',
    density: 0.0006,
    thermalConductivity: 0.05,
    heatCapacity: 2.0,
    ignitionTemp: 999999,
    maxTemp: 200,
    flammability: 0,
    burnRate: 0,
    smokeYield: 0,
    steamYield: 0,
    buoyancyFactor: 1.5,  // rises quickly
    spreadBiasUp: 0.8,
    wetness: 0.5,  // condensed steam can help extinguish
    extinguishThreshold: 0,
    volatileThreshold: 999999,
    isFluid: true,
    isGas: true,
    color: '#F0F8FF'
  },

  [MATERIAL_IDS.SMOKE]: {
    name: 'Smoke',
    density: 0.0008,
    thermalConductivity: 0.03,
    heatCapacity: 1.1,
    ignitionTemp: 999999,
    maxTemp: 500,
    flammability: 0,
    burnRate: 0,
    smokeYield: 0,
    steamYield: 0,
    buoyancyFactor: 1.2,
    spreadBiasUp: 0.6,
    wetness: 0,
    extinguishThreshold: 0,
    volatileThreshold: 999999,
    isFluid: true,
    isGas: true,
    color: '#696969'
  },

  [MATERIAL_IDS.GASOLINE]: {
    name: 'Gasoline',
    density: 0.7,
    thermalConductivity: 0.15,
    heatCapacity: 2.2,
    ignitionTemp: 200,  // very flammable
    maxTemp: 700,
    flammability: 1.2,  // burns very readily
    burnRate: 0.8,
    smokeYield: 0.5,
    steamYield: 0,
    buoyancyFactor: 0.3,
    spreadBiasUp: 0.2,
    wetness: 0.05,
    extinguishThreshold: 0.4,
    volatileThreshold: 400,  // can explode
    isFluid: true,
    isGas: false,
    color: '#FFD700'
  },

  [MATERIAL_IDS.FIRE_GAS]: {
    name: 'Fire Gas',
    density: 0.0005,  // very light, hot combustion gas
    thermalConductivity: 0.08,
    heatCapacity: 1.5,
    ignitionTemp: 999999,  // already burning
    maxTemp: 1200,
    flammability: 0,
    burnRate: 0,
    smokeYield: 0.2,  // produces some smoke as it cools
    steamYield: 0,
    buoyancyFactor: 2.0,  // rises very fast
    spreadBiasUp: 1.0,
    wetness: 0,
    extinguishThreshold: 0,
    volatileThreshold: 999999,
    isFluid: true,
    isGas: true,
    color: '#FF4500'
  },

  [MATERIAL_IDS.CHAR]: {
    name: 'Char',
    density: 0.4,
    thermalConductivity: 0.1,
    heatCapacity: 1.0,
    ignitionTemp: 600,  // harder to ignite than wood
    maxTemp: 800,
    flammability: 0.2,  // burns slowly
    burnRate: 0.1,
    smokeYield: 0.1,
    steamYield: 0,
    buoyancyFactor: 0,
    spreadBiasUp: 0,
    wetness: 0.2,
    extinguishThreshold: 0.7,
    volatileThreshold: 999999,
    isFluid: false,
    isGas: false,
    color: '#2F2F2F'
  },

  [MATERIAL_IDS.ASH]: {
    name: 'Ash',
    density: 0.1,
    thermalConductivity: 0.05,
    heatCapacity: 0.8,
    ignitionTemp: 999999,  // doesn't burn
    maxTemp: 200,
    flammability: 0,
    burnRate: 0,
    smokeYield: 0,
    steamYield: 0,
    buoyancyFactor: 0.1,  // can blow around slightly
    spreadBiasUp: 0.05,
    wetness: 0.5,  // absorbs water well
    extinguishThreshold: 0,
    volatileThreshold: 999999,
    isFluid: true,  // can be blown around
    isGas: false,
    color: '#A9A9A9'
  }
};

/**
 * Helper function to get material properties
 * @param {number} materialId 
 * @returns {MaterialDef}
 */
export function getMaterial(materialId) {
  return MATERIALS[materialId] || MATERIALS[MATERIAL_IDS.AIR];
}

/**
 * Check if a material can burn
 * @param {number} materialId 
 * @returns {boolean}
 */
export function isFlammable(materialId) {
  const mat = getMaterial(materialId);
  return mat.flammability > 0 && mat.burnRate > 0;
}

/**
 * Check if a material is a fluid (can flow)
 * @param {number} materialId 
 * @returns {boolean}
 */
export function isFluid(materialId) {
  return getMaterial(materialId).isFluid;
}

/**
 * Check if a material is a gas (rises due to buoyancy)
 * @param {number} materialId 
 * @returns {boolean}
 */
export function isGas(materialId) {
  return getMaterial(materialId).isGas;
}

/**
 * Get the temperature at which a material ignites
 * @param {number} materialId 
 * @returns {number}
 */
export function getIgnitionTemp(materialId) {
  return getMaterial(materialId).ignitionTemp;
}

/**
 * Temperature constants for the simulation
 */
export const TEMP_CONSTANTS = {
  AMBIENT: 20,        // Room temperature °C
  FREEZING: 0,        // Water freezes
  BOILING: 100,       // Water -> steam
  HOT: 200,           // Generally "hot"
  IGNITION_MIN: 250,  // Minimum combustion temperature
  FIRE_LOW: 400,      // Low fire temperature
  FIRE_HIGH: 800,     // High fire temperature
  METAL_GLOW: 1000,   // Metal starts glowing
  MAX_TEMP: 2000      // Simulation maximum
};