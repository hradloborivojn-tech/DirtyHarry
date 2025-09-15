/**
 * Entity pixel coupling layer for per-pixel burning of NPCs and goons.
 * 
 * Each entity has a 16x16 pixel grid that couples with the underlying
 * cellular automata. Entity pixels can ignite, burn, consume fuel,
 * and be extinguished by CA water/steam.
 */

import { MATERIAL_IDS, getMaterial, canIgnite, getCombustionProducts } from './materials.js';

/**
 * Entity pixel layer for a single entity
 */
class EntityPixelLayer {
  constructor(entityRef, aabb) {
    this.entityRef = entityRef;
    this.aabb = { ...aabb }; // {x, y, w, h}
    this.active = true;
    
    // 16x16 pixel grid for entity
    const size = 16 * 16;
    this.materialId = new Uint8Array(size);
    this.temp = new Float32Array(size);
    this.fuel = new Float32Array(size);
    this.wetness = new Float32Array(size);
    this.burning = new Uint8Array(size);
    
    // Initialize based on entity type
    this.initializePixels();
    
    // Damage tracking
    this.totalPixels = size;
    this.burningPixels = 0;
    this.integrityLoss = 0;
  }
  
  /**
   * Initialize pixels based on entity type
   */
  initializePixels() {
    // Default to cloth-like material for NPCs/goons
    const baseMaterial = MATERIAL_IDS.CLOTH;
    const baseFuel = 80;
    const baseTemp = 37; // Body temperature
    
    // Fill entity pixels
    this.materialId.fill(baseMaterial);
    this.temp.fill(baseTemp);
    this.fuel.fill(baseFuel);
    this.wetness.fill(0);
    this.burning.fill(0);
    
    // Add some variation for realism
    for (let i = 0; i < this.materialId.length; i++) {
      // Some pixels have more fuel (clothing)
      if (Math.random() < 0.3) {
        this.fuel[i] = baseFuel * 1.5;
      }
      
      // Temperature variation
      this.temp[i] = baseTemp + (Math.random() - 0.5) * 4;
    }
  }
  
  /**
   * Convert local pixel coordinates to index
   * @param {number} localX - 0 to 15
   * @param {number} localY - 0 to 15
   * @returns {number}
   */
  getPixelIndex(localX, localY) {
    return localY * 16 + localX;
  }
  
  /**
   * Update entity pixels and exchange with CA
   * @param {object} caGrid - Cellular automata grid
   * @param {number} deltaTime
   */
  update(caGrid, deltaTime) {
    if (!this.active) return;
    
    this.burningPixels = 0;
    let newIntegrityLoss = 0;
    
    // Update each pixel
    for (let localY = 0; localY < 16; localY++) {
      for (let localX = 0; localX < 16; localX++) {
        const index = this.getPixelIndex(localX, localY);
        const worldX = Math.floor(this.aabb.x + localX);
        const worldY = Math.floor(this.aabb.y + localY);
        
        // Skip if outside CA grid
        if (!caGrid.isValidCoord(worldX, worldY)) continue;
        
        // Exchange with CA cell
        this.exchangeWithCA(caGrid, worldX, worldY, index, deltaTime);
        
        // Update pixel combustion
        this.updatePixelCombustion(index, deltaTime);
        
        // Track burning pixels
        if (this.burning[index] > 0) {
          this.burningPixels++;
        }
        
        // Track integrity loss
        if (this.fuel[index] <= 0) {
          newIntegrityLoss++;
        }
      }
    }
    
    // Update entity based on pixel state
    this.updateEntityFromPixels(deltaTime);
    this.integrityLoss = newIntegrityLoss;
  }
  
