/**
 * Main cellular automata fire simulation engine.
 * 
 * Implements the core simulation loop with:
 * - Heat diffusion and thermal conductivity
 * - Combustion with oxygen consumption
 * - Material transformations (burning -> smoke/char)
 * - Convection and buoyancy effects
 * - Integration with existing game systems
 */

import { ChunkGrid, CHUNK_CONFIG, GRID_CONFIG } from './chunk_grid.js';
import { getMaterial, isFlammable, MATERIAL_IDS, TEMP_CONSTANTS } from './materials.js';
import { updateChunkFluids, updateOilWaterInteraction, updateSteamCondensation, updateSmokeDissipation } from './fluids.js';
import { GROUND_Y } from '../core/constants.js';

/**
 * Configuration for the fire simulation
 */
export const FIRE_CONFIG = {
  TICK_RATE: 60,                    // Updates per second
  SUBSTEPS: 1,                      // Substeps per tick for stability
  HEAT_DIFFUSION_RATE: 0.8,         // How fast heat spreads
  OXYGEN_DIFFUSION_RATE: 0.6,       // How fast oxygen diffuses
  COMBUSTION_RATE_MULTIPLIER: 1.0,  // Global combustion speed
  MIN_OXYGEN_FOR_FIRE: 0.1,         // Minimum oxygen to sustain fire
  HEAT_LOSS_RATE: 0.02,             // Ambient cooling rate
  BUOYANCY_HEAT_THRESHOLD: 150,     // Temperature for convection
  EXPLOSION_RADIUS: 20,              // Radius for volatile explosions
  DEBUG_MODE: false                  // Enable debug logging
};

/**
 * Main cellular automata engine
 */
export class FireCA {
  constructor() {
    this.grid = new ChunkGrid();
    this.lastUpdateTime = 0;
    this.accumulator = 0;
    this.fixedTimeStep = 1.0 / FIRE_CONFIG.TICK_RATE;
    this.totalUpdates = 0;
    this.debugStats = {
      cellsUpdated: 0,
      combustionEvents: 0,
      materialTransforms: 0,
      fluidMovements: 0
    };
    
    // Initialize with basic world setup
    this.initializeWorld();
  }
  
  /**
   * Initialize the world with ground materials
   */
  initializeWorld() {
    const groundY = GROUND_Y;
    
    // Add some basic ground material for testing
    for (let x = 0; x < GRID_CONFIG.GRID_WIDTH; x += 4) {
      for (let y = groundY; y < GRID_CONFIG.GRID_HEIGHT; y++) {
        this.grid.setCell(x, y, {
          materialId: MATERIAL_IDS.STONE,
          temperature: TEMP_CONSTANTS.AMBIENT,
          fuel: 0,
          wetness: 0,
          oxygen: 0.5,
          density: getMaterial(MATERIAL_IDS.STONE).density
        });
      }
    }
  }
  
  /**
   * Main update loop with fixed timestep
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    this.accumulator += dt;
    
    const startTime = performance.now();
    let updatesThisFrame = 0;
    let cellsUpdated = 0;
    
    // Fixed timestep updates
    while (this.accumulator >= this.fixedTimeStep && 
           cellsUpdated < CHUNK_CONFIG.MAX_UPDATES_PER_FRAME) {
      
      const updateResult = this.updateFixed(this.fixedTimeStep);
      cellsUpdated += updateResult.cellsUpdated;
      updatesThisFrame++;
      
      this.accumulator -= this.fixedTimeStep;
      this.totalUpdates++;
      
      // Break if we're taking too long
      if (performance.now() - startTime > 8) break;
    }
    
    // Update active chunks management
    this.grid.updateActiveChunks(performance.now() / 1000);
    
    if (FIRE_CONFIG.DEBUG_MODE && updatesThisFrame > 0) {
      console.log(`CA Update: ${updatesThisFrame} steps, ${cellsUpdated} cells updated`);
    }
  }
  
  /**
   * Fixed timestep update
   * @param {number} dt 
   * @returns {{cellsUpdated: number}}
   */
  updateFixed(dt) {
    this.debugStats.cellsUpdated = 0;
    this.debugStats.combustionEvents = 0;
    this.debugStats.materialTransforms = 0;
    this.debugStats.fluidMovements = 0;
    
    const activeChunks = this.grid.getActiveChunks();
    
    for (const chunk of activeChunks) {
      this.updateChunk(chunk, dt);
    }
    
    return { cellsUpdated: this.debugStats.cellsUpdated };
  }
  
