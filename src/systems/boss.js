/**
 * Boss system: spawn inside booth, cutscene opening, arena lock, taunts, slow projectiles high/low lanes.
 */
import { VW, WORLD_W, GROUND_Y } from '../core/constants.js';
import { drawBoss } from '../sprites.js';

export class BossSystem {
  constructor(dialogue) {
    this.dialogue = dialogue;
    this.reset();
  }

  reset() {
    this.boss = null;
    this.arena = null;
    this.active = false;
    this.victory = false;
    this.cutscene = { active: false, phase: 'idle', timer: 0, lockLeftX: 0, exitTargetX: 0 };
    this.introDone = false;
    this.bullets = [];
    this._nextTaunt = 0;
  }

  spawn(telephoneBooth) {
    const bx = telephoneBooth.x + 4;
    const by = GROUND_Y - 16;
    this.boss = {
      x: bx, y: by, w: 16, h: 16, dir: -1,
      hp: 12, maxHp: 12, alive: true, state: 'idle',
      fireCd: 1.2, bodyBox: {x: bx+3, y: by+4, w: 10, h: 9},
      invincible: true, hidden: true,
    };
    telephoneBooth.doorOpen = 0;
  }

  startFight(player, telephoneBooth, silent = false) {
    if (!this.boss || this.active) return;
    const leftBarrier = Math.max(0, Math.floor(player.x));
    const rightBarrier = WORLD_W - 8;
    this.arena = { left: leftBarrier, right: rightBarrier };
    this.active = true;
    this.boss.invincible = false;
    this.boss.state = 'intro';
    this.boss.fireCd = 1.0;
    if (!silent) {
      this.dialogue.say('Boss: You finally made it, Harry.', this.boss.x + 2, this.boss.y - 4, 2.2, { speaker: 'npc', tag: 'boss-intro' });
    }
    this.introDone = true;
  }

  triggerCutsceneIfReady(player, camera, telephoneBooth) {
    if (!this.boss || this.active || this.cutscene.active || this.introDone) return;
    const bx = telephoneBooth.x - camera.x;
    const boothVisible = (bx + telephoneBooth.w >= 0 && bx <= VW);
    const nearRight = player.x > WORLD_W - 120;
    if (boothVisible && nearRight) {
      this.cutscene.active = true;
      this.cutscene.phase = 'opening';
      this.cutscene.timer = 0;
      this.cutscene.lockLeftX = Math.floor(player.x);
      this.cutscene.exitTargetX = telephoneBooth.x - 18;
      this.boss.invincible = true;
      this.boss.state = 'idle';
      this.boss.x = telephoneBooth.x + 4;
      this.boss.hidden = false;
    }
  }

  updateCutscene(dt, player, camera, telephoneBooth) {
    if (!this.cutscene.active) return;
    // lock input handled by orchestrator; focus camera to booth
    const focusX = Math.max(0, Math.min(WORLD_W - VW, telephoneBooth.x - VW/2 + 4));
    camera.focus(focusX);
    if (this.cutscene.phase === 'opening') {
      this.cutscene.timer += dt;
      telephoneBooth.doorOpen = Math.min(1, telephoneBooth.doorOpen + dt * 0.8);
      if (telephoneBooth.doorOpen >= 1) {
        this.cutscene.phase = 'exit';
        this.cutscene.timer = 0;
      }
    } else if (this.cutscene.phase === 'exit') {
      const target = this.cutscene.exitTargetX;
      const stepSpeed = 18;
      const dir = Math.sign(target - this.boss.x) || -1;
      this.boss.dir = dir;
      if (Math.abs(target - this.boss.x) > 1) {
        this.boss.x += dir * stepSpeed * dt;
      } else {
        this.boss.x = target;
        this.boss.dir = -1;
        this.cutscene.phase = 'taunt';
        this.cutscene.timer = 0;
        this.dialogue.say('BRING IT ON, HARRY!', this.boss.x + 4, this.boss.y - 6, 1.6, { speaker: 'npc', tag: 'boss-taunt-start' });
      }
    } else if (this.cutscene.phase === 'taunt') {
      this.cutscene.timer += dt;
      if (this.cutscene.timer > 1.7 && !this.dialogue.active()) {
        this.cutscene.phase = 'done';
        this.cutscene.timer = 0;
        this.introDone = true;
        this.startFight(player, telephoneBooth, true);
        if (this.arena) this.arena.left = Math.max(this.arena.left, this.cutscene.lockLeftX);
        this.cutscene.active = false;
      }
    }
  }

