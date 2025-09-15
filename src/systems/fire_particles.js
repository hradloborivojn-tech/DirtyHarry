/**
 * Enhanced Fire Particle System
 * 
 * Handles advanced particle effects for the fire simulation:
 * - Ember waterfalls with realistic physics
 * - Smoke particles with curl noise
 * - Steam effects with pressure bursts
 * - Visual effects for dramatic fire behavior
 */

import { VW, VH } from '../core/constants.js';
import { MaterialType, CELL_SIZE } from '../systems/fire_simulation.js';

/**
 * Advanced particle system for fire effects
 */
export class FireParticleSystem {
  constructor(rng) {
    this.rng = rng;
    this.particles = [];
    this.maxParticles = 3000;
    
    // Particle pools for performance
    this.emberPool = [];
    this.smokePool = [];
    this.steamPool = [];
    
    // Visual settings
    this.settings = {
      emberGravity: 150,
      emberAirResistance: 0.985,
      emberUpwardForce: 80,
      smokeRise: 60,
      smokeDiffusion: 30,
      steamExpansion: 120,
      steamPressure: 200
    };
  }

  /**
   * Spawn ember particle with enhanced physics
   */
  spawnEmber(worldX, worldY, temperature = 800, intensity = 1.0) {
    if (this.particles.length >= this.maxParticles) {
      this.removeOldestParticle('ember');
    }

    const ember = this.getFromPool('ember') || {
      type: 'ember',
      active: true
    };

    // Position with some random spread
    ember.x = worldX + (this.rng() - 0.5) * CELL_SIZE;
    ember.y = worldY + (this.rng() - 0.5) * CELL_SIZE;
    
    // Velocity with strong upward bias and some randomness
    const baseUpward = -40 - this.rng() * 60;
    ember.vx = (this.rng() - 0.5) * 30;
    ember.vy = baseUpward * intensity;
    
    // Visual properties
    ember.life = 1.5 + this.rng() * 2.5;
    ember.maxLife = ember.life;
    ember.temperature = temperature + (this.rng() - 0.5) * 200;
    ember.size = 0.8 + this.rng() * 1.5;
    ember.maxSize = ember.size;
    
    // Flicker properties
    ember.flickerPhase = this.rng() * Math.PI * 2;
    ember.flickerSpeed = 8 + this.rng() * 12;
    
    // Physics properties
    ember.mass = 0.5 + this.rng() * 0.5;
    ember.buoyancy = 0.8 + this.rng() * 0.4;
    
    this.particles.push(ember);
  }

