/**
 * Global constants shared across systems.
 * Keep this minimal and game-agnostic; per-feature configs should live in their modules.
 */

export const VW = 192;       // virtual width
export const VH = 108;       // virtual height
export const WORLD_W = VW * 5;
export const PX = 16;
export const GROUND_Y = VH - 22;

export const INTERNAL_SCALE = 3; // for HiDPI text

export const COLORS = {
  blood: '#8b1a1a',
  smoke: 'rgba(200,200,220,0.6)',
  smokeDark: 'rgba(80,80,100,0.7)',
  gunMetal: '#a0a6af',
  gunDark: '#6c727a',
  uiText: '#cbd1ff',
  uiTextDim: '#9ea6c9',
  uiOutline: '#333',
  ground: '#212228',
  cover: '#2b2e35',
};

export const GRAVITY = 320; // px/s^2 for jump