/**
 * Orchestrator (modular) — replaces the monolithic game.js
 *
 * Responsibilities:
 * - Canvas setup, resize, pixel-perfect scale
 * - Input handling (continuous keys + one-shot presses)
 * - World/bootstrap (entities, systems, configs)
 * - Main loop: update(dt,t) + render(t)
 * - Wiring all modular systems together
 *
 * Notes:
 * - This file intentionally contains the minimal glue to keep responsibilities
 *   in feature modules under src/core, src/systems, src/weapons, src/status, src/ui, src/entities, src/render.
 * - It preserves the gameplay and visuals of the previous monolith while making
 *   each feature testable and swappable.
 */

import { VW, VH, WORLD_W, GROUND_Y, PX, INTERNAL_SCALE, COLORS, GRAVITY } from './core/constants.js';
import { makeRng } from './core/rng.js';
import { aabb } from './core/aabb.js';
import { Camera } from './core/camera.js';

// Sprites and draw helpers (already in your repo)
import { drawPlayer, drawMuzzleFlash } from './sprites.js';

// Entity factories and world props
import { spawnInitialGoons, spawnNPCs, makeCovers, makeTelephoneBooth, makePOIs } from './entities/spawn.js';

// Systems
import { Particles } from './systems/particles.js';
import { Dialogue } from './systems/dialogue.js';
import { getOpeningLine, getNpcReply } from './systems/dialogue_trees.js';
import { Background } from './systems/background.js';
import { ForegroundTraffic } from './systems/traffic.js';
import { Journal } from './systems/journal.js';
import { GoonSystem } from './systems/goon_ai.js';
import { NPCSystem } from './systems/npc_ai.js';
import { BossSystem } from './systems/boss.js';
import { CombatSystem } from './systems/combat.js';
import { handleMolotovShatter } from './systems/fire_integration.js';
import { FixedStepBackgroundUpdater } from './systems/background_update.js';
import { FireSimulation } from './systems/fire_simulation.js';
import { FireDemoScene } from './systems/fire_demo.js';

// Fire rendering
import { FireRenderer } from './render/fire_renderer.js';

// Status and weapons
import { applyBurningStatus, updateBurning, drawBurningOverlay } from './status/burning.js';
import { MolotovController } from './player/molotov_controller.js';
import { MolotovProjectile, createMolotovFromShooter } from './weapons/molotov.js';
import { simulateTrajectory, drawTrajectory } from './ui/trajectory_preview.js';

// UI / overlays
import { Narrative, drawHUD } from './ui/hud.js';
import { drawInteractionHints } from './ui/interaction_hints.js';
import { drawBoothDoorOverlay } from './render/booth_overlay.js';

/* -------------------- Config: Molotov + Throw Preview -------------------- */
const MOLOTOV_CONFIG = {
  minForce: 250,
  maxForce: 650,
  maxChargeTime: 1200,    // ms
  gravity: 1500,          // px/s^2 (bottle heavier than player jump)
  spinSpeed: 6.0,         // rad/s
  fireLifetime: 5000,     // ms
  fireRadiusStart: 60,
  fireRadiusEnd: 40,
  fireTickInterval: 500,  // ms
  directHitBonus: 10,
  burnDuration: 4000,     // ms
  inventoryStart: 3,
  arcSteps: 22,
  groundY: GROUND_Y,
};

/* ------------------------------ Canvas setup ----------------------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function resize() {
  // Backing store upscaling for crisp text (without changing sprite math)
  canvas.width = VW * INTERNAL_SCALE;
  canvas.height = VH * INTERNAL_SCALE;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

/* --------------------------------- Input -------------------------------- */
const keys = new Set();    // continuous
const pressed = new Set(); // one-shot
let lastActivityTime = 0;  // for idle hints

window.addEventListener('keydown', (e) => {
  // Prevent scrolling on game keys
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','e','E','j','J','q','Q','Shift','w','W','a','A','s','S','d','D'].includes(e.key)) e.preventDefault();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; // keep 'Shift' case
  keys.add(k);
  pressed.add(k);
  lastActivityTime = performance.now() / 1000;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.delete(k);
});

/* ----------------------------- Random & Camera ---------------------------- */
const rng = makeRng(123456789);
const camera = new Camera(0, 0, Math.max(0, WORLD_W - VW));

/* ------------------------------ Systems init ----------------------------- */
const dialogue = new Dialogue();
const journal = new Journal();
const narrative = new Narrative();
narrative.set("Somewhere in L.A., dangerous man is on loose");

