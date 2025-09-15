/**
 * Chunked grid system for cellular automata fire simulation.
 * 
 * Uses a 32x32 cell chunk structure with Structure-of-Arrays (SoA) layout
 * for cache efficiency. Manages active chunks and provides double buffering
 * for diffusion operations.
 */

import { MATERIAL_IDS, getMaterial } from './materials.js';

// Grid configuration - matches game world dimensions
export const GRID_WIDTH = 960;  // WORLD_W from constants
export const GRID_HEIGHT = 108; // VH from constants
export const CHUNK_SIZE = 32;
export const CHUNKS_X = Math.ceil(GRID_WIDTH / CHUNK_SIZE);
export const CHUNKS_Y = Math.ceil(GRID_HEIGHT / CHUNK_SIZE);

// Per-frame update budget
export const UPDATE_BUDGET = 100000;

/**
 * Single chunk containing SoA arrays for all cell properties
 */
class Chunk {
  constructor(chunkX, chunkY) {
    this.chunkX = chunkX;
    this.chunkY = chunkY;
    this.active = false;
    this.lastActiveTime = 0;
    
    const size = CHUNK_SIZE * CHUNK_SIZE;
    
    // Structure of Arrays for cache efficiency
    this.materialId = new Uint8Array(size);
    this.temp = new Float32Array(size);
    this.fuel = new Float32Array(size);
    this.wetness = new Float32Array(size);
    this.oxygen = new Float32Array(size);
    this.burning = new Uint8Array(size);
    
    // Double buffer for diffusion operations
    this.tempBuffer = new Float32Array(size);
    this.oxygenBuffer = new Float32Array(size);
    
    // Initialize with air at room temperature
    this.materialId.fill(MATERIAL_IDS.AIR);
    this.temp.fill(20); // Room temperature in Celsius
    this.fuel.fill(0);
    this.wetness.fill(0);
    this.oxygen.fill(21); // Normal atmospheric oxygen percentage
    this.burning.fill(0);
  }
  
  /**
   * Get cell index from local chunk coordinates
   * @param {number} localX - 0 to CHUNK_SIZE-1
   * @param {number} localY - 0 to CHUNK_SIZE-1
   * @returns {number} Cell index
   */
  getIndex(localX, localY) {
    return localY * CHUNK_SIZE + localX;
  }
  
