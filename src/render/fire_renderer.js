/**
 * Fire Simulation Visual Renderer
 * 
 * Handles all visual aspects of the fire simulation:
 * - Material visualization with proper colors
 * - Heat visualization with gradients
 * - Particle rendering (embers, smoke)
 * - Light emission effects
 * - Debug overlays (heat map, material types, etc.)
 */

import { VW, VH, COLORS } from '../core/constants.js';
import { MaterialType, CELL_SIZE, AMBIENT_TEMPERATURE, GRID_W, GRID_H } from '../systems/fire_simulation.js';

// Visual constants
const HEAT_COLORS = [
  { temp: 20, color: [64, 64, 80] },      // Cold - dark blue
  { temp: 100, color: [80, 80, 96] },     // Warm - gray
  { temp: 200, color: [120, 60, 60] },    // Hot - dark red
  { temp: 400, color: [180, 80, 40] },    // Very hot - red-orange
  { temp: 600, color: [220, 120, 40] },   // Glowing - orange
  { temp: 800, color: [255, 180, 80] },   // Bright - yellow-orange
  { temp: 1000, color: [255, 220, 180] }, // White hot - pale yellow
  { temp: 1500, color: [255, 255, 255] }  // Extreme - white
];

const MATERIAL_COLORS = {
  [MaterialType.AIR]: [0, 0, 0, 0],           // Transparent
  [MaterialType.WOOD]: [101, 67, 33, 255],    // Brown
  [MaterialType.CLOTH]: [180, 140, 100, 255], // Tan
  [MaterialType.OIL]: [40, 40, 60, 200],      // Dark blue-gray, semi-transparent
  [MaterialType.WATER]: [100, 150, 200, 180], // Blue, semi-transparent
  [MaterialType.STONE]: [100, 100, 110, 255], // Gray
  [MaterialType.METAL]: [160, 160, 170, 255], // Light gray
  [MaterialType.PLANT]: [60, 120, 40, 255],   // Green
  [MaterialType.POWDER]: [200, 180, 140, 255],// Light brown
  [MaterialType.CHAR]: [40, 40, 40, 255],     // Dark gray
  [MaterialType.STEAM]: [220, 220, 240, 100], // White, very transparent
  [MaterialType.SMOKE]: [80, 80, 100, 150],   // Dark gray, semi-transparent
  [MaterialType.EMBER]: [255, 150, 50, 255]   // Orange-red
};

/**
 * Fire simulation visual renderer
 */
export class FireRenderer {
  constructor() {
    // Create offscreen canvases for different layers
    this.materialCanvas = document.createElement('canvas');
    this.materialCtx = this.materialCanvas.getContext('2d');
    this.materialCanvas.width = VW;
    this.materialCanvas.height = VH;
    
    this.heatCanvas = document.createElement('canvas');
    this.heatCtx = this.heatCanvas.getContext('2d');
    this.heatCanvas.width = VW;
    this.heatCanvas.height = VH;
    
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d');
    this.lightCanvas.width = VW;
    this.lightCanvas.height = VH;
    
    // Debug options
    this.debugMode = {
      showHeatMap: false,
      showMaterials: true,
      showParticles: true,
      showLight: true,
      showGrid: false,
      showOxygen: false,
      showFuel: false,
      showWetness: false
    };
    
    // Performance tracking
    this.renderTime = 0;
    this.frameCount = 0;
  }

  /**
   * Main render function
   */
  render(ctx, fireSimulation, cameraX = 0, t = 0) {
    const startTime = performance.now();
    
    // Clear offscreen canvases
    this.clearCanvases();
    
    // Render materials layer
    if (this.debugMode.showMaterials) {
      this.renderMaterials(fireSimulation, cameraX);
    }
    
    // Render heat visualization
    if (this.debugMode.showHeatMap) {
      this.renderHeatMap(fireSimulation, cameraX);
    }
    
    // Render light emission
    if (this.debugMode.showLight) {
      this.renderLightEmission(fireSimulation, cameraX, t);
    }
    
    // Render particles
    if (this.debugMode.showParticles) {
      fireSimulation.particleSystem.render(ctx, cameraX, t);
    }
    
    // Composite all layers to main context
    this.compositeLayers(ctx, cameraX);
    
    // Render debug overlays
    this.renderDebugOverlays(ctx, fireSimulation, cameraX);
    
    // Performance tracking
    this.renderTime = performance.now() - startTime;
    this.frameCount++;
  }

  /**
   * Clear all offscreen canvases
   */
  clearCanvases() {
    this.materialCtx.clearRect(0, 0, VW, VH);
    this.heatCtx.clearRect(0, 0, VW, VH);
    this.lightCtx.clearRect(0, 0, VW, VH);
  }

