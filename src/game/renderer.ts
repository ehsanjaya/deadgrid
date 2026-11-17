import { ITEMS, OBJECT_DEFS, TILE_SIZE } from './data';
import { PixelArtCache } from './sprites';
import {
  CityData,
  GameEntity,
  GridObject,
  InventoryItem,
  ResourceNode,
  Vehicle,
} from './types';

export interface RenderContextData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  minimap: HTMLCanvasElement;
  mctx: CanvasRenderingContext2D;
  lightCanvas: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  sprites: PixelArtCache;
  camera: { x: number; y: number; zoom: number };
  screenShake: number;
  timeOfDay: number;
  bloodmoonTimer: number;
  radarAngle: number;
  getTile: (tx: number, ty: number) => string;
  resources: Map<string, ResourceNode>;
  objects: Map<string, GridObject>;
  cities: CityData[];
  vehicles: Vehicle[];
  entities: GameEntity[];
  drops: { x: number; y: number; itemId: string; count: number; bob: number }[];
  bullets: { x: number; y: number; vx: number; vy: number; color: string }[];
  spitProjectiles: { x: number; y: number; isBloodmoon?: boolean }[];
  grenades: { x: number; y: number }[];
  virusPuddles: { x: number; y: number; radius: number; life: number; isBloodmoon?: boolean }[];
  firePatches: { x: number; y: number; radius: number; life: number }[];
  shockwaves: { x: number; y: number; radius: number; alpha: number }[];
  meteorImpacts: { x: number; y: number; radius: number; isPoison?: boolean }[];
  particles: { x: number; y: number; color: string; size: number }[];
  ripples: { x: number; y: number; radius: number; alpha: number }[];
  floatingTexts: { x: number; y: number; text: string; color: string; life: number }[];
  mouse: { worldX: number; worldY: number };
  isWaterTile: (tile: string) => boolean;
  isTileBlocked: (tx: number, ty: number, ignoreDoorsOpen?: boolean) => boolean;
  isModalOpen: boolean;
  player: {
    x: number;
    y: number;
    radius: number;
    angle: number;
    facingDir: number;
    walkCycle: number;
    hurtFlash: number;
    poisonTimer: number;
    swingAnim: number;
    blocking: boolean;
    dead: boolean;
    mountedHorse: GameEntity | null;
    seatedObj: GridObject | null;
    inVehicle: Vehicle | null;
    equipment: {
      head: InventoryItem | null;
      body: InventoryItem | null;
      feet: InventoryItem | null;
      shield: InventoryItem | null;
    };
    heldItem: InventoryItem | null;
  };
}

