/**
 * Glue for Molotov shatter: inject oil cells + heat into CA and handle direct hits.
 * 
 * Replaces the old FirePatch system with cellular automata-based fire simulation.
 */
import { applyBurningStatus } from '../status/burning.js';

export function handleMolotovShatter(m, hitEntity, cfg, collections, particles, fireCA, entityPixelManager) {
  // Calculate impact parameters
  const impactX = m.x;
  const impactY = Math.max(m.y, (cfg.groundY ?? m.y) - 10); // Clamp to ground level
  const oilRadius = cfg.fireRadiusStart * 0.8; // Oil spreads slightly less than fire radius
  const heatRadius = cfg.fireRadiusStart;
  
  // Inject oil into CA
  if (fireCA) {
    fireCA.addOilCircle(impactX, impactY, oilRadius, 1.0);
    
    // Add initial heat to start combustion
    fireCA.addHeatCircle(impactX, impactY, heatRadius * 0.5, 300);
    
    // Ignite the oil immediately
    fireCA.igniteCircle(impactX, impactY, heatRadius * 0.3);
  }

  // Direct hit on entity - ignite entity pixels and apply immediate damage
  if (hitEntity && entityPixelManager) {
    // Apply direct damage bonus
    if (typeof hitEntity.hp === 'number') {
      hitEntity.hp = Math.max(0, hitEntity.hp - (cfg.directHitBonus || 0));
      if (hitEntity.hp <= 0) {
        hitEntity.alive = false;
        hitEntity.state = 'dying';
      }
    }
    
    // Apply burning status (for visual feedback and panic behavior)
    applyBurningStatus(hitEntity, cfg.burnDuration);
    
    // Ignite entity pixels around hit area
    const hitAABB = {
      x: impactX - 8,
      y: impactY - 8, 
      w: 16,
      h: 16
    };
    entityPixelManager.forceIgniteAABB(hitAABB);
  }

  // Shatter particles (unchanged)
  particles.spawnGlassBurst(m.x, m.y, 8);
  
  // Add oil splash particles for visual feedback
  particles.spawnOilSplash(impactX, impactY, oilRadius);
}