  /**
   * Spawn multiple embers in a burst (for explosive effects)
   */
  spawnEmberBurst(worldX, worldY, count = 8, intensity = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 20 + this.rng() * 40;
      const offsetX = Math.cos(angle) * (2 + this.rng() * 4);
      const offsetY = Math.sin(angle) * (2 + this.rng() * 4);
      
      this.spawnEmber(worldX + offsetX, worldY + offsetY, 900 + this.rng() * 300, intensity);
    }
  }

  /**
   * Spawn smoke particle
   */
  spawnSmoke(worldX, worldY, density = 1.0) {
    if (this.particles.length >= this.maxParticles) {
      this.removeOldestParticle('smoke');
    }

    const smoke = this.getFromPool('smoke') || {
      type: 'smoke',
      active: true
    };

    smoke.x = worldX + (this.rng() - 0.5) * CELL_SIZE * 2;
    smoke.y = worldY + (this.rng() - 0.5) * CELL_SIZE;
    
    // Smoke rises with some horizontal drift
    smoke.vx = (this.rng() - 0.5) * 20;
    smoke.vy = -15 - this.rng() * 25;
    
    smoke.life = 3 + this.rng() * 4;
    smoke.maxLife = smoke.life;
    smoke.size = 2 + this.rng() * 3;
    smoke.maxSize = smoke.size * (2 + this.rng());
    smoke.density = density;
    
    // Curl noise properties for realistic smoke motion
    smoke.curlTime = 0;
    smoke.curlStrength = 0.5 + this.rng() * 0.5;
    
    this.particles.push(smoke);
  }

  /**
   * Spawn steam particle with pressure effects
   */
  spawnSteam(worldX, worldY, pressure = 1.0) {
    if (this.particles.length >= this.maxParticles) {
      this.removeOldestParticle('steam');
    }

    const steam = this.getFromPool('steam') || {
      type: 'steam',
      active: true
    };

    steam.x = worldX + (this.rng() - 0.5) * CELL_SIZE;
    steam.y = worldY + (this.rng() - 0.5) * CELL_SIZE;
    
    // Steam expands rapidly with pressure
    const angle = this.rng() * Math.PI * 2;
    const speed = pressure * (30 + this.rng() * 60);
    steam.vx = Math.cos(angle) * speed;
    steam.vy = Math.sin(angle) * speed - 20; // Slight upward bias
    
    steam.life = 0.8 + this.rng() * 1.2;
    steam.maxLife = steam.life;
    steam.size = 1 + this.rng() * 2;
    steam.maxSize = steam.size * (3 + this.rng() * 2);
    steam.pressure = pressure;
    
    this.particles.push(steam);
  }

  /**
   * Update all particles
   */
  update(dt, fireSimulation) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      
      if (!particle.active) {
        this.returnToPool(particle);
        this.particles.splice(i, 1);
        continue;
      }

      switch (particle.type) {
        case 'ember':
          this.updateEmber(particle, dt, fireSimulation);
          break;
        case 'smoke':
          this.updateSmoke(particle, dt, fireSimulation);
          break;
        case 'steam':
          this.updateSteam(particle, dt, fireSimulation);
          break;
      }

      // Remove dead particles
      if (particle.life <= 0) {
        particle.active = false;
      }
    }
  }

  /**
   * Update ember particle with advanced physics
   */
  updateEmber(ember, dt, fireSimulation) {
    // Age the particle
    ember.life -= dt;
    const ageRatio = 1 - (ember.life / ember.maxLife);

    // Physics
    ember.x += ember.vx * dt;
    ember.y += ember.vy * dt;

    // Gravity
    ember.vy += this.settings.emberGravity * dt;

    // Air resistance
    ember.vx *= Math.pow(this.settings.emberAirResistance, dt * 60);
    ember.vy *= Math.pow(this.settings.emberAirResistance, dt * 60);

    // Convection from hot air around the ember
    const { x: gridX, y: gridY } = fireSimulation.worldToGrid(ember.x, ember.y);
    const cell = fireSimulation.getCell(gridX, gridY);
    
    if (cell && cell.temperature > 100) {
      const convectionForce = Math.min(1, (cell.temperature - 100) / 500);
      ember.vy -= this.settings.emberUpwardForce * convectionForce * ember.buoyancy * dt;
      
      // Add some horizontal drift in hot air
      ember.vx += (this.rng() - 0.5) * 20 * convectionForce * dt;
    }

    // Temperature cooling
    ember.temperature = Math.max(200, ember.temperature - 300 * dt);

    // Size changes as ember burns out
    ember.size = ember.maxSize * (1 - ageRatio * 0.5);

    // Remove if off-screen or burnt out
    if (ember.y > VH + 20 || ember.x < -20 || ember.x > VW + 20 || ember.temperature < 250) {
      ember.life = 0;
    }
  }

  /**
   * Update smoke particle with curl noise
   */
  updateSmoke(smoke, dt, fireSimulation) {
    smoke.life -= dt;
    const ageRatio = 1 - (smoke.life / smoke.maxLife);

    // Basic movement
    smoke.x += smoke.vx * dt;
    smoke.y += smoke.vy * dt;

    // Rising motion
    smoke.vy -= this.settings.smokeRise * dt;

    // Curl noise for realistic turbulence
    smoke.curlTime += dt;
    const curlX = Math.sin(smoke.curlTime * 2 + smoke.x * 0.01) * smoke.curlStrength;
    const curlY = Math.cos(smoke.curlTime * 1.5 + smoke.y * 0.01) * smoke.curlStrength;
    
    smoke.vx += curlX * this.settings.smokeDiffusion * dt;
    smoke.vy += curlY * this.settings.smokeDiffusion * dt;

    // Dissipation
    smoke.vx *= 0.98;
    smoke.vy *= 0.98;

    // Size expansion
    smoke.size = smoke.maxSize * (0.3 + ageRatio * 0.7);

    // Remove if off-screen
    if (smoke.y < -50 || smoke.x < -50 || smoke.x > VW + 50) {
      smoke.life = 0;
    }
  }

  /**
   * Update steam particle
   */
  updateSteam(steam, dt, fireSimulation) {
    steam.life -= dt;
    const ageRatio = 1 - (steam.life / steam.maxLife);

    // Movement with expansion
    steam.x += steam.vx * dt;
    steam.y += steam.vy * dt;

    // Steam expands and slows down
    const expansionFactor = 1 + ageRatio * 2;
    steam.vx *= Math.pow(0.95, dt * 60);
    steam.vy *= Math.pow(0.95, dt * 60);

    // Buoyancy
    steam.vy -= this.settings.steamExpansion * steam.pressure * dt;

    // Size expansion
    steam.size = steam.maxSize * (0.5 + ageRatio * 0.5);

    // Remove if off-screen
    if (steam.y < -30 || steam.x < -30 || steam.x > VW + 30) {
      steam.life = 0;
    }
  }

  /**
   * Render all particles
   */
  render(ctx, cameraX, t) {
    for (const particle of this.particles) {
      if (!particle.active) continue;

      const screenX = particle.x - cameraX;
      if (screenX < -20 || screenX > VW + 20) continue;

      switch (particle.type) {
        case 'ember':
          this.renderEmber(ctx, particle, screenX, t);
          break;
        case 'smoke':
          this.renderSmoke(ctx, particle, screenX, t);
          break;
        case 'steam':
          this.renderSteam(ctx, particle, screenX, t);
          break;
      }
    }
  }

  /**
   * Render ember with enhanced visuals
   */
  renderEmber(ctx, ember, screenX, t) {
    const ageRatio = 1 - (ember.life / ember.maxLife);
    const alpha = Math.max(0, 1 - ageRatio);
    
    // Temperature-based color
    const tempRatio = Math.min(1, ember.temperature / 1000);
    const r = Math.floor(255 * tempRatio);
    const g = Math.floor(200 * tempRatio * 0.8);
    const b = Math.floor(100 * tempRatio * 0.5);
    
    // Flicker effect
    ember.flickerPhase += ember.flickerSpeed * (1/60); // Assuming 60fps
    const flicker = 0.7 + 0.3 * Math.sin(ember.flickerPhase);
    const finalAlpha = alpha * flicker;
    
    ctx.save();
    ctx.globalAlpha = finalAlpha;
    
    // Outer glow
    const outerSize = ember.size * 3;
    const outerGradient = ctx.createRadialGradient(
      screenX, ember.y, 0,
      screenX, ember.y, outerSize
    );
    outerGradient.addColorStop(0, `rgba(${r}, ${Math.floor(g * 0.6)}, 0, 0.3)`);
    outerGradient.addColorStop(0.7, `rgba(${Math.floor(r * 0.8)}, ${Math.floor(g * 0.4)}, 0, 0.1)`);
    outerGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    
    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.arc(screenX, ember.y, outerSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner core
    const coreSize = ember.size;
    const coreGradient = ctx.createRadialGradient(
      screenX, ember.y, 0,
      screenX, ember.y, coreSize
    );
    coreGradient.addColorStop(0, `rgba(255, 255, 200, 0.9)`);
    coreGradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.8)`);
    coreGradient.addColorStop(1, `rgba(${Math.floor(r * 0.7)}, ${Math.floor(g * 0.5)}, 0, 0)`);
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(screenX, ember.y, coreSize, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  /**
   * Render smoke with curl effects
   */
  renderSmoke(ctx, smoke, screenX, t) {
    const ageRatio = 1 - (smoke.life / smoke.maxLife);
    const alpha = (1 - ageRatio) * 0.6 * smoke.density;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Create swirling smoke pattern
    const swirl = Math.sin(t * 2 + smoke.x * 0.01) * 0.3;
    const offsetY = smoke.y + swirl * 5;
    
    const gradient = ctx.createRadialGradient(
      screenX, offsetY, 0,
      screenX, offsetY, smoke.size
    );
    gradient.addColorStop(0, 'rgba(100, 100, 120, 0.7)');
    gradient.addColorStop(0.5, 'rgba(80, 80, 100, 0.4)');
    gradient.addColorStop(1, 'rgba(60, 60, 80, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, offsetY, smoke.size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  /**
   * Render steam effects
   */
  renderSteam(ctx, steam, screenX, t) {
    const ageRatio = 1 - (steam.life / steam.maxLife);
    const alpha = (1 - ageRatio) * 0.8;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    const gradient = ctx.createRadialGradient(
      screenX, steam.y, 0,
      screenX, steam.y, steam.size
    );
    gradient.addColorStop(0, 'rgba(240, 240, 255, 0.8)');
    gradient.addColorStop(0.6, 'rgba(220, 230, 245, 0.4)');
    gradient.addColorStop(1, 'rgba(200, 210, 230, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, steam.y, steam.size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  /**
   * Pool management for performance
   */
  getFromPool(type) {
    switch (type) {
      case 'ember': return this.emberPool.pop();
      case 'smoke': return this.smokePool.pop();
      case 'steam': return this.steamPool.pop();
    }
    return null;
  }

  returnToPool(particle) {
    particle.active = false;
    switch (particle.type) {
      case 'ember': 
        if (this.emberPool.length < 100) this.emberPool.push(particle);
        break;
      case 'smoke':
        if (this.smokePool.length < 100) this.smokePool.push(particle);
        break;
      case 'steam':
        if (this.steamPool.length < 50) this.steamPool.push(particle);
        break;
    }
  }

  removeOldestParticle(preferredType) {
    for (let i = 0; i < this.particles.length; i++) {
      if (!preferredType || this.particles[i].type === preferredType) {
        this.returnToPool(this.particles[i]);
        this.particles.splice(i, 1);
        break;
      }
    }
  }

  /**
   * Clear all particles
   */
  clear() {
    for (const particle of this.particles) {
      this.returnToPool(particle);
    }
    this.particles.length = 0;
  }

  /**
   * Get performance info
   */
  getStats() {
    const stats = {
      total: this.particles.length,
      ember: 0,
      smoke: 0,
      steam: 0
    };

    for (const particle of this.particles) {
      stats[particle.type]++;
    }

    return stats;
  }
}