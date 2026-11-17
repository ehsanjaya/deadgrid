import { CHUNK_SIZE, OBJECT_DEFS, TILE_SIZE } from './data';
import { CityBlueprintTile, CityData, ExpansionId, GameEntity, GridObject, ResourceNode, Vehicle } from './types';

export function hash2D(x: number, y: number, seed = 1337): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, seed = 1337): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2D(xi, yi, seed);
  const b = hash2D(xi + 1, yi, seed);
  const c = hash2D(xi, yi + 1, seed);
  const d = hash2D(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x: number, y: number, seed = 1337): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 3; i++) {
    val += amp * valueNoise(x * freq, y * freq, seed + i * 97);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

export interface WorldHost {
  seed: number;
  chunks: Map<string, string[]>;
  tileEdits: Map<string, string>;
  resources: Map<string, ResourceNode>;
  objects: Map<string, GridObject>;
  cities: CityData[];
  entities: GameEntity[];
  vehicles: Vehicle[];
  spawnPresident: (x: number, y: number, city: CityData) => void;
  spawnCityBuilder: (x: number, y: number, city: CityData, index: number) => void;
  spawnMerchant: (x: number, y: number, shopType: string, name: string, city: CityData) => void;
  spawnGuard: (x: number, y: number, role: string, city: CityData | null, protectingPresident?: boolean) => void;
  spawnVillager: (x: number, y: number, city: CityData | null, role?: string) => void;
  spawnZombie: (type: string, x: number, y: number, extra?: Partial<GameEntity>) => GameEntity;
  spawnAnimal: (type: string, x: number, y: number) => void;
  spawnHorse: (x: number, y: number, forcedVariant?: string | null) => void;
}

export function isWaterTile(tile: string): boolean {
  return tile === 'water' || tile === 'hole_water';
}

export function getBiomeAt(host: WorldHost, tx: number, ty: number): string {
  // Starter Cave Mining Cavern near (-20, -14) so Coal, Iron, and Golden Ores are easily discoverable!
  if (Math.hypot(tx + 20, ty + 14) < 7.5) return 'cave';
  if (Math.hypot(tx, ty) < 8) return 'plains';

  const elev = fbm(tx * 0.032, ty * 0.032, host.seed);
  const moist = fbm(tx * 0.036, ty * 0.036, host.seed + 555);
  const temp = fbm(tx * 0.028, ty * 0.028, host.seed + 333);
  const river = Math.abs(fbm(tx * 0.024, ty * 0.024, host.seed + 999) - 0.5);

  if (river < 0.036) return 'water';
  if (elev > 0.67) return 'cave';

  if (temp < 0.3) return moist > 0.46 ? 'taiga' : 'snow';
  if (temp > 0.66) {
    if (moist < 0.32) return 'desert';
    if (moist < 0.55) return 'savanna';
    return 'jungle';
  }
  if (moist > 0.68 && elev < 0.45) return 'swamp';
  if (moist > 0.53) return 'forest';
  return 'plains';
}

export function getTile(host: WorldHost, tx: number, ty: number): string {
  const key = `${tx},${ty}`;
  if (host.tileEdits.has(key)) return host.tileEdits.get(key)!;
  const cx = Math.floor(tx / CHUNK_SIZE);
  const cy = Math.floor(ty / CHUNK_SIZE);
  const chunk = ensureChunk(host, cx, cy);
  const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunk[ly * CHUNK_SIZE + lx];
}

export function setTile(host: WorldHost, tx: number, ty: number, tileType: string) {
  host.tileEdits.set(`${tx},${ty}`, tileType);
}

export function placeObject(
  host: WorldHost,
  tx: number,
  ty: number,
  type: string,
  isPlayerBuilt = true,
  initialItems: { id: string; count: number }[] | null = null,
  cityRef: CityData | null = null,
  bpZone?: CityBlueprintTile['zone']
): boolean {
  const def = OBJECT_DEFS[type];
  if (!def) return false;
  const key = `${tx},${ty}`;
  host.objects.set(key, {
    type,
    tx,
    ty,
    name: def.name,
    hp: def.maxHp,
    maxHp: def.maxHp,
    damaged: false,
    solid: def.solid,
    blocksLoS: def.blocksLoS,
    open: false,
    manualOpen: false,
    isOn: false,
    particleTimer: 0,
    isPlayerBuilt,
    cityRef,
    items: initialItems ? initialItems.map((it) => ({ ...it, level: 1 })) : new Array(12).fill(null),
    cooldown: 0,
    growth: type === 'crop_wheat' ? 0.35 : 1,
  });
  if (cityRef && bpZone && type !== 'crop_wheat') {
    if (!cityRef.blueprints) cityRef.blueprints = [];
    const existing = cityRef.blueprints.find((b) => b.tx === tx && b.ty === ty);
    if (existing) {
      existing.type = type;
      existing.zone = bpZone;
    } else {
      cityRef.blueprints.push({ tx, ty, type, zone: bpZone });
    }
  }
  return true;
}

export function isTileBlocked(host: WorldHost, tx: number, ty: number, ignoreDoorsOpen = true): boolean {
  const key = `${tx},${ty}`;
  if (host.resources.has(key)) {
    const res = host.resources.get(key)!;
    if (res.type !== 'tall_grass') return true;
  }
  if (host.objects.has(key)) {
    const obj = host.objects.get(key)!;
    if (obj.solid && !(ignoreDoorsOpen && obj.open)) return true;
  }
  return false;
}

export function clearAreaForPOI(host: WorldHost, cx: number, cy: number, rx: number, ry: number) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      host.resources.delete(`${x},${y}`);
      host.objects.delete(`${x},${y}`);
      if (getTile(host, x, y) === 'water') {
        setTile(host, x, y, 'grass_0');
      }
    }
  }
}

export function ensureChunk(host: WorldHost, cx: number, cy: number): string[] {
  const cKey = `${cx},${cy}`;
  if (host.chunks.has(cKey)) return host.chunks.get(cKey)!;

  const tiles = new Array<string>(CHUNK_SIZE * CHUNK_SIZE);
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const tx = cx * CHUNK_SIZE + lx;
      const ty = cy * CHUNK_SIZE + ly;
      const biome = getBiomeAt(host, tx, ty);
      let tile = 'grass_0';

      if (biome === 'water') tile = 'water';
      else if (biome === 'desert') tile = 'sand';
      else if (biome === 'cave') tile = 'cave_floor';
      else if (biome === 'forest') tile = 'forest';
      else if (biome === 'jungle') tile = 'jungle';
      else if (biome === 'taiga') tile = 'taiga';
      else if (biome === 'savanna') tile = 'savanna';
      else if (biome === 'snow') tile = 'snow';
      else if (biome === 'swamp') tile = hash2D(tx, ty, host.seed + 77) < 0.22 ? 'water' : 'swamp';
      else tile = 'grass_' + Math.floor(hash2D(tx, ty, host.seed) * 4);

      tiles[ly * CHUNK_SIZE + lx] = tile;

      if (Math.hypot(tx, ty) > 4 && tile !== 'water') {
        const r = hash2D(tx * 3, ty * 7, host.seed + 42);
        const scale = +(0.78 + hash2D(tx * 11, ty * 13, host.seed + 91) * 0.62).toFixed(2);
        const rKey = `${tx},${ty}`;

        if (biome === 'forest') {
          if (r < 0.14) host.resources.set(rKey, { type: 'tree', name: 'Oak Tree', tx, ty, hp: 60, maxHp: 60, scale, damaged: false });
          else if (r < 0.18) host.resources.set(rKey, { type: 'berry_bush', name: 'Berry Bush', tx, ty, hp: 20, maxHp: 20, scale: 1, damaged: false });
          else if (r < 0.28) host.resources.set(rKey, { type: 'tall_grass', name: 'Tall Grass', tx, ty, hp: 8, maxHp: 8, scale: 1, damaged: false });
        } else if (biome === 'jungle') {
          if (r < 0.17) host.resources.set(rKey, { type: 'jungle_tree', name: 'Jungle Tree', tx, ty, hp: 75, maxHp: 75, scale: scale * 1.08, damaged: false });
          else if (r < 0.22) host.resources.set(rKey, { type: 'melon_patch', name: 'Melon Patch', tx, ty, hp: 22, maxHp: 22, scale: 1, damaged: false });
        } else if (biome === 'taiga') {
          if (r < 0.15) host.resources.set(rKey, { type: 'pine_tree', name: 'Pine Tree', tx, ty, hp: 65, maxHp: 65, scale, damaged: false });
          else if (r < 0.20) host.resources.set(rKey, { type: 'rock', name: 'Stone Boulder', tx, ty, hp: 70, maxHp: 70, scale: 1, damaged: false });
        } else if (biome === 'savanna') {
          if (r < 0.06) host.resources.set(rKey, { type: 'acacia_tree', name: 'Acacia Tree', tx, ty, hp: 55, maxHp: 55, scale, damaged: false });
          else if (r < 0.09) host.resources.set(rKey, { type: 'rock', name: 'Stone Boulder', tx, ty, hp: 70, maxHp: 70, scale: 1, damaged: false });
        } else if (biome === 'snow') {
          if (r < 0.06) host.resources.set(rKey, { type: 'snow_pine', name: 'Frost Pine', tx, ty, hp: 65, maxHp: 65, scale, damaged: false });
          else if (r < 0.09) host.resources.set(rKey, { type: 'rock', name: 'Frost Boulder', tx, ty, hp: 75, maxHp: 75, scale: 1, damaged: false });
        } else if (biome === 'swamp') {
          if (r < 0.09) host.resources.set(rKey, { type: 'swamp_tree', name: 'Willow Tree', tx, ty, hp: 55, maxHp: 55, scale, damaged: false });
        } else if (biome === 'plains') {
          if (r < 0.05) host.resources.set(rKey, { type: 'tree', name: 'Oak Tree', tx, ty, hp: 60, maxHp: 60, scale, damaged: false });
          else if (r < 0.07) host.resources.set(rKey, { type: 'rock', name: 'Stone Boulder', tx, ty, hp: 70, maxHp: 70, scale: 1, damaged: false });
          else if (r < 0.22) host.resources.set(rKey, { type: 'tall_grass', name: 'Tall Grass', tx, ty, hp: 8, maxHp: 8, scale: 1, damaged: false });
        } else if (biome === 'cave') {
          const dStarter = Math.hypot(tx + 20, ty + 14);
          // Ring the starter cave with stone cave wall blocks, leaving wide south/east entrances
          const isStarterRim = dStarter >= 6.4 && dStarter < 7.5 && !(tx >= -21 && tx <= -19 && ty > -14) && !(ty >= -15 && ty <= -13 && tx > -20);
          if (isStarterRim || (dStarter >= 8 && r > 0.945)) {
            placeObject(host, tx, ty, 'stone_wall', false);
          } else if (r < 0.08) {
            host.resources.set(rKey, { type: 'rock', name: 'Cavern Boulder', tx, ty, hp: 75, maxHp: 75, scale: 1, damaged: false });
          } else if (r < 0.17) {
            host.resources.set(rKey, { type: 'coal_ore', name: 'Cave Coal Ore', tx, ty, hp: 80, maxHp: 80, scale: 1, damaged: false });
          } else if (r < 0.25) {
            host.resources.set(rKey, { type: 'iron_ore', name: 'Cave Iron Ore', tx, ty, hp: 100, maxHp: 100, scale: 1, damaged: false });
          } else if (r < 0.31) {
            host.resources.set(rKey, { type: 'gold_ore', name: 'Cave Golden Ore', tx, ty, hp: 130, maxHp: 130, scale: 1, damaged: false });
          } else if (r > 0.96) {
            placeObject(host, tx, ty, 'torch', false);
          }
        } else if (biome === 'desert') {
          if (r < 0.05) host.resources.set(rKey, { type: 'cactus', name: 'Desert Cactus', tx, ty, hp: 30, maxHp: 30, scale: 1, damaged: false });
        }
      } else if (tile === 'water') {
        if (hash2D(tx, ty, host.seed + 808) < 0.045) {
          host.spawnAnimal('fish', tx * TILE_SIZE + 16, ty * TILE_SIZE + 16);
        }
      }
    }
  }

  host.chunks.set(cKey, tiles);

  const poiRoll = hash2D(cx, cy, host.seed + 7777);
  if (cx === 1 && cy === 0) {
    generateLargeCity(host, cx * CHUNK_SIZE + 12, cy * CHUNK_SIZE + 10, false);
  } else if (Math.abs(cx) >= 5 && Math.abs(cy) >= 5 && poiRoll < 0.04) {
    generateLargeCity(host, cx * CHUNK_SIZE + 12, cy * CHUNK_SIZE + 10, true);
  } else if (Math.abs(cx) + Math.abs(cy) >= 2 && poiRoll > 0.89) {
    generateAbandonedHouse(host, cx * CHUNK_SIZE + 7, cy * CHUNK_SIZE + 7);
  }

  populateChunkEntities(host, cx, cy);
  return tiles;
}

