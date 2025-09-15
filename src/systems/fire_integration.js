// Bridges Molotovs, environment, and per-entity pixel burning.
import { VW, VH, WORLD_W, GROUND_Y } from '../core/constants.js';
import { FireEngine } from '../sim/engine.js';
import { Materials as Mat, MaterialProps } from '../sim/materials.js';
import { EntityFireAgent } from '../sim/entity_fire_agent.js';
import { makeGoonMask, makeNPCMask, makePlayerMask } from '../entities/material_masks.js';
import { applyBurningStatus } from '../status/burning.js';

class FireSystem {
  constructor() {
    // World grid matched to the game world pixel space
    this.engine = new FireEngine(WORLD_W, VH);
    this.agents = new Map(); // entity -> agent
    // Keep environment fire debug OFF by default to avoid scene-wide glow.
  this.showEnv = false;     // toggleable draw; use window.__DH.toggleFireEnvDebug()
  }

  ensureAgent(entity, kind = 'npc') {
    if (this.agents.has(entity)) return this.agents.get(entity);
    const { mask, w, h } =
      kind === 'goon' ? makeGoonMask()
      : kind === 'player' ? makePlayerMask()
      : makeNPCMask();
    const agent = new EntityFireAgent(entity, mask, w, h);
    this.agents.set(entity, agent);
    entity.fireAgent = agent;
    return agent;
  }

  removeAgent(entity) {
    if (this.agents.has(entity)) {
      this.agents.delete(entity);
      if (entity.fireAgent) delete entity.fireAgent;
    }
  }

