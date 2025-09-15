/**
 * Glue for Molotov shatter: spawn FirePatch and apply direct-hit damage + burning.
 */
import { createFirePatchAtImpact } from '../weapons/fire_patch.js';
import { applyBurningStatus } from '../status/burning.js';

export function handleMolotovShatter(m, hitEntity, cfg, collections, particles) {
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