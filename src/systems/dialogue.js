/**
 * Dialogue manager with single active bubble + queue.
 * Use say() to push messages; call update(dt) then draw(ctx,...).
 */
import { VW } from '../core/constants.js';
import { drawSpeechBubble } from '../sprites.js';

export class Dialogue {
  constructor() {
    this.current = null; // {text,x,y,life,speaker,entity,tag}
    this.queue = [];
  }

  say(text, x, y, time = 1.5, meta = {}) {
    const msg = { text, x, y, life: time, speaker: meta.speaker || 'system', entity: meta.entity || null, tag: meta.tag || null };
    if (!this.current) this.current = msg; else this.queue.push(msg);
  }

  clear() {
    this.current = null; this.queue.length = 0;
  }

  active() { return !!this.current; }

  update(dt) {
    if (!this.current) return;
    this.current.life -= dt;
    if (this.current.life <= 0) {
      this.current = this.queue.shift() || null;
    }
  }

  draw(ctx, cameraX) {
    if (!this.current) return;
    const s = this.current;
    drawSpeechBubble(ctx, s.text, s.x - cameraX, s.y, 1, { speaker: s.speaker || 'system', maxWidth: VW - 16 });
  }
}