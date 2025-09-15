/**
 * Glue for Molotov shatter: spawn cellular automata fire and apply direct-hit damage + burning.
 * 
 * Updated to use the cellular automata fire system instead of FirePatch.
 * Maintains backward compatibility with existing API.
 */
import { createFirePatchAtImpact } from '../weapons/fire_patch.js';
import { applyBurningStatus } from '../status/burning.js';
import { MATERIAL_IDS } from '../sim/materials.js';

// Global reference to the cellular automata system (set by game.js)
let fireCA = null;

/**
 * Set the cellular automata reference for fire integration
 * @param {FireCA} ca 
 */
export function setFireCA(ca) {
  fireCA = ca;
}

/**
 * Handle molotov shatter with cellular automata integration
 * @param {Object} m - Molotov projectile
 * @param {Object} hitEntity - Entity that was hit (if any)
 * @param {Object} cfg - Molotov configuration
 * @param {Object} collections - Game collections (firePatches, etc.)
 * @param {Object} particles - Particle system
 */
export function handleMolotovShatter(m, hitEntity, cfg, collections, particles) {
  // Use cellular automata if available, otherwise fall back to FirePatch
  if (fireCA) {
    handleMolotovShatterCA(m, hitEntity, cfg, collections, particles);
  } else {
    handleMolotovShatterLegacy(m, hitEntity, cfg, collections, particles);
  }
}

/**
 * Cellular automata implementation of molotov shatter
 */
function handleMolotovShatterCA(m, hitEntity, cfg, collections, particles) {
  // Calculate impact radius based on config
  const baseRadius = Math.max(8, cfg.fireRadiusStart / 4);  // Scale down for pixel-perfect
  
  // Add oil splash pattern
  fireCA.addOilCircle(m.x, m.y, baseRadius * 0.8, 1.0);
  
  // Ignite the oil with some variation for organic spread
  const igniteRadius = baseRadius * 0.6;
  for (let i = 0; i < 3; i++) {
    const offsetX = (Math.random() - 0.5) * baseRadius;
    const offsetY = (Math.random() - 0.5) * baseRadius;
    fireCA.igniteCircle(m.x + offsetX, m.y + offsetY, igniteRadius * (0.7 + Math.random() * 0.3));
  }
  
  // Add initial heat burst for rapid ignition
  fireCA.addHeatCircle(m.x, m.y, baseRadius, 400);

  // Direct hit damage (same as before)
  if (hitEntity) {
    applyBurningStatus(hitEntity, cfg.burnDuration);
    if (typeof hitEntity.hp === 'number') {
      hitEntity.hp = Math.max(0, hitEntity.hp - (cfg.directHitBonus || 0));
      if (hitEntity.hp <= 0) {
        hitEntity.alive = false;
        hitEntity.state = 'dying';
      }
    }
    
    // Also ignite area around hit entity for spreading effect
    fireCA.igniteCircle(hitEntity.x + 8, hitEntity.y + 8, 12);
  }

  // Shatter particles (same as before)
  particles.spawnGlassBurst(m.x, m.y, 8);
}

/**
 * Legacy FirePatch implementation for backward compatibility
 */
function handleMolotovShatterLegacy(m, hitEntity, cfg, collections, particles) {
  // Fire patch
  const patch = createFirePatchAtImpact({ x: m.x, y: m.y }, {
    lifetimeMs: cfg.fireLifetime,
    fireRadiusStart: cfg.fireRadiusStart,
    fireRadiusEnd: cfg.fireRadiusEnd,
    fireTickIntervalMs: cfg.fireTickInterval,
    groundY: cfg.groundY,
  });
  collections.firePatches.push(patch);

  // Direct hit
  if (hitEntity) {
    applyBurningStatus(hitEntity, cfg.burnDuration);
    if (typeof hitEntity.hp === 'number') {
      hitEntity.hp = Math.max(0, hitEntity.hp - (cfg.directHitBonus || 0));
      if (hitEntity.hp <= 0) {
        hitEntity.alive = false;
        hitEntity.state = 'dying';
      }
    }
  }

  // Shatter particles
  particles.spawnGlassBurst(m.x, m.y, 8);
}

/**
 * Check if cellular automata system is active
 * @returns {boolean}
 */
export function isCAActive() {
  return fireCA !== null;
}

/**
 * Query CA system for damage at entity position
 * Used by game loop to replace FirePatch damage sampling
 * @param {Object} entity - Entity with x, y, w, h properties
 * @returns {number} Damage amount
 */
export function queryCADamage(entity) {
  if (!fireCA) return 0;
  
  const aabb = {
    x: entity.x,
    y: entity.y,
    w: entity.w || 16,
    h: entity.h || 16
  };
  
  const damageInfo = fireCA.queryDamageForAABB(aabb);
  return damageInfo.damage;
}

/**
 * Check if entity is in burning area (for burning status refresh)
 * @param {Object} entity 
 * @returns {boolean}
 */
export function isEntityInBurningArea(entity) {
  if (!fireCA) return false;
  
  // Check a few points around the entity
  const centerX = entity.x + (entity.w || 16) / 2;
  const centerY = entity.y + (entity.h || 16) / 2;
  
  return fireCA.queryBurningAt(centerX, centerY) ||
         fireCA.queryBurningAt(entity.x, entity.y) ||
         fireCA.queryBurningAt(entity.x + (entity.w || 16), entity.y) ||
         fireCA.queryBurningAt(entity.x, entity.y + (entity.h || 16)) ||
         fireCA.queryBurningAt(entity.x + (entity.w || 16), entity.y + (entity.h || 16));
}