// game.js - Dirty Harry pixel-art game (no external assets)
// Visual Upgrade 2.0: layered traffic (background/foreground), wind-swayed clothes, 32x32 HD sprite details
import { COLORS, drawPlayer, drawGoon, drawMuzzleFlash, drawSpeechBubble, drawNPC, drawBoss } from './sprites.js';

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const titleEl = document.getElementById('title');

  // Virtual resolution
  const VW = 192; // 16:9 minimal retro resolution
  const VH = 108; // 16/108 ~= 14.8% -> player is ~15% of screen height
  const WORLD_W = VW * 5; // multi-screen world width
  const GROUND_Y = VH - 22;
  const PX = 16; // sprite size
  const GRAVITY = 320; // px/s^2 for jump physics
  const ARENA_WIDTH = 120; // boss arena width

  // Backing store scale for crisp text rendering
  const INTERNAL_SCALE = 3;
  // Screen shake amplitude in virtual pixels (decays each update)
  let screenShake = 0;

  // Scale so player is ~15% screen height; our sprite is 16px tall, so we just keep logical 180 high and scale canvas via CSS
  function resize() {
    // Triple the internal/backing resolution for sharper text without changing sprite sizes
    canvas.width = VW * INTERNAL_SCALE;
    canvas.height = VH * INTERNAL_SCALE;
    // Keep pixel-art crisp
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // Input
  const keys = new Set();
  const pressed = new Set();
  // Track idle time for hinting
  let lastActivityTime = 0; // set on first update
  window.addEventListener('keydown', (e) => {
  if ([ 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','e','E' ].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    pressed.add(e.key.toLowerCase());
    // Any keydown counts as activity
    lastActivityTime = performance.now() / 1000;
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
  });

  // RNG
  const rng = (seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2**32)(123456789);

  // Entities
  const player = {
    x: 24,
    y: GROUND_Y - 16, // top-left of 16x16
    w: 16,
    h: 16,
    dir: 1,
    speed: 40,
    aiming: false,
    fireCooldown: 0,
    anim: 0,
    // Extra animation timers/state
    breathT: 0,        // seconds for idle deep breathing
    breathAmp: 0,      // 0..1 how pronounced the breathing is (idle only)
    jacketSway: 0,     // pixels of coat sway (horizontal), positive trails to the right
    jacketSwayV: 0,    // velocity term for spring-damper
    lastStepSign: 0,   // for detecting foot plant events
    alive: true,
    hp: 3,
    maxHp: 3,
    vy: 0,
    onGround: true,
    crouch: false,
    recoil: 0,
    // Idle gun twirl state
    twirlT: 0,           // 0..1 progress for current twirl animation
    twirlActive: false,  // whether twirl is playing
    twirlCooldown: 0,    // seconds before another twirl may start
  };

  let cameraX = 0;

  function makeGoon(x, y) {
    return {
      x, y, w: 16, h: 16, dir: -1,
      state: 'smoke_hold',
      phase: 0,
      hp: 3,
      maxHp: 3,
      woundedArm: null,
      alive: true,
      coverTarget: null,
      screamTimer: 0,
      headBox: {x: x+5, y: y+2, w: 6, h: 5},
      leftArmBox: {x: x+1, y: y+8, w: 4, h: 2},
      rightArmBox: {x: x+11, y: y+8, w: 4, h: 2},
      bodyBox: {x: x+3, y: y+7, w: 10, h: 8},
    };
  }

  const goons = [
    makeGoon(110, GROUND_Y - 16),
    makeGoon(150, GROUND_Y - 16),
    makeGoon(170, GROUND_Y - 16),
  ];
  goons.forEach((g, i) => { g.dir = i % 2 ? -1 : 1; g.state = 'smoke_hold'; g.phase = rng(); });

  // NPCs (bystanders)
  const npcs = [
    { type: 'mother', x: 60, y: GROUND_Y - 16, dir: 1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false },
    { type: 'oldman', x: 240, y: GROUND_Y - 16, dir: -1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false },
    { type: 'kid', x: 360, y: GROUND_Y - 16, dir: 1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false },
    { type: 'hotgirl', x: 480, y: GROUND_Y - 16, dir: -1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false },
  ];

  const bullets = [];
  const enemyBullets = [];
  const bossBullets = [];
  const particles = [];
  const floatTexts = []; // floating pickup titles {text,x,y,vx,vy,life,color,fontPx}
  const covers = [
    {x: 120, y: GROUND_Y - 8, w: 14, h: 8},
    {x: 260, y: GROUND_Y - 8, w: 14, h: 8},
    {x: 420, y: GROUND_Y - 8, w: 14, h: 8},
    {x: 640, y: GROUND_Y - 8, w: 14, h: 8},
  ];
  // Iconic red telephone booth near the right end (behind the boss area)
  const telephoneBooth = {
    // place just before the world edge, slightly to the right of boss spawn
    x: WORLD_W - 52, // boss spawns at WORLD_W - 64, so this sits a bit to his right
    y: GROUND_Y - 28,
    w: 14,
    h: 28,
    // cutscene door animation 0..1 (closed->open)
    doorOpen: 0,
  };

  // Points of Interest (investigation items)
  const pois = [
    { x: 200, y: GROUND_Y - 6, w: 6, h: 4, title: 'Scratch marks', note: 'Strange scratch marks near cover.', taken: false },
    { x: 320, y: GROUND_Y - 6, w: 6, h: 4, title: 'Initialed coin', note: 'A coin on the ground with initials.', taken: false },
    { x: 520, y: GROUND_Y - 6, w: 6, h: 4, title: 'Fresh cigarette', note: 'Fresh cigarette butt—someone waited here.', taken: false },
  ];

  // Background features
  const stars = Array.from({length: 70}, () => ({
    x: Math.floor(rng()*WORLD_W), y: Math.floor(rng()*(GROUND_Y-40)), tw: rng()*Math.PI*2
  }));
  const clouds = Array.from({length: 8}, (_,i) => ({
    x: rng()*WORLD_W, y: 10 + rng()*40, s: 8 + rng()*12, layer: i%2
  }));
  // Visual Upgrade 2.0 — layered traffic
  // Background traffic queue (grounded) with realistic stop-and-go behavior
  const bgTraffic = [];
  let bgTrafficSpawn = 0; // legacy, unused by queue but kept for safety
  let bgQueueInit = false;
  const BG_QUEUE_DIR = 1; // cars move to the right as a single queue
  const BG_MIN_GAP = 6;   // minimum spacing between cars (pixels)
  const BG_BASE_SPD_MIN = 8; // per-car base speed
  const BG_BASE_SPD_MAX = 16;
  let jamActive = false;  // traffic jam wave flag
  let jamTimer = 0;       // toggles stop/go with variability
  let jamCooldown = 0;    // when >0, reduce chance to jam to allow clearing
  // Foreground traffic: silhouettes moving quickly across the bottom
  const traffic = [];
  let trafficSpawn = 0;
  const buildings = [];
  (function buildSkyline() {
    let x = 0;
    while (x < WORLD_W) {
      const w = 14 + Math.floor(rng()*10);
      const h = 28 + Math.floor(rng()*36);
      const bx = x + Math.floor(rng()*6);
      buildings.push({ x: bx, w, h, windows: [], lightTimer: 2 + rng()*6 });
      // window grid precompute (every 4x4)
      const win = [];
      for (let wy = GROUND_Y - h + 10; wy < GROUND_Y - 10; wy += 8) {
        for (let wx = bx + 2; wx < bx + w - 2; wx += 8) {
          const lit = rng() < 0.04; // far fewer lights
          win.push({ x: wx, y: wy, lit, silTimer: 0 });
        }
      }
      buildings[buildings.length-1].windows = win;
      x += w + 6 + Math.floor(rng()*10);
    }
  })();

  // Helpers
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnSmoke(x, y, dir) {
    for (let i = 0; i < 6; i++) {
      particles.push({
        type: 'smoke', x: x + (rng()-0.5)*2, y: y + (rng()-0.5)*2, vx: (rng()-0.5)*10 + dir*5, vy: -10 - rng()*8,
        life: 0.8 + rng()*0.6,
      });
    }
  }

  function spawnTraffic() {
    const dir = rng() < 0.5 ? -1 : 1;
    // Larger foreground vehicles (about 2x)
    const h = 16 + Math.floor(rng()*8);
    // Place near bottom so part of car is cropped by bottom border
    const y = VH - Math.floor(h * 0.7);
    const speed = 70 + rng()*70;
    const w = 44 + Math.floor(rng()*32);
    // 1970s variants: 'sedan', 'coupe', 'wagon'
    const variants = ['sedan','coupe','wagon'];
    const variant = variants[(Math.random()*variants.length)|0];
    const palette = ['#1b2230','#28334a','#3a2a28','#2a3b2f','#2c2c2c'];
    const color = palette[(Math.random()*palette.length)|0];
    const wheelColor = '#0a0a0a';
    traffic.push({ x: dir === 1 ? -w-10 : WORLD_W + 10, y, w, h, dir, speed, color, wheelColor, t: 0, variant });
  }

  function spawnBgTrafficCar(x) {
    // Tiny grounded car on the road (2px tall)
    const w = 4 + Math.floor(rng()*5);
    const h = 2;
    const y = GROUND_Y - h; // sit on ground
    const color = rng() < 0.4 ? '#0b0f17' : (rng()<0.5 ? '#0a0d14' : '#0e131b');
    const dir = BG_QUEUE_DIR;
    // Per-car dynamics
    const baseSpeed = BG_BASE_SPD_MIN + rng() * (BG_BASE_SPD_MAX - BG_BASE_SPD_MIN);
    const gap = BG_MIN_GAP + Math.floor(rng()*6);
    const react = 0.2 + rng()*0.8; // seconds delay to react
    return { x, y, w, h, dir, speed: 0, targetSpeed: baseSpeed, baseSpeed, color, t: 0, gap, react, reactT: react, jitter: (rng()-0.5)*0.3 };
  }

  function spawnBlood(x, y) {
    for (let i = 0; i < 8; i++) {
      particles.push({ type: 'blood', x, y, vx: (rng()-0.5)*30, vy: -rng()*40, life: 0.6 + rng()*0.4 });
    }
  }

  function spawnBloodPool(x, y, maxR = 10) {
    // A slowly expanding pixel-art blood pool that splatters downward only
    const seed = (Math.floor(rng()*1e9) >>> 0);
    // Preselect a few stream columns for long drips
    const streamCount = 2 + Math.floor(rng()*4); // 2..5
    const streams = [];
    for (let i = 0; i < streamCount; i++) {
      const dx = -maxR + 2 + Math.floor(rng() * (maxR*2 - 3));
      const lenMax = 3 + Math.floor(rng() * Math.max(4, maxR * 0.8));
      const thick = rng() < 0.35 ? 2 : 1;
      streams.push({ dx, lenMax, thick });
    }
    particles.push({ type: 'bloodPool', x, y, r: 1, maxR, grow: 10 + rng()*10, life: 9999, seed, streams });
  }

  function fireMagnum(px, py, dir, damage) {
    bullets.push({ x: px, y: py, w: 3, h: 2, vx: 220 * dir, vy: 0, life: 0.8, damage });
    // muzzle flash particle with power tied to damage, plus sparks
    particles.push({ type: 'muzzle', x: px + (dir>0?2:-2), y: py+1, dir, life: 0.08, power: Math.max(1.0, damage*1.2) });
    for (let i=0;i<6;i++) {
      const ang = (rng()*0.4 - 0.2) + (dir>0?0:Math.PI);
      const spd = 120 + rng()*100;
      particles.push({ type: 'spark', x: px, y: py, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd*0.3, life: 0.15 + rng()*0.1 });
    }
      // Screen shake kick by damage tier
      const shakeAdd = damage === 3 ? 2.5 : (damage === 2 ? 1.6 : 0.8);
      screenShake = Math.min(4, screenShake + shakeAdd);
  }

  function fireGoonPistol(x, y, dir) {
    enemyBullets.push({ x, y, w: 2, h: 2, vx: 140 * dir, vy: 0, life: 1.2 });
  }

  // Boss projectiles: slow and at selectable heights ("high" or "low")
  function fireBossProjectile(x, y, dir, lane) {
    const speed = 60; // slow moving
    // Adjust low lane slightly higher so it intersects the player's lower hitbox reliably
    const py = lane === 'high' ? y - 6 : y + 5; // relative to boss center
    bossBullets.push({ x, y: py, w: 3, h: 2, vx: speed * dir, vy: 0, life: 6, lane });
  }

  // Background painter
  function drawBackground(t) {
  // Midnight sky fills viewport
  const g = ctx.createLinearGradient(0,0,0,VH);
    g.addColorStop(0, '#0a0b13');
    g.addColorStop(1, '#05060a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);

    // Stars (parallax slow)
    ctx.fillStyle = '#cbd1ff';
    for (const s of stars) {
      const sx = s.x - cameraX * 0.2;
      if (sx < -2 || sx > VW + 2) continue;
      const sy = s.y + Math.sin(t * 0.5 + s.tw) * 0.5;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }

    // Skyline silhouettes grounded (deep bluish, not yellow)
    for (const b of buildings) {
      const bx = b.x - cameraX*0.8; // slight parallax
      if (bx + b.w < -10 || bx > VW + 10) continue;
      // base rect
      // IMPORTANT: set fillStyle every iteration so previous window tint
      // does not leak and paint whole buildings yellow.
      ctx.fillStyle = '#0f1722';
      ctx.fillRect(bx, GROUND_Y - b.h, b.w, b.h);
      // subtle vertical shade
      const grad = ctx.createLinearGradient(0, GROUND_Y - b.h, 0, GROUND_Y);
      grad.addColorStop(0, 'rgba(0,0,0,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, GROUND_Y - b.h, b.w, b.h);
      // windows
      for (const w of b.windows) {
        const wx = w.x - cameraX*0.8;
        if (wx < -2 || wx > VW + 2) continue;
        if (w.lit) {
          // draw a very dim, cool window so the skyline never looks yellow
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#2d2b19'; // dim amber core
          ctx.fillRect(wx, w.y, 1, 1);
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#4d4930'; // small highlight
          ctx.fillRect(wx, w.y, 1, 1);
          ctx.restore();
          if (w.silTimer > 0) {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(wx, w.y-1, 2, 2); // silhouette
          }
        }
      }
    }

    // Background tiny traffic (in front of skyline, behind ground) - no transparency
    for (const c of bgTraffic) {
      const x = c.x - cameraX * 0.6; // slower parallax
      if (x + c.w < -10 || x > VW + 10) continue;
      ctx.fillStyle = c.color;
      ctx.fillRect(Math.round(x), c.y, c.w, c.h);
      // Headlights and tail light (solid color)
      if (c.dir === 1) {
        ctx.fillStyle = '#fff3b4';
        ctx.fillRect(Math.round(x + c.w), c.y, 2, 1);
        ctx.fillStyle = '#c8281e';
        ctx.fillRect(Math.round(x - 1), c.y + 1, 1, 1);
      } else {
        ctx.fillStyle = '#fff3b4';
        ctx.fillRect(Math.round(x - 2), c.y, 2, 1);
        ctx.fillStyle = '#c8281e';
        ctx.fillRect(Math.round(x + c.w), c.y + 1, 1, 1);
      }
    }

    // Ground
  ctx.fillStyle = '#212228';
  ctx.fillRect(0, GROUND_Y, VW, VH-GROUND_Y);

    // Props / covers
    ctx.fillStyle = '#2b2e35';
    for (const c of covers) {
      const cx = c.x - cameraX;
      if (cx + c.w < 0 || cx > VW) continue;
      ctx.fillRect(cx, c.y, c.w, c.h);
    }

    // Red telephone booth (behind characters, on ground)
    (function drawTelephoneBooth() {
      const bx = telephoneBooth.x - cameraX;
      const by = telephoneBooth.y;
      const bw = telephoneBooth.w;
      const bh = telephoneBooth.h;
      if (bx + bw < -2 || bx > VW + 2) return;
      // Main body
      const RED = '#b01217';
      const RED_D = '#7d0e12';
      const RED_L = '#e03535';
      const GLASS = '#121724';
      const FRAME = '#2a2a2a';
      // Body silhouette
      ctx.fillStyle = RED;
      ctx.fillRect(Math.round(bx), Math.round(by), bw, bh);
      // Dark right-side shading to sell volume
      ctx.fillStyle = RED_D;
      ctx.fillRect(Math.round(bx + bw - 2), Math.round(by + 1), 2, bh - 2);
      // Inner glass panel (door window)
      const gx = Math.round(bx + 3);
      const gy = Math.round(by + 8);
      const gw = bw - 6;
      const gh = bh - 12;
      ctx.fillStyle = GLASS;
      ctx.fillRect(gx, gy, gw, gh);
      // Window muntins (simple grid)
      ctx.fillStyle = FRAME;
      // vertical center bar
      ctx.fillRect(gx + Math.floor(gw/2), gy, 1, gh);
      // a couple horizontal bars
      ctx.fillRect(gx, gy + Math.floor(gh/3), gw, 1);
      ctx.fillRect(gx, gy + Math.floor(2*gh/3), gw, 1);
      // Top signage panel
      const signH = 4;
      ctx.fillStyle = RED_L;
      ctx.fillRect(Math.round(bx + 1), Math.round(by + 1), bw - 2, signH);
      // Tiny white "TELE" hint marks (no actual text at this res)
      ctx.fillStyle = '#eaeaea';
      ctx.fillRect(Math.round(bx + 3), Math.round(by + 2), 2, 1);
      ctx.fillRect(Math.round(bx + 6), Math.round(by + 2), 2, 1);
      ctx.fillRect(Math.round(bx + 9), Math.round(by + 2), 2, 1);
      // Door hint line and handle
      ctx.fillStyle = FRAME;
      ctx.fillRect(Math.round(bx + 2), Math.round(by + 7), 1, bh - 10);
      ctx.fillStyle = '#cfcfcf';
      ctx.fillRect(Math.round(bx + bw - 4), Math.round(by + Math.max(12, Math.floor(bh*0.55))), 1, 2);
      // Ground shadow
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(Math.round(bx + 1), GROUND_Y - 1, bw - 2, 1);
      ctx.globalAlpha = 1;
    })();

    // Street grime lines
    ctx.strokeStyle = '#2a2c31';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    for (let wx = Math.floor(cameraX/6)*6; wx < cameraX + VW; wx += 6) {
      if (((wx/8)|0)%2===0) continue;
      const vx = wx - cameraX;
      ctx.beginPath();
      ctx.moveTo(vx, GROUND_Y);
      ctx.lineTo(vx+6, VH);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Foreground traffic draw (over world, under blood/NPCs for parallax feel)
  function drawTraffic(t) {
    ctx.save();
    for (const c of traffic) {
      const x = c.x - cameraX * 1.2; // slight faster parallax to feel foreground
      // body
      ctx.fillStyle = c.color;
      ctx.fillRect(Math.round(x), c.y, c.w, c.h);
      // cabin
      ctx.fillStyle = '#121724';
      const cabH = Math.max(4, Math.round(c.h * 0.35));
      ctx.fillRect(Math.round(x + c.w*0.15), c.y - cabH + 1, Math.round(c.w*0.4), cabH - 1);
      // wheels
      ctx.fillStyle = c.wheelColor;
      const wheelY = c.y + c.h - 2;
      ctx.fillRect(Math.round(x + 5), wheelY, 3, 3);
      ctx.fillRect(Math.round(x + c.w - 8), wheelY, 3, 3);
      // headlight hint
      if (c.dir === 1) {
        ctx.fillStyle = '#fff3b4';
        ctx.fillRect(Math.round(x + c.w), c.y + Math.max(2, Math.floor(c.h*0.25)), 3, 1);
      } else {
        ctx.fillStyle = '#fff3b4';
        ctx.fillRect(Math.round(x - 3), c.y + Math.max(2, Math.floor(c.h*0.25)), 3, 1);
      }
    }
    ctx.restore();
  }

  // Game state
  let paused = false;
  let playerIframes = 0; // brief invulnerability after hit
  let lastGunshotTime = -1000; // seconds, for NPC de-escalation
  let idleHintCooldown = 0; // seconds to avoid repeating hints
  // Dialogue manager: single active bubble + queue to avoid overlap
  const dialogue = {
    current: null, // {text,x,y,life, speaker:'harry'|'npc'|'system', entity:null|ref, tag?:string}
    queue: [],
  };
  const caseNotes = []; // journal list of clues
  let journalOpen = false;

  // Narrative banner with typewriter effect
  const narrative = {
    target: "Somewhere in L.A., dangerous man is on loose",
    typedCount: 0,
    speed: 30, // chars per second
    hold: 0,
    holdAfterComplete: 2.0,
    queue: [],
  };

  // Title typewriter above canvas
  const titleType = {
    text: 'DIRTY HARRY',
    typed: 0,
    speed: 16, // cps
    done: false,
  };

  function setNarrative(text) {
    if (!text) return;
    // Queue if something is currently typing or holding
    if (narrative.typedCount < narrative.target.length || narrative.hold > 0) {
      narrative.queue.push(text);
    } else {
      narrative.target = text;
      narrative.typedCount = 0;
      narrative.hold = 0;
    }
  }

  // Boss state
  let boss = null; // {x,y,w,h,dir,hp,maxHp,alive,state,fireCd,tauntCd,bodyBox,invincible}
  let bossArena = null; // {left,right}
  let bossFightActive = false;
  let victory = false;
  // Boss intro cutscene state machine
  const bossCutscene = {
    active: false,
    phase: 'idle', // 'opening' | 'exit' | 'taunt' | 'done'
    timer: 0,
    lockLeftX: 0,
    exitTargetX: 0,
  };
  // Ensure approach trigger doesn't skip the intro
  let bossIntroDone = false;
  function cluesComplete() {
    const allPoi = pois.every(p => p.taken);
    const allNpc = npcs.every(n => n.clueGiven || n.state === 'down');
    return allPoi && allNpc;
  }
  function missingCluesSummary() {
    const missing = [];
    const remPoi = pois.filter(p => !p.taken).length;
    const remNpc = npcs.filter(n => !n.clueGiven && n.state !== 'down').map(n => n.type);
    if (remPoi > 0) missing.push(`${remPoi} clue${remPoi>1?'s':''} on the ground`);
    if (remNpc.length > 0) missing.push('talk to ' + remNpc.join(', '));
    return missing.length ? missing.join('; ') : 'none';
  }
  function spawnBoss() {
    // Spawn hidden inside the booth; revealed via cutscene
    const bx = telephoneBooth.x + 4; // roughly center behind the door glass
    const by = GROUND_Y - 16;
    boss = {
      x: bx, y: by, w: 16, h: 16, dir: -1,
      hp: 12, maxHp: 12, alive: true, state: 'idle',
      fireCd: 1.2, tauntCd: 0,
      bodyBox: { x: bx+3, y: by+4, w: 10, h: 9 },
      invincible: true,
      hidden: true, // not rendered or collidable until doors open
    };
    // Do NOT start the fight yet. Let player approach to trigger it.
    // Reset booth door for intro
    telephoneBooth.doorOpen = 0;
  }

  function startBossFight(silent = false) {
    if (!boss || bossFightActive) return;
    // Place the left barrier just behind the player's current position to block retreat
    const leftBarrier = Math.max(0, Math.floor(player.x));
    const rightBarrier = WORLD_W - 8;
    bossArena = { left: leftBarrier, right: rightBarrier };
    bossFightActive = true;
    boss.invincible = false;
    boss.state = 'intro';
    boss.fireCd = 1.0;
    if (!silent) {
      say('Boss: You finally made it, Harry.', boss.x + 2, boss.y - 4, 2.2, { speaker: 'npc', tag: 'boss-intro' });
      setNarrative('Confrontation: the man behind it all.');
    }
    bossIntroDone = true;
  }
  function maybeBossTaunt(t, reason) {
    if (!boss || !boss.alive) return;
    if (!boss._nextTaunt) boss._nextTaunt = 0;
    if (t < boss._nextTaunt) return;
    const insults = reason === 'hit' ? [
      'Boss: Cute trick, cop.',
      'Boss: That all you got?',
      'Boss: You scratch easy.'
    ] : [
      'Boss: Gonna duck forever?',
      'Boss: Try keepin\' up.',
      'Boss: You\'re slow, Harry.'
    ];
    const line = insults[(Math.random()*insults.length)|0];
    say(line, boss.x + 2, boss.y - 4, 1.6, { speaker: 'npc', tag: 'boss-taunt' });
    // Harry quip after a beat
    const quips = [
      'Harry: Feeling lucky?',
      'Harry: Mouth writes checks...',
      'Harry: Keep talking.'
    ];
    const q = quips[(Math.random()*quips.length)|0];
    setTimeout(() => {
      if (bossFightActive) say(q, player.x + 2, player.y - 2, 1.4, { speaker: 'harry', tag: 'quip' });
    }, 500);
    boss._nextTaunt = t + 3 + rng()*2;
  }
  function bossUpdate(dt, t) {
    // Spawn gate when player reaches far right
    if (!bossFightActive) {
      if (!boss && player.x > WORLD_W - 90 && !(bossUpdate._gateCooldown && bossUpdate._gateCooldown > 0)) {
        if (cluesComplete()) {
          spawnBoss();
        } else if (!dialogueActive()) {
          // Show specific info about what remains
          const info = missingCluesSummary();
          say('Need more evidence.', player.x + 2, player.y - 6, 1.4, { speaker: 'harry', tag: 'gate' });
          say('Missing: ' + info, player.x + 2, player.y - 2, 2.2, { speaker: 'system', tag: 'gate-info' });
          setNarrative('Collect all clues to confront the boss.');
          // Cooldown hint: avoid repeating every frame. Use a temp timer on bossUpdate
          bossUpdate._gateCooldown = 2.5;
        }
      }
      if (bossUpdate._gateCooldown && bossUpdate._gateCooldown > 0) bossUpdate._gateCooldown -= dt;
      // If boss exists but fight not started yet and intro is done, check if player has approached close enough to trigger the lock-in
      if (boss && bossIntroDone && !bossCutscene.active) {
        // keep bodyBox fresh for collisions
        boss.bodyBox.x = boss.x + 3; boss.bodyBox.y = boss.y + 4;
        const approach = 300; // pixels before contact when we should block path behind player (doubled from 20)
        if ((player.x + player.w) >= (boss.x - approach)) {
          startBossFight();
        }
      }
      // Do not execute boss combat behavior until fight starts
      if (!bossFightActive) return;
    }
    if (!boss) return;
    // Lock player in arena
    player.x = Math.max(bossArena.left, Math.min(bossArena.right - player.w, player.x));
    // Face player
    boss.dir = (player.x + 8) > (boss.x + 8) ? 1 : -1;
    // Update body box
    boss.bodyBox.x = boss.x + 3; boss.bodyBox.y = boss.y + 4;
    // Camera focus to arena region
    const arenaMid = Math.floor((bossArena.left + bossArena.right) / 2) - VW/2 + 10;
    cameraX = Math.max(0, Math.min(WORLD_W - VW, arenaMid));
    // State
    if (boss.state === 'intro') {
      boss.fireCd -= dt;
      if (boss.fireCd <= 0) { boss.state = 'fight'; boss.fireCd = 0.8; }
      return;
    }
    if (!boss.alive) {
  bossFightActive = false;
  victory = true;
  setNarrative('Case Closed.');
      return;
    }
    // Firing pattern: alternate high/low shots that require duck/jump
    boss.fireCd -= dt;
    if (boss.fireCd <= 0) {
      const lane = Math.random() < 0.5 ? 'high' : 'low';
      const dir = boss.dir;
      const mx = dir === 1 ? boss.x + 16 : boss.x - 2;
      const my = boss.y + 8;
      fireBossProjectile(mx, my, dir, lane);
      spawnSmoke(mx, my, dir);
      boss.fireCd = 1.2 + rng()*0.4;
      // Insult cadence
      maybeBossTaunt(t, 'fire');
    }
  }

  function tickNarrative(dt) {
    if (narrative.typedCount < narrative.target.length) {
      narrative.typedCount = Math.min(
        narrative.target.length,
        narrative.typedCount + narrative.speed * dt
      );
      if (narrative.typedCount >= narrative.target.length) {
        narrative.hold = narrative.holdAfterComplete;
      }
    } else if (narrative.queue.length > 0) {
      // small hold before next line
      if (narrative.hold > 0) {
        narrative.hold -= dt;
        if (narrative.hold <= 0) {
          const next = narrative.queue.shift();
          narrative.target = next;
          narrative.typedCount = 0;
          narrative.hold = 0;
        }
      }
    }
  }

  function tickTitle(dt) {
    if (!titleEl) return;
    if (!titleType.done) {
      titleType.typed = Math.min(titleType.text.length, titleType.typed + titleType.speed * dt);
      const n = Math.floor(titleType.typed);
      titleEl.textContent = titleType.text.slice(0, n);
      if (n >= titleType.text.length) titleType.done = true;
    }
  }

  function getTypedNarrative() {
    const n = Math.floor(narrative.typedCount);
    return narrative.target.slice(0, n);
  }

  function addNote(note) {
    caseNotes.push(note);
    // Update narrative to reflect new story beat
    const short = note.length > 58 ? note.slice(0, 55) + '…' : note;
    setNarrative('New lead: ' + short);
  }

  function say(text, x, y, time = 1.5, meta = {}) {
    const msg = { text, x, y, life: time, speaker: meta.speaker || 'system', entity: meta.entity || null, tag: meta.tag || null };
    if (!dialogue.current) dialogue.current = msg; else dialogue.queue.push(msg);
  }

  function dialogueActive() { return !!dialogue.current; }

  function clearDialogue() { dialogue.current = null; dialogue.queue.length = 0; }

  // Interrogation helper
  function startInterrogation(npc) {
    // Determine positions
    const harryX = player.x + 2;
    const harryY = player.y - 2;
    const npcX = npc.x + 2;
    const npcY = npc.y - 2;
    // Woman in red (hotgirl): custom fixed exchange
    if (npc.type === 'hotgirl') {
      // Sequence:
      // 1) Woman: "What do you need, sugar?"
      // 2) Harry: "Haven't you seen somebody dangerous?"
      // 3) Woman: "Only you, sugar."
      // 4) Woman (short clue): "He lingers by the phone booth."
      say('What do you need, sugar?', npcX, npcY, 1.6, { speaker: 'npc', entity: npc, tag: 'hotgirl-1' });
      say("Harry: Haven't you seen somebody dangerous?", harryX, harryY, 1.8, { speaker: 'harry', tag: 'hotgirl-2' });
      say('Only you, sugar.', npcX, npcY, 1.6, { speaker: 'npc', entity: npc, tag: 'hotgirl-3' });
      // Provide a non-violent clue so the case can be completed without harming civilians
      const clue = 'He lingers by the phone booth.';
      say(clue, npcX, npcY, 1.8, { speaker: 'npc', entity: npc, tag: 'clue' });
      if (!npc.clueGiven) {
        addNote(clue);
        npc.clueGiven = true;
      }
      return;
    }
    // Harry opener
    const openers = [
      'Harry: Got a minute?',
      'Harry: I have a few questions.',
      'Harry: Talk to me.'
    ];
    const opener = openers[(Math.random() * openers.length) | 0];
    say(opener, harryX, harryY, 1.6, { speaker: 'harry', entity: null, tag: 'opener' });

    // Decide NPC initial reply
    const dx = (npc.x + 8) - (player.x + 8);
    const inSight = (player.dir === 1 && dx > 0) || (player.dir === -1 && dx < 0);
  // Consider NPC cooperative if calm or idle; intimidation still works but is not required
  const calmish = (npc.state === 'calm' || npc.state === 'idle');
  const cooperativeNow = calmish || (npc.state === 'afraid') || (player.aiming && Math.abs(dx) < 70 && inSight);

  let replyText;
    let replyTag = 'neutral';
    if (!npc.clueGiven && cooperativeNow) {
      // give clue based on type
      replyText = npc.type === 'mother'
        ? 'He wore a tan coat and smelled of smoke.'
        : npc.type === 'oldman'
        ? 'Alley ahead looked shady. Watch your back.'
        : 'He dropped a coin by the phone booth.';
      replyTag = 'clue';
    } else if (!npc.clueGiven) {
      // Non-cooperative line for non-hotgirl NPCs; hotgirl handled above
      replyText = 'Get lost, copper';
      replyTag = 'rude';
    } else {
      replyText = 'That\'s all I know.';
    }
    say(replyText, npcX, npcY, 1.8, { speaker: 'npc', entity: npc, tag: replyTag });

    // Mark that after a coerced response, we should provide the clue
    npc._pendingClueTag = (!npc.clueGiven);
    // If a real clue was given here, add it to notes and mark as given
    if (replyTag === 'clue' && !npc.clueGiven) {
      addNote(replyText);
      npc.clueGiven = true;
    }
  }

  // Loop
  let last = 0;
  function loop(ts) {
    const t = ts / 1000;
    const dt = Math.min(0.033, last ? t - last : 0.016);
    last = t;

    // Initialize idle timer baseline on first frame
    if (lastActivityTime === 0) lastActivityTime = t;

    if (!paused) update(dt, t);
    render(t);
    requestAnimationFrame(loop);
  }

  function update(dt, t) {
    // Input
  let left = keys.has('arrowleft') || keys.has('a');
  let right = keys.has('arrowright') || keys.has('d');
  let jumpKey = keys.has('arrowup') || keys.has('w');
  let down = keys.has('arrowdown') || keys.has('s');
  let aim = keys.has('shift');
  let shoot = pressed.has(' ');
  let interact = pressed.has('e');
  let toggleJournal = pressed.has('j');

    // Boss intro cutscene trigger & control lock
    // Conditions to start: boss exists, intro not done, not already active, and booth is visible in viewport
  if (boss && !bossFightActive && !bossCutscene.active && !bossIntroDone) {
      const bx = telephoneBooth.x - cameraX;
      const boothVisible = (bx + telephoneBooth.w >= 0 && bx <= VW);
      // Also require player be near right side so camera is near booth, to avoid accidental trigger from far
      const nearRight = player.x > WORLD_W - 120;
      if (boothVisible && nearRight) {
        bossCutscene.active = true;
        bossCutscene.phase = 'opening';
        bossCutscene.timer = 0;
        // Lock backtracking at current player X (immediate disable for player to go back)
        bossCutscene.lockLeftX = Math.floor(player.x);
        // Target where boss will exit to (just left of booth)
        bossCutscene.exitTargetX = telephoneBooth.x - 18;
        // Make boss invincible and idle
        boss.invincible = true;
        boss.state = 'idle';
        // Ensure boss starts inside the booth; reveal immediately so he can be seen behind the door grid
        boss.x = telephoneBooth.x + 4;
        boss.hidden = false;
      }
    }

    // If cutscene active, override inputs and control flow
    if (bossCutscene.active) {
      // Disable all inputs during cutscene
      left = right = jumpKey = down = aim = false;
      shoot = interact = toggleJournal = false;
      // Prevent moving left of the lock
      player.x = Math.max(bossCutscene.lockLeftX, player.x);
      // Camera: softly pan to keep booth and boss area in view
      const focusX = Math.max(0, Math.min(WORLD_W - VW, telephoneBooth.x - VW/2 + 4));
      cameraX += (focusX - cameraX) * Math.min(1, dt * 3);
      // Progress phases
      if (bossCutscene.phase === 'opening') {
        bossCutscene.timer += dt;
        telephoneBooth.doorOpen = Math.min(1, telephoneBooth.doorOpen + dt * 0.8);
        if (telephoneBooth.doorOpen >= 1) {
          // Doors fully open; begin exit step
          bossCutscene.phase = 'exit';
          bossCutscene.timer = 0;
        }
      } else if (bossCutscene.phase === 'exit') {
        // Boss steps out slowly to target X
        const target = bossCutscene.exitTargetX;
        const stepSpeed = 18; // px/s slow step
        const dir = Math.sign(target - boss.x) || -1;
        boss.dir = dir;
        if (Math.abs(target - boss.x) > 1) {
          boss.x += dir * stepSpeed * dt;
        } else {
          boss.x = target;
          boss.dir = -1;
          bossCutscene.phase = 'taunt';
          bossCutscene.timer = 0;
          // Deliver the line
          say('BRING IT ON, HARRY!', boss.x + 4, boss.y - 6, 1.6, { speaker: 'npc', tag: 'boss-taunt-start' });
        }
      } else if (bossCutscene.phase === 'taunt') {
        bossCutscene.timer += dt;
        if (bossCutscene.timer > 1.7 && !dialogueActive()) {
          bossCutscene.phase = 'done';
          bossCutscene.timer = 0;
          // Start the fight now, restore controls
          bossIntroDone = true;
          startBossFight(true);
          // Make sure the arena left barrier is not further left than lockLeftX
          if (bossArena) bossArena.left = Math.max(bossArena.left, bossCutscene.lockLeftX);
          bossCutscene.active = false;
        }
      }
    }

  player.aiming = aim;

    // Horizontal movement
  let vx = 0;
    if (left) { vx -= player.speed; player.dir = -1; }
    if (right) { vx += player.speed; player.dir = 1; }
    if (player.crouch) vx *= 0.6; // slower while crouched

    // Jump/Duck
    // Start crouch only if on ground
    player.crouch = down && player.onGround;
    // Jump if on ground and jump key pressed and not crouching
    if (jumpKey && player.onGround && !player.crouch) {
      player.vy = -150;
      player.onGround = false;
    }

    // Apply gravity
    player.vy += GRAVITY * dt;
    // Integrate
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

    // Clamp to ground area
  player.x = Math.max(0, Math.min(WORLD_W - player.w, player.x));
  // During cutscene, enforce left lock again post-integration
  if (bossCutscene.active) player.x = Math.max(bossCutscene.lockLeftX, player.x);

    // Anim: make walking cycle a bit snappier
  const moving = Math.abs(vx) > 0.01 && player.onGround; // walk only when on ground
    player.anim += (moving ? 1.6 : 0.5) * dt;

    // Deep idle breathing control: only builds up when truly idle
    const idleForBreath = !moving && player.onGround && !player.aiming && !player.crouch && player.recoil <= 0.01;
    const targetBreathAmp = idleForBreath ? 1 : 0;
    // Critically damped approach to target amplitude
    player.breathAmp += (targetBreathAmp - player.breathAmp) * Math.min(1, dt * 2.2);
    if (idleForBreath) player.breathT += dt;

  // Suit jacket springy sway: follows horizontal movement with damping + ambient wind
  // Add a gentle wind term that slowly oscillates so the unbuttoned coat always swirls a bit
  const wind = Math.sin(t * 0.35) * 0.6; // pixels, very subtle
  const targetSway = (vx / Math.max(1, player.speed)) * 2.0 + wind; // target pixels of sway (max ~±2 plus wind)
    const k = 40; // spring constant
    const c = 10; // damping
    const dxS = targetSway - player.jacketSway;
    const aS = k * dxS - c * player.jacketSwayV;
    player.jacketSwayV += aS * dt;
    player.jacketSway += player.jacketSwayV * dt;
    // Extra damping when almost stopped
    if (Math.abs(vx) < 2) player.jacketSwayV *= 0.98;
    // Foot-plant impulse to add life to flap: detect zero crossing of stride sine
    const stepSign = Math.sign(Math.sin(player.anim * Math.PI * 2));
    if (moving && player.onGround && stepSign !== 0 && stepSign !== player.lastStepSign) {
      // Impulse opposite to planting foot so coat flaps
      player.jacketSwayV += (-stepSign) * 26; // tuned impulse
    }
    player.lastStepSign = stepSign;

    // Idle gun twirl scheduler
    // Conditions: idle (not moving), on ground, not aiming/crouching, not recoiling, not in dialogue typing input
    const canTwirl = !moving && player.onGround && !player.aiming && !player.crouch && player.recoil <= 0.01;
    // Cooldown decay
    if (player.twirlCooldown > 0) player.twirlCooldown -= dt;
    if (player.twirlActive) {
      // Progress twirl and finish
      player.twirlT += dt / 0.9; // ~0.9s animation
      if (!canTwirl) { // canceled by action
        player.twirlActive = false; player.twirlT = 0; player.twirlCooldown = 1.5;
      } else if (player.twirlT >= 1) {
        player.twirlActive = false; player.twirlT = 0; player.twirlCooldown = 2.5 + rng()*2.0; // random quiet gap
      }
    } else if (canTwirl && player.twirlCooldown <= 0) {
      // Random chance each second to start
      if (rng() < 0.015) { // ~1.5% per frame-second aggregate
        player.twirlActive = true; player.twirlT = 0;
      }
    } else if (!canTwirl) {
      // keep cooldown modest when activity occurs
      if (player.twirlCooldown < 1.2) player.twirlCooldown = 1.2;
    }

  // Fire
    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    if (shoot && player.fireCooldown <= 0) {
  const muzzleX = player.dir === 1 ? player.x + 16 : player.x - 2;
  const muzzleY = player.y + (player.crouch ? 11 : 9);
      // Damage tiers:
      // 1 = standing (no aim), 2 = aiming, 3 = crouching + aiming
      const damage = (player.aiming && player.crouch) ? 3 : (player.aiming ? 2 : 1);
      fireMagnum(muzzleX, muzzleY, player.dir, damage);
      // Apply recoil proportional to damage
      const recoilTier = damage === 3 ? 2.6 : (damage === 2 ? 1.6 : 0.6);
      player.recoil = recoilTier;
    spawnSmoke(muzzleX, muzzleY, player.dir);
    // Rate of fire scaling: 1x for DMG1, 2x cooldown (half ROF) for DMG2, 3x cooldown (one-third ROF) for DMG3
    const baseCd = 0.3;
    player.fireCooldown = baseCd * (damage === 3 ? 3 : (damage === 2 ? 2 : 1));
      lastGunshotTime = t;

      // Nearby goons react to shot: aggro and attempt to fire back after a short delay
      for (const g of goons) {
        if (!g.alive || g.state === 'dying' || g.state === 'dead') continue; // do not wake or alter dying/dead goons
        const dx = (g.x + 8) - (player.x + 8);
        const dist = Math.abs(dx);
        if (dist < 80 && g.state !== 'wounded') {
          g.state = 'run';
          g.dir = dx < 0 ? 1 : -1;
          g.aggroTimer = 0.2 + rng() * 0.3;
        }
      }

        // Bystanders panic if they see/hear the shot in proximity and in front of player
        // Do NOT affect civilians that are already in a death animation or downed.
        // Only the closest eligible bystander will shout to avoid overlapping chatter.
        let nearestPanic = null, nearestPD = 1e9;
        for (const n of npcs) {
          // Skip if this NPC is dying, already down, or flagged bullet-immune from fatal hit
          if (n.state === 'dying' || n.state === 'down' || n.bulletImmune) continue;
          const dxn = (n.x + 8) - (player.x + 8);
          const inSight = (player.dir === 1 && dxn > 0) || (player.dir === -1 && dxn < 0);
          const d = Math.abs(dxn);
          if (d < 100 && inSight) {
            if (d < nearestPD) { nearestPD = d; nearestPanic = n; }
            // set flee state for all eligible, but only one will vocalize
            n.state = 'flee';
            n.fear = Math.max(n.fear, 0.7);
            n.dir = dxn > 0 ? 1 : -1; // run away further
          }
        }
        if (nearestPanic) {
          say('Aaah!', nearestPanic.x + 2, nearestPanic.y - 2, 1.2, { speaker: 'npc', entity: nearestPanic, tag: 'panic' });
        }
    }

  // Journal toggle
  if (toggleJournal) journalOpen = !journalOpen;

  // Update idle activity time if moving/aiming even without new keydown
  if (Math.abs(vx) > 0.01 || Math.abs(player.vy) > 0.01 || aim || shoot || interact || toggleJournal) {
    lastActivityTime = t;
  }

  // Idle hint after 10s of no activity, with a cooldown to prevent spam
  if (t - lastActivityTime > 10 && idleHintCooldown <= 0 && !dialogueActive()) {
    // Simple heuristic: if any NPC without clue, suggest talking; else if any POI not taken, suggest investigating; otherwise proceed
    const npcNeedsClue = npcs.some(n => !n.clueGiven && n.state !== 'down');
    const poiAvailable = pois.some(p => !p.taken);
    let hint = npcNeedsClue ? 'Maybe I should talk to people.' : (poiAvailable ? 'Look around for clues on the ground.' : 'Keep moving—trouble is ahead.');
    say(hint, player.x + 2, player.y - 4, 2.6, { speaker: 'harry', tag: 'idle-hint' });
    idleHintCooldown = 12; // don't repeat too often
  }
  if (idleHintCooldown > 0) idleHintCooldown -= dt;

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -10 || b.x > WORLD_W+10 || b.life <= 0) bullets.splice(i,1);
    }

    // Update enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -10 || b.x > WORLD_W + 10) { enemyBullets.splice(i,1); continue; }
      // hit player
      if (playerIframes <= 0) {
        const box = { x: b.x, y: b.y, w: b.w, h: b.h };
        const pbox = player.crouch
          ? { x: player.x+3, y: player.y+6, w: 10, h: 8 }
          : { x: player.x+3, y: player.y+2, w: 10, h: 12 };
        if (aabb(box, pbox)) {
          enemyBullets.splice(i,1);
          playerIframes = 0.6;
          particles.push({ type: 'blood', x: pbox.x + pbox.w/2, y: pbox.y + 3, vx: (rng()-0.5)*20, vy: -20, life: 0.4 });
          // apply damage
          if (player.alive) {
            player.hp = Math.max(0, player.hp - 1);
            if (player.hp <= 0) {
              player.alive = false;
            }
          }
        }
      }

      // Any shot cancels twirl immediately
      player.twirlActive = false; player.twirlT = 0; player.twirlCooldown = 2.0;
    }

    // Update boss bullets
    for (let i = bossBullets.length - 1; i >= 0; i--) {
      const b = bossBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -10 || b.x > WORLD_W + 10) { bossBullets.splice(i,1); continue; }
      if (playerIframes <= 0) {
        const box = { x: b.x, y: b.y, w: b.w, h: b.h };
        const pbox = player.crouch
          ? { x: player.x+3, y: player.y+6, w: 10, h: 8 }
          : { x: player.x+3, y: player.y+2, w: 10, h: 12 };
        if (aabb(box, pbox)) {
          bossBullets.splice(i,1);
          playerIframes = 0.6;
          particles.push({ type: 'blood', x: pbox.x + pbox.w/2, y: pbox.y + 3, vx: (rng()-0.5)*20, vy: -20, life: 0.4 });
          if (player.alive) {
            player.hp = Math.max(0, player.hp - 1);
            if (player.hp <= 0) player.alive = false;
          }
        }
      }
    }

    // Update particles and dialogue
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.type !== 'bloodPool') p.life -= dt;
      if (p.type === 'smoke') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 6 * dt;
      } else if (p.type === 'blood') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt;
      } else if (p.type === 'bloodPool') {
        // expand gently until reaching max radius
        p.r = Math.min(p.maxR, p.r + p.grow * dt);
      } else if (p.type === 'spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // quick gravity and drag
        p.vy += 200 * dt;
        p.vx *= 0.92; p.vy *= 0.92;
      }
      if (p.life <= 0) particles.splice(i,1);
    }
    // Screen shake decay
    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 6);
  if (dialogue.current) {
      dialogue.current.life -= dt;
      // Coercion check: if current line is rude from NPC and player aims, force cooperation
      const cur = dialogue.current;
      if (cur && cur.speaker === 'npc' && cur.tag === 'rude' && cur.entity) {
        const npc = cur.entity;
        const dx = (npc.x + 8) - (player.x + 8);
        const inSight = (player.dir === 1 && dx > 0) || (player.dir === -1 && dx < 0);
        const near = Math.abs(dx) < 24 && Math.abs(player.y - npc.y) < 8;
        if (player.aiming && inSight && near) {
          // Replace with cooperative response next
          // shorten current rude line
          cur.life = Math.min(cur.life, 0.3);
          // queue cooperative line if not already queued via coercion
          const alreadyQueued = dialogue.queue.some(q => q.entity === npc && q.tag === 'coerced');
          if (!alreadyQueued) {
            const npcX = npc.x + 2, npcY = npc.y - 2;
            const coop = npc.type === 'mother'
              ? 'Alright! He wore a tan coat... and smoked.'
              : npc.type === 'oldman'
              ? 'Okay, okay... The alley ahead is trouble.'
              : 'Fine! He dropped a coin near the phone.';
            // also a quick Harry follow-up could be added after, but keep short
            say(coop, npcX, npcY, 2.0, { speaker: 'npc', entity: npc, tag: 'coerced' });
            npc.state = 'calm';
            npc.fear = Math.max(npc.fear, 0.8);
            if (npc._pendingClueTag && !npc.clueGiven) {
              const cleaned = coop.replace(/^Fine!\s*|^Alright!\s*|^Okay, okay...\s*/,'').trim();
              addNote(cleaned);
              npc.clueGiven = true;
            }
          }
        }
      }
      if (dialogue.current && dialogue.current.life <= 0) {
        dialogue.current = dialogue.queue.shift() || null;
      }
    }
    // Update floating texts (pickup titles)
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const f = floatTexts[i];
      f.x += (f.vx || 0) * dt;
      f.y += (f.vy || -8) * dt;
      f.life -= dt;
      if (f.life <= 0) floatTexts.splice(i,1);
    }
  if (playerIframes > 0) playerIframes -= dt;
  // Recoil decay
  if (player.recoil > 0) player.recoil = Math.max(0, player.recoil - dt * 8);

    // Interact prioritization: talk first, then investigate POIs
    if (interact) {
      // Try nearest NPC within talk range
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
        // If aiming and NPC is panicked without clue, intimidate for immediate clue then calm (except hotgirl)
        if (player.aiming && (nearestNPC.state === 'afraid' || nearestNPC.state === 'flee') && !nearestNPC.clueGiven && nearestNPC.type !== 'hotgirl') {
          say('Harry: So, will ye speak?', player.x + 2, player.y - 2, 1.2, { speaker: 'harry', tag: 'intimidate' });
          const clue = nearestNPC.type === 'mother'
            ? 'He wore a tan coat.'
            : nearestNPC.type === 'oldman'
            ? 'The alley ahead is shady.'
            : 'He dropped a coin near the phone.';
          say(clue, nearestNPC.x + 2, nearestNPC.y - 2, 2.0, { speaker: 'npc', entity: nearestNPC, tag: 'clue' });
          addNote(clue);
          nearestNPC.clueGiven = true;
          nearestNPC.state = 'calm';
          nearestNPC.fear = Math.max(0, nearestNPC.fear - 0.6);
          nearestNPC.panicTimer = 0; // reset panic window
        } else if (nearestNPC.state === 'afraid' || nearestNPC.state === 'flee') {
          say('...okay, okay.', nearestNPC.x + 2, nearestNPC.y - 2, 1.2, { speaker: 'npc', entity: nearestNPC, tag: 'calmed' });
          nearestNPC.state = 'calm';
          nearestNPC.fear = Math.max(0, nearestNPC.fear - 0.6);
          nearestNPC.panicTimer = 0; // reset panic window
        } else {
          startInterrogation(nearestNPC);
        }
      } else {
        // Investigate POIs when close
        for (const p of pois) {
          if (p.taken) continue;
          const near = Math.abs((player.x+8) - (p.x + p.w/2)) < 12 && Math.abs((player.y+8) - (p.y)) < 12;
          if (near) {
            p.taken = true;
            addNote(p.note);
            // Floating green pickup title (smaller font, slight upward)
            const title = (p.title || 'Picked up').replace(/\s+/g, ' ').trim();
            floatTexts.push({ text: title, x: p.x, y: p.y - 6, vx: 0, vy: -8, life: 1.2, color: '#00cc66', fontPx: 5 });
            // No secondary bubble to avoid duplicate; journal/narrative already updated
            break;
          }
        }
      }
    }

  // Update skyline window lights
    for (const bld of buildings) {
      bld.lightTimer -= dt;
      if (bld.lightTimer <= 0) {
        bld.lightTimer = 2 + rng()*6;
        const w = bld.windows[(Math.random()*bld.windows.length)|0];
        if (w) {
          const turningOn = rng() < 0.6;
          w.lit = turningOn ? true : (rng() < 0.4 ? false : w.lit);
          if (turningOn && rng() < 0.3) w.silTimer = 1 + rng()*2; // briefly show silhouette
        }
      }
      for (const w of bld.windows) {
        if (w.silTimer > 0) w.silTimer -= dt;
      }
    }

    // Background traffic queue: initialize once with a train of cars off-screen to the left
    if (!bgQueueInit) {
      let x = -60; // start far off-screen
      for (let i = 0; i < 20; i++) {
        const car = spawnBgTrafficCar(x);
        bgTraffic.push(car);
        x -= (car.w + car.gap);
      }
      bgQueueInit = true;
      jamTimer = 2.5 + rng()*4.0;
      jamActive = false;
      jamCooldown = 6.0;
    }
    // Jam scheduler: toggles stop/go with variability and allows clearing
    jamTimer -= dt;
    if (jamTimer <= 0) {
      // Probability to toggle jam decreases when cooldown > 0
      const pToggle = jamCooldown > 0 ? 0.25 : 0.6;
      if (rng() < pToggle) jamActive = !jamActive;
      jamTimer = jamActive ? (0.8 + rng()*2.0) : (3.0 + rng()*6.0);
      if (!jamActive) jamCooldown = 6.0; // after go starts, keep it flowing for a while
    }
    if (jamCooldown > 0) jamCooldown -= dt;

    // Move the queue with per-car following, reaction delays, and variability
    if (bgTraffic.length > 0) {
      // Ensure cars are ordered from left to right for dir=1
      bgTraffic.sort((a,b)=>a.x-b.x);
      // Front-most car reacts to jamActive
      const front = bgTraffic[bgTraffic.length-1];
      const frontTarget = jamActive ? 0 : (front.baseSpeed * (0.8 + rng()*0.3));
      // front reaction smoothing
      front.targetSpeed = frontTarget;
      front.speed += (front.targetSpeed - front.speed) * Math.min(1, dt * 2.5);
      front.x += front.speed * front.dir * dt;
      front.t += dt;
      // Others follow with gap and reaction delays
      for (let i = bgTraffic.length - 2; i >= 0; i--) {
        const c = bgTraffic[i];
        const ahead = bgTraffic[i+1];
        // desired distance behind the car ahead
        const desiredX = ahead.x - ahead.w - c.gap;
        // compute desired speed based on spacing (simple proportional control)
        const gap = desiredX - c.x;
        const spacingTerm = Math.max(0, gap) * 0.9; // more gap -> accelerate
        const desiredSpeed = Math.min(c.baseSpeed, spacingTerm);
        // if jam active and near front, reduce desired speed further
        const influence = Math.max(0, Math.min(1, (ahead.x - c.x) / 40));
        const jamSlow = jamActive ? (1 - influence * 0.9) : 1;
        const finalTarget = desiredSpeed * jamSlow + c.jitter;
        // reaction timer: only update target occasionally
        c.reactT -= dt;
        if (c.reactT <= 0) {
          c.targetSpeed = Math.max(0, finalTarget);
          c.reactT = c.react; // reset
        }
        // approach target speed
        c.speed += (c.targetSpeed - c.speed) * Math.min(1, dt * 2.0);
        c.x += c.speed * c.dir * dt;
        // do not pass desired position
        if (c.x > desiredX) {
          c.x = desiredX;
          c.speed = Math.min(c.speed, ahead.speed); // clamp to ahead speed
        }
        c.t += dt;
      }
      // Despawn cars far right, spawn new cars to the left to keep queue continuous
      for (let i = bgTraffic.length - 1; i >= 0; i--) {
        const c = bgTraffic[i];
        if (c.x - cameraX > WORLD_W + 60) {
          bgTraffic.splice(i,1);
        }
      }
      // Spawn tail if leftmost car is entering view
      if (bgTraffic.length > 0) {
        const tail = bgTraffic[0];
        if (tail.x > -20) {
          // add a new car behind tail
          const car = spawnBgTrafficCar(tail.x - (tail.w + tail.gap));
          bgTraffic.unshift(car);
        }
      }
    }

    // Foreground traffic spawn/update
    trafficSpawn -= dt;
    if (trafficSpawn <= 0) {
      if (rng() < 0.8) spawnTraffic();
      trafficSpawn = 1.6 + rng()*2.6;
    }
    for (let i = traffic.length - 1; i >= 0; i--) {
      const c = traffic[i];
      c.x += c.speed * c.dir * dt;
      c.t += dt;
      if ((c.dir === 1 && c.x - cameraX > VW + 40) || (c.dir === -1 && c.x - cameraX < -VW - 40)) {
        traffic.splice(i,1);
      }
    }

    // If player is dead, stop gameplay updates except restart/journal/particles/dialogue timers
    if (!player.alive) {
      // allow restart while dead (use continuous key state)
      if (keys.has('r')) restart();
      // ensure one-shot keys don't repeat while we're returning early
      pressed.clear();
      // still decay dialogue timers
      return;
    }

    // Automatically spawn/unlock boss when all NPCs are downed
    if (!bossFightActive && !boss) {
      const allDown = npcs.every(n => n.state === 'down');
      if (allDown) {
        spawnBoss();
        setNarrative('They forced your hand. The boss steps in.');
      }
    }

    // Goons behavior
    // Precompute nearest goon for chatter gating
    let nearestGoon = null, nearestGoonDist = 1e9;
    for (const g of goons) {
      // Dying animation progression
      if (g.state === 'dying') {
        g.deathT = (g.deathT || 0) + dt * 1.8; // faster collapse
        // Initial bleed spurts
        if (!g._bled && g.deathT > 0.05) {
          spawnBlood(g.x + 8, g.y + 8);
          g._bled = true;
        }
        // Pool once they are close to ground
        if (!g._pooled && g.deathT > 0.35) {
          spawnBloodPool(g.x + 8, GROUND_Y - 1, 12 + Math.floor(rng()*6));
          g._pooled = true;
        }
        if (g.deathT >= 1) { g.state = 'dead'; g.alive = false; }
        continue; // skip other AI while dying
      }
      if (!g.alive) continue;
      const d = Math.abs((g.x+8) - (player.x+8));
      if (d < nearestGoonDist) { nearestGoonDist = d; nearestGoon = g; }
    }
    for (const g of goons) {
      if (!g.alive) continue;
      // Update limb boxes based on current position
      g.headBox.x = g.x + 5; g.headBox.y = g.y + 2;
      g.leftArmBox.x = g.x + 1; g.leftArmBox.y = g.y + 8;
      g.rightArmBox.x = g.x + 11; g.rightArmBox.y = g.y + 8;
      g.bodyBox.x = g.x + 3; g.bodyBox.y = g.y + 7;

      g.phase += dt * 0.5;

      // Smoking state machine loop
      if (g.state.startsWith('smoke')) {
        const p = g.phase % 4;
        if (p < 1) g.state = 'smoke_hold';
        else if (p < 2) g.state = 'smoke_raise';
        else if (p < 3) { g.state = 'smoke_inhale'; }
        else { g.state = 'smoke_exhale'; if ((p-dt)%4<3 && p>=3) spawnSmoke(g.x + (g.dir===1?16:0), g.y + 9, g.dir); }
      }

      // Proximity chatter (cooldown per goon)
      const dxP = (player.x + 8) - (g.x + 8);
      const distP = Math.abs(dxP);
      g.talkCooldown = (g.talkCooldown || 0) - dt;
  if (distP < 34 && g.talkCooldown <= 0 && g.state !== 'wounded' && g.state !== 'dead' && g.state !== 'dying') {
        // Only let the closest goon speak to avoid overlap
        if (g !== nearestGoon) { g.talkCooldown = 1 + rng()*1.5; }
        else {
        const lines = [
          'That a .44?',
          'Easy, cop...',
          'Nice coat.',
          'Beat it, hero.',
          'You lost?'
        ];
        const text = lines[Math.floor(rng() * lines.length)];
          say(text, g.x + 2, g.y - 2, 1.4, { speaker: 'npc', entity: g, tag: 'goon' });
          g.talkCooldown = 3 + rng() * 2;
        }
      }

      // Fear reaction when player aims at them
      g.fear = (g.fear || 0);
      const inSight = (player.dir === 1 && player.x < g.x) || (player.dir === -1 && player.x > g.x);
  if (player.aiming && inSight && distP < 80 && g.state !== 'wounded' && g.state !== 'dead' && g.state !== 'dying') {
        g.state = 'scared';
        g.fear = Math.min(1, g.fear + dt * 2);
        // back away from player slowly
        const away = Math.sign(g.x - player.x);
        g.dir = away;
        g.x += away * 20 * dt;
      } else {
        g.fear = Math.max(0, g.fear - dt);
        if (g.state === 'scared' && g.fear <= 0.05) {
          g.state = 'smoke_hold';
        }
      }

      // If aggro from shot, count down and fire
      if (g.aggroTimer !== undefined && g.aggroTimer !== null) {
        g.aggroTimer -= dt;
        if (g.aggroTimer <= 0) {
          // fire towards player's current side, independent of current facing
          const shotDir = ((player.x + 8) > (g.x + 8)) ? 1 : -1;
          const muzzleX = shotDir === 1 ? g.x + 16 : g.x - 2;
          const muzzleY = g.y + 9;
          fireGoonPistol(muzzleX, muzzleY, shotDir);
          spawnSmoke(muzzleX, muzzleY, g.dir);
          g.aggroTimer = null;
        }
      }

      // If wounded, scream and find cover
      if (g.state === 'wounded') {
        if (g.screamTimer <= 0) g.screamTimer = 1.2;
        else g.screamTimer -= dt;
        // Choose nearest cover if none
        if (!g.coverTarget) {
          let best = null, bestD = 1e9;
          for (const c of covers) {
            const cx = c.x + c.w/2;
            const d = Math.abs(cx - (g.x+8));
            if (d < bestD) { bestD = d; best = c; }
          }
          g.coverTarget = best;
        }
        // Move towards cover
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

    // Boss logic and trigger
    bossUpdate(dt, t);

    // NPC behavior + idles
    for (const n of npcs) {
      n.panicTimer = (n.panicTimer || 0);
      // Dying animation progression
      if (n.state === 'dying') {
        n.deathT = (n.deathT || 0) + dt * 1.4;
        if (!n._pooled && n.deathT > 0.35) { spawnBloodPool(n.x + 8, GROUND_Y - 1, 8 + Math.floor(rng()*6)); n._pooled = true; }
        if (n.deathT >= 1) { n.state = 'down'; }
        continue;
      }
      // Calm down slowly when not threatened
      if (n.state !== 'down') n.fear = Math.max(0, n.fear - dt*0.2);
      // If player aims at NPC nearby, they get afraid
      const dx = (n.x + 8) - (player.x + 8);
      const inSight = (player.dir === 1 && dx > 0) || (player.dir === -1 && dx < 0);
      if (player.aiming && Math.abs(dx) < 70 && inSight && n.state !== 'down' && n.state !== 'dying' && n.type !== 'hotgirl') {
        n.state = 'afraid';
        n.fear = Math.min(1, n.fear + dt*2);
      }
      // flee runs away a bit
      if (n.state === 'flee') {
        n.x += (dx > 0 ? 30 : -30) * dt;
        // Once far enough from player, reduce panic
        if (Math.abs(dx) > 120) {
          n.panicTimer += dt;
          if (n.panicTimer > 1.5) {
            n.state = 'afraid';
          }
        }
      }
      // Natural de-escalation: if not aimed at and no recent gunshots, calm down fully after a while
      const notThreatened = !player.aiming && (t - lastGunshotTime) > 4;
      if ((n.state === 'afraid' || n.state === 'flee') && notThreatened && Math.abs(dx) > 40) {
        n.panicTimer += dt;
        if (n.panicTimer > 2.5 || n.fear < 0.15) {
          n.state = 'calm';
          n.fear = Math.max(0, n.fear - 0.4);
        }
      }
      if (n.state === 'calm' && !player.aiming && (t - lastGunshotTime) > 6) {
        // Eventually return to idle
        n.fear = Math.max(0, n.fear - dt*0.5);
        if (n.fear <= 0.05) n.state = 'idle';
      }
      // Post-calm clue opportunity
  const near = Math.abs(dx) < 16 && Math.abs(player.y - n.y) < 6;
      if (!dialogueActive() && near && n.state === 'calm' && !n.clueGiven && !interact && n.type !== 'hotgirl') {
        // Passive nudge line (short)
        if ((n.talkCooldown||0) <= 0) {
          const clue = n.type === 'mother'
            ? 'He wore a tan coat.'
            : n.type === 'oldman'
            ? 'The alley ahead is shady.'
            : 'Coin by the phone booth.';
          say(clue, n.x + 2, n.y - 2, 2.0, { speaker: 'npc', entity: n, tag: 'clue' });
          addNote(clue);
          n.clueGiven = true;
          n.talkCooldown = 3;
        }
      }
      if ((n.talkCooldown||0) > 0) n.talkCooldown -= dt;
      // Idle animations per type when idle/calm
      n.idleT = (n.idleT || 0) + dt;
      n._sy = 0; // reset per frame
      if (n.state === 'idle' || n.state === 'calm') {
        if (n.type === 'mother') {
          // gentle stroller sway via minor x oscillation
          n._sx = Math.sin(n.idleT * 1.4) * 0.4;
          n._sy = Math.sin(n.idleT * 1.2) * 0.3;
        }
        if (n.type === 'kid') {
          // bounce a ball: spawn a tiny particle following sine
          const phase = (Math.sin(n.idleT * 3) + 1) * 0.5;
          const by = n.y + 12 - Math.floor(phase * 3);
          // keep 1 ball particle
          if (!n._ball) n._ball = { x: n.x + (n.dir===1? 14 : -2), y: by, life: 0.2 };
          n._ball.x = n.x + (n.dir===1? 14 : -2);
          n._ball.y = by;
        }
        if (n.type === 'oldman') {
          // One-time shout when Harry passes across his position, with cane threatening
          // Track player's side relative to the old man: -1 = player left, 1 = right
          const playerSide = ((player.x + player.w/2) < (n.x + 8)) ? -1 : 1;
          if (typeof n._lastSide !== 'number') n._lastSide = playerSide;
          const close = Math.abs((n.x + 8) - (player.x + player.w/2)) < 14;
          if (!n._yelledOnce && close && playerSide !== n._lastSide) {
            // Trigger the shout exactly once on crossing
            n._yelledOnce = true;
            n.state = 'threaten';
            n._threatT = 0.9;
            n.dir = (player.x + player.w/2) > (n.x + 8) ? 1 : -1;
            say('Get off my lawn!', n.x + 2, n.y - 4, 1.2, { speaker: 'npc', entity: n, tag: 'yell' });
          }
          n._lastSide = playerSide;
          // Threaten animation small shake
          if (n.state === 'threaten') {
            n._threatT -= dt;
            n._sx = Math.sin(n.idleT * 24) * 0.3;
            if (n._threatT <= 0) {
              n.state = 'idle';
              n._threatT = 0;
            }
          } else {
            // regular subtle idle sway
            n._sy = Math.sin(n.idleT * 0.9) * 0.2;
          }
        }
        if (n.type === 'hotgirl') {
          // Continuous dancing idle: switch to 'dance' state when idle/calm
          if (n.state === 'idle' || n.state === 'calm') {
            n.state = 'dance';
          }
          // While dancing or calm/idle, use a more pronounced sway so it reads clearly at 16px
          const dtPhase = n.idleT || 0;
          const sxAmp = 1.0; // up to ±1 px
          const syAmp = 1.0; // up to ±1 px
          n._sx = Math.round(Math.sin(dtPhase * 2.4) * sxAmp);
          n._sy = Math.round(Math.sin(dtPhase * 1.8 + 0.6) * syAmp);
          // Disable previous random seduce pose to keep a consistent dance loop
          n._seduceActive = false;
        }
      }

      // Clamp in world
      n.x = Math.max(0, Math.min(WORLD_W - 16, n.x));
    }

    // Bullet collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const box = { x: b.x, y: b.y, w: b.w, h: b.h };
      let hit = false;
      const dmg = Math.max(1, b.damage || 1);
      // Hit boss (ignore while hidden)
      if (!hit && boss && boss.alive && !boss.hidden && aabb(box, boss.bodyBox)) {
        bullets.splice(i,1);
        // Ignore damage if fight hasn't started or boss is marked invincible
        if (!bossFightActive || boss.invincible) {
          // optional tiny spark to indicate no effect
          particles.push({ type: 'spark', x: boss.bodyBox.x + boss.bodyBox.w/2, y: boss.bodyBox.y + 6, vx: (rng()-0.5)*40, vy: -10, life: 0.08 });
        } else {
          boss.hp = Math.max(0, boss.hp - dmg);
          spawnBlood(boss.bodyBox.x + boss.bodyBox.w/2, boss.bodyBox.y + 4);
          if (boss.hp <= 0) {
            boss.alive = false;
            boss.state = 'dead';
            say('Harry: Do ya feel lucky now?', player.x + 2, player.y - 2, 2.0, { speaker: 'harry', tag: 'quip' });
          } else {
            // reactive taunt
            maybeBossTaunt(t, 'hit');
          }
        }
        hit = true;
      }
      for (const g of goons) {
        if (!g.alive) continue;
        // If the goon is already in the dying phase, ignore player bullets entirely (they pass through)
        if (g.state === 'dying') {
          // Do not collide or consume bullet
          continue;
        }
        if (aabb(box, g.headBox)) {
          // headshot
          if (g.state !== 'dying') { g.state = 'dying'; g.deathT = 0; g._pooled = false; g._bled = false; }
          spawnBlood(g.headBox.x+3, g.headBox.y+2);
          hit = true; break;
        }
        if (aabb(box, g.leftArmBox)) {
          g.hp = Math.max(0, g.hp - dmg);
          g.woundedArm = 'left';
          if (g.hp <= 0) {
            if (g.state !== 'dying') { g.state = 'dying'; g.deathT = 0; g._pooled = false; g._bled = false; }
          } else {
            g.state = 'wounded';
          }
          spawnBlood(g.leftArmBox.x+2, g.leftArmBox.y+1);
          hit = true; break;
        }
        if (aabb(box, g.rightArmBox)) {
          g.hp = Math.max(0, g.hp - dmg);
          g.woundedArm = 'right';
          if (g.hp <= 0) {
            if (g.state !== 'dying') { g.state = 'dying'; g.deathT = 0; g._pooled = false; g._bled = false; }
          } else {
            g.state = 'wounded';
          }
          spawnBlood(g.rightArmBox.x+2, g.rightArmBox.y+1);
          hit = true; break;
        }
        // Body shot: shoot down the goon
        if (aabb(box, g.bodyBox)) {
          g.hp = Math.max(0, g.hp - dmg);
          if (g.hp <= 0) {
            if (g.state !== 'dying') { g.state = 'dying'; g.deathT = 0; g._pooled = false; g._bled = false; }
          } else {
            g.state = 'wounded';
          }
          spawnBlood(g.bodyBox.x+5, g.bodyBox.y+4);
          hit = true; break;
        }
      }
      // NPC hits (body box) — ensure no hits during death animation or after first fatal hit
      if (!hit) {
        for (const n of npcs) {
          // Make NPCs invulnerable during their death animation or once flagged bulletImmune
          if (n.state === 'dying' || n.state === 'down' || n.bulletImmune) continue;
          const nbox = { x: n.x+3, y: n.y+3, w: 10, h: 10 };
          if (aabb(box, nbox)) {
            // Start dying only once; do not reset deathT if already dying
            if (n.state !== 'dying') { n.state = 'dying'; n.deathT = 0; n._pooled = false; n.bulletImmune = true; }
            spawnBlood(nbox.x+5, nbox.y+3);
            hit = true; break;
          }
        }
      }
      if (hit) bullets.splice(i,1);
    }

  // Narrative typing
  tickNarrative(dt);
  tickTitle(dt);

  // Camera follow
    if (!bossFightActive && !bossCutscene.active) {
      cameraX = Math.max(0, Math.min(WORLD_W - VW, (player.x + player.w/2) - VW/2));
    }

    // Pause/Restart
    if (pressed.has('p')) paused = !paused;
    if (pressed.has('r')) restart();
    // Clear one-shot key presses at the very end of update so handlers above can see them
    pressed.clear();
  }

  function restart() {
    player.x = 40; player.y = 120; player.dir = 1; player.fireCooldown = 0; player.anim = 0; player.aiming=false; playerIframes = 0; cameraX = 0;
    player.alive = true; player.hp = player.maxHp;
  bullets.length = 0; enemyBullets.length = 0; bossBullets.length = 0; particles.length = 0;
  dialogue.current = null; dialogue.queue.length = 0;
    boss = null; bossArena = null; bossFightActive = false; victory = false;
    bossCutscene.active = false; bossCutscene.phase = 'idle'; bossCutscene.timer = 0; bossCutscene.lockLeftX = 0; bossCutscene.exitTargetX = 0;
    bossIntroDone = false;
    telephoneBooth.doorOpen = 0;
    goons.length = 0;
    [110,150,170].forEach((x,i)=> goons.push({ ...makeGoon(x,GROUND_Y-16), dir: i%2?-1:1, phase: rng() }));
  npcs.length = 0;
  npcs.push({ type: 'mother', x: 60, y: GROUND_Y - 16, dir: 1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false });
  npcs.push({ type: 'oldman', x: 240, y: GROUND_Y - 16, dir: -1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false });
  npcs.push({ type: 'kid', x: 360, y: GROUND_Y - 16, dir: 1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false });
  npcs.push({ type: 'hotgirl', x: 480, y: GROUND_Y - 16, dir: -1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false });
  }

  function render(t) {
    // Clear
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width, canvas.height);
    // Render at virtual resolution
    ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.scale(canvas.width/VW, canvas.height/VH);
  // Apply small random screen shake
  if (screenShake > 0) {
    const sx = (rng()*2-1) * screenShake;
    const sy = (rng()*2-1) * screenShake;
    ctx.translate(Math.round(sx), Math.round(sy));
  }

  drawBackground(t);

  // Particles behind
    for (const p of particles) {
      if (p.type === 'smoke') {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = COLORS.smoke;
        ctx.beginPath();
        ctx.arc(p.x - cameraX, p.y, 2 + (1-p.life)*3, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.type === 'bloodPool') {
        // Pixel-art downward-only splatter with irregular edge and streams
        const r = Math.max(0, Math.floor(p.r));
        if (r > 0) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = COLORS.blood;
          const cx = Math.floor(p.x - cameraX);
          const cy = Math.floor(p.y); // baseline (ground contact)
          const seed = (p.seed >>> 0) || 0x9e3779b1;
          // helper: deterministic tiny jitter from dx and seed
          const jitter = (dx) => {
            let h = (dx * 73856093) ^ seed;
            h ^= h >>> 13; h = (h * 1274126177) >>> 0; h ^= h >>> 16;
            return (h % 3) - 1; // -1..1
          };
          for (let dx = -r; dx <= r; dx++) {
            const centerFalloff = Math.max(0, r - Math.abs(dx));
            let th = 1 + Math.floor(centerFalloff / 3) + jitter(dx);
            if (dx === 0) th += 1; // a tad thicker in the middle
            th = Math.max(1, th);
            // draw only downward from ground line
            ctx.fillRect(cx + dx, cy, 1, th);
            // ragged edges: occasional extra pixel below
            if ((dx + seed) % 5 === 0 && th > 2) ctx.fillRect(cx + dx, cy + th, 1, 1);
          }
          // Streams (longer drips under selected columns)
          const streams = Array.isArray(p.streams) ? p.streams : [];
          for (const s of streams) {
            const dx = Math.max(-r, Math.min(r, s.dx));
            const len = Math.min(s.lenMax, Math.floor(r * 0.9));
            if (len > 0) ctx.fillRect(cx + dx, cy + 2, s.thick || 1, len);
            // tiny side beads
            if (len > 3) ctx.fillRect(cx + dx + (s.thick===2?1:0), cy + len, 1, 1);
          }
          ctx.globalAlpha = 1;
        }
      }
    }

  // Precompute cloth wind sway for this frame (used by boss/player/goons)
  const windSway = Math.sin(t * 0.35) * 1.0;

  // Goons
    for (const g of goons) {
      // Draw goon with pixel-art dying frames
      const goonOpts = { windSway, deathT: (g.state==='dead'?1:(g.deathT||0)) };
      // Tint slightly when scared
      if (g.state === 'scared') { ctx.globalAlpha = 0.9; }
      drawGoon(ctx, Math.round(g.x - cameraX), Math.round(g.y), 1, g.dir, g.state, g.phase, g.woundedArm, goonOpts);
      ctx.globalAlpha = 1;
      if (g.state === 'smoke_exhale' && Math.floor(t*2)%2===0) {
        // Puff in front of mouth on the facing side
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = COLORS.smokeDark;
        const faceDir = g.dir;
        ctx.beginPath();
        ctx.arc(g.x - cameraX + (faceDir===1?12:4), g.y + 6, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (g.state === 'wounded' && g.screamTimer > 0 && !dialogueActive()) {
        drawSpeechBubble(ctx, 'HELP!', g.x - cameraX + 2, g.y - 2, 1, { speaker: 'npc', maxWidth: VW - 16 });
      }
    }

    // Boss: render only when not hidden
    if (boss && !boss.hidden) {
      drawBoss(ctx, Math.round(boss.x - cameraX), Math.round(boss.y), 1, boss.dir, boss.state, 0, { windSway });
    }

    // Player
    if (playerIframes > 0) {
      ctx.globalAlpha = 0.6 + 0.4*Math.sin(t*40);
    }
  // Precompute idle breath phase (period ~3.8s)
  const BREATH_PERIOD = 3.8;
  const breathPhase = (player.breathT % BREATH_PERIOD) / BREATH_PERIOD; // 0..1
  // Expose to goon overlay
  drawGoon._wind = windSway;
  drawPlayer(ctx, Math.round(player.x - cameraX), Math.round(player.y), 1, player.dir, player.anim, player.aiming, {
    crouch: player.crouch,
    jumping: !player.onGround,
    recoil: player.recoil,
    moving: Math.abs((keys.has('arrowleft')||keys.has('a')?-1:0) + (keys.has('arrowright')||keys.has('d')?1:0))>0 && player.onGround,
    twirlT: player.twirlActive ? player.twirlT : 0,
    jacketSway: player.jacketSway,
    breathAmp: player.breathAmp,
    breathPhase,
    hairColor: '#bcbcbc'
  });
    ctx.globalAlpha = 1;

    // Muzzle flash particles
    let activeFlash = false;
    for (const p of particles) {
      if (p.type === 'muzzle') {
        activeFlash = true;
        drawMuzzleFlash(ctx, p.x - cameraX, p.y, p.dir, Math.max(1, Math.min(3.5, p.power || 1)), t);
      }
    }
    // Add brief white flash overlay when shooting to sell the blast
    if (activeFlash) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();
    }

  // Bullets
    ctx.fillStyle = COLORS.gunMetal;
  for (const b of bullets) ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);
  // Enemy bullets darker
  ctx.fillStyle = COLORS.gunDark;
  for (const b of enemyBullets) ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);
  // Boss bullets distinct
  ctx.fillStyle = '#a82828';
  for (const b of bossBullets) ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);

    // Foreground particles (blood)
    for (const p of particles) {
      if (p.type === 'blood') {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = COLORS.blood;
        ctx.fillRect(p.x - cameraX, p.y, 1, 1);
        ctx.globalAlpha = 1;
      }
        if (p.type === 'spark') {
          ctx.fillStyle = '#ffd37f';
          ctx.fillRect(Math.round(p.x - cameraX), Math.round(p.y), 1, 1);
        }
    }

    // NPCs
    for (const n of npcs) {
      const ox = Math.round((n._sx || 0));
      const oy = Math.round((n._sy || 0));
      const npcOpts = { windSway, deathT: (n.state==='down'?1:(n.deathT||0)) };
      if (n.type === 'hotgirl') {
        // Enable dancing during idle/calm or explicit 'dance' state; phase driven by idleT
        const danceLike = (n.state === 'idle' || n.state === 'calm' || n.state === 'dance');
        if (danceLike) {
          npcOpts.dancing = true;
          const phase = (n.idleT || 0) * 1.0; // 1 cycle per second
          npcOpts.dancePhase = phase - Math.floor(phase); // 0..1
        }
      }
      drawNPC(ctx, Math.round(n.x - cameraX + ox), Math.round(n.y + oy), 1, n.type, n.state, n.dir || 1, npcOpts);
      if (n.state === 'afraid' && Math.floor(t*2)%2===0 && !dialogueActive()) {
        drawSpeechBubble(ctx, 'Don\'t shoot!', n.x - cameraX + 2, n.y - 2, 1, { speaker: 'npc', maxWidth: VW - 16 });
      }
      // kid ball
      if (n._ball) {
        ctx.fillStyle = '#b23';
        ctx.fillRect(Math.round(n._ball.x - cameraX), Math.round(n._ball.y), 1, 1);
      }
    }

  // Foreground traffic drawn after characters but below UI/dialogue so it obscures sprites like a passing car
  drawTraffic(t);

    // Foreground booth door overlay (gray grid) that opens to reveal the boss
    (function drawBoothDoorOverlay() {
      const bx = telephoneBooth.x - cameraX;
      const by = telephoneBooth.y;
      const bw = telephoneBooth.w;
      const bh = telephoneBooth.h;
      if (bx + bw < -2 || bx > VW + 2) return;
      const gx = Math.round(bx + 3);
      const gy = Math.round(by + 8);
      const gw = bw - 6;
      const gh = bh - 12;
      const open = Math.max(0, Math.min(1, telephoneBooth.doorOpen || 0));
      // Draw sliding panels that start fully covering the glass with a gray grid pattern
      if (open < 1) {
        // Panel width shrinks from each side
        const half = Math.floor(gw / 2);
        const panelW = Math.max(0, Math.floor(half * (1 - open)));
        if (panelW > 0) {
          // Left panel
          ctx.fillStyle = '#3a3f48';
          ctx.fillRect(gx, gy, panelW, gh);
          // Right panel
          ctx.fillRect(gx + gw - panelW, gy, panelW, gh);
          // Grid lines on panels (vertical + horizontal)
          ctx.fillStyle = '#6a717f';
          // Left panel grid
          for (let x = gx; x < gx + panelW; x += 3) ctx.fillRect(x, gy, 1, gh);
          for (let y = gy; y < gy + gh; y += 4) ctx.fillRect(gx, y, panelW, 1);
          // Right panel grid
          for (let x = gx + gw - panelW; x <= gx + gw - 1; x += 3) ctx.fillRect(x, gy, 1, gh);
          for (let y = gy; y < gy + gh; y += 4) ctx.fillRect(gx + gw - panelW, y, panelW, 1);
        }
      }
    })();

    // POIs render (subtle glint)
    ctx.fillStyle = '#3a3d46';
    for (const p of pois) {
      if (p.taken) continue;
      const px = p.x - cameraX;
      if (px+ p.w < 0 || px > VW) continue;
      ctx.fillRect(px, p.y, p.w, p.h);
      if (Math.floor(t*2)%2===0) {
        ctx.fillStyle = '#cbd1ff';
        ctx.fillRect(px+1, p.y-1, 1, 1);
        ctx.fillStyle = '#3a3d46';
      }
    }

    // Item proximity tooltip near the item location when player is close
    if (!dialogueActive()) {
      let nearestPoi = null, bestD = 1e9;
      for (const p of pois) {
        if (p.taken) continue;
        const dx = Math.abs((player.x+8) - (p.x + p.w/2));
        const dy = Math.abs((player.y+8) - (p.y));
        const d = dx + dy;
        if (dx < 16 && dy < 14 && d < bestD) { bestD = d; nearestPoi = p; }
      }
      if (nearestPoi) {
        // Show a subtle prompt above the item (small font)
        drawSpeechBubble(ctx, 'E Pick up', nearestPoi.x - cameraX, nearestPoi.y - 8, 1, { speaker: 'system', maxWidth: 60, fontPx: 5 });
      }
    }

  // Interaction hint near player
    let hint = null;
    // nearest NPC within talk range
    for (const n of npcs) {
      const dx = Math.abs((player.x+8)-(n.x+8));
      if (dx < 16 && Math.abs(player.y - n.y) < 6 && n.state !== 'down' && n.state !== 'dying') {
        hint = n.state === 'afraid' ? 'E Calm' : 'E Talk';
        break;
      }
    }
    if (hint) {
      if (hint === 'E Talk') hint = 'E Interrogate';
      // If aiming and near a panicked NPC, show intimidate
      if (player.aiming) {
        for (const n of npcs) {
          const dx = Math.abs((player.x+8)-(n.x+8));
          if (dx < 16 && Math.abs(player.y - n.y) < 6 && (n.state === 'afraid' || n.state === 'flee') && !n.clueGiven) {
            hint = 'E Intimidate';
            break;
          }
        }
      }
      for (const p of pois) {
        if (p.taken) continue;
        const dx = Math.abs((player.x+8)-(p.x+p.w/2));
        const dy = Math.abs((player.y+8)-p.y);
        if (dx < 12 && dy < 12) { hint = 'E Investigate'; break; }
      }
    }
    if (hint && !dialogueActive()) {
      drawSpeechBubble(ctx, hint, player.x - cameraX + 2, player.y - 4, 1, { speaker: 'system', maxWidth: VW - 16 });
    }

      // Floating pickup titles (green, smaller, no background) with slight upward animation
      for (const f of floatTexts) {
        const alpha = Math.max(0, Math.min(1, f.life / 1.2));
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.6 * alpha;
        drawSpeechBubble(ctx, f.text, f.x - cameraX, f.y, 1, { speaker: 'pickup', maxWidth: 40, fontPx: f.fontPx || 5, color: f.color || '#00cc66', noBackground: true });
        ctx.restore();
      }

    // Dialogue bubble (single active) + position in world
    if (dialogue.current) {
      const s = dialogue.current;
      drawSpeechBubble(ctx, s.text, s.x - cameraX, s.y, 1, { speaker: s.speaker || 'system', maxWidth: VW - 16 });
    }

    // Arena lock visuals
    if (bossFightActive && bossArena) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#2b2e35';
      // Left barrier
      const lx = bossArena.left - cameraX - 2;
      ctx.fillRect(lx, GROUND_Y - 16, 2, 16);
      // Right barrier
      const rx = bossArena.right - cameraX;
      ctx.fillRect(rx, GROUND_Y - 16, 2, 16);
      ctx.globalAlpha = 1;
    }

  // UI
  // Energy bar (3 segments) — moved to top-left
    const drawEnergy = () => {
      const bx = 4, by = 4;
      for (let i = 0; i < player.maxHp; i++) {
        // outline
        ctx.strokeStyle = '#444';
        ctx.strokeRect(bx + i*10, by, 8, 4);
        // fill if active
        if (i < player.hp) {
          ctx.fillStyle = COLORS.blood;
          ctx.fillRect(bx + i*10 + 1, by + 1, 6, 2);
        }
      }
    };
    drawEnergy();

    // Item icons next to energy bar (POIs that were picked up)
    const drawItemIcon = (type, x, y) => {
      // Draw tiny 6x6-ish pixel icons
      // type: 'scratch' | 'coin' | 'cigarette' | 'default'
      const px = Math.floor(x), py = Math.floor(y);
      if (type === 'coin') {
        // gold coin
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(px+1, py+1, 4, 4);
        ctx.fillStyle = '#f2d15f';
        ctx.fillRect(px+2, py+2, 2, 2);
        ctx.fillStyle = '#8c6e1a';
        ctx.fillRect(px, py+2, 1, 2);
        ctx.fillRect(px+5, py+2, 1, 2);
      } else if (type === 'cigarette') {
        // small white stick with ember and tiny smoke puff
        ctx.fillStyle = '#eaeaea';
        ctx.fillRect(px, py+2, 5, 2);
        ctx.fillStyle = '#ff7b2f';
        ctx.fillRect(px+5, py+2, 1, 2);
        // smoke
        ctx.fillStyle = COLORS.smoke;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(px+2, py, 1, 1);
        ctx.globalAlpha = 1;
      } else if (type === 'scratch') {
        // three slashes
        ctx.fillStyle = '#b5b5b5';
        ctx.fillRect(px+0, py+1, 1, 4);
        ctx.fillRect(px+2, py+0, 1, 5);
        ctx.fillRect(px+4, py+1, 1, 4);
      } else {
        // fallback small box
        ctx.fillStyle = '#6aa0ff';
        ctx.fillRect(px+1, py+1, 4, 4);
      }
    };
    // Determine starting x just after the energy bar
    const meterW = 10 * player.maxHp - 2; // last rect end (8 + (n-1)*10) == 10n-2
    const iconsX0 = 4 + meterW + 6; // margin after meter
    const iconsY = 3; // sit slightly within the 0..12 band (above narrative banner)
    let ix = iconsX0;
    for (const p of pois) {
      if (!p.taken) continue;
      const title = (p.title || '').toLowerCase();
      let t = 'default';
      if (title.includes('coin')) t = 'coin';
      else if (title.includes('cigarette')) t = 'cigarette';
      else if (title.includes('scratch')) t = 'scratch';
      drawItemIcon(t, ix, iconsY);
      ix += 8; // spacing between icons
      if (ix > VW - 8) break; // avoid overflow
    }

    // Boss HP bar (only during active fight)
    if (bossFightActive && boss && boss.alive) {
      const w = 60, h = 4;
      const bx = Math.floor(VW/2 - w/2), by = 4;
      ctx.strokeStyle = '#444';
      ctx.strokeRect(bx, by, w, h);
      const pct = boss.hp / boss.maxHp;
      ctx.fillStyle = '#a82828';
      ctx.fillRect(bx + 1, by + 1, Math.max(0, Math.floor((w-2) * pct)), h - 2);
    }

    // HiDPI text helpers: render at INTERNAL_SCALE, then downscale via transform
    const drawOutlinedText = (text, x, y, color = '#cfe', outline = '#000') => {
      const hd = INTERNAL_SCALE;
      const oldFont = ctx.font;
      const m = /([0-9]+)px/.exec(oldFont);
      if (m) {
        const px = parseInt(m[1], 10);
        ctx.font = oldFont.replace(m[1] + 'px', (px * hd) + 'px');
      }
      ctx.save();
      ctx.scale(1/hd, 1/hd);
      const tx = Math.floor(x * hd);
      const ty = Math.floor(y * hd);
      const o = hd; // 1 original pixel
      ctx.fillStyle = outline;
      ctx.fillText(text, tx + o, ty);
      ctx.fillText(text, tx - o, ty);
      ctx.fillText(text, tx, ty + o);
      ctx.fillText(text, tx, ty - o);
      ctx.fillStyle = color;
      ctx.fillText(text, tx, ty);
      ctx.restore();
      ctx.font = oldFont;
    };
    const drawTextHD = (text, x, y) => {
      const hd = INTERNAL_SCALE;
      const oldFont = ctx.font;
      const m = /([0-9]+)px/.exec(oldFont);
      if (m) {
        const px = parseInt(m[1], 10);
        ctx.font = oldFont.replace(m[1] + 'px', (px * hd) + 'px');
      }
      ctx.save();
      ctx.scale(1/hd, 1/hd);
      const tx = Math.floor(x * hd);
      const ty = Math.floor(y * hd);
      ctx.fillText(text, tx, ty);
      ctx.restore();
      ctx.font = oldFont;
    };

    // Helper to fit a text to a max width by adjusting pixel size
    const fitFontPx = (basePx, text, maxWidth, minPx = 4, maxPx = 16) => {
      ctx.font = `${basePx}px monospace`;
      const w = ctx.measureText(text).width;
      if (w <= maxWidth) return basePx;
      const scaled = Math.max(minPx, Math.min(maxPx, Math.floor(basePx * (maxWidth / w))));
      return scaled;
    };

    // (Help text removed per request)

    // Narrative banner between top and world
    const bannerY = 12;
    const bannerH = 10;
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, bannerY, VW, bannerH+2);
    ctx.globalAlpha = 1;
  // Narrative banner (auto-fit)
  const narrText = getTypedNarrative();
  const narrPx = fitFontPx(5, narrText, VW - 8, 4, 10);
  ctx.font = `${narrPx}px monospace`;
  drawOutlinedText(narrText, 4, bannerY + 2, '#d9e0ff');

    // Death overlay
    if (!player.alive) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();
      ctx.fillStyle = '#e0b3b3';
      ctx.font = '8px monospace';
      const msg = 'You died';
      drawTextHD(msg, Math.floor(VW/2 - ctx.measureText(msg).width/2), Math.floor(VH/2 - 6));
      ctx.font = '6px monospace';
      const sub = 'Press R to restart';
      drawTextHD(sub, Math.floor(VW/2 - ctx.measureText(sub).width/2), Math.floor(VH/2 + 6));
    }
    // Victory screen overlay
    if (victory) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();
      const crown = 'VICTORY';
      ctx.fillStyle = '#bfe3bf';
      ctx.font = '10px monospace';
      drawTextHD(crown, Math.floor(VW/2 - ctx.measureText(crown).width/2), Math.floor(VH/2 - 10));
      ctx.font = '6px monospace';
      const sub2 = 'Boss defeated. Press R to play again';
      drawTextHD(sub2, Math.floor(VW/2 - ctx.measureText(sub2).width/2), Math.floor(VH/2 + 6));
    }
    // Journal panel
    if (journalOpen) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(8, 24, VW-16, 60);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(8, 24, VW-16, 60);
      ctx.fillStyle = '#cbd1ff';
  ctx.font = '7px monospace';
      drawTextHD('Case Notes', 12, 30);
  ctx.font = '6px monospace';
      if (caseNotes.length === 0) {
        drawTextHD('No notes yet. Talk to people, investigate items.', 12, 42);
      } else {
        let y = 42;
        for (const note of caseNotes.slice(-6)) {
          drawTextHD('- ' + note, 12, y);
          y += 9;
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }

  requestAnimationFrame(loop);
  // Debug/testing helpers (non-intrusive): allows automated checks in the browser
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
        if (!boss) spawnBoss();
      },
      getBoss: () => boss ? ({ x: boss.x, y: boss.y, alive: boss.alive, dir: boss.dir, state: boss.state, hidden: !!boss.hidden, invincible: !!boss.invincible }) : null,
      getBooth: () => ({ doorOpen: telephoneBooth.doorOpen })
    };
  }
})();
