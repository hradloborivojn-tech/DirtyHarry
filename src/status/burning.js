/**
 * Burning status effect helpers.
 *
 * Responsibilities:
 * - Apply, refresh, and update an entity's 'burning' transient state
 * - Provide a draw helper for a small flame overlay + tint
 *
 * Entity contract:
 * - We set entity.burning = { duration:number, maxDuration:number, lastPanicChange:number, originalState:any }
 * - Caller owns HP damage (e.g., in FirePatch.applyBurn) and death transitions
 */

export function applyBurningStatus(entity, durationMs = 4000) {
  const dur = Math.max(250, durationMs) / 1000;
  if (!entity.burning) {
    entity.burning = {
      duration: dur,
      maxDuration: dur,
      lastPanicChange: performance.now(),
      originalState: entity.state,
    };
    if (!['wounded', 'dying', 'dead'].includes(entity.state)) {
      entity.state = 'burning';
    }
  } else {
    entity.burning.duration = entity.burning.maxDuration;
  }
}

/**
 * Decrement timers and drive panic motion hints.
 * Leaves position changes to caller if desired; we only provide a suggestion via return value.
 * @param {object} entity
 * @param {number} dt seconds
 * @returns {{impulseX:number}|null} Optional horizontal impulse to jitter
 */
export function updateBurning(entity, dt) {
  const b = entity.burning;
  if (!b) return null;

  b.duration -= dt;
  if (b.duration <= 0) {
    // End effect
    const prior = b.originalState ?? 'idle';
    delete entity.burning;
    if (entity.state === 'burning') entity.state = prior;
    return null;
  }

  // Randomized horizontal jitter hint about every 0.6–0.9s
  const now = performance.now();
  if (now - b.lastPanicChange > 600) {
    b.lastPanicChange = now;
    const dir = Math.random() > 0.5 ? 1 : -1;
    // Return a suggested impulse; orchestrator can clamp to world bounds
    return { impulseX: dir * (15 + Math.random() * 15) };
  }
  return null;
}

/**
 * Minimal over-entity flames + red multiply tint (pixel-art friendly).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w?:number,h?:number}} entity
 * @param {number} t seconds
 * @param {number} cameraX
 */
export function drawBurningOverlay(ctx, entity, t, cameraX) {
  const gx = Math.round(entity.x - cameraX);
  const gy = Math.round(entity.y);

  // Flames
  const num = 3;
  for (let i = 0; i < num; i++) {
    const flamePhase = (i / num) * Math.PI * 2 + t * 4;
    const fx = gx + 8 + Math.cos(flamePhase) * 6;
    const fy = gy + 4 + Math.sin(flamePhase) * 4 - Math.abs(Math.sin(t * 6 + i)) * 3;

    const flicker = 0.6 + 0.4 * Math.sin(t * 12 + i * 2);
    ctx.globalAlpha = flicker * 0.8;
    ctx.fillStyle = i % 2 === 0 ? '#ff6600' : '#ffaa00';
    ctx.beginPath();
    ctx.arc(fx, fy, 1 + Math.sin(t * 8 + i), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Multiply tint
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(gx, gy, entity.w ?? 16, entity.h ?? 16);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}