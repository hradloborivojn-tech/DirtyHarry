/**
 * Molotov projectile entity and utilities.
 *
 * Responsibilities:
 * - Define the Molotov projectile record/class
 * - Update physics (gravity, rotation), detect collisions
 * - Report shatter events to the caller so they can spawn FirePatch
 * - Draw a simple pixel-bottle with a burning rag
 *
 * Integration:
 * - The game orchestrator should keep an array of projectiles and call:
 *   - update(dt, world) on each
 *   - draw(ctx, cameraX, nowMs) each frame
 * - On shatter, remove the projectile and create a FirePatch (see fire_patch.js)
 *
 * Zero-coupling notes:
 * - No global reads; all constants are provided via the config passed to constructor/update()
 * - No direct access to other systems; shatter event is returned to the caller
 */

/**
 * @typedef {Object} MolotovConfig
 * @property {number} gravity        // px/s^2
 * @property {number} spinSpeed      // base spin speed rad/s (sign picked externally)
 * @property {number} groundY        // world Y of ground
 */

export class MolotovProjectile {
  /**
   * @param {{x:number,y:number}} pos
   * @param {{vx:number, vy:number}} vel
   * @param {number} rotationSpeed    // rad/s (can be negative)
   * @param {MolotovConfig} cfg
   */
  constructor(pos, vel, rotationSpeed, cfg) {
    this.x = pos.x;
    this.y = pos.y;
    this.vx = vel.vx;
    this.vy = vel.vy;
    this.rotation = 0;
    this.rotationSpeed = rotationSpeed;
    this.life = 5.0; // seconds max flight
    this.active = true;
    this.cfg = cfg;
  }

  /**
   * Step physics and detect collisions.
   * @param {number} dt
   * @param {{
   *   goons?: Array<{x:number,y:number,w:number,h:number,alive?:boolean,state?:string}>,
   *   npcs?:  Array<{x:number,y:number,w:number,h:number,state?:string}>,
   *   aabb: (a:{x:number,y:number,w:number,h:number}, b:{x:number,y:number,w:number,h:number}) => boolean
   * }} world
   * @returns {{shatter:boolean, hitEntity?:object}|null} if shatters this frame
   */
  update(dt, world) {
    if (!this.active) return null;

    // Gravity
    this.vy += this.cfg.gravity * dt;

    // Integrate
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Spin
    this.rotation += this.rotationSpeed * dt;

    // Lifetime
    this.life -= dt;
    if (this.life <= 0 || this.x < -10000 || this.x > 100000) {
      this.active = false;
      return null;
    }

    // Collision: ground
    if (this.y >= this.cfg.groundY - 4) {
      this.active = false;
      return { shatter: true };
    }

    // Collision: entities
    const mBox = { x: this.x - 2, y: this.y - 2, w: 4, h: 4 };
    if (Array.isArray(world.goons)) {
      for (const g of world.goons) {
        if (!g || g.alive === false || g.state === 'dead') continue;
        const gBox = { x: g.x, y: g.y, w: g.w ?? 16, h: g.h ?? 16 };
        if (world.aabb(gBox, mBox)) {
          this.active = false;
          return { shatter: true, hitEntity: g };
        }
      }
    }
    if (Array.isArray(world.npcs)) {
      for (const n of world.npcs) {
        if (!n || n.state === 'down') continue;
        const nBox = { x: n.x, y: n.y, w: n.w ?? 16, h: n.h ?? 16 };
        if (world.aabb(nBox, mBox)) {
          this.active = false;
          return { shatter: true, hitEntity: n };
        }
      }
    }

    return null;
  }

  /**
   * Simple pixel-art bottle render. Kept intentionally tiny to match 16px characters.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cameraX
   * @param {number} nowMs A timestamp (performance.now()) to drive flicker
   */
  draw(ctx, cameraX, nowMs = performance.now()) {
    if (!this.active) return;
    const mx = this.x - cameraX;
    const my = this.y;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(this.rotation);

    // Bottle
    ctx.fillStyle = '#2a4a2a'; // dark green
    ctx.fillRect(-2, -3, 4, 6);

    // Rag
    ctx.fillStyle = '#f5f5dc';
    ctx.fillRect(-1, -4, 2, 2);

    // Wick flame
    const flicker = 0.8 + 0.2 * Math.sin(nowMs * 0.02);
    ctx.globalAlpha = flicker;
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(0, -4, 1, 1);

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/**
 * Helper to construct a projectile from player state and config.
 * @param {{x:number,y:number,dir:1|-1,charge:number}} shooter
 * @param {{
 *   minForce:number, maxForce:number, gravity:number, spinSpeed:number, groundY:number
 * }} cfg
 * @returns {MolotovProjectile}
 */
export function createMolotovFromShooter(shooter, cfg) {
  const force = cfg.minForce + (cfg.maxForce - cfg.minForce) * (shooter.charge ?? 0);
  const angle = -Math.PI / 4; // 45° up
  const vx = Math.cos(angle) * force * shooter.dir;
  const vy = Math.sin(angle) * force;

  const throwX = shooter.dir === 1 ? shooter.x + 16 : shooter.x - 4;
  const throwY = shooter.y + 8;

  const spin = cfg.spinSpeed * (Math.random() > 0.5 ? 1 : -1);
  return new MolotovProjectile({ x: throwX, y: throwY }, { vx, vy }, spin, {
    gravity: cfg.gravity,
    spinSpeed: cfg.spinSpeed,
    groundY: cfg.groundY,
  });
}