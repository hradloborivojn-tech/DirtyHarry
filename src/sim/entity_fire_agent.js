import { Materials as Mat, MaterialProps } from './materials.js';
import { tryIgnite, combust } from './reactions.js';

// Per-entity per-pixel fire/heat simulation.
// width/height should match your sprite granularity (16x16 in this game).
export class EntityFireAgent {
  constructor(entity, mask, width = 16, height = 16) {
    this.e = entity;
    this.w = width; this.h = height;
    // mask: Uint8Array of size w*h with Materials indices (CLOTH, SKIN, HAIR, BONE)
    this.mask = mask;
    const n = width * height;
    this.temp = new Float32Array(n);
    this.fuel = new Float32Array(n);
    this.burning = new Uint8Array(n);
    this.heatInjury = 0; // accumulative
    this._init();
  }

  _init() {
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const mat = this.mask[i];
      const p = MaterialProps[mat] || {};
      this.temp[i] = 310; // body temp baseline
      this.fuel[i] = p.fuelCapacity || 0;
      this.burning[i] = 0;
    }
  }

  // Interface heat exchange with environment grid cell (xw, yw)
  exchangeWithEnvironment(env, xw, yw, localIndex) {
    if (!env.inBounds(xw, yw)) return;
    const gi = env.index(xw, yw);
    const matA = this.mask[localIndex];
    const matB = env.material[gi];
    const pA = MaterialProps[matA] || {};
    const pB = MaterialProps[matB] || {};
    const k = Math.min(1, ((pA.conductivity || 0) + (pB.conductivity || 0)) * 0.6);
    const dT = this.temp[localIndex] - env.temp[gi];
    const ca = Math.max(0.1, pA.heatCapacity || 1), cb = Math.max(0.1, pB.heatCapacity || 1);
    const flow = dT * k * 0.35; // stronger coupling for entity contact
    this.temp[localIndex] -= flow / ca;
    env.temp[gi] += flow / cb;

    // If burning cell adjacent to AIR, bleed smoke into env
    if (this.burning[localIndex] && env.material[gi] === Mat.AIR && Math.random() < 0.2) {
      env.material[gi] = Mat.SMOKE;
      env.temp[gi] = Math.max(env.temp[gi], 330);
    }
    // If burning over FUEL or AIR, attempt to ignite/heat it
    if (this.burning[localIndex]) {
      if (env.material[gi] === Mat.FUEL) {
        env.burning[gi] = 1;
        env.temp[gi] = Math.max(env.temp[gi], 620);
      } else if (env.material[gi] === Mat.AIR && Math.random() < 0.05) {
        // create a tiny droplet of fuel only if there is a surface directly below,
        // so droplets don't float in mid-air
        const by = yw + 1;
        if (by < env.h) {
          const below = env.index(xw, by);
          if (env.material[below] !== Mat.AIR) {
            env.material[gi] = Mat.FUEL;
            env.fuel[gi] = Math.max(env.fuel[gi], 0.2);
            env.temp[gi] = Math.max(env.temp[gi], 560);
          }
        }
      }
    }
    // If env is WATER, quench local flame and create steam chance
    if (env.material[gi] === Mat.WATER && this.burning[localIndex]) {
      this.temp[localIndex] = Math.max(293, this.temp[localIndex] - 60);
      if (this.temp[localIndex] < (MaterialProps[matA]?.sustainTemp || Infinity)) {
        this.burning[localIndex] = 0;
      }
      if (env.temp[gi] > 373 && Math.random() < 0.3) env.material[gi] = Mat.STEAM;
    }
  }

  step(dt, env, worldX, worldY) {
    // Capture entity body motion to advect flames slightly
    const vxBody = (this.e.vx || 0);
    const vyBody = (this.e.vy || 0);
    // 1) Internal conduction inside the sprite footprint
    for (let y = 0; y < this.h; y++) {
      for (let x = (y & 1); x < this.w; x += 2) {
        const i = y * this.w + x;
        const mA = this.mask[i];
        const pA = MaterialProps[mA] || {};
        const nb = [[1,0],[-1,0],[0,1],[0,-1]];
        for (const [dx, dy] of nb) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const j = ny * this.w + nx;
          const mB = this.mask[j];
          const pB = MaterialProps[mB] || {};
          const k = Math.min(1, ((pA.conductivity || 0) + (pB.conductivity || 0)) * 0.5);
          const dT = this.temp[i] - this.temp[j];
          const ca = Math.max(0.1, pA.heatCapacity || 1), cb = Math.max(0.1, pB.heatCapacity || 1);
          const flow = dT * k * 0.25;
          this.temp[i] -= flow / ca;
          this.temp[j] += flow / cb;
        }
      }
    }

    // 2) Interface coupling with environment (one-to-one pixels)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const wx = (worldX | 0) + x, wy = (worldY | 0) + y;
        this.exchangeWithEnvironment(env, wx, wy, i);
      }
    }

    // 3) Ignition + combustion at each pixel with tiny advection bias
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const mat = this.mask[i];
        const p = MaterialProps[mat] || {};
        if (!p || (p.flammability || 0) <= 0) continue;

        // Neighbor flames in the entity mask
        let nbFlames = 0;
        const nb = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
        for (const [dx, dy] of nb) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const j = ny * this.w + nx;
          if (this.burning[j]) nbFlames++;
        }
        if (tryIgnite(mat, this.temp[i], !!this.burning[i], nbFlames)) {
          if (this.fuel[i] <= 0) this.fuel[i] = Math.min(1, p.fuelCapacity || 0.4);
          this.burning[i] = 1;
        }
        if (this.burning[i]) {
          const res = combust({ temp: this.temp[i], fuel: this.fuel[i], burning: !!this.burning[i] }, p, dt);
          this.temp[i] += res.heat;
          this.fuel[i] = Math.max(0, this.fuel[i] - res.fuelUsed);
          if (this.fuel[i] <= 0) this.burning[i] = 0;
          // Very small buoyancy/advection: encourage flames upward and with falling motion
          const upY = y > 0 ? (y - 1) : y;
          const downY = y < this.h - 1 ? (y + 1) : y;
          const advectUp = Math.max(0, -vyBody) * 0.002 + 0.05; // upward tendency
          if (Math.random() < advectUp && upY !== y) {
            const j = upY * this.w + x;
            if (!this.burning[j] && this.fuel[j] > 0) this.burning[j] = 1;
          }
          // Slight horizontal smear based on body velocity (standing wind effect)
          const dx = Math.sign(vxBody) || (Math.random()<0.5? -1:1);
          const nx = Math.max(0, Math.min(this.w - 1, x + dx));
          const j2 = y * this.w + nx;
          if (Math.random() < 0.03) {
            if (!this.burning[j2] && this.fuel[j2] > 0 && this.temp[j2] > (p.ignitionTemp * 0.8)) this.burning[j2] = 1;
          }
        } else {
          // Passive cooling toward body temperature to avoid any heat trail/ghosting
          const target = 310; // ~37°C
          const coolRate = 2.0; // 1/s faster cooldown to clear residual pixels
          this.temp[i] += (target - this.temp[i]) * Math.min(1, coolRate * dt);
        }
      }
    }

    // 3b) When the entity is down/dying, accelerate burnout and cooling so flames fade out
  if (this.e.state === 'dying' || this.e.state === 'down' || this.e.state === 'dead') {
      for (let i = 0; i < this.w * this.h; i++) {
        if (this.burning[i]) {
          // extra fuel consumption and cooling
          this.fuel[i] = Math.max(0, this.fuel[i] - 0.06 * dt);
          this.temp[i] += (310 - this.temp[i]) * Math.min(1, 1.0 * dt);
          if (this.fuel[i] <= 0) this.burning[i] = 0;
        } else {
          this.temp[i] += (310 - this.temp[i]) * Math.min(1, 1.5 * dt);
        }
      }
    }

    // 4) Injury accumulation: use area-normalized heating and burning
    let burnPixels = 0, heatLoad = 0;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      if (this.burning[i]) burnPixels++;
      heatLoad += Math.max(0, this.temp[i] - 330) * 0.0005; // damage scales with temp above ~57C
    }
    const burnFrac = burnPixels / Math.max(1, n);
    this.heatInjury += (burnFrac * 0.8 + heatLoad) * dt;

    // Sync a boolean for existing overlay fallback
    this.e.burning = burnFrac > 0.01 ? (this.e.burning || { duration: 1, maxDuration: 1 }) : this.e.burning;
    this.e.burnIntensity = burnFrac;

    // Detect end of flames while lying to begin a smolder period and hard-clear residuals
  if (this.e.state === 'dying' || this.e.state === 'down' || this.e.state === 'dead') {
      const prev = this._prevBurnFrac || 0;
      if (prev > 0.05 && burnFrac <= 0.02) {
        this.e._smolderT = Math.max(this.e._smolderT || 0, 3.5);
      }
      this._prevBurnFrac = burnFrac;
      // If burn stays below a tiny threshold, clear any straggler flames
      this._lowBurnAccum = (this._lowBurnAccum || 0) + (burnFrac <= 0.02 ? dt : -dt);
      if (this._lowBurnAccum < 0) this._lowBurnAccum = 0;
      if (this._lowBurnAccum > 0.6) {
        const npx = this.w * this.h;
        for (let i = 0; i < npx; i++) { this.burning[i] = 0; this.fuel[i] = Math.min(this.fuel[i], 0.02); this.temp[i] = Math.max(293, Math.min(this.temp[i], 315)); }
      }
    }
  }

  // Optional: per-pixel alpha map for overlay
  getBurnMap() {
    const n = this.w * this.h;
    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      // Only display active flames; suppress warm-but-not-burning pixels to avoid trails
      out[i] = this.burning[i] ? 255 : 0;
    }
    return out;
  }
}