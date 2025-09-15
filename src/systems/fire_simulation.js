/**
 * Noita-like Fire Simulation System
 * 
 * Implements cellular automata-based fire simulation with:
 * - Grid-based materials with properties (ignition temp, fuel, conductivity)
 * - Heat propagation (conduction + convection)
 * - Oxygen system affecting burn rates
 * - Liquid interactions (water extinguishing, steam generation)
 * - Performance optimizations (active chunks, dirty regions)
 * 
 * Key features:
 * - Ember waterfalls with upward convection bias
 * - Material spreading and consumption
 * - Steam generation and pressure effects
 * - Deterministic simulation when enabled
 */

import { VW, VH } from '../core/constants.js';
import { makeRng } from '../core/rng.js';
import { FireParticleSystem } from './fire_particles.js';

// Fire simulation constants
const CELL_SIZE = 2; // 2x2 pixel cells for performance
const GRID_W = Math.ceil(VW / CELL_SIZE);
const GRID_H = Math.ceil(VH / CELL_SIZE);
const MAX_TEMPERATURE = 2000;
const AMBIENT_TEMPERATURE = 20;
const OXYGEN_MAX = 100;
const HEAT_DIFFUSION_RATE = 0.3;
const CONVECTION_STRENGTH = 0.8;

// Material types
export const MaterialType = {
  AIR: 0,
  WOOD: 1,
  CLOTH: 2,
  OIL: 3,
  WATER: 4,
  STONE: 5,
  METAL: 6,
  PLANT: 7,
  POWDER: 8,
  CHAR: 9,
  STEAM: 10,
  SMOKE: 11,
  EMBER: 12
};

// Material properties database
const MATERIAL_PROPERTIES = {
  [MaterialType.AIR]: {
    name: 'Air',
    ignitionTemp: Infinity,
    maxTemp: MAX_TEMPERATURE,
    flammability: 0,
    fuelAmount: 0,
    burnRate: 0,
    thermalConductivity: 0.02,
    heatCapacity: 1,
    moistureAbsorption: 0,
    smokeYield: 0,
    lightColor: [0, 0, 0],
    buoyancyFactor: 0,
    spreadBias: [0, 0],
    extinguishThreshold: 0,
    density: 1,
    flowRate: 0.8
  },
  [MaterialType.WOOD]: {
    name: 'Wood',
    ignitionTemp: 300,
    maxTemp: 800,
    flammability: 0.7,
    fuelAmount: 100,
    burnRate: 15,
    thermalConductivity: 0.1,
    heatCapacity: 2,
    moistureAbsorption: 0.3,
    smokeYield: 0.4,
    lightColor: [255, 150, 50],
    buoyancyFactor: 0,
    spreadBias: [0, 0],
    extinguishThreshold: 150,
    density: 80,
    flowRate: 0
  },
  [MaterialType.CLOTH]: {
    name: 'Cloth',
    ignitionTemp: 250,
    maxTemp: 600,
    flammability: 0.9,
    fuelAmount: 60,
    burnRate: 25,
    thermalConductivity: 0.05,
    heatCapacity: 1.5,
    moistureAbsorption: 0.5,
    smokeYield: 0.3,
    lightColor: [255, 180, 80],
    buoyancyFactor: 0,
    spreadBias: [0, 0],
    extinguishThreshold: 100,
    density: 30,
    flowRate: 0
  },
  [MaterialType.OIL]: {
    name: 'Oil',
    ignitionTemp: 200,
    maxTemp: 900,
    flammability: 1.0,
    fuelAmount: 150,
    burnRate: 40,
    thermalConductivity: 0.15,
    heatCapacity: 2,
    moistureAbsorption: 0,
    smokeYield: 0.8,
    lightColor: [255, 100, 20],
    buoyancyFactor: -0.1,
    spreadBias: [0.2, 0.1],
    extinguishThreshold: 50,
    density: 90,
    flowRate: 0.6
  },
  [MaterialType.WATER]: {
    name: 'Water',
    ignitionTemp: Infinity,
    maxTemp: 100,
    flammability: 0,
    fuelAmount: 0,
    burnRate: 0,
    thermalConductivity: 0.6,
    heatCapacity: 4.2,
    moistureAbsorption: 0,
    smokeYield: 0,
    lightColor: [0, 0, 0],
    buoyancyFactor: 0,
    spreadBias: [0, 0],
    extinguishThreshold: 0,
    density: 100,
    flowRate: 0.9
  },
  [MaterialType.STONE]: {
    name: 'Stone',
    ignitionTemp: Infinity,
    maxTemp: 1200,
    flammability: 0,
    fuelAmount: 0,
    burnRate: 0,
    thermalConductivity: 2.0,
    heatCapacity: 0.8,
    moistureAbsorption: 0.1,
    smokeYield: 0,
    lightColor: [0, 0, 0],
    buoyancyFactor: 0,
    spreadBias: [0, 0],
    extinguishThreshold: 0,
    density: 150,
    flowRate: 0
  },
  [MaterialType.METAL]: {
    name: 'Metal',
    ignitionTemp: Infinity,
    maxTemp: 1500,
    flammability: 0,
    fuelAmount: 0,
    burnRate: 0,
    thermalConductivity: 50,
    heatCapacity: 0.45,
    moistureAbsorption: 0,
    smokeYield: 0,
    lightColor: [0, 0, 0],
    buoyancyFactor: 0,
    spreadBias: [0, 0],
    extinguishThreshold: 0,
    density: 200,
    flowRate: 0
  }
};

