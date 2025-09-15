/**
 * Main cellular automata fire engine.
 * 
 * Orchestrates the fixed-step simulation with three phases:
 * A) Diffusion and oxygen transport
 * B) Combustion and chemistry
 * C) Fluid dynamics
 * 
 * Manages update budget and provides public API for game integration.
 */

import { ChunkGrid, UPDATE_BUDGET } from './chunk_grid.js';
import { FluidSimulation } from './fluids.js';
import { MATERIAL_IDS, getMaterial, canIgnite, getPhaseTransition, getCombustionProducts } from './materials.js';

export class FireCA {
  constructor() {
    this.grid = new ChunkGrid();
    this.fluids = new FluidSimulation(this.grid);
    
    // Timing
    this.fixedTimeStep = 1/60; // 60 FPS simulation
    this.accumulator = 0;
    this.lastTime = 0;
    
    // Update budget management
    this.updateBudget = UPDATE_BUDGET;
    this.remainingBudget = UPDATE_BUDGET;
    this.budgetCarryover = 0;
    
    // Statistics
    this.stats = {
      totalUpdates: 0,
      averageUpdatesPerFrame: 0,
      lastFrameUpdates: 0,
      fps: 60
    };
    
    // Event tracking
    this.events = [];
  }
  
  /**
   * Main update loop - called every frame
   * @param {number} deltaTime - Time since last frame
   */
  update(deltaTime) {
    this.accumulator += Math.min(deltaTime, 0.033); // Cap deltaTime to prevent spiral
    
    let updatesThisFrame = 0;
    this.remainingBudget = this.updateBudget + this.budgetCarryover;
    this.budgetCarryover = 0;
    
    while (this.accumulator >= this.fixedTimeStep && this.remainingBudget > 0) {
      const updateCost = this.simulationStep(this.fixedTimeStep);
      this.remainingBudget -= updateCost;
      updatesThisFrame++;
      
      if (updateCost < this.updateBudget) {
        this.accumulator -= this.fixedTimeStep;
      } else {
        // Budget exceeded, carry over remaining work
        this.budgetCarryover = Math.max(0, this.updateBudget - updateCost);
        break;
      }
    }
    
    // Update statistics
    this.stats.lastFrameUpdates = updatesThisFrame;
    this.stats.totalUpdates += updatesThisFrame;
    this.stats.averageUpdatesPerFrame = this.stats.averageUpdatesPerFrame * 0.9 + updatesThisFrame * 0.1;
    
    // Update grid timing
    this.grid.updateActiveChunks(deltaTime);
    
    // Clear events from previous frame
    this.events.length = 0;
  }
  
  /**
   * Single simulation step with budget tracking
   * @param {number} deltaTime - Fixed time step
   * @returns {number} Update cost (cells processed)
   */
  simulationStep(deltaTime) {
    const startCells = this.grid.stats.activeCells;
    
    // Phase A: Diffusion and transport
    this.fluids.updateThermalDiffusion(deltaTime);
    this.fluids.updateOxygenDiffusion(deltaTime);
    
    // Phase B: Combustion and chemistry
    this.updateCombustion(deltaTime);
    
    // Phase C: Fluid dynamics
    this.fluids.updateFlows(deltaTime);
    
    // Phase D: Phase transitions
    this.updatePhaseTransitions(deltaTime);
    
    return Math.max(startCells, this.grid.stats.activeCells);
  }
  