  /**
   * Check if chunk has any active cells (burning, hot, or wet)
   * @returns {boolean}
   */
  hasActivity() {
    for (let i = 0; i < this.materialId.length; i++) {
      if (this.burning[i] > 0 || this.temp[i] > 50 || this.wetness[i] > 0.1) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Swap temperature buffers for diffusion
   */
  swapTempBuffers() {
    [this.temp, this.tempBuffer] = [this.tempBuffer, this.temp];
  }
  
  /**
   * Swap oxygen buffers for diffusion
   */
  swapOxygenBuffers() {
    [this.oxygen, this.oxygenBuffer] = [this.oxygenBuffer, this.oxygen];
  }
}

/**
 * Main chunked grid system
 */
export class ChunkGrid {
  constructor() {
    this.chunks = new Map();
    this.activeChunks = new Set();
    this.updateQueue = [];
    this.currentTime = 0;
    
    // Statistics
    this.stats = {
      activeCells: 0,
      activeChunks: 0,
      lastUpdateTime: 0
    };
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
   * @returns {Chunk}
   */
  getChunk(chunkX, chunkY) {
    const key = this.getChunkKey(chunkX, chunkY);
    let chunk = this.chunks.get(key);
    
    if (!chunk) {
      chunk = new Chunk(chunkX, chunkY);
      this.chunks.set(key, chunk);
    }
    
    return chunk;
  }
  
  /**
   * Convert world coordinates to chunk coordinates
   * @param {number} worldX
   * @param {number} worldY
   * @returns {object} {chunkX, chunkY, localX, localY}
   */
  worldToChunk(worldX, worldY) {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkY = Math.floor(worldY / CHUNK_SIZE);
    const localX = worldX - chunkX * CHUNK_SIZE;
    const localY = worldY - chunkY * CHUNK_SIZE;
    
    return { chunkX, chunkY, localX, localY };
  }
  
  /**
   * Check if world coordinates are within grid bounds
   * @param {number} worldX
   * @param {number} worldY
   * @returns {boolean}
   */
  isValidCoord(worldX, worldY) {
    return worldX >= 0 && worldX < GRID_WIDTH && worldY >= 0 && worldY < GRID_HEIGHT;
  }
  
  /**
   * Get cell properties at world coordinates
   * @param {number} worldX
   * @param {number} worldY
   * @returns {object} Cell properties or null if out of bounds
   */
  getCell(worldX, worldY) {
    if (!this.isValidCoord(worldX, worldY)) return null;
    
    const { chunkX, chunkY, localX, localY } = this.worldToChunk(worldX, worldY);
    const chunk = this.getChunk(chunkX, chunkY);
    const index = chunk.getIndex(localX, localY);
    
    return {
      materialId: chunk.materialId[index],
      temp: chunk.temp[index],
      fuel: chunk.fuel[index],
      wetness: chunk.wetness[index],
      oxygen: chunk.oxygen[index],
      burning: chunk.burning[index]
    };
  }
  
  /**
   * Set cell properties at world coordinates
   * @param {number} worldX
   * @param {number} worldY
   * @param {object} properties - Properties to set
   */
  setCell(worldX, worldY, properties) {
    if (!this.isValidCoord(worldX, worldY)) return;
    
    const { chunkX, chunkY, localX, localY } = this.worldToChunk(worldX, worldY);
    const chunk = this.getChunk(chunkX, chunkY);
    const index = chunk.getIndex(localX, localY);
    
    if (properties.materialId !== undefined) chunk.materialId[index] = properties.materialId;
    if (properties.temp !== undefined) chunk.temp[index] = properties.temp;
    if (properties.fuel !== undefined) chunk.fuel[index] = properties.fuel;
    if (properties.wetness !== undefined) chunk.wetness[index] = properties.wetness;
    if (properties.oxygen !== undefined) chunk.oxygen[index] = properties.oxygen;
    if (properties.burning !== undefined) chunk.burning[index] = properties.burning;
    
    // Mark chunk as active if it has significant activity
    this.markChunkActive(chunkX, chunkY);
  }
  
  /**
   * Mark a chunk as active
   * @param {number} chunkX
   * @param {number} chunkY
   */
  markChunkActive(chunkX, chunkY) {
    const key = this.getChunkKey(chunkX, chunkY);
    const chunk = this.getChunk(chunkX, chunkY);
    
    if (!chunk.active) {
      chunk.active = true;
      chunk.lastActiveTime = this.currentTime;
      this.activeChunks.add(key);
    }
  }
  
  /**
   * Update active chunk management
   * @param {number} deltaTime
   */
  updateActiveChunks(deltaTime) {
    this.currentTime += deltaTime;
    
    for (const key of this.activeChunks) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      
      // Check if chunk still has activity
      if (!chunk.hasActivity()) {
        // Grace period before deactivating
        if (this.currentTime - chunk.lastActiveTime > 2.0) {
          chunk.active = false;
          this.activeChunks.delete(key);
        }
      } else {
        chunk.lastActiveTime = this.currentTime;
      }
    }
    
    this.stats.activeChunks = this.activeChunks.size;
  }
  
  /**
   * Get neighboring cell coordinates
   * @param {number} worldX
   * @param {number} worldY
   * @returns {Array} Array of {x, y} neighbor coordinates
   */
  getNeighbors(worldX, worldY) {
    const neighbors = [];
    const offsets = [
      { x: -1, y: 0 }, { x: 1, y: 0 },  // Left, Right
      { x: 0, y: -1 }, { x: 0, y: 1 },  // Up, Down
      { x: -1, y: -1 }, { x: 1, y: -1 }, // Diagonals
      { x: -1, y: 1 }, { x: 1, y: 1 }
    ];
    
    for (const offset of offsets) {
      const nx = worldX + offset.x;
      const ny = worldY + offset.y;
      if (this.isValidCoord(nx, ny)) {
        neighbors.push({ x: nx, y: ny });
      }
    }
    
    return neighbors;
  }
  
  /**
   * Prepare chunks for diffusion by copying to buffers
   */
  prepareDiffusionBuffers() {
    for (const key of this.activeChunks) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      
      chunk.tempBuffer.set(chunk.temp);
      chunk.oxygenBuffer.set(chunk.oxygen);
    }
  }
  
  /**
   * Get all cells in active chunks for processing
   * @returns {Array} Array of {worldX, worldY, chunk, index} for active cells
   */
  getActiveCells() {
    const activeCells = [];
    
    for (const key of this.activeChunks) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      
      const baseX = chunk.chunkX * CHUNK_SIZE;
      const baseY = chunk.chunkY * CHUNK_SIZE;
      
      for (let localY = 0; localY < CHUNK_SIZE; localY++) {
        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
          const worldX = baseX + localX;
          const worldY = baseY + localY;
          
          if (!this.isValidCoord(worldX, worldY)) continue;
          
          const index = chunk.getIndex(localX, localY);
          
          // Only include cells with activity
          if (chunk.burning[index] > 0 || chunk.temp[index] > 25 || 
              chunk.wetness[index] > 0.01 || chunk.fuel[index] > 0) {
            activeCells.push({
              worldX,
              worldY,
              chunk,
              index
            });
          }
        }
      }
    }
    
    this.stats.activeCells = activeCells.length;
    return activeCells;
  }
  
  /**
   * Reset all cells to initial state
   */
  clear() {
    for (const chunk of this.chunks.values()) {
      chunk.materialId.fill(MATERIAL_IDS.AIR);
      chunk.temp.fill(20);
      chunk.fuel.fill(0);
      chunk.wetness.fill(0);
      chunk.oxygen.fill(21);
      chunk.burning.fill(0);
      chunk.active = false;
    }
    
    this.activeChunks.clear();
    this.updateQueue.length = 0;
  }
  
  /**
   * Get statistics about the grid state
   * @returns {object} Statistics
   */
  getStats() {
    return { ...this.stats };
  }
}