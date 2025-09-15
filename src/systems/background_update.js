// Animates window lights and silhouettes in the skyline
import { buildings } from '../core/state.js';
import { rng } from '../core/state.js';

export function updateSkyline(dt) {
  for (const b of buildings) {
    b.lightTimer -= dt;
    if (b.lightTimer <= 0) {
      b.lightTimer = 1.2 + rng()*3.5;
      const w = b.windows[(Math.random()*b.windows.length)|0];
      if (w) {
        const turningOn = rng() < 0.55;
        if (turningOn) {
          w.lit = true;
          // Occasionally show silhouette behind a newly lit window
          if (rng() < 0.22) w.silTimer = 0.8 + rng()*1.6;
        } else {
          // Sometimes turn off
          if (rng() < 0.5) w.lit = false;
        }
      }
    }
    for (const w of b.windows) {
      if (w.silTimer > 0) w.silTimer -= dt;
    }
  }
}