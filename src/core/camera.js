/**
 * Camera helpers and screen shake.
 */
export class Camera {
  constructor(x = 0, minX = 0, maxX = 0) {
    this.x = x;
    this.minX = minX;
    this.maxX = maxX;
    this.shake = 0;
  }

  follow(targetX, vw) {
    const cx = Math.max(this.minX, Math.min(this.maxX, targetX - vw / 2));
    this.x = cx;
  }

  focus(x) {
    this.x = Math.max(this.minX, Math.min(this.maxX, x));
  }

  addShake(amount) {
    this.shake = Math.min(4, this.shake + amount);
  }

  update(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 6);
  }

  applyShakeTransform(ctx, rng) {
    if (this.shake <= 0) return;
    const sx = (rng() * 2 - 1) * this.shake;
    const sy = (rng() * 2 - 1) * this.shake;
    ctx.translate(Math.round(sx), Math.round(sy));
  }
}