// ----------------------------------------------------------------------------
// ROADSIDE CONNECTOR: Connects from the city's Large Road straight to each House/Building!
// ----------------------------------------------------------------------------
export function connectRoadsideToBuilding(host: WorldHost, city: CityData, doorTx: number, doorTy: number) {
  const cx = city.tx;
  const cy = city.ty;

  // Choose closest large avenue axis (horizontal cy or vertical cx)
  const distToHoriz = Math.abs(doorTy - cy);
  const distToVert = Math.abs(doorTx - cx);

  const layRoadTile = (tx: number, ty: number) => {
    const existingObj = host.objects.get(`${tx},${ty}`);
    if (existingObj && (existingObj.type === 'door' || existingObj.type === 'iron_door' || existingObj.type === 'white_wall' || existingObj.type === 'stone_wall' || existingObj.type === 'wood_wall')) {
      return;
    }
    host.resources.delete(`${tx},${ty}`);
    if (existingObj && !existingObj.solid) {
      // keep non-solid lights if any, otherwise replace
    }
    const cur = getTile(host, tx, ty);
    if (isWaterTile(cur)) {
      setTile(host, tx, ty, 'planks');
    } else if (cur !== 'city_floor' && cur !== 'white_floor' && cur !== 'gold_floor' && cur !== 'mall_floor' && cur !== 'hotel_carpet' && cur !== 'planks') {
      setTile(host, tx, ty, 'road');
    }

    // Add neat sidewalk shoulders along the roadside
    const neighbors = [
      [tx + 1, ty],
      [tx - 1, ty],
      [tx, ty + 1],
      [tx, ty - 1],
    ];
    for (const [nx, ny] of neighbors) {
      const nt = getTile(host, nx, ny);
      if (
        nt !== 'road' &&
        nt !== 'city_floor' &&
        nt !== 'white_floor' &&
        nt !== 'gold_floor' &&
        nt !== 'mall_floor' &&
        nt !== 'hotel_carpet' &&
        nt !== 'planks' &&
        nt !== 'helipad' &&
        !isWaterTile(nt) &&
        !host.objects.has(`${nx},${ny}`)
      ) {
        setTile(host, nx, ny, 'sidewalk');
      }
    }
  };

  let curX = doorTx;
  let curY = doorTy;

  // Step 1 tile outside the door first so we don't overwrite interior floor
  if (distToHoriz <= distToVert) {
    // Move vertically toward cy, then horizontally if needed
    const stepY = curY < cy ? 1 : -1;
    while (Math.abs(curY - cy) > 1) {
      curY += stepY;
      layRoadTile(curX, curY);
    }
    const stepX = curX < cx ? 1 : -1;
    while (Math.abs(curX - cx) > 1) {
      curX += stepX;
      layRoadTile(curX, curY);
    }
  } else {
    // Move horizontally toward cx, then vertically if needed
    const stepX = curX < cx ? 1 : -1;
    while (Math.abs(curX - cx) > 1) {
      curX += stepX;
      layRoadTile(curX, curY);
    }
    const stepY = curY < cy ? 1 : -1;
    while (Math.abs(curY - cy) > 1) {
      curY += stepY;
      layRoadTile(curX, curY);
    }
  }

  // Place a street lantern near the building's new roadside entrance
  const lampX = doorTx + (doorTx >= cx ? 1 : -1);
  const lampY = doorTy + (doorTy >= cy ? 1 : -1);
  if (!isWaterTile(getTile(host, lampX, lampY)) && !host.objects.has(`${lampX},${lampY}`)) {
    placeObject(host, lampX, lampY, 'lantern', false);
  }
}

export function spawnVehicle(
  host: WorldHost,
  kind: 'car' | 'jeep' | 'helicopter',
  x: number,
  y: number,
  cityRef: CityData | null,
  idx = 0
): Vehicle {
  const carPalette = [
    { name: 'City Sedan', color: '#dc2626', accent: '#fca5a5' },
    { name: 'Metro Taxi Cab', color: '#facc15', accent: '#1e293b' },
    { name: 'Police Cruiser', color: '#1e3a8a', accent: '#f8fafc' },
    { name: 'Civic Hatchback', color: '#0284c7', accent: '#bae6fd' },
  ];

  let name = 'Vehicle';
  let color = '#4d7c0f';
  let accent = '#a3e635';
  let maxHp = 220;
  let armor = 12;
  let maxSpeed = 270;
  let radius = 17;
  let hasGuns = false;

  if (kind === 'car') {
    const p = carPalette[idx % carPalette.length];
    name = p.name;
    color = p.color;
    accent = p.accent;
    maxHp = 220;
    armor = 10;
    maxSpeed = 290;
    radius = 16;
  } else if (kind === 'jeep') {
    name = idx % 2 === 0 ? `Military Jeep #${idx + 1}` : `FBI Tactical Jeep #${idx + 1}`;
    color = idx % 2 === 0 ? '#3f6212' : '#1e293b';
    accent = idx % 2 === 0 ? '#bef264' : '#38bdf8';
    maxHp = 360;
    armor = 26;
    maxSpeed = 305;
    radius = 17;
  } else if (kind === 'helicopter') {
    name = `Armored Gunship Chopper #${idx + 1}`;
    color = '#334155';
    accent = '#facc15';
    maxHp = 680;
    armor = 45;
    maxSpeed = 345;
    radius = 22;
    hasGuns = true;
  }

  const v: Vehicle = {
    id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name,
    color,
    accentColor: accent,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius,
    hp: maxHp,
    maxHp,
    armor,
    maxSpeed,
    altitude: 0,
    rotorAngle: Math.random() * Math.PI * 2,
    hasGuns,
    fireCooldown: 0,
    driver: 'none',
    driverEntity: null,
    cityRef,
    patrolAngle: (Math.PI * 2 * idx) / 5,
    patrolCenterX: cityRef ? cityRef.x : x,
    patrolCenterY: cityRef ? cityRef.y : y,
    headlightsOn: true,
    hurtFlash: 0,
    fuel: 100,
    maxFuel: 100,
    refueling: false,
    crashCooldown: 0,
  };
  host.vehicles.push(v);
  return v;
}