  /**
   * Update a single chunk through all simulation phases
   * @param {Chunk} chunk 
   * @param {number} dt 
   */
  updateChunk(chunk, dt) {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    
    // Phase A: Heat and oxygen diffusion
    this.updateHeatDiffusion(chunk, dt);
    this.updateOxygenDiffusion(chunk, dt);
    
    // Phase B: Combustion and material reactions
    this.updateCombustion(chunk, dt);
    
    // Phase C: Fluid movement and convection
    const fluidMovements = updateChunkFluids(this.grid, chunk, dt);
    this.debugStats.fluidMovements += fluidMovements;
    
    // Phase D: Special material interactions
    this.updateSpecialInteractions(chunk, dt);
    
    this.debugStats.cellsUpdated += size * size;
  }
  
  /**
   * Heat diffusion phase
   * @param {Chunk} chunk 
   * @param {number} dt 
   */
  updateHeatDiffusion(chunk, dt) {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    const tempBuffer = new Float32Array(size * size);
    
    // Copy current temperatures to buffer
    for (let i = 0; i < size * size; i++) {
      tempBuffer[i] = chunk.temperature[i];
    }
    
    // Calculate heat diffusion
    for (let localY = 0; localY < size; localY++) {
      for (let localX = 0; localX < size; localX++) {
        const idx = chunk.getIndex(localX, localY);
        const worldX = chunk.chunkX * size + localX;
        const worldY = chunk.chunkY * size + localY;
        
        const currentTemp = chunk.temperature[idx];
        const material = getMaterial(chunk.materialId[idx]);
        
        let heatExchange = 0;
        let neighborCount = 0;
        
        // Check 4-connected neighbors
        const neighbors = this.grid.getNeighbors4(worldX, worldY);
        
        for (const neighbor of neighbors) {
          const neighborCell = this.grid.getCell(neighbor.x, neighbor.y);
          if (!neighborCell) continue;
          
          const neighborMaterial = getMaterial(neighborCell.materialId);
          const tempDiff = neighborCell.temperature - currentTemp;
          
          // Heat transfer rate depends on both materials' conductivity
          const conductivity = (material.thermalConductivity + neighborMaterial.thermalConductivity) / 2;
          
          heatExchange += tempDiff * conductivity * FIRE_CONFIG.HEAT_DIFFUSION_RATE * dt;
          neighborCount++;
        }
        
        // Apply heat exchange with capacity consideration
        if (neighborCount > 0) {
          const heatCapacityFactor = 1.0 / material.heatCapacity;
          tempBuffer[idx] = currentTemp + (heatExchange / neighborCount) * heatCapacityFactor;
          
          // Add convection bias for hot gases (heat rises)
          if (currentTemp > FIRE_CONFIG.BUOYANCY_HEAT_THRESHOLD && material.buoyancyFactor > 0) {
            const upNeighbor = this.grid.getCell(worldX, worldY - 1);
            if (upNeighbor && upNeighbor.temperature < currentTemp) {
              const convectionBonus = (currentTemp - upNeighbor.temperature) * 
                                    material.buoyancyFactor * dt * 0.2;
              tempBuffer[idx] += convectionBonus;
            }
          }
        }
        
        // Ambient cooling
        const ambientCooling = (currentTemp - TEMP_CONSTANTS.AMBIENT) * 
                              FIRE_CONFIG.HEAT_LOSS_RATE * dt;
        tempBuffer[idx] -= ambientCooling;
        
        // Clamp temperature
        tempBuffer[idx] = Math.max(0, Math.min(material.maxTemp, tempBuffer[idx]));
      }
    }
    
    // Copy back from buffer
    for (let i = 0; i < size * size; i++) {
      chunk.temperature[i] = tempBuffer[i];
    }
  }
  
