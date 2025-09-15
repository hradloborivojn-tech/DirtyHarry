import { Materials as Mat, MaterialProps } from './materials.js';

export function tryIgnite(mat, tempK, burning, neighborFlames) {
  const p = MaterialProps[mat];
  if (!p || p.flammability <= 0) return false;
  if (burning) return true;
  if (tempK < p.ignitionTemp) return false;
  const bonus = Math.min(0.6, 0.12 * neighborFlames);
  return Math.random() < Math.min(1, p.flammability + bonus);
}

export function combust(cell, p, dt) {
  if (!cell.burning || cell.fuel <= 0) return { heat: 0, fuelUsed: 0, smoke: 0 };
  if (cell.temp < p.sustainTemp) { cell.burning = 0; return { heat: 0, fuelUsed: 0, smoke: 0 }; }
  const use = Math.min(cell.fuel, p.burnRate * dt);
  cell.fuel -= use;
  const heat = p.heatRelease * use / Math.max(0.1, p.heatCapacity || 1);
  const smoke = p.smokeYield * use;
  if (cell.fuel <= 0) cell.burning = 0;
  return { heat, fuelUsed: use, smoke };
}

export function waterQuench(env, x, y) {
  // Simple cooling and steam creation around water cells.
  const nb4 = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of nb4) {
    const nx = x + dx, ny = y + dy;
    if (!env.inBounds(nx, ny)) continue;
    const i = env.index(nx, ny);
    if (env.burning[i]) {
      env.temp[i] -= 40;
      if (env.temp[i] < 450) env.burning[i] = 0;
    }
    const j = env.index(x, y);
    if (env.temp[j] > 373 && Math.random() < 0.2) {
      env.material[j] = Mat.STEAM;
      env.temp[j] = Math.max(env.temp[j], 373);
    }
  }
}