export function generateLargeCity(host: WorldHost, cx: number, cy: number, isFarCity = false): CityData | null {
  for (const c of host.cities) {
    if (Math.hypot(c.tx - cx, c.ty - cy) < 52) return null;
  }

  const names = isFarCity
    ? ['Oakridge Far City', 'Westgate Frontier City', 'Silvercrest Far City', 'Ironhold Horizon City']
    : ['New Haven Metropolis', 'Liberty Capital City', 'Emerald Grand City', 'Federal Harbor City'];

  const cityName = names[host.cities.length % names.length];
  const city: CityData = {
    name: cityName,
    isFarCity,
    tx: cx,
    ty: cy,
    x: cx * TILE_SIZE,
    y: cy * TILE_SIZE,
    radius: 28 * TILE_SIZE,
    alertActive: false,
    defenseCooldown: 0,
    surrendered: false,
    flagColor: '#2563eb',
    whiteHouseOfficeX: (cx + 20.5) * TILE_SIZE,
    whiteHouseOfficeY: (cy - 16.5) * TILE_SIZE,
    whiteHouseCompKey: `${cx + 20},${cy - 18}`,
    militaryBaseX: (cx - 30) * TILE_SIZE,
    militaryBaseY: (cy + 19) * TILE_SIZE,
    militaryCampX: (cx - 22) * TILE_SIZE,
    militaryCampY: (cy + 9) * TILE_SIZE,
    repairCooldown: 0,
    presidentCash: 320,
    gasStationBroken: false,
    presidentOrder: '🛡️ City Defenses Ready',
    blueprints: [],
    expansionsBuilt: {
      house_north: false,
      house_south: false,
      shop_west: false,
      office_jobs: false,
      grand_mall: false,
      luxury_hotel: false,
      farmland_zone: false,
      military_camp: false,
    },
  };
  host.cities.push(city);

  clearAreaForPOI(host, cx, cy, 24, 22);

  // Canal River
  for (let y = cy - 18; y <= cy + 18; y++) {
    for (let x = cx - 14; x <= cx - 12; x++) {
      setTile(host, x, y, 'water');
    }
    setTile(host, cx - 15, y, 'sidewalk');
    setTile(host, cx - 11, y, 'sidewalk');
  }
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 14; x <= cx - 12; x++) {
      setTile(host, x, y, 'planks');
    }
  }

  // Large Main Avenue Roads & Sidewalks (extended west to meet the 5-wide Military Base road!)
  for (let x = cx - 38; x <= cx + 24; x++) {
    if (x >= cx - 14 && x <= cx - 12) continue;
    setTile(host, x, cy - 2, 'sidewalk');
    setTile(host, x, cy - 1, 'road');
    setTile(host, x, cy, 'road');
    setTile(host, x, cy + 1, 'road');
    setTile(host, x, cy + 2, 'sidewalk');
  }
  for (let y = cy - 32; y <= cy + 22; y++) {
    setTile(host, cx - 2, y, 'sidewalk');
    setTile(host, cx - 1, y, 'road');
    setTile(host, cx, y, 'road');
    setTile(host, cx + 1, y, 'road');
    setTile(host, cx + 2, y, 'sidewalk');
  }

  // Spawn Civilian Cars parked along the large main avenues!
  const carSpots = [
    { x: (cx - 6) * TILE_SIZE, y: (cy - 0.5) * TILE_SIZE },
    { x: (cx + 7) * TILE_SIZE, y: (cy + 0.5) * TILE_SIZE },
    { x: (cx + 0.5) * TILE_SIZE, y: (cy + 8) * TILE_SIZE },
    { x: (cx - 0.5) * TILE_SIZE, y: (cy - 8) * TILE_SIZE },
    { x: (cx + 16) * TILE_SIZE, y: (cy - 0.5) * TILE_SIZE },
  ];
  carSpots.forEach((spot, idx) => {
    spawnVehicle(host, 'car', spot.x, spot.y, city, idx);
  });

  for (let offset = -18; offset <= 18; offset += 4) {
    if (Math.abs(offset) <= 3) continue;
    const roadTreeX = cx + offset;
    if (roadTreeX < cx - 15 || roadTreeX > cx - 10) {
      const treeScale = +(0.88 + hash2D(roadTreeX, cy, 44) * 0.36).toFixed(2);
      host.resources.set(`${roadTreeX},${cy - 3}`, { type: 'tree', name: 'Boulevard Tree', tx: roadTreeX, ty: cy - 3, hp: 65, maxHp: 65, scale: treeScale, damaged: false });
      placeObject(host, roadTreeX + 1, cy + 3, 'lantern', false);
    }
  }

  // Central City Plaza
  for (let y = cy - 4; y <= cy + 4; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      setTile(host, x, y, 'sidewalk');
    }
  }
  placeObject(host, cx, cy, 'statue_villager', false);
  placeObject(host, cx - 3, cy - 3, 'city_flag', false, null, city);
  placeObject(host, cx + 3, cy - 3, 'city_flag', false, null, city);
  placeObject(host, cx - 3, cy + 3, 'lantern', false);
  placeObject(host, cx + 3, cy + 3, 'lantern', false);

  // Upgraded Rich & Large 21x18 White House + Gold Converter Shop + Armory
  connectRoadsideToBuilding(host, city, cx + 13, cy - 4);
  buildWhiteHouse(host, cx + 3, cy - 21, cx + 23, cy - 4, city);

  buildGoldConverterShop(host, cx + 4, cy + 5, cx + 14, cy + 13, city);
  connectRoadsideToBuilding(host, city, Math.floor((cx + 4 + cx + 14) / 2), cy + 5);

  // Armory / Crafting Forge
  for (let y = cy - 14; y <= cy - 6; y++) {
    for (let x = cx - 9; x <= cx - 3; x++) {
      setTile(host, x, y, 'stone');
      const border = x === cx - 9 || x === cx - 3 || y === cy - 14 || y === cy - 6;
      if (border) {
        if (x === cx - 6 && y === cy - 6) placeObject(host, x, y, 'door', false, null, city, 'city');
        else placeObject(host, x, y, 'stone_wall', false, null, city, 'city');
      }
    }
  }
  connectRoadsideToBuilding(host, city, cx - 6, cy - 6);
  placeObject(host, cx - 8, cy - 13, 'anvil', false, null, city, 'city');
  placeObject(host, cx - 7, cy - 13, 'workbench', false, null, city, 'city');
  placeObject(host, cx - 4, cy - 13, 'chest', false, [
    { id: 'rifle', count: 1 },
    { id: 'ammo_heavy', count: 60 },
    { id: 'grenade', count: 5 },
    { id: 'vest_kevlar', count: 1 },
  ], city, 'city');
  placeObject(host, cx - 8, cy - 8, 'bed', false, null, city, 'city');
  placeObject(host, cx - 4, cy - 8, 'old_tv', false, null, city, 'city');

  // BIGGER CITY FARMLAND & FARMHOUSE WITH HAYBALES & ANIMALS (East of Gold Converter Shop!)
  buildCityFarmland(host, cx + 15, cy + 3, cx + 30, cy + 14, city);

  // CITY GAS STATION, WALLED GAS MAN SHOP + DOOR & MECHANIC GARAGE BAY (North-East Boulevard!)
  buildCityGasStation(host, cx + 4, cy - 31, cx + 13, cy - 23, city);

  // BUILD FULL MILITARY BASE WITH 5-WIDE ROAD, AUTO IRON DOORS, RADAR, 15 HELICOPTERS, 40 JEEPS, CAMP & 30 FBI!
  buildMilitaryBase(host, cx - 50, cy + 5, cx - 17, cy + 35, city);

  // Spawn President inside the Luxurious White House Oval Office
  host.spawnPresident(city.whiteHouseOfficeX, city.whiteHouseOfficeY, city);

  // Spawn 6 Guards & FBI Dedicated to Protecting the President (3 Secret Service FBI + 3 White House Guards)!
  const presBodyguards: [number, number, 'fbi' | 'guard'][] = [
    [cx + 18.5, cy - 16.5, 'fbi'],
    [cx + 21.5, cy - 16.5, 'fbi'],
    [cx + 18.5, cy - 12.0, 'fbi'],
    [cx + 11.5, cy - 13.0, 'guard'],
    [cx + 11.5, cy - 5.2, 'guard'],
    [cx + 14.5, cy - 5.2, 'guard'],
  ];
  for (const [bx, by, role] of presBodyguards) {
    host.spawnGuard(bx * TILE_SIZE, by * TILE_SIZE, role, city, true);
  }

  // Spawn 15 Autonomous City Builders in the City!
  for (let b = 0; b < 15; b++) {
    const bx = (cx + ((b % 5) - 2) * 1.4) * TILE_SIZE;
    const by = (cy + 3 + Math.floor(b / 5) * 1.2) * TILE_SIZE;
    host.spawnCityBuilder(bx, by, city, b);
  }

  // Spawn Armored FBI Agents & City Guards
  for (let i = 0; i < 16; i++) {
    const gx = (cx + ((i % 4) - 1.5) * 6) * TILE_SIZE;
    const gy = (cy + (Math.floor(i / 4) - 1.5) * 6) * TILE_SIZE;
    if (!isWaterTile(getTile(host, Math.floor(gx / TILE_SIZE), Math.floor(gy / TILE_SIZE)))) {
      host.spawnGuard(gx, gy, i % 2 === 0 ? 'fbi' : 'guard', city);
    }
  }

  // Spawn Citizens
  for (let i = 0; i < 48; i++) {
    const vx = (cx + (hash2D(i, cx, 91) - 0.5) * 30) * TILE_SIZE;
    const vy = (cy + (hash2D(cy, i, 73) - 0.5) * 26) * TILE_SIZE;
    const vtx = Math.floor(vx / TILE_SIZE);
    const vty = Math.floor(vy / TILE_SIZE);
    if (!isWaterTile(getTile(host, vtx, vty)) && !isTileBlocked(host, vtx, vty, false)) {
      host.spawnVillager(vx, vy, city);
    }
  }

  return city;
}