  /**
   * Update combustion for all burning cells
   * @param {number} deltaTime
   */
  updateCombustion(deltaTime) {
    const activeCells = this.grid.getActiveCells();
    
    for (const cell of activeCells) {
      const { worldX, worldY, chunk, index } = cell;
      const materialId = chunk.materialId[index];
      const material = getMaterial(materialId);
      
      // Skip non-combustible materials
      if (material.fuel <= 0) continue;
      
      const temp = chunk.temp[index];
      const fuel = chunk.fuel[index];
      const oxygen = chunk.oxygen[index];
      const wetness = chunk.wetness[index];
      const burning = chunk.burning[index];
      
      // Check ignition conditions
      const canBurn = canIgnite(materialId, temp) && oxygen > 5 && wetness < 0.5;
      
      if (canBurn && !burning) {
        // Ignition
        chunk.burning[index] = 1;
        this.addEvent('ignition', worldX, worldY, { materialId, temp });
        this.grid.markChunkActive(chunk.chunkX, chunk.chunkY);
      }
      
      if (burning && fuel > 0) {
        // Active combustion
        const burnRate = material.burnRate * deltaTime;
        const oxygenNeeded = burnRate * 0.5; // Oxygen consumption rate
        const availableOxygen = Math.min(oxygen, oxygenNeeded);
        const actualBurnRate = burnRate * (availableOxygen / oxygenNeeded);
        
        // Wetness reduces burn rate
        const wetnessFactor = Math.max(0.1, 1 - wetness);
        const finalBurnRate = actualBurnRate * wetnessFactor;
        
        if (finalBurnRate > 0) {
          const fuelConsumed = Math.min(fuel, finalBurnRate);
          const products = getCombustionProducts(materialId, fuelConsumed);
          
          // Update cell properties
          chunk.fuel[index] = Math.max(0, fuel - fuelConsumed);
          chunk.temp[index] = Math.min(1200, temp + products.heatReleased * 0.1);
          chunk.oxygen[index] = Math.max(0, oxygen - availableOxygen);
          
          // Generate combustion products
          this.generateCombustionProducts(worldX, worldY, products);
          
          // Spread fire to neighbors
          this.spreadFire(worldX, worldY, temp, deltaTime);
          
          // Check if fuel is exhausted
          if (chunk.fuel[index] <= 0) {
            chunk.burning[index] = 0;
            chunk.materialId[index] = products.newMaterialId;
            this.addEvent('burnout', worldX, worldY, { materialId: products.newMaterialId });
          }
        }
      } else if (burning && fuel <= 0) {
        // Stop burning when fuel is gone
        chunk.burning[index] = 0;
      }
      
      // Extinguish if too wet or no oxygen
      if (burning && (wetness > 0.8 || oxygen < 2)) {
        chunk.burning[index] = 0;
        chunk.temp[index] = Math.max(20, temp - 50 * deltaTime);
        this.addEvent('extinguish', worldX, worldY, { reason: wetness > 0.8 ? 'wet' : 'oxygen' });
      }
    }
  }
  
  /**
   * Generate combustion products (smoke, steam, heat)
   * @param {number} worldX
   * @param {number} worldY
   * @param {object} products
   */
  generateCombustionProducts(worldX, worldY, products) {
    // Try to place smoke above the fire
    const smokeY = worldY - 1;
    if (products.smokeAmount > 0 && this.grid.isValidCoord(worldX, smokeY)) {
      const smokeCell = this.grid.getCell(worldX, smokeY);
      if (smokeCell && smokeCell.materialId === MATERIAL_IDS.AIR) {
        this.grid.setCell(worldX, smokeY, {
          materialId: MATERIAL_IDS.SMOKE,
          temp: 300 + Math.random() * 200,
          fuel: 0,
          wetness: 0,
          oxygen: 15,
          burning: 0
        });
      }
    }
    
    // Generate steam if present
    if (products.steamAmount > 0) {
      const steamY = worldY - Math.floor(Math.random() * 2) - 1;
      if (this.grid.isValidCoord(worldX, steamY)) {
        const steamCell = this.grid.getCell(worldX, steamY);
        if (steamCell && steamCell.materialId === MATERIAL_IDS.AIR) {
          this.grid.setCell(worldX, steamY, {
            materialId: MATERIAL_IDS.STEAM,
            temp: 120 + Math.random() * 50,
            fuel: 0,
            wetness: 0.8,
            oxygen: 21,
            burning: 0
          });
        }
      }
    }
  }
  
