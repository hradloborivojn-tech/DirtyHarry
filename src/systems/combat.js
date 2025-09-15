/**
 * Combat for the player and generic bullets (player and goons).
 * Responsible for firing magnum, updating bullets, applying hits to goons/NPC/boss.
 */
import { WORLD_W } from '../core/constants.js';
import { aabb } from '../core/aabb.js';

export class CombatSystem {
  constructor(particles, camera, dialogue) {
    this.particles = particles;
    this.camera = camera;
    this.dialogue = dialogue;
    this.playerBullets = [];
    this.enemyBullets = [];
  }

  fireMagnum(px, py, dir, damage) {
    this.playerBullets.push({ x: px, y: py, w: 3, h: 2, vx: 220 * dir, vy: 0, life: 0.8, damage });
    this.particles.spawnMuzzle(px + (dir>0?2:-2), py+1, dir, Math.max(1.0, damage*1.2));
    this.particles.spawnSparks(px, py, dir, 6, 1);
    const shakeAdd = damage === 3 ? 2.5 : (damage === 2 ? 1.6 : 0.8);
    this.camera.addShake(shakeAdd);
  }

  goonFire(x, y, dir) {
    this.enemyBullets.push({ x, y, w: 2, h: 2, vx: 140 * dir, vy: 0, life: 1.2 });
  }

  update(dt, world) {
    // player bullets
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -10 || b.x > WORLD_W+10 || b.life <= 0) { this.playerBullets.splice(i,1); continue; }

      const box = { x: b.x, y: b.y, w: b.w, h: b.h };
      let consumed = false;
      // boss
      if (world.boss && world.boss.alive && !world.boss.hidden && aabb(box, world.boss.bodyBox)) {
        this.playerBullets.splice(i,1); consumed = true;
        if (!world.bossActive || world.boss.invincible) {
          this.particles.spawnSparks(world.boss.bodyBox.x + world.boss.bodyBox.w/2, world.boss.bodyBox.y + 6, 1, 1);
        } else {
          world.boss.hp = Math.max(0, world.boss.hp - Math.max(1, b.damage||1));
          this.particles.spawnBlood(world.boss.bodyBox.x + world.boss.bodyBox.w/2, world.boss.bodyBox.y + 4);
        }
      }
      if (consumed) continue;

      // goons
      for (const g of world.goons) {
        if (!g.alive) continue;
        if (g.state === 'dying') continue;
        if (aabb(box, g.headBox)) {
          if (g.state !== 'dying') { g.state = 'dying'; g.deathT = 0; g._pooled = false; g._bled = false; }
          this.particles.spawnBlood(g.headBox.x+3, g.headBox.y+2);
          this.playerBullets.splice(i,1); consumed = true; break;
        }
        if (aabb(box, g.leftArmBox)) {
          g.hp = Math.max(0, g.hp - Math.max(1, b.damage||1)); g.woundedArm = 'left';
          if (g.hp <= 0) { if (g.state !== 'dying') { g.state='dying'; g.deathT=0; g._pooled=false; g._bled=false; } }
          else g.state = 'wounded';
          this.particles.spawnBlood(g.leftArmBox.x+2, g.leftArmBox.y+1);
          this.playerBullets.splice(i,1); consumed = true; break;
        }
        if (aabb(box, g.rightArmBox)) {
          g.hp = Math.max(0, g.hp - Math.max(1, b.damage||1)); g.woundedArm = 'right';
          if (g.hp <= 0) { if (g.state !== 'dying') { g.state='dying'; g.deathT=0; g._pooled=false; g._bled=false; } }
          else g.state = 'wounded';
          this.particles.spawnBlood(g.rightArmBox.x+2, g.rightArmBox.y+1);
          this.playerBullets.splice(i,1); consumed = true; break;
        }
        if (aabb(box, g.bodyBox)) {
          g.hp = Math.max(0, g.hp - Math.max(1, b.damage||1));
          if (g.hp <= 0) { if (g.state !== 'dying') { g.state='dying'; g.deathT=0; g._pooled=false; g._bled=false; } }
          else g.state = 'wounded';
          this.particles.spawnBlood(g.bodyBox.x+5, g.bodyBox.y+4);
          this.playerBullets.splice(i,1); consumed = true; break;
        }
      }
      if (consumed) continue;

      // NPCs
      for (const n of world.npcs) {
        if (n.state === 'dying' || n.state === 'down' || n.bulletImmune) continue;
        const nbox = { x: n.x+3, y: n.y+3, w: 10, h: 10 };
        if (aabb(box, nbox)) {
          if (n.state !== 'dying') { n.state = 'dying'; n.deathT = 0; n._pooled = false; n.bulletImmune = true; }
          this.particles.spawnBlood(nbox.x+5, nbox.y+3);
          this.playerBullets.splice(i,1); consumed = true; break;
        }
      }
    }

    // enemy bullets
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -10 || b.x > WORLD_W + 10) { this.enemyBullets.splice(i,1); continue; }
      if (world.playerIframes <= 0) {
        const box = { x: b.x, y: b.y, w: b.w, h: b.h };
        const pbox = world.player.crouch
          ? { x: world.player.x+3, y: world.player.y+6, w: 10, h: 8 }
          : { x: world.player.x+3, y: world.player.y+2, w: 10, h: 12 };
        if (aabb(box, pbox)) {
          this.enemyBullets.splice(i,1);
          world.playerIframes = 0.6;
          this.particles.spawnBlood(pbox.x + pbox.w/2, pbox.y + 3);
          if (world.player.alive) {
            world.player.hp = Math.max(0, world.player.hp - 1);
            if (world.player.hp <= 0) world.player.alive = false;
          }
        }
      }
    }
  }

  draw(ctx, cameraX, COLORS) {
    ctx.fillStyle = COLORS.gunMetal;
    for (const b of this.playerBullets) ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);
    ctx.fillStyle = COLORS.gunDark;
    for (const b of this.enemyBullets) ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);
  }
}