function buildMilitaryBase(host: WorldHost, x1: number, y1: number, x2: number, y2: number, city: CityData) {
  const gateMidX = Math.floor((x1 + x2) / 2); // cx - 34
  const gateMidY = Math.floor((y1 + y2) / 2); // cy + 20

  clearAreaForPOI(host, gateMidX, gateMidY, 19, 17);

  city.militaryBaseX = gateMidX * TILE_SIZE;
  city.militaryBaseY = gateMidY * TILE_SIZE;
  city.militaryGateX = (gateMidX + 0.5) * TILE_SIZE;
  city.militaryGateY = (y1 + 0.5) * TILE_SIZE;
  city.militaryBounds = {
    x1: (x1 + 1) * TILE_SIZE,
    y1: (y1 + 1) * TILE_SIZE,
    x2: x2 * TILE_SIZE,
    y2: y2 * TILE_SIZE,
  };

  // Base floor, perimeter walls, and 5-wide Auto Iron Door Gates (North & East)
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const inVert5WideRoad = x >= gateMidX - 2 && x <= gateMidX + 2 && y <= y2 - 2;
      const inHoriz5WideRoad = y >= gateMidY - 2 && y <= gateMidY + 2 && x >= x1 + 1;
      setTile(host, x, y, inVert5WideRoad || inHoriz5WideRoad ? 'road' : 'military_pad');

      const isOuter = x === x1 || x === x2 || y === y1 || y === y2;
      if (isOuter) {
        const isNorthGate = y === y1 && x >= gateMidX - 2 && x <= gateMidX + 2;
        const isEastGate = x === x2 && y >= gateMidY - 2 && y <= gateMidY + 2;
        if (isNorthGate || isEastGate) {
          placeObject(host, x, y, 'iron_door', false, null, city, 'military_base');
        } else {
          placeObject(host, x, y, 'stone_wall', false, null, city, 'military_base');
        }
      }
    }
  }

  // 5-Wide Military Road outside North Gate connecting straight into City West Avenue (y = cy - 1 .. cy + 1)
  for (let y = city.ty + 2; y <= y1 - 1; y++) {
    for (let x = gateMidX - 2; x <= gateMidX + 2; x++) {
      host.resources.delete(`${x},${y}`);
      host.objects.delete(`${x},${y}`);
      setTile(host, x, y, 'road');
    }
    if (!host.objects.has(`${gateMidX - 3},${y}`)) setTile(host, gateMidX - 3, y, 'sidewalk');
    if (!host.objects.has(`${gateMidX + 3},${y}`)) setTile(host, gateMidX + 3, y, 'sidewalk');
    if (y % 2 === 0) {
      placeObject(host, gateMidX - 3, y, 'lantern', false, null, city, 'military_base');
      placeObject(host, gateMidX + 3, y, 'lantern', false, null, city, 'military_base');
    }
  }

  // 5-Wide Military Road outside East Gate connecting straight into City South Main Avenue (x = cx - 2)
  for (let x = x2 + 1; x <= city.tx - 2; x++) {
    for (let y = gateMidY - 2; y <= gateMidY + 2; y++) {
      host.resources.delete(`${x},${y}`);
      host.objects.delete(`${x},${y}`);
      const cur = getTile(host, x, y);
      setTile(host, x, y, isWaterTile(cur) ? 'planks' : 'road');
    }
    if (!isWaterTile(getTile(host, x, gateMidY - 3))) setTile(host, x, gateMidY - 3, 'sidewalk');
    if (!isWaterTile(getTile(host, x, gateMidY + 3))) setTile(host, x, gateMidY + 3, 'sidewalk');
    if (x % 4 === 0 && !host.objects.has(`${x},${gateMidY - 3}`)) {
      placeObject(host, x, gateMidY - 3, 'lantern', false, null, city, 'military_base');
    }
  }

  // Corner Auto-Turrets, Lanterns & Military Base Flags flanking the 5-Wide Gates!
  placeObject(host, x1 + 1, y1 + 1, 'turret', false, null, city, 'military_base');
  placeObject(host, x2 - 1, y1 + 1, 'turret', false, null, city, 'military_base');
  placeObject(host, x1 + 1, y2 - 1, 'turret', false, null, city, 'military_base');
  placeObject(host, x2 - 1, y2 - 1, 'turret', false, null, city, 'military_base');
  placeObject(host, gateMidX - 4, y1 + 1, 'turret', false, null, city, 'military_base');
  placeObject(host, gateMidX + 4, y1 + 1, 'turret', false, null, city, 'military_base');
  placeObject(host, gateMidX - 3, y1 + 1, 'military_flag', false, null, city, 'military_base');
  placeObject(host, gateMidX + 3, y1 + 1, 'military_flag', false, null, city, 'military_base');
  placeObject(host, x2 - 1, gateMidY - 3, 'military_flag', false, null, city, 'military_base');
  placeObject(host, x2 - 1, gateMidY + 3, 'lantern', false, null, city, 'military_base');

  // Command Center w/ RADAR, ComputerOS & Supply Crates (Top-Left of Base)
  city.militaryRadarTx = gateMidX - 4;
  city.militaryRadarTy = y1 + 2;
  city.radarAlertActive = false;
  city.radarZombieCount = 0;
  placeObject(host, gateMidX - 4, y1 + 2, 'military_radar', false, null, city, 'military_base');
  placeObject(host, x1 + 2, y1 + 2, 'old_computer', false, null, city, 'military_base');
  placeObject(host, x1 + 3, y1 + 2, 'seat', false, null, city, 'military_base');
  placeObject(host, x1 + 5, y1 + 2, 'chest', false, [
    { id: 'rifle', count: 1 },
    { id: 'shotgun', count: 1 },
    { id: 'ammo_heavy', count: 120 },
    { id: 'grenade', count: 8 },
  ], city, 'military_base');

  // MILITARY CAMP ZONE (North-East Wing of Base: Tents, Campfire, Food Tables, Fridge, Beds & Flag)
  const campX = x2 - 9;
  const campY = y1 + 2;
  city.militaryCampX = (campX + 3.5) * TILE_SIZE;
  city.militaryCampY = (campY + 3) * TILE_SIZE;
  for (let cyOff = 0; cyOff < 6; cyOff++) {
    for (let cxOff = 0; cxOff < 8; cxOff++) {
      setTile(host, campX + cxOff, campY + cyOff, 'planks');
    }
  }
  placeObject(host, campX, campY, 'military_tent', false, null, city, 'military_base');
  placeObject(host, campX + 2, campY, 'military_tent', false, null, city, 'military_base');
  placeObject(host, campX + 4, campY, 'military_tent', false, null, city, 'military_base');
  placeObject(host, campX + 6, campY, 'military_flag', false, null, city, 'military_base');
  placeObject(host, campX + 1, campY + 2, 'bed', false, null, city, 'military_base');
  placeObject(host, campX + 2, campY + 2, 'bed', false, null, city, 'military_base');
  placeObject(host, campX + 3, campY + 2, 'campfire', false, null, city, 'military_base');
  placeObject(host, campX + 4, campY + 2, 'table', false, [
    { id: 'cooked_meat', count: 6 },
    { id: 'energy_drink', count: 4 },
  ], city, 'military_base');
  placeObject(host, campX + 5, campY + 2, 'fridge', false, [
    { id: 'cooked_meat', count: 8 },
    { id: 'cooked_fish', count: 6 },
    { id: 'energy_drink', count: 5 },
    { id: 'medkit', count: 3 },
  ], city, 'military_base');
  placeObject(host, campX + 1, campY + 4, 'seat', false, null, city, 'military_base');
  placeObject(host, campX + 3, campY + 4, 'seat', false, null, city, 'military_base');
  placeObject(host, campX + 6, campY + 4, 'lantern', false, null, city, 'military_base');

  // 15 Helipads + 15 Flying Armored Gunship Helicopters (Left Wing: 9 North-West + 6 South-West, clear of 5-wide roads!)
  for (let h = 0; h < 15; h++) {
    const col = h % 3;
    const row = Math.floor(h / 3);
    const hx = x1 + 2 + col * 4;
    const hy = row < 3 ? y1 + 4 + row * 3 : y1 + 19 + (row - 3) * 4;
    setTile(host, hx, hy, 'helipad');
    setTile(host, hx + 1, hy, 'helipad');
    spawnVehicle(host, 'helicopter', (hx + 0.5) * TILE_SIZE, (hy + 0.5) * TILE_SIZE, city, h);
  }

  // 40 Ridable Jeeps for Military, FBI, or Player (Right Wing Motor Pool: 8 cols x 5 rows)
  for (let j = 0; j < 40; j++) {
    const col = j % 8;
    const row = Math.floor(j / 8);
    const jx = (gateMidX + 4 + col * 1.65) * TILE_SIZE;
    const jy = (y1 + 19.2 + row * 2.2) * TILE_SIZE;
    spawnVehicle(host, 'jeep', jx, jy, city, j);
  }

  // 30 FBI AGENTS SECURING INSIDE THE MILITARY BASE (Gates, Camp, Airfield, Motor Pool & Perimeter)
  const fbiPosts: [number, number][] = [
    // 6 FBI guarding the 5-wide North & East Auto Iron Doors
    [gateMidX - 2, y1 + 2],
    [gateMidX, y1 + 2],
    [gateMidX + 2, y1 + 2],
    [x2 - 2, gateMidY - 2],
    [x2 - 2, gateMidY],
    [x2 - 2, gateMidY + 2],
    // 8 FBI securing Military Camp & Command Center
    [campX + 1, campY + 5],
    [campX + 3, campY + 5],
    [campX + 5, campY + 5],
    [campX + 7, campY + 3],
    [campX + 2, campY + 3],
    [x1 + 4, y1 + 2],
    [x1 + 7, y1 + 2],
    [x1 + 10, y1 + 2],
    // 8 FBI securing Left-Wing 15-Helicopter Airfield
    [x1 + 3, y1 + 6],
    [x1 + 7, y1 + 6],
    [x1 + 11, y1 + 9],
    [x1 + 3, y1 + 12],
    [x1 + 5, y1 + 18],
    [x1 + 9, y1 + 18],
    [x1 + 4, y2 - 3],
    [x1 + 10, y2 - 3],
    // 8 FBI securing Right-Wing 40-Jeep Motor Pool & Central 5-Wide Road
    [gateMidX - 1, gateMidY - 1],
    [gateMidX + 1, gateMidY + 1],
    [gateMidX + 4, y1 + 18],
    [gateMidX + 8, y1 + 18],
    [gateMidX + 12, y1 + 18],
    [gateMidX + 5, y2 - 2],
    [gateMidX + 10, y2 - 2],
    [x2 - 3, y2 - 2],
  ];
  for (const [fx, fy] of fbiPosts) {
    host.spawnGuard((fx + 0.5) * TILE_SIZE, (fy + 0.5) * TILE_SIZE, 'fbi', city);
  }
}