  /**
   * Exchange heat and materials with underlying CA cell
   * @param {object} caGrid
   * @param {number} worldX
   * @param {number} worldY
   * @param {number} pixelIndex
   * @param {number} deltaTime
   */
  exchangeWithCA(caGrid, worldX, worldY, pixelIndex, deltaTime) {
    const caCell = caGrid.getCell(worldX, worldY);
    if (!caCell) return;
    
    const exchangeRate = 0.1 * deltaTime;
    
    // Heat exchange
    const tempDiff = caCell.temp - this.temp[pixelIndex];
    if (Math.abs(tempDiff) > 1) {
      const heatTransfer = tempDiff * exchangeRate;
      this.temp[pixelIndex] += heatTransfer;
      
      // Cool down the CA cell slightly
      caGrid.setCell(worldX, worldY, {
        temp: caCell.temp - heatTransfer * 0.1
      });
    }
    
    // Wetness exchange (CA water/steam affects entity)
    if (caCell.materialId === MATERIAL_IDS.WATER || caCell.materialId === MATERIAL_IDS.STEAM) {
      const wetTransfer = Math.min(0.5, caCell.wetness * exchangeRate);
      this.wetness[pixelIndex] = Math.min(1.0, this.wetness[pixelIndex] + wetTransfer);
      
      // Cool entity pixel if wet
      if (wetTransfer > 0) {
        this.temp[pixelIndex] = Math.max(20, this.temp[pixelIndex] - 20 * wetTransfer);
      }
    }
    
    // Ignition from CA fire
    if (caCell.burning && caCell.temp > 200 && !this.burning[pixelIndex]) {
      const ignitionChance = Math.min(0.1, (caCell.temp - 200) / 1000) * deltaTime;
      if (Math.random() < ignitionChance) {
        this.burning[pixelIndex] = 1;
      }
    }
  }
  
  /**
   * Update combustion for a single pixel
   * @param {number} index
   * @param {number} deltaTime
   */
  updatePixelCombustion(index, deltaTime) {
    const materialId = this.materialId[index];
    const material = getMaterial(materialId);
    
    // Skip non-combustible materials
    if (material.fuel <= 0) return;
    
    const temp = this.temp[index];
    const fuel = this.fuel[index];
    const wetness = this.wetness[index];
    const burning = this.burning[index];
    
    // Check ignition
    if (!burning && canIgnite(materialId, temp) && wetness < 0.5) {
      this.burning[index] = 1;
    }
    
    // Active burning
    if (burning && fuel > 0) {
      const burnRate = material.burnRate * deltaTime;
      const wetnessFactor = Math.max(0.1, 1 - wetness);
      const actualBurnRate = burnRate * wetnessFactor;
      
      if (actualBurnRate > 0) {
        const fuelConsumed = Math.min(fuel, actualBurnRate);
        const products = getCombustionProducts(materialId, fuelConsumed);
        
        // Update pixel
        this.fuel[index] = Math.max(0, fuel - fuelConsumed);
        this.temp[index] = Math.min(800, temp + products.heatReleased * 0.05);
        
        // Spread to neighboring pixels
        this.spreadToNeighborPixels(index, deltaTime);
        
        // Convert to char when fuel exhausted
        if (this.fuel[index] <= 0) {
          this.materialId[index] = products.newMaterialId;
          this.burning[index] = 0;
        }
      }
    }
    
    // Extinguish if too wet
    if (burning && wetness > 0.8) {
      this.burning[index] = 0;
      this.temp[index] = Math.max(37, temp - 100 * deltaTime);
    }
    
    // Natural cooling
    if (temp > 37) {
      const coolingRate = (temp - 37) * 0.5 * deltaTime;
      this.temp[index] = Math.max(37, temp - coolingRate);
    }
    
    // Wetness evaporation
    if (wetness > 0) {
      const evapRate = 0.2 * deltaTime;
      if (temp > 60) {
        this.wetness[index] = Math.max(0, wetness - evapRate * (temp / 100));
      } else {
        this.wetness[index] = Math.max(0, wetness - evapRate * 0.1);
      }
    }
  }
  
  /**
   * Spread fire to neighboring pixels within entity
   * @param {number} sourceIndex
   * @param {number} deltaTime
   */
  spreadToNeighborPixels(sourceIndex, deltaTime) {
    const sourceX = sourceIndex % 16;
    const sourceY = Math.floor(sourceIndex / 16);
    const sourceTemp = this.temp[sourceIndex];
    
    const spreadChance = Math.min(0.05, sourceTemp / 10000) * deltaTime;
    
    // Check 4-connected neighbors
    const neighbors = [
      { x: sourceX - 1, y: sourceY },
      { x: sourceX + 1, y: sourceY },
      { x: sourceX, y: sourceY - 1 },
      { x: sourceX, y: sourceY + 1 }
    ];
    
    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.x >= 16 || neighbor.y < 0 || neighbor.y >= 16) continue;
      
      const neighborIndex = this.getPixelIndex(neighbor.x, neighbor.y);
      if (this.burning[neighborIndex] || Math.random() > spreadChance) continue;
      
      const neighborMaterial = getMaterial(this.materialId[neighborIndex]);
      