  /**
   * Spread fire to neighboring cells
   * @param {number} worldX
   * @param {number} worldY
   * @param {number} temperature
   * @param {number} deltaTime
   */
  spreadFire(worldX, worldY, temperature, deltaTime) {
    const neighbors = this.grid.getNeighbors(worldX, worldY);
    const spreadChance = Math.min(0.1, temperature / 5000) * deltaTime;
    
    for (const neighbor of neighbors) {
      if (Math.random() > spreadChance) continue;
      
      const neighborCell = this.grid.getCell(neighbor.x, neighbor.y);
      if (!neighborCell || neighborCell.burning) continue;
      
      const neighborMaterial = getMaterial(neighborCell.materialId);
      
      // Check if neighbor can ignite
      if (canIgnite(neighborCell.materialId, neighborCell.temp + 50) && 
          neighborCell.oxygen > 5 && 
          neighborCell.wetness < 0.5 &&
          neighborMaterial.fuel > 0) {
        
        // Heat up the neighbor
        const heatTransfer = (temperature - neighborCell.temp) * 0.05 * deltaTime;
        this.grid.setCell(neighbor.x, neighbor.y, {
          temp: neighborCell.temp + heatTransfer
        });
      }
    }
  }
  
  /**
   * Update phase transitions (steam to water, etc.)
   * @param {number} deltaTime
   */
  updatePhaseTransitions(deltaTime) {
    const activeCells = this.grid.getActiveCells();
    
    for (const cell of activeCells) {
      const { worldX, worldY, chunk, index } = cell;
      const materialId = chunk.materialId[index];
      const temp = chunk.temp[index];
      
      const newMaterialId = getPhaseTransition(materialId, temp);
      if (newMaterialId !== null) {
        chunk.materialId[index] = newMaterialId;
        
        // Adjust properties for new material
        const newMaterial = getMaterial(newMaterialId);
        if (newMaterialId === MATERIAL_IDS.WATER && materialId === MATERIAL_IDS.STEAM) {
          // Steam condensing
          chunk.temp[index] = Math.min(100, temp);
          chunk.wetness[index] = 1.0;
        } else if (newMaterialId === MATERIAL_IDS.STEAM && materialId === MATERIAL_IDS.WATER) {
          // Water vaporizing
          chunk.temp[index] = Math.max(100, temp);
          chunk.wetness[index] = 0.5;
        }
        
        this.addEvent('phase_transition', worldX, worldY, { 
          from: materialId, 
          to: newMaterialId 
        });
      }
    }
  }
  
  /**
   * Add an event for debugging/effects
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {object} data
   */
  addEvent(type, x, y, data = {}) {
    this.events.push({
      type,
      x,
      y,
      data,
      time: performance.now()
    });
  }
  