  /**
   * Oxygen diffusion phase
   * @param {Chunk} chunk 
   * @param {number} dt 
   */
  updateOxygenDiffusion(chunk, dt) {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    const oxygenBuffer = new Float32Array(size * size);
    
    // Copy current oxygen levels
    for (let i = 0; i < size * size; i++) {
      oxygenBuffer[i] = chunk.oxygen[i];
    }
    
    // Calculate oxygen diffusion
    for (let localY = 0; localY < size; localY++) {
      for (let localX = 0; localX < size; localX++) {
        const idx = chunk.getIndex(localX, localY);
        const worldX = chunk.chunkX * size + localX;
        const worldY = chunk.chunkY * size + localY;
        
        const currentOxygen = chunk.oxygen[idx];
        
        let oxygenExchange = 0;
        let neighborCount = 0;
        
        // Check neighbors for oxygen diffusion
        const neighbors = this.grid.getNeighbors4(worldX, worldY);
        
        for (const neighbor of neighbors) {
          const neighborCell = this.grid.getCell(neighbor.x, neighbor.y);
          if (!neighborCell) continue;
          
          const oxygenDiff = neighborCell.oxygen - currentOxygen;
          oxygenExchange += oxygenDiff * FIRE_CONFIG.OXYGEN_DIFFUSION_RATE * dt;
          neighborCount++;
        }
        
        if (neighborCount > 0) {
          oxygenBuffer[idx] = Math.max(0, Math.min(1, 
            currentOxygen + (oxygenExchange / neighborCount)
          ));
        }
      }
    }
    
    // Copy back from buffer
    for (let i = 0; i < size * size; i++) {
      chunk.oxygen[i] = oxygenBuffer[i];
    }
  }
  
  /**
   * Combustion phase
   * @param {Chunk} chunk 
   * @param {number} dt 
   */
  updateCombustion(chunk, dt) {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    
    for (let localY = 0; localY < size; localY++) {
      for (let localX = 0; localX < size; localX++) {
        const idx = chunk.getIndex(localX, localY);
        const worldX = chunk.chunkX * size + localX;
        const worldY = chunk.chunkY * size + localY;
        
        const materialId = chunk.materialId[idx];
        const material = getMaterial(materialId);
        
        if (!isFlammable(materialId)) continue;
        
        const temperature = chunk.temperature[idx];
        const oxygen = chunk.oxygen[idx];
        const fuel = chunk.fuel[idx];
        const wetness = chunk.wetness[idx];
        
        // Check combustion conditions
        const canIgnite = temperature >= material.ignitionTemp &&
                         oxygen > FIRE_CONFIG.MIN_OXYGEN_FOR_FIRE &&
                         fuel > 0 &&
                         wetness < material.extinguishThreshold;
        
        if (canIgnite) {
          this.debugStats.combustionEvents++;
          
          // Calculate burn rate based on conditions
          const oxygenFactor = Math.min(oxygen / 0.21, 1.0);  // 21% is normal air
          const drynessFactor = Math.max(0, 1.0 - wetness / material.extinguishThreshold);
          const tempFactor = Math.min((temperature - material.ignitionTemp) / 200, 2.0);
          
          const burnRate = material.burnRate * material.flammability * 
                          oxygenFactor * drynessFactor * tempFactor * 
                          FIRE_CONFIG.COMBUSTION_RATE_MULTIPLIER * dt;
          
          // Consume fuel and oxygen
          const fuelConsumed = Math.min(fuel, burnRate);
          chunk.fuel[idx] = fuel - fuelConsumed;
          chunk.oxygen[idx] = Math.max(0, oxygen - fuelConsumed * 0.5);
          
          // Generate heat
          const heatGenerated = fuelConsumed * 800;  // Heat per unit fuel
          chunk.temperature[idx] = Math.min(material.maxTemp, temperature + heatGenerated);
          
          // Produce combustion products
          this.produceCombustionProducts(chunk, localX, localY, fuelConsumed, material);
          
          // Check for material transformation when fuel is depleted
          if (chunk.fuel[idx] <= 0) {
            this.transformBurnedMaterial(chunk, idx, materialId);
          }
        }
      }
    }
  }
  
  /**
   * Produce smoke and other combustion products
   * @param {Chunk} chunk 
   * @param {number} localX 
   * @param {number} localY 
   * @param {number} fuelConsumed 
   * @param {MaterialDef} material 
   */
  produceCombustionProducts(chunk, localX, localY, fuelConsumed, material) {
    if (material.smokeYield <= 0) return;
    
    const worldX = chunk.chunkX * CHUNK_CONFIG.CHUNK_SIZE + localX;
    const worldY = chunk.chunkY * CHUNK_CONFIG.CHUNK_SIZE + localY;
    
    // Try to place smoke in nearby air cells
    const neighbors = this.grid.getNeighbors4(worldX, worldY);
    
    for (const neighbor of neighbors) {
      const neighborCell = this.grid.getCell(neighbor.x, neighbor.y);
      if (!neighborCell || neighborCell.materialId !== MATERIAL_IDS.AIR) continue;
      
      // Convert some air to smoke
      const smokeAmount = fuelConsumed * material.smokeYield;
      if (smokeAmount > 0.1) {
        this.grid.setCell(neighbor.x, neighbor.y, {
          materialId: MATERIAL_IDS.SMOKE,
          temperature: neighborCell.temperature + 100,  // Hot smoke
          fuel: 0,
          wetness: 0,
          oxygen: neighborCell.oxygen * 0.8,  // Reduce oxygen
          density: 0.0008 + smokeAmount * 0.0002
        });
        break;  // Only produce one smoke particle per burn event
      }
    }
  }
  
