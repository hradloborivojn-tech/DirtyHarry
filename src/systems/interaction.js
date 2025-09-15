// Interaction: talk to NPCs or investigate POIs
import { player, npcs, pois, floatTexts, cameraX } from '../core/state.js';
import { startInterrogation } from './dialogue_trees.js';
import { say, dialogueActive } from './dialogue.js';
import { addNote } from './journal.js';

export function handleInteract(pressed) {
  if (!pressed.has('e')) return;

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
    if (player.aiming && (nearestNPC.state === 'afraid' || nearestNPC.state === 'flee') && !nearestNPC.clueGiven && nearestNPC.type !== 'hotgirl') {
      say('Harry: So, will ye speak?', player.x + 2, player.y - 2, 1.2, { speaker:'harry', tag:'intimidate' });
      const clue = nearestNPC.type === 'mother'
        ? 'He wore a tan coat.'
        : nearestNPC.type === 'oldman'
        ? 'The alley ahead is shady.'
        : 'He dropped a coin near the phone.';
      say(clue, nearestNPC.x + 2, nearestNPC.y - 2, 2.0, { speaker:'npc', entity:nearestNPC, tag:'clue' });
      addNote(clue);
      nearestNPC.clueGiven = true;
      nearestNPC.state = 'calm';
      nearestNPC.fear = Math.max(0, (nearestNPC.fear||0) - 0.6);
      nearestNPC.panicTimer = 0;
    } else if (nearestNPC.state === 'afraid' || nearestNPC.state === 'flee') {
      say('...okay, okay.', nearestNPC.x + 2, nearestNPC.y - 2, 1.2, { speaker:'npc', entity: nearestNPC, tag:'calmed' });
      nearestNPC.state = 'calm';
      nearestNPC.fear = Math.max(0, (nearestNPC.fear||0) - 0.6);
      nearestNPC.panicTimer = 0;
    } else {
      startInterrogation(nearestNPC, player);
    }
    return;
  }

  // Investigate POIs when close
  for (const p of pois) {
    if (p.taken) continue;
    const near = Math.abs((player.x+8) - (p.x + p.w/2)) < 12 && Math.abs((player.y+8) - (p.y)) < 12;
    if (near) {
      p.taken = true;
      addNote(p.note);
      // Floating pickup title (small)
      const title = (p.title || 'Picked up').replace(/\s+/g, ' ').trim();
      floatTexts.push({ text: title, x: p.x, y: p.y - 6, vx: 0, vy: -8, life: 1.2, color: '#00cc66', fontPx: 5 });
      break;
    }
  }
}