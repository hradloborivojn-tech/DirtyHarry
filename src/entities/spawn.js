/**
 * Entity factories and static world items (covers, POIs, telephone booth).
 */
import { WORLD_W, GROUND_Y } from '../core/constants.js';

export function makeGoon(x, y) {
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

export function spawnInitialGoons(rng) {
  const list = [
    makeGoon(110, GROUND_Y - 16),
    makeGoon(150, GROUND_Y - 16),
    makeGoon(170, GROUND_Y - 16),
  ];
  list.forEach((g, i) => { g.dir = i % 2 ? -1 : 1; g.state = 'smoke_hold'; g.phase = rng(); });
  return list;
}

export function spawnNPCs() {
  return [
    { type: 'mother', x: 60, y: GROUND_Y - 16, dir: 1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false },
    { type: 'oldman', x: 240, y: GROUND_Y - 16, dir: -1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false },
    { type: 'kid', x: 360, y: GROUND_Y - 16, dir: 1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false },
    { type: 'hotgirl', x: 480, y: GROUND_Y - 16, dir: -1, state: 'idle', fear: 0, talkCooldown: 0, clueGiven: false, bulletImmune: false },
  ];
}

export function makeCovers() {
  return [
    {x: 120, y: GROUND_Y - 8, w: 14, h: 8},
    {x: 260, y: GROUND_Y - 8, w: 14, h: 8},
    {x: 420, y: GROUND_Y - 8, w: 14, h: 8},
    {x: 640, y: GROUND_Y - 8, w: 14, h: 8},
  ];
}

export function makeTelephoneBooth() {
  return {
    x: WORLD_W - 52,
    y: GROUND_Y - 28,
    w: 14,
    h: 28,
    doorOpen: 0,
  };
}

export function makePOIs() {
  return [
    { x: 200, y: GROUND_Y - 6, w: 6, h: 4, title: 'Scratch marks', note: 'Strange scratch marks near cover.', taken: false },
    { x: 320, y: GROUND_Y - 6, w: 6, h: 4, title: 'Initialed coin', note: 'A coin on the ground with initials.', taken: false },
    { x: 520, y: GROUND_Y - 6, w: 6, h: 4, title: 'Fresh cigarette', note: 'Fresh cigarette butt—someone waited here.', taken: false },
  ];
}