function buildWhiteHouse(host: WorldHost, x1: number, y1: number, x2: number, y2: number, city: CityData) {
  const midX = Math.floor((x1 + x2) / 2); // cx + 13
  const midY = Math.floor((y1 + y2) / 2); // cy - 13
  clearAreaForPOI(host, midX, midY, 12, 10);

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      host.resources.delete(`${x},${y}`);
      host.objects.delete(`${x},${y}`);
      const inOvalOffice = x >= midX + 5 && y <= y1 + 5;
      const inCenterCarpet = Math.abs(x - midX) <= 1 && y >= y1 + 2 && y <= y2;
      const inWestLoungeCarpet = x >= x1 + 1 && x <= midX - 5 && y >= y1 + 2 && y <= y2 - 4;
      const inEastVault = x >= midX + 5 && y >= y1 + 7 && y <= y1 + 11;
      const inGoldTrim =
        x === midX - 2 ||
        x === midX + 2 ||
        x === midX - 3 ||
        x === midX + 3 ||
        y === y1 + 1 ||
        y === y1 + 2 ||
        inEastVault;

      setTile(
        host,
        x,
        y,
        inOvalOffice || inCenterCarpet || inWestLoungeCarpet
          ? 'hotel_carpet'
          : inGoldTrim
            ? 'gold_floor'
            : 'white_floor'
      );

      const isOuter = x === x1 || x === x2 || y === y1 || y === y2;
      if (isOuter) {
        if (y === y2 && Math.abs(x - midX) <= 1) {
          placeObject(host, x, y, 'iron_door', false, null, city, 'white_house');
        } else if (y === y2 && (x === midX - 2 || x === midX + 2 || x === midX - 5 || x === midX + 5)) {
          placeObject(host, x, y, 'marble_pillar', false, null, city, 'white_house');
        } else {
          placeObject(host, x, y, 'white_wall', false, null, city, 'white_house');
        }
      }
    }
  }

  // Grand Ceremonial Portico, 24K Gold Runway, 4 Golden Eagles, Flags & Lanterns
  for (let x = midX - 1; x <= midX + 1; x++) {
    setTile(host, x, y2 + 1, 'hotel_carpet');
    setTile(host, x, y2 + 2, 'hotel_carpet');
  }
  setTile(host, midX - 2, y2 + 1, 'gold_floor');
  setTile(host, midX + 2, y2 + 1, 'gold_floor');
  setTile(host, midX - 3, y2 + 1, 'gold_floor');
  setTile(host, midX + 3, y2 + 1, 'gold_floor');
  placeObject(host, midX - 2, y2 + 1, 'gold_statue', false, null, city, 'white_house');
  placeObject(host, midX + 2, y2 + 1, 'gold_statue', false, null, city, 'white_house');
  placeObject(host, midX - 3, y2 + 1, 'marble_fountain', false, null, city, 'white_house');
  placeObject(host, midX + 3, y2 + 1, 'marble_fountain', false, null, city, 'white_house');
  placeObject(host, midX - 4, y2 + 1, 'city_flag', false, null, city, 'white_house');
  placeObject(host, midX + 4, y2 + 1, 'city_flag', false, null, city, 'white_house');
  placeObject(host, midX - 5, y2 + 1, 'lantern', false, null, city, 'white_house');
  placeObject(host, midX + 5, y2 + 1, 'lantern', false, null, city, 'white_house');

  // Interior Wing Divider Walls (midX - 4 & midX + 4) with Grand Double Doors
  for (let y = y1 + 1; y < y2; y++) {
    if (y === midY || y === midY + 1) placeObject(host, midX - 4, y, 'door', false, null, city, 'white_house');
    else placeObject(host, midX - 4, y, 'white_wall', false, null, city, 'white_house');

    if (y === midY || y === midY + 1) placeObject(host, midX + 4, y, 'door', false, null, city, 'white_house');
    else placeObject(host, midX + 4, y, 'white_wall', false, null, city, 'white_house');
  }

  // Grand 7-Wide Central Rotunda: Twin Marble Fountains, 4x 24K Golden Eagles, Pillars & Gold Chandeliers!
  placeObject(host, midX, y1 + 1, 'statue_villager', false, null, city, 'white_house');
  placeObject(host, midX - 3, y1 + 2, 'gold_statue', false, null, city, 'white_house');
  placeObject(host, midX + 3, y1 + 2, 'gold_statue', false, null, city, 'white_house');
  placeObject(host, midX, y1 + 3, 'gold_chandelier', false, null, city, 'white_house');
  placeObject(host, midX - 3, y1 + 5, 'marble_pillar', false, null, city, 'white_house');
  placeObject(host, midX + 3, y1 + 5, 'marble_pillar', false, null, city, 'white_house');
  placeObject(host, midX - 3, midY, 'marble_fountain', false, null, city, 'white_house');
  placeObject(host, midX + 3, midY, 'marble_fountain', false, null, city, 'white_house');
  placeObject(host, midX, midY, 'gold_chandelier', false, null, city, 'white_house');
  placeObject(host, midX - 3, y2 - 4, 'marble_pillar', false, null, city, 'white_house');
  placeObject(host, midX + 3, y2 - 4, 'marble_pillar', false, null, city, 'white_house');
  placeObject(host, midX, y2 - 3, 'gold_chandelier', false, null, city, 'white_house');
  placeObject(host, midX - 3, y2 - 2, 'gold_statue', false, null, city, 'white_house');
  placeObject(host, midX + 3, y2 - 2, 'gold_statue', false, null, city, 'white_house');

  // West Wing: Presidential Grand Piano Lounge, Large State Banquet Hall & Royal Kitchen
  placeObject(host, x1 + 1, y1 + 1, 'old_tv', false, null, city, 'white_house');
  placeObject(host, x1 + 2, y1 + 1, 'grand_piano', false, null, city, 'white_house');
  placeObject(host, x1 + 4, y1 + 1, 'gold_statue', false, null, city, 'white_house');
  placeObject(host, x1 + 3, y1 + 2, 'gold_chandelier', false, null, city, 'white_house');
  placeObject(host, x1 + 1, y1 + 3, 'luxury_sofa', false, null, city, 'white_house');
  placeObject(host, x1 + 2, y1 + 3, 'luxury_sofa', false, null, city, 'white_house');
  placeObject(host, x1 + 4, y1 + 4, 'marble_pillar', false, null, city, 'white_house');

  placeObject(host, x1 + 2, y1 + 7, 'table', false, [{ id: 'cooked_meat', count: 8 }], city, 'white_house');
  placeObject(host, x1 + 3, y1 + 7, 'table', false, [{ id: 'leftovers', count: 8 }], city, 'white_house');
  placeObject(host, x1 + 4, y1 + 7, 'table', false, [{ id: 'melon', count: 6 }], city, 'white_house');
  placeObject(host, x1 + 1, y1 + 7, 'seat', false, null, city, 'white_house');
  placeObject(host, x1 + 2, y1 + 8, 'seat', false, null, city, 'white_house');
  placeObject(host, x1 + 3, y1 + 8, 'seat', false, null, city, 'white_house');
  placeObject(host, x1 + 4, y1 + 8, 'seat', false, null, city, 'white_house');
  placeObject(host, x1 + 3, y1 + 10, 'gold_chandelier', false, null, city, 'white_house');
  placeObject(host, x1 + 1, y1 + 11, 'luxury_sofa', false, null, city, 'white_house');
  placeObject(host, x1 + 4, y1 + 11, 'gold_statue', false, null, city, 'white_house');

  placeObject(host, x1 + 1, y2 - 1, 'furnace', false, null, city, 'white_house');
  placeObject(host, x1 + 2, y2 - 1, 'fridge', false, [
    { id: 'cooked_meat', count: 12 },
    { id: 'cooked_fish', count: 10 },
    { id: 'leftovers', count: 12 },
    { id: 'melon', count: 10 },
    { id: 'energy_drink', count: 8 },
  ], city, 'white_house');
  placeObject(host, x1 + 3, y2 - 1, 'sink', false, null, city, 'white_house');
  placeObject(host, x1 + 4, y2 - 1, 'kitchen_counter', false, null, city, 'white_house');
  placeObject(host, x1 + 5, y2 - 1, 'fridge', false, [
    { id: 'cooked_meat', count: 8 },
    { id: 'energy_drink', count: 8 },
  ], city, 'white_house');

  // East Wing: Grand Oval Office, Iron-Door Gold Treasury Vault & 2x2 Heated Royal Spa Suite
  placeObject(host, x2 - 4, y1 + 1, 'gold_statue', false, null, city, 'white_house');
  placeObject(host, x2 - 3, y1 + 1, 'marble_pillar', false, null, city, 'white_house');
  placeObject(host, x2 - 2, y1 + 2, 'gold_chandelier', false, null, city, 'white_house');
  placeObject(host, x2 - 3, y1 + 3, 'old_computer', false, null, city, 'white_house');
  placeObject(host, x2 - 4, y1 + 3, 'seat', false, null, city, 'white_house');
  placeObject(host, x2 - 1, y1 + 1, 'bed', false, null, city, 'white_house');
  placeObject(host, x2 - 1, y1 + 3, 'bed', false, null, city, 'white_house');
  placeObject(host, x2 - 4, y1 + 5, 'luxury_sofa', false, null, city, 'white_house');

  placeObject(host, x2 - 4, y1 + 6, 'white_wall', false, null, city, 'white_house');
  placeObject(host, x2 - 3, y1 + 6, 'white_wall', false, null, city, 'white_house');
  placeObject(host, x2 - 2, y1 + 6, 'iron_door', false, null, city, 'white_house');
  placeObject(host, x2 - 1, y1 + 6, 'white_wall', false, null, city, 'white_house');

  placeObject(host, x2 - 1, y1 + 8, 'secret_locker', false, [
    { id: 'gold', count: 32 },
    { id: 'sniper', count: 1 },
    { id: 'vest_kevlar', count: 1 },
    { id: 'medkit', count: 4 },
  ], city, 'white_house');
  placeObject(host, x2 - 1, y1 + 9, 'secret_locker', false, [
    { id: 'gold', count: 24 },
    { id: 'ammo_heavy', count: 100 },
    { id: 'grenade', count: 8 },
    { id: 'helmet_iron', count: 1 },
  ], city, 'white_house');
  placeObject(host, x2 - 1, y1 + 10, 'secret_locker', false, [
    { id: 'gold', count: 20 },
    { id: 'rifle', count: 1 },
    { id: 'energy_drink', count: 6 },
    { id: 'medkit', count: 3 },
  ], city, 'white_house');
  placeObject(host, x2 - 3, y1 + 8, 'gold_chandelier', false, null, city, 'white_house');
  placeObject(host, x2 - 4, y1 + 8, 'luxury_sofa', false, null, city, 'white_house');
  placeObject(host, x2 - 4, y1 + 10, 'gold_statue', false, null, city, 'white_house');

  placeObject(host, x2 - 4, y2 - 2, 'royal_pool', false, null, city, 'white_house');
  placeObject(host, x2 - 3, y2 - 2, 'royal_pool', false, null, city, 'white_house');
  placeObject(host, x2 - 4, y2 - 1, 'royal_pool', false, null, city, 'white_house');
  placeObject(host, x2 - 3, y2 - 1, 'royal_pool', false, null, city, 'white_house');
  placeObject(host, x2 - 2, y2 - 2, 'luxury_sofa', false, null, city, 'white_house');
  placeObject(host, x2 - 2, y2 - 1, 'sink', false, null, city, 'white_house');
  placeObject(host, x2 - 1, y2 - 1, 'shower', false, null, city, 'white_house');
}

function buildGoldConverterShop(host: WorldHost, x1: number, y1: number, x2: number, y2: number, city: CityData) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      setTile(host, x, y, 'planks');
      const isOuter = x === x1 || x === x2 || y === y1 || y === y2;
      if (isOuter) {
        if (x === Math.floor((x1 + x2) / 2) && y === y1) placeObject(host, x, y, 'door', false, null, city, 'city');
        else placeObject(host, x, y, 'stone_wall', false, null, city, 'city');
      }
    }
  }
  placeObject(host, x1 + 2, y1 + 3, 'shop_counter', false, null, city, 'city');
  placeObject(host, x1 + 3, y1 + 3, 'shop_counter', false, null, city, 'city');
  placeObject(host, x1 + 4, y1 + 3, 'shop_counter', false, null, city, 'city');
  placeObject(host, x1 + 1, y1 + 1, 'lantern', false, null, city, 'city');
  placeObject(host, x2 - 1, y1 + 1, 'lantern', false, null, city, 'city');
  placeObject(host, x2 - 1, y2 - 1, 'chest', false, [
    { id: 'gold', count: 2 },
    { id: 'berries', count: 4 },
  ], city, 'city');

  host.spawnMerchant((x1 + 3.5) * TILE_SIZE, (y1 + 2) * TILE_SIZE, 'gold_converter', 'Gold & Cash Exchanger', city);
}