  /**
   * Render material layer
   */
  renderMaterials(fireSimulation, cameraX) {
    const imageData = this.materialCtx.createImageData(VW, VH);
    const data = imageData.data;
    
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = fireSimulation.getCell(x, y);
        if (!cell || cell.materialId === MaterialType.AIR) continue;
        
        const worldX = x * CELL_SIZE;
        const worldY = y * CELL_SIZE;
        
        // Skip if outside camera view
        if (worldX - cameraX < -CELL_SIZE || worldX - cameraX > VW) continue;
        
        const color = MATERIAL_COLORS[cell.materialId] || MATERIAL_COLORS[MaterialType.AIR];
        
        // Modify color based on temperature and burning state
        let [r, g, b, a] = color;
        
        if (cell.burning) {
          // Add fire glow
          const glowIntensity = Math.min(1, cell.lightEnergy / 50);
          r = Math.min(255, r + 100 * glowIntensity);
          g = Math.min(255, g + 50 * glowIntensity);
          b = Math.max(0, b - 20 * glowIntensity);
        }
        
        // Apply temperature tinting
        if (cell.temperature > AMBIENT_TEMPERATURE + 100) {
          const heatIntensity = Math.min(1, (cell.temperature - AMBIENT_TEMPERATURE) / 500);
          r = Math.min(255, r + 50 * heatIntensity);
          g = Math.min(255, g + 20 * heatIntensity);
        }
        
        // Render the cell as a small rectangle
        this.fillCellRect(data, VW, worldX - cameraX, worldY, CELL_SIZE, CELL_SIZE, r, g, b, a);
      }
    }
    
    this.materialCtx.putImageData(imageData, 0, 0);
  }

  /**
   * Render heat visualization
   */
  renderHeatMap(fireSimulation, cameraX) {
    const imageData = this.heatCtx.createImageData(VW, VH);
    const data = imageData.data;
    
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = fireSimulation.getCell(x, y);
        if (!cell) continue;
        
        const worldX = x * CELL_SIZE;
        const worldY = y * CELL_SIZE;
        
        // Skip if outside camera view
        if (worldX - cameraX < -CELL_SIZE || worldX - cameraX > VW) continue;
        
        if (cell.temperature > AMBIENT_TEMPERATURE + 20) {
          const color = this.getHeatColor(cell.temperature);
          const intensity = Math.min(1, (cell.temperature - AMBIENT_TEMPERATURE) / 800);
          
          this.fillCellRect(data, VW, worldX - cameraX, worldY, CELL_SIZE, CELL_SIZE, 
                           color[0], color[1], color[2], intensity * 100);
        }
      }
    }
    
    this.heatCtx.putImageData(imageData, 0, 0);
  }

  /**
   * Render light emission with bloom effect
   */
  renderLightEmission(fireSimulation, cameraX, t) {
    this.lightCtx.globalCompositeOperation = 'screen';
    
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = fireSimulation.getCell(x, y);
        if (!cell || cell.lightEnergy <= 0) continue;
        
        const worldX = x * CELL_SIZE - cameraX;
        const worldY = y * CELL_SIZE;
        
        // Skip if outside camera view
        if (worldX < -20 || worldX > VW + 20) continue;
        
        const intensity = cell.lightEnergy / 100;
        const flicker = 0.8 + 0.2 * Math.sin(t * 8 + x * 0.5 + y * 0.7);
        const finalIntensity = intensity * flicker;
        
        // Create radial gradient for light
        const radius = 8 + intensity * 12;
        const gradient = this.lightCtx.createRadialGradient(
          worldX + CELL_SIZE / 2, worldY + CELL_SIZE / 2, 0,
          worldX + CELL_SIZE / 2, worldY + CELL_SIZE / 2, radius
        );
        
        // Color based on temperature
        const material = cell.getMaterial();
        const [r, g, b] = material.lightColor;
        
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${finalIntensity * 0.8})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${finalIntensity * 0.4})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        this.lightCtx.fillStyle = gradient;
        this.lightCtx.fillRect(worldX - radius, worldY - radius, radius * 2, radius * 2);
      }
    }
    
    this.lightCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Composite all layers to the main context
   */
  compositeLayers(ctx, cameraX) {
    // Material layer (base)
    ctx.drawImage(this.materialCanvas, 0, 0);
    
    // Heat overlay (additive blending)
    if (this.debugMode.showHeatMap) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.heatCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    
    // Light emission (additive blending)
    if (this.debugMode.showLight) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.lightCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Render debug overlays
   */
  renderDebugOverlays(ctx, fireSimulation, cameraX) {
    if (!Object.values(this.debugMode).some(Boolean)) return;
    
    const debugInfo = fireSimulation.getDebugInfo();
    
    // Debug text panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(5, 5, 200, 120);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(`Grid: ${debugInfo.gridSize}`, 10, 20);
    ctx.fillText(`Cell Size: ${debugInfo.cellSize}px`, 10, 35);
    ctx.fillText(`Active Chunks: ${debugInfo.activeChunks}`, 10, 50);
    ctx.fillText(`Particles: ${debugInfo.particles}`, 10, 65);
    ctx.fillText(`Update: ${debugInfo.updateTime}`, 10, 80);
    ctx.fillText(`Render: ${this.renderTime.toFixed(2)}ms`, 10, 95);
    ctx.fillText(`Frame: ${this.frameCount}`, 10, 110);
    
    // Grid overlay
    if (this.debugMode.showGrid) {
      this.renderGridOverlay(ctx, fireSimulation, cameraX);
    }
    
    // Oxygen visualization
    if (this.debugMode.showOxygen) {
      this.renderOxygenOverlay(ctx, fireSimulation, cameraX);
    }
    
    // Fuel visualization
    if (this.debugMode.showFuel) {
      this.renderFuelOverlay(ctx, fireSimulation, cameraX);
    }
  }

  /**
   * Render grid overlay for debugging
   */
  renderGridOverlay(ctx, fireSimulation, cameraX) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = 0; x < GRID_W; x++) {
      const worldX = x * CELL_SIZE - cameraX;
      if (worldX >= 0 && worldX <= VW) {
        ctx.beginPath();
        ctx.moveTo(worldX, 0);
        ctx.lineTo(worldX, VH);
        ctx.stroke();
      }
    }
    
    // Horizontal lines
    for (let y = 0; y < GRID_H; y++) {
      const worldY = y * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(0, worldY);
      ctx.lineTo(VW, worldY);
      ctx.stroke();
    }
  }

  /**
   * Render oxygen level overlay
   */
  renderOxygenOverlay(ctx, fireSimulation, cameraX) {
    ctx.globalAlpha = 0.5;
    
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = fireSimulation.getCell(x, y);
        if (!cell) continue;
        
        const worldX = x * CELL_SIZE - cameraX;
        const worldY = y * CELL_SIZE;
        
        if (worldX < -CELL_SIZE || worldX > VW) continue;
        
        const oxygenRatio = cell.oxygen / 100;
        const blue = Math.floor(255 * oxygenRatio);
        
        ctx.fillStyle = `rgb(0, 0, ${blue})`;
        ctx.fillRect(worldX, worldY, CELL_SIZE, CELL_SIZE);
      }
    }
    
    ctx.globalAlpha = 1;
  }

  /**
   * Render fuel level overlay
   */
  renderFuelOverlay(ctx, fireSimulation, cameraX) {
    ctx.globalAlpha = 0.5;
    
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cell = fireSimulation.getCell(x, y);
        if (!cell || cell.fuel <= 0) continue;
        
        const worldX = x * CELL_SIZE - cameraX;
        const worldY = y * CELL_SIZE;
        
        if (worldX < -CELL_SIZE || worldX > VW) continue;
        
        const material = cell.getMaterial();
        const fuelRatio = cell.fuel / material.fuelAmount;
        const green = Math.floor(255 * fuelRatio);
        
        ctx.fillStyle = `rgb(0, ${green}, 0)`;
        ctx.fillRect(worldX, worldY, CELL_SIZE, CELL_SIZE);
      }
    }
    
    ctx.globalAlpha = 1;
  }

  /**
   * Get interpolated heat color based on temperature
   */
  getHeatColor(temperature) {
    // Find the two nearest color stops
    for (let i = 0; i < HEAT_COLORS.length - 1; i++) {
      const lower = HEAT_COLORS[i];
      const upper = HEAT_COLORS[i + 1];
      
      if (temperature >= lower.temp && temperature <= upper.temp) {
        // Interpolate between the two colors
        const ratio = (temperature - lower.temp) / (upper.temp - lower.temp);
        return [
          Math.floor(lower.color[0] + (upper.color[0] - lower.color[0]) * ratio),
          Math.floor(lower.color[1] + (upper.color[1] - lower.color[1]) * ratio),
          Math.floor(lower.color[2] + (upper.color[2] - lower.color[2]) * ratio)
        ];
      }
    }
    
    // Return the highest color for extreme temperatures
    return HEAT_COLORS[HEAT_COLORS.length - 1].color;
  }

  /**
   * Fill a rectangular area in image data
   */
  fillCellRect(data, width, x, y, w, h, r, g, b, a) {
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(width, Math.ceil(x + w));
    const endY = Math.min(data.length / (width * 4), Math.ceil(y + h));
    
    for (let py = startY; py < endY; py++) {
      for (let px = startX; px < endX; px++) {
        const index = (py * width + px) * 4;
        if (index < data.length) {
          data[index] = r;     // Red
          data[index + 1] = g; // Green
          data[index + 2] = b; // Blue
          data[index + 3] = a; // Alpha
        }
      }
    }
  }

  /**
   * Toggle debug mode option
   */
  toggleDebugMode(option) {
    if (this.debugMode.hasOwnProperty(option)) {
      this.debugMode[option] = !this.debugMode[option];
    }
  }

  /**
   * Set debug mode option
   */
  setDebugMode(option, value) {
    if (this.debugMode.hasOwnProperty(option)) {
      this.debugMode[option] = value;
    }
  }

  /**
   * Get render performance info
   */
  getPerformanceInfo() {
    return {
      renderTime: this.renderTime,
      frameCount: this.frameCount,
      avgRenderTime: this.frameCount > 0 ? this.renderTime / this.frameCount : 0
    };
  }
}