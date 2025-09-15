/**
 * Fluid movement kernels for cellular automata simulation.
 * 
 * Handles movement and settling of fluids (liquids and gases) based on:
 * - Density differences (heavy materials sink, light materials rise)
 * - Pressure and buoyancy forces
 * - Material-specific flow properties
 */

import { getMaterial, isFluid, isGas, MATERIAL_IDS } from './materials.js';
import { CHUNK_CONFIG } from './chunk_grid.js';

/**
 * Configuration for fluid simulation
 */
export const FLUID_CONFIG = {
  GRAVITY_STRENGTH: 0.8,        // How much gravity affects settling
  PRESSURE_DIFFUSION: 0.3,      // How fast pressure equalizes
  BUOYANCY_STRENGTH: 0.6,       // How much hot materials rise
  VISCOSITY_DAMPING: 0.8,       // Flow resistance
  MIN_FLOW_THRESHOLD: 0.01,     // Minimum density difference for flow
  MAX_FLOW_RATE: 0.5            // Maximum amount that can move per step
};

/**
 * Simple fluid movement kernel - handles basic settling and rising
 * @param {ChunkGrid} grid 
 * @param {number} worldX 
 * @param {number} worldY 
 * @param {number} dt 
 * @returns {boolean} True if movement occurred
 */
export function updateFluidCell(grid, worldX, worldY, dt) {
  const cell = grid.getCell(worldX, worldY);
  if (!cell || !isFluid(cell.materialId)) {
    return false;
  }
  
  const material = getMaterial(cell.materialId);
  let moved = false;
  
  // Try downward movement first (gravity/settling)
  if (!isGas(cell.materialId)) {
    moved = tryMoveDown(grid, worldX, worldY, material, dt) || moved;
  }
  
  // Try upward movement for gases and buoyant materials
  if (isGas(cell.materialId) || shouldRiseFromHeat(cell, material)) {
    moved = tryMoveUp(grid, worldX, worldY, material, dt) || moved;
  }
  
  // Try horizontal movement for pressure equalization
  moved = tryMoveHorizontal(grid, worldX, worldY, material, dt) || moved;
  
  return moved;
}

/**
 * Try to move cell downward due to gravity
 * @param {ChunkGrid} grid 
 * @param {number} worldX 
 * @param {number} worldY 
 * @param {MaterialDef} material 
 * @param {number} dt 
 * @returns {boolean}
 */
function tryMoveDown(grid, worldX, worldY, material, dt) {
  const currentCell = grid.getCell(worldX, worldY);
  const belowCell = grid.getCell(worldX, worldY + 1);
  
  if (!belowCell) return false;
  
  const belowMaterial = getMaterial(belowCell.materialId);
  
  // Can move down if target is empty air or less dense
  const densityDiff = material.density - belowMaterial.density;
  
  if (densityDiff > FLUID_CONFIG.MIN_FLOW_THRESHOLD) {
    const flowRate = Math.min(
      FLUID_CONFIG.MAX_FLOW_RATE * densityDiff * FLUID_CONFIG.GRAVITY_STRENGTH * dt,
      1.0
    );
    
    if (flowRate > FLUID_CONFIG.MIN_FLOW_THRESHOLD) {
      swapCells(grid, worldX, worldY, worldX, worldY + 1, flowRate);
      return true;
    }
  }
  
  return false;
}

/**
 * Try to move cell upward due to buoyancy
 * @param {ChunkGrid} grid 
 * @param {number} worldX 
 * @param {number} worldY 
 * @param {MaterialDef} material 
 * @param {number} dt 
 * @returns {boolean}
 */
function tryMoveUp(grid, worldX, worldY, material, dt) {
  const currentCell = grid.getCell(worldX, worldY);
  const aboveCell = grid.getCell(worldX, worldY - 1);
  
  if (!aboveCell) return false;
  
  const aboveMaterial = getMaterial(aboveCell.materialId);
  
  // Can move up if lighter than above material
  const densityDiff = aboveMaterial.density - material.density;
  
  if (densityDiff > FLUID_CONFIG.MIN_FLOW_THRESHOLD) {
    let buoyancyForce = material.buoyancyFactor * FLUID_CONFIG.BUOYANCY_STRENGTH;
    
    // Heat-driven buoyancy
    if (currentCell.temperature > 100) {
      const heatBonus = Math.min((currentCell.temperature - 100) / 500, 2.0);
      buoyancyForce += heatBonus;
    }
    
    const flowRate = Math.min(
      FLUID_CONFIG.MAX_FLOW_RATE * densityDiff * buoyancyForce * dt,
      1.0
    );
    
    if (flowRate > FLUID_CONFIG.MIN_FLOW_THRESHOLD) {
      swapCells(grid, worldX, worldY, worldX, worldY - 1, flowRate);
      return true;
    }
  }
  
  return false;
}