      if (canIgnite(this.materialId[neighborIndex], this.temp[neighborIndex] + 50) && 
          neighborMaterial.fuel > 0 && 
          this.wetness[neighborIndex] < 0.5) {
        
        // Heat up neighbor
        const heatTransfer = (sourceTemp - this.temp[neighborIndex]) * 0.1 * deltaTime;
        this.temp[neighborIndex] = Math.min(800, this.temp[neighborIndex] + heatTransfer);
      }
    }
  }
  
  /**
   * Update entity properties based on pixel state
   * @param {number} deltaTime
   */
  updateEntityFromPixels(deltaTime) {
    if (!this.entityRef) return;
    
    // Calculate damage from burning pixels
    const burningRatio = this.burningPixels / this.totalPixels;
    const integrityRatio = this.integrityLoss / this.totalPixels;
    
    // Apply damage based on burning intensity
    if (burningRatio > 0) {
      const damagePerSecond = burningRatio * 10; // 10 HP per second at full burn
      const damage = damagePerSecond * deltaTime;
      
      if (typeof this.entityRef.hp === 'number') {
        this.entityRef.hp = Math.max(0, this.entityRef.hp - damage);
        
        if (this.entityRef.hp <= 0) {
          this.entityRef.alive = false;
          this.entityRef.state = 'dying';
        }
      }
    }
    
    // Update burning status
    if (burningRatio > 0.1) {
      if (!this.entityRef.burning) {
        this.entityRef.burning = {
          duration: 10, // Long duration for pixel-based burning
          maxDuration: 10,
          lastPanicChange: performance.now(),
          originalState: this.entityRef.state
        };
        if (!['wounded', 'dying', 'dead'].includes(this.entityRef.state)) {
          this.entityRef.state = 'burning';
        }
      }
    } else if (this.entityRef.burning && burningRatio === 0) {
      // Extinguished
      const prior = this.entityRef.burning.originalState ?? 'idle';
      delete this.entityRef.burning;
      if (this.entityRef.state === 'burning') {
        this.entityRef.state = prior;
      }
    }
  }
  
  /**
   * Force ignite pixels in an area
   * @param {object} localAABB - {x, y, w, h} in local entity coordinates
   */
  forceIgnite(localAABB) {
    const startX = Math.max(0, Math.floor(localAABB.x));
    const endX = Math.min(16, Math.ceil(localAABB.x + localAABB.w));
    const startY = Math.max(0, Math.floor(localAABB.y));
    const endY = Math.min(16, Math.ceil(localAABB.y + localAABB.h));
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = this.getPixelIndex(x, y);
        if (this.fuel[index] > 0) {
          this.temp[index] = Math.max(this.temp[index], 400);
          this.burning[index] = 1;
        }
      }
    }
  }
  
  /**
   * Add water to pixels in an area
   * @param {object} localAABB - {x, y, w, h} in local entity coordinates
   * @param {number} amount - Wetness amount (0-1)
   */
  addWater(localAABB, amount = 1.0) {
    const startX = Math.max(0, Math.floor(localAABB.x));
    const endX = Math.min(16, Math.ceil(localAABB.x + localAABB.w));
    const startY = Math.max(0, Math.floor(localAABB.y));
    const endY = Math.min(16, Math.ceil(localAABB.y + localAABB.h));
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = this.getPixelIndex(x, y);
        this.wetness[index] = Math.min(1.0, this.wetness[index] + amount);
        this.temp[index] = Math.max(20, this.temp[index] - 50 * amount);
      }
    }
  }
  
  /**
   * Sample damage amount for an AABB
   * @param {object} localAABB - {x, y, w, h} in local entity coordinates
   * @returns {number} Damage ratio (0-1)
   */
  sampleDamage(localAABB) {
    const startX = Math.max(0, Math.floor(localAABB.x));
    const endX = Math.min(16, Math.ceil(localAABB.x + localAABB.w));
    const startY = Math.max(0, Math.floor(localAABB.y));
    const endY = Math.min(16, Math.ceil(localAABB.y + localAABB.h));
    
    let totalDamage = 0;
    let pixelCount = 0;
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = this.getPixelIndex(x, y);
        pixelCount++;
        
        if (this.burning[index]) {
          totalDamage += Math.min(1.0, this.temp[index] / 500);
        }
      }
    }
    
    return pixelCount > 0 ? totalDamage / pixelCount : 0;
  }
  
  /**
   * Get pixel layer statistics
   * @returns {object}
   */
  getStats() {
    return {
      burningPixels: this.burningPixels,
      totalPixels: this.totalPixels,
      integrityLoss: this.integrityLoss,
      burningRatio: this.burningPixels / this.totalPixels,
      integrityRatio: this.integrityLoss / this.totalPixels
    };
  }
}