const covers = makeCovers();
const telephoneBooth = makeTelephoneBooth();
const pois = makePOIs();

const background = new Background(rng, covers, telephoneBooth);
const backgroundStepper = new FixedStepBackgroundUpdater(background); // annotated "background_update" module

const traffic = new ForegroundTraffic(rng);
const particles = new Particles(rng);

// Initialize fire simulation system
const fireSimulation = new FireSimulation({
  deterministic: false,
  debugMode: false
});
const fireRenderer = new FireRenderer();
const fireDemo = new FireDemoScene(fireSimulation);

const bossSystem = new BossSystem(dialogue);
const goonSystem = new GoonSystem(rng, dialogue, particles, covers);
const npcSystem = new NPCSystem(dialogue);
const combat = new CombatSystem(particles, camera, dialogue);

/* ------------------------------ Entities init ---------------------------- */
const goons = spawnInitialGoons(rng);
const npcs = spawnNPCs();
goonSystem.setGoons(goons);
npcSystem.setNPCs(npcs);

/* --------------------------------- Player -------------------------------- */
const player = {
  x: 24, y: GROUND_Y - 16, w: 16, h: 16, dir: 1,
  speed: 40, aiming: false, fireCooldown: 0, anim: 0,
  breathT: 0, breathAmp: 0, jacketSway: 0, jacketSwayV: 0, lastStepSign: 0,
  alive: true, hp: 3, maxHp: 3,
  vy: 0, onGround: true, crouch: false, recoil: 0,
  twirlT: 0, twirlActive: false, twirlCooldown: 0,

  // Molotov state
  molotovCount: MOLOTOV_CONFIG.inventoryStart,
  molotovState: 'inactive', // mirror for HUD
  charge: 0,
};

const molotovCtl = new MolotovController({
  maxChargeTimeMs: MOLOTOV_CONFIG.maxChargeTime,
  cooldownEquipSec: 0.5,
});
/** @type {MolotovProjectile[]} */
const molotovProjectiles = [];
/** @type {import('./weapons/fire_patch.js').FirePatch[]} */
const firePatches = [];

/* --------------------------------- State --------------------------------- */
let paused = false;
let playerIframes = 0;
let last = 0;
let idleHintCooldown = 0;
let victory = false;

/* ------------------------------- Boss setup ------------------------------ */
// Boss spawns when clues complete or when forced; we mimic gating logic from monolith.
// For simplicity, we allow manual trigger via window.__DH.debugUnlockBoss() (added later).

/* --------------------------------- Helpers ------------------------------- */
function clampPlayerToWorld(p) {
  p.x = Math.max(0, Math.min(WORLD_W - p.w, p.x));
}

function say(text, x, y, time = 1.5, meta = {}) {
  dialogue.say(text, x, y, time, meta);
}

function addNote(note) {
  journal.add(note);
  const short = note.length > 58 ? note.slice(0, 55) + '…' : note;
  narrative.set('New lead: ' + short);
}

function cluesComplete() {
  const allPoi = pois.every(p => p.taken);
  const allNpc = npcs.every(n => n.clueGiven || n.state === 'down');
  return allPoi && allNpc;
}

/* ------------------------------- Interactions ---------------------------- */
function startInterrogation(npc) {
  const harryX = player.x + 2, harryY = player.y - 2;
  const npcX = npc.x + 2, npcY = npc.y - 2;

  // Hotgirl scripted exchange
  if (npc.type === 'hotgirl') {
    const lines = getNpcReply(npc, true);
    for (const line of lines) {
      dialogue.say(line.text, line.speaker === 'harry' ? harryX : npcX, line.speaker === 'harry' ? harryY : npcY, 1.6, { speaker: line.speaker, entity: npc, tag: line.tag });
      if (line.clue && !npc.clueGiven) { addNote(line.text); npc.clueGiven = true; }
    }
    return;
  }

  // Generic opener + reply
  dialogue.say(getOpeningLine(), harryX, harryY, 1.6, { speaker: 'harry', tag: 'opener' });

  // Cooperative if calm/idle or coerced by aim/position
  const dx = (npc.x + 8) - (player.x + 8);
  const inSight = (player.dir === 1 && dx > 0) || (player.dir === -1 && dx < 0);
  const calmish = (npc.state === 'calm' || npc.state === 'idle');
  const cooperativeNow = calmish || (npc.state === 'afraid') || (player.aiming && Math.abs(dx) < 70 && inSight);

  const replies = getNpcReply(npc, cooperativeNow);
  for (const r of replies) {
    dialogue.say(r.text, npcX, npcY, 1.8, { speaker: r.speaker, entity: npc, tag: r.tag });
    if (r.clue && !npc.clueGiven) { addNote(r.text); npc.clueGiven = true; }
  }
}

