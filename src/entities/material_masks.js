// Per-entity per-pixel material masks (16x16). Clothes burn first (CLOTH), then SKIN/HAIR.
import { Materials as Mat } from '../sim/materials.js';

// Small helper to build simple humanoid masks shaped like the sprite silhouette.
// Pixels outside the body are AIR so flames never form a big rectangle.
export function makeHumanoidMask({ hasJacket = true, hasHat = false } = {}) {
  const w = 16, h = 16;
  const m = new Uint8Array(w * h);
  // Default to AIR everywhere
  for (let i = 0; i < w*h; i++) m[i] = Mat.AIR;

  // Head (skin) 6x4 roughly at (5..10, 2..5)
  for (let y = 2; y <= 5; y++) {
    for (let x = 5; x <= 10; x++) m[y*w + x] = Mat.SKIN;
  }
  // Hair cap (or hat) on top two rows
  if (hasHat) {
    for (let y = 1; y <= 2; y++) for (let x = 4; x <= 11; x++) m[y*w + x] = Mat.CLOTH;
  } else {
    for (let y = 1; y <= 2; y++) for (let x = 5; x <= 10; x++) m[y*w + x] = Mat.HAIR;
  }

  // Torso jacket (cloth) with tapered sides (y 7..11)
  if (hasJacket) {
    for (let y = 7; y <= 11; y++) {
      const inset = (y === 7) ? 2 : (y >= 10 ? 3 : 2); // taper near waist
      for (let x = 4 + inset; x <= 11 - inset; x++) m[y*w + x] = Mat.CLOTH;
    }
  } else {
    // Skin torso if no jacket
    for (let y = 7; y <= 11; y++) {
      const inset = (y === 7) ? 2 : (y >= 10 ? 3 : 2);
      for (let x = 4 + inset; x <= 11 - inset; x++) m[y*w + x] = Mat.SKIN;
    }
  }

  // Arms (cloth) short stubs around y 8..9 at both sides
  for (let y = 8; y <= 9; y++) {
    m[y*w + 3] = Mat.CLOTH; m[y*w + 12] = Mat.CLOTH;
  }

  // Legs/pants (cloth): two columns per leg (y 12..15)
  for (let y = 12; y <= 15; y++) {
    m[y*w + 4] = Mat.CLOTH; m[y*w + 5] = Mat.CLOTH; // left leg
    m[y*w + 10] = Mat.CLOTH; m[y*w + 11] = Mat.CLOTH; // right leg
  }

  // Bone spine (non-flammable) down the center of torso
  for (let y = 7; y <= 11; y++) m[y*w + 8] = Mat.BONE;

  return { mask: m, w, h };
}

export function makeGoonMask()   { return makeHumanoidMask({ hasJacket: true,  hasHat: false }); }
export function makeNPCMask()    { return makeHumanoidMask({ hasJacket: true,  hasHat: false }); }
export function makePlayerMask() { return makeHumanoidMask({ hasJacket: true,  hasHat: true  }); }