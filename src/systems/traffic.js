/**
 * Foreground traffic silhouettes moving quickly across the bottom (in front of characters, behind UI).
 */
import { WORLD_W, VH } from '../core/constants.js';

export class ForegroundTraffic {
  constructor(rng) {
    this.rng = rng;
    this.cars = [];
    this.spawnT = 0;
  }

  spawn() {
    const rng = this.rng;
    const dir = rng() < 0.5 ? -1 : 1;
    const h = 16 + Math.floor(rng()*8);
    const y = VH - Math.floor(h * 0.7);
    const speed = 70 + rng()*70;
    const w = 44 + Math.floor(rng()*32);
    const variants = ['sedan','coupe','wagon'];
    const variant = variants[(Math.random()*variants.length)|0];
    const palette = ['#1b2230','#28334a','#3a2a28','#2a3b2f','#2c2c2c'];
    const color = palette[(Math.random()*palette.length)|0];
    const wheelColor = '#0a0a0a';
    this.cars.push({ x: dir === 1 ? -w-10 : WORLD_W + 10, y, w, h, dir, speed, color, wheelColor, t: 0, variant });
  }

  update(dt, cameraX, VW) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      if (this.rng() < 0.8) this.spawn();
      this.spawnT = 1.6 + this.rng()*2.6;
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      c.x += c.speed * c.dir * dt;
      c.t += dt;
      if ((c.dir === 1 && c.x - cameraX > VW + 40) || (c.dir === -1 && c.x - cameraX < -VW - 40)) {
        this.cars.splice(i,1);
      }
    }
  }

  draw(ctx, cameraX) {
    for (const c of this.cars) {
      const x = c.x - cameraX * 1.2;
      ctx.fillStyle = c.color;
      ctx.fillRect(Math.round(x), c.y, c.w, c.h);
      ctx.fillStyle = '#121724';
      const cabH = Math.max(4, Math.round(c.h * 0.35));
      ctx.fillRect(Math.round(x + c.w*0.15), c.y - cabH + 1, Math.round(c.w*0.4), cabH - 1);
      ctx.fillStyle = c.wheelColor;
      const wheelY = c.y + c.h - 2;
      ctx.fillRect(Math.round(x + 5), wheelY, 3, 3);
      ctx.fillRect(Math.round(x + c.w - 8), wheelY, 3, 3);
      ctx.fillStyle = '#fff3b4';
      if (c.dir === 1) {
        ctx.fillRect(Math.round(x + c.w), c.y + Math.max(2, Math.floor(c.h*0.25)), 3, 1);
      } else {
        ctx.fillRect(Math.round(x - 3), c.y + Math.max(2, Math.floor(c.h*0.25)), 3, 1);
      }
    }
  }
}