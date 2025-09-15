/**
 * Small helper for proximity interaction hints (speech bubble style).
 */
import { drawSpeechBubble } from '../sprites.js';

export function drawInteractionHints(ctx, player, npcs, pois, cameraX, dialogueActive) {
  if (dialogueActive) return;
  // nearest NPC within talk range
  let hint = null;
  for (const n of npcs) {
    const dx = Math.abs((player.x+8)-(n.x+8));
    if (dx < 16 && Math.abs(player.y - n.y) < 6 && n.state !== 'down' && n.state !== 'dying') {
      hint = n.state === 'afraid' ? 'E Calm' : 'E Talk';
      break;
    }
  }
  if (hint) {
    if (hint === 'E Talk') hint = 'E Interrogate';
    if (player.aiming) {
      for (const n of npcs) {
        const dx = Math.abs((player.x+8)-(n.x+8));
        if (dx < 16 && Math.abs(player.y - n.y) < 6 && (n.state === 'afraid' || n.state === 'flee') && !n.clueGiven) {
          hint = 'E Intimidate'; break;
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
  if (hint) drawSpeechBubble(ctx, hint, player.x - cameraX + 2, player.y - 4, 1, { speaker: 'system', maxWidth: 192 - 16 });
}