/**
 * Entity pixel manager
 */
export class EntityPixelManager {
  constructor(caGrid) {
    this.caGrid = caGrid;
    this.entityLayers = new Map(); // entityRef -> EntityPixelLayer
  }
  
  /**
   * Attach pixel layer to an entity
   * @param {object} entityRef - Reference to game entity
   * @param {object} aabb - {x, y, w, h} world coordinates
   */
  attachEntity(entityRef, aabb) {
    if (this.entityLayers.has(entityRef)) {
      this.detachEntity(entityRef);
    }
    
    const layer = new EntityPixelLayer(entityRef, aabb);
    this.entityLayers.set(entityRef, layer);
    return layer;
  }
  
  /**
   * Detach pixel layer from entity
   * @param {object} entityRef
   */
  detachEntity(entityRef) {
    const layer = this.entityLayers.get(entityRef);
    if (layer) {
      layer.active = false;
      this.entityLayers.delete(entityRef);
    }
  }
  
  /**
   * Update all entity pixel layers
   * @param {number} deltaTime
   */
  update(deltaTime) {
    for (const layer of this.entityLayers.values()) {
      if (layer.active) {
        layer.update(this.caGrid, deltaTime);
      }
    }
  }
  
  /**
   * Sample damage for an AABB in world coordinates
   * @param {object} aabb - {x, y, w, h} world coordinates
   * @returns {number} Damage ratio (0-1)
   */
  sampleDamageForAABB(aabb) {
    let totalDamage = 0;
    let layerCount = 0;
    
    for (const layer of this.entityLayers.values()) {
      if (!layer.active) continue;
      
      // Check if AABBs overlap
      if (this.aabbOverlap(aabb, layer.aabb)) {
        // Convert to local coordinates
        const localAABB = {
          x: aabb.x - layer.aabb.x,
          y: aabb.y - layer.aabb.y,
          w: aabb.w,
          h: aabb.h
        };
        
        totalDamage += layer.sampleDamage(localAABB);
        layerCount++;
      }
    }
    
    return layerCount > 0 ? totalDamage / layerCount : 0;
  }
  
  /**
   * Force ignite AABB area for all overlapping entities
   * @param {object} aabb - {x, y, w, h} world coordinates
   */
  forceIgniteAABB(aabb) {
    for (const layer of this.entityLayers.values()) {
      if (!layer.active) continue;
      
      if (this.aabbOverlap(aabb, layer.aabb)) {
        const localAABB = {
          x: aabb.x - layer.aabb.x,
          y: aabb.y - layer.aabb.y,
          w: aabb.w,
          h: aabb.h
        };
        
        layer.forceIgnite(localAABB);
      }
    }
  }
  
  /**
   * Add water to AABB area for all overlapping entities
   * @param {object} aabb - {x, y, w, h} world coordinates
   * @param {number} amount - Wetness amount
   */
  addWaterToAABB(aabb, amount = 1.0) {
    for (const layer of this.entityLayers.values()) {
      if (!layer.active) continue;
      
      if (this.aabbOverlap(aabb, layer.aabb)) {
        const localAABB = {
          x: aabb.x - layer.aabb.x,
          y: aabb.y - layer.aabb.y,
          w: aabb.w,
          h: aabb.h
        };
        
        layer.addWater(localAABB, amount);
      }
    }
  }
  
  /**
   * Check if two AABBs overlap
   * @param {object} a
   * @param {object} b
   * @returns {boolean}
   */
  aabbOverlap(a, b) {
    return a.x < b.x + b.w && 
           a.x + a.w > b.x && 
           a.y < b.y + b.h && 
           a.y + a.h > b.y;
  }
  
  /**
   * Get entity layer if exists
   * @param {object} entityRef
   * @returns {EntityPixelLayer|null}
   */
  getEntityLayer(entityRef) {
    return this.entityLayers.get(entityRef) || null;
  }
  
  /**
   * Get all entity layers
   * @returns {Array<EntityPixelLayer>}
   */
  getAllLayers() {
    return Array.from(this.entityLayers.values());
  }
  
  /**
   * Clear all entity layers
   */
  clear() {
    for (const layer of this.entityLayers.values()) {
      layer.active = false;
    }
    this.entityLayers.clear();
  }
}