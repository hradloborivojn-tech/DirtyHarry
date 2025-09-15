// World/static content and actors
import { GROUND_Y, WORLD_W, VH } from '../core/constants.js';
import { goons, npcs, covers, pois, stars, buildings, rng } from '../core/state.js';

export function makeGoon(x,y){
  return {
    x,y,w:16,h:16,dir:-1,state:'smoke_hold',phase:0,
    hp:3,maxHp:3,woundedArm:null,alive:true,
    coverTarget:null,screamTimer:0,
    headBox:{x:x+5,y:y+2,w:6,h:5},
    leftArmBox:{x:x+1,y:y+8,w:4,h:2},
    rightArmBox:{x:x+11,y:y+8,w:4,h:2},
    bodyBox:{x:x+3,y:y+7,w:10,h:8}
  };
}

// Build a skyline with denser, taller “skyscraper” buildings and close windows
export function buildSkyline() {
  buildings.length = 0;
  let x = 0;
  while (x < WORLD_W) {
    const w = 18 + Math.floor(rng()*16);   // a bit wider
    const h = 38 + Math.floor(rng()*44);   // taller towers
    const bx = x + Math.floor(rng()*6);
    const b = {
      x: bx, w, h,
      windows: [],
      lightTimer: 1.5 + rng()*4.0
    };
    // Windows: closer grid, slightly larger cells, better for silhouettes
    // 6x7 spacing roughly; 2x2 window blocks
    const win = [];
    const top = GROUND_Y - h + 8;
    const bottom = GROUND_Y - 10;
    for (let wy = top; wy < bottom; wy += 7) {
      for (let wx = bx + 2; wx < bx + w - 2; wx += 6) {
        // Fewer initial lights overall but dense pattern creates “city” feel
        const lit = rng() < 0.06;
        win.push({ x: wx, y: wy, lit, silTimer: 0 });
      }
    }
    b.windows = win;
    buildings.push(b);
    x += w + 6 + Math.floor(rng()*8);
  }
}

export function initWorldStatic() {
  // Stars
  for (let i=0;i<70;i++)
    stars.push({ x: Math.floor(rng()*WORLD_W), y: Math.floor(rng()*(GROUND_Y-40)), tw: rng()*Math.PI*2 });

  // Skyline
  buildSkyline();

  // POIs
  pois.push(
    { x:200, y:GROUND_Y-6, w:6,h:4, title:'Scratch marks', note:'Strange scratch marks near cover.', taken:false },
    { x:320, y:GROUND_Y-6, w:6,h:4, title:'Initialed coin', note:'A coin on the ground with initials.', taken:false },
    { x:520, y:GROUND_Y-6, w:6,h:4, title:'Fresh cigarette', note:'Fresh cigarette butt—someone waited here.', taken:false }
  );

  covers.push(
    {x:120,y:GROUND_Y-8,w:14,h:8},
    {x:260,y:GROUND_Y-8,w:14,h:8},
    {x:420,y:GROUND_Y-8,w:14,h:8},
    {x:640,y:GROUND_Y-8,w:14,h:8}
  );
}

export function initActors() {
  goons.length = 0;
  [110,150,170].forEach((x,i)=> goons.push({ ...makeGoon(x, GROUND_Y-16), dir: i%2?-1:1, phase: rng() }));
  npcs.length = 0;
  npcs.push({ type:'mother', x:60,  y:GROUND_Y-16, dir:1,  state:'idle', fear:0, talkCooldown:0, clueGiven:false, bulletImmune:false });
  npcs.push({ type:'oldman',  x:240, y:GROUND_Y-16, dir:-1, state:'idle', fear:0, talkCooldown:0, clueGiven:false, bulletImmune:false });
  npcs.push({ type:'kid',     x:360, y:GROUND_Y-16, dir:1,  state:'idle', fear:0, talkCooldown:0, clueGiven:false, bulletImmune:false });
  npcs.push({ type:'hotgirl', x:480, y:GROUND_Y-16, dir:-1, state:'idle', fear:0, talkCooldown:0, clueGiven:false, bulletImmune:false });
}