function buildCityFarmland(host: WorldHost, x1: number, y1: number, x2: number, y2: number, city: CityData) {
  const midX = Math.floor((x1 + x2) / 2);
  const midY = Math.floor((y1 + y2) / 2);
  clearAreaForPOI(host, midX, midY, Math.ceil((x2 - x1) / 2) + 1, Math.ceil((y2 - y1) / 2) + 1);

  // Split into Large Irrigated Wheat Fields (West) + Farmhouse Barn w/ Haybales & Animals (East)!
  const houseX1 = x2 - 5;
  const houseY1 = y1 + 1;
  const houseY2 = y2 - 1;
  const canalX = x1 + 5;

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      host.resources.delete(`${x},${y}`);
      host.objects.delete(`${x},${y}`);
      const inFarmhouse = x >= houseX1 && y >= houseY1 && y <= houseY2;
      if (inFarmhouse) {
        setTile(host, x, y, 'planks');
      } else if (x === canalX && y >= y1 + 1 && y <= y2 - 1) {
        setTile(host, x, y, 'water'); // Irrigation canal
      } else if (x >= x1 + 1 && x <= houseX1 - 2 && y >= y1 + 1 && y <= y2 - 1) {
        setTile(host, x, y, 'farmland');
        // Leave some soil plots open so Farmers actively plant & tend crops!
        if ((x + y) % 3 !== 0) {
          placeObject(host, x, y, 'crop_wheat', false);
          const crop = host.objects.get(`${x},${y}`);
          if (crop) crop.growth = 0.5 + ((x + y) % 4) * 0.14;
        }
      } else {
        setTile(host, x, y, 'grass_1');
      }
    }
  }

  // Farmhouse Walls & Doors (West Door to Crop Fields, South Wide Double Door for Livestock/Barn)
  const houseMidY = Math.floor((houseY1 + houseY2) / 2);
  const houseMidX = Math.floor((houseX1 + x2) / 2);
  for (let y = houseY1; y <= houseY2; y++) {
    for (let x = houseX1; x <= x2; x++) {
      const isBorder = x === houseX1 || x === x2 || y === houseY1 || y === houseY2;
      if (isBorder) {
        const isWestDoor = x === houseX1 && y === houseMidY;
        const isSouthBarnGate = y === houseY2 && (x === houseMidX || x === houseMidX + 1);
        if (isWestDoor) {
          placeObject(host, x, y, 'door', false, null, city, 'farmland');
        } else if (isSouthBarnGate) {
          placeObject(host, x, y, 'door', false, null, city, 'farmland');
          const doorObj = host.objects.get(`${x},${y}`);
          if (doorObj) {
            doorObj.open = true;
            doorObj.manualOpen = true;
          }
        } else {
          placeObject(host, x, y, 'wood_wall', false, null, city, 'farmland');
        }
      }
    }
  }

  // Inside Farmhouse: Haybales, Farm Storage Chests, Bed, Table, Furnace & Lanterns!
  placeObject(host, x2 - 1, houseY1 + 1, 'hay_bale', false, null, city, 'farmland');
  placeObject(host, x2 - 2, houseY1 + 1, 'hay_bale', false, null, city, 'farmland');
  placeObject(host, x2 - 1, houseY1 + 2, 'hay_bale', false, null, city, 'farmland');
  placeObject(host, houseX1 + 1, houseY1 + 1, 'chest', false, [
    { id: 'wheat', count: 14 },
    { id: 'seeds', count: 24 },
    { id: 'melon', count: 6 },
    { id: 'raw_meat', count: 4 },
  ], city, 'farmland');
  placeObject(host, houseX1 + 2, houseY1 + 1, 'chest', false, [
    { id: 'wheat', count: 10 },
    { id: 'seeds', count: 18 },
    { id: 'berries', count: 6 },
  ], city, 'farmland');
  placeObject(host, houseX1 + 1, houseY2 - 1, 'bed', false, null, city, 'farmland');
  placeObject(host, houseX1 + 2, houseY2 - 1, 'table', false, [{ id: 'wheat', count: 4 }], city, 'farmland');
  placeObject(host, x2 - 1, houseY2 - 1, 'furnace', false, null, city, 'farmland');
  placeObject(host, houseMidX, houseY1 + 3, 'lantern', false, null, city, 'farmland');

  // Crop Field Accents: Windmill, Scarecrows & Lanterns
  placeObject(host, x1 + 1, y1 + 1, 'windmill', false, null, city, 'farmland');
  placeObject(host, x1 + 2, y2 - 1, 'scarecrow', false, null, city, 'farmland');
  placeObject(host, houseX1 - 2, y1 + 1, 'scarecrow', false, null, city, 'farmland');
  placeObject(host, canalX, y1, 'lantern', false, null, city, 'farmland');
  placeObject(host, canalX, y2, 'lantern', false, null, city, 'farmland');

  city.farmlandBounds = {
    x1: (x1 + 1) * TILE_SIZE,
    y1: (y1 + 1) * TILE_SIZE,
    x2: (houseX1 - 2) * TILE_SIZE,
    y2: (y2 - 1) * TILE_SIZE,
    farmhouseX: (houseMidX + 0.5) * TILE_SIZE,
    farmhouseY: (houseMidY + 0.5) * TILE_SIZE,
    chestKey: `${houseX1 + 1},${houseY1 + 1}`,
  };

  // Connect City Farm & Farmhouse cleanly to the Main City Avenue
  connectRoadsideToBuilding(host, city, x1 + 4, y1);

  // Spawn Farm Animals inside & around the Farmhouse Haybales!
  host.spawnAnimal('cow', (x2 - 2.2) * TILE_SIZE, (houseY1 + 3.5) * TILE_SIZE);
  host.spawnAnimal('cow', (x2 - 1.5) * TILE_SIZE, (houseY1 + 4.8) * TILE_SIZE);
  host.spawnAnimal('pig', (houseX1 + 2.2) * TILE_SIZE, (houseY1 + 4.5) * TILE_SIZE);
  host.spawnAnimal('goat', (x2 - 2.4) * TILE_SIZE, (houseY2 - 2.2) * TILE_SIZE);
  host.spawnAnimal('chicken', (houseX1 + 3.2) * TILE_SIZE, (houseY1 + 2.5) * TILE_SIZE);
  host.spawnAnimal('chicken', (houseMidX + 0.5) * TILE_SIZE, (houseY2 - 1.8) * TILE_SIZE);

  // Spawn 7 Hard-Working Villager Farmers tending Crops & Farmhouse!
  const farmerSpots: [number, number][] = [
    [x1 + 2, y1 + 3],
    [x1 + 3, y1 + 6],
    [x1 + 4, y2 - 2],
    [canalX + 1, y1 + 2],
    [canalX + 2, y1 + 5],
    [canalX + 2, y2 - 3],
    [houseX1 + 2, houseMidY],
  ];
  for (const [fx, fy] of farmerSpots) {
    host.spawnVillager((fx + 0.5) * TILE_SIZE, (fy + 0.5) * TILE_SIZE, city, 'farmer');
  }
}

function buildCityGasStation(host: WorldHost, x1: number, y1: number, x2: number, y2: number, city: CityData) {
  const midX = Math.floor((x1 + x2) / 2);
  const midY = Math.floor((y1 + y2) / 2);
  clearAreaForPOI(host, midX, midY, 6, 5);

  const shopX1 = x1 + 5;
  const shopY1 = y1 + 1;
  const shopY2 = y2 - 1;

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      host.resources.delete(`${x},${y}`);
      host.objects.delete(`${x},${y}`);
      const inShop = x >= shopX1 && y >= shopY1 && y <= shopY2;
      setTile(host, x, y, inShop ? 'city_floor' : 'gas_pad');
    }
  }

  // Walled Gas Man Shop on the East side (Walls + Door opening onto Fuel Pumps!)
  for (let y = shopY1; y <= shopY2; y++) {
    for (let x = shopX1; x <= x2; x++) {
      const isBorder = x === shopX1 || x === x2 || y === shopY1 || y === shopY2;
      if (isBorder) {
        if (x === shopX1 && y === midY) {
          placeObject(host, x, y, 'door', false, null, city, 'gas_station');
        } else {
          placeObject(host, x, y, 'stone_wall', false, null, city, 'gas_station');
        }
      }
    }
  }

  // Gas Man Shop interior: counters, fridge, supply chest & lights
  placeObject(host, shopX1 + 2, shopY1 + 1, 'lantern', false, null, city, 'gas_station');
  placeObject(host, shopX1 + 2, shopY1 + 2, 'shop_counter', false, null, city, 'gas_station');
  placeObject(host, shopX1 + 2, shopY1 + 3, 'shop_counter', false, null, city, 'gas_station');
  placeObject(host, shopX1 + 2, shopY1 + 4, 'shop_counter', false, null, city, 'gas_station');
  placeObject(host, x2 - 1, shopY1 + 1, 'fridge', false, [
    { id: 'energy_drink', count: 3 },
    { id: 'melon', count: 4 },
  ], city, 'gas_station');
  placeObject(host, x2 - 1, shopY2 - 1, 'chest', false, [
    { id: 'ammo_light', count: 24 },
    { id: 'bandage', count: 3 },
  ], city, 'gas_station');

  // Fuel Pumps on the spacious drive-through Gas Pad forecourt
  placeObject(host, x1 + 2, y1 + 2, 'gas_pump', false, null, city, 'gas_station');
  placeObject(host, x1 + 2, y2 - 2, 'gas_pump', false, null, city, 'gas_station');
  placeObject(host, x1 + 1, y1 + 1, 'lantern', false, null, city, 'gas_station');
  placeObject(host, x1 + 1, y2 - 1, 'lantern', false, null, city, 'gas_station');

  // Connect Gas Station forecourt west directly onto North-South Main Avenue!
  connectRoadsideToBuilding(host, city, x1, midY);

  city.gasStationX = (x1 + 2.8) * TILE_SIZE;
  city.gasStationY = (midY + 0.5) * TILE_SIZE;

  // Spawn Villager Gas Man stationed inside his walled shop behind the counter!
  host.spawnVillager((shopX1 + 1.4) * TILE_SIZE, (midY + 0.5) * TILE_SIZE, city, 'gas_attendant');
  // Spawn Villager Mechanic Man at the Gas Station repair bay to fix low-HP vehicles!
  host.spawnVillager((x1 + 3.8) * TILE_SIZE, (midY + 0.8) * TILE_SIZE, city, 'mechanic');
}

export function getExpansionSiteCoords(city: CityData, expansionId: ExpansionId) {
  const cx = city.tx;
  const cy = city.ty;
  if (expansionId === 'house_north') return { x: (cx - 6) * TILE_SIZE, y: (cy - 19) * TILE_SIZE, label: 'Residential Houses' };
  if (expansionId === 'house_south') return { x: (cx - 6) * TILE_SIZE, y: (cy + 28) * TILE_SIZE, label: 'Suburban Cottage Houses' };
  if (expansionId === 'shop_west') return { x: (cx - 21) * TILE_SIZE, y: (cy - 8) * TILE_SIZE, label: 'Village Shops Plaza' };
  if (expansionId === 'office_jobs') return { x: (cx - 6) * TILE_SIZE, y: (cy + 9) * TILE_SIZE, label: 'Job Office (ComputerOS)' };
  if (expansionId === 'grand_mall') return { x: (cx + 12) * TILE_SIZE, y: (cy + 20) * TILE_SIZE, label: 'Grand Shopping Mall' };
  if (expansionId === 'luxury_hotel') return { x: (cx + 31) * TILE_SIZE, y: (cy - 6) * TILE_SIZE, label: 'Luxury Grand Hotel' };
  if (expansionId === 'farmland_zone') return { x: (cx + 38) * TILE_SIZE, y: (cy + 10) * TILE_SIZE, label: 'Mega Farmland & Farmhouse' };
  if (expansionId === 'military_camp') return { x: (cx + 26) * TILE_SIZE, y: (cy + 23) * TILE_SIZE, label: 'Military Camp Outpost' };
  return { x: city.x, y: city.y, label: 'Perimeter Fortifications' };
}

