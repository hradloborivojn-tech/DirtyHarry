/**
 * Chunked grid system for efficient cellular automata simulation.
 * 
 * Divides the world into fixed-size chunks to enable:
 * - Selective updating of only active regions
 * - Memory optimization through chunk activation/deactivation
 * - Performance scaling for large worlds
 */

import { VW, VH, WORLD_W } from '../core/constants.js';
import { MATERIAL_IDS, TEMP_CONSTANTS } from './materials.js';

/**
 * Configuration for chunk system
 */
export const CHUNK_CONFIG = {
  CHUNK_SIZE: 32,          // cells per chunk side
  CELL_SIZE: 1,            // pixels per cell (1:1 mapping)
  DEACTIVATION_DELAY: 5.0, // seconds before inactive chunk is deactivated
  MAX_UPDATES_PER_FRAME: 50000,  // performance budget
};

/**
 * Calculate grid dimensions based on world size
 */
export const GRID_CONFIG = {
  GRID_WIDTH: WORLD_W,     // Total grid width in cells
  GRID_HEIGHT: VH + 20,    // Grid height (screen + some extra for above-ground)
  CHUNKS_X: Math.ceil(WORLD_W / CHUNK_CONFIG.CHUNK_SIZE),
  CHUNKS_Y: Math.ceil((VH + 20) / CHUNK_CONFIG.CHUNK_SIZE),
};

/**
 * Represents a single chunk of the simulation grid
 */
export class Chunk {
  /**
   * @param {number} chunkX - Chunk X coordinate
   * @param {number} chunkY - Chunk Y coordinate
   */
  constructor(chunkX, chunkY) {
    this.chunkX = chunkX;
    this.chunkY = chunkY;
    this.active = false;
    this.lastActiveTime = 0;
    
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    const cellCount = size * size;
    
    // Cell data arrays (Structure of Arrays for cache efficiency)
    this.materialId = new Uint8Array(cellCount);
    this.temperature = new Float32Array(cellCount);
    this.fuel = new Float32Array(cellCount);
    this.wetness = new Float32Array(cellCount);
    this.oxygen = new Float32Array(cellCount);
    this.density = new Float32Array(cellCount);
    this.lastUpdatedTick = new Uint32Array(cellCount);
    
    // Initialize with default values
    this.initializeChunk();
  }
  
  /**
   * Initialize chunk with default air and ambient temperature
   */
  initializeChunk() {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    
    for (let i = 0; i < size * size; i++) {
      this.materialId[i] = MATERIAL_IDS.AIR;
      this.temperature[i] = TEMP_CONSTANTS.AMBIENT;
      this.fuel[i] = 0;
      this.wetness[i] = 0;
      this.oxygen[i] = 1.0;  // Full oxygen initially
      this.density[i] = 0.001;  // Air density
      this.lastUpdatedTick[i] = 0;
    }
  }
  
  /**
   * Get linear index for chunk-local coordinates
   * @param {number} localX - X coordinate within chunk (0 to CHUNK_SIZE-1)
   * @param {number} localY - Y coordinate within chunk (0 to CHUNK_SIZE-1)
   * @returns {number} Linear array index
   */
  getIndex(localX, localY) {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    return localY * size + localX;
  }
  
  /**
   * Get cell data at local coordinates
   * @param {number} localX 
   * @param {number} localY 
   * @returns {Object} Cell data
   */
  getCell(localX, localY) {
    const idx = this.getIndex(localX, localY);
    return {
      materialId: this.materialId[idx],
      temperature: this.temperature[idx],
      fuel: this.fuel[idx],
      wetness: this.wetness[idx],
      oxygen: this.oxygen[idx],
      density: this.density[idx],
      lastUpdatedTick: this.lastUpdatedTick[idx]
    };
  }
  
  /**
   * Set cell data at local coordinates
   * @param {number} localX 
   * @param {number} localY 
   * @param {Object} cellData 
   */
  setCell(localX, localY, cellData) {
    const idx = this.getIndex(localX, localY);
    
    if (cellData.materialId !== undefined) this.materialId[idx] = cellData.materialId;
    if (cellData.temperature !== undefined) this.temperature[idx] = cellData.temperature;
    if (cellData.fuel !== undefined) this.fuel[idx] = cellData.fuel;
    if (cellData.wetness !== undefined) this.wetness[idx] = cellData.wetness;
    if (cellData.oxygen !== undefined) this.oxygen[idx] = cellData.oxygen;
    if (cellData.density !== undefined) this.density[idx] = cellData.density;
    if (cellData.lastUpdatedTick !== undefined) this.lastUpdatedTick[idx] = cellData.lastUpdatedTick;
  }
  
