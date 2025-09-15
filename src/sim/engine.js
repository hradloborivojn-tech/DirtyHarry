import { Grid } from './grid.js';
import { Materials as Mat, MaterialProps } from './materials.js';
import { tryIgnite, combust, waterQuench } from './reactions.js';

export class FireEngine {
  constructor(width, height) {
    this.grid = new Grid(width, height);
    this.dt = 1.0;
    this.nb4 = [[1,0],[-1,0],[0,1],[0,-1]];
    this.nb8 = [...this.nb4, [1,1],[1,-1],[-1,1],[-1,-1]];
    this._coolTick = 0;
    this._cleanTick = 0;
  }

  step(dt = this.dt) {
    const g = this.grid;

    // Heat diffusion
    for (let y = 0; y < g.h; y++) {
      for (let x = (y & 1); x < g.w; x += 2) {
        const i = g.index(x, y);
        const pA = MaterialProps[g.material[i]] || {};
        for (const [dx, dy] of this.nb4) {
          const nx = x + dx, ny = y + dy;
          if (!g.inBounds(nx, ny)) continue;
          const j = g.index(nx, ny);
          const pB = MaterialProps[g.material[j]] || {};
          const k = Math.min(1, ((pA.conductivity || 0) + (pB.conductivity || 0)) * 0.5);
          const dT = g.temp[i] - g.temp[j];
          const ca = Math.max(0.1, pA.heatCapacity || 1), cb = Math.max(0.1, pB.heatCapacity || 1);
          const flow = dT * k * 0.25;
          g.temp[i] -= flow / ca;
          g.temp[j] += flow / cb;
        }
      }
    }

    // Water quench + phases
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = g.index(x, y);
        const m = g.material[i];
        if (m === Mat.WATER) waterQuench(g, x, y);
        if (m === Mat.STEAM && g.temp[i] < 360 && Math.random() < 0.02) {
          g.material[i] = Mat.WATER;
          g.temp[i] = 330;
        }
        if (m === Mat.SMOKE && Math.random() < 0.004) {
          g.material[i] = Mat.AIR;
        }
      }
    }

    // Ignition + combustion
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = g.index(x, y);
        const mat = g.material[i];
        const props = MaterialProps[mat] || {};
        let nbFlames = 0;
        for (const [dx, dy] of this.nb8) {
          const nx = x + dx, ny = y + dy;
          if (!g.inBounds(nx, ny)) continue;
          if (g.burning[g.index(nx, ny)]) nbFlames++;
        }
        if (tryIgnite(mat, g.temp[i], !!g.burning[i], nbFlames)) {
          if (props.flammability > 0 && g.fuel[i] <= 0) g.fuel[i] = Math.min(1, props.fuelCapacity || 0.5);
          g.burning[i] = 1;
        }
        if (g.burning[i]) {
          const res = combust({ temp: g.temp[i], fuel: g.fuel[i], burning: !!g.burning[i] }, props, dt);
          g.temp[i] += res.heat;
          g.fuel[i] = Math.max(0, g.fuel[i] - res.fuelUsed);
          if (res.smoke > 0 && Math.random() < Math.min(0.9, res.smoke * 2)) {
            const up = y - 1;
            if (up >= 0) {
              const j = g.index(x, up);
              if (g.material[j] === Mat.AIR) { g.material[j] = Mat.SMOKE; g.temp[j] = Math.max(g.temp[j], 330); }
            }
          }
          if (g.fuel[i] <= 0) {
            g.burning[i] = 0;
            g.temp[i] = Math.max(293, Math.min(g.temp[i], 330));
          }
        }
      }
    }

    // Gas buoyancy and liquid settling (simple falling-sand style)
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = g.index(x, y);
        const m = g.material[i];
        const p = MaterialProps[m] || {};
        if (p.gas) {
          const up = y - 1;
          if (up >= 0) {
            const j = g.index(x, up);
            if ((g.material[j] === Mat.AIR) || (MaterialProps[g.material[j]]?.density || 1) > (p.density || 0)) {
              g.swap(i, j);
            }
          }
        } else if (p.liquid) {
          const dn = y + 1;
          if (dn < g.h) {
            const j = g.index(x, dn);
            const pj = MaterialProps[g.material[j]] || {};
            if (g.material[j] === Mat.AIR || (pj.density || 0) < (p.density || 0) - 0.05) {
              g.swap(i, j);
              continue;
            }
            // Try diagonal flow (down-left or down-right) to simulate spill
            const dirFirst = Math.random() < 0.5 ? -1 : 1;
            for (const sx of [dirFirst, -dirFirst]) {
              const nx = x + sx, ny = y + 1;
              if (nx >= 0 && nx < g.w && ny < g.h) {
                const jj = g.index(nx, ny);
                const pj2 = MaterialProps[g.material[jj]] || {};
                if (g.material[jj] === Mat.AIR || (pj2.density || 0) < (p.density || 0) - 0.05) {
                  g.swap(i, jj);
                  break;
                }
              }
            }
            // Rare sideways creep if fully blocked below
            if (Math.random() < 0.2) {
              const sx = Math.random() < 0.5 ? -1 : 1;
              const nx = x + sx;
              if (nx >= 0 && nx < g.w) {
                const jj = g.index(nx, y);
                const pj3 = MaterialProps[g.material[jj]] || {};
                if (g.material[jj] === Mat.AIR || (pj3.density || 0) < (p.density || 0) - 0.05) {
                  g.swap(i, jj);
                }
              }
            }

          }
        }
      }
    }

    // Cleanup pass: extinguish unsupported "hanging" flames (air above & below) — throttled
    this._cleanTick = (this._cleanTick + 1) % 3;
    if (this._cleanTick === 0) {
      for (let y = 1; y < g.h - 1; y++) {
        for (let x = 0; x < g.w; x++) {
          const i = g.index(x, y);
          if (!g.burning[i]) continue;
          const up = g.index(x, y-1), dn = g.index(x, y+1);
          if (g.material[up] === Mat.AIR && g.material[dn] === Mat.AIR) {
            g.burning[i] = 0;
            g.fuel[i] = Math.min(g.fuel[i], 0.01);
            g.temp[i] = Math.max(293, Math.min(g.temp[i], 315));
          }
        }
      }
    }

    // Ambient cooling and cleanup — throttled
    this._coolTick = (this._coolTick + 1) % 2;
    if (this._coolTick === 0) {
      const ambient = 293; // ~20°C
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) {
          const i = g.index(x, y);
          if (g.burning[i]) continue;
          const m = g.material[i];
          if (m === Mat.AIR && g.temp[i] <= ambient + 0.5) continue; // early skip
          const p = MaterialProps[m] || {};
          const rate = p.gas ? 2.2 : (p.liquid ? 1.1 : 0.55);
          g.temp[i] += (ambient - g.temp[i]) * Math.min(1, rate * dt);
          if (Math.abs(g.temp[i] - ambient) < 0.25) g.temp[i] = ambient;
          if (m === Mat.FUEL && g.fuel[i] <= 0) g.material[i] = Mat.AIR;
          if (m === Mat.SMOKE && g.temp[i] <= 300) g.material[i] = Mat.AIR;
        }
      }
    }
  }
}