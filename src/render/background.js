// Background & mid-ground layers, with enhanced skyscraper windows and subtle aesthetics
import { COLORS } from '../sprites.js';
import { VW, VH, GROUND_Y } from '../core/constants.js';
import { stars, buildings, covers, bgTraffic, cameraX, telephoneBooth } from '../core/state.js';

export function drawBackground(ctx, t) {
  // Midnight gradient
  const g = ctx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0, '#090a10');
  g.addColorStop(1, '#04050a');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,VW,VH);

  // Stars twinkle
  ctx.fillStyle = '#cbd1ff';
  for (const s of stars) {
    const sx = s.x - cameraX * 0.2;
    if (sx < -2 || sx > VW + 2) continue;
    const sy = s.y + Math.sin(t * 0.55 + s.tw) * 0.6;
    ctx.fillRect((sx|0), (sy|0), 1, 1);
  }

  // Skyline silhouettes with close windows grid
  for (const b of buildings) {
    const bx = b.x - cameraX*0.8;
    if (bx + b.w < -10 || bx > VW + 10) continue;

    // Body with soft vertical shade
    ctx.fillStyle = '#0f1722';
    ctx.fillRect(bx|0, (GROUND_Y - b.h)|0, b.w, b.h);
    const grad = ctx.createLinearGradient(0, GROUND_Y - b.h, 0, GROUND_Y);
    grad.addColorStop(0, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(bx|0, (GROUND_Y - b.h)|0, b.w, b.h);

    // Windows: slightly larger 2x2 blocks, denser spacing for “skyscraper” look
    for (const w of b.windows) {
      const wx = w.x - cameraX*0.8;
      if (wx < -2 || wx > VW + 2) continue;
      if (w.lit) {
        ctx.save();
        // A muted, cool amber palette so skyline doesn’t go yellow
        const flicker = 0.75 + 0.25 * Math.sin((t*5 + (w.x*0.13))%Math.PI);
        ctx.globalAlpha = 0.5 + 0.4 * flicker;
        ctx.fillStyle = '#3f3a22'; // dim core
        ctx.fillRect(wx|0, w.y|0, 2, 2);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#6a6238'; // small highlight hint
        ctx.fillRect((wx|0), w.y|0, 1, 1);
        ctx.restore();
        // Silhouette: a tiny dark figure occasionally visible
        if (w.silTimer > 0) {
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect((wx|0) - 0, (w.y|0) - 1, 2, 3);
        }
      }
    }
  }

  // Background tiny traffic (queue) in front of skyline
  for (const c of bgTraffic) {
    const x = c.x - cameraX * 0.6;
    if (x + c.w < -10 || x > VW + 10) continue;
    ctx.fillStyle = c.color;
    ctx.fillRect((x|0), c.y|0, c.w, c.h);
    // Simple solid headlights/tails
    if (c.dir === 1) {
      ctx.fillStyle = '#fff3b4'; ctx.fillRect(((x + c.w)|0), c.y|0, 2, 1);
      ctx.fillStyle = '#c8281e'; ctx.fillRect(((x - 1)|0), (c.y + 1)|0, 1, 1);
    } else {
      ctx.fillStyle = '#fff3b4'; ctx.fillRect(((x - 2)|0), c.y|0, 2, 1);
      ctx.fillStyle = '#c8281e'; ctx.fillRect(((x + c.w)|0), (c.y + 1)|0, 1, 1);
    }
  }

  // Ground
  ctx.fillStyle = '#212228';
  ctx.fillRect(0, GROUND_Y, VW, VH-GROUND_Y);

  // Covers
  ctx.fillStyle = '#2b2e35';
  for (const c of covers) {
    const cx = c.x - cameraX;
    if (cx + c.w < 0 || cx > VW) continue;
    ctx.fillRect(cx|0, c.y|0, c.w, c.h);
  }

  // Telephone booth body (door overlay is drawn in a foreground layer)
  drawTelephoneBoothBody(ctx);
  drawStreetGrime(ctx);

  // Subtle vignette to frame the action
  drawVignette(ctx);
}