  /**
   * Transform material when fuel is depleted
   * @param {Chunk} chunk 
   * @param {number} idx 
   * @param {number} originalMaterialId 
   */
  transformBurnedMaterial(chunk, idx, originalMaterialId) {
    this.debugStats.materialTransforms++;
    
    let newMaterialId;
    
    switch (originalMaterialId) {
      case MATERIAL_IDS.WOOD:
        newMaterialId = MATERIAL_IDS.CHAR;
        break;
      case MATERIAL_IDS.OIL:
      case MATERIAL_IDS.GASOLINE:
        newMaterialId = MATERIAL_IDS.AIR;  // Burns away completely
        break;
      case MATERIAL_IDS.CHAR:
        newMaterialId = MATERIAL_IDS.ASH;
        break;
      default:
        newMaterialId = MATERIAL_IDS.ASH;
    }
    
    const newMaterial = getMaterial(newMaterialId);
    
    chunk.materialId[idx] = newMaterialId;
    chunk.fuel[idx] = newMaterial.flammability > 0 ? 0.5 : 0;  // Some residual fuel for char
    chunk.density[idx] = newMaterial.density;
  }
  
  /**
   * Special material interactions (water->steam, oil floating, etc.)
   * @param {Chunk} chunk 
   * @param {number} dt 
   */
  updateSpecialInteractions(chunk, dt) {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    
    for (let localY = 0; localY < size; localY++) {
      for (let localX = 0; localX < size; localX++) {
        const worldX = chunk.chunkX * size + localX;
        const worldY = chunk.chunkY * size + localY;
        
        // Water to steam conversion
        this.updateWaterToSteam(chunk, localX, localY);
        
        // Steam condensation
        updateSteamCondensation(this.grid, worldX, worldY);
        
        // Smoke dissipation
        updateSmokeDissipation(this.grid, worldX, worldY, dt);
        
        // Oil/water interaction
        updateOilWaterInteraction(this.grid, worldX, worldY);
      }
    }
  }
  
  /**
   * Convert hot water to steam
   * @param {Chunk} chunk 
   * @param {number} localX 
   * @param {number} localY 
   */
  updateWaterToSteam(chunk, localX, localY) {
    const idx = chunk.getIndex(localX, localY);
    
    if (chunk.materialId[idx] !== MATERIAL_IDS.WATER) return;
    
    const temperature = chunk.temperature[idx];
    
    // Water converts to steam when heated above boiling point
    if (temperature > TEMP_CONSTANTS.BOILING) {
      chunk.materialId[idx] = MATERIAL_IDS.STEAM;
      chunk.density[idx] = getMaterial(MATERIAL_IDS.STEAM).density;
      chunk.wetness[idx] = 0.5;  // Steam retains some moisture
      this.debugStats.materialTransforms++;
    }
  }
  
  // ===============================================
  // Public API for integration with game systems
  // ===============================================
  
  /**
   * Ignite a circular area (for molotov impacts)
   * @param {number} centerX 
   * @param {number} centerY 
   * @param {number} radius 
   * @param {number} materialId - Optional material to add
   */
  igniteCircle(centerX, centerY, radius, materialId = MATERIAL_IDS.OIL) {
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(GRID_CONFIG.GRID_WIDTH - 1, Math.ceil(centerX + radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(GRID_CONFIG.GRID_HEIGHT - 1, Math.ceil(centerY + radius));
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= radius) {
          const intensity = 1.0 - (dist / radius);
          const material = getMaterial(materialId);
          
          this.grid.setCell(x, y, {
            materialId: materialId,
            temperature: TEMP_CONSTANTS.AMBIENT + 400 * intensity,
            fuel: material.flammability * intensity,
            wetness: 0,
            oxygen: 0.8,
            density: material.density
          });
        }
      }
    }
    