/**
 * Cell data structure for simulation grid
 */
class SimulationCell {
  constructor() {
    this.materialId = MaterialType.AIR;
    this.temperature = AMBIENT_TEMPERATURE;
    this.fuel = 0;
    this.wetness = 0;
    this.oxygen = OXYGEN_MAX;
    this.burning = false;
    this.smoke = 0;
    this.lightEnergy = 0;
    this.lastUpdatedTick = 0;
    this.pressure = 0;
    this.velocity = { x: 0, y: 0 };
  }

  /**
   * Copy state from another cell
   */
  copyFrom(other) {
    this.materialId = other.materialId;
    this.temperature = other.temperature;
    this.fuel = other.fuel;
    this.wetness = other.wetness;
    this.oxygen = other.oxygen;
    this.burning = other.burning;
    this.smoke = other.smoke;
    this.lightEnergy = other.lightEnergy;
    this.pressure = other.pressure;
    this.velocity.x = other.velocity.x;
    this.velocity.y = other.velocity.y;
  }

  /**
   * Get material properties for this cell
   */
  getMaterial() {
    return MATERIAL_PROPERTIES[this.materialId] || MATERIAL_PROPERTIES[MaterialType.AIR];
  }
}

/**
 * Main fire simulation system
 */
export class FireSimulation {
  constructor(config = {}) {
    this.config = {
      deterministic: false,
      maxActiveChunks: 64,
      chunkSize: 16,
      updateSubsteps: 2,
      debugMode: false,
      ...config
    };

    // Initialize grid
    this.grid = [];
    this.gridNext = [];
    this.dirtyRegions = new Set();
    this.activeChunks = new Set();
    
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      this.grid.push(new SimulationCell());
      this.gridNext.push(new SimulationCell());
    }

    // Initialize with air and some ground materials
    this.initializeWorld();

    // RNG for deterministic mode
    this.rng = makeRng(this.config.deterministic ? 12345 : Date.now());
    
    // Performance tracking
    this.lastUpdateTime = 0;
    this.updateCount = 0;
    this.tickTime = 0;

