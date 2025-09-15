/**
 * Particle system with simple pooling for common effects.
 * Types: 'smoke', 'blood', 'bloodPool', 'spark', 'glass', 'muzzle', 'flame', 'fuelPool', 'scorch'
 *
 * Render separation: expose drawBack() and drawFront() so orchestrator can order properly.
 */
import { COLORS, GROUND_Y } from '../core/constants.js';

export class Particles {
  constructor(rng) {
    this.rng = rng;
    this.list = [];
  }

  spawnFlames(x, y, count = 16, power = 1, radius = 6) {
    // Turbulent flame pixels with upward buoyancy and curl-like drift
    for (let i = 0; i < count; i++) {
      const ang = (this.rng() * Math.PI * 2);
      const r = this.rng() * radius;
      const ox = Math.cos(ang) * r;
      const oy = Math.sin(ang) * r * 0.5; // flatter disk
      const up = 40 + this.rng() * 60 * power;
      this.list.push({
        type: 'flame',
        x: x + ox, y: y + oy,
        vx: (this.rng() - 0.5) * 20,
        vy: -up,
        life: 0.35 + this.rng() * 0.4,
        seed: (this.rng() * 1000) | 0,
        power
      });
    }
  }

  spawnSmoke(x, y, dir = 1) {
    for (let i = 0; i < 6; i++) {
      this.list.push({
        type: 'smoke', x: x + (this.rng()-0.5)*2, y: y + (this.rng()-0.5)*2,
        vx: (this.rng()-0.5)*10 + dir*5, vy: -10 - this.rng()*8, life: 0.8 + this.rng()*0.6
      });
    }
  }

  spawnBlood(x, y) {
    for (let i = 0; i < 8; i++) {
      this.list.push({ type: 'blood', x, y, vx: (this.rng()-0.5)*30, vy: -this.rng()*40, life: 0.6 + this.rng()*0.4 });
    }
  }

  spawnBloodPool(x, y, maxR = 10) {
    // downward-only pixel-art pool with drips
    const seed = (Math.floor(this.rng()*1e9) >>> 0);
    const streamCount = 2 + Math.floor(this.rng()*4);
    const streams = [];
    for (let i = 0; i < streamCount; i++) {
      const dx = -maxR + 2 + Math.floor(this.rng() * (maxR*2 - 3));
      const lenMax = 3 + Math.floor(this.rng() * Math.max(4, maxR * 0.8));
      const thick = this.rng() < 0.35 ? 2 : 1;
      streams.push({ dx, lenMax, thick });
    }
    this.list.push({ type: 'bloodPool', x, y, r: 1, maxR, grow: 10 + this.rng()*10, life: 9999, seed, streams });
  }

  spawnSparks(x, y, dir, count = 6, power = 1) {
    for (let i=0;i<count;i++) {
      const ang = (this.rng()*0.4 - 0.2) + (dir>0?0:Math.PI);
      const spd = 120 + this.rng()*100 * power;
      this.list.push({ type: 'spark', x, y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd*0.3, life: 0.15 + this.rng()*0.1 });
    }
  }

  spawnFuelPool(x, y, maxR = 10) {
    const seed = (Math.floor(this.rng()*1e9) >>> 0);
    this.list.push({ type: 'fuelPool', x, y, r: 1, maxR, grow: 24 + this.rng()*16, life: 2.2 + this.rng()*0.6, seed });
  }

  spawnScorch(x, y, maxR = 12) {
    const seed = (Math.floor(this.rng()*1e9) >>> 0);
    this.list.push({ type: 'scorch', x, y, r: 1, maxR, grow: 18 + this.rng()*10, life: 9999, seed, build: 0 });
  }