    // Activate area for simulation
    this.grid.activateArea(centerX, centerY, radius + 5, performance.now() / 1000);
  }
  
  /**
   * Add water in a circular area
   * @param {number} centerX 
   * @param {number} centerY 
   * @param {number} radius 
   * @param {number} intensity 
   */
  addWaterCircle(centerX, centerY, radius, intensity = 1.0) {
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(GRID_CONFIG.GRID_WIDTH - 1, Math.ceil(centerX + radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(GRID_CONFIG.GRID_HEIGHT - 1, Math.ceil(centerY + radius));
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= radius) {
          const amount = intensity * (1.0 - (dist / radius));
          
          this.grid.setCell(x, y, {
            materialId: MATERIAL_IDS.WATER,
            temperature: TEMP_CONSTANTS.AMBIENT,
            fuel: 0,
            wetness: 1.0,
            oxygen: 0.5,
            density: 1.0
          });
        }
      }
    }
    
    this.grid.activateArea(centerX, centerY, radius + 5, performance.now() / 1000);
  }
  
  /**
   * Add oil in a circular area
   * @param {number} centerX 
   * @param {number} centerY 
   * @param {number} radius 
   * @param {number} amount 
   */
  addOilCircle(centerX, centerY, radius, amount = 1.0) {
    this.igniteCircle(centerX, centerY, radius, MATERIAL_IDS.OIL);
    // Don't auto-ignite, just place oil
    
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(GRID_CONFIG.GRID_WIDTH - 1, Math.ceil(centerX + radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(GRID_CONFIG.GRID_HEIGHT - 1, Math.ceil(centerY + radius));
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= radius) {
          const cell = this.grid.getCell(x, y);
          if (cell) {
            this.grid.setCell(x, y, {
              ...cell,
              temperature: TEMP_CONSTANTS.AMBIENT
            });
          }
        }
      }
    }
  }
  
  /**
   * Add heat in a circular area
   * @param {number} centerX 
   * @param {number} centerY 
   * @param {number} radius 
   * @param {number} deltaT 
   */
  addHeatCircle(centerX, centerY, radius, deltaT) {
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(GRID_CONFIG.GRID_WIDTH - 1, Math.ceil(centerX + radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(GRID_CONFIG.GRID_HEIGHT - 1, Math.ceil(centerY + radius));
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= radius) {
          const intensity = 1.0 - (dist / radius);
          const cell = this.grid.getCell(x, y);
          
          if (cell) {
            const material = getMaterial(cell.materialId);
            const newTemp = Math.min(material.maxTemp, 
              cell.temperature + deltaT * intensity);
            
            this.grid.setCell(x, y, {
              ...cell,
              temperature: newTemp
            });
          }
        }
      }
    }
    
    this.grid.activateArea(centerX, centerY, radius + 5, performance.now() / 1000);
  }
  
  /**
   * Check if there are burning cells at a position
   * @param {number} x 
   * @param {number} y 
   * @returns {boolean}
   */
  queryBurningAt(x, y) {
    const cell = this.grid.getCell(Math.floor(x), Math.floor(y));
    if (!cell) return false;
    
    const material = getMaterial(cell.materialId);
    return isFlammable(cell.materialId) && 
           cell.temperature >= material.ignitionTemp && 
           cell.fuel > 0 && 
           cell.oxygen > FIRE_CONFIG.MIN_OXYGEN_FOR_FIRE;
  }
  
  /**
   * Query damage for entities in an AABB
   * @param {{x: number, y: number, w: number, h: number}} aabb 
   * @returns {{damage: number, burningCells: number, avgTemp: number}}
   */
  queryDamageForAABB(aabb) {
    const minX = Math.max(0, Math.floor(aabb.x));
    const maxX = Math.min(GRID_CONFIG.GRID_WIDTH - 1, Math.ceil(aabb.x + aabb.w));
    const minY = Math.max(0, Math.floor(aabb.y));
    const maxY = Math.min(GRID_CONFIG.GRID_HEIGHT - 1, Math.ceil(aabb.y + aabb.h));
    
    let burningCells = 0;
    let totalTemp = 0;
    let cellCount = 0;
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const cell = this.grid.getCell(x, y);
        if (!cell) continue;
        
        cellCount++;
        totalTemp += cell.temperature;
        
        if (this.queryBurningAt(x, y)) {
          burningCells++;
        }
      }
    }
    
    const avgTemp = cellCount > 0 ? totalTemp / cellCount : TEMP_CONSTANTS.AMBIENT;
    const damage = burningCells * 0.5 + Math.max(0, (avgTemp - 100) / 100);
    
    return { damage, burningCells, avgTemp };
  }
  
  /**
   * Get debug information about the simulation
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      ...this.grid.getDebugInfo(),
      totalUpdates: this.totalUpdates,
      lastStats: { ...this.debugStats },
      config: { ...FIRE_CONFIG }
    };
  }
}