/**
 * Try horizontal movement for pressure equalization
 * @param {ChunkGrid} grid 
 * @param {number} worldX 
 * @param {number} worldY 
 * @param {MaterialDef} material 
 * @param {number} dt 
 * @returns {boolean}
 */
function tryMoveHorizontal(grid, worldX, worldY, material, dt) {
  const currentCell = grid.getCell(worldX, worldY);
  
  // Try left and right
  const directions = [
    { x: worldX - 1, y: worldY },  // left
    { x: worldX + 1, y: worldY }   // right
  ];
  
  let moved = false;
  
  for (const dir of directions) {
    const neighborCell = grid.getCell(dir.x, dir.y);
    if (!neighborCell) continue;
    
    const neighborMaterial = getMaterial(neighborCell.materialId);
    
    // For liquids: flow into less dense materials or level out with same material
    if (!isGas(material.density)) {
      const densityDiff = material.density - neighborMaterial.density;
      
      if (densityDiff > FLUID_CONFIG.MIN_FLOW_THRESHOLD) {
        const flowRate = Math.min(
          FLUID_CONFIG.MAX_FLOW_RATE * densityDiff * FLUID_CONFIG.PRESSURE_DIFFUSION * dt,
          0.3  // Slower horizontal flow
        );
        
        if (flowRate > FLUID_CONFIG.MIN_FLOW_THRESHOLD) {
          swapCells(grid, worldX, worldY, dir.x, dir.y, flowRate);
          moved = true;
          break;  // Only move in one direction per frame
        }
      }
    }
    
    // For gases: diffuse into lower pressure areas
    if (isGas(currentCell.materialId) && neighborMaterial.density < material.density) {
      const pressureDiff = material.density - neighborMaterial.density;
      const flowRate = Math.min(
        FLUID_CONFIG.MAX_FLOW_RATE * pressureDiff * FLUID_CONFIG.PRESSURE_DIFFUSION * dt,
        0.2  // Even slower gas diffusion
      );
      
      if (flowRate > FLUID_CONFIG.MIN_FLOW_THRESHOLD) {
        swapCells(grid, worldX, worldY, dir.x, dir.y, flowRate);
        moved = true;
        break;
      }
    }
  }
  
  return moved;
}

/**
 * Check if a cell should rise due to heat
 * @param {Object} cell 
 * @param {MaterialDef} material 
 * @returns {boolean}
 */
function shouldRiseFromHeat(cell, material) {
  // Hot materials tend to rise due to thermal buoyancy
  const temperatureBonus = Math.max(0, (cell.temperature - 100) / 300);
  return temperatureBonus > 0.1 && material.buoyancyFactor > 0;
}

/**
 * Swap or partially mix two cells
 * @param {ChunkGrid} grid 
 * @param {number} x1 
 * @param {number} y1 
 * @param {number} x2 
 * @param {number} y2 
 * @param {number} flowRate - Amount to swap (0-1)
 */
function swapCells(grid, x1, y1, x2, y2, flowRate = 1.0) {
  const cell1 = grid.getCell(x1, y1);
  const cell2 = grid.getCell(x2, y2);
  
  if (!cell1 || !cell2) return;
  
  if (flowRate >= 1.0) {
    // Full swap
    const temp = { ...cell1 };
    grid.setCell(x1, y1, cell2);
    grid.setCell(x2, y2, temp);
  } else {
    // Partial mixing based on flow rate
    const mixRatio = flowRate;
    
    // Mix materials (simplified - just swap if significant flow)
    if (mixRatio > 0.5) {
      const tempMaterial = cell1.materialId;
      cell1.materialId = cell2.materialId;
      cell2.materialId = tempMaterial;
    }
    
    // Mix other properties proportionally
    const avgTemp = lerp(cell1.temperature, cell2.temperature, mixRatio);
    const avgFuel = lerp(cell1.fuel, cell2.fuel, mixRatio);
    const avgWetness = lerp(cell1.wetness, cell2.wetness, mixRatio);
    const avgOxygen = lerp(cell1.oxygen, cell2.oxygen, mixRatio);
    const avgDensity = lerp(cell1.density, cell2.density, mixRatio);
    
    // Apply mixed values
    grid.setCell(x1, y1, {
      ...cell1,
      temperature: avgTemp,
      fuel: avgFuel,
      wetness: avgWetness,
      oxygen: avgOxygen,
      density: avgDensity
    });
    
    grid.setCell(x2, y2, {
      ...cell2,
      temperature: avgTemp,
      fuel: avgFuel,
      wetness: avgWetness,
      oxygen: avgOxygen,
      density: avgDensity
    });
  }
}

