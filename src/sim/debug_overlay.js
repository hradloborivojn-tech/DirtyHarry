/**
 * Debug overlay system for cellular automata visualization.
 * 
 * Provides multiple visualization modes:
 * - Temperature heatmap
 * - Material type view
 * - Burning cell mask
 * - Oxygen levels
 * - Density/flow visualization
 */

import { getMaterial, MATERIAL_IDS } from './materials.js';
import { VW, VH } from '../core/constants.js';
import { GRID_CONFIG } from './chunk_grid.js';

/**
 * Debug overlay modes
 */
export const DEBUG_MODES = {
  NONE: 'none',
  TEMPERATURE: 'temperature',
  MATERIALS: 'materials',
  BURNING: 'burning',
  OXYGEN: 'oxygen',
  DENSITY: 'density',
  FUEL: 'fuel'
};

/**
 * Debug overlay configuration
 */
export const DEBUG_CONFIG = {
  CELL_SIZE: 2,           // Pixels per cell for overlay
  OPACITY: 0.7,           // Overlay opacity
  GRID_LINES: false,      // Show grid lines
  INFO_PANEL: true,       // Show info panel
  MOUSE_QUERY: true       // Show cell info under mouse
};

/**
 * Color palettes for different visualization modes
 */
const COLOR_PALETTES = {
  temperature: [
    { temp: 0, color: [0, 0, 255] },      // Blue (cold)
    { temp: 50, color: [0, 255, 255] },   // Cyan
    { temp: 100, color: [0, 255, 0] },    // Green
    { temp: 200, color: [255, 255, 0] },  // Yellow
    { temp: 400, color: [255, 128, 0] },  // Orange
    { temp: 800, color: [255, 0, 0] },    // Red
    { temp: 1200, color: [255, 255, 255] } // White (very hot)
  ],
  
  oxygen: [
    { level: 0, color: [64, 0, 0] },      // Dark red (no oxygen)
    { level: 0.1, color: [128, 0, 0] },   // Red
    { level: 0.21, color: [0, 255, 0] },  // Green (normal air)
    { level: 1.0, color: [0, 255, 255] }  // Cyan (high oxygen)
  ],
  
  density: [
    { level: 0, color: [0, 0, 0] },       // Black (vacuum)
    { level: 0.001, color: [64, 64, 255] }, // Light blue (air)
    { level: 0.1, color: [255, 255, 0] }, // Yellow (light materials)
    { level: 1.0, color: [0, 255, 0] },   // Green (water)
    { level: 5.0, color: [255, 0, 0] }    // Red (heavy materials)
  ]
};

/**
 * Material colors for material view
 */
const MATERIAL_COLORS = {
  [MATERIAL_IDS.AIR]: [135, 206, 235],        // Sky blue
  [MATERIAL_IDS.WATER]: [70, 130, 180],       // Steel blue
  [MATERIAL_IDS.OIL]: [139, 69, 19],          // Saddle brown
  [MATERIAL_IDS.WOOD]: [160, 82, 45],         // Sienna
  [MATERIAL_IDS.STONE]: [105, 105, 105],      // Dim gray
  [MATERIAL_IDS.METAL]: [192, 192, 192],      // Silver
  [MATERIAL_IDS.STEAM]: [240, 248, 255],      // Alice blue
  [MATERIAL_IDS.SMOKE]: [105, 105, 105],      // Dim gray
  [MATERIAL_IDS.GASOLINE]: [255, 215, 0],     // Gold
  [MATERIAL_IDS.FIRE_GAS]: [255, 69, 0],      // Red orange
  [MATERIAL_IDS.CHAR]: [47, 47, 47],          // Dark gray
  [MATERIAL_IDS.ASH]: [169, 169, 169]         // Dark gray
};

/**
 * Debug overlay renderer
 */
export class DebugOverlay {
  constructor() {
    this.mode = DEBUG_MODES.NONE;
    this.visible = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.cameraX = 0;
    
    // Create overlay canvas
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = VW;
    this.canvas.height = VH;
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.zIndex = '1000';
    this.canvas.style.opacity = DEBUG_CONFIG.OPACITY.toString();
    
    // Setup mouse tracking
    this.setupMouseTracking();
  }
  
