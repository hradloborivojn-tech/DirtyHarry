/**
 * Particle system with simple pooling for common effects.
 * Types: 'smoke', 'blood', 'bloodPool', 'spark', 'glass', 'muzzle'
 *
 * Render separation: expose drawBack() and drawFront() so orchestrator can order properly.
 */
import { COLORS, GROUND_Y } from '../core/constants.js';

export class Particles {
  constructor(rng) {
    this.rng = rng;
    this.list = [];
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
      } else if (p.type === 'blood') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt;
      } else if (p.type === 'bloodPool') {
        p.r = Math.min(p.maxR, p.r + p.grow * dt);
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