// sprites.js - pixel-art drawing helpers and sprite renderers
// Visual Upgrade 2.0: true 32x32 HD overlays, wind-swayed garments, and player hair customization

/* Palette */
export const COLORS = {
  transparent: 'rgba(0,0,0,0)',
  skin: '#f7c9a9',
  hair: '#3b2b19',
  coat: '#3a3a3a',
  coatDark: '#2b2b2b',
  coatLight: '#4a4a4a',
  // Player's undershirt (make it white so it pops under the unbuttoned coat)
  shirt: '#f1f1f1',
  pants: '#1e1e22',
  pantsLight: '#2a2a2e',
  boot: '#141418',
  gunMetal: '#7f7f87',
  gunDark: '#5b5b63',
  muzzle: '#ffd37f',
  blood: '#b91313',
  smoke: '#b9c3c7',
  smokeDark: '#8b9599',
  goonJacket: '#4a3b2a',
  goonPants: '#2a3642',
  goonHair: '#2a1c10',
  cigar: '#7b3f00',
  ember: '#ff5a00',
};

// Utility: draw a filled pixel at grid coordinate
function px(ctx, x, y, scale, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x * scale), Math.floor(y * scale), Math.ceil(scale), Math.ceil(scale));
}

// Utility: draw a rectangle in pixel units
function rect(ctx, x, y, w, h, scale, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x * scale), Math.floor(y * scale), Math.ceil(w * scale), Math.ceil(h * scale));
}

// Draw a simple muzzle flash shape
export function drawMuzzleFlash(ctx, x, y, dir, power, t) {
  // power: visual intensity multiplier (1..3)
  const flicker = (Math.sin(t * 60) + 1) * 0.5;
  const len = (3 + 2 * flicker) * (0.9 + 0.35 * power);
  const width = (2 + flicker) * (0.9 + 0.35 * power);
  if (dir === 1) {
    rect(ctx, x, y - 0.5, len, width, 1, COLORS.muzzle);
  } else {
    rect(ctx, x - len, y - 0.5, len, width, 1, COLORS.muzzle);
  }
}