  /**
   * Setup mouse tracking for cell queries
   */
  setupMouseTracking() {
    const gameCanvas = document.getElementById('game');
    if (!gameCanvas) return;
    
    gameCanvas.addEventListener('mousemove', (e) => {
      const rect = gameCanvas.getBoundingClientRect();
      const scaleX = VW / rect.width;
      const scaleY = VH / rect.height;
      
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    });
  }
  
  /**
   * Toggle debug overlay visibility
   */
  toggle() {
    this.visible = !this.visible;
    
    if (this.visible && !this.canvas.parentElement) {
      document.body.appendChild(this.canvas);
    } else if (!this.visible && this.canvas.parentElement) {
      document.body.removeChild(this.canvas);
    }
  }
  
  /**
   * Set debug mode
   * @param {string} mode 
   */
  setMode(mode) {
    this.mode = mode;
  }
  
  /**
   * Cycle to next debug mode
   */
  nextMode() {
    const modes = Object.values(DEBUG_MODES);
    const currentIndex = modes.indexOf(this.mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.mode = modes[nextIndex];
  }
  
  /**
   * Render the debug overlay
   * @param {FireCA} fireCA 
   * @param {number} cameraX 
   */
  render(fireCA, cameraX) {
    if (!this.visible || this.mode === DEBUG_MODES.NONE) return;
    
    this.cameraX = cameraX;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, VW, VH);
    
    // Render based on mode
    switch (this.mode) {
      case DEBUG_MODES.TEMPERATURE:
        this.renderTemperature(fireCA);
        break;
      case DEBUG_MODES.MATERIALS:
        this.renderMaterials(fireCA);
        break;
      case DEBUG_MODES.BURNING:
        this.renderBurning(fireCA);
        break;
      case DEBUG_MODES.OXYGEN:
        this.renderOxygen(fireCA);
        break;
      case DEBUG_MODES.DENSITY:
        this.renderDensity(fireCA);
        break;
      case DEBUG_MODES.FUEL:
        this.renderFuel(fireCA);
        break;
    }
    
    // Render grid lines if enabled
    if (DEBUG_CONFIG.GRID_LINES) {
      this.renderGridLines();
    }
    
    // Render info panel
    if (DEBUG_CONFIG.INFO_PANEL) {
      this.renderInfoPanel(fireCA);
    }
    
    // Render mouse query
    if (DEBUG_CONFIG.MOUSE_QUERY) {
      this.renderMouseQuery(fireCA);
    }
  }
  
  /**
   * Render temperature heatmap
   * @param {FireCA} fireCA 
   */
  renderTemperature(fireCA) {
    const cellSize = DEBUG_CONFIG.CELL_SIZE;
    const startX = Math.floor(this.cameraX / cellSize);
    const endX = Math.min(startX + Math.ceil(VW / cellSize), GRID_CONFIG.GRID_WIDTH);
    const endY = Math.min(Math.ceil(VH / cellSize), GRID_CONFIG.GRID_HEIGHT);
    
    for (let worldX = startX; worldX < endX; worldX++) {
      for (let worldY = 0; worldY < endY; worldY++) {
        const cell = fireCA.grid.getCell(worldX, worldY);
        if (!cell) continue;
        
        const screenX = (worldX * cellSize) - this.cameraX;
        const screenY = worldY * cellSize;
        
        if (screenX + cellSize < 0 || screenX >= VW) continue;
        
        const color = this.interpolateColor(COLOR_PALETTES.temperature, cell.temperature);
        this.ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.fillRect(screenX, screenY, cellSize, cellSize);
      }
    }
  }
  
  /**
   * Render material types
   * @param {FireCA} fireCA 
   */
  renderMaterials(fireCA) {
    const cellSize = DEBUG_CONFIG.CELL_SIZE;
    const startX = Math.floor(this.cameraX / cellSize);
    const endX = Math.min(startX + Math.ceil(VW / cellSize), GRID_CONFIG.GRID_WIDTH);
    const endY = Math.min(Math.ceil(VH / cellSize), GRID_CONFIG.GRID_HEIGHT);
    
    for (let worldX = startX; worldX < endX; worldX++) {
      for (let worldY = 0; worldY < endY; worldY++) {
        const cell = fireCA.grid.getCell(worldX, worldY);
        if (!cell || cell.materialId === MATERIAL_IDS.AIR) continue;
        
        const screenX = (worldX * cellSize) - this.cameraX;
        const screenY = worldY * cellSize;
        
        if (screenX + cellSize < 0 || screenX >= VW) continue;
        
        const color = MATERIAL_COLORS[cell.materialId] || [128, 128, 128];
        this.ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.fillRect(screenX, screenY, cellSize, cellSize);
      }
    }
  }
  