/* ---------------------------------- Loop --------------------------------- */
function loop(ts) {
  const t = ts / 1000;
  const dt = Math.min(0.033, last ? t - last : 0.016);
  last = t;

  if (lastActivityTime === 0) lastActivityTime = t;

  if (!paused) update(dt, t);
  render(t);
  requestAnimationFrame(loop);
}

/* --------------------------------- Update -------------------------------- */
function update(dt, t) {
  // Keys (continuous)
  let left = keys.has('arrowleft') || keys.has('a');
  let right = keys.has('arrowright') || keys.has('d');
  let jumpKey = keys.has('arrowup') || keys.has('w');
  let down = keys.has('arrowdown') || keys.has('s');
  let aim = keys.has('Shift') || keys.has('shift');
  let shoot = pressed.has(' ');
  let interact = pressed.has('e');
  let toggleJournal = pressed.has('j');

  // Molotov input
  const molotovEquip = pressed.has('q');
  const molotovChargeHeld = keys.has(' '); // hold to charge throw when lit
  
  // Fire simulation debug controls (for testing)
  if (pressed.has('1')) fireRenderer.toggleDebugMode('showHeatMap');
  if (pressed.has('2')) fireRenderer.toggleDebugMode('showGrid');
  if (pressed.has('3')) fireRenderer.toggleDebugMode('showOxygen');
  if (pressed.has('4')) fireRenderer.toggleDebugMode('showFuel');
  if (pressed.has('f')) {
    // Spawn fire at player location
    fireSimulation.igniteAt(player.x + 8, player.y + 8, 800, 4);
  }
  if (pressed.has('g')) {
    // Add water at player location
    fireSimulation.addLiquid(player.x + 8, player.y + 8, 4, 80, 3); // MaterialType.WATER = 4
  }
  
  // Fire demo controls
  if (pressed.has('5')) fireDemo.setupDemo();
  if (pressed.has('6')) fireDemo.triggerScenario('cabin_fire');
  if (pressed.has('7')) fireDemo.triggerScenario('oil_explosion');
  if (pressed.has('8')) fireDemo.triggerScenario('chain_reaction');
  if (pressed.has('9')) fireDemo.triggerScenario('full_demo');
  if (pressed.has('0')) fireDemo.reset();

  // If a boss pre-fight is spawned but intro isn't done, gate approach and show hints
  if (!bossSystem.boss && player.x > WORLD_W - 90) {
    if (cluesComplete()) {
      bossSystem.spawn(telephoneBooth);
    } else if (!dialogue.active()) {
      say('Need more evidence.', player.x + 2, player.y - 6, 1.4, { speaker: 'harry', tag: 'gate' });
      const missing = [
        ...(!pois.every(p => p.taken) ? [`${pois.filter(p=>!p.taken).length} clues on the ground`] : []),
        ...npcs.filter(n => !n.clueGiven && n.state !== 'down').map(n => 'talk to ' + n.type),
      ];
      say('Missing: ' + (missing.length ? missing.join('; ') : 'none'), player.x + 2, player.y - 2, 2.0, { speaker: 'system', tag: 'gate-info' });
    }
  }

  // Trigger boss cutscene if booth visible and near right
  bossSystem.triggerCutsceneIfReady(player, camera, telephoneBooth);

  // If cutscene active, lock inputs and pan camera
  if (bossSystem.cutscene.active) {
    left = right = jumpKey = down = aim = false;
    shoot = interact = toggleJournal = false;
    // soft camera pan is handled in updateCutscene; also clamp backtracking
    player.x = Math.max(bossSystem.cutscene.lockLeftX, player.x);
    bossSystem.updateCutscene(dt, player, camera, telephoneBooth);
  }

  player.aiming = aim;

  // Horizontal movement
  let vx = 0;
  if (left) { vx -= player.speed; player.dir = -1; }
  if (right) { vx += player.speed; player.dir = 1; }
  if (player.crouch) vx *= 0.6;

  // Jump / Duck
  player.crouch = down && player.onGround;
  if (jumpKey && player.onGround && !player.crouch) {
    player.vy = -150;
    player.onGround = false;
  }

  // Gravity and integrate
  player.vy += GRAVITY * dt;
  player.x += vx * dt;
  player.y += player.vy * dt;

  // Ground collision
  const groundTop = GROUND_Y - 16;
  if (player.y >= groundTop) {
    player.y = groundTop;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // Clamp world (and cutscene lock again)
  clampPlayerToWorld(player);
  if (bossSystem.cutscene.active) player.x = Math.max(bossSystem.cutscene.lockLeftX, player.x);

  // Anim + idle breathing
  const moving = Math.abs(vx) > 0.01 && player.onGround;
  player.anim += (moving ? 1.6 : 0.5) * dt;

  const idleForBreath = !moving && player.onGround && !player.aiming && !player.crouch && player.recoil <= 0.01;
  const targetBreathAmp = idleForBreath ? 1 : 0;
  player.breathAmp += (targetBreathAmp - player.breathAmp) * Math.min(1, dt * 2.2);
  if (idleForBreath) player.breathT += dt;

  // Jacket spring
  const wind = Math.sin(t * 0.35) * 0.6;
  const targetSway = (vx / Math.max(1, player.speed)) * 2.0 + wind;
  const k = 40, c = 10;
  const dxS = targetSway - player.jacketSway;
  const aS = k * dxS - c * player.jacketSwayV;
  player.jacketSwayV += aS * dt;
  player.jacketSway += player.jacketSwayV * dt;
  if (Math.abs(vx) < 2) player.jacketSwayV *= 0.98;
  const stepSign = Math.sign(Math.sin(player.anim * Math.PI * 2));
  if (moving && player.onGround && stepSign !== 0 && stepSign !== player.lastStepSign) {
    player.jacketSwayV += (-stepSign) * 26;
  }
  player.lastStepSign = stepSign;

  // Twirl scheduler
  const canTwirl = !moving && player.onGround && !player.aiming && !player.crouch && player.recoil <= 0.01;
  if (player.twirlCooldown > 0) player.twirlCooldown -= dt;
  if (player.twirlActive) {
    player.twirlT += dt / 0.9;
    if (!canTwirl) { player.twirlActive = false; player.twirlT = 0; player.twirlCooldown = 1.5; }
    else if (player.twirlT >= 1) { player.twirlActive = false; player.twirlT = 0; player.twirlCooldown = 2.5 + rng()*2.0; }
  } else if (canTwirl && player.twirlCooldown <= 0) {
    if (rng() < 0.015) { player.twirlActive = true; player.twirlT = 0; }
  } else if (!canTwirl) {
    if (player.twirlCooldown < 1.2) player.twirlCooldown = 1.2;
  }

  // Molotov controller
  molotovCtl.handleInput({ equipPressed: molotovEquip, chargeHeld: molotovChargeHeld, inventory: player.molotovCount });
  const molEvt = molotovCtl.update(dt, performance.now());
  // Keep a mirror for HUD and trajectory
  player.molotovState = molotovCtl.state;
  player.charge = molotovCtl.charge;

  if (molEvt?.type === 'throw' && player.molotovCount > 0) {
    // Create projectile from player state
    const proj = createMolotovFromShooter(
      { x: player.x, y: player.y, dir: player.dir, charge: molEvt.charge },
      { minForce: MOLOTOV_CONFIG.minForce, maxForce: MOLOTOV_CONFIG.maxForce, gravity: MOLOTOV_CONFIG.gravity, spinSpeed: MOLOTOV_CONFIG.spinSpeed, groundY: GROUND_Y }
    );
    molotovProjectiles.push(proj);
    player.molotovCount--;
  }

  if (player.molotovState !== 'inactive') {
    // Prevent gunfire while handling a lit bottle
    shoot = false;
  }

  // Fire magnum
  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  if (shoot && player.fireCooldown <= 0) {
    const muzzleX = player.dir === 1 ? player.x + 16 : player.x - 2;
    const muzzleY = player.y + (player.crouch ? 11 : 9);
    const damage = (player.aiming && player.crouch) ? 3 : (player.aiming ? 2 : 1);
    combat.fireMagnum(muzzleX, muzzleY, player.dir, damage);
    const recoilTier = damage === 3 ? 2.6 : (damage === 2 ? 1.6 : 0.6);
    player.recoil = recoilTier;
    particles.spawnSmoke(muzzleX, muzzleY, player.dir);
    const baseCd = 0.3;
    player.fireCooldown = baseCd * (damage === 3 ? 3 : (damage === 2 ? 2 : 1));
    npcSystem.notifyGunshot(t);

    // Wake nearby goons
    for (const g of goons) {
      if (!g.alive || g.state === 'dying' || g.state === 'dead') continue;
      const dx = (g.x + 8) - (player.x + 8);
      const dist = Math.abs(dx);
      if (dist < 80 && g.state !== 'wounded') {
        g.state = 'run';
        g.dir = dx < 0 ? 1 : -1;
        g.aggroTimer = 0.2 + rng() * 0.3;
      }
    }
  }

  // Journal toggle
  if (toggleJournal) journal.toggle();

  // Activity ping
  if (Math.abs(vx) > 0.01 || Math.abs(player.vy) > 0.01 || aim || shoot || interact || toggleJournal) {
    lastActivityTime = t;
  }

  // Idle hint
  if (t - lastActivityTime > 10 && idleHintCooldown <= 0 && !dialogue.active()) {
    const npcNeedsClue = npcs.some(n => !n.clueGiven && n.state !== 'down');
    const poiAvailable = pois.some(p => !p.taken);
    const hint = npcNeedsClue ? 'Maybe I should talk to people.' : (poiAvailable ? 'Look around for clues on the ground.' : 'Keep moving—trouble is ahead.');
    say(hint, player.x + 2, player.y - 4, 2.6, { speaker: 'harry', tag: 'idle-hint' });
    idleHintCooldown = 12;
  }
  if (idleHintCooldown > 0) idleHintCooldown -= dt;

  // Update boss fight (arena lock and firing)
  bossSystem.update(dt, t, player, camera);

  // Goons fire back when aggro timer elapses
  for (const g of goons) {
    if (g.aggroTimer !== undefined && g.aggroTimer !== null) {
      g.aggroTimer -= dt;
      if (g.aggroTimer <= 0) {
        const shotDir = ((player.x + 8) > (g.x + 8)) ? 1 : -1;
        const mx = shotDir === 1 ? g.x + 16 : g.x - 2;
        const my = g.y + 9;
        combat.goonFire(mx, my, shotDir);
        particles.spawnSmoke(mx, my, g.dir);
        g.aggroTimer = null;
      }
    }
  }

  // Update Molotov projectiles (physics + collision)
  for (let i = molotovProjectiles.length - 1; i >= 0; i--) {
    const m = molotovProjectiles[i];
    if (!m.active) { molotovProjectiles.splice(i,1); continue; }
    const event = m.update(dt, { goons, npcs, aabb });
    if (event?.shatter) {
      handleMolotovShatter(m, event.hitEntity, MOLOTOV_CONFIG, { firePatches }, particles);
      molotovProjectiles.splice(i, 1);
    }
  }

  // Update fire patches (ticks + shrink)
  for (let i = firePatches.length - 1; i >= 0; i--) {
    const f = firePatches[i];
    if (!f.active) { firePatches.splice(i,1); continue; }
    // Damage callback: apply burning and -1 HP per tick to goons; civilians only burn state (no HP here)
    f.update(dt, { candidates: [...goons, ...npcs] }, (ent) => {
      applyBurningStatus(ent, MOLOTOV_CONFIG.burnDuration);
      if (typeof ent.hp === 'number') {
        ent.hp = Math.max(0, ent.hp - 1);
        if (ent.hp <= 0) { ent.alive = false; ent.state = 'dying'; }
      }
    });
  }

  // Burning status jitters (suggested movement impulses)
  for (const g of goons) {
    const j = updateBurning(g, dt);
    if (j?.impulseX) {
      g.x += j.impulseX * dt;
      g.x = Math.max(0, Math.min(WORLD_W - 16, g.x));
    }
  }
  for (const n of npcs) {
    const j = updateBurning(n, dt);
    if (j?.impulseX) {
      n.x += j.impulseX * dt;
      n.x = Math.max(0, Math.min(WORLD_W - 16, n.x));
    }
  }

  // Update systems
  combat.update(dt, {
    boss: bossSystem.boss,
    bossActive: bossSystem.active,
    goons,
    npcs,
    player,
    playerIframes,
  });
  // playerIframes can be modified by combat; we sync back if present
  if (typeof window !== 'undefined') {} // placeholder to avoid lints
  if (typeof playerIframes === 'number') {
    // no-op, value is mutated in-place by reference above if needed
  }

  goonSystem.update(dt, player, t);
  npcSystem.update(dt, t, player);

  // Boss bullets hit player (separate from CombatSystem)
  for (let i = bossSystem.bullets.length - 1; i >= 0; i--) {
    const b = bossSystem.bullets[i];
    b.life -= dt;
    if (b.life <= 0) { bossSystem.bullets.splice(i,1); continue; }
    if (playerIframes <= 0) {
      const box = { x: b.x, y: b.y, w: b.w, h: b.h };
      const pbox = player.crouch ? { x: player.x+3, y: player.y+6, w: 10, h: 8 } : { x: player.x+3, y: player.y+2, w: 10, h: 12 };
      if (aabb(box, pbox)) {
        bossSystem.bullets.splice(i,1);
        playerIframes = 0.6;
        particles.spawnBlood(pbox.x + pbox.w/2, pbox.y + 3);
        if (player.alive) {
          player.hp = Math.max(0, player.hp - 1);
          if (player.hp <= 0) player.alive = false;
        }
      }
    }
  }

  // Particles, background, traffic, dialogue, narrative, camera shake
  particles.update(dt);
  backgroundStepper.update(dt);
  traffic.update(dt, camera.x, VW);
  dialogue.update(dt);
  narrative.update(dt);
  camera.update(dt);
  
  // Update fire simulation system
  fireSimulation.update(dt);

  // Camera follow (unless boss arena active or cutscene active)
  if (!bossSystem.active && !bossSystem.cutscene.active) {
    camera.follow(player.x + player.w/2, VW);
  }

  // Interactions (talk or POI pickup)
  if (interact) {
    // Try nearest NPC
    let nearestNPC = null, bestD = 1e9;
    for (const n of npcs) {
      if (n.state === 'down' || n.state === 'dying') continue;
      const dx = Math.abs((player.x+8) - (n.x+8));
      const dy = Math.abs((player.y) - (n.y));
      if (dx < 16 && dy < 6) {
        const d = dx + dy;
        if (d < bestD) { bestD = d; nearestNPC = n; }
      }
    }
    if (nearestNPC) {
      // Intimidate if aiming at panicked NPC without clue (except hotgirl)
      if (player.aiming && (nearestNPC.state === 'afraid' || nearestNPC.state === 'flee') && !nearestNPC.clueGiven && nearestNPC.type !== 'hotgirl') {
        dialogue.say('Harry: So, will ye speak?', player.x + 2, player.y - 2, 1.2, { speaker: 'harry', tag: 'intimidate' });
        const clue = nearestNPC.type === 'mother'
          ? 'He wore a tan coat.'
          : nearestNPC.type === 'oldman'
          ? 'The alley ahead is shady.'
          : 'He dropped a coin near the phone.';
        dialogue.say(clue, nearestNPC.x + 2, nearestNPC.y - 2, 2.0, { speaker: 'npc', entity: nearestNPC, tag: 'clue' });
        addNote(clue);
        nearestNPC.clueGiven = true;
        nearestNPC.state = 'calm';
        nearestNPC.fear = Math.max(0, (nearestNPC.fear||0) - 0.6);
        nearestNPC.panicTimer = 0;
      } else if (nearestNPC.state === 'afraid' || nearestNPC.state === 'flee') {
        dialogue.say('...okay, okay.', nearestNPC.x + 2, nearestNPC.y - 2, 1.2, { speaker: 'npc', entity: nearestNPC, tag: 'calmed' });
        nearestNPC.state = 'calm';
        nearestNPC.fear = Math.max(0, (nearestNPC.fear||0) - 0.6);
        nearestNPC.panicTimer = 0;
      } else {
        startInterrogation(nearestNPC);
      }
    } else {
      // POIs
      for (const p of pois) {
        if (p.taken) continue;
        const near = Math.abs((player.x+8) - (p.x + p.w/2)) < 12 && Math.abs((player.y+8) - (p.y)) < 12;
        if (near) {
          p.taken = true;
          addNote(p.note);
          // Optional: a tiny floating title could be implemented as a particle or a dialogue line; omitted here for brevity
          break;
        }
      }
    }
  }

  // Player death early exit logic (allow restart)
  if (!player.alive) {
    if (keys.has('r')) restart();
    pressed.clear();
    return;
  }

  // Victory if boss dead
  victory = bossSystem.victory;

  // Pause / Restart
  if (pressed.has('p')) paused = !paused;
  if (pressed.has('r')) restart();

  // One-shot clear
  pressed.clear();

  // Iframes decay and recoil decay
  if (playerIframes > 0) playerIframes = Math.max(0, playerIframes - dt);
  if (player.recoil > 0) player.recoil = Math.max(0, player.recoil - dt * 8);
}

/* --------------------------------- Render -------------------------------- */
function render(t) {
  // Reset and clear
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Pixel scale
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.scale(canvas.width / VW, canvas.height / VH);

  // Camera shake
  camera.applyShakeTransform(ctx, rng);

  // Background
  background.draw(ctx, camera.x);

  // Fire simulation (new Noita-like system)
  fireRenderer.render(ctx, fireSimulation, camera.x, t);

  // Fire patches (legacy - for compatibility with molotovs)
  for (const f of firePatches) f.draw(ctx, camera.x, t);

  // Particles (behind)
  particles.drawBack(ctx, camera.x, COLORS);

  // Goons
  goonSystem.draw(ctx, camera.x, t);
  // Burning overlays on goons
  for (const g of goons) { if (g.burning) drawBurningOverlay(ctx, g, t, camera.x); }

  // Boss
  bossSystem.draw(ctx, camera.x);

  // Player
  if (playerIframes > 0) {
    ctx.globalAlpha = 0.6 + 0.4*Math.sin(t*40);
  }
  // Trajectory preview while charging Molotov
  if (player.molotovState === 'charging') {
    const force = MOLOTOV_CONFIG.minForce + (MOLOTOV_CONFIG.maxForce - MOLOTOV_CONFIG.minForce) * (player.charge||0);
    const angle = -Math.PI / 4;
    const v0 = { vx: Math.cos(angle) * force * player.dir, vy: Math.sin(angle) * force };
    const start = { x: player.dir === 1 ? player.x + 16 : player.x - 4, y: player.y + 8 };
    const points = simulateTrajectory(start, v0, { gravity: MOLOTOV_CONFIG.gravity, groundY: GROUND_Y, steps: MOLOTOV_CONFIG.arcSteps });
    drawTrajectory(ctx, points, camera.x, { color: '#ffff00', radius: 1 });
  }
  // Draw the player sprite
  const movingH = Math.abs((keys.has('arrowleft')||keys.has('a')?-1:0) + (keys.has('arrowright')||keys.has('d')?1:0))>0 && player.onGround;
  const breathPeriod = 3.8;
  const breathPhase = (player.breathT % breathPeriod) / breathPeriod;
  drawPlayer(ctx, Math.round(player.x - camera.x), Math.round(player.y), 1, player.dir, player.anim, player.aiming, {
    crouch: player.crouch,
    jumping: !player.onGround,
    recoil: player.recoil,
    moving: movingH,
    twirlT: player.twirlActive ? player.twirlT : 0,
    jacketSway: player.jacketSway,
    breathAmp: player.breathAmp,
    breathPhase,
    hairColor: '#bcbcbc'
  });
  ctx.globalAlpha = 1;

  // Molotov projectiles
  for (const m of molotovProjectiles) m.draw(ctx, camera.x, performance.now());

  // Particles (front + muzzle flash overlay)
  particles.drawFront(ctx, camera.x, COLORS, t, drawMuzzleFlash);

  // NPCs
  npcSystem.draw(ctx, camera.x, t);
  // Burning overlays on NPCs
  for (const n of npcs) { if (n.burning) drawBurningOverlay(ctx, n, t, camera.x); }

  // Foreground traffic silhouettes
  traffic.draw(ctx, camera.x);

  // Foreground booth door overlay
  drawBoothDoorOverlay(ctx, telephoneBooth, camera.x, VW, GROUND_Y);

  // POIs small glint + proximity tooltip
  ctx.fillStyle = '#3a3d46';
  for (const p of pois) {
    if (p.taken) continue;
    const px = p.x - camera.x;
    if (px + p.w < 0 || px > VW) continue;
    ctx.fillRect(px, p.y, p.w, p.h);
    if (Math.floor(t*2)%2===0) {
      ctx.fillStyle = '#cbd1ff';
      ctx.fillRect(px+1, p.y-1, 1, 1);
      ctx.fillStyle = '#3a3d46';
    }
  }

  // Interaction hints near player (E Talk / Intimidate / Investigate)
  drawInteractionHints(ctx, player, npcs, pois, camera.x, dialogue.active());

  // Dialogue bubble
  dialogue.draw(ctx, camera.x);

  // HUD (HP, Molotov inventory, charge, boss HP, narrative)
  drawHUD(ctx, {
    player,
    boss: bossSystem.boss && bossSystem.active && bossSystem.boss.alive ? bossSystem.boss : null,
    narrative
  });

  // Death/Victory overlays
  if (!player.alive) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
    ctx.fillStyle = '#e0b3b3';
    ctx.font = '8px monospace';
    ctx.fillText('You died', Math.floor(VW/2 - ctx.measureText('You died').width/2), Math.floor(VH/2 - 6));
    ctx.font = '6px monospace';
    ctx.fillText('Press R to restart', Math.floor(VW/2 - ctx.measureText('Press R to restart').width/2), Math.floor(VH/2 + 6));
  }
  if (victory) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
    const crown = 'VICTORY';
    ctx.fillStyle = '#bfe3bf';
    ctx.font = '10px monospace';
    ctx.fillText(crown, Math.floor(VW/2 - ctx.measureText(crown).width/2), Math.floor(VH/2 - 10));
    ctx.font = '6px monospace';
    const sub2 = 'Boss defeated. Press R to play again';
    ctx.fillText(sub2, Math.floor(VW/2 - ctx.measureText(sub2).width/2), Math.floor(VH/2 + 6));
  }

  // Fire Demo Instructions (if demo mode enabled)
  if (fireRenderer.debugMode.showHeatMap || fireRenderer.debugMode.showGrid) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(VW - 140, 5, 135, 85);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '6px monospace';
    ctx.fillText('FIRE DEMO CONTROLS:', VW - 135, 15);
    ctx.fillText('5 - Setup Demo Scene', VW - 135, 25);
    ctx.fillText('6 - Cabin Fire', VW - 135, 35);
    ctx.fillText('7 - Oil Explosion', VW - 135, 45);
    ctx.fillText('8 - Chain Reaction', VW - 135, 55);
    ctx.fillText('9 - Full Demo', VW - 135, 65);
    ctx.fillText('0 - Reset Scene', VW - 135, 75);
    ctx.fillText('F - Spawn Fire', VW - 135, 85);
  }

  ctx.restore();
}