// Player sprite (16x16) parametric drawing
// Inputs:
// - dir: 1 right, -1 left
// - animPhase: 0..1 walk cycle, when moving; otherwise idle sway
// - aiming: bool
// Returns approx hitboxes used elsewhere? Hitboxes are handled in game.js
// Base 16x16 renderer (kept internal; HD wrapper below calls this at 2x scale)
function drawPlayer16(ctx, x, y, scale, dir, animPhase, aiming, state) {
  // Allow per-sprite hair color (for player avatar customization)
  const HAIR = (state && state.hairColor) || COLORS.hair;
  // x,y refer to top-left of 16x16 box in pixel units
  // Body proportions
  const headY = 2;
  const headH = 5;
  const bodyY = headY + headH;
  const bodyH = 7;
  const armY = bodyY + 1;

  // Movement phase (used for walk stride)
  const moving = !!(state && state.moving);
  const stride = animPhase * Math.PI * 2;
  // Faster, snappier steps with ease-in-out on contact: use a sharper waveform for offsets
  const stepSin = moving ? Math.sin(stride) : 0;
  const step = moving ? Math.sign(stepSin) * Math.pow(Math.abs(stepSin), 0.6) : 0; // sharpened sine for snap

  // Pose tweaks
  const crouch = !!(state && state.crouch);
  const jumping = !!(state && state.jumping);
  const recoil = Math.max(0, Math.min(3, (state && state.recoil) || 0));
  const twirlT = (state && typeof state.twirlT === 'number') ? state.twirlT : 0; // 0..1 during gun twirl
  const jacketSway = (state && typeof state.jacketSway === 'number') ? state.jacketSway : 0; // pixels-ish
  const breathAmp = (state && typeof state.breathAmp === 'number') ? state.breathAmp : 0; // 0..1
  const breathPhase = (state && typeof state.breathPhase === 'number') ? state.breathPhase : 0; // 0..1
  // We keep feet on the ground; lower upper body on crouch
  const upperDown = crouch ? 2 : 0; // how much torso/head/arms move down when crouched

  // Idle deep breathing: sine shaping for inhale/exhale asymmetry (long inhale)
  // Only when idle; amplitude controlled externally
  const idleBreathing = (!moving && !aiming && !crouch && twirlT <= 0);
  const rawBreath = idleBreathing ? Math.sin(breathPhase * Math.PI * 2 - Math.PI/2) * 0.5 + 0.5 : 0; // 0..1 starting at bottom
  const shaped = idleBreathing ? Math.pow(rawBreath, 0.7) : 0; // deeper inhale feel
  const breathPixels = Math.round(shaped * 2 * breathAmp); // up to 2px chest expansion
  // Keep waistline stable: expand chest mostly upward; do not change hem height with breathing
  const breathUpShift = Math.max(0, Math.floor(breathPixels * 0.6));

  // Walking bob: slight vertical offset for whole body (except feet stay grounded via drawing)
  const walkBob = moving ? (stepSin > 0 ? 1 : 0) : 0; // 1px down on contact frames

  // Boots
  // Subtle stride: when moving, alternate slight forward foot shift and tiny lift
  const leftForward = moving ? (step < 0) : false;
  const rightForward = moving ? (step > 0) : false;
  const leftBootX = 3 + (leftForward ? -1 : 0);
  const rightBootX = 10 + (rightForward ? 1 : 0);
  const leftBootY = 14 + (leftForward ? -1 : 0);
  const rightBootY = 14 + (rightForward ? -1 : 0);
  rect(ctx, x + leftBootX, y + leftBootY, 3, 2, scale, COLORS.boot);
  rect(ctx, x + rightBootX, y + rightBootY, 3, 2, scale, COLORS.boot);

  // Pants
  if (crouch) {
    // shorter legs when crouched, but keep bottoms aligned with boots
    rect(ctx, x + 3, y + 12, 4, 2, scale, COLORS.pants);
    rect(ctx, x + 9, y + 12, 4, 2, scale, COLORS.pants);
  } else {
    // Slight stride mirrors boot offsets
    rect(ctx, x + (leftForward ? 2 : 3), y + 11 + (leftForward ? -1 : 0), 4, 3 + (leftForward ? 0 : 0), scale, COLORS.pants);
    rect(ctx, x + (rightForward ? 10 : 9), y + 11 + (rightForward ? -1 : 0), 4, 3 + (rightForward ? 0 : 0), scale, COLORS.pants);
  }

  // Unbuttoned coat: draw parted flaps with a visible white shirt in the center.
  // Compute chest block geometry (expand upward slightly on breath so waist doesn't jitter)
  const chestY = (crouch ? 8 : 7) + upperDown + walkBob - breathUpShift;
  const chestH = (crouch ? 3 : (4 + breathPixels));
  // Inner opening (gap) widens a bit with sway and breathing
  const swayX = Math.round(jacketSway);
  const gapW = Math.max(2, Math.min(4, 2 + (idleBreathing ? 1 : 0) + Math.floor(Math.abs(jacketSway) * 0.3)));
  const center = x + 8;
  const leftInnerX = center - Math.ceil(gapW / 2);
  const rightInnerX = center + Math.floor(gapW / 2);
  // Shirt column revealed under the open jacket
  rect(ctx, leftInnerX, y + chestY, Math.max(1, rightInnerX - leftInnerX), chestH, scale, COLORS.shirt);
  // Left and right coat flaps (slightly offset by wind sway)
  const leftOuterX = x + 3 + Math.max(0, -swayX); // left flap pushed further left when wind blows right
  const rightOuterX = x + 13; // fixed outer edge
  const rightInnerStart = rightInnerX + Math.max(0, swayX); // right flap pushed further right when wind blows left
  // Left flap
  const leftFlapW = Math.max(0, leftInnerX - leftOuterX);
  if (leftFlapW > 0) rect(ctx, leftOuterX, y + chestY, leftFlapW, chestH, scale, COLORS.coat);
  // Right flap
  const rightFlapW = Math.max(0, rightOuterX - rightInnerStart);
  if (rightFlapW > 0) rect(ctx, rightInnerStart, y + chestY, rightFlapW, chestH, scale, COLORS.coat);
  // Inner shadow lines to hint lapels
  rect(ctx, leftInnerX - 1, y + chestY, 1, chestH, scale, COLORS.coatDark);
  rect(ctx, rightInnerX, y + chestY, 1, chestH, scale, COLORS.coatDark);

  // Coat lower hem split into two fluttering panels; follow walk bob only (no breath height change)
  const hemY = y + 10 + upperDown + walkBob;
  const hemH = 2;
  // Left hem (slightly trails opposite right hem for a flutter effect)
  const hemLeftOuterX = x + 2 + Math.max(0, -Math.round(jacketSway * 0.3));
  const hemLeftInnerX = leftInnerX - 1;
  const hemLeftW = Math.max(0, hemLeftInnerX - hemLeftOuterX);
  if (hemLeftW > 0) rect(ctx, hemLeftOuterX, hemY, hemLeftW, hemH, scale, COLORS.coatDark);
  // Right hem
  const hemRightInnerX = rightInnerX;
  const hemRightOuterX = x + 14 + Math.max(0, Math.round(jacketSway * 0.3));
  const hemRightW = Math.max(0, hemRightOuterX - hemRightInnerX);
  if (hemRightW > 0) rect(ctx, hemRightInnerX, hemY, hemRightW, hemH, scale, COLORS.coatDark);

  // Arms
  if (aiming) {
    // Two-handed aim pose
    const kickUp = Math.min(2, recoil * 0.8);
  rect(ctx, x + (dir === 1 ? 10 : 1), y + armY + upperDown + walkBob - kickUp, 5, 2, scale, COLORS.coat); // front arm
  rect(ctx, x + (dir === 1 ? 5 : 6), y + armY + 1 + upperDown + walkBob - kickUp, 6, 2, scale, COLORS.coatDark); // back arm

    // Hands
  rect(ctx, x + (dir === 1 ? 14 : 1), y + armY + 1 + upperDown + walkBob - kickUp, 2, 2, scale, COLORS.skin);
  } else {
    if (moving && twirlT <= 0) {
      // Deliberate, slower arm swing (reduced amplitude; no shoulder bob)
      const swing = step * 0.6; // increased amplitude for snap
      const swingY = crouch ? 0 : (swing > 0 ? 0 : 1);
      const swingY2 = crouch ? 1 : (swing < 0 ? 0 : 1);
      rect(ctx, x + (dir === 1 ? 11 : 1), y + armY + swingY + upperDown + walkBob, 4, 2, scale, COLORS.coat);
      rect(ctx, x + (dir === 1 ? 1 : 11), y + armY + swingY2 + upperDown + walkBob, 4, 2, scale, COLORS.coatDark);
    } else {
      // Idle: relaxed low-carry arms (static)
      rect(ctx, x + (dir === 1 ? 11 : 1), y + armY + upperDown + walkBob, 4, 2, scale, COLORS.coat);
      rect(ctx, x + (dir === 1 ? 1 : 11), y + armY + 1 + upperDown + walkBob, 4, 2, scale, COLORS.coatDark);
    }
  }

  // Head
  // Head slightly lower on crouch, slightly higher when jumping (for a dynamic feel)
  const headOffset = (crouch ? 2 : 0) + (jumping ? -1 : 0) + walkBob;
  rect(ctx, x + 5, y + headY + upperDown + headOffset, 6, headH, scale, COLORS.skin);
  // Hair cap (military haircut: short top, no sideburns)
  rect(ctx, x + 5, y + headY + upperDown + headOffset, 6, 2, scale, HAIR);

  // No facial details per request (remove eyes/brow hints)

  // Gun (44 Magnum)
  if (aiming) {
    // Straight gun
    if (dir === 1) {
      const kickUp = Math.min(2, recoil * 0.8);
      rect(ctx, x + 14, y + armY + upperDown + walkBob - kickUp, 2, 1, scale, COLORS.gunDark); // sight
      rect(ctx, x + 12, y + armY + 1 + upperDown + walkBob - kickUp, 4, 1, scale, COLORS.gunMetal); // barrel
      rect(ctx, x + 11, y + armY + 2 + upperDown + walkBob - kickUp, 2, 1, scale, COLORS.gunDark); // cylinder
      rect(ctx, x + 12, y + armY + 3 + upperDown + walkBob - kickUp, 1, 1, scale, COLORS.gunDark); // grip
    } else {
      const kickUp = Math.min(2, recoil * 0.8);
      rect(ctx, x + 0, y + armY + upperDown + walkBob - kickUp, 2, 1, scale, COLORS.gunDark);
      rect(ctx, x + 0, y + armY + 1 + upperDown + walkBob - kickUp, 4, 1, scale, COLORS.gunMetal);
      rect(ctx, x + 3, y + armY + 2 + upperDown + walkBob - kickUp, 2, 1, scale, COLORS.gunDark);
      rect(ctx, x + 3, y + armY + 3 + upperDown + walkBob - kickUp, 1, 1, scale, COLORS.gunDark);
    }
  } else {
    // Idle twirl (cowboy-style) or relaxed low-carry
    if (!moving && twirlT > 0 && twirlT < 1) {
      // Pivot around hand position
  const px = dir === 1 ? (x + 14) : (x + 2);
  const py = y + armY + 3 + upperDown + walkBob;
      // 8-step circular offset for pixel-art twirl, do ~1.5 rotations
      const spins = 1.5;
      const steps = 8;
      const idx = Math.floor(((twirlT * spins) % 1) * steps) % steps;
      const circle = [
        {dx: 2, dy: 0, orient: 'h'},   // east
        {dx: 1, dy: -1, orient: 'd'},  // ne
        {dx: 0, dy: -2, orient: 'v'},  // north
        {dx: -1, dy: -1, orient: 'd'}, // nw
        {dx: -2, dy: 0, orient: 'h'},  // west
        {dx: -1, dy: 1, orient: 'd'},  // sw
        {dx: 0, dy: 2, orient: 'v'},   // south
        {dx: 1, dy: 1, orient: 'd'},   // se
      ];
      const c = circle[idx];
      // Draw a tiny spinning silhouette of the gun
      if (c.orient === 'h') {
        rect(ctx, px + c.dx - (dir===1?0:2), py + c.dy, 3, 1, scale, COLORS.gunMetal);
      } else if (c.orient === 'v') {
        rect(ctx, px + c.dx - 1, py + c.dy - 1, 1, 3, scale, COLORS.gunMetal);
      } else {
        rect(ctx, px + c.dx - 1, py + c.dy - 1, 2, 2, scale, COLORS.gunDark);
      }
    } else {
      // Low carry
      if (dir === 1) {
        rect(ctx, x + 13, y + armY + 3 + upperDown + walkBob, 3, 1, scale, COLORS.gunMetal);
        rect(ctx, x + 12, y + armY + 4 + upperDown + walkBob, 2, 1, scale, COLORS.gunDark);
      } else {
        rect(ctx, x + 0, y + armY + 3 + upperDown + walkBob, 3, 1, scale, COLORS.gunMetal);
        rect(ctx, x + 2, y + armY + 4 + upperDown + walkBob, 2, 1, scale, COLORS.gunDark);
      }
    }
  }
}

