/**
 * Materials database for cellular automata fire simulation.
 * 
 * Each material defines thermal and combustion properties that drive
 * the CA behavior. Materials interact through heat exchange, ignition,
 * burning, and state transitions.
 */

// Material IDs - use constants for type safety
export const MATERIAL_IDS = {
  AIR: 0,
  HOT_AIR: 1,
  WOOD: 2,
  CLOTH: 3,
  OIL: 4,
  WATER: 5,
  STEAM: 6,
  SMOKE: 7,
  STONE: 8,
  METAL: 9,
  ASH: 10,
  CHAR: 11,
  GASOLINE_VAPOR: 12,
  FIRE_GAS: 13
};

// Material definitions with thermal and combustion properties
export const MATERIALS = {
  [MATERIAL_IDS.AIR]: {
    name: 'Air',
    ignitionTemp: Infinity,
    heatCapacity: 1.0,
    thermalConductivity: 0.026,
    fuel: 0,
    burnRate: 0,
    wetting: 0,
    density: 1.225,
    buoyancy: 0,
    smokeYield: 0,
    steamYield: 0,
    volatilityThreshold: Infinity,
    flowType: 'gas',
    color: 'transparent'
  },
  
  [MATERIAL_IDS.HOT_AIR]: {
    name: 'Hot Air',
    ignitionTemp: Infinity,
    heatCapacity: 1.0,
    thermalConductivity: 0.035,
    fuel: 0,
    burnRate: 0,
    wetting: 0,
    density: 0.9,
    buoyancy: 1,
    smokeYield: 0,
    steamYield: 0,
    volatilityThreshold: 200, // Cools to air below this temp
    flowType: 'gas',
    color: 'rgba(255,200,100,0.1)'
  },
  
  [MATERIAL_IDS.WOOD]: {
    name: 'Wood',
    ignitionTemp: 300,
    heatCapacity: 1.7,
    thermalConductivity: 0.12,
    fuel: 100,
    burnRate: 0.8,
    wetting: 0.3,
    density: 600,
    buoyancy: 0,
    smokeYield: 0.4,
    steamYield: 0.1,
    volatilityThreshold: Infinity,
    flowType: 'solid',
    color: '#8B4513'
  },
  
  [MATERIAL_IDS.CLOTH]: {
    name: 'Cloth',
    ignitionTemp: 250,
    heatCapacity: 1.3,
    thermalConductivity: 0.04,
    fuel: 80,
    burnRate: 1.2,
    wetting: 0.8,
    density: 300,
    buoyancy: 0,
    smokeYield: 0.6,
    steamYield: 0.2,
    volatilityThreshold: Infinity,
    flowType: 'solid',
    color: '#654321'
  },
  
  [MATERIAL_IDS.OIL]: {
    name: 'Oil',
    ignitionTemp: 200,
    heatCapacity: 2.0,
    thermalConductivity: 0.14,
    fuel: 150,
    burnRate: 1.5,
    wetting: 0,
    density: 800,
    buoyancy: 0,
    smokeYield: 0.8,
    steamYield: 0,
    volatilityThreshold: 180, // Creates vapor
    flowType: 'liquid',
    color: '#2F2F2F'
  },
  
  [MATERIAL_IDS.WATER]: {
    name: 'Water',
    ignitionTemp: Infinity,
    heatCapacity: 4.18,
    thermalConductivity: 0.6,
    fuel: 0,
    burnRate: 0,
    wetting: 1.0,
    density: 1000,
    buoyancy: 0,
    smokeYield: 0,
    steamYield: 1.0,
    volatilityThreshold: 100, // Turns to steam
    flowType: 'liquid',
    color: '#4169E1'
  },
  
  [MATERIAL_IDS.STEAM]: {
    name: 'Steam',
    ignitionTemp: Infinity,
    heatCapacity: 2.0,
    thermalConductivity: 0.025,
    fuel: 0,
    burnRate: 0,
    wetting: 0.5,
    density: 0.6,
    buoyancy: 1,
    smokeYield: 0,
    steamYield: 0,
    volatilityThreshold: 100, // Condenses to water below this temp
    flowType: 'gas',
    color: 'rgba(255,255,255,0.4)'
  },
  
  [MATERIAL_IDS.SMOKE]: {
    name: 'Smoke',
    ignitionTemp: Infinity,
    heatCapacity: 1.1,
    thermalConductivity: 0.03,
    fuel: 0,
    burnRate: 0,
    wetting: 0,
    density: 0.8,
    buoyancy: 1,
    smokeYield: 0,
    steamYield: 0,
    volatilityThreshold: 50, // Dissipates to air
    flowType: 'gas',
    color: 'rgba(100,100,100,0.6)'
  },
  
  [MATERIAL_IDS.STONE]: {
    name: 'Stone',
    ignitionTemp: Infinity,
    heatCapacity: 0.8,
    thermalConductivity: 2.0,
    fuel: 0,
    burnRate: 0,
    wetting: 0.1,
    density: 2500,
    buoyancy: 0,
    smokeYield: 0,
    steamYield: 0,
    volatilityThreshold: Infinity,
    flowType: 'solid',
    color: '#808080'
  },
  
  [MATERIAL_IDS.METAL]: {
    name: 'Metal',
    ignitionTemp: Infinity,
    heatCapacity: 0.5,
    thermalConductivity: 50,
    fuel: 0,
    burnRate: 0,
    wetting: 0,
    density: 7800,
    buoyancy: 0,
    smokeYield: 0,
    steamYield: 0,
    volatilityThreshold: Infinity,
    flowType: 'solid',
    color: '#C0C0C0'
  },
  
  [MATERIAL_IDS.ASH]: {
    name: 'Ash',
    ignitionTemp: Infinity,
    heatCapacity: 0.8,
    thermalConductivity: 0.1,
    fuel: 0,
    burnRate: 0,
    wetting: 0.4,
    density: 400,
    buoyancy: 0,
    smokeYield: 0,
    steamYield: 0,
    volatilityThreshold: Infinity,
    flowType: 'solid',
    color: '#696969'
  },
  
  [MATERIAL_IDS.CHAR]: {
    name: 'Char',
    ignitionTemp: 400,
    heatCapacity: 1.0,
    thermalConductivity: 0.2,
    fuel: 20,
    burnRate: 0.3,
    wetting: 0.2,
    density: 300,
    buoyancy: 0,
    smokeYield: 0.2,
    steamYield: 0,
    volatilityThreshold: Infinity,
    flowType: 'solid',
    color: '#36454F'
  },
  
  [MATERIAL_IDS.GASOLINE_VAPOR]: {
    name: 'Gasoline Vapor',
    ignitionTemp: 150,
    heatCapacity: 1.4,
    thermalConductivity: 0.02,
    fuel: 200,
    burnRate: 3.0,
    wetting: 0,
    density: 0.4,
    buoyancy: 0,
    smokeYield: 0.3,
    steamYield: 0,
    volatilityThreshold: 100, // Condenses back to oil
    flowType: 'gas',
    color: 'rgba(150,150,200,0.3)'
  },
  
  [MATERIAL_IDS.FIRE_GAS]: {
    name: 'Fire Gas',
    ignitionTemp: Infinity,
    heatCapacity: 1.5,
    thermalConductivity: 0.08,
    fuel: 0,
    burnRate: 0,
    wetting: 0,
    density: 0.3,
    buoyancy: 1,
    smokeYield: 0,
    steamYield: 0,
    volatilityThreshold: 600, // Cools to hot air
    flowType: 'gas',
    color: 'rgba(255,100,0,0.8)'
  }
};