  fireProjectile(dir, lane) {
    const speed = 60;
    const mx = dir === 1 ? this.boss.x + 16 : this.boss.x - 2;
    const my = this.boss.y + 8 + (lane === 'high' ? -6 : 5);
    this.bullets.push({ x: mx, y: my, w: 3, h: 2, vx: speed * dir, vy: 0, life: 6, lane });
  }

  taunt(t, reason) {
    if (!this.boss || !this.boss.alive) return;
    if (t < this._nextTaunt) return;
    const insults = reason === 'hit'
      ? ['Boss: Cute trick, cop.','Boss: That all you got?','Boss: You scratch easy.']
      : ['Boss: Gonna duck forever?','Boss: Try keepin\' up.','Boss: You\'re slow, Harry.'];
    const line = insults[(Math.random()*insults.length)|0];
    this.dialogue.say(line, this.boss.x + 2, this.boss.y - 4, 1.6, { speaker: 'npc', tag: 'boss-taunt' });
    this._nextTaunt = t + 3 + Math.random()*2;
  }

  update(dt, t, player, camera) {
    if (!this.active) {
      // pre-fight: when intro done and approached, start
      if (this.boss && this.introDone && !this.cutscene.active) {
        this.boss.bodyBox.x = this.boss.x + 3; this.boss.bodyBox.y = this.boss.y + 4;
        const approach = 300;
        if ((player.x + player.w) >= (this.boss.x - approach)) {
          this.startFight(player);
        }
      }
      return;
    }
    if (!this.boss) return;

    // clamp player into arena if active
    player.x = Math.max(this.arena.left, Math.min(this.arena.right - player.w, player.x));
    // face player
    this.boss.dir = (player.x + 8) > (this.boss.x + 8) ? 1 : -1;
    this.boss.bodyBox.x = this.boss.x + 3; this.boss.bodyBox.y = this.boss.y + 4;

    // camera focus to arena center
    const arenaMid = Math.floor((this.arena.left + this.arena.right) / 2) - VW/2 + 10;
    camera.focus(Math.max(0, Math.min(WORLD_W - VW, arenaMid)));

    if (this.boss.state === 'intro') {
      this.boss.fireCd -= dt;
      if (this.boss.fireCd <= 0) { this.boss.state = 'fight'; this.boss.fireCd = 0.8; }
      return;
    }
    if (!this.boss.alive) {
      this.active = false;
      this.victory = true;
      return;
    }

    // fire pattern
    this.boss.fireCd -= dt;
    if (this.boss.fireCd <= 0) {
      const lane = Math.random() < 0.5 ? 'high' : 'low';
      const dir = this.boss.dir;
      this.fireProjectile(dir, lane);
      this.boss.fireCd = 1.2 + Math.random()*0.4;
      this.taunt(t, 'fire');
    }

    // update boss bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) this.bullets.splice(i,1);
    }
  }

  draw(ctx, cameraX) {
    if (this.boss && !this.boss.hidden) {
      drawBoss(ctx, Math.round(this.boss.x - cameraX), Math.round(this.boss.y), 1, this.boss.dir, this.boss.state, 0, { windSway: Math.sin(performance.now()*0.00035) });
    }
    // bullets
    ctx.fillStyle = '#a82828';
    for (const b of this.bullets) {
      ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);
    }
  }
}