  /**
   * Check if chunk should be considered active based on its state
   * @returns {boolean}
   */
  hasActivity() {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    
    // Check for high temperatures
    for (let i = 0; i < size * size; i++) {
      if (this.temperature[i] > TEMP_CONSTANTS.AMBIENT + 10) return true;
      if (this.fuel[i] > 0 && this.oxygen[i] > 0) return true;
      if (this.wetness[i] > 0.1) return true;
      // Check for fluids (non-air materials that can move)
      if (this.materialId[i] !== MATERIAL_IDS.AIR && this.density[i] > 0.1) return true;
    }
    
    return false;
  }
  
  /**
   * Mark chunk as active and update timestamp
   * @param {number} currentTime 
   */
  activate(currentTime) {
    this.active = true;
    this.lastActiveTime = currentTime;
  }
  
  /**
   * Deactivate chunk if it's been inactive long enough
   * @param {number} currentTime 
   * @returns {boolean} True if chunk was deactivated
   */
  tryDeactivate(currentTime) {
    if (!this.active) return false;
    
    if (!this.hasActivity() && 
        (currentTime - this.lastActiveTime) > CHUNK_CONFIG.DEACTIVATION_DELAY) {
      this.active = false;
      return true;
    }
    
    return false;
  }
}

/**
 * Main grid manager that handles chunks and provides world-space access
 */
export class ChunkGrid {
  constructor() {
    this.chunks = new Map();
    this.activeChunks = new Set();
    this.currentTick = 0;
    this.totalCellsUpdated = 0;
    
    // Initialize ground chunks with some basic materials
    this.initializeWorld();
  }
  
  /**
   * Initialize the world with basic ground/air layout
   */
  initializeWorld() {
    // We'll populate some basic ground material for now
    // In a full implementation, this could load from a level file
    
    const groundY = VH - 22; // Same as GROUND_Y from constants
    
    // Create chunks that intersect with the ground level
    for (let chunkX = 0; chunkX < GRID_CONFIG.CHUNKS_X; chunkX++) {
      for (let chunkY = 0; chunkY < GRID_CONFIG.CHUNKS_Y; chunkY++) {
        const worldY = chunkY * CHUNK_CONFIG.CHUNK_SIZE;
        
        // Only create chunks that might have interesting content
        if (worldY < groundY + CHUNK_CONFIG.CHUNK_SIZE) {
          this.getOrCreateChunk(chunkX, chunkY);
        }
      }
    }
  }
  
  /**
   * Convert world coordinates to chunk coordinates
   * @param {number} worldX 
   * @param {number} worldY 
   * @returns {{chunkX: number, chunkY: number, localX: number, localY: number}}
   */
  worldToChunk(worldX, worldY) {
    const chunkX = Math.floor(worldX / CHUNK_CONFIG.CHUNK_SIZE);
    const chunkY = Math.floor(worldY / CHUNK_CONFIG.CHUNK_SIZE);
    const localX = worldX - (chunkX * CHUNK_CONFIG.CHUNK_SIZE);
    const localY = worldY - (chunkY * CHUNK_CONFIG.CHUNK_SIZE);
    
    return { chunkX, chunkY, localX, localY };
  }
  
  /**
   * Get chunk key for Map storage
   * @param {number} chunkX 
   * @param {number} chunkY 
   * @returns {string}
   */
  getChunkKey(chunkX, chunkY) {
    return `${chunkX},${chunkY}`;
  }
  
  /**
   * Get or create a chunk at the given chunk coordinates
   * @param {number} chunkX 
   * @param {number} chunkY 
   * @returns {Chunk|null}
   */
  getOrCreateChunk(chunkX, chunkY) {
    // Bounds check
    if (chunkX < 0 || chunkX >= GRID_CONFIG.CHUNKS_X || 
        chunkY < 0 || chunkY >= GRID_CONFIG.CHUNKS_Y) {
      return null;
    }
    
    const key = this.getChunkKey(chunkX, chunkY);
    
    if (!this.chunks.has(key)) {
      const chunk = new Chunk(chunkX, chunkY);
      this.chunks.set(key, chunk);
    }
    
    return this.chunks.get(key);
  }
  
  /**
   * Get chunk at chunk coordinates (without creating)
   * @param {number} chunkX 
   * @param {number} chunkY 
   * @returns {Chunk|null}
   */
  getChunk(chunkX, chunkY) {
    const key = this.getChunkKey(chunkX, chunkY);
    return this.chunks.get(key) || null;
  }
  
  /**
   * Get cell data at world coordinates
   * @param {number} worldX 
   * @param {number} worldY 
   * @returns {Object|null} Cell data or null if out of bounds
   */
  getCell(worldX, worldY) {
    // Bounds check
    if (worldX < 0 || worldX >= GRID_CONFIG.GRID_WIDTH ||
        worldY < 0 || worldY >= GRID_CONFIG.GRID_HEIGHT) {
      return null;
    }
    
    const { chunkX, chunkY, localX, localY } = this.worldToChunk(worldX, worldY);
    const chunk = this.getChunk(chunkX, chunkY);
    
    if (!chunk) return null;
    
    return chunk.getCell(localX, localY);
  }
  
