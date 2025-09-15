/**
 * HUD rendering: energy bar, Molotov inventory + charge bar, item icons, boss HP, narrative banner.
 * Provides a simple typewriter narrative helper.
 */
import { VW, INTERNAL_SCALE, COLORS } from '../core/constants.js';

export class Narrative {
  constructor() {
    this.target = '';
    this.typed = 0;
    this.speed = 30; // cps
    this.hold = 0;
    this.holdAfterComplete = 2.0;
    this.queue = [];
  }

  set(text) {
    if (!text) return;
    if (this.typed < this.target.length || this.hold > 0) {
      this.queue.push(text);
    } else {
      this.target = text;
      this.typed = 0;
      this.hold = 0;
    }
  }

  update(dt) {
    if (this.typed < this.target.length) {
      this.typed = Math.min(this.target.length, this.typed + this.speed * dt);
      if (this.typed >= this.target.length) this.hold = this.holdAfterComplete;
    } else if (this.queue.length > 0) {
      if (this.hold > 0) {
        this.hold -= dt;
        if (this.hold <= 0) {
          const next = this.queue.shift();
          this.target = next;
          this.typed = 0;
          this.hold = 0;
        }
      }
    }
  }

  text() {
    return this.target.slice(0, Math.floor(this.typed));
  }
}

export function drawHUD(ctx, state) {
  // state: { player:{hp,maxHp,molotovCount,molotovState,charge}, boss?:{hp,maxHp,alive}, narrative:Narrative }
  const bx = 4, by = 4;

  // Energy
  for (let i = 0; i < state.player.maxHp; i++) {
    ctx.strokeStyle = '#444';
    ctx.strokeRect(bx + i*10, by, 8, 4);
    if (i < state.player.hp) {
      ctx.fillStyle = COLORS.blood;
      ctx.fillRect(bx + i*10 + 1, by + 1, 6, 2);
    }
  }

  // Molotov inventory + state
  if (state.player.molotovCount > 0 || state.player.molotovState !== 'inactive') {
    const molotovX = bx + state.player.maxHp * 10 + 8;
    const molotovY = by;
    ctx.fillStyle = '#2a4a2a'; ctx.fillRect(molotovX, molotovY, 3, 4);
    ctx.fillStyle = '#f5f5dc'; ctx.fillRect(molotovX + 1, molotovY - 1, 1, 2);
    ctx.fillStyle = '#fff'; ctx.font = '6px monospace';
    ctx.fillText(String(state.player.molotovCount), molotovX + 5, molotovY + 3);

    if (state.player.molotovState === 'charging') {
      const chargeW = 16, chargeH = 2;
      const chargeX = molotovX, chargeY = molotovY + 6;
      ctx.strokeStyle = '#444'; ctx.strokeRect(chargeX, chargeY, chargeW, chargeH);
      const fillW = Math.floor(chargeW * (state.player.charge ?? 0));
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(chargeX + 1, chargeY + 1, Math.max(0, fillW - 1), chargeH - 2);
    } else if (state.player.molotovState === 'preparing' || state.player.molotovState === 'lit') {
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(molotovX + 1, molotovY - 2, 1, 1);
    }
  }

  // Narrative banner
  const drawOutlinedText = (text, x, y, color = '#d9e0ff', outline = '#000', px = 5) => {
    const hd = INTERNAL_SCALE;
    const old = ctx.font;
    ctx.font = `${px*hd}px monospace`;
    ctx.save(); ctx.scale(1/hd, 1/hd);
    const tx = Math.floor(x*hd), ty = Math.floor(y*hd), o = hd;
    ctx.fillStyle = outline;
    ctx.fillText(text, tx + o, ty);
    ctx.fillText(text, tx - o, ty);
    ctx.fillText(text, tx, ty + o);
    ctx.fillText(text, tx, ty - o);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, ty);
    ctx.restore();
    ctx.font = old;
  };

  const bannerY = 12, bannerH = 10;
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, bannerY, VW, bannerH+2);
  ctx.globalAlpha = 1;
  const narrText = state.narrative.text();
  const maxWidth = VW - 8;
  // simple size selection
  const px = narrText.length > 60 ? 4 : 5;
  drawOutlinedText(narrText, 4, bannerY + 2, '#d9e0ff', '#000', px);

  // Boss HP
  if (state.boss && state.boss.alive) {
    const w = 60, h = 4;
    const x = Math.floor(VW/2 - w/2), y = 4;
    ctx.strokeStyle = '#444'; ctx.strokeRect(x, y, w, h);
    const pct = Math.max(0, Math.min(1, state.boss.hp / state.boss.maxHp));
    ctx.fillStyle = '#a82828';
    ctx.fillRect(x + 1, y + 1, Math.floor((w-2) * pct), h - 2);
  }
}