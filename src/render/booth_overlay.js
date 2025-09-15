/**
 * Foreground booth door overlay (gray grid) that opens to reveal the boss.
 */
export function drawBoothDoorOverlay(ctx, telephoneBooth, cameraX, VW, GROUND_Y) {
  const bx = telephoneBooth.x - cameraX;
  const by = telephoneBooth.y;
  const bw = telephoneBooth.w;
  const bh = telephoneBooth.h;
  if (bx + bw < -2 || bx > VW + 2) return;
  const gx = Math.round(bx + 3);
  const gy = Math.round(by + 8);
  const gw = bw - 6;
  const gh = bh - 12;
  const open = Math.max(0, Math.min(1, telephoneBooth.doorOpen || 0));
  if (open < 1) {
    const half = Math.floor(gw / 2);
    const panelW = Math.max(0, Math.floor(half * (1 - open)));
    if (panelW > 0) {
      ctx.fillStyle = '#3a3f48';
      ctx.fillRect(gx, gy, panelW, gh);
      ctx.fillRect(gx + gw - panelW, gy, panelW, gh);
      ctx.fillStyle = '#6a717f';
      for (let x = gx; x < gx + panelW; x += 3) ctx.fillRect(x, gy, 1, gh);
      for (let y = gy; y < gy + gh; y += 4) ctx.fillRect(gx, y, panelW, 1);
      for (let x = gx + gw - panelW; x <= gx + gw - 1; x += 3) ctx.fillRect(x, gy, 1, gh);
      for (let y = gy; y < gy + gh; y += 4) ctx.fillRect(gx + gw - panelW, y, panelW, 1);
    }
  }
}