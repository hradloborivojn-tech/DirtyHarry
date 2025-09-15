/**
 * NPC system: fear, flee, calm, idle idles and special behaviors (oldman yell, kid ball, hotgirl dance).
 */
import { WORLD_W, GROUND_Y } from '../core/constants.js';
import { drawNPC, drawSpeechBubble } from '../sprites.js';

export class NPCSystem {
  constructor(dialogue) {
    this.dialogue = dialogue;
    this.list = [];
    this.lastGunshotTime = -1000; // seconds
  }

  setNPCs(npcs) {
    this.list = npcs;
  }

  notifyGunshot(t) {
    this.lastGunshotTime = t;
  }

  update(dt, t, player) {
    for (const n of this.list) {
      n.panicTimer = (n.panicTimer || 0);
      // burning state updated by caller

      // dying anim to down
      if (n.state === 'dying') {
        n.deathT = (n.deathT || 0) + dt * 1.4;
        if (n.deathT >= 1) { n.state = 'down'; }
        continue;
      }

      // decay fear
      if (n.state !== 'down') n.fear = Math.max(0, (n.fear||0) - dt*0.2);

      // aimed at fear (except hotgirl)
      const dx = (n.x + 8) - (player.x + 8);
      const inSight = (player.dir === 1 && dx > 0) || (player.dir === -1 && dx < 0);
      if (player.aiming && Math.abs(dx) < 70 && inSight && n.state !== 'down' && n.state !== 'dying' && n.type !== 'hotgirl') {
        n.state = 'afraid';
        n.fear = Math.min(1, (n.fear||0) + dt*2);
      }

      if (n.state === 'flee') {
        n.x += (dx > 0 ? 30 : -30) * dt;
        if (Math.abs(dx) > 120) {
          n.panicTimer += dt;
          if (n.panicTimer > 1.5) n.state = 'afraid';
        }
      }

      const notThreatened = !player.aiming && (t - this.lastGunshotTime) > 4;
      if ((n.state === 'afraid' || n.state === 'flee') && notThreatened && Math.abs(dx) > 40) {
        n.panicTimer += dt;
        if (n.panicTimer > 2.5 || (n.fear||0) < 0.15) {
          n.state = 'calm';
          n.fear = Math.max(0, (n.fear||0) - 0.4);
        }
      }
      if (n.state === 'calm' && !player.aiming && (t - this.lastGunshotTime) > 6) {
        n.fear = Math.max(0, (n.fear||0) - dt*0.5);
        if ((n.fear||0) <= 0.05) n.state = 'idle';
      }

      // post-calm clue auto-nudge handled by orchestrator via proximity if desired

      // idle animations
      n.idleT = (n.idleT || 0) + dt;
      n._sy = 0; n._sx = 0;
      if (n.state === 'idle' || n.state === 'calm' || n.state === 'dance') {
        if (n.type === 'mother') {
          n._sx = Math.sin(n.idleT * 1.4) * 0.4;
          n._sy = Math.sin(n.idleT * 1.2) * 0.3;
        }
        if (n.type === 'kid') {
          const phase = (Math.sin(n.idleT * 3) + 1) * 0.5;
          const by = n.y + 12 - Math.floor(phase * 3);
          if (!n._ball) n._ball = { x: n.x + (n.dir===1? 14 : -2), y: by, life: 0.2 };
          n._ball.x = n.x + (n.dir===1? 14 : -2);
          n._ball.y = by;
        }
        if (n.type === 'oldman') {
          const playerSide = ((player.x + player.w/2) < (n.x + 8)) ? -1 : 1;
          if (typeof n._lastSide !== 'number') n._lastSide = playerSide;
          const close = Math.abs((n.x + 8) - (player.x + player.w/2)) < 14;
          if (!n._yelledOnce && close && playerSide !== n._lastSide) {
            n._yelledOnce = true;
            n.state = 'threaten';
            n._threatT = 0.9;
            n.dir = (player.x + player.w/2) > (n.x + 8) ? 1 : -1;
            this.dialogue.say('Get off my lawn!', n.x + 2, n.y - 4, 1.2, { speaker: 'npc', entity: n, tag: 'yell' });
          }
          n._lastSide = playerSide;
          if (n.state === 'threaten') {
            n._threatT -= dt;
            n._sx = Math.sin(n.idleT * 24) * 0.3;
            if (n._threatT <= 0) { n.state = 'idle'; n._threatT = 0; }
          } else {
            n._sy = Math.sin(n.idleT * 0.9) * 0.2;
          }
        }
        if (n.type === 'hotgirl') {
          n.state = 'dance';
          const dtPhase = n.idleT || 0;
          const sxAmp = 1.0, syAmp = 1.0;
          n._sx = Math.round(Math.sin(dtPhase * 2.4) * sxAmp);
          n._sy = Math.round(Math.sin(dtPhase * 1.8 + 0.6) * syAmp);
          n._seduceActive = false;
        }
      }

      // clamp
      n.x = Math.max(0, Math.min(WORLD_W - 16, n.x));
    }
  }

  draw(ctx, cameraX, t) {
    for (const n of this.list) {
      const ox = Math.round((n._sx || 0));
      const oy = Math.round((n._sy || 0));
      const npcOpts = { windSway: Math.sin(t * 0.35) * 1.0, deathT: (n.state==='down'?1:(n.deathT||0)) };
      if (n.type === 'hotgirl') {
        const danceLike = (n.state === 'idle' || n.state === 'calm' || n.state === 'dance');
        if (danceLike) {
          npcOpts.dancing = true;
          const phase = (n.idleT || 0) * 1.0;
          npcOpts.dancePhase = phase - Math.floor(phase);
        }
      }
      drawNPC(ctx, Math.round(n.x - cameraX + ox), Math.round(n.y + oy), 1, n.type, n.state, n.dir || 1, npcOpts);
      if (n.state === 'afraid' && Math.floor(t*2)%2===0 && !this.dialogue.active()) {
        drawSpeechBubble(ctx, "Don't shoot!", n.x - cameraX + 2, n.y - 2, 1, { speaker: 'npc', maxWidth: 192 - 16 });
      }
      if (n._ball) {
        ctx.fillStyle = '#b23';
        ctx.fillRect(Math.round(n._ball.x - cameraX), Math.round(n._ball.y), 1, 1);
      }
    }
  }
}