// 2x HD wrapper: renders the base sprite at 2x onto an offscreen 32x32 canvas, then overlays
// extra jacket details (lapel highlights, shirt placket, hem tips), and blits back scaled to 16x.
let _playerHdCanvas = null;
export function drawPlayer(ctx, x, y, scale, dir, animPhase, aiming, state) {
  // If scale is already >1 (e.g., someone wants native), still go through HD so details show.
  if (!_playerHdCanvas) {
    _playerHdCanvas = document.createElement('canvas');
    _playerHdCanvas.width = 32; // 2x of 16
    _playerHdCanvas.height = 32;
  }
  const hd = _playerHdCanvas;
  const hctx = hd.getContext('2d');
  hctx.imageSmoothingEnabled = false;
  // Clear
  hctx.clearRect(0, 0, hd.width, hd.height);
  // Draw base at 2x into HD canvas
  drawPlayer16(hctx, 0, 0, 2, dir, animPhase, aiming, state);
  // Overlay HD jacket details at half-pixel granularity (1px in 32x canvas)
  const S = 2; // multiplier from 16px grid to 32px
  // Recompute key geometry in the same way as base draw to align overlays
  const moving = !!(state && state.moving);
  const crouch = !!(state && state.crouch);
  const jumping = !!(state && state.jumping);
  const recoil = Math.max(0, Math.min(3, (state && state.recoil) || 0));
  const twirlT = (state && typeof state.twirlT === 'number') ? state.twirlT : 0;
  const jacketSway = (state && typeof state.jacketSway === 'number') ? state.jacketSway : 0;
  const breathAmp = (state && typeof state.breathAmp === 'number') ? state.breathAmp : 0;
  const breathPhase = (state && typeof state.breathPhase === 'number') ? state.breathPhase : 0;
  const upperDown = crouch ? 2 : 0;
  const idleBreathing = (!moving && !aiming && !crouch && twirlT <= 0);
  const rawBreath = idleBreathing ? Math.sin(breathPhase * Math.PI * 2 - Math.PI/2) * 0.5 + 0.5 : 0;
  const shaped = idleBreathing ? Math.pow(rawBreath, 0.7) : 0;
  const breathPixels = Math.round(shaped * 2 * breathAmp);
  const breathLowerExtra = breathPixels > 0 ? 1 : 0;
  const stepSin = moving ? Math.sin(animPhase * Math.PI * 2) : 0;
  const walkBob = moving ? (stepSin > 0 ? 1 : 0) : 0;
  // Chest and opening geometry (in 16px space)
  const chestY = (crouch ? 8 : 7) + upperDown + walkBob;
  const chestH = (crouch ? 3 : (4 + breathPixels));
  const swayX = Math.round(jacketSway);
  const gapW = Math.max(2, Math.min(4, 2 + (idleBreathing ? 1 : 0) + Math.floor(Math.abs(jacketSway) * 0.3)));
  const center = 0 + 8;
  const leftInnerX = center - Math.ceil(gapW / 2);
  const rightInnerX = center + Math.floor(gapW / 2);
  const leftOuterX = 0 + 3 + Math.max(0, -swayX);
  const rightOuterX = 0 + 13;
  const rightInnerStart = rightInnerX + Math.max(0, swayX);
  const hemY = 0 + 10 + upperDown + walkBob;
  const hemH = 2 + breathLowerExtra;
  const hemLeftOuterX = 0 + 2 + Math.max(0, -Math.round(jacketSway * 0.3));
  const hemLeftInnerX = leftInnerX - 1;
  const hemRightInnerX = rightInnerX;
  const hemRightOuterX = 0 + 14 + Math.max(0, Math.round(jacketSway * 0.3));

  // Helper to draw 1px-aligned rectangles in HD canvas
  const rectHD = (cx, cy, w, h, color) => {
    hctx.fillStyle = color;
    hctx.fillRect(cx|0, cy|0, w|0, h|0);
  };

  // Shirt placket line down the center (slightly darker than white to be visible)
  const placketX = Math.round(((leftInnerX + rightInnerX) / 2) * S);
  const placketY = Math.round(chestY * S);
  const placketH = Math.max(1, Math.round((hemY - chestY) * S - 1));
  rectHD(placketX, placketY, 1, placketH, '#d8d8d8');

  // Lapel inner highlight just outside the shadow
  // Left lapel highlight (a single pixel column)
  const leftHighlightX = Math.max(0, Math.round((leftInnerX - 2) * S));
  rectHD(leftHighlightX, placketY, 1, Math.round(chestH * S), COLORS.coatLight);
  // Right lapel highlight
  const rightHighlightX = Math.max(0, Math.round((rightInnerX + 1) * S));
  rectHD(rightHighlightX, placketY, 1, Math.round(chestH * S), COLORS.coatLight);

  // Hem inner tips: tiny darker pixels to suggest fluttered split
  const tipY = Math.round((hemY + hemH - 1) * S);
  const leftTipX = Math.round((hemLeftInnerX - 1) * S);
  const rightTipX = Math.round((hemRightInnerX) * S);
  rectHD(leftTipX, tipY, 1, 1, COLORS.coatDark);
  rectHD(rightTipX, tipY, 1, 1, COLORS.coatDark);

  // No HD facial accents (remove eyes/brow overlays)

  // Hair accent for older, short grey hair: if a custom hairColor is provided, add a lighter highlight
  const hairColor = (state && state.hairColor) || null;
  if (hairColor) {
    // Align with base sprite head position
    const headY = 2;
    const headOffset = (crouch ? 2 : 0) + (jumping ? -1 : 0) + walkBob;
    const topY = Math.round((headY + upperDown + headOffset) * S);
    const hairX = Math.round(5 * S);
    rectHD(hairX, topY, Math.round(6 * S * 0.5), 1, '#c7c7c7');
  }

  // Subtle light-side trouser accent (light comes from world-left). Draw a 1px inner highlight
  // along the outer-left contour of the left pant leg only, to help separate from dark ground.
  // Recompute gait positions consistent with base draw.
  const moving2 = !!(state && state.moving);
  const stride = animPhase * Math.PI * 2;
  const stepSin2 = moving2 ? Math.sin(stride) : 0;
  const step2 = moving2 ? Math.sign(stepSin2) * Math.pow(Math.abs(stepSin2), 0.6) : 0;
  const leftForward = moving2 ? (step2 < 0) : false;
  // Left leg geometry in 16px space
  const legY = (leftForward ? 10 : 11) + (leftForward ? -1 : 0); // base y used in draw (11 + offset)
  const leftLegX = (leftForward ? 2 : 3);
  const legH = (crouch ? 2 : 3);
  const legYFinal = (crouch ? 12 : legY);
  // Draw the 1px highlight inside the pants rectangle, only on the world-left side
  const lxHD = Math.round((leftLegX) * S);
  const lyHD = Math.round((legYFinal) * S);
  const lhHD = Math.max(1, Math.round(legH * S));
  rectHD(lxHD, lyHD, 1, lhHD, COLORS.pantsLight);

  // Blit the 32x32 HD canvas back onto the main context as 16x16 pixels at (x,y)
  // Keep nearest-neighbor for crispness
  const oldSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(hd, Math.floor(x * scale), Math.floor(y * scale), Math.floor(16 * scale), Math.floor(16 * scale));
  ctx.imageSmoothingEnabled = oldSmooth;
}

