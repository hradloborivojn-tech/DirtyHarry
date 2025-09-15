/**
 * FirePatch entity: burning area spawned by a shattered Molotov.
 *
 * Responsibilities:
 * - Handle fire lifetime, shrinking radius over time
 * - Periodic damage ticks to entities within radius
 * - Lightweight draw using radial gradients (pixel-art friendly)
 *
 * Integration:
 * - Keep an array of FirePatch instances in your orchestrator
 * - Call update(dt, world, applyBurn) each frame
 * - Call draw(ctx, cameraX, t) to render
 *
 * Coupling:
 * - No global reads; needs MOLOTOV-like config values passed in
 * - Damage application is delegated via a callback to avoid knowing entity shapes
 */

export class FirePatch {
  /**
   * @param {{x:number,y:number}} pos
   * @param {{
   *   lifetimeMs:number, radiusStart:number, radiusEnd:number, tickIntervalMs:number
   * }} cfg
   */
  constructor(pos, cfg) {
    this.x = pos.x;
    this.y = pos.y;
    this.maxLife = Math.max(1, cfg.lifetimeMs) / 1000;
    this.life = this.maxLife;
    this.radiusMax = cfg.radiusStart;
    this.radiusMin = cfg.radiusEnd;
    this.tickInterval = Math.max(16, cfg.tickIntervalMs);
    this.lastTick = performance.now();
    this.active = true;
    this._radius = this.radiusMax;
  }

  get radius() {
    return this._radius;
  }

  /**
   * @param {number} dt
   * @param {{
   *   candidates: Array<{x:number,y:number,w:number,h:number,alive?:boolean,state?:string,hp?:number}>,
   * }} world
   * @param {(ent:object)=>void} applyBurn callback: caller decides HP changes/status flags
   */
  update(dt, world, applyBurn) {
    if (!this.active) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.active = false;
      return;
    }

    // Shrink radius smoothly with remaining life
    const lifeRatio = Math.max(0, this.life / this.maxLife);
    this._radius = this.radiusMin + (this.radiusMax - this.radiusMin) * lifeRatio;

    // Damage tick
    const now = performance.now();
    if (now - this.lastTick >= this.tickInterval) {
      this.lastTick = now;
      // Damage entities in radius (circle check)
      if (Array.isArray(world.candidates)) {
        const r = this._radius;
        const cx = this.x + 8; // approximate center of patch
        const cy = this.y + 8;
        for (const e of world.candidates) {
          if (!e) continue;
          const dx = (e.x + (e.w ?? 16) / 2) - cx;
          const dy = (e.y + (e.h ?? 16) / 2) - cy;
          const dist2 = dx * dx + dy * dy;
          if (dist2 <= r * r) {
            applyBurn(e);
          }
        }
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cameraX
   * @param {number} t seconds
   */
  draw(ctx, cameraX, t) {
    if (!this.active) return;
    const fx = this.x - cameraX;
    const fy = this.y;
    const r = Math.max(2, this._radius);

    // Simple ring of flickering radial blobs
    const count = Math.max(3, Math.floor(r / 15));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + t * 2;
      const offsetX = Math.cos(angle) * (r * 0.6) * (0.7 + Math.sin(t * 3 + i) * 0.3);
      const offsetY = Math.sin(angle) * (r * 0.4) * (0.7 + Math.cos(t * 4 + i) * 0.3);

      const flameX = fx + offsetX;
      const flameY = fy + offsetY;

      const flicker = 0.8 + 0.2 * Math.sin(t * 8 + i * 2);
      const size = (3 + Math.sin(t * 6 + i) * 2) * flicker;

      ctx.globalAlpha = 0.8 * flicker * (this.life / this.maxLife);

      const gradient = ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, size);
      gradient.addColorStop(0, '#ffff00');
      gradient.addColorStop(0.4, '#ff7700');
      gradient.addColorStop(1, '#ff0000');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(flameX, flameY, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Factory for a new FirePatch on impact.
 * @param {{x:number,y:number}} impact
 * @param {{
 *   lifetimeMs:number, fireRadiusStart:number, fireRadiusEnd:number, fireTickIntervalMs:number, groundY:number
 * }} cfg
 * @returns {FirePatch}
 */
export function createFirePatchAtImpact(impact, cfg) {
  // Clamp to near ground (aesthetics)
  const y = Math.max(impact.y, (cfg.groundY ?? impact.y) - 10);
  return new FirePatch(
    { x: impact.x, y },
    {
      lifetimeMs: cfg.lifetimeMs,
      radiusStart: cfg.fireRadiusStart,
      radiusEnd: cfg.fireRadiusEnd,
      tickIntervalMs: cfg.fireTickIntervalMs,
    }
  );
}