/* -------------------------------- Restart -------------------------------- */
function restart() {
  // Reset player
  player.x = 40; player.y = 120; player.dir = 1; player.fireCooldown = 0; player.anim = 0; player.aiming=false;
  playerIframes = 0; camera.x = 0;
  player.alive = true; player.hp = player.maxHp;
  player.recoil = 0; player.crouch = false; player.vy = 0; player.onGround = true;
  player.molotovCount = MOLOTOV_CONFIG.inventoryStart; player.molotovState = 'inactive'; player.charge = 0;
  molotovProjectiles.length = 0; firePatches.length = 0;

  // Dialogue, journal, narrative
  dialogue.clear();
  // Keep journal notes across runs to reflect clues found; comment next line to preserve
  // journal.notes = []; // optional clear
  narrative.set("Somewhere in L.A., dangerous man is on loose");

  // Boss and cutscene
  bossSystem.reset();

  // Goons/NPCs
  goons.length = 0;
  spawnInitialGoons(rng).forEach(g => goons.push(g));
  goonSystem.setGoons(goons);

  npcs.length = 0;
  spawnNPCs().forEach(n => npcs.push(n));
  npcSystem.setNPCs(npcs);

  // World props
  telephoneBooth.doorOpen = 0;

  // Bullets/particles systems
  combat.playerBullets.length = 0; combat.enemyBullets.length = 0;
  particles.list.length = 0;
}