  /**
   * Render burning cells
   * @param {FireCA} fireCA 
   */
  renderBurning(fireCA) {
    const cellSize = DEBUG_CONFIG.CELL_SIZE;
    const startX = Math.floor(this.cameraX / cellSize);
    const endX = Math.min(startX + Math.ceil(VW / cellSize), GRID_CONFIG.GRID_WIDTH);
    const endY = Math.min(Math.ceil(VH / cellSize), GRID_CONFIG.GRID_HEIGHT);
    
    for (let worldX = startX; worldX < endX; worldX++) {
      for (let worldY = 0; worldY < endY; worldY++) {
        const screenX = (worldX * cellSize) - this.cameraX;
        const screenY = worldY * cellSize;
        
        if (screenX + cellSize < 0 || screenX >= VW) continue;
        
        if (fireCA.queryBurningAt(worldX, worldY)) {
          this.ctx.fillStyle = 'rgb(255, 100, 0)';
          this.ctx.fillRect(screenX, screenY, cellSize, cellSize);
        }
      }
    }
  }
  
  /**
   * Render oxygen levels
   * @param {FireCA} fireCA 
   */
  renderOxygen(fireCA) {
    const cellSize = DEBUG_CONFIG.CELL_SIZE;
    const startX = Math.floor(this.cameraX / cellSize);
    const endX = Math.min(startX + Math.ceil(VW / cellSize), GRID_CONFIG.GRID_WIDTH);
    const endY = Math.min(Math.ceil(VH / cellSize), GRID_CONFIG.GRID_HEIGHT);
    
    for (let worldX = startX; worldX < endX; worldX++) {
      for (let worldY = 0; worldY < endY; worldY++) {
        const cell = fireCA.grid.getCell(worldX, worldY);
        if (!cell) continue;
        
        const screenX = (worldX * cellSize) - this.cameraX;
        const screenY = worldY * cellSize;
        
        if (screenX + cellSize < 0 || screenX >= VW) continue;
        
        const color = this.interpolateColor(COLOR_PALETTES.oxygen, cell.oxygen);
        this.ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.fillRect(screenX, screenY, cellSize, cellSize);
      }
    }
  }
  
  /**
   * Render density levels
   * @param {FireCA} fireCA 
   */
  renderDensity(fireCA) {
    const cellSize = DEBUG_CONFIG.CELL_SIZE;
    const startX = Math.floor(this.cameraX / cellSize);
    const endX = Math.min(startX + Math.ceil(VW / cellSize), GRID_CONFIG.GRID_WIDTH);
    const endY = Math.min(Math.ceil(VH / cellSize), GRID_CONFIG.GRID_HEIGHT);
    
    for (let worldX = startX; worldX < endX; worldX++) {
      for (let worldY = 0; worldY < endY; worldY++) {
        const cell = fireCA.grid.getCell(worldX, worldY);
        if (!cell) continue;
        
        const screenX = (worldX * cellSize) - this.cameraX;
        const screenY = worldY * cellSize;
        
        if (screenX + cellSize < 0 || screenX >= VW) continue;
        
        const color = this.interpolateColor(COLOR_PALETTES.density, cell.density);
        this.ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        this.ctx.fillRect(screenX, screenY, cellSize, cellSize);
      }
    }
  }
  
  /**
   * Render fuel levels
   * @param {FireCA} fireCA 
   */
  renderFuel(fireCA) {
    const cellSize = DEBUG_CONFIG.CELL_SIZE;
    const startX = Math.floor(this.cameraX / cellSize);
    const endX = Math.min(startX + Math.ceil(VW / cellSize), GRID_CONFIG.GRID_WIDTH);
    const endY = Math.min(Math.ceil(VH / cellSize), GRID_CONFIG.GRID_HEIGHT);
    
    for (let worldX = startX; worldX < endX; worldX++) {
      for (let worldY = 0; worldY < endY; worldY++) {
        const cell = fireCA.grid.getCell(worldX, worldY);
        if (!cell || cell.fuel <= 0) continue;
        
        const screenX = (worldX * cellSize) - this.cameraX;
        const screenY = worldY * cellSize;
        
        if (screenX + cellSize < 0 || screenX >= VW) continue;
        
        const intensity = Math.min(cell.fuel, 1.0);
        const red = Math.floor(255 * intensity);
        this.ctx.fillStyle = `rgb(${red}, 0, 0)`;
        this.ctx.fillRect(screenX, screenY, cellSize, cellSize);
      }
    }
  }
  