export function buildCityExpansion(host: WorldHost, city: CityData, expansionId: ExpansionId): boolean {
  const cx = city.tx;
  const cy = city.ty;

  // 1. Residential Houses (North) + Roadside Connection
  if (expansionId === 'house_north') {
    if (city.expansionsBuilt.house_north) return false;
    city.expansionsBuilt.house_north = true;
    const x1 = cx - 10, y1 = cy - 23, x2 = cx - 3, y2 = cy - 16;
    clearAreaForPOI(host, Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), 5, 5);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setTile(host, x, y, 'planks');
        if (x === x1 || x === x2 || y === y1 || y === y2) {
          if (x === Math.floor((x1 + x2) / 2) && y === y2) placeObject(host, x, y, 'door', false);
          else placeObject(host, x, y, 'wood_wall', false);
        }
      }
    }
    placeObject(host, x1 + 1, y1 + 1, 'bed', false);
    placeObject(host, x2 - 1, y1 + 1, 'bed', false);
    placeObject(host, x1 + 1, y2 - 1, 'table', false, [{ id: 'wheat', count: 2 }]);
    placeObject(host, x1 + 2, y2 - 1, 'seat', false);
    placeObject(host, x2 - 1, y2 - 1, 'old_computer', false);
    placeObject(host, x2 - 2, y2 - 1, 'lantern', false);
    connectRoadsideToBuilding(host, city, Math.floor((x1 + x2) / 2), y2);
    spawnVehicle(host, 'car', (Math.floor((x1 + x2) / 2) + 1) * TILE_SIZE, (y2 + 2) * TILE_SIZE, city, 1);
    for (let i = 0; i < 4; i++) host.spawnVillager((x1 + 2 + i) * TILE_SIZE, (y1 + 3) * TILE_SIZE, city);
    return true;
  }

  // 1b. Suburban Houses (South) + Roadside Connection
  if (expansionId === 'house_south') {
    if (city.expansionsBuilt.house_south) return false;
    city.expansionsBuilt.house_south = true;
    const x1 = cx - 10, y1 = cy + 25, x2 = cx - 3, y2 = cy + 32;
    clearAreaForPOI(host, Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), 5, 5);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setTile(host, x, y, 'planks');
        if (x === x1 || x === x2 || y === y1 || y === y2) {
          if (x === Math.floor((x1 + x2) / 2) && y === y1) placeObject(host, x, y, 'door', false);
          else placeObject(host, x, y, 'wood_wall', false);
        }
      }
    }
    placeObject(host, x1 + 1, y2 - 1, 'bed', false);
    placeObject(host, x2 - 1, y2 - 1, 'old_tv', false);
    placeObject(host, x1 + 1, y1 + 1, 'fridge', false, [{ id: 'cooked_meat', count: 3 }]);
    placeObject(host, x2 - 1, y1 + 1, 'lantern', false);
    connectRoadsideToBuilding(host, city, Math.floor((x1 + x2) / 2), y1);
    for (let i = 0; i < 4; i++) host.spawnVillager((x1 + 2 + i) * TILE_SIZE, (y1 + 3) * TILE_SIZE, city);
    return true;
  }

  // 2. Shops (Inside there is a bustling Village Market!) + Roadside Connection
  if (expansionId === 'shop_west') {
    if (city.expansionsBuilt.shop_west) return false;
    city.expansionsBuilt.shop_west = true;
    const x1 = cx - 26, y1 = cy - 13, x2 = cx - 16, y2 = cy - 4;
    clearAreaForPOI(host, Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), 6, 6);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setTile(host, x, y, 'city_floor');
        if (x === x1 || x === x2 || y === y1 || y === y2) {
          if (x === x2 && y === Math.floor((y1 + y2) / 2)) placeObject(host, x, y, 'door', false);
          else placeObject(host, x, y, 'stone_wall', false);
        }
      }
    }
    placeObject(host, x1 + 2, y1 + 2, 'shop_counter', false);
    placeObject(host, x1 + 2, y1 + 3, 'shop_counter', false);
    placeObject(host, x1 + 2, y1 + 4, 'shop_counter', false);
    placeObject(host, x1 + 6, y1 + 2, 'shop_counter', false);
    placeObject(host, x1 + 7, y1 + 2, 'shop_counter', false);
    placeObject(host, x1 + 1, y1 + 1, 'lantern', false);
    placeObject(host, x2 - 1, y1 + 1, 'lantern', false);
    placeObject(host, x2 - 1, y2 - 1, 'fridge', false, [{ id: 'melon', count: 5 }, { id: 'energy_drink', count: 3 }]);
    connectRoadsideToBuilding(host, city, x2, Math.floor((y1 + y2) / 2));

    host.spawnMerchant((x1 + 1.5) * TILE_SIZE, (y1 + 3.5) * TILE_SIZE, 'general_shop', 'Village Market Merchant', city);
    host.spawnMerchant((x1 + 6.5) * TILE_SIZE, (y1 + 1.5) * TILE_SIZE, 'general_shop', 'Village Produce Clerk', city);
    for (let i = 0; i < 8; i++) {
      host.spawnVillager((x1 + 4 + (i % 4) * 1.3) * TILE_SIZE, (y1 + 5 + Math.floor(i / 4) * 1.4) * TILE_SIZE, city);
    }
    return true;
  }

  // 3. Jobs Building (Old ComputerOS Terminals press [E] ON/OFF) + Roadside Connection
  if (expansionId === 'office_jobs') {
    if (city.expansionsBuilt.office_jobs) return false;
    city.expansionsBuilt.office_jobs = true;
    const x1 = cx - 10, y1 = cy + 5, x2 = cx - 3, y2 = cy + 13;
    clearAreaForPOI(host, Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), 5, 5);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setTile(host, x, y, 'city_floor');
        if (x === x1 || x === x2 || y === y1 || y === y2) {
          if (x === x2 && y === Math.floor((y1 + y2) / 2)) placeObject(host, x, y, 'door', false);
          else placeObject(host, x, y, 'stone_wall', false);
        }
      }
    }
    placeObject(host, x1 + 1, y1 + 1, 'old_computer', false);
    placeObject(host, x1 + 2, y1 + 1, 'seat', false);
    placeObject(host, x1 + 1, y1 + 4, 'old_computer', false);
    placeObject(host, x1 + 2, y1 + 4, 'seat', false);
    placeObject(host, x1 + 1, y2 - 1, 'old_computer', false);
    placeObject(host, x1 + 2, y2 - 1, 'seat', false);
    placeObject(host, x2 - 1, y1 + 1, 'lantern', false);
    connectRoadsideToBuilding(host, city, x2, Math.floor((y1 + y2) / 2));

    host.spawnVillager((x1 + 4) * TILE_SIZE, (y1 + 3) * TILE_SIZE, city);
    host.spawnVillager((x1 + 4) * TILE_SIZE, (y1 + 6) * TILE_SIZE, city);
    return true;
  }

  // 4. Grand Mall (Shops, Films/IMAX Cinema, Playground, Food Court, Facilities) + Roadside Connection
  if (expansionId === 'grand_mall') {
    if (city.expansionsBuilt.grand_mall) return false;
    city.expansionsBuilt.grand_mall = true;
    const x1 = cx + 4, y1 = cy + 15, x2 = cx + 20, y2 = cy + 27;
    clearAreaForPOI(host, Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), 9, 7);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setTile(host, x, y, 'mall_floor');
        if (x === x1 || x === x2 || y === y1 || y === y2) {
          if (x === Math.floor((x1 + x2) / 2) && y === y1) placeObject(host, x, y, 'door', false);
          else placeObject(host, x, y, 'stone_wall', false);
        }
      }
    }
    placeObject(host, x1 + 2, y1 + 2, 'shop_counter', false);
    placeObject(host, x1 + 3, y1 + 2, 'shop_counter', false);
    placeObject(host, x1 + 1, y1 + 4, 'fridge', false, [{ id: 'popcorn', count: 5 }, { id: 'energy_drink', count: 3 }]);
    host.spawnMerchant((x1 + 2.5) * TILE_SIZE, (y1 + 1.5) * TILE_SIZE, 'mall_shop', 'Mall Boutique Clerk', city);

    const screenObjPos = `${x2 - 3},${y1 + 1}`;
    placeObject(host, x2 - 3, y1 + 1, 'cinema_screen', false);
    const screenObj = host.objects.get(screenObjPos);
    if (screenObj) screenObj.isOn = true;

    placeObject(host, x2 - 4, y1 + 3, 'seat', false);
    placeObject(host, x2 - 3, y1 + 3, 'seat', false);
    placeObject(host, x2 - 2, y1 + 3, 'seat', false);
    placeObject(host, x2 - 4, y1 + 4, 'seat', false);
    placeObject(host, x2 - 3, y1 + 4, 'seat', false);
    placeObject(host, x2 - 2, y1 + 4, 'seat', false);

    placeObject(host, x1 + 2, y2 - 2, 'playground_slide', false);
    placeObject(host, x1 + 4, y2 - 2, 'playground_swing', false);
    placeObject(host, x1 + 6, y2 - 2, 'playground_swing', false);
    placeObject(host, x2 - 1, y2 - 1, 'sink', false);
    placeObject(host, x2 - 2, y2 - 1, 'shower', false);
    placeObject(host, x2 - 4, y2 - 2, 'table', false, [{ id: 'popcorn', count: 3 }]);
    placeObject(host, x2 - 5, y2 - 2, 'seat', false);
    placeObject(host, x1 + 8, y1 + 6, 'lantern', false);
    connectRoadsideToBuilding(host, city, Math.floor((x1 + x2) / 2), y1);

    for (let i = 0; i < 8; i++) {
      host.spawnVillager((x1 + 4 + (i % 4) * 2) * TILE_SIZE, (y1 + 6 + Math.floor(i / 4) * 2) * TILE_SIZE, city);
    }
    return true;
  }

  // 5. Luxury Hotel with Many People + Roadside Connection
  if (expansionId === 'luxury_hotel') {
    if (city.expansionsBuilt.luxury_hotel) return false;
    city.expansionsBuilt.luxury_hotel = true;
    const x1 = cx + 25, y1 = cy - 15, x2 = cx + 37, y2 = cy + 2;
    clearAreaForPOI(host, Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), 7, 9);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setTile(host, x, y, 'hotel_carpet');
        if (x === x1 || x === x2 || y === y1 || y === y2) {
          if (x === x1 && y === Math.floor((y1 + y2) / 2)) placeObject(host, x, y, 'door', false);
          else placeObject(host, x, y, 'white_wall', false);
        }
      }
    }
    placeObject(host, x1 + 2, y1 + 6, 'shop_counter', false);
    placeObject(host, x1 + 2, y1 + 7, 'old_computer', false);
    placeObject(host, x1 + 1, y1 + 7, 'seat', false);
    placeObject(host, x1 + 2, y1 + 8, 'shop_counter', false);
    placeObject(host, x1 + 4, y1 + 2, 'lantern', false);
    placeObject(host, x1 + 4, y2 - 2, 'lantern', false);

    placeObject(host, x2 - 1, y1 + 1, 'bed', false);
    placeObject(host, x2 - 3, y1 + 1, 'bed', false);
    placeObject(host, x2 - 1, y1 + 3, 'shower', false);
    placeObject(host, x2 - 3, y1 + 3, 'table', false, [{ id: 'leftovers', count: 3 }]);

    placeObject(host, x2 - 1, y2 - 1, 'bed', false);
    placeObject(host, x2 - 3, y2 - 1, 'bed', false);
    placeObject(host, x2 - 1, y2 - 3, 'fridge', false, [{ id: 'melon', count: 4 }, { id: 'cooked_meat', count: 4 }]);
    placeObject(host, x2 - 3, y2 - 3, 'old_tv', false);
    connectRoadsideToBuilding(host, city, x1, Math.floor((y1 + y2) / 2));

    host.spawnMerchant((x1 + 1.5) * TILE_SIZE, (y1 + 6.5) * TILE_SIZE, 'mall_shop', 'Luxury Hotel Concierge', city);
    for (let g = 0; g < 18; g++) {
      const gx = (x1 + 4 + (g % 4) * 1.8) * TILE_SIZE;
      const gy = (y1 + 4 + Math.floor(g / 4) * 2.0) * TILE_SIZE;
      host.spawnVillager(gx, gy, city);
    }
    return true;
  }

  // 6. Mega Farmland District (Huge Crop Fields, Irrigation Canal, Windmill, Farmhouse w/ Haybales & Animals, 6 Farmers!)
  if (expansionId === 'farmland_zone') {
    if (city.expansionsBuilt.farmland_zone) return false;
    city.expansionsBuilt.farmland_zone = true;
    const x1 = cx + 31, y1 = cy + 3, x2 = cx + 45, y2 = cy + 18;
    clearAreaForPOI(host, Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), 8, 8);

    const houseX1 = x2 - 5;
    const houseY1 = y1 + 2;
    const houseY2 = y2 - 2;
    const canalX = x1 + 5;

    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const inHouse = x >= houseX1 && y >= houseY1 && y <= houseY2;
        if (inHouse) {
          setTile(host, x, y, 'planks');
        } else if (x === canalX && y >= y1 + 1 && y <= y2 - 1) {
          setTile(host, x, y, 'water');
        } else if (x >= x1 + 1 && x <= houseX1 - 2 && y >= y1 + 1 && y <= y2 - 1) {
          setTile(host, x, y, 'farmland');
          if ((x + y) % 3 !== 0) {
            placeObject(host, x, y, 'crop_wheat', false);
            const crop = host.objects.get(`${x},${y}`);
            if (crop) crop.growth = 0.72;
          }
        } else {
          setTile(host, x, y, 'grass_1');
        }
      }
    }

    const houseMidY = Math.floor((houseY1 + houseY2) / 2);
    const houseMidX = Math.floor((houseX1 + x2) / 2);
    for (let y = houseY1; y <= houseY2; y++) {
      for (let x = houseX1; x <= x2; x++) {
        if (x === houseX1 || x === x2 || y === houseY1 || y === houseY2) {
          const isDoor = (x === houseX1 && y === houseMidY) || (y === houseY2 && (x === houseMidX || x === houseMidX + 1));
          placeObject(host, x, y, isDoor ? 'door' : 'wood_wall', false, null, city, 'farmland');
          if (y === houseY2 && isDoor) {
            const dObj = host.objects.get(`${x},${y}`);
            if (dObj) {
              dObj.open = true;
              dObj.manualOpen = true;
            }
          }
        }
      }
    }

    placeObject(host, x2 - 1, houseY1 + 1, 'hay_bale', false, null, city, 'farmland');
    placeObject(host, x2 - 2, houseY1 + 1, 'hay_bale', false, null, city, 'farmland');
    placeObject(host, x2 - 1, houseY1 + 2, 'hay_bale', false, null, city, 'farmland');
    placeObject(host, houseX1 + 1, houseY1 + 1, 'chest', false, [
      { id: 'wheat', count: 14 },
      { id: 'seeds', count: 24 },
      { id: 'melon', count: 6 },
    ], city, 'farmland');
    placeObject(host, houseX1 + 1, houseY2 - 1, 'bed', false, null, city, 'farmland');
    placeObject(host, houseMidX, houseY1 + 3, 'lantern', false, null, city, 'farmland');

    placeObject(host, x1 + 1, y1 + 1, 'windmill', false, null, city, 'farmland');
    placeObject(host, x1 + 3, y1 + 4, 'scarecrow', false, null, city, 'farmland');
    placeObject(host, canalX + 2, y2 - 2, 'scarecrow', false, null, city, 'farmland');
    placeObject(host, x1 + 2, y1 + 1, 'lantern', false, null, city, 'farmland');
    connectRoadsideToBuilding(host, city, x1, Math.floor((y1 + y2) / 2));

    for (let f = 0; f < 6; f++) {
      host.spawnVillager((x1 + 2 + (f % 3) * 2.5) * TILE_SIZE, (y1 + 2 + Math.floor(f / 3) * 5) * TILE_SIZE, city, 'farmer');
    }
    host.spawnAnimal('cow', (x2 - 2) * TILE_SIZE, (houseY1 + 3) * TILE_SIZE);
    host.spawnAnimal('cow', (x2 - 1.5) * TILE_SIZE, (houseY1 + 5) * TILE_SIZE);
    host.spawnAnimal('pig', (houseX1 + 2) * TILE_SIZE, (houseY2 - 3) * TILE_SIZE);
    host.spawnAnimal('goat', (x2 - 2.2) * TILE_SIZE, (houseY2 - 2.5) * TILE_SIZE);
    host.spawnAnimal('chicken', (houseX1 + 3) * TILE_SIZE, (houseY1 + 2.5) * TILE_SIZE);
    return true;
  }

  // 7. Forward Military Camp Outpost (Tents, Military Flag, Campfire, Beds, Rations & Turret) + Roadside Connection
  if (expansionId === 'military_camp') {
    if (city.expansionsBuilt.military_camp) return false;
    city.expansionsBuilt.military_camp = true;
    const x1 = cx + 22, y1 = cy + 20, x2 = cx + 31, y2 = cy + 27;
    clearAreaForPOI(host, Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), 6, 5);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setTile(host, x, y, x >= x1 + 2 && x <= x2 - 2 && y >= y1 + 2 && y <= y2 - 2 ? 'planks' : 'military_pad');
        const isEdge = x === x1 || x === x2 || y === y1 || y === y2;
        if (isEdge && x !== x1 && y !== Math.floor((y1 + y2) / 2)) {
          placeObject(host, x, y, 'barrier', false);
        }
      }
    }
    placeObject(host, x1 + 2, y1 + 1, 'military_tent', false);
    placeObject(host, x1 + 4, y1 + 1, 'military_tent', false);
    placeObject(host, x1 + 6, y1 + 1, 'military_tent', false);
    placeObject(host, x2 - 2, y1 + 1, 'military_flag', false, null, city);
    placeObject(host, x1 + 2, y2 - 1, 'military_tent', false);
    placeObject(host, x1 + 4, y1 + 3, 'campfire', false);
    placeObject(host, x1 + 3, y1 + 3, 'bed', false);
    placeObject(host, x1 + 6, y1 + 3, 'table', false, [{ id: 'cooked_meat', count: 4 }, { id: 'energy_drink', count: 3 }]);
    placeObject(host, x1 + 7, y1 + 3, 'fridge', false, [{ id: 'medkit', count: 2 }, { id: 'cooked_fish', count: 4 }]);
    placeObject(host, x2 - 2, y2 - 2, 'old_computer', false);
    placeObject(host, x1 + 1, y1 + 1, 'turret', false);
    placeObject(host, x2 - 1, y2 - 1, 'turret', false);
    placeObject(host, x1 + 1, y2 - 1, 'lantern', false);
    connectRoadsideToBuilding(host, city, x1, Math.floor((y1 + y2) / 2));

    for (let f = 0; f < 4; f++) {
      host.spawnGuard((x1 + 3 + f * 1.4) * TILE_SIZE, (y1 + 5) * TILE_SIZE, 'fbi', city);
    }
    return true;
  }

  // 8. Fortify Perimeter Walls + Turrets
  if (expansionId === 'fortify_walls') {
    for (let ox = -6; ox <= 6; ox += 4) {
      const bx = cx + ox;
      const by = cy + 6;
      if (!isWaterTile(getTile(host, bx, by)) && !host.objects.has(`${bx},${by}`)) {
        placeObject(host, bx, by, ox === 0 ? 'turret' : 'stone_wall', false);
      }
    }
    return true;
  }

  return false;
}

