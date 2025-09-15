/**
 * Debug overlay system for cellular automata visualization.
 * 
 * Provides multiple visualization modes:
 * - Temperature heatmap
 * - Material types
 * - Burning state
 * - Oxygen levels
 * - Fuel levels
 * 
 * Toggle with backquote (`) key.
 */

import { MATERIAL_IDS, getMaterial } from './materials.js';

export class DebugOverlay {
  constructor(grid) {
    this.grid = grid;
    this.enabled = false;
    this.mode = 'temperature'; // temperature, material, burning, oxygen, fuel
    this.modes = ['temperature', 'material', 'burning', 'oxygen', 'fuel'];
    this.currentModeIndex = 0;
    this.opacity = 0.7;
    
    // Visualization settings
    this.cellSize = 2; // How many screen pixels per cell
    this.maxTemp = 1000;
    this.showLegend = true;
    
    // Key handler
    this.boundKeyHandler = this.handleKeyPress.bind(this);
  }
  
  /**
   * Initialize debug overlay (call once)
   */
  init() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyHandler);
    }
  }
  
  /**
   * Clean up event listeners
   */
  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyHandler);
    }
  }
  
  /**
   * Handle key presses
   * @param {KeyboardEvent} event
   */
  handleKeyPress(event) {
    if (event.code === 'Backquote') {
      this.toggle();
      event.preventDefault();
    } else if (event.code === 'Tab' && this.enabled) {
      this.nextMode();
      event.preventDefault();
    }
  }
  
  /**
   * Toggle overlay visibility
   */
  toggle() {
    this.enabled = !this.enabled;
    console.log(`Debug overlay ${this.enabled ? 'enabled' : 'disabled'} - Mode: ${this.mode}`);
  }
  
  /**
   * Switch to next visualization mode
   */
  nextMode() {
    this.currentModeIndex = (this.currentModeIndex + 1) % this.modes.length;
    this.mode = this.modes[this.currentModeIndex];
    console.log(`Debug overlay mode: ${this.mode}`);
  }
  
  /**
   * Draw the debug overlay
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cameraX
   * @param {number} viewWidth
   * @param {number} viewHeight
   */
  draw(ctx, cameraX, viewWidth, viewHeight) {
    if (!this.enabled) return;
    
    ctx.save();
    ctx.globalAlpha = this.opacity;
    
    // Calculate visible area
    const startX = Math.floor(cameraX / this.cellSize);
    const endX = Math.ceil((cameraX + viewWidth) / this.cellSize);
    const startY = 0;
    const endY = Math.ceil(viewHeight / this.cellSize);
    
    // Draw cells
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const worldX = x;
        const worldY = y;
        
        if (!this.grid.isValidCoord(worldX, worldY)) continue;
        
        const cell = this.grid.getCell(worldX, worldY);
        if (!cell) continue;
        
        const screenX = x * this.cellSize - cameraX;
        const screenY = y * this.cellSize;
        
        if (screenX + this.cellSize < 0 || screenX > viewWidth) continue;
        
        const color = this.getCellColor(cell);
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(screenX, screenY, this.cellSize, this.cellSize);
        }
      }
    }
    
    ctx.restore();
    
    // Draw legend
    if (this.showLegend) {
      this.drawLegend(ctx, viewWidth, viewHeight);
    }
  }
  
  /**
   * Get color for a cell based on current mode
   * @param {object} cell
   * @returns {string|null} CSS color string or null for transparent
   */
  getCellColor(cell) {
    switch (this.mode) {
      case 'temperature':
        return this.getTemperatureColor(cell.temp);
      
      case 'material':
        return this.getMaterialColor(cell.materialId);
      
      case 'burning':
        return this.getBurningColor(cell.burning, cell.temp);
      
      case 'oxygen':
        return this.getOxygenColor(cell.oxygen);
      
      case 'fuel':
        return this.getFuelColor(cell.fuel);
      
      default:
        return null;
    }
  }
  
  /**
   * Get temperature visualization color
   * @param {number} temperature
   * @returns {string}
   */
  getTemperatureColor(temperature) {
    if (temperature <= 20) return null; // Don't show room temperature
    
    const normalized = Math.min(1, temperature / this.maxTemp);
    
    if (normalized < 0.2) {
      // Blue to cyan (cold)
      const t = normalized / 0.2;
      return `rgb(${Math.floor(t * 100)}, ${Math.floor(100 + t * 155)}, 255)`;
    } else if (normalized < 0.4) {
      // Cyan to green (warm)
      const t = (normalized - 0.2) / 0.2;
      return `rgb(${Math.floor((1-t) * 100)}, 255, ${Math.floor((1-t) * 255)})`;
    } else if (normalized < 0.6) {
      // Green to yellow (hot)
      const t = (normalized - 0.4) / 0.2;
      return `rgb(${Math.floor(t * 255)}, 255, 0)`;
    } else if (normalized < 0.8) {
      // Yellow to orange (very hot)
      const t = (normalized - 0.6) / 0.2;
      return `rgb(255, ${Math.floor(255 - t * 155)}, 0)`;
    } else {
      // Orange to red (extremely hot)
      const t = (normalized - 0.8) / 0.2;
      return `rgb(255, ${Math.floor(100 - t * 100)}, 0)`;
    }
  }
  
  /**
   * Get material visualization color
   * @param {number} materialId
   * @returns {string|null}
   */
  getMaterialColor(materialId) {
    if (materialId === MATERIAL_IDS.AIR) return null;
    
    const material = getMaterial(materialId);
    return material.color === 'transparent' ? null : material.color;
  }
  
  /**
   * Get burning state visualization color
   * @param {number} burning
   * @param {number} temperature
   * @returns {string|null}
   */
  getBurningColor(burning, temperature) {
    if (burning > 0) {
      // Active fire - intensity based on temperature
      const intensity = Math.min(1, temperature / 800);
      return `rgb(255, ${Math.floor(100 + intensity * 155)}, ${Math.floor(intensity * 100)})`;
    } else if (temperature > 100) {
      // Hot but not burning
      const intensity = Math.min(1, (temperature - 100) / 200);
      return `rgba(255, 165, 0, ${intensity * 0.5})`;
    }
    
    return null;
  }
  
  /**
   * Get oxygen level visualization color
   * @param {number} oxygen
   * @returns {string|null}
   */
  getOxygenColor(oxygen) {
    if (oxygen >= 20) return null; // Normal oxygen levels
    
    const normalized = oxygen / 21;
    
    if (normalized > 0.5) {
      // Yellow to green
      const t = (normalized - 0.5) / 0.5;
      return `rgb(${Math.floor(255 - t * 155)}, 255, 0)`;
    } else {
      // Red to yellow
      const t = normalized / 0.5;
      return `rgb(255, ${Math.floor(t * 255)}, 0)`;
    }
  }
  
  /**
   * Get fuel level visualization color
   * @param {number} fuel
   * @returns {string|null}
   */
  getFuelColor(fuel) {
    if (fuel <= 0) return null;
    
    const normalized = Math.min(1, fuel / 200); // Max fuel is ~200
    
    // Brown to yellow gradient
    const red = Math.floor(139 + normalized * 116); // 139 to 255
    const green = Math.floor(69 + normalized * 186); // 69 to 255
    const blue = Math.floor(19 + normalized * 0);    // 19 to 19 (brown to yellow)
    
    return `rgb(${red}, ${green}, ${blue})`;
  }
  
  /**
   * Draw legend showing current mode and scale
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} viewWidth
   * @param {number} viewHeight
   */
  drawLegend(ctx, viewWidth, viewHeight) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    
    // Background
    const legendWidth = 200;
    const legendHeight = 120;
    const legendX = viewWidth - legendWidth - 10;
    const legendY = 10;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
    
    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText(`Debug: ${this.mode}`, legendX + 10, legendY + 20);
    
    // Mode-specific legend
    this.drawModeLegend(ctx, legendX + 10, legendY + 35);
    
    // Instructions
    ctx.font = '10px monospace';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('` - Toggle overlay', legendX + 10, legendY + 100);
    ctx.fillText('Tab - Change mode', legendX + 10, legendY + 115);
    
    ctx.restore();
  }
  
  /**
   * Draw mode-specific legend content
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   */
  drawModeLegend(ctx, x, y) {
    const swatchSize = 12;
    const spacing = 15;
    
    switch (this.mode) {
      case 'temperature':
        ctx.font = '10px monospace';
        ctx.fillStyle = '#ffffff';
        
        const temps = [50, 200, 400, 600, 800, 1000];
        for (let i = 0; i < temps.length; i++) {
          const temp = temps[i];
          const color = this.getTemperatureColor(temp);
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y + i * spacing, swatchSize, swatchSize);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${temp}°C`, x + swatchSize + 5, y + i * spacing + 10);
          }
        }
        break;
      
      case 'material':
        const materials = [
          { id: MATERIAL_IDS.OIL, name: 'Oil' },
          { id: MATERIAL_IDS.WATER, name: 'Water' },
          { id: MATERIAL_IDS.SMOKE, name: 'Smoke' },
          { id: MATERIAL_IDS.STEAM, name: 'Steam' },
          { id: MATERIAL_IDS.WOOD, name: 'Wood' },
          { id: MATERIAL_IDS.FIRE_GAS, name: 'Fire' }
        ];
        
        for (let i = 0; i < materials.length; i++) {
          const mat = materials[i];
          const color = this.getMaterialColor(mat.id);
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y + i * spacing, swatchSize, swatchSize);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(mat.name, x + swatchSize + 5, y + i * spacing + 10);
          }
        }
        break;
      
      case 'burning':
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(x, y, swatchSize, swatchSize);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Burning', x + swatchSize + 5, y + 10);
        
        ctx.fillStyle = '#ffa500';
        ctx.fillRect(x, y + spacing, swatchSize, swatchSize);
        ctx.fillText('Hot', x + swatchSize + 5, y + spacing + 10);
        break;
      
      case 'oxygen':
        const oxygenLevels = [0, 5, 10, 15, 20];
        for (let i = 0; i < oxygenLevels.length; i++) {
          const level = oxygenLevels[i];
          const color = this.getOxygenColor(level);
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y + i * spacing, swatchSize, swatchSize);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${level}%`, x + swatchSize + 5, y + i * spacing + 10);
          }
        }
        break;
      
      case 'fuel':
        const fuelLevels = [0, 50, 100, 150, 200];
        for (let i = 0; i < fuelLevels.length; i++) {
          const level = fuelLevels[i];
          const color = this.getFuelColor(level);
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y + i * spacing, swatchSize, swatchSize);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${level}`, x + swatchSize + 5, y + i * spacing + 10);
          }
        }
        break;
    }
  }
  
  /**
   * Get current mode info for external display
   * @returns {object}
   */
  getInfo() {
    return {
      enabled: this.enabled,
      mode: this.mode,
      modes: this.modes,
      opacity: this.opacity
    };
  }
  
  /**
   * Set visualization opacity
   * @param {number} opacity - 0 to 1
   */
  setOpacity(opacity) {
    this.opacity = Math.max(0, Math.min(1, opacity));
  }
}