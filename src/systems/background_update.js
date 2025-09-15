/**
 * Background updater (annotated)
 *
 * Why this exists:
 * - The Background system mixes world generation (buildings, stars) with time-based updates
 *   (window twinkle, tiny road traffic queue). For determinism and to avoid visible “pops”
 *   on slow frames, you might want to step background logic in small fixed increments even
 *   if the main game dt spikes. This wrapper provides that fixed-step behavior.
 *
 * Responsibilities:
 * - Accumulate elapsed time and call background.update() in fixed steps (default 1/60s)
 * - Expose update(dt) API identical to other systems so the orchestrator can remain simple
 *
 * Usage:
 *   const bg = new Background(rng, covers, telephoneBooth);
 *   const bgStep = new FixedStepBackgroundUpdater(bg, 1/60);
 *   // in main update(dt): bgStep.update(dt, cameraX);
 *   // in render: bg.draw(ctx, cameraX);
 */
export class FixedStepBackgroundUpdater {
  /**
   * @param {import('./background.js').Background} background
   * @param {number} stepSec fixed step size in seconds (default 1/60)
   */
  constructor(background, stepSec = 1/60) {
    this.bg = background;
    this.step = Math.max(1/240, Math.min(1/30, stepSec));
    this.accum = 0;
    this._lastCameraX = 0;
  }

  /**
   * Step the background logic in fixed increments to keep motion smooth.
   * @param {number} dt seconds since last frame
   * @param {number} cameraX optional cameraX if any bg elements need it during update
   */
  update(dt, cameraX = this._lastCameraX) {
    this._lastCameraX = cameraX;
    this.accum += Math.max(0, dt);
    // Prevent spiral of death
    const maxAccum = this.step * 6; // cap to 6 steps worth
    if (this.accum > maxAccum) this.accum = maxAccum;

    while (this.accum >= this.step) {
      this.bg.update(this.step, cameraX);
      this.accum -= this.step;
    }
  }
}