export function generateAbandonedHouse(host: WorldHost, tx: number, ty: number) {
  clearAreaForPOI(host, tx, ty, 4, 4);
  for (let y = ty - 2; y <= ty + 2; y++) {
    for (let x = tx - 2; x <= tx + 2; x++) {
      setTile(host, x, y, 'planks');
      const isBorder = x === tx - 2 || x === tx + 2 || y === ty - 2 || y === ty + 2;
      if (isBorder) {
        if (x === tx && y === ty + 2) placeObject(host, x, y, 'door', false);
        else if (hash2D(x, y, 31) > 0.25) placeObject(host, x, y, 'wood_wall', false);
      }
    }
  }
  placeObject(host, tx, ty, 'chest', false, [
    { id: 'ammo_light', count: 18 },
    { id: 'medkit', count: 1 },
    { id: 'grenade', count: 3 },
  ]);
  host.spawnZombie('walker', (tx + 3) * TILE_SIZE, (ty + 3) * TILE_SIZE);
}

export function populateChunkEntities(host: WorldHost, cx: number, cy: number) {
  const baseX = cx * CHUNK_SIZE * TILE_SIZE;
  const baseY = cy * CHUNK_SIZE * TILE_SIZE;
  const distFromOrigin = Math.hypot(cx, cy);

  const animalTypes = ['pig', 'cow', 'rabbit', 'goat', 'chicken'];
  const animalCount = 2 + Math.floor(hash2D(cx, cy, 123) * 2);
  for (let i = 0; i < animalCount; i++) {
    const ax = baseX + (0.15 + hash2D(cx + i, cy, 456) * 0.7) * CHUNK_SIZE * TILE_SIZE;
    const ay = baseY + (0.15 + hash2D(cx, cy + i, 789) * 0.7) * CHUNK_SIZE * TILE_SIZE;
    const tx = Math.floor(ax / TILE_SIZE);
    const ty = Math.floor(ay / TILE_SIZE);
    if (!isWaterTile(getTile(host, tx, ty))) {
      const type = animalTypes[Math.floor(hash2D(tx, ty, 321) * animalTypes.length)];
      host.spawnAnimal(type, ax, ay);
    }
  }

  const centerBiome = getBiomeAt(host, cx * CHUNK_SIZE + 8, cy * CHUNK_SIZE + 8);
  if ((centerBiome === 'plains' || centerBiome === 'savanna' || centerBiome === 'forest') && hash2D(cx, cy, 515) < 0.32) {
    const hx = baseX + 8 * TILE_SIZE;
    const hy = baseY + 8 * TILE_SIZE;
    if (!isWaterTile(getTile(host, Math.floor(hx / TILE_SIZE), Math.floor(hy / TILE_SIZE)))) {
      host.spawnHorse(hx, hy);
    }
  }

  if (distFromOrigin >= 2) {
    const zCount = 2 + Math.min(4, Math.floor(distFromOrigin * 0.6));
    for (let i = 0; i < zCount; i++) {
      const zx = baseX + (0.1 + hash2D(cx * 3 + i, cy, 987) * 0.8) * CHUNK_SIZE * TILE_SIZE;
      const zy = baseY + (0.1 + hash2D(cx, cy * 3 + i, 654) * 0.8) * CHUNK_SIZE * TILE_SIZE;
      const tx = Math.floor(zx / TILE_SIZE);
      const ty = Math.floor(zy / TILE_SIZE);
      if (!isWaterTile(getTile(host, tx, ty))) {
        const roll = hash2D(tx, ty, 111);
        const zType = roll < 0.5 ? 'walker' : roll < 0.72 ? 'runner' : roll < 0.88 ? 'spitter' : 'brute';
        host.spawnZombie(zType, zx, zy);
      }
    }
  }
}