function drawTelephoneBoothBody(ctx) {
  const bx = telephoneBooth.x - cameraX;
  const by = telephoneBooth.y;
  const bw = telephoneBooth.w;
  const bh = telephoneBooth.h;
  if (bx + bw < -2 || bx > VW + 2) return;

  const RED = '#b01217', RED_D = '#7d0e12', RED_L = '#e03535', GLASS = '#121724', FRAME = '#2a2a2a';
  ctx.fillStyle = RED; ctx.fillRect((bx|0), (by|0), bw, bh);
  ctx.fillStyle = RED_D; ctx.fillRect(((bx + bw - 2)|0), ((by + 1)|0), 2, bh - 2);
  const gx = (bx + 3)|0, gy = (by + 8)|0, gw = bw - 6, gh = bh - 12;
  ctx.fillStyle = GLASS; ctx.fillRect(gx, gy, gw, gh);
  ctx.fillStyle = FRAME;
  ctx.fillRect(gx + (gw>>1), gy, 1, gh);
  ctx.fillRect(gx, gy + Math.floor(gh/3), gw, 1);
  ctx.fillRect(gx, gy + Math.floor(2*gh/3), gw, 1);
  const signH = 4;
  ctx.fillStyle = RED_L; ctx.fillRect(((bx + 1)|0), ((by + 1)|0), bw - 2, signH);
  ctx.fillStyle = '#eaeaea';
  ctx.fillRect(((bx + 3)|0), ((by + 2)|0), 2, 1);
  ctx.fillRect(((bx + 6)|0), ((by + 2)|0), 2, 1);
  ctx.fillRect(((bx + 9)|0), ((by + 2)|0), 2, 1);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(((bx + 2)|0), ((by + 7)|0), 1, bh - 10);
  ctx.fillStyle = '#cfcfcf';
  ctx.fillRect(((bx + bw - 4)|0), ((by + Math.max(12, Math.floor(bh*0.55)))|0), 1, 2);

  // Ground shadow
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(((bx + 1)|0), GROUND_Y - 1, bw - 2, 1);
  ctx.globalAlpha = 1;
}

function drawStreetGrime(ctx) {
  ctx.strokeStyle = '#2a2c31';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.28;
  for (let wx = 0; wx < VW; wx += 6) {
    if (((wx/8)|0)%2===0) continue;
    ctx.beginPath();
    ctx.moveTo(wx, GROUND_Y);
    ctx.lineTo(wx+6, VH);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawTrafficForeground(ctx, t, traffic, cameraX) {
  ctx.save();
  for (const c of traffic) {
    const x = c.x - cameraX * 1.2;
    ctx.fillStyle = c.color;
    ctx.fillRect((x|0), c.y|0, c.w, c.h);
    ctx.fillStyle = '#121724';
    const cabH = Math.max(4, Math.round(c.h * 0.35));
    ctx.fillRect(((x + c.w*0.15)|0), (c.y - cabH + 1)|0, Math.round(c.w*0.4), cabH - 1);
    ctx.fillStyle = c.wheelColor;
    const wheelY = c.y + c.h - 2;
    ctx.fillRect(((x + 5)|0), wheelY|0, 3, 3);
    ctx.fillRect(((x + c.w - 8)|0), wheelY|0, 3, 3);
    ctx.fillStyle = '#fff3b4';
    if (c.dir === 1) ctx.fillRect(((x + c.w)|0), (c.y + Math.max(2, Math.floor(c.h*0.25)))|0, 3, 1);
    else ctx.fillRect(((x - 3)|0), (c.y + Math.max(2, Math.floor(c.h*0.25)))|0, 3, 1);
  }
  ctx.restore();
}

export function drawVignette(ctx) {
  // Soft vignette using radial gradient
  const r = Math.max(VW, VH) * 0.75;
  const cx = VW/2, cy = VH/2;
  const gradient = ctx.createRadialGradient(cx, cy, r*0.4, cx, cy, r);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,VW,VH);
}