  /**
   * Public API: Ignite a circular area
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {number} materialId - Optional material to set
   */
  igniteCircle(x, y, radius, materialId = null) {
    const radiusSquared = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSquared = dx * dx + dy * dy;
        if (distSquared <= radiusSquared) {
          const worldX = Math.floor(x + dx);
          const worldY = Math.floor(y + dy);
          
          if (!this.grid.isValidCoord(worldX, worldY)) continue;
          
          const cell = this.grid.getCell(worldX, worldY);
          if (!cell) continue;
          
          // Set material if specified
          if (materialId !== null) {
            this.grid.setCell(worldX, worldY, { materialId });
          }
          
          // Heat up and try to ignite
          const distance = Math.sqrt(distSquared);
          const heatAmount = (1 - distance / radius) * 500;
          
          this.grid.setCell(worldX, worldY, {
            temp: Math.max(cell.temp, 300 + heatAmount)
          });
        }
      }
    }
  }
  
  /**
   * Public API: Add water in a circular area
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {number} intensity
   */
  addWaterCircle(x, y, radius, intensity = 1.0) {
    const radiusSquared = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSquared = dx * dx + dy * dy;
        if (distSquared <= radiusSquared) {
          const worldX = Math.floor(x + dx);
          const worldY = Math.floor(y + dy);
          
          if (!this.grid.isValidCoord(worldX, worldY)) continue;
          
          const cell = this.grid.getCell(worldX, worldY);
          if (!cell) continue;
          
          const distance = Math.sqrt(distSquared);
          const waterAmount = (1 - distance / radius) * intensity;
          
          // Add water material or increase wetness
          if (cell.materialId === MATERIAL_IDS.AIR || cell.materialId === MATERIAL_IDS.SMOKE) {
            this.grid.setCell(worldX, worldY, {
              materialId: MATERIAL_IDS.WATER,
              temp: 20,
              fuel: 0,
              wetness: 1.0,
              oxygen: 21,
              burning: 0
            });
          } else {
            this.grid.setCell(worldX, worldY, {
              wetness: Math.min(1.0, cell.wetness + waterAmount),
              temp: Math.max(20, cell.temp - 100 * waterAmount)
            });
          }
        }
      }
    }
  }
  
  /**
   * Public API: Add oil in a circular area
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {number} amount
   */
  addOilCircle(x, y, radius, amount = 1.0) {
    const radiusSquared = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSquared = dx * dx + dy * dy;
        if (distSquared <= radiusSquared) {
          const worldX = Math.floor(x + dx);
          const worldY = Math.floor(y + dy);
          
          if (!this.grid.isValidCoord(worldX, worldY)) continue;
          
          const cell = this.grid.getCell(worldX, worldY);
          if (!cell) continue;
          
          const distance = Math.sqrt(distSquared);
          const oilAmount = (1 - distance / radius) * amount;
          
          // Only place oil in air or on solid surfaces
          if (cell.materialId === MATERIAL_IDS.AIR || 
              getMaterial(cell.materialId).flowType === 'solid') {
            
            this.grid.setCell(worldX, worldY, {
              materialId: MATERIAL_IDS.OIL,
              temp: 20,
              fuel: 150 * oilAmount,
              wetness: 0,
              oxygen: 0,
              burning: 0
            });
          }
        }
      }
    }
  }
  
  /**
   * Public API: Add heat in a circular area
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {number} deltaT
   */
  addHeatCircle(x, y, radius, deltaT) {
    const radiusSquared = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSquared = dx * dx + dy * dy;
        if (distSquared <= radiusSquared) {
          const worldX = Math.floor(x + dx);
          const worldY = Math.floor(y + dy);
          
          if (!this.grid.isValidCoord(worldX, worldY)) continue;
          
          const cell = this.grid.getCell(worldX, worldY);
          if (!cell) continue;
          
          const distance = Math.sqrt(distSquared);
          const heatAmount = (1 - distance / radius) * deltaT;
          
          this.grid.setCell(worldX, worldY, {
            temp: cell.temp + heatAmount
          });
        }
      }
    }
  }
  
  /**
   * Public API: Query if a location is burning
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  queryBurningAt(x, y) {
    const cell = this.grid.getCell(Math.floor(x), Math.floor(y));
    return cell ? cell.burning > 0 : false;
  }
  
  /**
   * Public API: Query damage for an AABB region
   * @param {object} aabb - {x, y, w, h}
   * @returns {number} Damage amount (0-1)
   */
  queryDamageForAABB(aabb) {
    let totalDamage = 0;
    let cellCount = 0;
    
    for (let y = Math.floor(aabb.y); y < Math.ceil(aabb.y + aabb.h); y++) {
      for (let x = Math.floor(aabb.x); x < Math.ceil(aabb.x + aabb.w); x++) {
        const cell = this.grid.getCell(x, y);
        if (cell) {
          cellCount++;
          if (cell.burning) {
            totalDamage += Math.min(1.0, cell.temp / 500);
          }
        }
      }
    }
    
    return cellCount > 0 ? totalDamage / cellCount : 0;
  }
  
  /**
   * Get simulation statistics
   * @returns {object}
   */
  getStats() {
    return {
      ...this.stats,
      gridStats: this.grid.getStats(),
      remainingBudget: this.remainingBudget,
      budgetCarryover: this.budgetCarryover
    };
  }
  
  /**
   * Get recent events
   * @returns {Array}
   */
  getEvents() {
    return [...this.events];
  }
  
  /**
   * Clear the simulation
   */
  clear() {
    this.grid.clear();
    this.accumulator = 0;
    this.budgetCarryover = 0;
    this.events.length = 0;
  }
}