/* --------------------------------- Boot ---------------------------------- */
requestAnimationFrame(loop);

/* ---------------------------- Debug/test hooks --------------------------- */
if (typeof window !== 'undefined') {
  window.__DH = window.__DH || {
    setPlayerX: (x) => { player.x = Math.max(0, Math.min(WORLD_W - player.w, x|0)); },
    setPlayerDir: (d) => { player.dir = d >= 0 ? 1 : -1; },
    getNPCs: () => npcs.map(n => ({ type: n.type, state: n.state, x: n.x, y: n.y, bulletImmune: !!n.bulletImmune })),
    getPlayer: () => ({ x: player.x, y: player.y, dir: player.dir, crouch: player.crouch, aiming: player.aiming }),
    aim: (on = true) => {
      const key = 'Shift';
      const evt = new KeyboardEvent(on ? 'keydown' : 'keyup', { key });
      window.dispatchEvent(evt);
    },
    press: (key) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key })), 50);
    },
    shoot: () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' })), 30); },
    debugUnlockBoss: () => {
      // Mark all clues as collected and spawn the boss
      pois.forEach(p => p.taken = true);
      npcs.forEach(n => { if (n.state !== 'down') n.clueGiven = true; });
      if (!bossSystem.boss) bossSystem.spawn(telephoneBooth);
    },
    getBoss: () => bossSystem.boss ? ({ x: bossSystem.boss.x, y: bossSystem.boss.y, alive: bossSystem.boss.alive, dir: bossSystem.boss.dir, state: bossSystem.boss.state, hidden: !!bossSystem.boss.hidden, invincible: !!bossSystem.boss.invincible }) : null,
    getBooth: () => ({ doorOpen: telephoneBooth.doorOpen }),
  };
}