    // Enhanced particle system
    this.particleSystem = new FireParticleSystem(this.rng);
    this.particles = []; // Legacy compatibility
    this.maxParticles = 2000;
  }

  /**
   * Initialize world with basic materials
   */
  initializeWorld() {
    // Fill with air
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = this.getCell(x, y);
        cell.materialId = MaterialType.AIR;
        cell.oxygen = OXYGEN_MAX;
        cell.temperature = AMBIENT_TEMPERATURE;
      }
    }

    // Add some ground (stone)
    const groundY = Math.floor((VH - 22) / CELL_SIZE);
    for (let y = groundY; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = this.getCell(x, y);
        cell.materialId = MaterialType.STONE;
      }
    }

    // Add some wood structures for testing
    this.addWoodStructure(10, groundY - 5, 8, 4);
    this.addWoodStructure(30, groundY - 3, 6, 2);
  }

  /**
   * Add a rectangular wood structure
   */
  addWoodStructure(startX, startY, width, height) {
    for (let y = startY; y < startY + height && y < GRID_H; y++) {
      for (let x = startX; x < startX + width && x < GRID_W; x++) {
        if (x >= 0 && y >= 0) {
          const cell = this.getCell(x, y);
          cell.materialId = MaterialType.WOOD;
          cell.fuel = MATERIAL_PROPERTIES[MaterialType.WOOD].fuelAmount;
          cell.temperature = AMBIENT_TEMPERATURE;
        }
      }
    }
  }

  /**
   * Get cell at grid coordinates
   */
  getCell(x, y) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) {
      return null;
    }
    return this.grid[y * GRID_W + x];
  }

  /**
   * Get next frame cell at grid coordinates
   */
  getCellNext(x, y) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) {
      return null;
    }
    return this.gridNext[y * GRID_W + x];
  }

  /**
   * Convert world coordinates to grid coordinates
   */
  worldToGrid(worldX, worldY) {
    return {
      x: Math.floor(worldX / CELL_SIZE),
      y: Math.floor(worldY / CELL_SIZE)
    };
  }

  /**
   * Convert grid coordinates to world coordinates
   */
  gridToWorld(gridX, gridY) {
    return {
      x: gridX * CELL_SIZE,
      y: gridY * CELL_SIZE
    };
  }

  /**
   * Ignite fire at world coordinates
   */
  igniteAt(worldX, worldY, temperature = 800, radius = 3) {
    const { x: gridX, y: gridY } = this.worldToGrid(worldX, worldY);
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const cell = this.getCell(gridX + dx, gridY + dy);
          if (cell) {
            const intensity = 1 - (dist / radius);
            cell.temperature = Math.max(cell.temperature, temperature * intensity);
            this.markDirty(gridX + dx, gridY + dy);
          }
        }
      }
    }
  }

  /**
   * Add liquid at world coordinates
   */
  addLiquid(worldX, worldY, materialType, amount = 50, radius = 2) {
    const { x: gridX, y: gridY } = this.worldToGrid(worldX, worldY);
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const cell = this.getCell(gridX + dx, gridY + dy);
          if (cell && cell.materialId === MaterialType.AIR) {
            cell.materialId = materialType;
            if (materialType === MaterialType.WATER) {
              cell.wetness = amount;
            }
            this.markDirty(gridX + dx, gridY + dy);
          }
        }
      }
    }
  }

  /**
   * Mark region as dirty for updates
   */
  markDirty(x, y) {
    const chunkX = Math.floor(x / this.config.chunkSize);
    const chunkY = Math.floor(y / this.config.chunkSize);
    const chunkId = `${chunkX},${chunkY}`;
    this.dirtyRegions.add(chunkId);
  }

  /**
   * Main update function
   */
  update(dt) {
    const startTime = performance.now();
    
    // Run substeps for stability
    const substepDt = dt / this.config.updateSubsteps;
    for (let step = 0; step < this.config.updateSubsteps; step++) {
      this.updatePhase1_HeatDiffusion(substepDt);
      this.updatePhase2_Combustion(substepDt);
      this.swapBuffers();
    }

    // Update particles
    this.particleSystem.update(dt, this);

    // Performance tracking
    this.tickTime = performance.now() - startTime;
    this.updateCount++;
  }

  /**
   * Phase 1: Heat diffusion and convection
   */
  updatePhase1_HeatDiffusion(dt) {
    // Copy current state to next buffer
    for (let i = 0; i < this.grid.length; i++) {
      this.gridNext[i].copyFrom(this.grid[i]);
    }

    // Process heat diffusion with convection bias
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        const cell = this.getCell(x, y);
        const cellNext = this.getCellNext(x, y);
        
        if (!cell || !cellNext) continue;

        this.updateHeatDiffusion(x, y, dt);
        this.updateOxygenFlow(x, y, dt);
        this.updateConvection(x, y, dt);
      }
    }
  }

  /**
   * Update heat diffusion for a cell
   */
  updateHeatDiffusion(x, y, dt) {
    const cell = this.getCell(x, y);
    const cellNext = this.getCellNext(x, y);
    const material = cell.getMaterial();

    // Neighbors with convection bias (favor upward)
    const neighbors = [
      { dx: -1, dy: -1, weight: 0.5 }, // up-left
      { dx: 0, dy: -1, weight: 1.2 },  // up (stronger)
      { dx: 1, dy: -1, weight: 0.5 },  // up-right
      { dx: -1, dy: 0, weight: 0.8 },  // left
      { dx: 1, dy: 0, weight: 0.8 },   // right
      { dx: -1, dy: 1, weight: 0.3 },  // down-left
      { dx: 0, dy: 1, weight: 0.4 },   // down
      { dx: 1, dy: 1, weight: 0.3 }    // down-right
    ];

    let heatExchange = 0;
    let totalWeight = 0;

    for (const neighbor of neighbors) {
      const nx = x + neighbor.dx;
      const ny = y + neighbor.dy;
      const neighborCell = this.getCell(nx, ny);
      
      if (neighborCell) {
        const neighborMaterial = neighborCell.getMaterial();
        const tempDiff = neighborCell.temperature - cell.temperature;
        
        // Heat conduction rate based on both materials
        const conductivity = Math.min(material.thermalConductivity, neighborMaterial.thermalConductivity);
        
        // Convection bonus for upward heat transfer
        let convectionBonus = 1.0;
        if (neighbor.dy < 0 && cell.temperature > AMBIENT_TEMPERATURE + 100) {
          convectionBonus = 1.0 + CONVECTION_STRENGTH;
        }
        
        const exchange = tempDiff * conductivity * neighbor.weight * convectionBonus * dt * HEAT_DIFFUSION_RATE;
        heatExchange += exchange;
        totalWeight += neighbor.weight;
      }
    }

    // Apply heat exchange
    const newTemp = cell.temperature + heatExchange / Math.max(1, material.heatCapacity);
    cellNext.temperature = Math.max(AMBIENT_TEMPERATURE, Math.min(MAX_TEMPERATURE, newTemp));
  }

  /**
   * Update oxygen flow
   */
  updateOxygenFlow(x, y, dt) {
    const cell = this.getCell(x, y);
    const cellNext = this.getCellNext(x, y);
    
    // Simple oxygen diffusion
    if (cell.materialId === MaterialType.AIR) {
      let oxygenSum = cell.oxygen;
      let count = 1;
      
      // Average with air neighbors
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const neighbor = this.getCell(x + dx, y + dy);
          if (neighbor && neighbor.materialId === MaterialType.AIR) {
            oxygenSum += neighbor.oxygen;
            count++;
          }
        }
      }
      
      cellNext.oxygen = Math.min(OXYGEN_MAX, oxygenSum / count);
    }
  }

  /**
   * Update convection effects
   */
  updateConvection(x, y, dt) {
    const cell = this.getCell(x, y);
    const cellNext = this.getCellNext(x, y);
    const material = cell.getMaterial();
    
    // Buoyancy effects for hot air and light materials
    if (cell.temperature > AMBIENT_TEMPERATURE + 50) {
      const buoyancy = (cell.temperature - AMBIENT_TEMPERATURE) / 100 * material.buoyancyFactor;
      cellNext.velocity.y -= buoyancy * dt * 100;
    }
  }

  /**
   * Phase 2: Combustion and material changes
   */
  updatePhase2_Combustion(dt) {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = this.getCellNext(x, y);
        if (!cell) continue;

        this.updateCombustion(x, y, dt);
        this.updateLiquidInteractions(x, y, dt);
        this.updateMaterialState(x, y, dt);
      }
    }
  }

  /**
   * Update combustion for a cell
   */
  updateCombustion(x, y, dt) {
    const cell = this.getCellNext(x, y);
    const material = cell.getMaterial();
    
    // Check for ignition
    if (!cell.burning && cell.fuel > 0 && cell.temperature >= material.ignitionTemp) {
      if (cell.oxygen > 10 && cell.wetness < material.extinguishThreshold) {
        cell.burning = true;
        this.markDirty(x, y);
      }
    }
    
    // Handle burning
    if (cell.burning) {
      const oxygenFactor = Math.min(1, cell.oxygen / 50);
      const wetnessFactor = Math.max(0.1, 1 - cell.wetness / 100);
      const burnRate = material.burnRate * oxygenFactor * wetnessFactor * dt;
      
      // Consume fuel
      cell.fuel = Math.max(0, cell.fuel - burnRate);
      
      // Generate heat
      const heatRelease = burnRate * 10;
      cell.temperature = Math.min(material.maxTemp, cell.temperature + heatRelease);
      
      // Consume oxygen
      cell.oxygen = Math.max(0, cell.oxygen - burnRate * 0.5);
      
      // Generate smoke
      cell.smoke = Math.min(100, cell.smoke + material.smokeYield * burnRate);
      
      // Light emission
      cell.lightEnergy = Math.min(100, burnRate * 2);
      
      // Generate embers (particle effects) - enhanced for waterfall effect
      if (this.rng() < 0.3 * dt) { // Increased spawn rate
        this.particleSystem.spawnEmber(x * CELL_SIZE, y * CELL_SIZE, cell.temperature, burnRate / material.burnRate);
      }
      
      // Generate smoke
      if (this.rng() < 0.2 * dt) {
        this.particleSystem.spawnSmoke(x * CELL_SIZE, y * CELL_SIZE, material.smokeYield);
      }
      
      // Stop burning when fuel depleted or temperature too low
      if (cell.fuel <= 0 || cell.temperature < material.ignitionTemp * 0.8) {
        cell.burning = false;
        // Convert to char if it was organic material
        if (cell.materialId === MaterialType.WOOD || cell.materialId === MaterialType.CLOTH) {
          cell.materialId = MaterialType.CHAR;
        }
      }
    }
  }

  /**
   * Update liquid interactions
   */
  updateLiquidInteractions(x, y, dt) {
    const cell = this.getCellNext(x, y);
    
    // Water extinguishing
    if (cell.materialId === MaterialType.WATER && cell.temperature > 80) {
      // Generate steam
      if (cell.temperature > 100) {
        cell.materialId = MaterialType.STEAM;
        cell.pressure += 20; // Steam expansion
        // Steam burst effect
        if (this.rng() < 0.5) {
          this.particleSystem.spawnSteam(x * CELL_SIZE, y * CELL_SIZE, Math.min(2, cell.pressure / 10));
        }
        this.markDirty(x, y);
      }
    }
    
    // Oil spreading and enhanced burning
    if (cell.materialId === MaterialType.OIL && cell.temperature > 150) {
      // Oil spreads fire more aggressively and creates explosive effects
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const neighbor = this.getCellNext(x + dx, y + dy);
          if (neighbor && neighbor.materialId === MaterialType.OIL) {
            neighbor.temperature = Math.max(neighbor.temperature, cell.temperature * 0.8);
            // Chance for ember burst from oil ignition
            if (!neighbor.burning && neighbor.temperature > 200 && this.rng() < 0.1) {
              this.particleSystem.spawnEmberBurst(
                (x + dx) * CELL_SIZE, 
                (y + dy) * CELL_SIZE, 
                6, 
                2.0
              );
            }
          }
        }
      }
    }
  }

  /**
   * Update material state changes
   */
  updateMaterialState(x, y, dt) {
    const cell = this.getCellNext(x, y);
    
    // Evaporate water to steam
    if (cell.materialId === MaterialType.WATER && cell.temperature > 100) {
      cell.materialId = MaterialType.STEAM;
      this.markDirty(x, y);
    }
    
    // Condense steam back to water
    if (cell.materialId === MaterialType.STEAM && cell.temperature < 100) {
      cell.materialId = MaterialType.WATER;
      this.markDirty(x, y);
    }
    
    // Smoke dissipation
    if (cell.smoke > 0) {
      cell.smoke = Math.max(0, cell.smoke - 20 * dt);
    }
    
    // Light decay
    if (cell.lightEnergy > 0) {
      cell.lightEnergy = Math.max(0, cell.lightEnergy - 50 * dt);
    }
  }

  /**
   * Swap current and next buffers
   */
  swapBuffers() {
    [this.grid, this.gridNext] = [this.gridNext, this.grid];
  }

  /**
   * Get debug information
   */
  getDebugInfo() {
    const particleStats = this.particleSystem.getStats();
    return {
      gridSize: `${GRID_W}x${GRID_H}`,
      cellSize: CELL_SIZE,
      activeChunks: this.activeChunks.size,
      dirtyRegions: this.dirtyRegions.size,
      particles: particleStats.total,
      embers: particleStats.ember,
      smoke: particleStats.smoke,
      steam: particleStats.steam,
      updateTime: this.tickTime.toFixed(2) + 'ms',
      updateCount: this.updateCount
    };
  }

  /**
   * Get heat map data for debug visualization
   */
  getHeatMap() {
    const heatMap = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = this.getCell(x, y);
        if (cell) {
          heatMap.push({
            x, y,
            temperature: cell.temperature,
            intensity: Math.min(1, (cell.temperature - AMBIENT_TEMPERATURE) / 800)
          });
        }
      }
    }
    return heatMap;
  }

  /**
   * Check if a cell is burning
   */
  isBurningAt(worldX, worldY) {
    const { x, y } = this.worldToGrid(worldX, worldY);
    const cell = this.getCell(x, y);
    return cell ? cell.burning : false;
  }

  /**
   * Get temperature at world coordinates
   */
  getTemperatureAt(worldX, worldY) {
    const { x, y } = this.worldToGrid(worldX, worldY);
    const cell = this.getCell(x, y);
    return cell ? cell.temperature : AMBIENT_TEMPERATURE;
  }
}

// Export constants for external use
export { CELL_SIZE, GRID_W, GRID_H, MATERIAL_PROPERTIES, MAX_TEMPERATURE, AMBIENT_TEMPERATURE };