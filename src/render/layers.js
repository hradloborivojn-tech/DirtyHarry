import { cameraX, player, bullets, particles, goons, npcs } from '../core/state.js';
import { renderMolotovs } from '../weapons/molotov.js';
import { renderFireSystem } from '../systems/fire_integration.js';
import { renderMolotovPreview } from '../player/molotov_controller.js';
import { renderBurnOverlay } from '../status/burning.js';

export function renderWeaponsAndFire(ctx){
  renderMolotovs(ctx, cameraX);
  renderFireSystem(ctx, cameraX);
  renderMolotovPreview(ctx, cameraX);
}

export function renderBullets(ctx){
  ctx.fillStyle = '#8f8f92';
  for (const b of bullets) ctx.fillRect((b.x - cameraX)|0, b.y|0, b.w, b.h);
}

export function renderBurningOverlays(ctx){
  for (const g of goons) renderBurnOverlay(ctx, g, cameraX);
  for (const n of npcs) renderBurnOverlay(ctx, n, cameraX);
}