/**
 * Linear interpolation helper
 * @param {number} a 
 * @param {number} b 
 * @param {number} t 
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Update fluid simulation for a single chunk
 * @param {ChunkGrid} grid 
 * @param {Chunk} chunk 
 * @param {number} dt 
 * @returns {number} Number of cells that moved
 */
export function updateChunkFluids(grid, chunk, dt) {
  let movementCount = 0;
  const size = CHUNK_CONFIG.CHUNK_SIZE;
  
  // Process in a checkerboard pattern to avoid directional bias
  const offset = (Date.now() % 2);
  
  for (let localY = 0; localY < size; localY++) {
    for (let localX = offset; localX < size; localX += 2) {
      const worldX = chunk.chunkX * size + localX;
      const worldY = chunk.chunkY * size + localY;
      
      if (updateFluidCell(grid, worldX, worldY, dt)) {
        movementCount++;
      }
    }
  }
  
  // Process the other checkerboard pattern
  for (let localY = 0; localY < size; localY++) {
    for (let localX = 1 - offset; localX < size; localX += 2) {
      const worldX = chunk.chunkX * size + localX;
      const worldY = chunk.chunkY * size + localY;
      
      if (updateFluidCell(grid, worldX, worldY, dt)) {
        movementCount++;
      }
    }
  }
  
  return movementCount;
}

/**
 * Special fluid settling for oil floating on water
 * @param {ChunkGrid} grid 
 * @param {number} worldX 
 * @param {number} worldY 
 * @returns {boolean}
 */
export function updateOilWaterInteraction(grid, worldX, worldY) {
  const cell = grid.getCell(worldX, worldY);
  if (!cell || cell.materialId !== MATERIAL_IDS.OIL) {
    return false;
  }
  
  const belowCell = grid.getCell(worldX, worldY + 1);
  if (!belowCell || belowCell.materialId !== MATERIAL_IDS.WATER) {
    return false;
  }
  
  // Oil floats on water - swap if oil is below water
  swapCells(grid, worldX, worldY, worldX, worldY + 1, 1.0);
  return true;
}

/**
 * Update steam condensation when cooled
 * @param {ChunkGrid} grid 
 * @param {number} worldX 
 * @param {number} worldY 
 * @returns {boolean}
 */
export function updateSteamCondensation(grid, worldX, worldY) {
  const cell = grid.getCell(worldX, worldY);
  if (!cell || cell.materialId !== MATERIAL_IDS.STEAM) {
    return false;
  }
  
  // Steam condenses back to water if cooled below boiling point
  if (cell.temperature < 95) {
    grid.setCell(worldX, worldY, {
      ...cell,
      materialId: MATERIAL_IDS.WATER,
      density: 1.0,
      wetness: 1.0
    });
    return true;
  }
  
  return false;
}

/**
 * Update smoke dissipation over time
 * @param {ChunkGrid} grid 
 * @param {number} worldX 
 * @param {number} worldY 
 * @param {number} dt 
 * @returns {boolean}
 */
export function updateSmokeDissipation(grid, worldX, worldY, dt) {
  const cell = grid.getCell(worldX, worldY);
  if (!cell || cell.materialId !== MATERIAL_IDS.SMOKE) {
    return false;
  }
  
  // Smoke gradually dissipates by reducing density
  const dissipationRate = 0.1 * dt;  // 10% per second
  const newDensity = cell.density * (1 - dissipationRate);
  
  if (newDensity < 0.001) {
    // Convert to air when density is too low
    grid.setCell(worldX, worldY, {
      materialId: MATERIAL_IDS.AIR,
      temperature: cell.temperature,
      fuel: 0,
      wetness: 0,
      oxygen: 1.0,
      density: 0.001
    });
    return true;
  } else {
    grid.setCell(worldX, worldY, {
      ...cell,
      density: newDensity
    });
    return false;
  }
}