// Goon sprite (16x16) with smoking animations and wounded/dead variants
// state: 'idle','smoke_hold','smoke_raise','smoke_inhale','smoke_exhale','wounded','run','dead','cover','scared'
// woundedArm: 'left'|'right'|null
export function drawGoon(ctx, x, y, scale, dir, state, phase, woundedArm, opts = {}) {
  // --- Visual Upgrade 2.0 HD wrapper for goon ---
  if (!drawGoon._hd) {
    drawGoon._hd = document.createElement('canvas');
    drawGoon._hd.width = 32; drawGoon._hd.height = 32;
  }
  const hd = drawGoon._hd; const hctx = hd.getContext('2d');
  hctx.imageSmoothingEnabled = false; hctx.clearRect(0,0,32,32);

  const deathT = typeof opts.deathT === 'number' ? Math.max(0, Math.min(1, opts.deathT)) : 0;
  const downLike = (state === 'dying' || state === 'dead');
  // Base/dying/dead 16x draw into HD at 2x
  (function drawBase(ctx2) {
    // Pixel-art dying frames override the normal standing sprite
    if (state === 'dying' || state === 'dead') {
      const C_BODY = '#2a2a2a';
      const C_BLOOD = COLORS.blood;
      const C_BOOT = '#1a1a1a';
      const frame = state === 'dead' ? 3 : Math.min(3, Math.floor(deathT * 4));
      if (frame === 0) {
        // Sagging stance
        rect(ctx2, 3, 11, 10, 3, 2, C_BODY); // torso
        rect(ctx2, 5, 6, 6, 5, 2, COLORS.skin); // head lower
        rect(ctx2, 4, 14, 3, 2, 2, C_BOOT);
        rect(ctx2, 9, 14, 3, 2, 2, C_BOOT);
      } else if (frame === 1) {
        // Leaning to side
        rect(ctx2, 2, 12, 11, 3, 2, C_BODY);
        const hx = dir === 1 ? 12 : 1;
        rect(ctx2, hx, 10, 3, 3, 2, COLORS.skin);
        rect(ctx2, dir === 1 ? 13 : 1, 13, 3, 2, 2, C_BODY);
      } else if (frame === 2) {
        // Almost horizontal
        rect(ctx2, 3, 13, 10, 1, 2, C_BODY);
        rect(ctx2, 2, 14, 12, 2, 2, C_BODY);
        const hx = dir === 1 ? 13 : 1;
        rect(ctx2, hx, 12, 3, 3, 2, COLORS.skin);
        rect(ctx2, hx - (dir===1?1:-1), 15, 2, 1, 2, C_BLOOD);
      } else {
        // Dead: lying on the floor fully horizontal
        rect(ctx2, 2, 14, 12, 2, 2, C_BODY);
        rect(ctx2, 3, 13, 10, 1, 2, C_BODY);
        const hx = dir === 1 ? 13 : 1;
        rect(ctx2, hx, 12, 3, 3, 2, COLORS.skin);
        // small blood smear by head
        rect(ctx2, hx - (dir===1?1:-1), 15, 3, 1, 2, C_BLOOD);
      }
      return;
    }
    // Boots
    rect(ctx2, 3, 14, 3, 2, 2, '#1a1a1a');
    rect(ctx2, 10, 14, 3, 2, 2, '#1a1a1a');
    // Pants
    rect(ctx2, 3, 11, 10, 3, 2, COLORS.goonPants);
    // Jacket
    rect(ctx2, 3, 7, 10, 4, 2, COLORS.goonJacket);
    // Head + features drawer (encapsulated so we can mirror just the head during smoking)
    const drawHeadBlock = (ctxH) => {
      // base head
      rect(ctxH, 5, 2, 6, 5, 2, COLORS.skin);
      rect(ctxH, 4, 2, 8, 2, 2, COLORS.goonHair);
      // Face hint (brow/eye) biased toward the cigarette/front side
      rect(ctxH, (dir === 1 ? 9 : 5), 4, 2, 1, 2, '#2a2a2a');
      // Mouth
      const mouthColor = '#e0b397';
      if (dir === 1) rect(ctxH, 9, 6, 2, 1, 2, mouthColor);
      else rect(ctxH, 5, 6, 2, 1, 2, mouthColor);
    };
    // Draw head in the same orientation as body direction.
    // (Previously mirrored during smoking, which looked wrong.)
    drawHeadBlock(ctx2);

    // Arms baseline
    const armY = 8;
  // World-space arm baselines (left/right independent of facing)
  let leftArmY = armY, rightArmY = armY;
  const leftArmX = 1, rightArmX = 11;
    // Smoking animations / scared / run
    if (typeof state === 'string' && state.startsWith('smoke')) {
      // Reworked: FRONT arm (depends on dir) holds and raises the cigarette.
      // Phase layout (0..4): 0-1 hold, 1-2 raise, 2-3 inhale, 3-4 exhale
      const pLocal = ((typeof phase === 'number' ? phase : 0) % 4 + 4) % 4;
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const ease = (t) => t * t * (3 - 2 * t); // smoothstep
      const setFrontY = (v) => { if (dir === 1) rightArmY = v; else leftArmY = v; };
      if (state === 'smoke_hold') {
        setFrontY(armY);
      } else if (state === 'smoke_raise') {
        const q = clamp01(pLocal - 1); // 0..1 during raise
        const lift = Math.round(ease(q) * 3); // up to 3px up
        setFrontY(armY - lift);
      } else if (state === 'smoke_inhale') {
        setFrontY(armY - 3);
      } else if (state === 'smoke_exhale') {
        setFrontY(armY - 1);
      }
    } else if (state === 'scared') {
      leftArmY = armY - 3; rightArmY = armY - 3;
    }
    if (state === 'run') {
      const swing = Math.sin(phase * Math.PI * 2);
      leftArmY = armY + (swing > 0 ? 0 : 1);
      rightArmY = armY + (swing < 0 ? 0 : 1);
    }
    if (state === 'wounded' && woundedArm) {
      if (woundedArm === 'left') leftArmY = armY - 2;
      if (woundedArm === 'right') rightArmY = armY - 2;
    }
    // Arms
    rect(ctx2, (dir === 1 ? rightArmX : leftArmX), (dir === 1 ? rightArmY : leftArmY), 4, 2, 2, COLORS.goonJacket); // front arm
    rect(ctx2, (dir === 1 ? leftArmX : rightArmX), (dir === 1 ? leftArmY : rightArmY) + 1, 4, 2, 2, '#3a2f22');       // back arm (shadowed)
    // Cigar: place near the mouth for both facings so it doesn't clip or sit behind the neck
    if (typeof state === 'string' && state.startsWith('smoke')) {
      // Head is no longer mirrored; place cigarette on the mouth side matching dir.
  const faceDir = dir;
  // Vertical alignment follows the front arm's hand position
  const cy = (dir === 1 ? rightArmY : leftArmY) + 1;
      // Place just at the lips: base body position near mouth for each facing
      const bodyX = (faceDir === 1) ? 9 : 5;
      rect(ctx2, bodyX, cy, 2, 1, 2, COLORS.cigar);
      // Ember at outer tip (away from lips)
      const tipX = (faceDir === 1) ? (bodyX + 2) : (bodyX - 1);
      rect(ctx2, tipX, cy, 1, 1, 2, COLORS.ember);
    }
    // no special mark here; dead handled above
  })(hctx);

  // Overlay 32px cloth details (lapel highlights + hem flutter)
  const S = 2;
  const rectHD = (cx, cy, w, h, color) => { hctx.fillStyle = color; hctx.fillRect(cx|0, cy|0, w|0, h|0); };
  if (!downLike) {
    const chestY = 7; const chestH = 4; const leftInnerX = 6; const rightInnerX = 10; // simple center gap
    const hemY = 10; const hemH = 2;
    const wind = (typeof drawGoon._wind === 'number' ? drawGoon._wind : 0);
    const sway = Math.round((wind) * 1.2);
    // Lapel highlights
    rectHD((leftInnerX - 2) * S, chestY * S, 1, chestH * S, '#6b5747');
    rectHD((rightInnerX + 1) * S, chestY * S, 1, chestH * S, '#6b5747');
    // Hem panels
    rectHD((2 + Math.max(0, -Math.round(sway*0.4))) * S, (hemY+hemH-1) * S, 5, 1, COLORS.goonJacket);
    rectHD((rightInnerX) * S, (hemY+hemH-1) * S, 5 + Math.max(0, Math.round(sway*0.4)) * S, 1, '#3a2f22');
  }

  // Cigarette ember glow: dim by default; smooth brighten (red→yellow) during inhale, smooth fade during exhale
  if (!downLike && typeof state === 'string' && state.startsWith('smoke')) {
    // Recompute arm pose to locate the cigarette tip (match base draw logic)
    const armY = 8;
    // Front arm carries the cigarette depending on facing
    let leftArmY = armY, rightArmY = armY;
    if (state === 'smoke_hold') {
      if (dir === 1) rightArmY = armY; else leftArmY = armY;
    } else if (state === 'smoke_raise') {
      if (dir === 1) rightArmY = armY - 2; else leftArmY = armY - 2;
    } else if (state === 'smoke_inhale') {
      if (dir === 1) rightArmY = armY - 3; else leftArmY = armY - 3;
    } else if (state === 'smoke_exhale') {
      if (dir === 1) rightArmY = armY - 1; else leftArmY = armY - 1;
    }
    const cy = (dir === 1 ? rightArmY : leftArmY) + 1;
    // Head is not mirrored; ember should be at the outward tip based on facing
    const faceDir = dir;
    const baseBodyX = (faceDir === 1) ? 9 : 5;
    const tipX16 = (faceDir === 1) ? (baseBodyX + 2) : (baseBodyX - 1);
    const tipY16 = cy;
    const tx = Math.round(tipX16 * S);
    const ty = Math.round(tipY16 * S);

    // Phase within the 4s smoking loop: 0-1 hold, 1-2 raise, 2-3 inhale, 3-4 exhale
    const p = ((typeof phase === 'number' ? phase : 0) % 4 + 4) % 4;
    let coreAlpha = 0.22; // dim ember default
    let coreColor = '#ff7b2f'; // warm orange baseline
    // tiny helpers
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const ease = (t) => t*t*(3 - 2*t); // smoothstep for gentle ramp
    const lerp = (a,b,t) => a + (b-a)*t;
    const lerpColor = (c1, c2, t) => {
      const h2i = (h) => parseInt(h.slice(1), 16);
      const i2h = (i) => '#' + i.toString(16).padStart(6, '0');
      const a = h2i(c1), b = h2i(c2);
      const ar = (a>>16)&255, ag=(a>>8)&255, ab=a&255;
      const br = (b>>16)&255, bg=(b>>8)&255, bb=b&255;
      const r = Math.round(lerp(ar, br, t));
      const g = Math.round(lerp(ag, bg, t));
      const bl = Math.round(lerp(ab, bb, t));
      return i2h((r<<16)|(g<<8)|bl);
    };
    if (state === 'smoke_inhale') {
      const q = clamp01(p - 2); // 0..1
      const tIn = ease(q);
      coreColor = lerpColor('#ff2a00', '#ffd37f', tIn); // red -> yellow
      coreAlpha = lerp(0.3, 0.95, tIn);
    } else if (state === 'smoke_exhale') {
      const q = clamp01(p - 3); // 0..1
      const tOut = ease(q);
      coreColor = lerpColor('#ffd37f', '#ff7b2f', tOut); // yellow -> warm orange
      coreAlpha = lerp(0.95, 0.24, tOut);
    } else if (state === 'smoke_raise') {
      // slight brighten while approaching the lips
      const q = clamp01(p - 1);
      coreAlpha = lerp(0.22, 0.38, ease(q));
    }

    // Draw a crisp core pixel plus a soft 1px ring glow for readability
    hctx.save();
    hctx.globalAlpha = Math.max(0, Math.min(1, coreAlpha));
    // Core aligns to base 2x pixel (2x2 in HD canvas)
    rectHD(tx, ty, 2, 2, coreColor);
    // Glow ring around core (thin cross/box)
    const ringAlpha = Math.max(0, Math.min(1, (coreAlpha - 0.12) * 0.5));
    if (ringAlpha > 0) {
      hctx.globalAlpha = ringAlpha;
      // subtle outer glow color based on current core (shift towards lighter tone)
      const glowColor = lerpColor(coreColor, '#ffe27a', 0.35);
      // left and right columns
      rectHD(tx - 1, ty, 1, 2, glowColor);
      rectHD(tx + 2, ty, 1, 2, glowColor);
      // top and bottom rows
      rectHD(tx, ty - 1, 2, 1, glowColor);
      rectHD(tx, ty + 2, 2, 1, glowColor);
    }
    hctx.restore();
  }

  // Blit back
  const old = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(hd, Math.floor(x * scale), Math.floor(y * scale), Math.floor(16 * scale), Math.floor(16 * scale));
  ctx.imageSmoothingEnabled = old;
}

