// Conversation flows and clue logic extracted from monolith and expanded
import { npcs, pois } from '../core/state.js';
import { say, dialogueActive } from './dialogue.js';
import { addNote } from './journal.js';

export function cluesComplete() {
  const allPoi = pois.every(p => p.taken);
  const allNpc = npcs.every(n => n.clueGiven || n.state === 'down');
  return allPoi && allNpc;
}

export function missingCluesSummary() {
  const missing = [];
  const remPoi = pois.filter(p => !p.taken).length;
  const remNpc = npcs.filter(n => !n.clueGiven && n.state !== 'down').map(n => n.type);
  if (remPoi > 0) missing.push(`${remPoi} clue${remPoi>1?'s':''} on the ground`);
  if (remNpc.length > 0) missing.push('talk to ' + remNpc.join(', '));
  return missing.length ? missing.join('; ') : 'none';
}

export function startInterrogation(npc, player) {
  const harryX = player.x + 2, harryY = player.y - 2;
  const npcX = npc.x + 2, npcY = npc.y - 2;

  if (npc.type === 'hotgirl') {
    say('What do you need, sugar?', npcX, npcY, 1.6, { speaker:'npc', entity:npc, tag:'hotgirl-1' });
    say("Harry: Haven't you seen somebody dangerous?", harryX, harryY, 1.8, { speaker:'harry', tag:'hotgirl-2' });
    say('Only you, sugar.', npcX, npcY, 1.6, { speaker:'npc', entity:npc, tag:'hotgirl-3' });
    const clue = 'He lingers by the phone booth.';
    say(clue, npcX, npcY, 1.8, { speaker:'npc', entity:npc, tag:'clue' });
    if (!npc.clueGiven) { addNote(clue); npc.clueGiven = true; }
    return;
  }

  const openers = [
    'Harry: Got a minute?',
    'Harry: I have a few questions.',
    'Harry: Talk to me.'
  ];
  const opener = openers[(Math.random()*openers.length)|0];
  say(opener, harryX, harryY, 1.6, { speaker:'harry', tag:'opener' });

  // Decide NPC initial reply
  const dx = (npc.x + 8) - (player.x + 8);
  const inSight = (player.dir === 1 && dx > 0) || (player.dir === -1 && dx < 0);
  const calmish = (npc.state === 'calm' || npc.state === 'idle');
  const cooperativeNow = calmish || (npc.state === 'afraid') || (player.aiming && Math.abs(dx) < 70 && inSight);

  let replyText, replyTag = 'neutral';
  if (!npc.clueGiven && cooperativeNow) {
    replyText = npc.type === 'mother'
      ? 'He wore a tan coat and smelled of smoke.'
      : npc.type === 'oldman'
      ? 'Alley ahead looked shady. Watch your back.'
      : 'He dropped a coin by the phone booth.';
    replyTag = 'clue';
  } else if (!npc.clueGiven) {
    replyText = 'Get lost, copper';
    replyTag = 'rude';
  } else {
    replyText = 'That\'s all I know.';
  }
  say(replyText, npcX, npcY, 1.8, { speaker:'npc', entity:npc, tag: replyTag });

  npc._pendingClueTag = (!npc.clueGiven);
  if (replyTag === 'clue' && !npc.clueGiven) {
    addNote(replyText);
    npc.clueGiven = true;
  }
}