  /**
   * Set cell data at world coordinates
   * @param {number} worldX 
   * @param {number} worldY 
   * @param {Object} cellData 
   * @param {number} currentTime 
   */
  setCell(worldX, worldY, cellData, currentTime = performance.now() / 1000) {
    // Bounds check
    if (worldX < 0 || worldX >= GRID_CONFIG.GRID_WIDTH ||
        worldY < 0 || worldY >= GRID_CONFIG.GRID_HEIGHT) {
      return;
    }
    
    const { chunkX, chunkY, localX, localY } = this.worldToChunk(worldX, worldY);
    const chunk = this.getOrCreateChunk(chunkX, chunkY);
    
    if (!chunk) return;
    
    chunk.setCell(localX, localY, cellData);
    
    // Activate chunk if it has activity
    if (chunk.hasActivity()) {
      chunk.activate(currentTime);
      this.activeChunks.add(this.getChunkKey(chunkX, chunkY));
    }
  }
  
  /**
   * Update active chunks management
   * @param {number} currentTime 
   */
  updateActiveChunks(currentTime) {
    // Check all chunks for deactivation
    for (const [key, chunk] of this.chunks) {
      if (chunk.tryDeactivate(currentTime)) {
        this.activeChunks.delete(key);
      } else if (chunk.active && chunk.hasActivity()) {
        this.activeChunks.add(key);
        chunk.lastActiveTime = currentTime;
      }
    }
  }
  
  /**
   * Get list of active chunks for processing
   * @returns {Chunk[]}
   */
  getActiveChunks() {
    const result = [];
    for (const key of this.activeChunks) {
      const chunk = this.chunks.get(key);
      if (chunk && chunk.active) {
        result.push(chunk);
      }
    }
    return result;
  }
  
  /**
   * Activate a circular area (useful for molotov impacts, explosions, etc.)
   * @param {number} centerX 
   * @param {number} centerY 
   * @param {number} radius 
   * @param {number} currentTime 
   */
  activateArea(centerX, centerY, radius, currentTime) {
    const minX = Math.max(0, centerX - radius);
    const maxX = Math.min(GRID_CONFIG.GRID_WIDTH - 1, centerX + radius);
    const minY = Math.max(0, centerY - radius);
    const maxY = Math.min(GRID_CONFIG.GRID_HEIGHT - 1, centerY + radius);
    
    const affectedChunks = new Set();
    
    // Find all chunks that intersect with the area
    for (let x = minX; x <= maxX; x += CHUNK_CONFIG.CHUNK_SIZE) {
      for (let y = minY; y <= maxY; y += CHUNK_CONFIG.CHUNK_SIZE) {
        const { chunkX, chunkY } = this.worldToChunk(x, y);
        affectedChunks.add(this.getChunkKey(chunkX, chunkY));
      }
    }
    
    // Activate affected chunks
    for (const key of affectedChunks) {
      const chunk = this.getOrCreateChunk(...key.split(',').map(Number));
      if (chunk) {
        chunk.activate(currentTime);
        this.activeChunks.add(key);
      }
    }
  }
  
  /**
   * Get neighbor cell coordinates (4-connected)
   * @param {number} worldX 
   * @param {number} worldY 
   * @returns {{x:number, y:number}[]}
   */
  getNeighbors4(worldX, worldY) {
    return [
      { x: worldX - 1, y: worldY },     // left
      { x: worldX + 1, y: worldY },     // right
      { x: worldX, y: worldY - 1 },     // up
      { x: worldX, y: worldY + 1 }      // down
    ].filter(pos => 
      pos.x >= 0 && pos.x < GRID_CONFIG.GRID_WIDTH &&
      pos.y >= 0 && pos.y < GRID_CONFIG.GRID_HEIGHT
    );
  }
  
  /**
   * Get neighbor cell coordinates (8-connected)
   * @param {number} worldX 
   * @param {number} worldY 
   * @returns {{x:number, y:number}[]}
   */
  getNeighbors8(worldX, worldY) {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        
        const x = worldX + dx;
        const y = worldY + dy;
        
        if (x >= 0 && x < GRID_CONFIG.GRID_WIDTH &&
            y >= 0 && y < GRID_CONFIG.GRID_HEIGHT) {
          neighbors.push({ x, y });
        }
      }
    }
    return neighbors;
  }
  
  /**
   * Get debug information about the grid state
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      totalChunks: this.chunks.size,
      activeChunks: this.activeChunks.size,
      currentTick: this.currentTick,
      totalCellsUpdated: this.totalCellsUpdated,
      gridSize: `${GRID_CONFIG.GRID_WIDTH}x${GRID_CONFIG.GRID_HEIGHT}`,
      chunkSize: CHUNK_CONFIG.CHUNK_SIZE,
      maxUpdatesPerFrame: CHUNK_CONFIG.MAX_UPDATES_PER_FRAME
    };
  }
}