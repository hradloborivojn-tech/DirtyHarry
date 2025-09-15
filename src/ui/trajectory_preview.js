/**
 * Trajectory preview simulation and rendering for the Molotov throw arc.
 *
 * Responsibilities:
 * - Simulate projectile path via simple physics steps
 * - Provide a lean renderer for dotted path
 *
 * Stateless and small: caller provides all constants to avoid coupling.
 */

/**
 * @param {{x:number,y:number}} start
 * @param {{vx:number,vy:number}} v0
 * @param {{gravity:number, groundY:number, steps:number}} cfg
 * @returns {Array<{x:number,y:number}>}
 */
export function simulateTrajectory(start, v0, cfg) {
  const points = [];
  const dt = 1 / 30; // 30 fps sub-steps
  let x = start.x, y = start.y;
  let vx = v0.vx, vy = v0.vy;

  for (let i = 0; i < (cfg.steps ?? 22); i++) {
    points.push({ x, y });
    vy += cfg.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    if (y >= cfg.groundY) break;
  }
  return points;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number,y:number}>} points
 * @param {number} cameraX
 * @param {{color?:string, radius?:number}} style
 */
export function drawTrajectory(ctx, points, cameraX, style = {}) {
  const color = style.color ?? '#ffff00';
  const r = style.radius ?? 1;

  ctx.save();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const px = p.x - cameraX;
    const py = p.y;
    const alpha = 0.8 - (i / Math.max(1, points.length)) * 0.6;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}