export function renderGameFrame(state: RenderContextData): number {
  const { ctx, canvas, sprites, camera } = state;
  const w = canvas.width;
  const h = canvas.height;
  const z = camera.zoom;

  ctx.fillStyle = '#090c10';
  ctx.fillRect(0, 0, w, h);

  const shakeX = state.screenShake > 0 ? (Math.random() - 0.5) * 14 * state.screenShake : 0;
  const shakeY = state.screenShake > 0 ? (Math.random() - 0.5) * 14 * state.screenShake : 0;

  ctx.save();
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(z, z);
  ctx.translate(-camera.x, -camera.y);

  const halfW = w / 2 / z + TILE_SIZE * 2;
  const halfH = h / 2 / z + TILE_SIZE * 2;
  const minTx = Math.floor((camera.x - halfW) / TILE_SIZE);
  const maxTx = Math.floor((camera.x + halfW) / TILE_SIZE);
  const minTy = Math.floor((camera.y - halfH) / TILE_SIZE);
  const maxTy = Math.floor((camera.y + halfH) / TILE_SIZE);
  const waterFrame = Math.floor(performance.now() / 450) % 2;
  const now = performance.now() / 1000;

  // 1. Ground Tiles
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const tile = state.getTile(tx, ty);
      let sprite = sprites.tiles[tile];
      if (tile === 'water') sprite = sprites.tiles['water_' + waterFrame];
      else if (tile === 'hole_water') sprite = sprites.tiles['hole_water_' + waterFrame];
      if (!sprite) sprite = sprites.tiles['grass_0'];
      ctx.drawImage(sprite, tx * TILE_SIZE, ty * TILE_SIZE);
    }
  }

  // 2. Virus Blood Puddles
  for (const vp of state.virusPuddles) {
    if (Math.abs(vp.x - camera.x) > halfW || Math.abs(vp.y - camera.y) > halfH) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, vp.life / 3);
    ctx.fillStyle = vp.isBloodmoon ? '#991b1b' : '#4d7c0f';
    ctx.beginPath();
    ctx.ellipse(vp.x, vp.y, vp.radius, vp.radius * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = vp.isBloodmoon ? '#ef4444' : '#84cc16';
    ctx.beginPath();
    ctx.ellipse(vp.x - 3, vp.y - 2, vp.radius * 0.55, vp.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2b. Gas Explosion Fire & Smoke Patches
  for (const fp of state.firePatches) {
    if (Math.abs(fp.x - camera.x) > halfW + fp.radius || Math.abs(fp.y - camera.y) > halfH + fp.radius) continue;
    const flicker = 0.85 + Math.sin(now * 22 + fp.x) * 0.15;
    const fade = Math.min(1, fp.life / 2.2);
    ctx.save();
    ctx.globalAlpha = 0.72 * fade;
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(fp.x, fp.y, fp.radius * 1.15, fp.radius * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.ellipse(fp.x, fp.y - 2, fp.radius * 0.78 * flicker, fp.radius * 0.52 * flicker, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(fp.x + Math.sin(now * 16 + fp.y) * 4, fp.y - 5, fp.radius * 0.36 * flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Water Ripples
  for (const r of state.ripples) {
    ctx.save();
    ctx.strokeStyle = `rgba(186, 230, 253, ${Math.max(0, r.alpha)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Grid Objects & Furniture
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const obj = state.objects.get(`${tx},${ty}`);
      if (obj) drawGridObject(ctx, sprites, obj, tx * TILE_SIZE, ty * TILE_SIZE, now);
    }
  }

  // 5. Resources (Trees, Cave Ores, Boulders)
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const res = state.resources.get(`${tx},${ty}`);
      if (res) drawResource(ctx, res, tx * TILE_SIZE, ty * TILE_SIZE, now);
    }
  }

  // 6. Ground Item Drops
  for (const d of state.drops) {
    if (Math.abs(d.x - camera.x) > halfW || Math.abs(d.y - camera.y) > halfH) continue;
    const def = ITEMS[d.itemId];
    const bobY = Math.sin(now * 4 + d.bob) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 8, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def ? def.icon : '📦', d.x, d.y + bobY);
  }

  // 7. Ground Vehicles (Cars & 20 Jeeps)
  for (const v of state.vehicles) {
    if (v.kind === 'helicopter') continue;
    if (Math.abs(v.x - camera.x) > halfW + 70 || Math.abs(v.y - camera.y) > halfH + 70) continue;
    drawGroundVehicle(ctx, v, state.timeOfDay);
  }

  // 8. Entities + Player (Cull offscreen entities BEFORE sorting so 750+ zombies never cause O(N log N) lag!)
  const renderList: ({ kind: 'player'; y: number } | GameEntity)[] = [];
  const cullW = halfW + 75;
  const cullH = halfH + 75;
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.inVehicle) continue;
    if (Math.abs(e.x - camera.x) > cullW || Math.abs(e.y - camera.y) > cullH) continue;
    renderList.push(e);
  }
  if (!state.player.dead && !state.player.inVehicle) {
    renderList.push({ kind: 'player', y: state.player.y });
  }
  renderList.sort((a, b) => a.y - b.y);

  for (let i = 0; i < renderList.length; i++) {
    const item = renderList[i];
    if (item.kind === 'player' && !('hp' in item)) {
      drawPlayer(ctx, state);
    } else {
      drawEntity(ctx, item as GameEntity, state.player.walkCycle);
    }
  }

  // 9. Flying Armored Helicopters (rendered above ground entities!)
  for (const v of state.vehicles) {
    if (v.kind !== 'helicopter') continue;
    if (Math.abs(v.x - camera.x) > halfW + 100 || Math.abs(v.y - camera.y) > halfH + 100) continue;
    drawHelicopter(ctx, v);
  }

  // 10. Bullets, Spit, Grenades, Shockwaves, Meteors (Culled to viewport)
  ctx.fillStyle = '#facc15';
  for (const b of state.bullets) {
    if (Math.abs(b.x - camera.x) > cullW || Math.abs(b.y - camera.y) > cullH) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - 2.5, b.y - 2.5, 5, 5);
  }

  for (const sp of state.spitProjectiles) {
    if (Math.abs(sp.x - camera.x) > cullW || Math.abs(sp.y - camera.y) > cullH) continue;
    ctx.fillStyle = sp.isBloodmoon ? '#dc2626' : '#65a30d';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.isBloodmoon ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sp.isBloodmoon ? '#fca5a5' : '#bef264';
    ctx.beginPath();
    ctx.arc(sp.x - 1.5, sp.y - 1.5, sp.isBloodmoon ? 3 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const g of state.grenades) {
    if (Math.abs(g.x - camera.x) > cullW || Math.abs(g.y - camera.y) > cullH) continue;
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(g.x, g.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Math.floor(now * 16) % 2 === 0 ? '#ef4444' : '#facc15';
    ctx.beginPath();
    ctx.arc(g.x, g.y - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const sw of state.shockwaves) {
    if (Math.abs(sw.x - camera.x) > cullW + sw.radius || Math.abs(sw.y - camera.y) > cullH + sw.radius) continue;
    ctx.save();
    ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, sw.alpha)})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const m of state.meteorImpacts) {
    if (Math.abs(m.x - camera.x) > cullW + m.radius || Math.abs(m.y - camera.y) > cullH + m.radius) continue;
    const pulse = 1 + Math.sin(performance.now() / 65) * 0.08;
    ctx.save();
    ctx.strokeStyle = m.isPoison ? '#84cc16' : '#fb923c';
    ctx.lineWidth = 4;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = m.isPoison ? 'rgba(132,204,22,0.16)' : 'rgba(249,115,22,0.12)';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = m.isPoison ? '#bef264' : '#fdba74';
    ctx.fillText(m.isPoison ? '☄️☣️ TOXIC METEOR' : '☄ METEOR INCOMING', m.x, m.y - m.radius - 12);
    ctx.restore();
  }

  // 11. Particles (Culled)
  for (const p of state.particles) {
    if (Math.abs(p.x - camera.x) > cullW || Math.abs(p.y - camera.y) > cullH) continue;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }

  // 12. Placement Ghost Preview
  const held = state.player.heldItem;
  if (
    held &&
    ITEMS[held.id] &&
    (ITEMS[held.id].type === 'placeable' || ITEMS[held.id].type === 'seed') &&
    !state.isModalOpen &&
    !state.player.inVehicle
  ) {
    const tx = Math.floor(state.mouse.worldX / TILE_SIZE);
    const ty = Math.floor(state.mouse.worldY / TILE_SIZE);
    const dist = Math.hypot((tx + 0.5) * TILE_SIZE - state.player.x, (ty + 0.5) * TILE_SIZE - state.player.y);
    const valid =
      dist <= 135 &&
      !state.isWaterTile(state.getTile(tx, ty)) &&
      !state.isTileBlocked(tx, ty, false) &&
      !state.objects.has(`${tx},${ty}`);
    ctx.strokeStyle = valid ? '#4ade80' : '#f43f5e';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE_SIZE + 1, ty * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.fillStyle = valid ? 'rgba(74, 222, 128, 0.2)' : 'rgba(244, 63, 94, 0.2)';
    ctx.fillRect(tx * TILE_SIZE + 1, ty * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }

  // 13. Floating Text
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i];
    ft.y -= 24 * 0.016;
    ft.life -= 0.016;
    if (ft.life <= 0) {
      state.floatingTexts.splice(i, 1);
      continue;
    }
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
  }

  ctx.restore();

  renderLightingOverlay(state, ctx, w, h, z);
  return renderMinimap(state);
}

function drawGroundVehicle(ctx: CanvasRenderingContext2D, v: Vehicle, timeOfDay: number) {
  const isNight = timeOfDay > 0.72 || timeOfDay < 0.25;
  ctx.save();
  ctx.translate(v.x, v.y);

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 21, 12, v.angle, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(v.angle);

  if (isNight && v.driver !== 'none') {
    const grad = ctx.createLinearGradient(16, 0, 130, 0);
    grad.addColorStop(0, 'rgba(254, 240, 138, 0.35)');
    grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(18, -8);
    ctx.lineTo(130, -34);
    ctx.lineTo(130, 34);
    ctx.lineTo(18, 8);
    ctx.closePath();
    ctx.fill();
  }

  // Wheels
  ctx.fillStyle = '#090c10';
  ctx.fillRect(-15, -13, 9, 4);
  ctx.fillRect(7, -13, 9, 4);
  ctx.fillRect(-15, 9, 9, 4);
  ctx.fillRect(7, 9, 9, 4);

  // Chassis
  ctx.fillStyle = v.hurtFlash > 0 ? '#ffffff' : v.color;
  ctx.fillRect(-19, -10, 38, 20);

  // Armor trim for Jeeps
  if (v.kind === 'jeep') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-17, -8, 12, 16);
    ctx.fillStyle = v.accentColor;
    ctx.fillRect(-3, -7, 10, 14);
    // Windshield + rollbar
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(6, -7, 4, 14);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-8, -9, 2, 18);
  } else {
    // Car cabin & windshield
    ctx.fillStyle = v.accentColor;
    ctx.fillRect(-8, -8, 17, 16);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(5, -7, 4, 14);
    ctx.fillRect(-7, -7, 3, 14);
  }

  // Headlights
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(17, -8, 2, 4);
  ctx.fillRect(17, 4, 2, 4);
  ctx.restore();

  // Label & Fuel / Repair Status
  ctx.font = 'bold 8px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  const lowFuel = v.fuel <= 25;
  const lowHp = v.hp < v.maxHp * 0.45;
  ctx.fillStyle = v.repairing
    ? '#34d399'
    : v.refueling
      ? '#facc15'
      : v.fuel <= 0
        ? '#f43f5e'
        : v.driver === 'player'
          ? '#4ade80'
          : v.driver !== 'none'
            ? '#38bdf8'
            : lowHp
              ? '#fb923c'
              : '#e2e8f0';
  const hpPct = Math.round((v.hp / v.maxHp) * 100);
  const driverTag = v.repairing
    ? ` [🔧 REPAIRING ${hpPct}%]`
    : v.refueling
      ? ' [⛽ REFUELING]'
      : v.fuel <= 0
        ? ' [⛽ EMPTY]'
        : v.driver === 'player'
          ? ' [YOU]'
          : v.driver === 'fbi'
            ? ' [FBI]'
            : v.driver === 'military'
              ? ' [MIL]'
              : lowHp
                ? ' [🔧 LOW HP]'
                : '';
  ctx.fillText(`${v.kind === 'jeep' ? '🚙' : '🚗'} ${v.name}${driverTag}`, 0, -20);

  if (v.hp < v.maxHp || lowFuel || v.driver !== 'none') {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(-16, -16, 32, 3);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(-16, -16, 32 * Math.max(0, v.hp / v.maxHp), 3);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(-16, -12, 32, 2);
    ctx.fillStyle = v.fuel <= 25 ? '#f59e0b' : '#38bdf8';
    ctx.fillRect(-16, -12, 32 * Math.max(0, v.fuel / (v.maxFuel || 100)), 2);
  }
  ctx.restore();
}

function drawHelicopter(ctx: CanvasRenderingContext2D, v: Vehicle) {
  const liftY = v.altitude * 28;
  ctx.save();

  // Ground shadow offset by altitude
  ctx.fillStyle = `rgba(0,0,0,${0.45 - v.altitude * 0.18})`;
  ctx.beginPath();
  ctx.ellipse(v.x + v.altitude * 12, v.y + 8 + v.altitude * 12, 26, 14, v.angle, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(v.x, v.y - liftY);
  ctx.save();
  ctx.rotate(v.angle);

  // Skids
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-16, -13, 30, 2);
  ctx.fillRect(-16, 11, 30, 2);

  // Tail boom
  ctx.fillStyle = '#475569';
  ctx.fillRect(-30, -3, 18, 6);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-31, -6, 3, 12);

  // Armored Fuselage
  ctx.fillStyle = v.hurtFlash > 0 ? '#ffffff' : '#334155';
  ctx.fillRect(-14, -10, 30, 20);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(10, -7, 8, 14); // armored cockpit glass
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(12, -5, 5, 10);

  // Twin Mounted Gun Pods!
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(2, -15, 14, 4);
  ctx.fillRect(2, 11, 14, 4);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(16, -14, 4, 2);
  ctx.fillRect(16, 12, 4, 2);

  // Spinning Main Rotor Blades
  ctx.save();
  ctx.rotate(v.rotorAngle);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
  ctx.fillRect(-32, -2, 64, 4);
  ctx.fillRect(-2, -32, 4, 64);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();

  ctx.font = 'bold 8px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  const lowHp = v.hp < v.maxHp * 0.45;
  ctx.fillStyle = v.repairing
    ? '#34d399'
    : v.refueling
      ? '#facc15'
      : v.fuel <= 0
        ? '#f43f5e'
        : v.driver === 'player'
          ? '#4ade80'
          : v.driver === 'fbi'
            ? '#38bdf8'
            : lowHp
              ? '#fb923c'
              : '#facc15';
  const hpPct = Math.round((v.hp / v.maxHp) * 100);
  const tag = v.repairing
    ? ` [🔧 REPAIRING ${hpPct}%]`
    : v.refueling
      ? ' [⛽ REFUELING]'
      : v.fuel <= 0
        ? ' [⛽ EMPTY]'
        : v.driver === 'player'
          ? v.altitude >= 0.25
            ? ' [PILOTING • FLYING]'
            : ' [PILOTING]'
          : v.driver === 'fbi'
            ? ' [FBI AIR PATROL]'
            : v.driver !== 'none'
              ? ' [AIR PATROL]'
              : lowHp
                ? ' [🔧 LOW HP]'
                : ' [ARMED HELI]';
  ctx.fillText(`🚁 ${v.name}${tag}`, 0, -25);

  if (v.hp < v.maxHp || v.fuel <= 25 || v.driver !== 'none') {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(-20, -21, 40, 3);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-20, -21, 40 * Math.max(0, v.hp / v.maxHp), 3);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(-20, -17, 40, 2);
    ctx.fillStyle = v.fuel <= 25 ? '#f59e0b' : '#facc15';
    ctx.fillRect(-20, -17, 40 * Math.max(0, v.fuel / (v.maxFuel || 100)), 2);
  }
  ctx.restore();
}

function drawGridObject(ctx: CanvasRenderingContext2D, sprites: PixelArtCache, obj: GridObject, px: number, py: number, now: number) {
  if (sprites.blocks[obj.type]) {
    ctx.drawImage(sprites.blocks[obj.type], px, py);
  } else if (obj.type === 'door') {
    if (obj.open) {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(px + 2, py + 2, 6, 28);
    } else {
      ctx.fillStyle = '#92400e';
      ctx.fillRect(px + 2, py + 10, 28, 12);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(px + 22, py + 15, 3, 3);
    }
  } else if (obj.type === 'iron_door') {
    if (obj.open) {
      // Recessed steel gate track & glowing green vehicle-sensor LED
      ctx.fillStyle = 'rgba(51, 65, 85, 0.55)';
      ctx.fillRect(px, py + 13, 32, 6);
      ctx.fillStyle = '#475569';
      ctx.fillRect(px + 1, py + 1, 6, 6);
      ctx.fillRect(px + 25, py + 25, 6, 6);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(px + 2, py + 2, 3, 3);
    } else {
      // Heavy armored steel blast door with rivets & yellow hazard stripe
      ctx.fillStyle = '#334155';
      ctx.fillRect(px, py + 4, 32, 24);
      ctx.fillStyle = '#475569';
      ctx.fillRect(px + 2, py + 6, 28, 20);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(px + 2, py + 14, 28, 4);
      ctx.fillStyle = '#0f172a';
      for (let rx = 4; rx < 30; rx += 8) {
        ctx.fillRect(px + rx, py + 14, 4, 4);
      }
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px + 3, py + 8, 2, 2);
      ctx.fillRect(px + 27, py + 8, 2, 2);
      ctx.fillRect(px + 3, py + 22, 2, 2);
      ctx.fillRect(px + 27, py + 22, 2, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 14, py + 8, 4, 3);
    }
  } else if (obj.type === 'old_tv') {
    ctx.fillStyle = '#451a03';
    ctx.fillRect(px + 4, py + 6, 24, 22);
    ctx.fillStyle = obj.isOn ? '#0284c7' : '#0f172a';
    ctx.fillRect(px + 6, py + 8, 16, 15);
    if (obj.isOn) {
      const flicker = Math.floor(now * 6) % 2 === 0;
      ctx.fillStyle = flicker ? '#38bdf8' : '#f43f5e';
      ctx.fillRect(px + 8, py + 10, 12, 8);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(px + 7, py + 19, 14, 3);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(px + 24, py + 10, 2, 2);
    ctx.fillRect(px + 24, py + 15, 2, 2);
  } else if (obj.type === 'old_computer') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px + 2, py + 22, 28, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(px + 4, py + 5, 17, 15);
    ctx.fillStyle = obj.isOn ? '#064e3b' : '#0f172a';
    ctx.fillRect(px + 6, py + 7, 13, 10);
    if (obj.isOn) {
      const blink = Math.floor(now * 4) % 2 === 0;
      ctx.fillStyle = '#10b981';
      ctx.fillRect(px + 7, py + 9, 10, 2);
      ctx.fillStyle = '#34d399';
      ctx.fillRect(px + 7, py + 12, blink ? 8 : 5, 2);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(px + 22, py + 8, 6, 14);
    ctx.fillStyle = obj.isOn ? '#22c55e' : '#ef4444';
    ctx.fillRect(px + 24, py + 10, 2, 2);
  } else if (obj.type === 'cinema_screen') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px - 14, py + 4, 60, 22);
    if (obj.isOn) {
      const frame = Math.floor(now * 3) % 3;
      ctx.fillStyle = frame === 0 ? '#4f46e5' : frame === 1 ? '#0ea5e9' : '#e11d48';
      ctx.fillRect(px - 11, py + 6, 54, 18);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(px + 6 + frame * 5, py + 11, 10, 8);
    }
  } else if (obj.type === 'city_flag') {
    const c = obj.cityRef;
    const flagCol = c && c.surrendered ? '#ffffff' : '#2563eb';
    const wave = Math.sin(now * 8) * 2;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(px + 14, py + 2, 3, 28);
    ctx.fillStyle = flagCol;
    ctx.fillRect(px + 17, py + 4 + wave * 0.4, 13, 9);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 17, py + 4 + wave * 0.4, 13, 9);
    if (!c || !c.surrendered) {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(px + 19, py + 6 + wave * 0.4, 4, 4);
    }
  } else if (obj.type === 'military_flag') {
    const wave = Math.sin(now * 9) * 2.2;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(px + 14, py + 1, 3, 29);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(px + 17, py + 3 + wave * 0.4, 14, 10);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(px + 21, py + 6 + wave * 0.4, 5, 4);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 17, py + 3 + wave * 0.4, 14, 10);
  } else if (obj.type === 'furnace') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(px + 3, py + 3, 26, 26);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 9, py + 15, 14, 12);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(px + 11, py + 18, 10, 8);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(px + 13, py + 20, 6, 5);
  } else if (obj.type === 'torch' || obj.type === 'lantern') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px + 14, py + 12, 4, 16);
    ctx.fillStyle = obj.type === 'lantern' ? '#38bdf8' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(px + 16, py + 10, obj.type === 'lantern' ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (obj.type === 'campfire') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px + 6, py + 18, 20, 5);
    ctx.fillRect(px + 13, py + 10, 6, 16);
    const flicker = Math.sin(now * 20) * 2;
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(px + 16, py + 15 + flicker, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (obj.type === 'spikes') {
    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 4, py + 4, 24, 24);
    ctx.fillStyle = '#e2e8f0';
    for (let sy = 8; sy <= 22; sy += 7) {
      for (let sx = 8; sx <= 22; sx += 7) ctx.fillRect(px + sx, py + sy, 3, 3);
    }
  } else if (obj.type === 'beartrap') {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(px + 14, py + 14, 4, 4);
  } else if (obj.type === 'turret') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(px + 6, py + 6, 20, 20);
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (obj.type === 'military_radar') {
    // Heavy steel Radar base + rotating dish + flashing red light when >= 100 zombies detected!
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 3, py + 5, 26, 24);
    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 6, py + 8, 20, 18);
    const spin = now * (obj.isOn ? 7.5 : 2.6);
    const dishX = px + 16 + Math.cos(spin) * 5;
    const dishY = py + 14 + Math.sin(spin) * 4;
    ctx.strokeStyle = obj.isOn ? '#fca5a5' : '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px + 16, py + 15, 9, spin - 0.9, spin + 0.9);
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 15);
    ctx.lineTo(dishX, dishY);
    ctx.stroke();

    if (obj.isOn) {
      const flash = Math.floor(now * 8) % 2 === 0;
      ctx.fillStyle = flash ? '#ef4444' : '#991b1b';
      ctx.beginPath();
      ctx.arc(px + 16, py + 6, flash ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
      ctx.lineWidth = 2;
      const ringR = 12 + ((now * 28) % 22);
      ctx.beginPath();
      ctx.arc(px + 16, py + 15, ringR, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(px + 16, py + 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (obj.type === 'crop_wheat') {
    const h = Math.max(5, Math.floor(obj.growth * 22));
    ctx.fillStyle = obj.growth >= 1 ? '#facc15' : '#65a30d';
    for (let ox = 6; ox <= 24; ox += 6) ctx.fillRect(px + ox, py + 28 - h, 3, h);
  } else if (obj.type === 'gold_chandelier') {
    const shimmer = 0.75 + Math.sin(now * 6 + obj.tx) * 0.25;
    ctx.fillStyle = `rgba(250, 204, 21, ${0.22 * shimmer})`;
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(px + 14, py + 4, 4, 24);
    ctx.fillRect(px + 4, py + 14, 24, 4);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(px + 6, py + 6, 4, 4);
    ctx.fillRect(px + 22, py + 6, 4, 4);
    ctx.fillRect(px + 6, py + 22, 4, 4);
    ctx.fillRect(px + 22, py + 22, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + 14, py + 14, 4, 4);
  } else if (obj.type === 'marble_fountain') {
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 10, 0, Math.PI * 2);
    ctx.fill();
    const splash = 2 + Math.sin(now * 9) * 1.5;
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath();
    ctx.arc(px + 16, py + 16, 5 + splash * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + 14, py + 14, 4, 4);
  } else if (obj.type === 'royal_pool') {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(px + 1, py + 1, 30, 30);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(px + 3, py + 3, 26, 26);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(px + 5, py + 5, 22, 22);
    const waveOff = Math.sin(now * 5 + obj.tx) * 2;
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(px + 7 + waveOff, py + 9, 8, 2);
    ctx.fillRect(px + 14 - waveOff, py + 18, 9, 2);
  }

  if (obj.damaged && obj.hp < obj.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(px + 4, py - 5, 24, 3);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(px + 4, py - 5, 24 * (obj.hp / obj.maxHp), 3);
  }
}

function drawResource(ctx: CanvasRenderingContext2D, res: ResourceNode, px: number, py: number, now: number) {
  if (res.type.includes('tree') || res.type === 'snow_pine') {
    const sc = res.scale || 1.0;
    ctx.save();
    ctx.translate(px + 16, py + 24);
    ctx.scale(sc, sc);
    ctx.translate(-(px + 16), -(py + 24));

    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 26, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#5c3114';
    ctx.fillRect(px + 12, py + 13, 8, 14);
    ctx.fillStyle = '#783f1a';
    ctx.fillRect(px + 14, py + 13, 3, 14);

    if (res.type === 'pine_tree' || res.type === 'snow_pine') {
      ctx.fillStyle = res.type === 'snow_pine' ? '#cbd5e1' : '#14532d';
      ctx.beginPath();
      ctx.moveTo(px + 16, py - 10);
      ctx.lineTo(px + 3, py + 16);
      ctx.lineTo(px + 29, py + 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = res.type === 'snow_pine' ? '#f8fafc' : '#166534';
      ctx.beginPath();
      ctx.moveTo(px + 16, py - 16);
      ctx.lineTo(px + 6, py + 6);
      ctx.lineTo(px + 26, py + 6);
      ctx.closePath();
      ctx.fill();
    } else {
      const darkLeaf = res.type === 'jungle_tree' ? '#064e3b' : res.type === 'acacia_tree' ? '#3f6212' : '#14532d';
      const midLeaf = res.type === 'jungle_tree' ? '#059669' : res.type === 'acacia_tree' ? '#65a30d' : '#16a34a';
      const lightLeaf = res.type === 'jungle_tree' ? '#34d399' : res.type === 'acacia_tree' ? '#a3e635' : '#4ade80';

      ctx.fillStyle = darkLeaf;
      ctx.beginPath();
      ctx.arc(px + 16, py + 7, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = midLeaf;
      ctx.beginPath();
      ctx.arc(px + 14, py + 4, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lightLeaf;
      ctx.beginPath();
      ctx.arc(px + 12, py + 1, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (res.type === 'rock' || res.type.endsWith('_ore')) {
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(px + 16, py + 18, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(px + 14, py + 15, 9, 0, Math.PI * 2);
    ctx.fill();

    if (res.type === 'coal_ore') ctx.fillStyle = '#090c10';
    else if (res.type === 'iron_ore') ctx.fillStyle = '#fb923c';
    else if (res.type === 'gold_ore') ctx.fillStyle = '#facc15';
    else ctx.fillStyle = '#94a3b8';

    ctx.fillRect(px + 10, py + 12, 4, 4);
    ctx.fillRect(px + 18, py + 16, 5, 4);
    ctx.fillRect(px + 13, py + 20, 4, 3);

    if (res.type === 'gold_ore' && Math.floor(now * 4 + res.tx) % 3 === 0) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(px + 15, py + 10, 2, 2);
    }
  } else if (res.type === 'berry_bush') {
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(px + 16, py + 18, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(px + 11, py + 14, 3, 3);
    ctx.fillRect(px + 18, py + 16, 3, 3);
    ctx.fillRect(px + 14, py + 21, 3, 3);
  } else if (res.type === 'melon_patch') {
    ctx.fillStyle = '#15803d';
    ctx.fillRect(px + 6, py + 10, 20, 14);
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(px + 13, py + 18, 6, 0, Math.PI * 2);
    ctx.arc(px + 21, py + 16, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (res.type === 'tall_grass') {
    ctx.fillStyle = '#65a30d';
    ctx.fillRect(px + 8, py + 14, 2, 10);
    ctx.fillRect(px + 14, py + 11, 2, 13);
    ctx.fillRect(px + 20, py + 15, 2, 9);
  } else if (res.type === 'cactus') {
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(px + 12, py + 6, 8, 22);
    ctx.fillRect(px + 7, py + 12, 5, 4);
    ctx.fillRect(px + 20, py + 10, 5, 4);
  }

  if (res.damaged && res.hp < res.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(px + 4, py - 4, 24, 3);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(px + 4, py - 4, 24 * (res.hp / res.maxHp), 3);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: RenderContextData) {
  const p = state.player;
  if (p.mountedHorse) drawHorseSprite(ctx, p.mountedHorse, p.walkCycle, true);

  const px = p.mountedHorse ? p.mountedHorse.x : p.x;
  const py = p.mountedHorse ? p.mountedHorse.y - 7 : p.y;
  const bob = p.mountedHorse ? Math.sin(p.walkCycle) * 1.8 : p.seatedObj ? 2 : Math.abs(Math.sin(p.walkCycle)) * 2.5;
  const legSwing = p.mountedHorse || p.seatedObj ? 0 : Math.sin(p.walkCycle) * 4;
  const dir = p.facingDir || 1;

  ctx.save();
  ctx.translate(px, py);

  if (!p.mountedHorse && !p.seatedObj) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.scale(dir, 1);

  if (!p.mountedHorse && !p.seatedObj) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-6, 5 + legSwing * 0.5, 5, 7);
    ctx.fillRect(1, 5 - legSwing * 0.5, 5, 7);
  }

  ctx.fillStyle = p.hurtFlash > 0 ? '#ffffff' : p.poisonTimer > 0 ? '#84cc16' : '#0284c7';
  ctx.fillRect(-7, -6 - bob, 14, 12);

  if (p.equipment.body) {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-7, -5 - bob, 14, 10);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-3, -3 - bob, 6, 4);
  }

  ctx.fillStyle = p.hurtFlash > 0 ? '#ffffff' : '#fed7aa';
  ctx.fillRect(-6, -16 - bob, 12, 10);

  if (p.equipment.head) {
    if (p.equipment.head.id === 'headlamp') {
      ctx.fillStyle = '#334155';
      ctx.fillRect(-7, -18 - bob, 14, 4);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(4, -17 - bob, 4, 3);
    } else {
      ctx.fillStyle = '#475569';
      ctx.fillRect(-7, -18 - bob, 14, 5);
    }
  } else {
    ctx.fillStyle = '#451a03';
    ctx.fillRect(-6, -17 - bob, 12, 3);
  }

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(2, -13 - bob, 2, 2);
  ctx.restore();

  const held = p.heldItem;
  const def = held ? ITEMS[held.id] : null;
  if (def) {
    ctx.save();
    const swingOffset = p.swingAnim > 0 ? Math.sin(p.swingAnim * 25) * 1.1 : 0;
    ctx.rotate(p.angle + swingOffset);
    if (def.type === 'weapon' && def.weaponType !== 'melee' && def.weaponType !== 'bow') {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(8, -2, def.weaponType === 'pistol' ? 10 : 18, 4);
    } else {
      ctx.font = '14px sans-serif';
      ctx.fillText(def.icon, 10, 4);
    }
    ctx.restore();
  }

  if (p.blocking && p.equipment.shield) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -4, 18, p.angle - 0.85, p.angle + 0.85);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHorseSprite(ctx: CanvasRenderingContext2D, h: GameEntity, walkCycle: number, hasRider = false) {
  const bob = Math.abs(Math.sin(walkCycle)) * 2;
  const dir = h.facingDir || 1;
  ctx.save();
  ctx.translate(h.x, h.y);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.scale(dir, 1);

  ctx.fillStyle = h.coat || '#854d27';
  ctx.fillRect(-12, 4, 4, 10);
  ctx.fillRect(-5, 4, 4, 10);
  ctx.fillRect(4, 4, 4, 10);
  ctx.fillRect(10, 4, 4, 10);
  ctx.fillRect(-15, -7 - bob, 30, 13);

  if (h.spotted) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-8, -5 - bob, 6, 5);
    ctx.fillRect(3, -3 - bob, 5, 4);
  }

  ctx.fillStyle = h.mane || '#1e1b18';
  ctx.fillRect(-19, -5 - bob, 4, 11);

  ctx.fillStyle = h.coat || '#854d27';
  ctx.fillRect(11, -18 - bob, 9, 13);
  ctx.fillRect(15, -17 - bob, 8, 7);
  ctx.fillStyle = h.mane || '#1e1b18';
  ctx.fillRect(10, -18 - bob, 3, 10);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(19, -15 - bob, 2, 2);

  if (h.hasChest) {
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-13, -6 - bob, 7, 7);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-10, -4 - bob, 2, 2);
  }
  if (h.saddled) {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-6, -9 - bob, 12, 6);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-2, -7 - bob, 4, 3);
  }
  ctx.restore();

  if (!hasRider) {
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = h.saddled ? '#fde047' : '#cbd5e1';
    ctx.fillText(h.saddled ? (h.hasChest ? `🐎 ${h.name} [📦]` : `🐎 ${h.name}`) : `Wild ${h.name}`, 0, -24);
  }
  ctx.restore();
}

function drawEntity(ctx: CanvasRenderingContext2D, ent: GameEntity, playerWalkCycle: number) {
  if (ent.kind === 'horse') {
    drawHorseSprite(ctx, ent, playerWalkCycle, false);
    return;
  }

  const dir = ent.facingDir || 1;
  ctx.save();
  const leapLift =
    ent.kind === 'zombie' && ent.subType === 'king' && ent.leapPhase === 'air' && ent.leapTimer !== undefined
      ? -Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - ent.leapTimer / 1.15))) * 105
      : 0;
  ctx.translate(ent.x, ent.y + leapLift);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, ent.radius - 1, ent.radius * 0.9, ent.radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  if (ent.kind === 'animal') {
    ctx.save();
    ctx.scale(dir, 1);
    if (ent.aquatic) {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(-11, -3, 4, 6);
    } else {
      ctx.fillStyle = ent.hurtFlash > 0 ? '#ffffff' : ent.color || '#f472b6';
      ctx.fillRect(-ent.radius + 2, -ent.radius + 4, (ent.radius - 2) * 2, ent.radius + 2);
      ctx.fillRect(ent.radius - 6, -ent.radius, 8, 8);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(ent.radius - 1, -ent.radius + 2, 2, 2);
    }
    ctx.restore();
  } else if (ent.kind === 'zombie') {
    const isKing = ent.subType === 'king';
    const isBrute = ent.subType === 'brute' || isKing;
    const isSpitter = ent.subType === 'spitter';
    const isGuardZombie = ent.subType === 'guard_zombie';
    const isBodybuilder = !!ent.isBodybuilder;
    const sc = isKing ? 2.15 : isBrute ? 1.3 : isBodybuilder ? 1.24 : isGuardZombie ? 1.1 : 1.0;
    const bob = Math.abs(Math.sin(ent.walkCycle || 0)) * 2;
    const legSwing = Math.sin(ent.walkCycle || 0) * 3.5;

    ctx.save();
    ctx.scale(dir * sc, sc);

    ctx.fillStyle = isBodybuilder ? '#450a0a' : isGuardZombie ? '#0f172a' : '#1e293b';
    ctx.fillRect(-6, 5 + legSwing * 0.4, 5, 7);
    if (ent.missingLeg !== 'front' || isBodybuilder || isGuardZombie) {
      ctx.fillRect(1, 5 - legSwing * 0.4, 5, 7);
    } else {
      ctx.fillRect(1, 5, 5, 3);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(1, 8, 5, 2);
    }

    if (isBodybuilder) {
      ctx.fillStyle = ent.hurtFlash > 0 ? '#ffffff' : '#7f1d1d';
      ctx.fillRect(-10, -8 - bob, 20, 14);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(-8, -6 - bob, 7, 5);
      ctx.fillRect(1, -6 - bob, 7, 5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-6, -5 - bob, 2, 4);
      ctx.fillRect(4, -5 - bob, 2, 4);
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(-13, -7 - bob, 4, 11);
      ctx.fillRect(9, -7 - bob, 5, 11);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-13, 2 - bob, 4, 3);
      ctx.fillRect(9, 2 - bob, 5, 3);
    } else if (isGuardZombie) {
      // Tactical Armored Guard Zombie Kevlar Vest & Shoulder Pads
      ctx.fillStyle = ent.hurtFlash > 0 ? '#ffffff' : '#1e3a8a';
      ctx.fillRect(-8, -6 - bob, 16, 12);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-6, -5 - bob, 12, 9);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-3, -2 - bob, 6, 3);
    } else {
      ctx.fillStyle = ent.hurtFlash > 0 ? '#ffffff' : ent.shirtColor || '#475569';
      ctx.fillRect(-7, -6 - bob, 14, 12);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(-3, -2 - bob, 5, 4);
    }

    ctx.fillStyle = ent.hurtFlash > 0 ? '#ffffff' : isSpitter ? '#84cc16' : isBodybuilder ? '#4d7c0f' : '#65a30d';
    ctx.fillRect(-6, -16 - bob, 12, 10);
    ctx.fillStyle = isSpitter && !isBodybuilder ? '#bef264' : '#ef4444';
    ctx.fillRect(2, -13 - bob, 2, 2);

    if (isGuardZombie) {
      // Riot Helmet & Cracked Tactical Visor
      ctx.fillStyle = '#334155';
      ctx.fillRect(-7, -19 - bob, 14, 5);
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(1, -15 - bob, 6, 3);
    }

    if (!isBodybuilder) {
      ctx.fillStyle = isSpitter ? '#84cc16' : '#65a30d';
      if (ent.missingArm !== 'front' || isGuardZombie) {
        ctx.fillRect(5, -5 - bob, 9, 3.5);
      } else {
        ctx.fillRect(5, -5 - bob, 3, 3.5);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(8, -5 - bob, 2, 3.5);
      }
    }

    if (isKing) {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-6, -21 - bob, 12, 5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-2, -20 - bob, 3, 3);
    }
    ctx.restore();

    if (isSpitter) {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isBodybuilder ? '#fca5a5' : '#bef264';
      ctx.fillText(isBodybuilder ? '☣️🩸 SUPER SPITTER' : '☣️ SPITTER', 0, -24 * sc);
    } else if (isGuardZombie) {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText('🛡️ GUARD', 0, -24 * sc);
    } else if (isBodybuilder && !isKing) {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fca5a5';
      ctx.fillText('💪 BODYBUILDER', 0, -24 * sc);
    }
  } else {
    const bob = Math.abs(Math.sin(ent.walkCycle || 0)) * 2;
    const legSwing = Math.sin(ent.walkCycle || 0) * 3.5;

    ctx.save();
    ctx.scale(dir, 1);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-6, 5 + legSwing * 0.4, 5, 7);
    ctx.fillRect(1, 5 - legSwing * 0.4, 5, 7);

    let shirt = '#a855f7';
    if (ent.kind === 'president') shirt = '#0f172a';
    else if (ent.kind === 'builder') shirt = '#ea580c';
    else if (ent.kind === 'merchant') shirt = '#d97706';
    else if (ent.kind === 'guard') shirt = ent.role === 'fbi' ? '#1e3a8a' : '#0284c7';
    else if (ent.shirtColor) shirt = ent.shirtColor;

    ctx.fillStyle = ent.hurtFlash > 0 ? '#ffffff' : (ent.poisonTimer || 0) > 0 ? '#84cc16' : shirt;
    ctx.fillRect(-7, -6 - bob, 14, 12);

    if (ent.kind === 'president') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -6 - bob, 4, 8);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-1, -5 - bob, 2, 7);
    }

    if (ent.kind === 'guard' && ent.weaponMode === 'bat_shield') {
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(5, -6 - bob, 4, 11);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-10, -10 - bob, 3, 12);
    } else if (ent.kind === 'guard' && ent.weaponMode === 'bomber') {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(8, -2 - bob, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (ent.kind === 'builder') {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(6, -7 - bob, 6, 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(10, -2 - bob, 2, 11);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(8, -5 - bob, 6, 3);
      if (ent.carrying === 'wheelbarrow') {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(11, 4 - bob, 10, 3);
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(20, 8 - bob, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = ent.hurtFlash > 0 ? '#ffffff' : '#fed7aa';
    ctx.fillRect(-6, -16 - bob, 12, 10);

    if (ent.kind === 'president') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-6, -18 - bob, 12, 4);
    } else if (ent.kind === 'builder') {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-7, -19 - bob, 14, 4);
    } else if (ent.kind === 'merchant') {
      ctx.fillStyle = '#15803d';
      ctx.fillRect(-7, -18 - bob, 14, 3);
    } else if (ent.kind === 'guard' && ent.role === 'fbi') {
      ctx.fillStyle = '#090c10';
      ctx.fillRect(0, -13 - bob, 5, 2.5);
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(-7, -18 - bob, 14, 4);
    } else if (ent.kind === 'villager') {
      if (ent.role === 'farmer') {
        ctx.fillStyle = '#eab308';
        ctx.fillRect(-9, -18 - bob, 18, 3);
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(-6, -22 - bob, 12, 4);
      } else if (ent.role === 'gas_attendant') {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-6, -19 - bob, 14, 4);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(2, -18 - bob, 4, 2);
      } else if (ent.role === 'mechanic') {
        ctx.fillStyle = '#1d4ed8';
        ctx.fillRect(-6, -19 - bob, 14, 4);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(2, -18 - bob, 5, 2);
      } else {
        ctx.fillStyle = ent.hairColor || '#451a03';
        ctx.fillRect(-6, -18 - bob, 12, 3);
      }
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, -13 - bob, 2, 2);
    ctx.restore();

    if (ent.kind === 'president') {
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#facc15';
      ctx.fillText(ent.workingAtComputer ? '🏛️ PRESIDENT [🖥️ WORKING]' : '🏛️ PRESIDENT', 0, -24);
    } else if (ent.kind === 'builder') {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fdba74';
      ctx.fillText(ent.buildTask ? `🏗️ ${ent.heldTool || 'TOOL'} • BUILDING` : `👷 ${ent.heldTool || 'BUILDER'}`, 0, -23);
    } else if (ent.kind === 'merchant') {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.fillText('🪙 SHOP [E]', 0, -23);
    } else if (ent.kind === 'guard' && ent.hostileToPlayer) {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f43f5e';
      ctx.fillText('🚨 HOSTILE!', 0, -23);
    } else if (ent.kind === 'guard' && ent.role === 'fbi') {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = ent.protectingPresident ? '#facc15' : ent.restingAtCamp ? '#4ade80' : ent.city?.radarAlertActive ? '#fca5a5' : (ent.powerBoostTimer || 0) > 0 ? '#facc15' : '#38bdf8';
      const fbiStatus = ent.protectingPresident
        ? '🏛️🕵️ PRES FBI'
        : ent.restingAtCamp
          ? '⛺ REST & EAT +⚡'
          : ent.assignedVehicle
            ? ent.assignedVehicle.kind === 'helicopter'
              ? '🏃 → 🚁 HELI'
              : '🏃 → 🚙 JEEP'
            : ent.city?.radarAlertActive
              ? 'FBI 📡 ALERT'
              : (ent.powerBoostTimer || 0) > 0
                ? 'FBI ⚡POWER'
                : ent.weaponMode === 'bomber'
                  ? 'FBI 💣'
                  : 'FBI';
      ctx.fillText(fbiStatus, 0, -22);
    } else if (ent.kind === 'guard') {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      if (ent.protectingPresident) {
        ctx.fillStyle = '#fde047';
        ctx.fillText('🏛️🛡️ PRES GUARD', 0, -22);
      } else if (ent.restingAtCamp) {
        ctx.fillStyle = '#4ade80';
        ctx.fillText('⛺ CAMP REST +⚡', 0, -22);
      } else if (ent.city?.radarAlertActive) {
        ctx.fillStyle = '#fca5a5';
        ctx.fillText('🛡️ GUARD 📡', 0, -22);
      } else {
        ctx.fillStyle = '#93c5fd';
        ctx.fillText('🛡️ GUARD', 0, -22);
      }
    } else if (ent.kind === 'villager' && ent.role === 'farmer') {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = ent.farmerState === 'store' ? '#fde047' : '#bef264';
      const fTag =
        ent.farmerState === 'plant'
          ? '🌱 PLANTING'
          : ent.farmerState === 'tend'
            ? '💧 WATERING'
            : ent.farmerState === 'harvest'
              ? '🌾 HARVESTING'
              : ent.farmerState === 'store'
                ? '🏠 STORING'
                : ent.farmerState === 'feed'
                  ? '🐄 BARN HAY'
                  : '🌾 FARMER';
      ctx.fillText(fTag, 0, -24);
    } else if (ent.kind === 'villager' && ent.role === 'gas_attendant') {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fca5a5';
      ctx.fillText('⛽ GAS MAN [E]', 0, -24);
    } else if (ent.kind === 'villager' && ent.role === 'mechanic') {
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(ent.farmerState === 'repair' ? '🔧 FIXING VEHICLE' : '🔧 MECHANIC [E]', 0, -24);
    }
  }

  if (ent.damaged && ent.hp < ent.maxHp && ent.subType !== 'king') {
    const bw = Math.max(22, ent.radius * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(-bw / 2, -ent.radius - 13, bw, 4);
    ctx.fillStyle = ent.kind === 'zombie' ? '#ef4444' : '#4ade80';
    ctx.fillRect(-bw / 2, -ent.radius - 13, bw * Math.max(0, ent.hp / ent.maxHp), 4);
  }

  ctx.restore();
}

function renderLightingOverlay(state: RenderContextData, ctx: CanvasRenderingContext2D, w: number, h: number, z: number) {
  const t = state.timeOfDay;
  let darkness = 0;
  if (t > 0.72) darkness = Math.min(0.84, ((t - 0.72) / 0.14) * 0.84);
  else if (t < 0.25) darkness = Math.min(0.84, ((0.25 - t) / 0.14) * 0.84);

  if (state.bloodmoonTimer > 0) darkness = Math.max(darkness, 0.56);

  if (darkness > 0.02) {
    if (state.lightCanvas.width !== w || state.lightCanvas.height !== h) {
      state.lightCanvas.width = w;
      state.lightCanvas.height = h;
    }
    const lctx = state.lctx;
    lctx.clearRect(0, 0, w, h);

    lctx.fillStyle = state.bloodmoonTimer > 0 ? `rgba(75, 4, 14, ${darkness})` : `rgba(5, 9, 20, ${darkness})`;
    lctx.fillRect(0, 0, w, h);
    lctx.globalCompositeOperation = 'destination-out';

    const drawLight = (wx: number, wy: number, radius: number) => {
      const sx = (wx - state.camera.x) * z + w / 2;
      const sy = (wy - state.camera.y) * z + h / 2;
      const sr = radius * z;
      if (sx + sr < 0 || sx - sr > w || sy + sr < 0 || sy - sr > h) return;
      const grad = lctx.createRadialGradient(sx, sy, sr * 0.12, sx, sy, sr);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = grad;
      lctx.beginPath();
      lctx.arc(sx, sy, sr, 0, Math.PI * 2);
      lctx.fill();
    };

    const headlampBonus = (state.player.equipment.head && ITEMS[state.player.equipment.head.id]?.lightBonus) || 0;
    drawLight(state.player.x, state.player.y, 175 + headlampBonus);

    // Only inspect tiles around the visible viewport + light bleed margin (avoids O(all objects) lag)
    const padTiles = 9;
    const halfW = w / 2 / z;
    const halfH = h / 2 / z;
    const minTx = Math.floor((state.camera.x - halfW) / TILE_SIZE) - padTiles;
    const maxTx = Math.floor((state.camera.x + halfW) / TILE_SIZE) + padTiles;
    const minTy = Math.floor((state.camera.y - halfH) / TILE_SIZE) - padTiles;
    const maxTy = Math.floor((state.camera.y + halfH) / TILE_SIZE) + padTiles;

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const obj = state.objects.get(`${tx},${ty}`);
        if (!obj) continue;
        const def = OBJECT_DEFS[obj.type];
        if (def && def.lightRadius > 0) {
          drawLight((obj.tx + 0.5) * TILE_SIZE, (obj.ty + 0.5) * TILE_SIZE, def.lightRadius);
        } else if ((obj.type === 'old_tv' || obj.type === 'old_computer' || obj.type === 'cinema_screen') && obj.isOn) {
          drawLight((obj.tx + 0.5) * TILE_SIZE, (obj.ty + 0.5) * TILE_SIZE, 150);
        }
      }
    }

    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(state.lightCanvas, 0, 0);
  }

  // Draw pulsing RED RADAR alert beacon glow (always visible BOTH day and night when 100+ zombies trigger RADAR!)
  const nowSec = performance.now() / 1000;
  for (const c of state.cities) {
    if (!c.radarAlertActive || c.militaryRadarTx === undefined || c.militaryRadarTy === undefined) continue;
    const rx = (c.militaryRadarTx + 0.5) * TILE_SIZE;
    const ry = (c.militaryRadarTy + 0.5) * TILE_SIZE;
    const sx = (rx - state.camera.x) * z + w / 2;
    const sy = (ry - state.camera.y) * z + h / 2;
    const sr = 210 * z;
    if (sx + sr < 0 || sx - sr > w || sy + sr < 0 || sy - sr > h) continue;
    const alpha = 0.25 + 0.22 * Math.sin(nowSec * 9);
    const rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, sr);
    rg.addColorStop(0, `rgba(239, 68, 68, ${alpha * 1.4})`);
    rg.addColorStop(0.5, `rgba(220, 38, 38, ${alpha * 0.65})`);
    rg.addColorStop(1, 'rgba(220, 38, 38, 0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
}

let minimapCacheCanvas: HTMLCanvasElement | null = null;
let minimapLastRedraw = 0;
let minimapLastTx = -99999;
let minimapLastTy = -99999;

function renderMinimap(state: RenderContextData): number {
  const mctx = state.mctx;
  const mw = state.minimap.width;
  const mh = state.minimap.height;
  const scale = 2.1;
  const half = mw / 2;
  const ptx = Math.floor(state.player.x / TILE_SIZE);
  const pty = Math.floor(state.player.y / TILE_SIZE);
  const nowMs = performance.now();

  if (!minimapCacheCanvas) {
    minimapCacheCanvas = document.createElement('canvas');
  }
  if (minimapCacheCanvas.width !== mw || minimapCacheCanvas.height !== mh) {
    minimapCacheCanvas.width = mw;
    minimapCacheCanvas.height = mh;
    minimapLastRedraw = 0;
  }

  // Throttle expensive terrain+dots redraw to ~7Hz or when player steps >= 2 tiles
  if (
    nowMs - minimapLastRedraw > 140 ||
    Math.abs(ptx - minimapLastTx) >= 2 ||
    Math.abs(pty - minimapLastTy) >= 2
  ) {
    minimapLastRedraw = nowMs;
    minimapLastTx = ptx;
    minimapLastTy = pty;

    const cctx = minimapCacheCanvas.getContext('2d')!;
    cctx.fillStyle = '#090c10';
    cctx.fillRect(0, 0, mw, mh);
    const range = Math.floor(half / scale);

    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const tile = state.getTile(ptx + dx, pty + dy);
        if (tile === 'water' || tile === 'hole_water') cctx.fillStyle = '#1d4ed8';
        else if (tile === 'road') cctx.fillStyle = '#334155';
        else if (tile === 'sidewalk' || tile === 'city_floor') cctx.fillStyle = '#cbd5e1';
        else if (tile === 'white_floor') cctx.fillStyle = '#ffffff';
        else if (tile === 'mall_floor') cctx.fillStyle = '#fde68a';
        else if (tile === 'hotel_carpet') cctx.fillStyle = '#991b1b';
        else if (tile === 'farmland') cctx.fillStyle = '#854d0e';
        else if (tile === 'cave_floor') cctx.fillStyle = '#1e2430';
        else if (tile === 'helipad' || tile === 'military_pad' || tile === 'gas_pad') cctx.fillStyle = '#475569';
        else if (tile === 'sand') cctx.fillStyle = '#eab308';
        else if (tile === 'stone') cctx.fillStyle = '#64748b';
        else if (tile === 'snow') cctx.fillStyle = '#f8fafc';
        else if (tile === 'forest' || tile === 'jungle') cctx.fillStyle = '#14532d';
        else cctx.fillStyle = '#166534';
        cctx.fillRect(half + dx * scale, half + dy * scale, scale, scale);
      }
    }

    for (const v of state.vehicles) {
      const dx = ((v.x - state.player.x) / TILE_SIZE) * scale;
      const dy = ((v.y - state.player.y) / TILE_SIZE) * scale;
      if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
      cctx.fillStyle = v.kind === 'helicopter' ? '#22d3ee' : v.kind === 'jeep' ? '#a3e635' : '#f472b6';
      cctx.fillRect(half + dx - 1.5, half + dy - 1.5, 3, 3);
    }

    let zDots = 0;
    for (let i = 0; i < state.entities.length; i++) {
      const ent = state.entities[i];
      const dx = ((ent.x - state.player.x) / TILE_SIZE) * scale;
      const dy = ((ent.y - state.player.y) / TILE_SIZE) * scale;
      if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
      if (ent.kind === 'zombie') {
        if (ent.subType !== 'king' && ++zDots > 140) continue; // Cap minimap zombie clutter
        cctx.fillStyle = ent.subType === 'king' ? '#facc15' : ent.subType === 'spitter' ? '#a3e635' : ent.subType === 'guard_zombie' ? '#7dd3fc' : '#ef4444';
      } else if (ent.kind === 'president' || ent.kind === 'merchant') cctx.fillStyle = '#fbbf24';
      else if (ent.kind === 'guard') cctx.fillStyle = '#38bdf8';
      else if (ent.kind === 'villager' || ent.kind === 'builder') cctx.fillStyle = ent.role === 'gas_attendant' ? '#f87171' : ent.role === 'mechanic' ? '#38bdf8' : '#4ade80';
      else if (ent.kind === 'horse') cctx.fillStyle = '#f97316';
      else continue;
      const dotSize = ent.subType === 'king' ? 4 : 2.5;
      cctx.fillRect(half + dx - dotSize / 2, half + dy - dotSize / 2, dotSize, dotSize);
    }
  }

  mctx.drawImage(minimapCacheCanvas, 0, 0);

  const nextAngle = (state.radarAngle || 0) + 0.035;
  mctx.save();
  const grad = mctx.createRadialGradient(half, half, 2, half, half, half - 2);
  grad.addColorStop(0, 'rgba(34,211,238,0.02)');
  grad.addColorStop(1, 'rgba(34,211,238,0.12)');
  mctx.fillStyle = grad;
  mctx.fillRect(0, 0, mw, mh);
  mctx.translate(half, half);
  mctx.rotate(nextAngle);
  mctx.strokeStyle = 'rgba(45,212,191,0.9)';
  mctx.lineWidth = 1.4;
  mctx.beginPath();
  mctx.moveTo(0, 0);
  mctx.lineTo(0, -half + 3);
  mctx.stroke();
  mctx.fillStyle = 'rgba(45,212,191,0.10)';
  mctx.beginPath();
  mctx.moveTo(0, 0);
  mctx.arc(0, 0, half - 3, -0.38, 0);
  mctx.closePath();
  mctx.fill();
  mctx.restore();
  mctx.strokeStyle = 'rgba(148,163,184,0.35)';
  mctx.lineWidth = 0.7;
  mctx.beginPath();
  mctx.arc(half, half, half * 0.33, 0, Math.PI * 2);
  mctx.stroke();
  mctx.beginPath();
  mctx.arc(half, half, half * 0.66, 0, Math.PI * 2);
  mctx.stroke();

  mctx.fillStyle = '#ffffff';
  mctx.beginPath();
  mctx.arc(half, half, 3, 0, Math.PI * 2);
  mctx.fill();

  return nextAngle;
}
