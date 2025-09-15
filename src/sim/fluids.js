/**
 * Fluid flow kernels and oxygen diffusion for cellular automata.
 * 
 * Handles:
 * - Gas movement (buoyancy, thermal convection)
 * - Liquid flow (gravity, viscosity, surface tension)
 * - Oxygen diffusion and consumption
 * - Material density interactions (oil floats on water)
 */

import { MATERIAL_IDS, getMaterial } from './materials.js';

/**
 * Simple fluid flow simulation
 */
export class FluidSimulation {
  constructor(grid) {
    this.grid = grid;
    this.flowStrength = 0.1;
    this.diffusionRate = 0.05;
    this.buoyancyStrength = 0.3;
  }
  
  /**
   * Update fluid flows for all active cells
   * @param {number} deltaTime
   */
  updateFlows(deltaTime) {
    const activeCells = this.grid.getActiveCells();
    const movements = [];
    
    // Calculate desired movements for each cell
    for (const cell of activeCells) {
      const material = getMaterial(cell.chunk.materialId[cell.index]);
      
      if (material.flowType === 'gas') {
        this.calculateGasMovement(cell, material, movements, deltaTime);
      } else if (material.flowType === 'liquid') {
        this.calculateLiquidMovement(cell, material, movements, deltaTime);
      }
    }
    
    // Apply movements
    this.applyMovements(movements, deltaTime);
  }
  
  /**
   * Calculate gas movement (buoyancy and thermal convection)
   * @param {object} cell
   * @param {object} material
   * @param {Array} movements
   * @param {number} deltaTime
   */
  calculateGasMovement(cell, material, movements, deltaTime) {
    const { worldX, worldY, chunk, index } = cell;
    const temp = chunk.temp[index];
    const pressure = this.calculatePressure(worldX, worldY);
    
    // Buoyancy force
    let buoyancyForce = 0;
    if (material.buoyancy > 0) {
      buoyancyForce = material.buoyancy * this.buoyancyStrength;
      
      // Hot gases rise more
      if (temp > 50) {
        buoyancyForce *= 1 + (temp - 50) / 100;
      }
    }
    
    // Try to move up if buoyant
    if (buoyancyForce > 0) {
      const upY = worldY - 1;
      if (this.canGasMoveTo(worldX, upY)) {
        movements.push({
          fromX: worldX,
          fromY: worldY,
          toX: worldX,
          toY: upY,
          amount: Math.min(1.0, buoyancyForce * deltaTime),
          material: chunk.materialId[index],
          temp: temp,
          fuel: chunk.fuel[index],
          wetness: chunk.wetness[index],
          oxygen: chunk.oxygen[index]
        });
      }
    }
    
    // Lateral pressure equalization
    this.calculatePressureFlow(cell, movements, deltaTime);
  }
  
  /**
   * Calculate liquid movement (gravity and flow)
   * @param {object} cell
   * @param {object} material
   * @param {Array} movements
   * @param {number} deltaTime
   */
  calculateLiquidMovement(cell, material, movements, deltaTime) {
    const { worldX, worldY, chunk, index } = cell;
    
    // Gravity - try to move down
    const downY = worldY + 1;
    if (this.canLiquidMoveTo(worldX, downY, material)) {
      movements.push({
        fromX: worldX,
        fromY: worldY,
        toX: worldX,
        toY: downY,
        amount: 0.8 * deltaTime,
        material: chunk.materialId[index],
        temp: chunk.temp[index],
        fuel: chunk.fuel[index],
        wetness: chunk.wetness[index],
        oxygen: chunk.oxygen[index]
      });
      return; // Prefer vertical movement
    }
    
    // Lateral flow if can't move down
    this.calculateLateralFlow(cell, material, movements, deltaTime);
  }
  
  /**
   * Calculate pressure-driven flow for gases
   * @param {object} cell
   * @param {Array} movements
   * @param {number} deltaTime
   */
  calculatePressureFlow(cell, movements, deltaTime) {
    const { worldX, worldY } = cell;
    const neighbors = this.grid.getNeighbors(worldX, worldY);
    
    for (const neighbor of neighbors) {
      const neighborCell = this.grid.getCell(neighbor.x, neighbor.y);
      if (!neighborCell) continue;
      
      const neighborMaterial = getMaterial(neighborCell.materialId);
      
      // Flow into lower pressure areas (represented by temperature difference)
      if (neighborMaterial.flowType === 'gas' || neighborCell.materialId === MATERIAL_IDS.AIR) {
        const pressureDiff = cell.chunk.temp[cell.index] - neighborCell.temp;
        if (pressureDiff > 5) { // Threshold for flow
          const flowAmount = Math.min(0.1, pressureDiff * 0.01 * deltaTime);
          
          movements.push({
            fromX: worldX,
            fromY: worldY,
            toX: neighbor.x,
            toY: neighbor.y,
            amount: flowAmount,
            material: cell.chunk.materialId[cell.index],
            temp: cell.chunk.temp[cell.index],
            fuel: cell.chunk.fuel[cell.index],
            wetness: cell.chunk.wetness[cell.index],
            oxygen: cell.chunk.oxygen[cell.index]
          });
        }
      }
    }
  }
  