  depositFuelCircle(cx, cy, radius, temp = 600, igniteChance = 0.7) {
    const g = this.engine.grid;
    const r2 = radius * radius;
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!g.inBounds(x, y)) continue;
        const dx = x - cx, dy = y - cy;
        if (dx*dx + dy*dy > r2) continue;
        const i = g.index(x, y);
        if (g.material[i] === Mat.AIR || g.material[i] === Mat.SMOKE || g.material[i] === Mat.STEAM) {
          g.material[i] = Mat.FUEL;
          g.fuel[i] = 1.0;
          g.temp[i] = Math.max(g.temp[i], temp);
          g.burning[i] = Math.random() < igniteChance ? 1 : 0;
        }
      }
    }
  }

  shatterMolotovAt(x, y) {
    // Glass shards (inert for sim; optional visuals via particles handled elsewhere)
    const g = this.engine.grid;
    const R = 5;
    for (let yy = y - R; yy <= y + R; yy++) {
      for (let xx = x - R; xx <= x + R; xx++) {
        if (!g.inBounds(xx, yy)) continue;
        if (Math.random() < 0.08) g.material[g.index(xx, yy)] = Mat.GLASS;
      }
    }
    // Main pool at impact
    this.depositFuelCircle(x, y, 14, 630, 0.9);

    // Thin fuel film on surfaces around impact: project a small set of rays downward
    // and sideways to "paint" a 1px fuel layer where a surface exists.
    const paintFuelOnSurface = (sx, sy, dx, dy, steps, temp=580) => {
      let px = sx, py = sy;
      for (let i = 0; i < steps; i++) {
        const nx = Math.round(px), ny = Math.round(py);
        if (!g.inBounds(nx, ny)) break;
        const belowY = ny + 1;
        if (belowY < g.h) {
          const bi = g.index(nx, belowY);
          if (g.material[bi] !== Mat.AIR) {
            const ii = g.index(nx, ny);
            if (g.material[ii] === Mat.AIR || g.material[ii] === Mat.SMOKE) {
              g.material[ii] = Mat.FUEL;
              g.fuel[ii] = Math.max(g.fuel[ii], 0.5);
              g.temp[ii] = Math.max(g.temp[ii], temp);
              if (Math.random() < 0.5) g.burning[ii] = 1;
            }
          }
        }
        px += dx; py += dy;
      }
    };
    // Downward streaks (drips)
    for (let i = 0; i < 6; i++) paintFuelOnSurface(x + (Math.random()-0.5)*10, y, (Math.random()-0.5)*0.3, 1, 14);
    // Side streaks to wet nearby legs/boots
    for (let i = 0; i < 4; i++) paintFuelOnSurface(x + (Math.random()-0.5)*10, y+2, (Math.random()<0.5?-1:1), 0.3, 8);

    // Create a short vertical "splash/drip" trail downward to emulate spilled fuel
    const bottom = Math.min(GROUND_Y - 2, y + 24);
    for (let yy = y + 4; yy <= bottom; yy += 3) {
      const jitter = (Math.random() - 0.5) * 4;
      this.depositFuelCircle(x + (jitter|0), yy, 3 + (Math.random() < 0.5 ? 1 : 0), 600, 0.6);
    }
  }

  // Ignite an entity's per-pixel fire agent near the impact point
  igniteEntity(entity, impactX, impactY, kind = 'npc', strength = 1.0) {
    const agent = this.ensureAgent(entity, kind);
    const w = agent.w, h = agent.h;
    const lx = Math.max(0, Math.min(w - 1, Math.floor((impactX|0) - Math.floor(entity.x))));
    const ly = Math.max(0, Math.min(h - 1, Math.floor((impactY|0) - Math.floor(entity.y))));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const mat = agent.mask[i];
        const p = MaterialProps[mat] || {};
        if (!p || (p.flammability || 0) <= 0) continue;
        const dx = x - lx, dy = y - ly;
        const falloff = Math.exp(-(dx*dx + dy*dy) / 18); // ~radius 4-5 px core
        let base = 0.0;
        if (mat === Mat.CLOTH) base = 0.85;
        else if (mat === Mat.HAIR) base = 0.9;
        else if (mat === Mat.SKIN) base = 0.25;
        const chance = base * (0.35 + 0.65 * falloff) * strength;
        if (Math.random() < chance) {
          agent.burning[i] = 1;
          agent.temp[i] = Math.max(agent.temp[i], 660);
          const cap = Math.min(1, p.fuelCapacity || 0.4);
          agent.fuel[i] = Math.max(agent.fuel[i], cap * (0.6 + Math.random()*0.4));
        } else {
          // still heat up some pixels so they may ignite from neighbors shortly
          agent.temp[i] = Math.max(agent.temp[i], 560 * falloff);
        }
      }
    }

    // Also splash a bit of fuel around the entity position to couple with environment
    this.depositFuelCircle(Math.round(entity.x + w/2), Math.round(entity.y + h/2), 6, 610, 0.5);
  }

  step(dt, world) {
    // Step environment
    this.engine.step(dt);

    // Maintain/step entity agents and couple with environment
    const { goons = [], npcs = [], player = null } = world || {};
    for (const g of goons) if (g.alive) this.ensureAgent(g, 'goon');
    for (const n of npcs) if (n.state !== 'down' && n.state !== 'dying') this.ensureAgent(n, 'npc');
    if (player && player.alive) this.ensureAgent(player, 'player');

    for (const [ent, agent] of this.agents) {
      // Keep stepping even when dying/down so flames follow the body pose
      const ex = Math.floor(ent.x), ey = Math.floor(ent.y);
      agent.step(dt, this.engine.grid, ex, ey);
      ent.burning = ent.burning || agent.e.burning;
      ent.burnIntensity = agent.e.burnIntensity || 0;
      // Flame particles around burning entity (subtle)
      if (ent.burnIntensity > 0.05 && world?.particles?.spawnFlames) {
        if ((Math.random() < 0.4)) {
          world.particles.spawnFlames(Math.round(ent.x + 8), Math.round(ent.y + 6), 3, Math.min(1, ent.burnIntensity * 1.2), 3);
        }
      }
      // When down or dying, keep dropping a tiny warm fuel halo at the body position
      if ((ent.state === 'down' || ent.state === 'dying') && ent.burnIntensity > 0.02) {
        this.depositFuelCircle(Math.round(ent.x + 8), Math.round(ent.y + 12), 1, 560, 0.4);
      }
    }

    // Contact ignition propagation + environmental drip
    const entities = [
      ...goons.filter(g => g.alive),
      ...npcs.filter(n => n.state !== 'down' && n.state !== 'dying'),
      ...(player && player.alive ? [player] : []),
    ];

    // Ignite entities that step into burning ground spillage
    {
      const g = this.engine.grid;
      const sampleFeetAndIgnite = (ent) => {
        const w = ent.w || 16, h = ent.h || 16;
        const footY = Math.floor(ent.y + h - 1);
        const xs = [ Math.floor(ent.x + 4), Math.floor(ent.x + (w>>1)), Math.floor(ent.x + w - 4) ];
        let onFire = false;
        for (const sx of xs) {
          // Check the foot and one pixel below (puddle thickness)
          for (const sy of [footY, footY + 1]) {
            if (!g.inBounds(sx, sy)) continue;
            if (g.burning[g.index(sx, sy)]) { onFire = true; break; }
          }
          if (onFire) break;
        }
        if (onFire) {
          ent._envIgniteCool = Math.max(0, (ent._envIgniteCool || 0) - dt);
          if (!ent._envIgniteCool || ent._envIgniteCool <= 0) {
            this.igniteEntity(ent, Math.round(ent.x + w/2), Math.round(ent.y + h/2), undefined, 0.9);
            applyBurningStatus?.(ent, 2600);
            ent._envIgniteCool = 0.25; // 250ms between environmental ignitions
          }
        } else if (ent._envIgniteCool) {
          ent._envIgniteCool = Math.max(0, ent._envIgniteCool - dt);
        }
      };
      for (const e of entities) sampleFeetAndIgnite(e);
    }
    // Small heat/fuel deposit under burning entities and ignite others on touch
    for (let i = 0; i < entities.length; i++) {
      const a = entities[i];
      const aAgent = a.fireAgent;
      const aBurn = aAgent ? (aAgent.e.burnIntensity || 0) : 0;
      if (aBurn > 0.04) {
        // Drip/heat footprint
        this.depositFuelCircle(Math.round(a.x + (aAgent?.w||16)/2), Math.round(a.y + (aAgent?.h||16)/2), 2, 590, 0.25);
        a._fireTouchCool = Math.max(0, (a._fireTouchCool || 0) - dt);
        for (let j = i + 1; j < entities.length; j++) {
          const b = entities[j];
          const ax=a.x, ay=a.y, bx=b.x, by=b.y;
          // AABB overlap test (16x16 default)
          if (ax > bx + 15 || bx > ax + 15 || ay > by + 15 || by > ay + 15) continue;
          // If touching and cooldown allows, ignite B
          if ((a._fireTouchCool || 0) <= 0) {
            this.igniteEntity(b, Math.round(bx + 8), Math.round(by + 8), undefined, Math.min(1, 0.5 + aBurn));
            applyBurningStatus?.(b, 2500);
            a._fireTouchCool = 0.15; // 150ms cooldown between spreads
          }
        }
      } else if (a._fireTouchCool) {
        a._fireTouchCool = Math.max(0, a._fireTouchCool - dt);
      }
    }
  }

  draw(ctx, cameraX) {
    if (!this.showEnv) return;
    const g = this.engine.grid;
    ctx.save();
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = g.index(x, y);
        if (!g.burning[i]) continue; // show flames only in debug
        const px = x - cameraX; if (px < -1 || px >= VW + 1) continue;
        const hot = Math.max(0, Math.min(1, (g.temp[i] - 340) / 300));
        const alpha = 0.5 * hot;
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff7a2a';
        ctx.fillRect(px, y, 1, 1);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export const fireSystem = new FireSystem();

// Called by game.js when a molotov shatters
export function handleMolotovShatter(projectile, hitEntity, config, { firePatches }, particles) {
  const x = Math.round(projectile.x), y = Math.round(projectile.y);
  fireSystem.shatterMolotovAt(x, y);

  // Direct-hit: immediately ignite the struck entity if present
  if (hitEntity) {
    fireSystem.igniteEntity(hitEntity, x, y, 'npc', 1.0);
    // Ensure behavioral panic immediately
    applyBurningStatus(hitEntity, config.burnDuration || 4000);
  }

  // Keep a lightweight patch for existing loop; it deposits heat and steps fire to ensure coupling if the game doesn't call fireSystem.step elsewhere.
  // If we shattered on ground (no entity), keep flame short (2–3s) and leave a scorch mark.
  const groundOnly = !hitEntity;
  if (groundOnly) {
    // Visual puddle and scorch decal
    const baseR = 10 + Math.floor(Math.random()*6);
    particles?.spawnFuelPool?.(x, GROUND_Y - 1, baseR);
    if (Math.random() < 0.5) particles?.spawnFuelPool?.(x + (Math.random()<0.5?-1:1)*(4+Math.random()*4), GROUND_Y - 1, Math.max(6, baseR-3));
    particles?.spawnScorch?.(x, GROUND_Y - 1, baseR + 2);
  }
  const lifeMs = groundOnly ? (2200 + Math.floor(Math.random()*800)) : (config.fireLifetime || 5000);
  const tickMs = Math.max(120, config.fireTickInterval || 500);
  const patch = {
    active: true,
    t: 0,
    tickAcc: 0,
    x, y,
    r0: config.fireRadiusStart || 60,
    r1: config.fireRadiusEnd || 40,
    update(dt, { candidates }, damageCb) {
      if (!this.active) return;
      this.t += dt * 1000;
      this.tickAcc += dt * 1000;
      const k = Math.min(1, this.t / lifeMs);
      const radius = Math.round(this.r0 * (1 - k) + this.r1 * k);

      // Deposit some fuel/heat to maintain spread (global step happens elsewhere)
      fireSystem.depositFuelCircle(this.x, this.y, Math.max(6, Math.floor(radius * 0.25)), 580, 0.2);
      // Also paint a thin film around the shrinking ring to cover surfaces briefly
      if (Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2;
        const rx = this.x + Math.cos(a) * radius * 0.6;
        const ry = this.y + Math.sin(a) * radius * 0.3;
        const g = fireSystem.engine.grid;
        const nx = Math.round(rx), ny = Math.round(ry);
        if (g.inBounds(nx, ny)) {
          const bi = g.index(nx, ny + 1);
          if (ny + 1 < g.h && g.material[bi] !== Mat.AIR) {
            const ii = g.index(nx, ny);
            g.material[ii] = Mat.FUEL; g.fuel[ii] = Math.max(g.fuel[ii], 0.4); g.temp[ii] = Math.max(g.temp[ii], 560);
            if (Math.random() < 0.6) g.burning[ii] = 1;
          }
        }
      }

      // Fire visuals while the patch is alive
      if (particles && Math.random() < 0.5) {
        const fx = this.x + (Math.random()-0.5) * Math.max(6, radius*0.2);
        const fy = this.y - 1 + (Math.random()-0.5) * 4;
        particles.spawnFlames?.(fx|0, fy|0, 2 + (groundOnly?2:0), groundOnly ? 0.8 : 1.0, 3 + (groundOnly?1:0));
        if (Math.random() < 0.15) particles.spawnSmoke?.(fx|0, fy|0, 1);
      }

      // Damage ticked, not every frame, to avoid instant kill
      const doTick = this.tickAcc >= tickMs;
      if (doTick) this.tickAcc = 0;
      // Burning entities inside patch cause damage ticks
      for (const ent of candidates) {
        const agent = ent.fireAgent;
        if (!agent) continue;
        const ex = (ent.x + 8) - this.x;
        const ey = (ent.y + 8) - this.y;
        const dist = Math.hypot(ex, ey);
        if (dist <= radius) {
          if (doTick && agent.e.burnIntensity > 0.02) damageCb?.(ent);
        }
      }

      if (this.t >= lifeMs) this.active = false;
    },
    draw() { /* visual handled by overlays or env debug */ },
  };
  firePatches.push(patch);

  // Particles: use available helpers (no-ops if system absent)
  particles?.spawnGlassBurst?.(x, y);
  particles?.spawnSparks?.(x, y, 1, 10, 1.2);
  particles?.spawnSmoke?.(x, y, 1);
  // Initial flame burst; keep it smaller if ground-only
  particles?.spawnFlames?.(x, y, groundOnly ? 12 : 22, groundOnly ? 0.9 : 1.2, groundOnly ? 6 : 8);
}