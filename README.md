# Dirty Harry - Pixel Art Game

A tiny HTML5 canvas game made of pure JS and custom-drawn pixel art (no external assets). Theme inspired by the 1971 film. Keyboard-only controls.

## Controls

- Move: Arrow Keys or WASD
- Jump: Up Arrow or W
- Duck: Down Arrow or S
- Aim: Hold Shift
- Shoot: Space
- Interrogate/Talk/Calm: E
- Journal: J
- Pause: P
- Restart: R

## Goal

Enjoy the gritty LA scene. Goons stand around smoking; get close and they'll make snide remarks. If you aim that .44 at them, they get spooked and back away. Fire a shot and nearby goons will try to retaliate. Headshots are lethal and cinematic; arm shots make them clutch the wound, scream for help, and run to cover.

Now with a multi-screen world, midnight sky with clouds and twinkling stars, and skyline windows that light up—occasionally revealing a silhouette. You can meet bystanders (a mother with a stroller, an old man, and a kid). Interrogate with E: Harry speaks first, then they answer. If they snap back with “Get lost, copper,” aim your gun (hold Shift) while close and they’ll change their tune and give the clue. Only the closest character speaks at a time so dialogue never overlaps. Use J to view recent case notes.

## Visual Upgrade 2.0

- True 32×32 detail pass for sprites via HD offscreen canvases while preserving 16×16 on-screen size.
- Physical-based garments: coats and hems now sway from a global wind and react to foot plants.
- Player homage look: short grey hair (subtle highlight) to evoke a grizzled detective vibe.
- Traffic layers:
  - Background: tiny cars on a far road with faint headlights/taillights and slow parallax.
  - Foreground: larger cars speeding by near the bottom, partially rendered out of the window to sell depth.

Collect the clues from people and points of interest to unlock a proper boss fight at the far right. The boss is an intimidating goon with a mean coat who taunts Harry and throws slow projectiles along two lanes:

- High lane: Duck to avoid
- Low lane: Jump to clear

Harry quips back when the boss fires or gets hit. There’s a boss HP bar at the top. The arena locks during the fight; defeat the boss to win and close the case.

Harry now has an energy bar (3 segments). Getting shot reduces one segment; when it hits zero, Harry dies and a simple game-over overlay appears. Press R to restart.

## New animation polish

- Snappier walking with subtle vertical bob and punchier arm swing.
- Unbuttoned grey suit jacket with visible white shirt underneath; the coat now renders as parted flaps that reveal a central shirt column.
- Jacket has a lightweight springy sway and flaps slightly on foot plants, plus a subtle ambient wind so it always swirls a bit even when idle.
- Idle breathing is deeper and more cinematic (WoW-style inhale/exhale) when Harry stands truly idle, slightly widening the coat opening.

### HD player sprite (2x internal)

- Harry now renders via a 2x offscreen canvas (32×32) and is composited back to 16×16. This enables finer jacket details without changing his on-screen size.
- Added HD-only details:
  - Shirt placket line down the center
  - Lapel highlights just outside the shadow lines
  - Split hem tips to accent flutter
- The HD blending is applied only during the player blit, keeping the rest of the game crisp.

You can tune these in code:

- In `src/game.js`:
  - `player.anim` rate when moving (look for `player.anim += (moving ? 1.6 : 0.5) * dt;`).
  - Jacket spring: `k` and `c`, and the plant impulse magnitude (`player.jacketSwayV += (-stepSign) * 26`). Add/remove ambient wind by editing `const wind = Math.sin(t * 0.35) * 0.6;`.
  - Breath timing: `BREATH_PERIOD` and how fast `breathAmp` approaches its target.
- In `src/sprites.js`:
  - Walk bob amount (`walkBob`), arm swing amplitude, and chest expansion (`breathPixels`).
  - Coat opening visuals: see the "Unbuttoned coat" section in `drawPlayer` around `leftInnerX/rightInnerX`, lapel shadows, and the split lower hem panels.
  - HD overlays: see `drawPlayer` (wrapper) and `drawPlayer16` (base). Tweak lapel highlight color via `COLORS.coatLight` and shirt placket color (`#d8d8d8`).

## Run locally

Opening `index.html` directly may work in some browsers, but due to ES module import paths, running a local static server is recommended.

### Option A: Python (built-in on many systems)

```bash
# From the project folder
python -m http.server 8080
# Then open http://localhost:8080 in your browser
```

### Option B: Node http-server

```bash
npm -g install http-server
http-server -p 8080
# Then open http://localhost:8080
```

### Troubleshooting

- If the skyline buildings look yellow, hard refresh so your browser reloads the JS (Ctrl+F5 on Windows). A previous bug let the window light color leak into the building fill; this is fixed. Buildings should be deep blue-gray with very dim windows.
- If controls don't respond, click once on the canvas to focus it.

## Notes

- Resolution is a fixed logical 320x180. CSS scales it up with crisp pixel rendering.
- The player sprite is 16x16 and visually ~15% of screen height once scaled.
- All art is procedural rectangles for a stylized pixel look. You can tweak colors in `src/sprites.js`.
