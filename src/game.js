// Orchestrator: now wired with skyline updates, booth overlay, full interaction
import { VW, VH, INTERNAL_SCALE, WORLD_W, GROUND_Y } from './core/constants.js';
import { initInput, keys, pressed } from './core/input.js';
import {
  player, cameraX, setCameraX, goons, npcs, bullets, particles, screenShake,
  journalOpen, toggleJournal, bossCutscene, bossArena, bossFightActive, boss
} from './core/state.js';
import { updateMolotovController } from './player/molotov_controller.js';
import { updateFireSystem } from './systems/fire_integration.js';
import { updateParticles } from './systems/particles.js';
import { updateDialogue } from './systems/dialogue.js';
import { tickNarrative, tickTitle, getTypedNarrative } from './systems/narrative.js';
import { updatePlayerShooting, updateBullets, updateEnemyAndBossBullets } from './systems/combat.js';
import { updateBurning } from './status/burning.js';
import { updateSkyline } from './systems/background_update.js';
import { molotovProjectiles, updateMolotovs } from './weapons/molotov.js';
import { renderWeaponsAndFire, renderBullets, renderBurningOverlays } from './render/layers.js';
import { drawBackground, drawTrafficForeground } from './render/background.js';
import { drawBoothDoorOverlay } from './render/booth_overlay.js';
import { initBgQueueIfNeeded, updateBgTraffic, updateTraffic } from './systems/traffic.js';
import { updateGoons } from './systems/goon_ai.js';
import { updateNPCs } from './systems/npc_ai.js';
import { renderJournal } from './systems/journal.js';
import { handleInteract } from './systems/interaction.js';
import { aabb, clamp } from './core/utils.js';
// Drawing helpers
import { COLORS, drawPlayer, drawGoon, drawNPC, drawMuzzleFlash, drawSpeechBubble, drawBoss } from './sprites.js';
// One-time world bootstrap
import { initWorldStatic, initActors } from './entities/spawn.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
const titleEl = document.getElementById('title');

function resize(){
  canvas.width = VW * INTERNAL_SCALE;
  canvas.height = VH * INTERNAL_SCALE;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize); resize();
initInput();
initWorldStatic();
initActors();

let last = 0;
requestAnimationFrame(loop);

function loop(ts){
  const t = ts/1000;
  const dt = Math.min(0.033, last ? t - last : 0.016);
  last = t;
  update(dt, t);
  render(t);
  requestAnimationFrame(loop);
}

function update(dt, t){
  const left  = keys.has('arrowleft') || keys.has('a');
  const right = keys.has('arrowright') || keys.has('d');
  const jump  = keys.has('arrowup') || keys.has('w');
  const down  = keys.has('arrowdown') || keys.has('s');
  const aim   = keys.has('shift');
  const toggleJ = pressed.has('j');

  if (toggleJ) toggleJournal();

  // Player horizontal
  let vx = 0;
  if (left)  { vx -= player.speed; player.dir = -1; }
  if (right) { vx += player.speed; player.dir = 1; }
  if (player.crouch) vx *= 0.6;
  player.x = clamp(player.x + vx*dt, 0, WORLD_W - player.w);

  // Jump/crouch
  player.crouch = down && player.onGround;
  if (jump && player.onGround && !player.crouch) { player.vy = -150; player.onGround = false; }
  player.vy += 320 * dt;
  player.y += player.vy * dt;
  const groundTop = GROUND_Y - 16;
  if (player.y >= groundTop) { player.y = groundTop; player.vy = 0; player.onGround = true; } else player.onGround = false;

  player.aiming = aim;

  // Interaction (NPCs/POIs)
  handleInteract(pressed);

  // Combat
  updatePlayerShooting(dt, keys, pressed, t);
  updateBullets(dt);
  updateEnemyAndBossBullets(dt);

  // Molotovs + Fire
  updateMolotovController(dt, t, { keys, pressed });
  updateMolotovs(dt, npcs);
  updateFireSystem(dt, npcs, goons);

  // Burning effects
  for (const g of goons) updateBurning(g, dt);
  for (const n of npcs) updateBurning(n, dt);

  // AI
  updateGoons(dt, t);
  updateNPCs(dt, t);

  // Background animation
  updateSkyline(dt);

  // Traffic
  initBgQueueIfNeeded();
  updateBgTraffic(dt);
  updateTraffic(dt);

  // Particles / Dialogue / Narrative
  updateParticles(dt);
  updateDialogue(dt);
  tickNarrative(dt);
  tickTitle(dt, titleEl);

  // Camera
  if (!bossFightActive && !bossCutscene.active) {
    setCameraX(player.x + player.w/2 - VW/2);
  } else if (bossArena) {
    const mid = Math.floor((bossArena.left + bossArena.right)/2) - VW/2 + 10;
    setCameraX(Math.max(0, Math.min(WORLD_W - VW, mid)));
  }

  // Anim
  const moving = Math.abs(vx) > 0.01 && player.onGround;
  player.anim += (moving ? 1.6 : 0.5) * dt;

  pressed.clear();
}

function render(t){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.scale(canvas.width/VW, canvas.height/VH);
  if (screenShake > 0) ctx.translate((Math.random()*2-1)*screenShake, (Math.random()*2-1)*screenShake);

  // Background layers with enhanced skyline
  drawBackground(ctx, t);

  // Goons
  for (const g of goons) {
    const opts = { deathT: (g.state==='dead'?1:(g.deathT||0)) };
    drawGoon(ctx, (g.x - cameraX)|0, g.y|0, 1, g.dir, g.state, g.phase||0, g.woundedArm, opts);
  }

  // Boss (if exists and visible)
  if (boss && !boss.hidden) {
    drawBoss(ctx, (boss.x - cameraX)|0, boss.y|0, 1, boss.dir, boss.state, 0, { });
  }

  // Player
  drawPlayer(ctx, (player.x - cameraX)|0, player.y|0, 1, player.dir, player.anim, player.aiming, {
    crouch: player.crouch, jumping: !player.onGround, recoil: player.recoil, moving: Math.abs(player.vy)<0.01
  });

  // Bullets
  renderBullets(ctx);

  // Weapons & Fire
  renderWeaponsAndFire(ctx);

  // Foreground booth sliding grid overlay
  drawBoothDoorOverlay(ctx);

  // Burning overlays
  renderBurningOverlays(ctx);

  // UI
  ctx.fillStyle = '#fff';
  ctx.font = '6px monospace';
  ctx.fillText(`HP: ${player.hp}/${player.maxHp}`, 4, 8);
  ctx.fillText(`Molotovs: ${player.molotovs}`, 4, 16);
  ctx.fillText(getTypedNarrative(), 4, 26);

  // Journal panel
  renderJournal(ctx, VW);

  ctx.restore();
}