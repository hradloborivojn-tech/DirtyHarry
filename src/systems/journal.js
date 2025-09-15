/**
 * Journal (Case Notes) storage and panel rendering.
 * Keeps the notes array and open/close state. Rendering is pixel-aware with INTERNAL_SCALE.
 */
import { VW, INTERNAL_SCALE, COLORS } from '../core/constants.js';

export class Journal {
  constructor() {
    this.notes = [];
    this.open = false;
  }

  add(note) {
    this.notes.push(note);
  }

  toggle() {
    this.open = !this.open;
  }

  draw(ctx) {
    if (!this.open) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(8, 24, VW-16, 60);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(8, 24, VW-16, 60);
    ctx.fillStyle = '#cbd1ff';

    const drawTextHD = (text, x, y, px = 6) => {
      const hd = INTERNAL_SCALE;
      const oldFont = ctx.font;
      ctx.font = `${px*hd}px monospace`;
      ctx.save(); ctx.scale(1/hd, 1/hd);
      ctx.fillText(text, Math.floor(x*hd), Math.floor(y*hd));
      ctx.restore();
      ctx.font = oldFont;
    };

    drawTextHD('Case Notes', 12, 30, 7);
    if (this.notes.length === 0) {
      drawTextHD('No notes yet. Talk to people, investigate items.', 12, 42, 6);
    } else {
      let y = 42;
      for (const note of this.notes.slice(-6)) {
        drawTextHD('- ' + note, 12, y, 6);
        y += 9;
      }
    }
    ctx.restore();
  }
}