  /**
   * Calculate lateral flow for liquids
   * @param {object} cell
   * @param {object} material
   * @param {Array} movements
   * @param {number} deltaTime
   */
  calculateLateralFlow(cell, material, movements, deltaTime) {
    const { worldX, worldY } = cell;
    const leftX = worldX - 1;
    const rightX = worldX + 1;
    
    // Check both horizontal directions
    const canMoveLeft = this.canLiquidMoveTo(leftX, worldY, material);
    const canMoveRight = this.canLiquidMoveTo(rightX, worldY, material);
    
    if (canMoveLeft || canMoveRight) {
      const flowAmount = 0.3 * deltaTime;
      
      if (canMoveLeft && canMoveRight) {
        // Split flow
        movements.push({
          fromX: worldX,
          fromY: worldY,
          toX: leftX,
          toY: worldY,
          amount: flowAmount * 0.5,
          material: cell.chunk.materialId[cell.index],
          temp: cell.chunk.temp[cell.index],
          fuel: cell.chunk.fuel[cell.index],
          wetness: cell.chunk.wetness[cell.index],
          oxygen: cell.chunk.oxygen[cell.index]
        });
        
        movements.push({
          fromX: worldX,
          fromY: worldY,
          toX: rightX,
          toY: worldY,
          amount: flowAmount * 0.5,
          material: cell.chunk.materialId[cell.index],
          temp: cell.chunk.temp[cell.index],
          fuel: cell.chunk.fuel[cell.index],
          wetness: cell.chunk.wetness[cell.index],
          oxygen: cell.chunk.oxygen[cell.index]
        });
      } else {
        // Single direction
        const targetX = canMoveLeft ? leftX : rightX;
        movements.push({
          fromX: worldX,
          fromY: worldY,
          toX: targetX,
          toY: worldY,
          amount: flowAmount,
          material: cell.chunk.materialId[cell.index],
          temp: cell.chunk.temp[cell.index],
          fuel: cell.chunk.fuel[cell.index],
          wetness: cell.chunk.wetness[cell.index],
          oxygen: cell.chunk.oxygen[cell.index]
        });
      }
    }
  }
  
  /**
   * Check if gas can move to target location
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  canGasMoveTo(x, y) {
    if (!this.grid.isValidCoord(x, y)) return false;
    
    const cell = this.grid.getCell(x, y);
    if (!cell) return false;
    
    const material = getMaterial(cell.materialId);
    
    // Can move into air or less dense gases
    return cell.materialId === MATERIAL_IDS.AIR || 
           (material.flowType === 'gas' && material.density < 1.0);
  }
  
  /**
   * Check if liquid can move to target location
   * @param {number} x
   * @param {number} y
   * @param {object} liquidMaterial
   * @returns {boolean}
   */
  canLiquidMoveTo(x, y, liquidMaterial) {
    if (!this.grid.isValidCoord(x, y)) return false;
    
    const cell = this.grid.getCell(x, y);
    if (!cell) return false;
    
    const targetMaterial = getMaterial(cell.materialId);
    
    // Can move into air
    if (cell.materialId === MATERIAL_IDS.AIR) return true;
    
    // Can move into gases
    if (targetMaterial.flowType === 'gas') return true;
    
    // Oil floats on water
    if (liquidMaterial.name === 'Oil' && targetMaterial.name === 'Water') {
      return false; // Oil should stay on top
    }
    
    // Water can mix with oil (displaces from below)
    if (liquidMaterial.name === 'Water' && targetMaterial.name === 'Oil') {
      return true; // Water displaces oil upward
    }
    
    return false;
  }
  
  /**
   * Calculate pressure at a location (simplified)
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  calculatePressure(x, y) {
    const cell = this.grid.getCell(x, y);
    if (!cell) return 0;
    
    // Pressure increases with temperature and decreases with altitude
    const basePressure = 1.0;
    const altitudeFactor = 1.0 - (y / this.grid.constructor.GRID_HEIGHT) * 0.1;
    const temperatureFactor = 1.0 + (cell.temp - 20) / 200;
    
    return basePressure * altitudeFactor * temperatureFactor;
  }
  
  /**
   * Apply all calculated movements
   * @param {Array} movements
   * @param {number} deltaTime
   */
  applyMovements(movements, deltaTime) {
    // Sort movements by priority (vertical first, then horizontal)
    movements.sort((a, b) => {
      const aVertical = Math.abs(a.toY - a.fromY);
      const bVertical = Math.abs(b.toY - b.fromY);
      return bVertical - aVertical;
    });
    
    for (const movement of movements) {
      this.applyMovement(movement);
    }
  }
  
