import { Materials as Mat } from './materials.js';

export class Grid {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.material = new Uint8Array(n);
    this.temp = new Float32Array(n);
    this.fuel = new Float32Array(n);
    this.burning = new Uint8Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.pressure = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.material[i] = Mat.AIR;
      this.temp[i] = 293;
      this.fuel[i] = 0;
      this.burning[i] = 0;
    }
  }
  index(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  addHeat(x, y, dT) {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.temp[i] += dT;
  }
  setCell(x, y, mat, temp = 293, fuel = 0, burning = 0) {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.material[i] = mat;
    this.temp[i] = temp;
    this.fuel[i] = fuel;
    this.burning[i] = burning ? 1 : 0;
  }
  swap(i, j) {
    [this.material[i], this.material[j]] = [this.material[j], this.material[i]];
    [this.temp[i], this.temp[j]] = [this.temp[j], this.temp[i]];
    [this.fuel[i], this.fuel[j]] = [this.fuel[j], this.fuel[i]];
    [this.burning[i], this.burning[j]] = [this.burning[j], this.burning[i]];
    [this.vx[i], this.vx[j]] = [this.vx[j], this.vx[i]];
    [this.vy[i], this.vy[j]] = [this.vy[j], this.vy[i]];
    [this.pressure[i], this.pressure[j]] = [this.pressure[j], this.pressure[i]];
  }
}