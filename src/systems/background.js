/**
 * Background generation and drawing: sky, skyline buildings with dim windows, ground, covers, telephone booth.
 * Also manages background tiny traffic queue (road specks behind characters).
 */
import { VW, VH, GROUND_Y, WORLD_W, COLORS } from '../core/constants.js';

export class Background {
  constructor(rng, covers, telephoneBooth) {
    this.rng = rng;
    this.covers = covers;
    this.telephoneBooth = telephoneBooth;
    this.buildings = [];
    this.stars = Array.from({ length: 70 }, () => ({
      x: Math.floor(rng()*WORLD_W),
      y: Math.floor(rng()*(GROUND_Y-40)),
      tw: rng()*Math.PI*2
    }));
    // background tiny traffic queue
    this.bgTraffic = [];
    this.bgQueueInit = false;
    this.jamActive = false;
    this.jamTimer = 0;
    this.jamCooldown = 0;
    this.BG_QUEUE_DIR = 1;
    this.BG_MIN_GAP = 6;
    this.BG_BASE_SPD_MIN = 8;
    this.BG_BASE_SPD_MAX = 16;

    this._buildSkyline();
  }

  _buildSkyline() {
    const rng = this.rng;
    let x = 0;
    while (x < WORLD_W) {
      const w = 14 + Math.floor(rng()*10);
      const h = 28 + Math.floor(rng()*36);
      const bx = x + Math.floor(rng()*6);
      const b = { x: bx, w, h, windows: [], lightTimer: 2 + rng()*6 };
      const win = [];
      for (let wy = GROUND_Y - h + 10; wy < GROUND_Y - 10; wy += 8) {
        for (let wx = bx + 2; wx < bx + w - 2; wx += 8) {
          const lit = rng() < 0.04;
          win.push({ x: wx, y: wy, lit, silTimer: 0 });
        }
      }
      b.windows = win;
      this.buildings.push(b);
      x += w + 6 + Math.floor(rng()*10);
    }
  }

  _spawnBgTrafficCar(x) {
    const rng = this.rng;
    const w = 4 + Math.floor(rng()*5);
    const h = 2;
    const y = GROUND_Y - h;
    const color = rng() < 0.4 ? '#0b0f17' : (rng()<0.5 ? '#0a0d14' : '#0e131b');
    const dir = this.BG_QUEUE_DIR;
    const baseSpeed = this.BG_BASE_SPD_MIN + rng() * (this.BG_BASE_SPD_MAX - this.BG_BASE_SPD_MIN);
    const gap = this.BG_MIN_GAP + Math.floor(rng()*6);
    const react = 0.2 + rng()*0.8;
    return { x, y, w, h, dir, speed: 0, targetSpeed: baseSpeed, baseSpeed, color, t: 0, gap, react, reactT: react, jitter: (rng()-0.5)*0.3 };
  }

  update(dt, cameraX) {
    // skyline window twinkle
    for (const b of this.buildings) {
      b.lightTimer -= dt;
      if (b.lightTimer <= 0) {
        b.lightTimer = 2 + this.rng()*6;
        const w = b.windows[(Math.random()*b.windows.length)|0];
        if (w) {
          const turningOn = this.rng() < 0.6;
          w.lit = turningOn ? true : (this.rng() < 0.4 ? false : w.lit);
          if (turningOn && this.rng() < 0.3) w.silTimer = 1 + this.rng()*2;
        }
      }
      for (const w of b.windows) {
        if (w.silTimer > 0) w.silTimer -= dt;
      }
    }

    // init bg traffic queue
    if (!this.bgQueueInit) {
      let x = -60;
      for (let i = 0; i < 20; i++) {
        const car = this._spawnBgTrafficCar(x);
        this.bgTraffic.push(car);
        x -= (car.w + car.gap);
      }
      this.bgQueueInit = true;
      this.jamTimer = 2.5 + this.rng()*4.0;
      this.jamActive = false;
      this.jamCooldown = 6.0;
    }

    // jam scheduler
    this.jamTimer -= dt;
    if (this.jamTimer <= 0) {
      const pToggle = this.jamCooldown > 0 ? 0.25 : 0.6;
      if (this.rng() < pToggle) this.jamActive = !this.jamActive;
      this.jamTimer = this.jamActive ? (0.8 + this.rng()*2.0) : (3.0 + this.rng()*6.0);
      if (!this.jamActive) this.jamCooldown = 6.0;
    }
    if (this.jamCooldown > 0) this.jamCooldown -= dt;

    // move queue
    if (this.bgTraffic.length > 0) {
      this.bgTraffic.sort((a,b)=>a.x-b.x);
      const front = this.bgTraffic[this.bgTraffic.length-1];
      const frontTarget = this.jamActive ? 0 : (front.baseSpeed * (0.8 + this.rng()*0.3));
      front.targetSpeed = frontTarget;
      front.speed += (front.targetSpeed - front.speed) * Math.min(1, dt * 2.5);
      front.x += front.speed * front.dir * dt;
      front.t += dt;

      for (let i = this.bgTraffic.length - 2; i >= 0; i--) {
        const c = this.bgTraffic[i];
        const ahead = this.bgTraffic[i+1];
        const desiredX = ahead.x - ahead.w - c.gap;
        const gap = desiredX - c.x;
        const spacingTerm = Math.max(0, gap) * 0.9;
        const desiredSpeed = Math.min(c.baseSpeed, spacingTerm);
        const influence = Math.max(0, Math.min(1, (ahead.x - c.x) / 40));
        const jamSlow = this.jamActive ? (1 - influence * 0.9) : 1;
        const finalTarget = desiredSpeed * jamSlow + c.jitter;
        c.reactT -= dt;
        if (c.reactT <= 0) {
          c.targetSpeed = Math.max(0, finalTarget);
          c.reactT = c.react;
        }
        c.speed += (c.targetSpeed - c.speed) * Math.min(1, dt * 2.0);
        c.x += c.speed * c.dir * dt;
        if (c.x > desiredX) {
          c.x = desiredX;
          c.speed = Math.min(c.speed, ahead.speed);
        }
        c.t += dt;
      }

      // cleanup/spawn tail
      for (let i = this.bgTraffic.length - 1; i >= 0; i--) {
        const c = this.bgTraffic[i];
        if (c.x - cameraX > WORLD_W + 60) this.bgTraffic.splice(i,1);
      }
      if (this.bgTraffic.length > 0) {
        const tail = this.bgTraffic[0];
        if (tail.x > -20) {
          const car = this._spawnBgTrafficCar(tail.x - (tail.w + tail.gap));
          this.bgTraffic.unshift(car);
        }
      }
    }
  }