  /**
   * Apply a single movement
   * @param {object} movement
   */
  applyMovement(movement) {
    const fromCell = this.grid.getCell(movement.fromX, movement.fromY);
    const toCell = this.grid.getCell(movement.toX, movement.toY);
    
    if (!fromCell || !toCell) return;
    
    // Calculate how much can actually move
    const maxMove = Math.min(movement.amount, 1.0);
    
    // Move material
    if (toCell.materialId === MATERIAL_IDS.AIR) {
      // Moving into empty space
      this.grid.setCell(movement.toX, movement.toY, {
        materialId: movement.material,
        temp: movement.temp,
        fuel: movement.fuel,
        wetness: movement.wetness,
        oxygen: movement.oxygen
      });
      
      // Reduce source
      this.grid.setCell(movement.fromX, movement.fromY, {
        materialId: MATERIAL_IDS.AIR,
        temp: 20,
        fuel: 0,
        wetness: 0,
        oxygen: 21
      });
    } else {
      // Mixing with existing material
      this.mixMaterials(movement, toCell, maxMove);
    }
  }
  
  /**
   * Mix materials when they meet
   * @param {object} movement
   * @param {object} targetCell
   * @param {number} amount
   */
  mixMaterials(movement, targetCell, amount) {
    // Simple mixing - average properties weighted by amount
    const newTemp = (targetCell.temp * (1 - amount)) + (movement.temp * amount);
    const newFuel = (targetCell.fuel * (1 - amount)) + (movement.fuel * amount);
    const newWetness = Math.max(targetCell.wetness, movement.wetness * amount);
    const newOxygen = (targetCell.oxygen * (1 - amount)) + (movement.oxygen * amount);
    
    this.grid.setCell(movement.toX, movement.toY, {
      temp: newTemp,
      fuel: newFuel,
      wetness: newWetness,
      oxygen: newOxygen
    });
  }
  
  /**
   * Update oxygen diffusion
   * @param {number} deltaTime
   */
  updateOxygenDiffusion(deltaTime) {
    this.grid.prepareDiffusionBuffers();
    
    const activeCells = this.grid.getActiveCells();
    
    for (const cell of activeCells) {
      const neighbors = this.grid.getNeighbors(cell.worldX, cell.worldY);
      let totalOxygen = cell.chunk.oxygen[cell.index];
      let count = 1;
      
      for (const neighbor of neighbors) {
        const neighborCell = this.grid.getCell(neighbor.x, neighbor.y);
        if (neighborCell) {
          totalOxygen += neighborCell.oxygen;
          count++;
        }
      }
      
      const averageOxygen = totalOxygen / count;
      const diffusionAmount = (averageOxygen - cell.chunk.oxygen[cell.index]) * this.diffusionRate * deltaTime;
      
      cell.chunk.oxygenBuffer[cell.index] = Math.max(0, cell.chunk.oxygen[cell.index] + diffusionAmount);
    }
    
    // Swap buffers
    for (const key of this.grid.activeChunks) {
      const chunk = this.grid.chunks.get(key);
      if (chunk) {
        chunk.swapOxygenBuffers();
      }
    }
  }
  
  /**
   * Update thermal diffusion
   * @param {number} deltaTime
   */
  updateThermalDiffusion(deltaTime) {
    this.grid.prepareDiffusionBuffers();
    
    const activeCells = this.grid.getActiveCells();
    
    for (const cell of activeCells) {
      const material = getMaterial(cell.chunk.materialId[cell.index]);
      const neighbors = this.grid.getNeighbors(cell.worldX, cell.worldY);
      
      let heatTransfer = 0;
      
      for (const neighbor of neighbors) {
        const neighborCell = this.grid.getCell(neighbor.x, neighbor.y);
        if (!neighborCell) continue;
        
        const neighborMaterial = getMaterial(neighborCell.materialId);
        const tempDiff = neighborCell.temp - cell.chunk.temp[cell.index];
        
        // Heat transfer rate depends on thermal conductivity
        const conductivity = (material.thermalConductivity + neighborMaterial.thermalConductivity) / 2;
        heatTransfer += tempDiff * conductivity * this.diffusionRate * deltaTime;
      }
      
      cell.chunk.tempBuffer[cell.index] = cell.chunk.temp[cell.index] + heatTransfer;
    }
    
    // Swap buffers
    for (const key of this.grid.activeChunks) {
      const chunk = this.grid.chunks.get(key);
      if (chunk) {
        chunk.swapTempBuffers();
      }
    }
  }
}