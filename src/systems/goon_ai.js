/**
 * Goon AI: smoking idle loop, fear when aimed at, wounded behavior, run/cover, simple chatter.
 * Draw function uses drawGoon from sprites.js and handles small overlays like exhale puff.
 */
import { GROUND_Y } from '../core/constants.js';
import { drawGoon, drawSpeechBubble } from '../sprites.js';

export class GoonSystem {
  constructor(rng, dialogue, particles, covers) {
    this.rng = rng;
    this.dialogue = dialogue;
    this.particles = particles;
    this.covers = covers;
    this.list = [];
  }

  setGoons(goons) {
    this.list = goons;
  }

  nearestTo(x) {
    let g = null, best = 1e9;
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = Math.abs((e.x+8) - x);
      if (d < best) { best = d; g = e; }
    }
    return g;
  }

  update(dt, player, t) {
    let nearest = null, nearestD = 1e9;
    for (const g of this.list) {
      // death anim
      if (g.state === 'dying') {
        g.deathT = (g.deathT || 0) + dt * 1.8;
        if (!g._bled && g.deathT > 0.05) { this.particles.spawnBlood(g.x + 8, g.y + 8); g._bled = true; }
        if (!g._pooled && g.deathT > 0.35) { this.particles.spawnBloodPool(g.x + 8, GROUND_Y - 1, 12 + Math.floor(this.rng()*6)); g._pooled = true; }
        if (g.deathT >= 1) { g.state = 'dead'; g.alive = false; }
        continue;
      }
      if (!g.alive) continue;

      const d = Math.abs((g.x+8) - (player.x+8));
      if (d < nearestD) { nearestD = d; nearest = g; }

      // update limb boxes
      g.headBox.x = g.x + 5; g.headBox.y = g.y + 2;
      g.leftArmBox.x = g.x + 1; g.leftArmBox.y = g.y + 8;
      g.rightArmBox.x = g.x + 11; g.rightArmBox.y = g.y + 8;
      g.bodyBox.x = g.x + 3; g.bodyBox.y = g.y + 7;

      g.phase += dt * 0.5;

      // burning jitter handled by caller (status/burning) if present

      // smoking loop
      if (g.state.startsWith('smoke')) {
        const p = g.phase % 4;
        if (p < 1) g.state = 'smoke_hold';
        else if (p < 2) g.state = 'smoke_raise';
        else if (p < 3) { g.state = 'smoke_inhale'; }
        else { g.state = 'smoke_exhale'; if ((p-dt)%4<3 && p>=3) this.particles.spawnSmoke(g.x + (g.dir===1?16:0), g.y + 9, g.dir); }
      }

      // chatter (only nearest)
      g.talkCooldown = (g.talkCooldown || 0) - dt;
      if (nearest === g && nearestD < 34 && g.talkCooldown <= 0 && g.state !== 'wounded') {
        const lines = ['That a .44?','Easy, cop...','Nice coat.','Beat it, hero.','You lost?'];
        const text = lines[Math.floor(this.rng() * lines.length)];
        this.dialogue.say(text, g.x + 2, g.y - 2, 1.4, { speaker: 'npc', entity: g, tag: 'goon' });
        g.talkCooldown = 3 + this.rng() * 2;
      }

      // fear when aimed at
      const inFront = (player.dir === 1 && player.x < g.x) || (player.dir === -1 && player.x > g.x);
      if (player.aiming && inFront && d < 80 && g.state !== 'wounded') {
        g.state = 'scared';
        g.fear = Math.min(1, (g.fear || 0) + dt * 2);
        const away = Math.sign(g.x - player.x);
        g.dir = away;
        g.x += away * 20 * dt;
      } else {
        g.fear = Math.max(0, (g.fear||0) - dt);
        if (g.state === 'scared' && g.fear <= 0.05) g.state = 'smoke_hold';
      }

      // aggro fireback timer is handled in combat module typically; you can set g.aggroTimer in response to shots

      // wounded -> run to cover
      if (g.state === 'wounded') {
        g.screamTimer = (g.screamTimer || 0) - dt;
        if (g.screamTimer <= 0) g.screamTimer = 1.2;
        if (!g.coverTarget) {
          let best = null, bestD = 1e9;
          for (const c of this.covers) {
            const cx = c.x + c.w/2;
            const dd = Math.abs(cx - (g.x+8));
            if (dd < bestD) { bestD = dd; best = c; }
          }
          g.coverTarget = best;
        }
        if (g.coverTarget) {
          const targetX = g.coverTarget.x + (g.x < g.coverTarget.x ? -2 : g.coverTarget.w+2);
          g.dir = targetX > g.x ? 1 : -1;
          g.x += Math.sign(targetX - g.x) * 30 * dt;
          if (Math.abs(targetX - g.x) < 2) g.state = 'cover';
        }
      }

      if (g.state === 'run') {
        g.x += (g.dir===1?40:-40) * dt;
      }
    }
  }

  draw(ctx, cameraX, t) {
    for (const g of this.list) {
      const goonOpts = { windSway: Math.sin(t * 0.35) * 1.0, deathT: (g.state==='dead'?1:(g.deathT||0)) };
      if (g.state === 'scared') ctx.globalAlpha = 0.9;
      drawGoon(ctx, Math.round(g.x - cameraX), Math.round(g.y), 1, g.dir, g.state, g.phase, g.woundedArm, goonOpts);
      ctx.globalAlpha = 1;
      if (g.state === 'smoke_exhale' && Math.floor(t*2)%2===0) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = 'rgba(80,80,100,0.7)';
        const faceDir = g.dir;
        ctx.beginPath();
        ctx.arc(g.x - cameraX + (faceDir===1?12:4), g.y + 6, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (g.state === 'wounded' && g.screamTimer > 0) {
        drawSpeechBubble(ctx, 'HELP!', g.x - cameraX + 2, g.y - 2, 1, { speaker: 'npc', maxWidth: 192 - 16 });
      }
    }
  }
}