  draw(ctx, cameraX) {
    // sky gradient
    const g = ctx.createLinearGradient(0,0,0,VH);
    g.addColorStop(0, '#0a0b13');
    g.addColorStop(1, '#05060a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    // stars
    ctx.fillStyle = '#cbd1ff';
    for (const s of this.stars) {
      const sx = s.x - cameraX * 0.2;
      if (sx < -2 || sx > VW + 2) continue;
      const sy = s.y + Math.sin(performance.now() * 0.0005 + s.tw) * 0.5;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }

    // skyline
    for (const b of this.buildings) {
      const bx = b.x - cameraX*0.8;
      if (bx + b.w < -10 || bx > VW + 10) continue;
      ctx.fillStyle = '#0f1722';
      ctx.fillRect(bx, GROUND_Y - b.h, b.w, b.h);
      const grad = ctx.createLinearGradient(0, GROUND_Y - b.h, 0, GROUND_Y);
      grad.addColorStop(0, 'rgba(0,0,0,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, GROUND_Y - b.h, b.w, b.h);
      for (const w of b.windows) {
        const wx = w.x - cameraX*0.8;
        if (wx < -2 || wx > VW + 2) continue;
        if (w.lit) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#2d2b19';
          ctx.fillRect(wx, w.y, 1, 1);
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#4d4930';
          ctx.fillRect(wx, w.y, 1, 1);
          ctx.restore();
          if (w.silTimer > 0) {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(wx, w.y-1, 2, 2);
          }
        }
      }
    }

    // bg tiny traffic (in front of skyline, behind ground)
    for (const c of this.bgTraffic) {
      const x = c.x - cameraX * 0.6;
      if (x + c.w < -10 || x > VW + 10) continue;
      ctx.fillStyle = c.color;
      ctx.fillRect(Math.round(x), c.y, c.w, c.h);
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

    // ground
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, GROUND_Y, VW, VH-GROUND_Y);

    // covers
    ctx.fillStyle = COLORS.cover;
    for (const c of this.covers) {
      const cx = c.x - cameraX;
      if (cx + c.w < 0 || cx > VW) continue;
      ctx.fillRect(cx, c.y, c.w, c.h);
    }

    // telephone booth (behind characters)
    const tb = this.telephoneBooth;
    const bx = tb.x - cameraX;
    const by = tb.y, bw = tb.w, bh = tb.h;
    if (bx + bw >= -2 && bx <= VW + 2) {
      const RED = '#b01217';
      const RED_D = '#7d0e12';
      const RED_L = '#e03535';
      const GLASS = '#121724';
      const FRAME = '#2a2a2a';
      ctx.fillStyle = RED; ctx.fillRect(Math.round(bx), Math.round(by), bw, bh);
      ctx.fillStyle = RED_D; ctx.fillRect(Math.round(bx + bw - 2), Math.round(by + 1), 2, bh - 2);
      const gx = Math.round(bx + 3), gy = Math.round(by + 8), gw = bw - 6, gh = bh - 12;
      ctx.fillStyle = GLASS; ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = FRAME;
      ctx.fillRect(gx + Math.floor(gw/2), gy, 1, gh);
      ctx.fillRect(gx, gy + Math.floor(gh/3), gw, 1);
      ctx.fillRect(gx, gy + Math.floor(2*gh/3), gw, 1);
      ctx.fillStyle = RED_L; ctx.fillRect(Math.round(bx + 1), Math.round(by + 1), bw - 2, 4);
      ctx.fillStyle = '#eaeaea';
      ctx.fillRect(Math.round(bx + 3), Math.round(by + 2), 2, 1);
      ctx.fillRect(Math.round(bx + 6), Math.round(by + 2), 2, 1);
      ctx.fillRect(Math.round(bx + 9), Math.round(by + 2), 2, 1);
      ctx.fillStyle = FRAME; ctx.fillRect(Math.round(bx + 2), Math.round(by + 7), 1, bh - 10);
      ctx.fillStyle = '#cfcfcf'; ctx.fillRect(Math.round(bx + bw - 4), Math.round(by + Math.max(12, Math.floor(bh*0.55))), 1, 2);
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#0a0a0a'; ctx.fillRect(Math.round(bx + 1), GROUND_Y - 1, bw - 2, 1); ctx.globalAlpha = 1;
    }

    // street grime hints
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
}