  spawnGlassBurst(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      this.list.push({ type: 'glass', x, y, vx: (this.rng() - 0.5) * 60, vy: -this.rng() * 40, life: 0.5 + this.rng() * 0.3 });
    }
  }

  spawnMuzzle(x, y, dir, power = 1) {
    this.list.push({ type: 'muzzle', x, y, dir, life: 0.08, power: Math.max(1.0, power) });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.type !== 'bloodPool') p.life -= dt;
      if (p.type === 'smoke') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 6 * dt;
      } else if (p.type === 'flame') {
        // Turbulent buoyancy: curl-ish field using sines of position and time
        const t = performance.now() * 0.001;
        const nx = (p.x + p.seed * 0.13) * 0.08;
        const ny = (p.y + p.seed * 0.27) * 0.08;
        const ax = Math.sin(ny + t * 4.0) * 40 * dt * p.power;
        const ay = -80 * dt * p.power + Math.cos(nx - t * 5.0) * 20 * dt;
        p.vx += ax; p.vy += ay;
        p.vx *= 0.96; p.vy *= 0.96;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.type === 'blood') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt;
      } else if (p.type === 'bloodPool') {
        p.r = Math.min(p.maxR, p.r + p.grow * dt);
      } else if (p.type === 'fuelPool') {
        p.r = Math.min(p.maxR, p.r + p.grow * dt);
      } else if (p.type === 'scorch') {
        p.r = Math.min(p.maxR, p.r + p.grow * dt);
        p.build = Math.min(1, (p.build || 0) + dt * 0.5);
      } else if (p.type === 'spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 200 * dt;
        p.vx *= 0.92; p.vy *= 0.92;
      } else if (p.type === 'glass') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 120 * dt;
        p.vx *= 0.95; p.vy *= 0.95;
      }
      if (p.life <= 0) this.list.splice(i, 1);
    }
  }

  drawBack(ctx, cameraX, COLORS_EXT = COLORS) {
    for (const p of this.list) {
      if (p.type === 'smoke') {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = COLORS_EXT.smoke;
        ctx.beginPath();
        ctx.arc(p.x - cameraX, p.y, 2 + (1-p.life)*3, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.type === 'flame') {
        // soft additive-like look by layering two tiny quads with alpha
        const a = Math.max(0, Math.min(1, p.life * 2));
        const flick = 0.7 + 0.3 * Math.sin((performance.now()*0.02) + p.seed);
        ctx.globalAlpha = a * 0.9 * flick;
        ctx.fillStyle = '#ff7a2a';
        ctx.fillRect(Math.round(p.x - cameraX), Math.round(p.y), 1, 1);
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = '#ffd37f';
        ctx.fillRect(Math.round(p.x - cameraX), Math.round(p.y - 1), 1, 1);
        ctx.globalAlpha = 1;
      }
      if (p.type === 'bloodPool') {
        const r = Math.max(0, Math.floor(p.r));
        if (r > 0) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = COLORS_EXT.blood;
          const cx = Math.floor(p.x - cameraX);
          const cy = Math.floor(p.y);
          const seed = (p.seed >>> 0) || 0x9e3779b1;
          const jitter = (dx) => {
            let h = (dx * 73856093) ^ seed;
            h ^= h >>> 13; h = (h * 1274126177) >>> 0; h ^= h >>> 16;
            return (h % 3) - 1;
          };
          for (let dx = -r; dx <= r; dx++) {
            const centerFalloff = Math.max(0, r - Math.abs(dx));
            let th = 1 + Math.floor(centerFalloff / 3) + jitter(dx);
            if (dx === 0) th += 1;
            th = Math.max(1, th);
            ctx.fillRect(cx + dx, cy, 1, th);
            if ((dx + seed) % 5 === 0 && th > 2) ctx.fillRect(cx + dx, cy + th, 1, 1);
          }
          const streams = Array.isArray(p.streams) ? p.streams : [];
          for (const s of streams) {
            const dx = Math.max(-r, Math.min(r, s.dx));
            const len = Math.min(s.lenMax, Math.floor(r * 0.9));
            if (len > 0) ctx.fillRect(cx + dx, cy + 2, s.thick || 1, len);
            if (len > 3) ctx.fillRect(cx + dx + (s.thick===2?1:0), cy + len, 1, 1);
          }
          ctx.globalAlpha = 1;
        }
      }
      if (p.type === 'fuelPool') {
        const r = Math.max(0, Math.floor(p.r));
        if (r > 0) {
          ctx.globalAlpha = Math.max(0.3, Math.min(0.85, p.life / 2.2));
          ctx.fillStyle = '#5a3a1a';
          const cx = Math.floor(p.x - cameraX);
          const cy = Math.floor(p.y);
          const seed = (p.seed >>> 0) || 0x9e3779b1;
          const jitter = (dx) => {
            let h = (dx * 2654435761) ^ seed;
            h ^= h >>> 13; h = (h * 2246822519) >>> 0; h ^= h >>> 16;
            return (h % 3) - 1;
          };
          for (let dx = -r; dx <= r; dx++) {
            const centerFalloff = Math.max(0, r - Math.abs(dx));
            let th = 1 + Math.floor(centerFalloff / 4) + jitter(dx);
            th = Math.max(1, th);
            ctx.fillRect(cx + dx, cy, 1, th);
          }
          ctx.globalAlpha = 1;
        }
      }
      if (p.type === 'scorch') {
        const r = Math.max(0, Math.floor(p.r));
        if (r > 0) {
          ctx.globalAlpha = 0.22 + 0.28 * (p.build || 0);
          ctx.fillStyle = '#181410';
          const cx = Math.floor(p.x - cameraX);
          const cy = Math.floor(p.y);
          const seed = (p.seed >>> 0) || 0x85ebca6b;
          const jitter = (dx) => {
            let h = (dx * 1402946737) ^ seed;
            h ^= h >>> 13; h = (h * 1597334677) >>> 0; h ^= h >>> 16;
            return (h % 2); // 0 or 1 sparseness
          };
          for (let dx = -r; dx <= r; dx++) {
            const centerFalloff = Math.max(0, r - Math.abs(dx));
            let th = Math.max(1, Math.floor(centerFalloff / 4));
            th += jitter(dx);
            ctx.fillRect(cx + dx, cy, 1, th);
          }
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  drawFront(ctx, cameraX, COLORS_EXT = COLORS, t = 0, drawMuzzleFlash) {
    // muzzle flashes
    let activeFlash = false;
    for (const p of this.list) {
      if (p.type === 'muzzle') {
        activeFlash = true;
        if (drawMuzzleFlash) {
          drawMuzzleFlash(ctx, p.x - cameraX, p.y, p.dir, Math.max(1, Math.min(3.5, p.power || 1)), t);
        }
      }
    }
    if (activeFlash) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 192, 108);
      ctx.restore();
    }

    for (const p of this.list) {
      if (p.type === 'blood') {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = COLORS_EXT.blood;
        ctx.fillRect(p.x - cameraX, p.y, 1, 1);
        ctx.globalAlpha = 1;
      }
      if (p.type === 'spark') {
        ctx.fillStyle = '#ffd37f';
        ctx.fillRect(Math.round(p.x - cameraX), Math.round(p.y), 1, 1);
      }
      if (p.type === 'glass') {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = '#e6e6fa';
        ctx.fillRect(Math.round(p.x - cameraX), Math.round(p.y), 1, 1);
        ctx.globalAlpha = 1;
      }
    }
  }
}