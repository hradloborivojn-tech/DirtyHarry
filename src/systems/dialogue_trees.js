/**
 * Minimal dialogue tree helpers (extensible). For now, provides canned responses per NPC type.
 * You can expand this to a full stateful tree if desired.
 */
export function getOpeningLine() {
  const openers = [
    'Harry: Got a minute?',
    'Harry: I have a few questions.',
    'Harry: Talk to me.',
  ];
  return openers[(Math.random() * openers.length) | 0];
}

export function getNpcReply(npc, cooperative) {
  if (npc.type === 'hotgirl') {
    return [
      { text: 'What do you need, sugar?', speaker: 'npc', tag: 'hotgirl-1' },
      { text: "Harry: Haven't you seen somebody dangerous?", speaker: 'harry', tag: 'hotgirl-2' },
      { text: 'Only you, sugar.', speaker: 'npc', tag: 'hotgirl-3' },
      { text: 'He lingers by the phone booth.', speaker: 'npc', tag: 'clue', clue: true },
    ];
  }
  if (cooperative && !npc.clueGiven) {
    const text = npc.type === 'mother'
      ? 'He wore a tan coat and smelled of smoke.'
      : npc.type === 'oldman'
      ? 'Alley ahead looked shady. Watch your back.'
      : 'He dropped a coin by the phone booth.';
    return [{ text, speaker: 'npc', tag: 'clue', clue: true }];
  }
  if (!npc.clueGiven) {
    return [{ text: 'Get lost, copper', speaker: 'npc', tag: 'rude' }];
  }
  return [{ text: "That's all I know.", speaker: 'npc', tag: 'neutral' }];
}