/**
 * Get material properties by ID
 * @param {number} materialId
 * @returns {object} Material properties
 */
export function getMaterial(materialId) {
  return MATERIALS[materialId] || MATERIALS[MATERIAL_IDS.AIR];
}

/**
 * Check if a material can ignite at the given temperature
 * @param {number} materialId
 * @param {number} temperature
 * @returns {boolean}
 */
export function canIgnite(materialId, temperature) {
  const material = getMaterial(materialId);
  return material.fuel > 0 && temperature >= material.ignitionTemp;
}

/**
 * Check if a material should undergo phase transition
 * @param {number} materialId
 * @param {number} temperature
 * @returns {number|null} New material ID or null if no transition
 */
export function getPhaseTransition(materialId, temperature) {
  const material = getMaterial(materialId);
  
  // Hot air cools to air
  if (materialId === MATERIAL_IDS.HOT_AIR && temperature < material.volatilityThreshold) {
    return MATERIAL_IDS.AIR;
  }
  
  // Water to steam
  if (materialId === MATERIAL_IDS.WATER && temperature >= material.volatilityThreshold) {
    return MATERIAL_IDS.STEAM;
  }
  
  // Steam condenses to water
  if (materialId === MATERIAL_IDS.STEAM && temperature < material.volatilityThreshold) {
    return MATERIAL_IDS.WATER;
  }
  
  // Oil to gasoline vapor
  if (materialId === MATERIAL_IDS.OIL && temperature >= material.volatilityThreshold) {
    return MATERIAL_IDS.GASOLINE_VAPOR;
  }
  
  // Gasoline vapor condenses to oil
  if (materialId === MATERIAL_IDS.GASOLINE_VAPOR && temperature < material.volatilityThreshold) {
    return MATERIAL_IDS.OIL;
  }
  
  // Fire gas cools to hot air
  if (materialId === MATERIAL_IDS.FIRE_GAS && temperature < material.volatilityThreshold) {
    return MATERIAL_IDS.HOT_AIR;
  }
  
  // Smoke dissipates to air
  if (materialId === MATERIAL_IDS.SMOKE && temperature < material.volatilityThreshold) {
    return MATERIAL_IDS.AIR;
  }
  
  return null;
}

/**
 * Get the combustion products when a material burns
 * @param {number} materialId
 * @param {number} fuelConsumed
 * @returns {object} {smokeAmount, steamAmount, heatReleased, newMaterialId}
 */
export function getCombustionProducts(materialId, fuelConsumed) {
  const material = getMaterial(materialId);
  
  const heatReleased = fuelConsumed * 50; // Heat per unit fuel
  const smokeAmount = fuelConsumed * material.smokeYield;
  const steamAmount = fuelConsumed * material.steamYield;
  
  // Determine what the material becomes after burning
  let newMaterialId = materialId;
  if (materialId === MATERIAL_IDS.WOOD || materialId === MATERIAL_IDS.CLOTH) {
    newMaterialId = MATERIAL_IDS.CHAR;
  } else if (materialId === MATERIAL_IDS.CHAR) {
    newMaterialId = MATERIAL_IDS.ASH;
  } else if (materialId === MATERIAL_IDS.OIL || materialId === MATERIAL_IDS.GASOLINE_VAPOR) {
    newMaterialId = MATERIAL_IDS.FIRE_GAS;
  }
  
  return {
    smokeAmount,
    steamAmount,
    heatReleased,
    newMaterialId
  };
}