// Simple bubble text helpers
// Word-wrap helper for monospace text based on maxWidth (in virtual pixels)
function wrapMonospace(ctx, text, maxWidth) {
  const words = (text + '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxWidth || cur === '') {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Chunk words into lines of 2-3 words for a punchy comic-book cadence
function chunkWords(text, minWords = 2, maxWords = 3) {
  const words = (text + '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (let i = 0; i < words.length;) {
    const n = Math.min(maxWords, Math.max(minWords, words.length - i));
    const take = Math.min(n, maxWords);
    const slice = words.slice(i, i + take);
    lines.push(slice.join(' '));
    i += take;
  }
  return lines;
}

// Draw speech bubble with optional word-wrapping and speaker color
// opts: { maxWidth?: number, speaker?: 'harry'|'npc'|'system', hdScale?: number }
export function drawSpeechBubble(ctx, text, x, y, scale, opts = {}) {
  // Layout constants (virtual px)
  const paddingX = 3; // increased padding to avoid text touching borders
  const paddingY = 3;
  const lineGap = 1; // add a pixel of breathing room between lines
  const pointerH = 4; // height of the triangular arrow pointer
  const pointerW = 7; // width at the bubble base
  const hd = opts.hdScale || 3; // match INTERNAL_SCALE in game for crispness
  const speaker = opts.speaker || 'system';
  const requestedPx = typeof opts.fontPx === 'number' ? opts.fontPx : 6;
  const fg = opts.color || (speaker === 'harry' ? '#d9e0ff' : speaker === 'pickup' ? '#00cc66' : '#eaeaea');
  const outline = 'rgba(0,0,0,0.9)';
  const brightStroke = opts.strokeColor || (speaker === 'harry' ? '#8fd5ff' : speaker === 'npc' ? '#ffe977' : '#8affbf');
  const maxWidth = Math.max(24, opts.maxWidth || 80); // in virtual pixels
  const noBg = !!opts.noBackground;
  const forceChunk = opts.forceChunk !== false; // default true

  // Determine viewport size and translation in current transform (virtual px)
  const tr = typeof ctx.getTransform === 'function' ? ctx.getTransform() : { a: 1, d: 1, e: 0, f: 0 };
  const viewW = ctx.canvas.width / (tr.a || 1);
  const viewH = ctx.canvas.height / (tr.d || 1);
  const transX = (tr.e || 0) / (tr.a || 1);
  const transY = (tr.f || 0) / (tr.d || 1);

  // Prepare font at HiDPI scale for measuring/wrapping and adaptive sizing
  const oldFont = ctx.font;
  let px = requestedPx;
  const layoutWithPx = (pxSize) => {
    // Use scaled font for accurate measurement in device px
    ctx.font = `${pxSize * scale}px monospace`;
    // Initial chunking for comic cadence; then hard wrap to maxWidth
    let localLines = forceChunk ? chunkWords(text, 2, 3) : wrapMonospace(ctx, text, maxWidth - paddingX * 2);
    const finalLines = [];
    for (const ln of localLines) {
      const parts = wrapMonospace(ctx, ln, maxWidth - paddingX * 2);
      for (const p of parts) finalLines.push(p);
    }
    localLines = finalLines.length ? finalLines : localLines;
    // Measure max width (device px) and compute total height incl. gaps and padding
    const measuredMax = localLines.length ? Math.max(...localLines.map(l => ctx.measureText(l).width)) : 0;
    const innerH = (pxSize * localLines.length) + Math.max(0, (localLines.length - 1) * lineGap);
    const textW2 = Math.min(maxWidth, measuredMax + paddingX * 2);
    const textH2 = innerH + paddingY * 2 + 2; // +2 to account for 1px outline at top/bottom
    const lineH2 = pxSize + lineGap;
    return { localLines, textW2, lineH2, textH2 };
  };
  let { localLines: lines, textW2: textW, lineH2: lineH, textH2: textH } = layoutWithPx(px);
  // If bubble taller than viewport, shrink font until it fits or reach minimum
  const maxHAvail = viewH - 2;
  while (textH / scale > maxHAvail && px > 4) {
    px = Math.max(4, px - 1);
    ({ localLines: lines, textW2: textW, lineH2: lineH, textH2: textH } = layoutWithPx(px));
    if (px === 4) break;
  }
  ctx.font = oldFont;

  // Compute bubble rect (center it above the anchor x) and place it higher with a pointer
  const bw = Math.ceil(textW / scale);
  const bh = Math.ceil(textH / scale);
  let bx = Math.round(x - bw / 2);
  // Place bubble above the anchor (y) by its height plus pointer and a small gap
  let by = Math.round(y - (bh + pointerH + 5));
  const minX = 1 - transX;
  const maxX = viewW - 1 - bw - transX;
  const minY = 1 - transY;
  const maxY = viewH - 1 - bh - transY;
  if (bx < minX) bx = minX;
  if (bx > maxX) bx = maxX;
  if (by < minY) by = minY;
  if (by > maxY) by = maxY;

  // Bubble background (optional) and bright stroke
  if (!noBg) {
    rect(ctx, bx, by, bw, bh, scale, 'rgba(0,0,0,0.72)');
    // Pointer triangle pointing to (x, y)
    // Clamp base of the pointer to bubble bottom edge
    const baseY = by + bh;
    const baseXCenter = Math.max(bx + 2, Math.min(bx + bw - 2, Math.round(x)));
    const halfW = Math.floor(pointerW / 2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(baseXCenter - halfW, baseY); // left base
    ctx.lineTo(baseXCenter + halfW, baseY); // right base
    ctx.lineTo(Math.round(x), Math.round(y)); // tip at anchor
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fill();
    // stroke (draw in virtual space; current transform scales it)
    ctx.save();
    ctx.strokeStyle = brightStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.stroke(); // stroke the pointer path from prior ctx.beginPath
    ctx.restore();
    ctx.restore();
  }

  // HiDPI text render within bubble
  const saveFont = ctx.font;
  ctx.font = `${px * scale * hd}px monospace`;
  ctx.textBaseline = 'top';
  ctx.save();
  ctx.scale(1/hd, 1/hd);
  let tx = Math.floor((bx + paddingX) * scale * hd);
  let ty = Math.floor((by + paddingY) * scale * hd);
  for (const line of lines) {
    // outline
    ctx.fillStyle = outline;
    ctx.fillText(line, tx+hd, ty);
    ctx.fillText(line, tx-hd, ty);
    ctx.fillText(line, tx, ty+hd);
    ctx.fillText(line, tx, ty-hd);
    // fill
    ctx.fillStyle = fg;
    ctx.fillText(line, tx, ty);
    ty += lineH * scale * hd; // next line (includes lineGap)
  }
  ctx.restore();
  ctx.font = saveFont;
}

// Simple NPCs: mother (with stroller), old man, kid
// state: 'idle'|'afraid'|'calm'|'down'|'flee'
export function drawNPC(ctx, x, y, scale, type, state, dir, opts = {}) {
  // HD wrapper for Visual Upgrade 2.0
  if (!drawNPC._hd) { drawNPC._hd = document.createElement('canvas'); drawNPC._hd.width = 32; drawNPC._hd.height = 32; }
  const hd = drawNPC._hd; const hctx = hd.getContext('2d');
  hctx.imageSmoothingEnabled = false; hctx.clearRect(0,0,32,32);
  // Draw base at 2x into HD canvas (original 16x logic)
  const baseResult = (function base(ctx2){
  if (state === 'down' || state === 'dying') {
    // Pixel-art dying/down frames
    const deathT = typeof opts.deathT === 'number' ? Math.max(0, Math.min(1, opts.deathT)) : 0;
    const frame = state === 'down' ? 3 : Math.min(3, Math.floor(deathT * 4));
    const BODY = '#1a1a1a';
    if (frame === 0) {
      rect(ctx2, 4, 11, 8, 3, 2, BODY);
      rect(ctx2, 6, 6, 4, 4, 2, COLORS.skin);
    } else if (frame === 1) {
      rect(ctx2, 3, 12, 9, 2, 2, BODY);
      rect(ctx2, dir===1?12:1, 11, 3, 2, 2, BODY);
      rect(ctx2, dir===1?12:1, 9, 3, 3, 2, COLORS.skin);
    } else if (frame === 2) {
      rect(ctx2, 2, 14, 12, 2, 2, BODY);
      rect(ctx2, 3, 13, 10, 1, 2, BODY);
      rect(ctx2, dir===1?13:1, 12, 3, 3, 2, COLORS.skin);
      rect(ctx2, dir===1?12:3, 15, 2, 1, 2, COLORS.blood);
    } else {
      // down/finished
      rect(ctx2, 2, 14, 12, 2, 2, BODY);
      rect(ctx2, 3, 13, 10, 1, 2, BODY);
      rect(ctx2, dir===1?13:1, 12, 3, 3, 2, COLORS.skin);
      rect(ctx2, dir===1?12:3, 15, 3, 1, 2, COLORS.blood);
    }
    return 'down';
  }
  // Base body
  let jacket = '#38424a', pants = '#22272b', hair = '#2a1c10', skin = COLORS.skin;
  if (type === 'mother') { jacket = '#4b3a5a'; pants = '#2a2e44'; hair = '#3b2b19'; }
  if (type === 'oldman') { jacket = '#3a3a3a'; pants = '#1f2224'; hair = '#a8a8a8'; }
  if (type === 'kid') { jacket = '#2d4a3b'; pants = '#1b2a21'; hair = '#2a1c10'; }
  if (type === 'hotgirl') { jacket = '#aa192a'; pants = '#441018'; hair = '#2a0e10'; }

  // Legs / dress
  if (type === 'hotgirl') {
    // Woman-like silhouette: subtle hourglass with wider hips and a flowing dress
    // Dance-aware phase (0..1) for idle dancing pose if requested via opts
    const dancing = !!opts.dancing && (state === 'idle' || state === 'calm' || state === 'dance');
    const ph = dancing ? (opts.dancePhase || 0) : 0;
    const wave = Math.sin(ph * Math.PI * 2);
    // Upper torso (narrower waist)
    rect(ctx2, 5, 7, 6, 3, 2, jacket);        // 6px wide chest/waist
    // Lower torso/hips flare (add a pixel on each side)
    rect(ctx2, 4, 10, 8, 2, 2, jacket);
    // Dress hem, slightly wider and animated with a tiny sway
    const hemSway = dancing ? Math.round(wave) : 0;
    const hemX = 3 - Math.min(0, hemSway);
    const hemW = 10 + Math.abs(hemSway);
    rect(ctx2, hemX, 12, hemW, 2, 2, '#901624');
    // Legs/boots: during dance, alternate a small step-out and lift
    const step = dancing ? (wave > 0 ? 1 : -1) : 0;
    const lift = dancing ? (wave > 0 ? 0 : 1) : 0;
    // Left leg
    rect(ctx2, 5 + (step < 0 ? -1 : 0), 13 - (step < 0 ? lift : 0), 2, 2, 2, pants);
    // Right leg
    rect(ctx2, 9 + (step > 0 ? 1 : 0), 13 - (step > 0 ? lift : 0), 2, 2, 2, pants);
    // Boots (tiny offset to sell the step)
    rect(ctx2, 4 + (step < 0 ? -1 : 0), 15 - (step < 0 ? lift : 0), 3, 1, 2, '#1a1a1a');
    rect(ctx2, 9 + (step > 0 ? 1 : 0), 15 - (step > 0 ? lift : 0), 3, 1, 2, '#1a1a1a');
  } else {
    // Default legs
    rect(ctx2, 4, 11, 4, 3, 2, pants);
    rect(ctx2, 8, 11, 4, 3, 2, pants);
    // Boots to touch ground
    rect(ctx2, 3, 14, 3, 2, 2, '#1a1a1a');
    rect(ctx2, 10, 14, 3, 2, 2, '#1a1a1a');
    // Torso
    rect(ctx2, 4, 7, 8, 5, 2, jacket);
  }
  // Head
  rect(ctx2, 6, 3, 4, 4, 2, skin);
  rect(ctx2, 5, 3, 6, 2, 2, hair);
  // Arms
  let armY = 9;
  if (state === 'afraid') armY = 7;
  // Special poses
  const threaten = (type === 'oldman' && state === 'threaten');
  const dancing = (type === 'hotgirl') && ((state === 'dance') || (opts.dancing && (state === 'idle' || state === 'calm')));
  if (threaten) {
    // Raise cane arm and lean forward slightly
    rect(ctx2, (dir===1?11:1), armY-2, 4, 2, 2, jacket);   // front arm up
    rect(ctx2, (dir===1?1:11), armY+1, 4, 2, 2, jacket);   // back arm down
  } else if (dancing) {
    // Alternating dance: one arm up, one on hip, swap sides by phase
    const ph = (opts.dancePhase || 0);
    const leftSideUp = Math.sin(ph * Math.PI * 2) > 0; // toggle sides
    // Front/back depends on dir
    const frontX = (dir===1?11:1), backX = (dir===1?1:11);
    if ((dir===1?leftSideUp:!leftSideUp)) {
      // front arm up, back arm on hip
      rect(ctx2, frontX, armY-2, 4, 2, 2, jacket);
      rect(ctx2, backX, armY+2, 4, 2, 2, jacket);
    } else {
      // front arm on hip, back arm up
      rect(ctx2, frontX, armY+2, 4, 2, 2, jacket);
      rect(ctx2, backX, armY-2, 4, 2, 2, jacket);
    }
  } else {
    rect(ctx2, (dir===1?1:11), armY, 4, 2, 2, jacket);
    rect(ctx2, (dir===1?11:1), armY+1, 4, 2, 2, jacket);
  }
  // Face hint
  rect(ctx2, (dir===1?8:6), 5, 1, 1, 2, '#2a2a2a');

  // Props
  if (type === 'mother') {
    // stroller
    const sx = (dir===1? -6 : 14);
    rect(ctx2, sx, 12, 6, 2, 2, '#2a2a2a');
    rect(ctx2, sx+1, 11, 4, 1, 2, '#555b66');
  }
  if (type === 'oldman') {
    // cane: in threaten pose, angle cane outward/up; else vertical
    if (threaten) {
      // angled cane pixels near hand
      const baseX = (dir===1? 13 : 2);
      const sign = (dir===1? 1 : -1);
      // small diagonal from hand upward
      rect(ctx2, baseX, 8, 1, 1, 2, '#5b3a17');
      rect(ctx2, baseX + sign, 7, 1, 1, 2, '#5b3a17');
      rect(ctx2, baseX + sign*2, 6, 1, 1, 2, '#5b3a17');
      // lower shaft
      rect(ctx2, baseX, 9, 1, 5, 2, '#5b3a17');
    } else {
      const cx = (dir===1? 14 : 0);
      rect(ctx2, cx, 8, 1, 6, 2, '#5b3a17');
    }
  }
  if (type === 'hotgirl') {
    // small purse accent
    const pxX = (dir===1? 12 : 2);
    rect(ctx2, pxX, 10, 2, 2, 2, '#3b0e14');
  }
    return 'ok';
  })(hctx);

  // Overlay 32px cloth details (simple hem sway and lapel highlight)
  const S = 2; const rectHD = (cx,cy,w,h,color)=>{hctx.fillStyle=color;hctx.fillRect(cx|0,cy|0,w|0,h|0)};
  if (baseResult !== 'down' && state !== 'dying') {
    const wind = (typeof opts.windSway === 'number') ? opts.windSway : 0;
    const chestY = 7, chestH = 5, leftInnerX = 6, rightInnerX = 10;
    rectHD((leftInnerX-2)*S, chestY*S, 1, chestH*S, '#6d6d6d');
    rectHD((rightInnerX+1)*S, chestY*S, 1, chestH*S, '#6d6d6d');
    const sway = Math.round(wind*1.1);
    if (type === 'hotgirl') {
      // Dress hem sway (amplify slightly if dancing)
      const hemY = 13, hemH = 2;
      const danceAmp = (opts.dancing && (state === 'idle' || state === 'calm' || state === 'dance')) ? 2 : 1;
      const swayPix = Math.max(0, Math.round(sway * 0.3 * danceAmp));
      rectHD((2 + Math.max(0,-swayPix))*S, (hemY+hemH-1)*S, 6, 1, '#7c1321');
      rectHD((rightInnerX-1)*S, (hemY+hemH-1)*S, 7 + swayPix*S, 1, '#7c1321');
    } else {
      const hemY = 12, hemH = 2;
      rectHD((2 + Math.max(0,-Math.round(sway*0.3)))*S, (hemY+hemH-1)*S, 5, 1, '#2b2e35');
      rectHD((rightInnerX)*S, (hemY+hemH-1)*S, 5 + Math.max(0, Math.round(sway*0.3))*S, 1, '#2b2e35');
    }
  }
  // Blit back
  const old = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(hd, Math.floor(x * scale), Math.floor(y * scale), Math.floor(16 * scale), Math.floor(16 * scale));
  ctx.imageSmoothingEnabled = old;
}

// Boss sprite: intimidating coat, broader shoulders, red accents
export function drawBoss(ctx, x, y, scale, dir, state, phase, opts = {}) {
  // HD wrapper base
  if (!drawBoss._hd) { drawBoss._hd = document.createElement('canvas'); drawBoss._hd.width = 32; drawBoss._hd.height = 32; }
  const hd = drawBoss._hd; const hctx = hd.getContext('2d');
  hctx.imageSmoothingEnabled = false; hctx.clearRect(0,0,32,32);
  const JACKET = '#6e1f1f';
  const JACKET_DARK = '#4a1414';
  const HAIR = '#111';
  const GLASSES = '#0d0d0d';
  // Base at 2x
  rect(hctx, 3, 14, 3, 2, 2, '#111');
  rect(hctx, 10, 14, 3, 2, 2, '#111');
  rect(hctx, 3, 11, 10, 3, 2, '#23232a');
  rect(hctx, 2, 7, 12, 4, 2, JACKET);
  rect(hctx, 5, 2, 6, 5, 2, COLORS.skin);
  rect(hctx, 4, 2, 8, 2, 2, HAIR);
  rect(hctx, (dir===1?8:6), 4, 2, 1, 2, GLASSES);
  const armY = 8;
  rect(hctx, (dir === 1 ? 11 : 1), armY, 4, 2, 2, JACKET);
  rect(hctx, (dir === 1 ? 1 : 11), armY + 1, 4, 2, 2, JACKET_DARK);
  rect(hctx, 7, 8, 2, 2, 2, '#a82828');
  // Overlay lapel highlights + hem sway
  const S = 2; const rectHD = (cx,cy,w,h,color)=>{hctx.fillStyle=color;hctx.fillRect(cx|0,cy|0,w|0,h|0)};
  const wind = (typeof opts.windSway === 'number') ? opts.windSway : 0;
  const chestY = 7, chestH = 4, leftInnerX = 6, rightInnerX = 10;
  rectHD((leftInnerX-2)*S, chestY*S, 1, chestH*S, '#a04545');
  rectHD((rightInnerX+1)*S, chestY*S, 1, chestH*S, '#a04545');
  const hemY = 10, hemH = 2; const sway = Math.round(wind*1.0);
  rectHD((2 + Math.max(0,-Math.round(sway*0.3)))*S, (hemY+hemH-1)*S, 6, 1, JACKET_DARK);
  rectHD((rightInnerX)*S, (hemY+hemH-1)*S, 6 + Math.max(0, Math.round(sway*0.3))*S, 1, JACKET_DARK);
  // Blit back
  const old = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(hd, Math.floor(x * scale), Math.floor(y * scale), Math.floor(16 * scale), Math.floor(16 * scale));
  ctx.imageSmoothingEnabled = old;
}