  /**
   * Render grid lines
   */
  renderGridLines() {
    const cellSize = DEBUG_CONFIG.CELL_SIZE;
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = 0; x < VW; x += cellSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, VH);
      this.ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = 0; y < VH; y += cellSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(VW, y);
      this.ctx.stroke();
    }
  }
  
  /**
   * Render info panel
   * @param {FireCA} fireCA 
   */
  renderInfoPanel(fireCA) {
    const debugInfo = fireCA.getDebugInfo();
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(4, 4, 180, 100);
    
    this.ctx.fillStyle = 'white';
    this.ctx.font = '10px monospace';
    
    const lines = [
      `Mode: ${this.mode}`,
      `Active Chunks: ${debugInfo.activeChunks}`,
      `Total Updates: ${debugInfo.totalUpdates}`,
      `Cells Updated: ${debugInfo.lastStats.cellsUpdated}`,
      `Combustion: ${debugInfo.lastStats.combustionEvents}`,
      `Transforms: ${debugInfo.lastStats.materialTransforms}`,
      `Fluid Moves: ${debugInfo.lastStats.fluidMovements}`,
      `Press \` to toggle modes`
    ];
    
    lines.forEach((line, index) => {
      this.ctx.fillText(line, 8, 18 + index * 12);
    });
  }
  
  /**
   * Render mouse query info
   * @param {FireCA} fireCA 
   */
  renderMouseQuery(fireCA) {
    const cellSize = DEBUG_CONFIG.CELL_SIZE;
    const worldX = Math.floor((this.mouseX + this.cameraX) / cellSize);
    const worldY = Math.floor(this.mouseY / cellSize);
    
    const cell = fireCA.grid.getCell(worldX, worldY);
    if (!cell) return;
    
    const material = getMaterial(cell.materialId);
    
    // Background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    this.ctx.fillRect(this.mouseX + 10, this.mouseY - 60, 150, 70);
    
    // Text
    this.ctx.fillStyle = 'white';
    this.ctx.font = '9px monospace';
    
    const lines = [
      `Pos: ${worldX}, ${worldY}`,
      `Material: ${material.name}`,
      `Temp: ${cell.temperature.toFixed(1)}°C`,
      `Fuel: ${cell.fuel.toFixed(2)}`,
      `Oxygen: ${(cell.oxygen * 100).toFixed(1)}%`,
      `Density: ${cell.density.toFixed(3)}`
    ];
    
    lines.forEach((line, index) => {
      this.ctx.fillText(line, this.mouseX + 14, this.mouseY - 45 + index * 11);
    });
  }
  
  /**
   * Interpolate color from palette based on value
   * @param {Array} palette 
   * @param {number} value 
   * @returns {Array} RGB color
   */
  interpolateColor(palette, value) {
    if (palette.length === 0) return [128, 128, 128];
    if (palette.length === 1) return palette[0].color;
    
    // Find the two colors to interpolate between
    let lower = palette[0];
    let upper = palette[palette.length - 1];
    
    for (let i = 0; i < palette.length - 1; i++) {
      const current = palette[i];
      const next = palette[i + 1];
      
      const currentKey = current.temp !== undefined ? current.temp : current.level;
      const nextKey = next.temp !== undefined ? next.temp : next.level;
      
      if (value >= currentKey && value <= nextKey) {
        lower = current;
        upper = next;
        break;
      }
    }
    
    const lowerKey = lower.temp !== undefined ? lower.temp : lower.level;
    const upperKey = upper.temp !== undefined ? upper.temp : upper.level;
    
    if (lowerKey === upperKey) {
      return lower.color;
    }
    
    const t = (value - lowerKey) / (upperKey - lowerKey);
    const clampedT = Math.max(0, Math.min(1, t));
    
    return [
      Math.floor(lower.color[0] + (upper.color[0] - lower.color[0]) * clampedT),
      Math.floor(lower.color[1] + (upper.color[1] - lower.color[1]) * clampedT),
      Math.floor(lower.color[2] + (upper.color[2] - lower.color[2]) * clampedT)
    ];
  }
}