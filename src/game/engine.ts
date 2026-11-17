import { audio } from './audio';
import { CHUNK_SIZE, ITEMS, OBJECT_DEFS, RECIPES, TILE_SIZE } from './data';
import { renderGameFrame } from './renderer';
import { PixelArtCache } from './sprites';
import {
  CityData,
  ExpansionId,
  GameEntity,
  GridObject,
  HudSnapshot,
  InventoryItem,
  ResourceNode,
  ToastMessage,
  Vehicle,
  WorldEventDef,
} from './types';
import {
  buildCityExpansion,
  ensureChunk,
  generateLargeCity,
  getBiomeAt,
  getExpansionSiteCoords,
  getTile,
  isTileBlocked,
  isWaterTile,
  placeObject,
  setTile,
  WorldHost,
} from './world';

export const EXPANSION_SEQUENCE: ExpansionId[] = [
  'house_north',
  'house_south',
  'shop_west',
  'office_jobs',
  'grand_mall',
  'luxury_hotel',
  'military_camp',
  'farmland_zone',
  'fortify_walls',
];

export class DeadGridGame implements WorldHost {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  minimap: HTMLCanvasElement;
  mctx: CanvasRenderingContext2D;
  lightCanvas: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  sprites: PixelArtCache;

  seed = Math.floor(Math.random() * 999999);
  timeOfDay = 0.34;
  day = 1;
  dayLengthSec = 300;
  bloodmoonTimer = 0;

  camera = { x: 0, y: 0, zoom: 1.05 };
  screenShake = 0;
  radarAngle = 0;
  lastStepHalfCycle = 0;

  keys: Record<string, boolean> = {};
  mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false, rightDown: false };

  chunks = new Map<string, string[]>();
  tileEdits = new Map<string, string>();
  resources = new Map<string, ResourceNode>();
  objects = new Map<string, GridObject>();
  cities: CityData[] = [];
  entities: GameEntity[] = [];
  vehicles: Vehicle[] = [];
  drops: { x: number; y: number; itemId: string; count: number; bob: number; vx: number; vy: number }[] = [];
  bullets: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    dist: number;
    maxRange: number;
    color: string;
    friendlyToPlayer: boolean;
    friendlyToNPC: boolean;
    fromPlayer?: boolean;
  }[] = [];
  spitProjectiles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    dist: number;
    maxRange: number;
    isBloodmoon: boolean;
  }[] = [];
  grenades: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    fuse: number;
    damage: number;
    radius: number;
    smokeTimer: number;
  }[] = [];
  virusPuddles: { x: number; y: number; radius: number; life: number; isBloodmoon: boolean }[] = [];
  firePatches: { x: number; y: number; radius: number; life: number }[] = [];
  shockwaves: { x: number; y: number; radius: number; maxRadius: number; alpha: number }[] = [];
  meteorImpacts: { x: number; y: number; timer: number; radius: number; isPoison?: boolean }[] = [];
  particles: { x: number; y: number; vx: number; vy: number; color: string; size: number; life: number }[] = [];
  ripples: { x: number; y: number; radius: number; alpha: number }[] = [];
  floatingTexts: { x: number; y: number; text: string; color: string; life: number }[] = [];

  worldEvents: WorldEventDef[] = [
    { id: 'bloodmoon', name: 'Crimson Bloodmoon', icon: '🌑', timer: 135, interval: 185, desc: 'Bloodmoon unleashes Super Spitters & Horde Surges across cities!' },
    { id: 'raid', name: 'Far City Zombie Invasion', icon: '🏙️', timer: 68, interval: 130, desc: 'Spawns a distant Far City under siege with zombies marching directly into the city!' },
    { id: 'supply_drop', name: 'Military Air-Drop', icon: '🪂', timer: 95, interval: 120, desc: 'Drops weapons, armor, gold & ammo crates nearby.' },
    { id: 'boss_king', name: 'Zombie King Titan', icon: '👑', timer: 195, interval: 225, desc: 'Summons Zombie King + 750 Zombies, Guard Zombies & Bodybuilders + 15 close meteors!' },
    { id: 'meteor_shower', name: 'Meteor Shower', icon: '☄️', timer: 125, interval: 155, desc: 'Toxic Meteor Shower rains poison & explosions that damage city objects!' },
  ];

  player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 12,
    hp: 100,
    maxHp: 100,
    hunger: 100,
    maxHunger: 100,
    stamina: 100,
    maxStamina: 100,
    xp: 0,
    level: 1,
    cash: 150,
    kills: 0,
    speed: 175,
    angle: 0,
    facingDir: 1,
    walkCycle: 0,
    attackTimer: 0,
    swingAnim: 0,
    blocking: false,
    hurtFlash: 0,
    poisonTimer: 0,
    poisonTickTimer: 0,
    speedBoostTimer: 0,
    rippleTimer: 0,
    inWater: false,
    dead: false,
    mountedHorse: null as GameEntity | null,
    seatedObj: null as GridObject | null,
    inVehicle: null as Vehicle | null,
    activeSlot: 0,
    inventory: new Array<InventoryItem | null>(27).fill(null),
    equipment: {
      head: null as InventoryItem | null,
      body: null as InventoryItem | null,
      feet: null as InventoryItem | null,
      shield: null as InventoryItem | null,
    },
  };

  tvTimer = 0;
  tvFrame = 0;
  computerFrame = 0;
  activeStorageObj: GridObject | null = null;
  activeStorageHorse: GameEntity | null = null;
  activeMerchant: GameEntity | null = null;
  isModalOpen = false;
  toastCounter = 0;
  toasts: ToastMessage[] = [];

  private callbacks: {
    onHud?: (snap: HudSnapshot) => void;
    onToast?: (t: ToastMessage) => void;
    onStorageOpen?: (title: string, slots: (InventoryItem | null)[], isHorse: boolean) => void;
    onMerchantOpen?: (merchant: GameEntity) => void;
    onOpenWorkbench?: () => void;
    onOpenAnvil?: () => void;
    onInventoryChanged?: () => void;
  } = {};

  private hudSyncTimer = 0;
  private rafId = 0;
  private lastTime = 0;
  private zombieGrid = new Map<number, GameEntity[]>();
  private humanGrid = new Map<number, GameEntity[]>();
  private animalGrid = new Map<number, GameEntity[]>();
  private cityMetricsCache = new Map<
    CityData,
    {
      ts: number;
      data: {
        population: number;
        damagedList: GridObject[];
        repairTargets: { tx: number; ty: number; name: string; type: string; zone: string; destroyed: boolean }[];
        totalCount: number;
        zombiesInCity: number;
      };
    }
  >();
  private lowFuelWarnTimer = 0;
  private radarScanTimer = 0;
  private gasDetonatingKeys = new Set<string>();

  constructor(
    canvas: HTMLCanvasElement,
    minimap: HTMLCanvasElement,
    callbacks: DeadGridGame['callbacks']
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.minimap = minimap;
    this.mctx = minimap.getContext('2d')!;
    this.lightCanvas = document.createElement('canvas');
    this.lctx = this.lightCanvas.getContext('2d')!;
    this.sprites = new PixelArtCache();
    this.callbacks = callbacks;

    this.initGameWorld();
  }

  initGameWorld() {
    this.giveItem('sword_iron', 1);
    this.giveItem('pistol', 1);
    this.giveItem('ammo_light', 36);
    this.giveItem('axe_wood', 1);
    this.giveItem('pickaxe_iron', 1);
    this.giveItem('saddle', 1);
    this.giveItem('compass', 1);
    this.giveItem('grenade', 3);
    this.giveItem('bandage', 2);

    this.updateChunksAroundPlayer();
    this.spawnSafeStarterCamp();
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.lastTime = performance.now();

    audio.setTrackContextProvider(() => {
      let hasBoss = false;
      let nearbyZeds = 0;
      for (const e of this.entities) {
        if (e.kind === 'zombie') {
          if (e.subType === 'king') hasBoss = true;
          if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 380) nearbyZeds++;
        }
      }
      const isNight = this.timeOfDay > 0.72 || this.timeOfDay < 0.25;
      return {
        isBloodmoon: this.bloodmoonTimer > 0,
        hasBoss,
        nearbyZeds,
        isNight,
      };
    });
  }

  start() {
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.update(dt);
      this.radarAngle = renderGameFrame({
        canvas: this.canvas,
        ctx: this.ctx,
        minimap: this.minimap,
        mctx: this.mctx,
        lightCanvas: this.lightCanvas,
        lctx: this.lctx,
        sprites: this.sprites,
        camera: this.camera,
        screenShake: this.screenShake,
        timeOfDay: this.timeOfDay,
        bloodmoonTimer: this.bloodmoonTimer,
        radarAngle: this.radarAngle,
        getTile: (tx, ty) => getTile(this, tx, ty),
        resources: this.resources,
        objects: this.objects,
        cities: this.cities,
        vehicles: this.vehicles,
        entities: this.entities,
        drops: this.drops,
        bullets: this.bullets,
        spitProjectiles: this.spitProjectiles,
        grenades: this.grenades,
        virusPuddles: this.virusPuddles,
        firePatches: this.firePatches,
        shockwaves: this.shockwaves,
        meteorImpacts: this.meteorImpacts,
        particles: this.particles,
        ripples: this.ripples,
        floatingTexts: this.floatingTexts,
        mouse: this.mouse,
        isWaterTile,
        isTileBlocked: (tx, ty, open) => isTileBlocked(this, tx, ty, open),
        isModalOpen: this.isModalOpen,
        player: {
          ...this.player,
          heldItem: this.player.inventory[this.player.activeSlot] || null,
        },
      });
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
  }

  setModalOpen(open: boolean) {
    this.isModalOpen = open;
    if (open) {
      this.mouse.down = false;
      this.mouse.rightDown = false;
    }
  }

  toast(msg: string, tone: ToastMessage['tone'] = 'sky') {
    const t: ToastMessage = { id: ++this.toastCounter, msg, tone };
    this.callbacks.onToast?.(t);
  }

  spawnFloatingText(x: number, y: number, text: string, color = '#ffffff') {
    if (this.floatingTexts.length >= 36) this.floatingTexts.shift();
    this.floatingTexts.push({ x, y, text, color, life: 0.9 });
  }

  spawnParticles(x: number, y: number, color: string, count = 6, speed = 80) {
    if (this.particles.length >= 240) return;
    const allowed = Math.min(count, 240 - this.particles.length);
    for (let i = 0; i < allowed; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        color,
        size: 2 + Math.random() * 3,
        life: 0.35 + Math.random() * 0.3,
      });
    }
  }

  spawnSafeStarterCamp() {
    for (let y = -3; y <= 3; y++) {
      for (let x = -3; x <= 3; x++) {
        this.resources.delete(`${x},${y}`);
        if (isWaterTile(getTile(this, x, y))) setTile(this, x, y, 'grass_0');
      }
    }
    placeObject(this, -2, -2, 'campfire', true);
    placeObject(this, 2, -2, 'workbench', true);
    placeObject(this, 2, -1, 'old_computer', true);
    placeObject(this, 1, -2, 'furnace', true);
    placeObject(this, -2, -1, 'chest', true, [
      { id: 'wood', count: 10 },
      { id: 'stone', count: 8 },
      { id: 'gold', count: 1 },
      { id: 'seeds', count: 4 },
    ]);
    placeObject(this, -3, -3, 'torch', true);
    this.spawnHorse(3.5 * TILE_SIZE, 2 * TILE_SIZE, 'starter');

    // Clear path toward the starter Cave Mining Cavern near (-20, -14)
    this.spawnFloatingText(0, -38, '🏕️ Camp • Cave Ores NW • City & Military Base East!', '#38bdf8');
  }

  updateChunksAroundPlayer() {
    const ptx = Math.floor(this.player.x / TILE_SIZE);
    const pty = Math.floor(this.player.y / TILE_SIZE);
    const pcx = Math.floor(ptx / CHUNK_SIZE);
    const pcy = Math.floor(pty / CHUNK_SIZE);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        ensureChunk(this, pcx + dx, pcy + dy);
      }
    }
  }

  // ---------------------------------------------------------
  // WORLD HOST ENTITY SPAWNERS
  // ---------------------------------------------------------
  spawnPresident(x: number, y: number, city: CityData) {
    this.entities.push({
      kind: 'president',
      name: 'President',
      city,
      x,
      y,
      homeX: x,
      homeY: y,
      hp: 420,
      maxHp: 420,
      damaged: false,
      speed: 78,
      radius: 13,
      facingDir: 1,
      walkCycle: 0,
      wanderAngle: 0,
      wanderTimer: 0,
      hurtFlash: 0,
      workingAtComputer: true,
      workComputerTimer: 6,
      builderOrderTimer: 7,
      commandCooldown: 0,
    });
  }

  spawnCityBuilder(x: number, y: number, city: CityData, index = 0) {
    const tools = ['Hammer', 'Wrench', 'Saw', 'Drill', 'Brick Trowel'];
    this.entities.push({
      kind: 'builder',
      name: `City Builder #${index + 1}`,
      city,
      builderIndex: index,
      heldTool: tools[index % tools.length],
      carrying: index % 3 === 0 ? 'wheelbarrow' : 'bricks',
      x,
      y,
      homeX: x,
      homeY: y,
      hp: 150,
      maxHp: 150,
      damaged: false,
      speed: 108,
      radius: 12,
      facingDir: 1,
      walkCycle: 0,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 2,
      hurtFlash: 0,
      buildTask: null,
    });
  }

  spawnMerchant(x: number, y: number, shopType: string, name: string, city: CityData) {
    this.entities.push({
      kind: 'merchant',
      shopType,
      name,
      city,
      x,
      y,
      homeX: x,
      homeY: y,
      hp: 240,
      maxHp: 240,
      damaged: false,
      speed: 35,
      radius: 12,
      facingDir: 1,
      walkCycle: 0,
      wanderAngle: 0,
      wanderTimer: 2,
      hurtFlash: 0,
    });
  }

  spawnGuard(x: number, y: number, role = 'guard', city: CityData | null = null, protectingPresident = false): GameEntity {
    const isFBI = role === 'fbi';
    const roll = Math.random();
    const weaponMode = protectingPresident ? 'gun' : isFBI ? (roll < 0.3 ? 'bomber' : 'gun') : roll < 0.45 ? 'bat_shield' : 'gun';
    const ent: GameEntity = {
      kind: 'guard',
      role,
      weaponMode,
      protectingPresident,
      name: protectingPresident
        ? isFBI
          ? 'Secret Service FBI'
          : 'White House Guard'
        : isFBI
          ? weaponMode === 'bomber'
            ? 'FBI Demolitionist'
            : 'FBI Tactical Agent'
          : 'City Guard',
      city,
      x,
      y,
      homeX: x,
      homeY: y,
      hp: protectingPresident ? (isFBI ? 225 : 175) : isFBI ? 195 : 140,
      maxHp: protectingPresident ? (isFBI ? 225 : 175) : isFBI ? 195 : 140,
      armor: protectingPresident ? 18 : isFBI ? 14 : 6,
      damaged: false,
      speed: isFBI ? 126 : 112,
      damage: weaponMode === 'bat_shield' ? 32 : isFBI ? 26 : 21,
      radius: 12,
      facingDir: 1,
      walkCycle: 0,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 2,
      shootTimer: 0,
      bombTimer: 1 + Math.random() * 2,
      hurtFlash: 0,
      hostileToPlayer: false,
      inVehicle: null,
      assignedVehicle: null,
      energy: 100,
      maxEnergy: 100,
      powerBoostTimer: 0,
      restingAtCamp: false,
      restTimer: 0,
    };
    this.entities.push(ent);
    return ent;
  }

  spawnVillager(x: number, y: number, city: CityData | null = null, role = 'citizen') {
    const shirts = ['#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];
    const hairs = ['#451a03', '#facc15', '#78350f', '#1e293b', '#ea580c'];
    const isFarmer = role === 'farmer';
    const isGasMan = role === 'gas_attendant';
    const isMechanic = role === 'mechanic';
    this.entities.push({
      kind: 'villager',
      role,
      name: isFarmer ? 'Villager Farmer' : isGasMan ? 'Villager Gas Man' : isMechanic ? 'Villager Mechanic' : 'Citizen',
      city,
      x,
      y,
      homeX: x,
      homeY: y,
      hp: isFarmer || isGasMan || isMechanic ? 115 : 85,
      maxHp: isFarmer || isGasMan || isMechanic ? 115 : 85,
      damaged: false,
      speed: isGasMan ? 56 : isMechanic || isFarmer ? 74 : 78,
      radius: 11,
      cash: 5 + Math.floor(Math.random() * 16),
      shirtColor: isFarmer ? '#15803d' : isGasMan ? '#dc2626' : isMechanic ? '#1d4ed8' : shirts[Math.floor(Math.random() * shirts.length)],
      hairColor: hairs[Math.floor(Math.random() * hairs.length)],
      facingDir: 1,
      walkCycle: 0,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 2,
      panicTimer: 0,
      fleeTimer: 0,
      hurtFlash: 0,
    });
  }

  spawnAnimal(type: string, x: number, y: number) {
    const cfg: Record<string, { name: string; hp: number; radius: number; speed: number; color: string; aquatic?: boolean; drops: string[] }> = {
      pig: { name: 'Pig', hp: 40, radius: 11, speed: 60, color: '#f472b6', drops: ['raw_meat'] },
      cow: { name: 'Cow', hp: 65, radius: 14, speed: 50, color: '#e2e8f0', drops: ['raw_meat', 'cloth'] },
      rabbit: { name: 'Rabbit', hp: 20, radius: 8, speed: 95, color: '#cbd5e1', drops: ['raw_meat'] },
      goat: { name: 'Goat', hp: 45, radius: 11, speed: 68, color: '#d6d3d1', drops: ['raw_meat', 'cloth'] },
      chicken: { name: 'Chicken', hp: 18, radius: 8, speed: 75, color: '#fef08a', drops: ['raw_meat'] },
      fish: { name: 'River Trout', hp: 12, radius: 8, speed: 55, color: '#38bdf8', aquatic: true, drops: ['fish'] },
    };
    const d = cfg[type] || cfg.pig;
    this.entities.push({
      kind: 'animal',
      subType: type,
      name: d.name,
      x,
      y,
      homeX: x,
      homeY: y,
      hp: d.hp,
      maxHp: d.hp,
      damaged: false,
      speed: d.speed,
      radius: d.radius,
      color: d.color,
      aquatic: !!d.aquatic,
      drops: d.drops,
      facingDir: 1,
      walkCycle: 0,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 1 + Math.random() * 3,
      fleeTimer: 0,
      hurtFlash: 0,
    });
  }

  spawnHorse(x: number, y: number, forcedVariant: string | null = null) {
    const variants = [
      { name: 'Chestnut Steed', coat: '#854d27', mane: '#29150b', speedMult: 1.56, maxStam: 130 },
      { name: 'Midnight Mustang', coat: '#1e1b18', mane: '#09090b', speedMult: 1.68, maxStam: 150 },
      { name: 'White Stallion', coat: '#f1f5f9', mane: '#cbd5e1', speedMult: 1.62, maxStam: 140 },
      { name: 'Spotted Pinto', coat: '#a16207', mane: '#fef3c7', speedMult: 1.54, maxStam: 135, spotted: true },
    ];
    const v = forcedVariant === 'starter' ? variants[0] : variants[Math.floor(Math.random() * variants.length)];
    this.entities.push({
      kind: 'horse',
      name: v.name,
      coat: v.coat,
      mane: v.mane,
      spotted: !!v.spotted,
      speedMult: v.speedMult,
      x,
      y,
      hp: 160,
      maxHp: 160,
      damaged: false,
      speed: 65,
      radius: 15,
      stamina: v.maxStam,
      maxStamina: v.maxStam,
      saddled: false,
      hasChest: false,
      items: new Array(9).fill(null),
      facingDir: 1,
      walkCycle: 0,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 2 + Math.random() * 3,
      fleeTimer: 0,
      hoofTimer: 0,
      hurtFlash: 0,
    });
  }

  spawnZombie(type: string, x: number, y: number, extra: Partial<GameEntity> = {}): GameEntity {
    const isBodybuilder = !!extra.isBodybuilder;
    const isKing = type === 'king';
    const isBrute = type === 'brute';
    const isSpitter = type === 'spitter';
    const isRunner = type === 'runner';
    const isGuardZombie = type === 'guard_zombie';

    const shirts = ['#475569', '#3f6212', '#7c2d12', '#1e3a8a', '#581c87'];
    let hp = 70;
    let armor = 0;
    let speed = 78;
    let damage = 14;
    let radius = 12;

    if (isKing) {
      hp = 1950;
      armor = 18;
      speed = 92;
      damage = 44;
      radius = 28;
    } else if (isGuardZombie) {
      hp = 145;
      armor = 16;
      speed = 88;
      damage = 20;
      radius = 13;
    } else if (isBrute) {
      hp = 195;
      armor = 8;
      speed = 62;
      damage = 28;
      radius = 16;
    } else if (isRunner) {
      hp = 52;
      speed = 135;
      damage = 12;
      radius = 11;
    } else if (isSpitter) {
      hp = 85;
      speed = 84;
      damage = 16;
      radius = 12;
    }

    if (isBodybuilder && !isKing) {
      hp = Math.round(hp * 2.25);
      damage = Math.round(damage * 1.45);
      speed = Math.round(speed * 1.08);
      radius = Math.max(radius, 15);
    }

    let missingArm = 'none';
    let missingLeg = 'none';
    if (!isKing && !isBodybuilder && !isGuardZombie) {
      const mRoll = Math.random();
      if (mRoll < 0.2) missingArm = 'front';
      else if (mRoll < 0.34) {
        missingLeg = 'front';
        speed = Math.round(speed * 0.72);
      }
    }

    const z: GameEntity = {
      kind: 'zombie',
      subType: type,
      name: isKing
        ? 'Zombie King Titan'
        : isGuardZombie
          ? 'Armored Guard Zombie'
          : isBodybuilder
            ? 'Giant Bodybuilder Zombie'
            : type,
      x,
      y,
      hp,
      maxHp: hp,
      armor,
      damaged: false,
      speed,
      damage,
      radius,
      isBodybuilder,
      missingArm,
      missingLeg,
      shirtColor: isKing ? '#4c0519' : shirts[Math.floor(Math.random() * shirts.length)],
      facingDir: 1,
      walkCycle: 0,
      spitTimer: 1.5 + Math.random() * 1.5,
      roarTimer: isKing ? 4 : 0,
      bloodDropTimer: 0.4 + Math.random() * 0.5,
      leapCooldown: isKing ? 5.5 : 0,
      leapPhase: null,
      leapTimer: 0,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 2,
      attackTimer: 0,
      objectBashTimer: 0,
      hurtFlash: 0,
      aiTickAccum: Math.random() * 0.2,
      ...extra,
    };
    this.entities.push(z);
    return z;
  }

  // ---------------------------------------------------------
  // INVENTORY, GEAR, CRAFTING, STORAGE & SHOPS
  // ---------------------------------------------------------
  giveItem(id: string, count = 1, level = 1): boolean {
    const def = ITEMS[id];
    if (!def) return false;
    let remaining = count;
    if (def.stackable) {
      const maxS = def.maxStack || 99;
      for (let i = 0; i < this.player.inventory.length; i++) {
        const s = this.player.inventory[i];
        if (s && s.id === id && s.count < maxS) {
          const add = Math.min(remaining, maxS - s.count);
          s.count += add;
          remaining -= add;
          if (remaining <= 0) break;
        }
      }
    }
    while (remaining > 0) {
      const idx = this.player.inventory.findIndex((s) => s === null);
      if (idx === -1) break;
      const maxS = def.stackable ? def.maxStack || 99 : 1;
      const add = Math.min(remaining, maxS);
      this.player.inventory[idx] = { id, count: add, level };
      remaining -= add;
    }
    this.callbacks.onInventoryChanged?.();
    return remaining === 0;
  }

  countItem(id: string): number {
    let t = 0;
    for (const s of this.player.inventory) {
      if (s && s.id === id) t += s.count;
    }
    return t;
  }

  removeItem(id: string, count = 1): boolean {
    let rem = count;
    for (let i = 0; i < this.player.inventory.length; i++) {
      const s = this.player.inventory[i];
      if (s && s.id === id) {
        const take = Math.min(rem, s.count);
        s.count -= take;
        rem -= take;
        if (s.count <= 0) this.player.inventory[i] = null;
        if (rem <= 0) break;
      }
    }
    this.callbacks.onInventoryChanged?.();
    return rem === 0;
  }

  selectHotbarSlot(index: number) {
    if (index < 0 || index > 8) return;
    this.player.activeSlot = index;
    this.callbacks.onInventoryChanged?.();
  }

  handleInventoryClick(slotIndex: number) {
    const slot = this.player.inventory[slotIndex];
    if (!slot) return;
    const def = ITEMS[slot.id];
    if (!def) return;

    if (def.type === 'armor' && def.slot) {
      const old = this.player.equipment[def.slot];
      this.player.equipment[def.slot] = slot;
      this.player.inventory[slotIndex] = old;
      audio.sfxPickup();
      this.toast(`Equipped ${def.name}`, 'sky');
      this.callbacks.onInventoryChanged?.();
    } else if (def.type === 'shield') {
      const old = this.player.equipment.shield;
      this.player.equipment.shield = slot;
      this.player.inventory[slotIndex] = old;
      audio.sfxPickup();
      this.toast(`Equipped ${def.name}`, 'sky');
      this.callbacks.onInventoryChanged?.();
    } else if (def.type === 'food') {
      this.consumeFood(slotIndex);
    } else if (slotIndex >= 9) {
      const target = this.player.activeSlot;
      const tmp = this.player.inventory[target];
      this.player.inventory[target] = slot;
      this.player.inventory[slotIndex] = tmp;
      this.callbacks.onInventoryChanged?.();
    }
  }

  unequipSlot(slotName: 'head' | 'body' | 'feet' | 'shield') {
    const eq = this.player.equipment[slotName];
    if (!eq) return;
    const empty = this.player.inventory.findIndex((s) => s === null);
    if (empty === -1) {
      this.toast('Inventory full!', 'rose');
      return;
    }
    this.player.inventory[empty] = eq;
    this.player.equipment[slotName] = null;
    this.callbacks.onInventoryChanged?.();
  }

  consumeFood(slotIndex: number) {
    const slot = this.player.inventory[slotIndex];
    if (!slot) return;
    const def = ITEMS[slot.id];
    if (!def || def.type !== 'food') return;
    this.player.hunger = Math.min(this.player.maxHunger, this.player.hunger + (def.hunger || 0));
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + (def.heal || 0));
    this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + (def.stamina || 0));
    if (def.speedBoost) {
      this.player.speedBoostTimer = Math.max(this.player.speedBoostTimer, def.speedBoost);
      this.toast(`⚡ SPRINT BOOST +${def.speedBoost}s!`, 'amber');
    }
    if (def.curesPoison && this.player.poisonTimer > 0) {
      this.player.poisonTimer = 0;
      this.toast('💚 Poison Cured!', 'emerald');
    }
    slot.count--;
    if (slot.count <= 0) this.player.inventory[slotIndex] = null;
    if (def.curesPoison) audio.sfxHeal();
    else audio.sfxEat();
    this.spawnFloatingText(this.player.x, this.player.y - 20, `+${def.heal || def.hunger || 10} Vitality`, '#4ade80');
    this.callbacks.onInventoryChanged?.();
  }

  craftRecipe(recipeId: string): boolean {
    const r = RECIPES.find((x) => x.id === recipeId);
    if (!r) return false;
    if (r.cash && this.player.cash < r.cash) {
      this.toast(`Need $${r.cash} Cash!`, 'rose');
      return false;
    }
    for (const [k, v] of Object.entries(r.cost)) {
      if (this.countItem(k) < v) {
        this.toast(`Missing ${ITEMS[k]?.name || k}`, 'rose');
        return false;
      }
    }
    if (r.cash) this.player.cash -= r.cash;
    for (const [k, v] of Object.entries(r.cost)) this.removeItem(k, v);
    this.giveItem(r.result, r.count);
    audio.sfxCraft();
    this.toast(`Crafted ${ITEMS[r.result]?.name || r.result} x${r.count}!`, 'emerald');
    return true;
  }

  upgradeInventorySlot(slotIndex: number): boolean {
    const item = this.player.inventory[slotIndex];
    if (!item) return false;
    const def = ITEMS[item.id];
    if (!def || (def.type !== 'weapon' && def.type !== 'tool' && def.type !== 'armor' && def.type !== 'shield')) {
      return false;
    }
    const lvl = item.level || 1;
    if (lvl >= 5) return false;
    const reqIron = lvl * 2;
    const reqGold = Math.max(0, lvl - 1);
    const reqCash = lvl * 35;
    if (this.countItem('iron') < reqIron || this.countItem('gold') < reqGold || this.player.cash < reqCash) {
      this.toast('Insufficient Iron, Gold or Cash!', 'rose');
      return false;
    }
    this.removeItem('iron', reqIron);
    if (reqGold > 0) this.removeItem('gold', reqGold);
    this.player.cash -= reqCash;
    item.level = lvl + 1;
    audio.sfxAnvil();
    this.toast(`Upgraded ${def.name} to Lv.${item.level}!`, 'amber');
    this.callbacks.onInventoryChanged?.();
    return true;
  }

  transferStorageSlot(fromStorage: boolean, index: number) {
    const container = this.activeStorageHorse ? this.activeStorageHorse.items : this.activeStorageObj?.items;
    if (!container) return;

    if (fromStorage) {
      const it = container[index];
      if (!it) return;
      if (this.giveItem(it.id, it.count, it.level || 1)) {
        container[index] = null;
        audio.sfxPickup();
      } else {
        this.toast('Inventory full!', 'rose');
      }
    } else {
      const it = this.player.inventory[index];
      if (!it) return;
      const emptyIdx = container.findIndex((s) => s === null);
      if (emptyIdx === -1) {
        this.toast('Container is full!', 'rose');
        return;
      }
      container[emptyIdx] = it;
      this.player.inventory[index] = null;
      audio.sfxPickup();
      this.callbacks.onInventoryChanged?.();
    }
  }

  convertGoldToCash(sellAll: boolean) {
    const count = this.countItem('gold');
    if (count <= 0) {
      this.toast('No Golden Ore to exchange! Mine Caves NW!', 'rose');
      return;
    }
    const amt = sellAll ? count : 1;
    this.removeItem('gold', amt);
    this.player.cash += amt * 120;
    audio.sfxCashRegister();
    this.toast(`Sold ${amt} Golden Ore for +$${amt * 120} Cash!`, 'amber');
  }

  buyMerchantItem(itemId: string, price: number, count = 1) {
    if (this.player.cash < price) {
      this.toast(`Need $${price} Cash!`, 'rose');
      return;
    }
    this.player.cash -= price;
    this.giveItem(itemId, count);
    audio.sfxCashRegister();
    this.toast(`Purchased ${ITEMS[itemId]?.name || itemId}!`, 'emerald');
  }

  getPlayerArmor(): number {
    let a = 0;
    const slots = [this.player.equipment.head, this.player.equipment.body, this.player.equipment.feet];
    for (const eq of slots) {
      if (eq && ITEMS[eq.id]?.armor) {
        a += Math.round((ITEMS[eq.id].armor || 0) * (1 + ((eq.level || 1) - 1) * 0.25));
      }
    }
    return a;
  }

  getTotalPowerBonus(lvl = 1): number {
    return 1 + (lvl - 1) * 0.24 + (this.player.level - 1) * 0.04;
  }

  // ---------------------------------------------------------
  // COMPUTER OS & WORLD EVENTS
  // ---------------------------------------------------------
  getNearbyComputer(): GridObject | null {
    const ptx = Math.floor(this.player.x / TILE_SIZE);
    const pty = Math.floor(this.player.y / TILE_SIZE);
    let best: GridObject | null = null;
    let bestDist = 110;
    for (let ty = pty - 4; ty <= pty + 4; ty++) {
      for (let tx = ptx - 4; tx <= ptx + 4; tx++) {
        const obj = this.objects.get(`${tx},${ty}`);
        if (obj && obj.type === 'old_computer') {
          const d = Math.hypot((obj.tx + 0.5) * TILE_SIZE - this.player.x, (obj.ty + 0.5) * TILE_SIZE - this.player.y);
          if (d < bestDist) {
            bestDist = d;
            best = obj;
          }
        }
      }
    }
    return best;
  }

  toggleNearbyComputer() {
    const comp = this.getNearbyComputer();
    if (!comp) return;
    comp.isOn = !comp.isOn;
    audio.sfxComputerBoot(comp.isOn);
    this.toast(comp.isOn ? '🖥️ ComputerOS Booted ON!' : '🖥️ ComputerOS Powered OFF', comp.isOn ? 'emerald' : 'sky');
  }

  runComputerWorkShift() {
    const comp = this.getNearbyComputer();
    if (!comp) return;
    if (!comp.isOn) comp.isOn = true;
    if (comp.cooldown > 0) {
      this.toast(`ComputerOS Shift ready in ${Math.ceil(comp.cooldown)}s`, 'amber');
      return;
    }
    comp.cooldown = 15;
    this.player.cash += 45;
    this.player.xp += 20;
    audio.sfxCashRegister();
    this.spawnFloatingText(this.player.x, this.player.y - 26, '+$45 Job Shift', '#10b981');
    this.toast('💼 Completed ComputerOS Job Shift: +$45 Cash!', 'emerald');
  }

  private spendPresidentTreasury(city: CityData, cost: number, allowPartial = true): number {
    const avail = Math.max(0, Math.round(city.presidentCash || 0));
    if (!allowPartial && avail < cost) return -1;
    const spent = Math.min(avail, Math.max(0, Math.round(cost)));
    city.presidentCash = Math.max(0, avail - spent);
    return spent;
  }

  dispatchBuildersNow() {
    const city = this.findNearestCity(this.player.x, this.player.y) || this.cities[0];
    if (!city) {
      this.toast('No city discovered yet!', 'rose');
      return;
    }
    const nextExp = EXPANSION_SEQUENCE.find((id) => !city.expansionsBuilt[id]) || 'fortify_walls';
    const site = getExpansionSiteCoords(city, nextExp);

    const spent = this.spendPresidentTreasury(city, 40, true);
    let ordered = 0;
    for (const ent of this.entities) {
      if (ent.kind === 'builder' && ent.city === city) {
        ent.buildTask = {
          expansionId: nextExp,
          targetX: site.x,
          targetY: site.y,
          label: site.label,
          workTimer: 3.5,
        };
        ordered++;
      }
    }
    city.presidentOrder = `🏗️ ORDERED ${site.label.toUpperCase()} (-$${spent})`;
    audio.sfxPresidentCommand();
    if (spent > 0) audio.sfxCashRegister();
    this.toast(`🏛️👷 President spent $${spent} (Left: $${city.presidentCash}) & dispatched ${ordered} Builders to build ${site.label}!`, 'amber');
  }

  getCityRepairTargets(
    city: CityData,
    zoneFilter: 'all' | 'military_base' | 'gas_station' | 'white_house' | 'farmland' = 'all'
  ): { tx: number; ty: number; name: string; type: string; zone: string; destroyed: boolean }[] {
    const targets: { tx: number; ty: number; name: string; type: string; zone: string; destroyed: boolean }[] = [];
    const seen = new Set<string>();

    if (city.blueprints) {
      for (const bp of city.blueprints) {
        if (zoneFilter !== 'all' && bp.zone !== zoneFilter) continue;
        const key = `${bp.tx},${bp.ty}`;
        if (seen.has(key)) continue;
        const obj = this.objects.get(key);
        if (!obj) {
          seen.add(key);
          targets.push({
            tx: bp.tx,
            ty: bp.ty,
            name: OBJECT_DEFS[bp.type]?.name || bp.type,
            type: bp.type,
            zone: bp.zone,
            destroyed: true,
          });
        } else if (obj.damaged || obj.hp < obj.maxHp) {
          seen.add(key);
          targets.push({
            tx: bp.tx,
            ty: bp.ty,
            name: obj.name,
            type: obj.type,
            zone: bp.zone,
            destroyed: false,
          });
        }
      }
    }

    if (zoneFilter === 'all') {
      const r = Math.max(city.radius + 700, 1800);
      for (const obj of this.objects.values()) {
        const key = `${obj.tx},${obj.ty}`;
        if (seen.has(key)) continue;
        if (!obj.damaged && obj.hp >= obj.maxHp) continue;
        const ox = (obj.tx + 0.5) * TILE_SIZE;
        const oy = (obj.ty + 0.5) * TILE_SIZE;
        if (Math.abs(ox - city.x) <= r && Math.abs(oy - city.y) <= r) {
          seen.add(key);
          targets.push({
            tx: obj.tx,
            ty: obj.ty,
            name: obj.name,
            type: obj.type,
            zone: 'city',
            destroyed: false,
          });
        }
      }
    }

    // Prioritize critical facilities (Gas Pumps, RADAR, Iron Doors, Turrets, Walls)
    const prio = (t: string) =>
      t === 'gas_pump' ? 0 : t === 'military_radar' ? 1 : t === 'iron_door' || t === 'turret' ? 2 : t === 'door' ? 3 : 4;
    targets.sort((a, b) => prio(a.type) - prio(b.type));
    return targets;
  }

  commandPresidentFixBuildings(
    targetCity?: CityData,
    zoneFilter: 'all' | 'military_base' | 'gas_station' | 'white_house' | 'farmland' = 'all'
  ) {
    const city = targetCity || this.findNearestCity(this.player.x, this.player.y) || this.cities[0];
    if (!city) return;
    const targets = this.getCityRepairTargets(city, zoneFilter);
    const zoneLabel =
      zoneFilter === 'military_base'
        ? 'Military Base'
        : zoneFilter === 'gas_station'
          ? 'Gas Station'
          : zoneFilter === 'white_house'
            ? 'White House'
            : zoneFilter === 'farmland'
              ? 'Farmland & Farmhouse'
              : city.name;

    if (targets.length === 0) {
      if (zoneFilter === 'all') {
        this.toast(`🏛️ ${city.name} buildings are intact! Ordering 15 Builders to build next district.`, 'sky');
        this.dispatchBuildersNow();
      } else {
        this.toast(`🏛️ ${zoneLabel} is already 100% intact!`, 'emerald');
      }
      return;
    }

    const spent = this.spendPresidentTreasury(city, 30, true);
    city.presidentOrder = `🔧 FIXING ${zoneLabel.toUpperCase()} (${targets.length}) (-$${spent})`;
    let assigned = 0;
    for (const b of this.entities) {
      if (b.kind === 'builder' && b.city === city) {
        const tgt = targets[assigned % targets.length];
        b.buildTask = {
          expansionId: 'fortify_walls',
          targetX: (tgt.tx + 0.5) * TILE_SIZE,
          targetY: (tgt.ty + 0.5) * TILE_SIZE,
          label: `${tgt.destroyed ? 'Rebuild' : 'Fix'} ${tgt.name}`,
          workTimer: tgt.destroyed ? 1.5 : 1.1,
          repairKey: `${tgt.tx},${tgt.ty}`,
          repairObjType: tgt.type,
          repairZone: zoneFilter,
        };
        assigned++;
      }
    }
    audio.sfxPresidentCommand();
    this.toast(`🏛️🔧 President spent $${spent} (Left: $${city.presidentCash}) & commanded ${assigned} Builders to fix ${targets.length} ${zoneLabel} structures!`, 'amber');
  }

  commandPresidentDeployDefense(targetCity?: CityData) {
    const city = targetCity || this.findNearestCity(this.player.x, this.player.y) || this.cities[0];
    if (!city) {
      this.toast('No city with Military Base found!', 'rose');
      return;
    }
    city.alertActive = true;
    city.defenseCooldown = 45;

    // Strict President order limits: MAX 5 Helicopters and MAX 15 Jeeps deployed per city!
    const MAX_PRESIDENT_HELIS = 5;
    const MAX_PRESIDENT_JEEPS = 15;

    let activeHelis = this.vehicles.filter(
      (v) => v.kind === 'helicopter' && v.cityRef === city && v.hp > 0 && (v.driver !== 'none' || v.engineOn)
    ).length;
    let activeJeeps = this.vehicles.filter(
      (v) => v.kind === 'jeep' && v.cityRef === city && v.hp > 0 && (v.driver !== 'none' || v.engineOn)
    ).length;

    const remHeliSlots = Math.max(0, MAX_PRESIDENT_HELIS - activeHelis);
    const remJeepSlots = Math.max(0, MAX_PRESIDENT_JEEPS - activeJeeps);

    if (remHeliSlots === 0 && remJeepSlots === 0) {
      const spent = this.spendPresidentTreasury(city, 15, true);
      city.presidentOrder = `🚨 MAX FORCE (${activeHelis}/5 HELIS • ${activeJeeps}/15 JEEPS) (-$${spent})`;
      audio.sfxPresidentCommand();
      return;
    }

    const wantHelis = Math.min(2, remHeliSlots);
    const wantJeeps = Math.min(4, remJeepSlots);
    const neededFbi = wantHelis + wantJeeps;

    // Collect free FBI agents (never draft the President's personal White House Secret Service FBI!)
    const freeFbi: GameEntity[] = this.entities.filter(
      (e) => e.kind === 'guard' && e.role === 'fbi' && e.city === city && !e.protectingPresident && !e.inVehicle && !e.assignedVehicle
    );
    while (freeFbi.length < neededFbi) {
      const spawnX = city.militaryCampX + (Math.random() - 0.5) * 48;
      const spawnY = city.militaryCampY + (Math.random() - 0.5) * 48;
      freeFbi.push(this.spawnGuard(spawnX, spawnY, 'fbi', city));
    }

    const freeHelis = this.vehicles.filter(
      (v) => v.kind === 'helicopter' && v.cityRef === city && v.driver === 'none' && !v.engineOn && v.hp > 0
    );
    const freeJeeps = this.vehicles.filter(
      (v) => v.kind === 'jeep' && v.cityRef === city && v.driver === 'none' && !v.engineOn && v.hp > 0
    );

    let heliCount = 0;
    let jeepCount = 0;
    let fbiIdx = 0;

    for (let h = 0; h < wantHelis && h < freeHelis.length && fbiIdx < freeFbi.length; h++) {
      const fbi = freeFbi[fbiIdx++];
      const heli = freeHelis[h];
      fbi.assignedVehicle = heli;
      fbi.restingAtCamp = false;
      heli.engineOn = true;
      heliCount++;
      activeHelis++;
    }
    for (let j = 0; j < wantJeeps && j < freeJeeps.length && fbiIdx < freeFbi.length; j++) {
      const fbi = freeFbi[fbiIdx++];
      const jeep = freeJeeps[j];
      fbi.assignedVehicle = jeep;
      fbi.restingAtCamp = false;
      jeep.engineOn = true;
      jeep.headlightsOn = true;
      jeepCount++;
      activeJeeps++;
    }

    const deployCost = 20 + heliCount * 15 + jeepCount * 8;
    const spent = this.spendPresidentTreasury(city, deployCost, true);
    city.presidentOrder = `🚨 ORDERED: ${activeHelis}/5 HELIS • ${activeJeeps}/15 JEEPS (-$${spent})`;
    audio.sfxPresidentCommand();
    this.toast(
      `🏛️ President spent $${spent} (Left: $${city.presidentCash}) & ordered ${heliCount} Helis & ${jeepCount} Jeeps to defend ${city.name}!`,
      'sky'
    );
  }

  getCityMetrics(city: CityData) {
    const now = performance.now();
    const cached = this.cityMetricsCache.get(city);
    if (cached && now - cached.ts < 1200) {
      return cached.data;
    }

    let population = 0;
    let zombiesInCity = 0;
    const zCheckR = city.radius + 320;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.hp <= 0) continue;
      if (e.kind === 'zombie') {
        if (Math.abs(e.x - city.x) <= zCheckR && Math.abs(e.y - city.y) <= zCheckR) zombiesInCity++;
      } else if (e.city === city) {
        population++;
      }
    }

    const damagedList: GridObject[] = [];
    let totalCount = 0;
    const r = Math.max(city.radius + 700, 1800);
    for (const obj of this.objects.values()) {
      const ox = (obj.tx + 0.5) * TILE_SIZE;
      const oy = (obj.ty + 0.5) * TILE_SIZE;
      if (Math.abs(ox - city.x) <= r && Math.abs(oy - city.y) <= r) {
        totalCount++;
        if (obj.damaged || obj.hp < obj.maxHp) damagedList.push(obj);
      }
    }
    const repairTargets = this.getCityRepairTargets(city, 'all');
    const data = { population, damagedList, repairTargets, totalCount, zombiesInCity };
    this.cityMetricsCache.set(city, { ts: now, data });
    return data;
  }

  evaluatePresidentCityCommand(city: CityData, dangerEvent = false) {
    const { population, damagedList, repairTargets, totalCount, zombiesInCity } = this.getCityMetrics(city);
    const veryLowPop = population <= 20;
    const badlyDamaged =
      damagedList.length >= 8 || (totalCount > 0 && damagedList.length / totalCount >= 0.18) || totalCount < 35;

    // 1. RETREAT COMMAND: Population very low AND city damaged badly!
    if (veryLowPop && badlyDamaged) {
      if (!city.surrendered) {
        const spent = this.spendPresidentTreasury(city, 25, true);
        city.surrendered = true;
        city.flagColor = '#ffffff';
        city.alertActive = true;
        city.presidentOrder = `🏳️ RETREAT ORDERED (-$${spent} Treasury)`;
        for (const e of this.entities) {
          if (e.city === city && (e.kind === 'villager' || e.kind === 'builder' || e.kind === 'merchant')) {
            e.rallyX = city.militaryBaseX;
            e.rallyY = city.militaryBaseY;
            e.rallyTimer = 35;
            e.fleeTimer = 25;
            e.buildTask = null;
          }
        }
        audio.sfxPresidentCommand();
        audio.sfxAlert();
        this.toast(
          `🏛️🏳️ PRESIDENT ORDERED RETREAT in ${city.name} (-$${spent})! Population critical (${population}) & city badly damaged!`,
          'rose'
        );
      }
      return;
    }

    // 2. EVENT DANGER / ZOMBIE THREAT: President commands limited Helicopters (max 5) & Jeeps (max 15)!
    if (dangerEvent || zombiesInCity > 0) {
      city.alertActive = true;
      if ((city.defenseCooldown || 0) <= 0) {
        this.commandPresidentDeployDefense(city);
      }
    } else if (zombiesInCity === 0 && repairTargets.length === 0) {
      city.alertActive = false;
    }

    // 3. DAMAGED OR DESTROYED CITY/MILITARY/GAS/WHITE HOUSE: President commands 15 Builders to fix/rebuild!
    if (repairTargets.length > 0 && (city.repairCooldown || 0) <= 0) {
      city.repairCooldown = 12;
      let assigned = 0;
      for (const b of this.entities) {
        if (b.kind === 'builder' && b.city === city && !b.buildTask) {
          const tgt = repairTargets[assigned % repairTargets.length];
          b.buildTask = {
            expansionId: 'fortify_walls',
            targetX: (tgt.tx + 0.5) * TILE_SIZE,
            targetY: (tgt.ty + 0.5) * TILE_SIZE,
            label: `${tgt.destroyed ? 'Rebuild' : 'Repair'} ${tgt.name}`,
            workTimer: tgt.destroyed ? 1.5 : 1.2,
            repairKey: `${tgt.tx},${tgt.ty}`,
            repairObjType: tgt.type,
            repairZone: 'all',
          };
          assigned++;
        }
      }
      if (assigned > 0) {
        const spent = this.spendPresidentTreasury(city, 25, true);
        city.presidentOrder = `🔧 BUILDERS FIXING ${repairTargets.length} STRUCTURES (-$${spent})`;
        audio.sfxPresidentCommand();
        this.toast(
          `🏛️👷 President spent $${spent} (Left: $${city.presidentCash}) & ordered ${assigned} Builders to fix ${repairTargets.length} structures!`,
          'amber'
        );
      }
    }
  }

  triggerWorldEvent(eventId: string) {
    const ev = this.worldEvents.find((e) => e.id === eventId);
    if (ev) ev.timer = ev.interval;

    if (eventId === 'bloodmoon') {
      this.bloodmoonTimer = 50;
      this.timeOfDay = 0.85;
      this.screenShake = 0.85;
      audio.sfxBloodmoonHowl();
      this.toast('🌑 CRIMSON BLOODMOON RISES! Super Spitters & Horde Surges incoming!', 'rose');
      const city = this.findNearestCity(this.player.x, this.player.y) || this.cities[0];
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        const dist = 360 + Math.random() * 140;
        const type = i % 3 === 0 ? 'spitter' : i % 5 === 0 ? 'brute' : 'runner';
        this.spawnZombie(type, this.player.x + Math.cos(a) * dist, this.player.y + Math.sin(a) * dist, {
          targetCity: city || null,
          isBodybuilder: i % 4 === 0,
        });
      }
      if (city) this.evaluatePresidentCityCommand(city, true);
    } else if (eventId === 'raid') {
      // TIMER EVENT: Spawn Far City & march zombies directly into that Far City!
      let farCity = this.cities.find((c) => c.isFarCity);
      if (!farCity || this.cities.filter((c) => c.isFarCity).length < 2) {
        const angle = (this.cities.length * 1.9 + 0.6) % (Math.PI * 2);
        const distTiles = 52;
        const ftx = Math.round(this.player.x / TILE_SIZE + Math.cos(angle) * distTiles);
        const fty = Math.round(this.player.y / TILE_SIZE + Math.sin(angle) * distTiles);
        const created = generateLargeCity(this, ftx, fty, true);
        if (created) farCity = created;
      }

      const targetCity = farCity || this.cities[this.cities.length - 1] || this.cities[0];
      if (targetCity) {
        targetCity.alertActive = true;

        // Spawn 26 marching zombies outside the Far City heading straight inside!
        for (let i = 0; i < 26; i++) {
          const a = (Math.PI * 2 * i) / 26;
          const spawnDist = targetCity.radius + 140 + (i % 3) * 55;
          const zx = targetCity.x + Math.cos(a) * spawnDist;
          const zy = targetCity.y + Math.sin(a) * spawnDist;
          const zType = i % 7 === 0 ? 'brute' : i % 4 === 0 ? 'spitter' : i % 2 === 0 ? 'runner' : 'walker';
          this.spawnZombie(zType, zx, zy, {
            targetCity,
            isBodybuilder: i % 8 === 0,
          });
        }
        this.evaluatePresidentCityCommand(targetCity, true);
        audio.sfxAlert();
        this.toast(`🏙️ TIMER EVENT: ${targetCity.name} spawned! 26 Zombies marching into the city!`, 'rose');
      }
    } else if (eventId === 'supply_drop') {
      const a = Math.random() * Math.PI * 2;
      const d = 160 + Math.random() * 140;
      const tx = Math.floor((this.player.x + Math.cos(a) * d) / TILE_SIZE);
      const ty = Math.floor((this.player.y + Math.sin(a) * d) / TILE_SIZE);
      if (!isWaterTile(getTile(this, tx, ty))) {
        placeObject(this, tx, ty, 'chest', false, [
          { id: 'rifle', count: 1 },
          { id: 'ammo_heavy', count: 45 },
          { id: 'grenade', count: 4 },
          { id: 'gold', count: 3 },
          { id: 'medkit', count: 2 },
        ]);
        placeObject(this, tx + 1, ty, 'lantern', false);
        audio.sfxAlert();
        this.toast(`🪂 Military Air-Drop landed at (${tx}, ${ty})!`, 'amber');
      }
    } else if (eventId === 'boss_king') {
      // Boss event ALWAYS spawns at a Far City far away from the player (NEVER on/near the player)!
      let farCity: CityData | null = null;
      let bestFarDist = -1;
      for (const c of this.cities) {
        if (!c.isFarCity) continue;
        const d = Math.hypot(c.x - this.player.x, c.y - this.player.y);
        if (d >= 36 * TILE_SIZE && d > bestFarDist) {
          bestFarDist = d;
          farCity = c;
        }
      }
      if (!farCity) {
        const baseAngle = (this.cities.length * 2.1 + 0.7) % (Math.PI * 2);
        for (let attempt = 0; attempt < 8; attempt++) {
          const ang = baseAngle + attempt * (Math.PI / 4);
          const distTiles = 60 + attempt * 6;
          const ftx = Math.round(this.player.x / TILE_SIZE + Math.cos(ang) * distTiles);
          const fty = Math.round(this.player.y / TILE_SIZE + Math.sin(ang) * distTiles);
          const created = generateLargeCity(this, ftx, fty, true);
          if (created) {
            farCity = created;
            break;
          }
        }
      }
      if (!farCity) {
        // Fallback: pick whichever city is farthest from the player
        let maxD = -1;
        for (const c of this.cities) {
          const d = Math.hypot(c.x - this.player.x, c.y - this.player.y);
          if (d > maxD) {
            maxD = d;
            farCity = c;
          }
        }
      }

      const spawnAngle = Math.random() * Math.PI * 2;
      const farOffset = farCity ? farCity.radius * 0.75 : 1850;
      const bx = farCity ? farCity.x + Math.cos(spawnAngle) * farOffset : this.player.x + Math.cos(spawnAngle) * 1850;
      const by = farCity ? farCity.y + Math.sin(spawnAngle) * farOffset : this.player.y + Math.sin(spawnAngle) * 1850;
      const boss = this.spawnZombie('king', bx, by, { targetCity: farCity });
      if (farCity) farCity.alertActive = true;

      // 5 Close Escort Giant Bodybuilders circling the King
      for (let i = 0; i < 5; i++) {
        const ea = (Math.PI * 2 * i) / 5;
        this.spawnZombie('brute', bx + Math.cos(ea) * 65, by + Math.sin(ea) * 65, {
          isBodybuilder: true,
          escortBoss: boss,
          escortOffsetAngle: ea,
          escortOffsetDist: 70,
          targetCity: farCity,
        });
      }

      // Summon 750 Horde Zombies, Guard Zombies & Bodybuilder Zombies around Far City to protect King & attack!
      for (let i = 0; i < 750; i++) {
        const za = Math.random() * Math.PI * 2;
        const zd = 95 + Math.random() * 480;
        const zx = bx + Math.cos(za) * zd;
        const zy = by + Math.sin(za) * zd;
        const roll = i % 20;
        const zType =
          roll < 4
            ? 'guard_zombie'
            : roll < 8
              ? 'brute'
              : roll < 11
                ? 'spitter'
                : roll < 16
                  ? 'runner'
                  : 'walker';
        const isBB = zType === 'brute' || (roll === 19 && zType === 'walker');
        this.spawnZombie(zType, zx, zy, {
          isBodybuilder: isBB,
          escortBoss: i % 3 === 0 ? boss : null,
          targetCity: farCity,
        });
      }

      if (farCity) this.evaluatePresidentCityCommand(farCity, true);
      this.screenShake = 1.0;
      audio.sfxBossRoarEarthquake();
      this.toast(
        `👑 ZOMBIE KING TITAN + 750 Horde spawned at ${farCity?.name || 'Far City'} (far from player)!`,
        'rose'
      );
    } else if (eventId === 'meteor_shower' || eventId === 'meteor') {
      const targetCity = this.findNearestCity(this.player.x, this.player.y) || this.cities[0];
      const originX = targetCity ? targetCity.x : this.player.x;
      const originY = targetCity ? targetCity.y : this.player.y;
      for (let i = 0; i < 15; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = targetCity ? 80 + Math.random() * (targetCity.radius * 0.88) : 140 + Math.random() * 280;
        this.meteorImpacts.push({
          x: originX + Math.cos(a) * d,
          y: originY + Math.sin(a) * d,
          timer: 1.5 + i * 0.22,
          radius: 82,
          isPoison: true,
        });
      }
      if (targetCity) this.evaluatePresidentCityCommand(targetCity, true);
      audio.sfxMeteorIncoming();
      audio.sfxAlert();
      this.toast('☄️☣️ METEOR SHOWER! Poison & explosive meteors incoming, damaging objects!', 'rose');
    }
  }

  isGasStationOperational(city?: CityData | null): boolean {
    const c = city || this.cities[0];
    if (!c || c.gasStationX === undefined || c.gasStationY === undefined) return false;
    const gtx = Math.floor(c.gasStationX / TILE_SIZE);
    const gty = Math.floor(c.gasStationY / TILE_SIZE);
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const obj = this.objects.get(`${gtx + dx},${gty + dy}`);
        if (obj && obj.type === 'gas_pump' && obj.hp > 0) {
          c.gasStationBroken = false;
          return true;
        }
      }
    }
    c.gasStationBroken = true;
    return false;
  }

  isPresidentAlive(city?: CityData | null): boolean {
    return this.entities.some(
      (e) => e.kind === 'president' && e.hp > 0 && (!city || e.city === city)
    );
  }

  isVehicleAtGasStation(v: Vehicle): boolean {
    for (const c of this.cities) {
      if (c.gasStationX !== undefined && c.gasStationY !== undefined) {
        if (Math.hypot(v.x - c.gasStationX, v.y - c.gasStationY) <= 145) return true;
      }
    }
    return false;
  }

  refuelVehicleAtGasStation(explicitVehicle?: Vehicle | null): boolean {
    let targetV: Vehicle | null = explicitVehicle || this.player.inVehicle || null;
    if (!targetV) {
      let bestD = 240;
      for (const v of this.vehicles) {
        if (v.hp <= 0) continue;
        const d = Math.hypot(v.x - this.player.x, v.y - this.player.y);
        if (d < bestD) {
          bestD = d;
          targetV = v;
        }
      }
    }
    if (!targetV) {
      this.toast('⛽ Bring a Car, Jeep or Helicopter near the Gas Station to fuel up!', 'amber');
      return true;
    }
    const needed = Math.max(0, (targetV.maxFuel || 100) - targetV.fuel);
    if (needed < 1) {
      this.toast(`⛽ ${targetV.name} tank is already 100% full!`, 'sky');
      return true;
    }

    const city = targetV.cityRef || this.findNearestCity(targetV.x, targetV.y) || this.cities[0];
    const gasOperational = this.isGasStationOperational(city);

    // If Gas Station is broken, vehicles can't fuel anymore UNLESS the President is alive and has money ($50+)!
    if (!gasOperational) {
      const presAlive = this.isPresidentAlive(city);
      const emergencyCost = 50;
      if (city && presAlive && city.presidentCash >= emergencyCost) {
        city.presidentCash -= emergencyCost;
        targetV.fuel = targetV.maxFuel || 100;
        targetV.refueling = false;
        audio.sfxRefuel();
        this.spawnFloatingText(targetV.x, targetV.y - 26, `🏛️⛽ PRES PAID $${emergencyCost} FUEL!`, '#38bdf8');
        this.toast(
          `🏛️⛽ Gas Station broken, but President spent $${emergencyCost} Treasury money (Left: $${city.presidentCash}) to fuel ${targetV.name}!`,
          'sky'
        );
        return true;
      }
      audio.sfxHit();
      this.spawnFloatingText(targetV.x, targetV.y - 26, '⛽🚫 GAS BROKEN • NO PRES $', '#f43f5e');
      this.toast(
        `⛽🚫 Gas Station is BROKEN! Vehicles cannot fuel unless the President has money ($50+ needed, Treasury: $${city?.presidentCash ?? 0})!`,
        'rose'
      );
      return true;
    }

    if (this.player.cash <= 0) {
      this.toast('💵 You need Cash ($) to pay the Villager Gas Man! Mine Gold NW or fight zombies!', 'rose');
      return true;
    }
    // $1 pays for 2% fuel (so you fuel proportionally up to how much cash you have!)
    const fullCost = Math.max(1, Math.ceil(needed / 2));
    const paid = Math.min(this.player.cash, fullCost);
    const fuelGain = Math.min(needed, paid * 2);
    targetV.fuel = Math.min(targetV.maxFuel || 100, targetV.fuel + fuelGain);
    targetV.refueling = false;
    this.player.cash -= paid;
    audio.sfxRefuel();
    this.spawnFloatingText(targetV.x, targetV.y - 26, `⛽ +${Math.round(fuelGain)}% FUEL (-$${paid})`, '#4ade80');
    this.toast(`⛽ Gas Man refueled ${targetV.name}: +${Math.round(fuelGain)}% Fuel for $${paid} Cash!`, 'emerald');
    return true;
  }

  repairVehicleAtGasStation(explicitVehicle?: Vehicle | null): boolean {
    let targetV: Vehicle | null = explicitVehicle || this.player.inVehicle || null;
    if (!targetV) {
      let bestD = 240;
      for (const v of this.vehicles) {
        if (v.hp <= 0 || v.hp >= v.maxHp) continue;
        const d = Math.hypot(v.x - this.player.x, v.y - this.player.y);
        if (d < bestD) {
          bestD = d;
          targetV = v;
        }
      }
    }
    if (!targetV) {
      this.toast('🔧 Bring a damaged Car, Jeep or Helicopter to the Gas Station Mechanic to repair!', 'sky');
      return true;
    }
    if (targetV.hp >= targetV.maxHp) {
      targetV.repairing = false;
      this.toast(`🔧 ${targetV.name} is already at 100% HP!`, 'emerald');
      return true;
    }

    targetV.repairing = true;
    const gain = Math.max(18, Math.round(targetV.maxHp * 0.22));
    targetV.hp = Math.min(targetV.maxHp, targetV.hp + gain);
    this.spawnParticles(targetV.x, targetV.y - 6, '#38bdf8', 9, 85);
    this.spawnParticles(targetV.x, targetV.y - 6, '#facc15', 6, 70);

    if (targetV.hp >= targetV.maxHp) {
      targetV.hp = targetV.maxHp;
      targetV.repairing = false;
      audio.sfxCraft();
      this.spawnFloatingText(targetV.x, targetV.y - 26, '✅ 100% REPAIRED!', '#4ade80');
      this.toast(`🔧✅ ${targetV.name} fully repaired to 100% HP!`, 'emerald');
    } else {
      audio.sfxAnvil();
      const pct = Math.round((targetV.hp / targetV.maxHp) * 100);
      this.spawnFloatingText(targetV.x, targetV.y - 26, `🔧 +${gain} HP (${pct}%)`, '#38bdf8');
      this.toast(`🔧 Fixing ${targetV.name}: ${pct}% HP (Keep pressing [E] or let Mechanic finish!)`, 'sky');
    }
    return true;
  }

  // ---------------------------------------------------------
  // INTERACTIONS ([E] Vehicles, Gas Station, Doors, Chests, ComputerOS, TV, Horses, Merchants)
  // ---------------------------------------------------------
  interact() {
    if (this.player.dead || this.isModalOpen) return;

    // 1. If inside a vehicle -> exit cleanly
    if (this.player.inVehicle) {
      const v = this.player.inVehicle;
      v.driver = 'none';
      v.driverEntity = null;
      this.player.inVehicle = null;
      this.player.x = v.x + Math.cos(v.angle + Math.PI / 2) * (v.radius + 16);
      this.player.y = v.y + Math.sin(v.angle + Math.PI / 2) * (v.radius + 16);
      audio.sfxPickup();
      this.toast(`Exited ${v.name}`, 'sky');
      return;
    }

    // 2. If riding a horse -> dismount
    if (this.player.mountedHorse) {
      this.player.x = this.player.mountedHorse.x;
      this.player.y = this.player.mountedHorse.y + 18;
      this.player.mountedHorse = null;
      audio.sfxHorseNeigh();
      this.toast('Dismounted horse.', 'sky');
      return;
    }

    // 3. If seated -> stand up
    if (this.player.seatedObj) {
      this.player.seatedObj = null;
      this.toast('Stood up.', 'sky');
      return;
    }

    // 3b. Nearby Villager Gas Man (Fuel & Pay with your money!)
    for (const ent of this.entities) {
      if (ent.kind === 'villager' && ent.role === 'gas_attendant' && Math.hypot(ent.x - this.player.x, ent.y - this.player.y) < 56) {
        this.refuelVehicleAtGasStation();
        return;
      }
    }

    // 3c. Nearby Villager Mechanic Man at Gas Station (Fix low-HP vehicles with [E]!)
    for (const ent of this.entities) {
      if (ent.kind === 'villager' && ent.role === 'mechanic' && Math.hypot(ent.x - this.player.x, ent.y - this.player.y) < 62) {
        this.repairVehicleAtGasStation();
        return;
      }
    }

    // 4. Nearby Vehicle (Car, Military/FBI Jeeps, Armed Helicopters)
    let nearVehicle: Vehicle | null = null;
    let bestVDist = 64;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - this.player.x, v.y - this.player.y);
      if (d < bestVDist && v.hp > 0) {
        bestVDist = d;
        nearVehicle = v;
      }
    }
    if (nearVehicle) {
      // If vehicle is at the Gas Station and damaged (being repaired or < 75% HP), [E] helps fix it until ready!
      if (
        this.isVehicleAtGasStation(nearVehicle) &&
        nearVehicle.hp < nearVehicle.maxHp &&
        (nearVehicle.repairing || nearVehicle.hp < nearVehicle.maxHp * 0.75)
      ) {
        this.repairVehicleAtGasStation(nearVehicle);
        return;
      }

      const hadDriver = !!nearVehicle.driverEntity || nearVehicle.driver !== 'none';
      if (nearVehicle.driverEntity) {
        const oldDriver = nearVehicle.driverEntity;
        oldDriver.inVehicle = null;
        oldDriver.assignedVehicle = null;
        oldDriver.x = nearVehicle.x + Math.cos(nearVehicle.angle + Math.PI / 2) * (nearVehicle.radius + 16);
        oldDriver.y = nearVehicle.y + Math.sin(nearVehicle.angle + Math.PI / 2) * (nearVehicle.radius + 16);
        this.spawnFloatingText(oldDriver.x, oldDriver.y - 22, '🚶 STEPPED OUT', '#38bdf8');
      }
      nearVehicle.refueling = false;
      nearVehicle.repairing = false;
      nearVehicle.driver = 'player';
      nearVehicle.driverEntity = null;
      this.player.inVehicle = nearVehicle;
      audio.sfxPickup();
      this.toast(
        hadDriver
          ? `🚗 Took the driver seat of ${nearVehicle.name}! Previous driver stepped out.`
          : nearVehicle.kind === 'helicopter'
            ? `🚁 Piloting ${nearVehicle.name} (Fuel ${Math.round(nearVehicle.fuel)}%)! WASD to fly, LMB guns!`
            : `🚙 Driving ${nearVehicle.name} (Fuel ${Math.round(nearVehicle.fuel)}%)! [H] horn, [E] exit.`,
        'emerald'
      );
      return;
    }

    // 4b. Talk to President -> President briefs player on autonomous Presidential orders!
    const nearPres = this.entities.find(
      (e) => e.kind === 'president' && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 68
    );
    if (nearPres) {
      const c = nearPres.city;
      this.toast(`🏛️ President: "${c?.presidentOrder || 'I am commanding all city defenses, builders & FBI!'}"`, 'amber');
      return;
    }

    // 5. Nearby Merchant
    for (const ent of this.entities) {
      if (ent.kind === 'merchant' && Math.hypot(ent.x - this.player.x, ent.y - this.player.y) < 62) {
        this.activeMerchant = ent;
        this.callbacks.onMerchantOpen?.(ent);
        return;
      }
    }

    // 6. Nearby Horse
    const held = this.player.inventory[this.player.activeSlot];
    for (const ent of this.entities) {
      if (ent.kind === 'horse' && Math.hypot(ent.x - this.player.x, ent.y - this.player.y) < 58) {
        if (!ent.saddled) {
          if (held && held.id === 'saddle') {
            this.player.inventory[this.player.activeSlot] = null;
            ent.saddled = true;
            audio.sfxHorseNeigh();
            this.toast(`🐎 Tamed & saddled ${ent.name}! Press [E] to mount!`, 'emerald');
            this.callbacks.onInventoryChanged?.();
          } else {
            this.toast('Equip Saddle in active slot to tame this horse!', 'amber');
          }
          return;
        }
        if (!ent.hasChest && held && held.id === 'obj_chest') {
          held.count--;
          if (held.count <= 0) this.player.inventory[this.player.activeSlot] = null;
          ent.hasChest = true;
          audio.sfxBuild();
          this.toast(`📦 Attached saddlebags to ${ent.name}! Press [G] to open bag!`, 'emerald');
          this.callbacks.onInventoryChanged?.();
          return;
        }
        this.player.mountedHorse = ent;
        audio.sfxHorseNeigh();
        this.toast(`🐎 Mounted ${ent.name}!`, 'sky');
        return;
      }
    }

    // 7. Nearest Interactive Grid Object (Fast local tile lookup instead of full map scan!)
    const ptx = Math.floor(this.player.x / TILE_SIZE);
    const pty = Math.floor(this.player.y / TILE_SIZE);
    let bestObj: GridObject | null = null;
    let bestDist = 66;
    for (let ty = pty - 3; ty <= pty + 3; ty++) {
      for (let tx = ptx - 3; tx <= ptx + 3; tx++) {
        const obj = this.objects.get(`${tx},${ty}`);
        if (!obj) continue;
        const def = OBJECT_DEFS[obj.type];
        if (!def?.interactive) continue;
        const d = Math.hypot((obj.tx + 0.5) * TILE_SIZE - this.player.x, (obj.ty + 0.5) * TILE_SIZE - this.player.y);
        if (d < bestDist) {
          bestDist = d;
          bestObj = obj;
        }
      }
    }
    if (!bestObj) return;

    const action = OBJECT_DEFS[bestObj.type].interactive;
    if (action === 'gas_pump') {
      this.refuelVehicleAtGasStation();
      return;
    } else if (action === 'door') {
      bestObj.open = !bestObj.open;
      audio.sfxDoor(false, bestObj.open);
    } else if (action === 'iron_door') {
      const gateDoors = this.getConnectedIronDoors(bestObj);
      const nextOpen = !bestObj.open;
      for (const gd of gateDoors) {
        gd.open = nextOpen;
        gd.manualOpen = nextOpen;
        gd.cooldown = nextOpen ? 0 : 4.0;
      }
      audio.sfxDoor(true, nextOpen);
      this.toast(nextOpen ? '🔓 Military Auto Iron Door Opened!' : '🔒 Military Auto Iron Door Closed!', 'sky');
    } else if (action === 'old_computer') {
      bestObj.isOn = !bestObj.isOn;
      audio.sfxComputerBoot(bestObj.isOn);
      this.toast(
        bestObj.isOn ? '🖥️ ComputerOS Powered ON! View live preview at top-left.' : '🖥️ ComputerOS Powered OFF',
        bestObj.isOn ? 'emerald' : 'sky'
      );
    } else if (action === 'old_tv' || action === 'cinema_screen') {
      bestObj.isOn = !bestObj.isOn;
      audio.sfxComputerBoot(bestObj.isOn);
      this.toast(bestObj.isOn ? '📺 Television / Cinema ON!' : '📺 Television OFF', 'sky');
    } else if (action === 'shower' || action === 'sink') {
      bestObj.isOn = !bestObj.isOn;
      audio.sfxSplash();
      if (bestObj.isOn && this.player.poisonTimer > 0) {
        this.player.poisonTimer = 0;
        audio.sfxHeal();
        this.toast('🚿 Clean water washed off Virus Poison!', 'emerald');
      }
    } else if (action === 'piano') {
      audio.sfxPiano();
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + 18);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 10);
      this.spawnParticles((bestObj.tx + 0.5) * TILE_SIZE, (bestObj.ty + 0.5) * TILE_SIZE, '#facc15', 10, 75);
      this.spawnFloatingText((bestObj.tx + 0.5) * TILE_SIZE, bestObj.ty * TILE_SIZE - 10, '🎹 ♪ ♫ ♪', '#fde047');
      this.toast('🎹 Played the White House Grand Piano! (+10 HP, +18 Stamina)', 'amber');
    } else if (action === 'seat') {
      this.player.seatedObj = bestObj;
      this.player.x = (bestObj.tx + 0.5) * TILE_SIZE;
      this.player.y = (bestObj.ty + 0.5) * TILE_SIZE;
      this.toast('🪑 Resting on chair — recovering Stamina & HP!', 'sky');
    } else if (action === 'bed') {
      if (this.timeOfDay > 0.65 || this.timeOfDay < 0.25) {
        this.timeOfDay = 0.28;
        this.day++;
        this.bloodmoonTimer = 0;
        this.player.hp = this.player.maxHp;
        this.player.stamina = this.player.maxStamina;
        this.toast(`☀️ Slept until Day ${this.day} Sunrise (06:00)! HP restored!`, 'emerald');
      } else {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
        this.toast('🛏️ Quick nap (+25 HP). Sleep longer at Night!', 'sky');
      }
    } else if (action === 'chest' || action === 'fridge' || action === 'secret_locker') {
      this.activeStorageObj = bestObj;
      this.activeStorageHorse = null;
      this.callbacks.onStorageOpen?.(bestObj.name, bestObj.items, false);
    } else if (action === 'table') {
      const idx = bestObj.items.findIndex((i) => i !== null);
      if (idx !== -1) {
        const it = bestObj.items[idx]!;
        this.giveItem(it.id, it.count);
        bestObj.items[idx] = null;
        audio.sfxPickup();
        this.toast(`Took ${ITEMS[it.id]?.name || it.id} from table!`, 'emerald');
      } else {
        this.toast('Dining table is clean.', 'sky');
      }
    } else if (action === 'furnace') {
      if (this.countItem('coal') <= 0) {
        this.toast('Need Coal Ore (mine in Caves NW) to fire Furnace!', 'rose');
        return;
      }
      if (this.countItem('raw_meat') > 0) {
        this.removeItem('raw_meat', 1);
        this.removeItem('coal', 1);
        this.giveItem('cooked_meat', 1);
        audio.sfxEat();
        this.toast('🍖 Cooked Furnace Steak!', 'emerald');
      } else if (this.countItem('fish') > 0) {
        this.removeItem('fish', 1);
        this.removeItem('coal', 1);
        this.giveItem('cooked_fish', 1);
        audio.sfxEat();
        this.toast('🍣 Roasted River Trout!', 'emerald');
      } else {
        this.toast('Bring Raw Meat or Fish + Coal to cook!', 'amber');
      }
    } else if (action === 'workbench') {
      this.callbacks.onOpenWorkbench?.();
    } else if (action === 'anvil') {
      this.callbacks.onOpenAnvil?.();
    } else if (action === 'harvest') {
      if (bestObj.growth >= 0.8) {
        this.objects.delete(`${bestObj.tx},${bestObj.ty}`);
        this.giveItem('wheat', 2);
        this.giveItem('seeds', 2);
        audio.sfxHarvest();
        this.toast('🌾 Harvested Fresh Bread & Wheat Seeds!', 'emerald');
      } else {
        this.toast(`Wheat growing (${Math.round(bestObj.growth * 100)}%)`, 'sky');
      }
    } else if (action === 'playground_slide' || action === 'playground_swing') {
      this.player.stamina = this.player.maxStamina;
      audio.sfxHeal();
      this.toast('🎢 Enjoyed the Mall Playground! Stamina refilled!', 'emerald');
    } else if (action === 'city_flag' && bestObj.cityRef) {
      bestObj.cityRef.surrendered = false;
      bestObj.cityRef.flagColor = '#2563eb';
      audio.sfxAlert();
      this.toast(`🚩 Raised ${bestObj.cityRef.name} Sovereignty Banner!`, 'sky');
    } else if (action === 'military_flag' && bestObj.cityRef) {
      audio.sfxPickup();
      this.toast(`🚩 ${bestObj.cityRef.name} Military Banner — ${bestObj.cityRef.presidentOrder || 'Commanded by President'}`, 'sky');
    } else if (action === 'military_radar') {
      const c = bestObj.cityRef || this.cities[0];
      const count = c?.radarZombieCount || 0;
      audio.sfxPickup();
      this.toast(
        c?.radarAlertActive
          ? `📡🚨 RADAR RED ALERT: ${count} Zombies detected nearby! All FBI & Guards mobilized!`
          : `📡 RADAR CLEAR: ${count} Zombies in sector (Red Alert triggers at 100+ zombies).`,
        c?.radarAlertActive ? 'rose' : 'sky'
      );
    }
  }

  openHorseBag() {
    if (this.player.inVehicle) {
      if (this.isVehicleAtGasStation(this.player.inVehicle)) {
        this.refuelVehicleAtGasStation(this.player.inVehicle);
      } else {
        this.toast('⛽ Drive to the City Gas Station (NE Boulevard) to refuel!', 'amber');
      }
      return;
    }
    const h = this.player.mountedHorse;
    if (!h || !h.hasChest || !h.items) return;
    this.activeStorageHorse = h;
    this.activeStorageObj = null;
    this.callbacks.onStorageOpen?.(`${h.name} Saddlebags`, h.items, true);
  }

  honkVehicleHorn() {
    if (this.player.inVehicle && this.player.inVehicle.kind !== 'helicopter') {
      audio.sfxCarHorn();
      this.spawnFloatingText(this.player.inVehicle.x, this.player.inVehicle.y - 24, '📣 BEEP!', '#facc15');
    }
  }

  // ---------------------------------------------------------
  // COMBAT, HARVESTING & BUILDING
  // ---------------------------------------------------------
  performPrimaryAction() {
    if (this.player.dead || this.isModalOpen || this.player.attackTimer > 0) return;
    audio.init();

    // Helicopter mounted twin guns!
    if (this.player.inVehicle && this.player.inVehicle.kind === 'helicopter') {
      const heli = this.player.inVehicle;
      if (heli.fireCooldown > 0) return;
      heli.fireCooldown = 0.11;
      const aimAngle = Math.atan2(this.mouse.worldY - heli.y, this.mouse.worldX - heli.x);
      heli.angle = aimAngle;
      for (const side of [-12, 12]) {
        const px = heli.x + Math.cos(aimAngle + Math.PI / 2) * side + Math.cos(aimAngle) * 18;
        const py = heli.y + Math.sin(aimAngle + Math.PI / 2) * side + Math.sin(aimAngle) * 18;
        const spread = (Math.random() - 0.5) * 0.04;
        this.bullets.push({
          x: px,
          y: py,
          vx: Math.cos(aimAngle + spread) * 920,
          vy: Math.sin(aimAngle + spread) * 920,
          damage: 34,
          dist: 0,
          maxRange: 660,
          color: '#facc15',
          friendlyToPlayer: true,
          friendlyToNPC: true,
          fromPlayer: true,
        });
      }
      audio.sfxShoot('heli_gun');
      return;
    }

    if (this.player.inVehicle) return;

    const held = this.player.inventory[this.player.activeSlot];
    const def = held ? ITEMS[held.id] : null;
    const tx = Math.floor(this.mouse.worldX / TILE_SIZE);
    const ty = Math.floor(this.mouse.worldY / TILE_SIZE);
    const distToTile = Math.hypot((tx + 0.5) * TILE_SIZE - this.player.x, (ty + 0.5) * TILE_SIZE - this.player.y);

    // 1. Placeable or Seeds
    if (def && (def.type === 'placeable' || def.type === 'seed') && held) {
      if (distToTile <= 135 && !isWaterTile(getTile(this, tx, ty)) && !isTileBlocked(this, tx, ty, false) && !this.objects.has(`${tx},${ty}`)) {
        const objType = def.type === 'seed' ? 'crop_wheat' : def.objType!;
        if (placeObject(this, tx, ty, objType, true)) {
          held.count--;
          if (held.count <= 0) this.player.inventory[this.player.activeSlot] = null;
          this.player.attackTimer = 0.2;
          audio.sfxBuild();
          this.callbacks.onInventoryChanged?.();
          return;
        }
      }
    }

    // 2. Edible food quick use
    if (def && def.type === 'food') {
      this.consumeFood(this.player.activeSlot);
      this.player.attackTimer = 0.25;
      return;
    }

    // 3. Throwable Grenade
    if (def && def.type === 'throwable' && held) {
      const a = Math.atan2(this.mouse.worldY - this.player.y, this.mouse.worldX - this.player.x);
      this.grenades.push({
        x: this.player.x,
        y: this.player.y,
        vx: Math.cos(a) * 340,
        vy: Math.sin(a) * 340,
        fuse: 1.15,
        damage: def.damage || 145,
        radius: def.radius || 105,
        smokeTimer: 0,
      });
      held.count--;
      if (held.count <= 0) this.player.inventory[this.player.activeSlot] = null;
      this.player.attackTimer = def.cooldown || 0.6;
      audio.sfxGrenadeThrow();
      this.callbacks.onInventoryChanged?.();
      return;
    }

    // 4. Ranged Weapons (Guns / Bow)
    if (def && def.type === 'weapon' && def.weaponType && def.weaponType !== 'melee' && held) {
      if (def.ammoType && this.countItem(def.ammoType) <= 0) {
        this.toast(`Out of ${ITEMS[def.ammoType]?.name || def.ammoType}!`, 'rose');
        this.player.attackTimer = 0.35;
        return;
      }
      if (def.ammoType) this.removeItem(def.ammoType, 1);
      const pellets = def.pellets || 1;
      const baseAngle = Math.atan2(this.mouse.worldY - this.player.y, this.mouse.worldX - this.player.x);
      const dmg = Math.round((def.damage || 25) * this.getTotalPowerBonus(held.level || 1));
      for (let i = 0; i < pellets; i++) {
        const sp = (Math.random() - 0.5) * (def.spread || 0.04);
        const a = baseAngle + sp;
        const spd = def.speed || 700;
        this.bullets.push({
          x: this.player.x + Math.cos(a) * 14,
          y: this.player.y + Math.sin(a) * 14,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          damage: dmg,
          dist: 0,
          maxRange: def.range || 480,
          color: def.weaponType === 'bow' ? '#fde047' : '#fb923c',
          friendlyToPlayer: true,
          friendlyToNPC: true,
          fromPlayer: true,
        });
      }
      this.player.attackTimer = def.cooldown || 0.3;
      audio.sfxShoot(def.weaponType);
      return;
    }

    // 5. Special Tools (Shovel, Bucket, Fishing Rod, Flint) — allow hitting aimed mobs first!
    const swingRange = def?.range || 56;
    const aimingAtMob = this.entities.some(
      (ent) =>
        ent.hp > 0 &&
        !ent.inVehicle &&
        ent !== this.player.mountedHorse &&
        Math.hypot(ent.x - this.player.x, ent.y - this.player.y) <= swingRange + ent.radius &&
        Math.hypot(ent.x - this.mouse.worldX, ent.y - this.mouse.worldY) <= ent.radius + 42
    );
    if (!aimingAtMob && def && def.type === 'tool' && held) {
      if (def.toolType === 'shovel' && distToTile <= 82) {
        const cur = getTile(this, tx, ty);
        if (!isWaterTile(cur) && cur !== 'hole_dirt' && !this.objects.has(`${tx},${ty}`) && !this.resources.has(`${tx},${ty}`)) {
          setTile(this, tx, ty, 'hole_dirt');
          this.giveItem('stone', 1);
          audio.sfxChop();
          this.player.attackTimer = 0.3;
          return;
        }
      } else if (def.toolType === 'bucket' && distToTile <= 85 && isWaterTile(getTile(this, tx, ty))) {
        held.id = 'bucket_water';
        audio.sfxSplash();
        this.player.attackTimer = 0.3;
        this.callbacks.onInventoryChanged?.();
        return;
      } else if (def.toolType === 'water_bucket' && distToTile <= 85) {
        setTile(this, tx, ty, 'hole_water');
        held.id = 'bucket_empty';
        audio.sfxSplash();
        this.player.attackTimer = 0.3;
        this.callbacks.onInventoryChanged?.();
        return;
      } else if (def.toolType === 'rod' && distToTile <= 145 && isWaterTile(getTile(this, tx, ty))) {
        this.giveItem('fish', 1);
        audio.sfxSplash();
        this.spawnFloatingText(this.mouse.worldX, this.mouse.worldY - 12, '+1 River Trout 🐟', '#38bdf8');
        this.player.attackTimer = 0.55;
        return;
      } else if (def.toolType === 'flint') {
        for (let i = this.virusPuddles.length - 1; i >= 0; i--) {
          if (Math.hypot(this.virusPuddles[i].x - this.mouse.worldX, this.virusPuddles[i].y - this.mouse.worldY) < 75) {
            this.spawnParticles(this.virusPuddles[i].x, this.virusPuddles[i].y, '#f97316', 10, 90);
            this.virusPuddles.splice(i, 1);
          }
        }
      }
    }

    // 6. Melee Swing / Tool Attack (ANY Mob: Zombies, Animals, Horses, Villagers, Builders, Merchants, Guards/FBI, President)
    const baseMeleeDmg = def?.damage || (def?.type === 'tool' ? 18 : 15);
    const swingDmg = Math.round(baseMeleeDmg * this.getTotalPowerBonus(held?.level || 1));
    this.player.attackTimer = def?.cooldown || 0.34;
    this.player.swingAnim = 0.25;
    audio.sfxSwing();

    let hitSomething = false;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      if (ent.hp <= 0 || ent.inVehicle || ent === this.player.mountedHorse) continue;
      const d = Math.hypot(ent.x - this.player.x, ent.y - this.player.y);
      if (d <= swingRange + ent.radius) {
        this.damageEntity(
          ent,
          swingDmg,
          Math.cos(this.player.angle) * 180,
          Math.sin(this.player.angle) * 180,
          def?.toolType === 'flint',
          'player_gun_or_tool'
        );
        hitSomething = true;
      }
    }

    // Player can also break Vehicles with melee/tools!
    if (!hitSomething) {
      for (let vi = this.vehicles.length - 1; vi >= 0; vi--) {
        const v = this.vehicles[vi];
        if (v === this.player.inVehicle || v.hp <= 0) continue;
        const d = Math.hypot(v.x - this.player.x, v.y - this.player.y);
        if (d <= swingRange + v.radius + 10) {
          this.damageVehicle(v, swingDmg, 'melee');
          hitSomething = true;
          break;
        }
      }
    }

    // Player can break placed/world Grid Objects OR harvest Resources!
    if (!hitSomething && distToTile <= swingRange + 34) {
      const rKey = `${tx},${ty}`;
      const hitObj = this.objects.get(rKey);
      if (hitObj) {
        this.damageGridObject(rKey, hitObj, swingDmg);
        return;
      }
      const res = this.resources.get(rKey);
      if (res) {
        const mineMult = res.type.endsWith('_ore') || res.type === 'rock' ? (def?.toolType === 'pickaxe' ? 2.4 : 1.0) : def?.toolType === 'axe' ? 2.4 : 1.0;
        const dmg = Math.round((def?.damage || 16) * mineMult);
        res.hp -= dmg;
        res.damaged = true;
        this.spawnParticles((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, res.type === 'gold_ore' ? '#facc15' : '#94a3b8', 6, 70);
        if (res.type.endsWith('_ore') || res.type === 'rock') audio.sfxMine();
        else audio.sfxChop();

        if (res.hp <= 0) {
          this.resources.delete(rKey);
          if (res.type === 'coal_ore') {
            this.giveItem('coal', 3);
            this.giveItem('stone', 1);
            this.spawnFloatingText(tx * TILE_SIZE + 16, ty * TILE_SIZE, '+3 Coal Ore ⬛', '#cbd5e1');
          } else if (res.type === 'iron_ore') {
            this.giveItem('iron', 3);
            this.giveItem('stone', 1);
            this.spawnFloatingText(tx * TILE_SIZE + 16, ty * TILE_SIZE, '+3 Iron Ore ⚙️', '#fb923c');
          } else if (res.type === 'gold_ore') {
            this.giveItem('gold', 2);
            this.giveItem('stone', 1);
            this.spawnFloatingText(tx * TILE_SIZE + 16, ty * TILE_SIZE, '+2 Golden Ore 🪙', '#facc15');
          } else if (res.type === 'rock') {
            this.giveItem('stone', 4);
            if (getTile(this, tx, ty) === 'cave_floor' && Math.random() < 0.35) this.giveItem('coal', 1);
          } else if (res.type === 'berry_bush') {
            this.giveItem('berries', 3);
          } else if (res.type === 'melon_patch') {
            this.giveItem('melon', 2);
          } else if (res.type === 'tall_grass') {
            this.giveItem('seeds', 1);
          } else if (res.type === 'cactus') {
            this.giveItem('melon', 1);
          } else {
            this.giveItem('wood', 4);
            if (Math.random() < 0.3) this.giveItem('berries', 1);
          }
        }
      }
    }
  }

  damageGridObject(key: string, obj: GridObject, dmg: number) {
    obj.hp -= dmg;
    obj.damaged = true;
    const ox = (obj.tx + 0.5) * TILE_SIZE;
    const oy = (obj.ty + 0.5) * TILE_SIZE;
    this.spawnParticles(ox, oy, OBJECT_DEFS[obj.type]?.color || '#94a3b8', 5, 70);
    audio.sfxHit();
    this.spawnFloatingText(ox, oy - 12, `-${dmg}`, '#fbbf24');
    if (obj.hp <= 0) {
      if (obj.type === 'gas_pump') {
        this.triggerGasStationExplosion(obj.tx, obj.ty);
        return;
      }
      this.objects.delete(key);
      this.spawnParticles(ox, oy, '#cbd5e1', 10, 95);
      audio.sfxBuild();
      if (obj.type.includes('wood') || obj.type === 'door' || obj.type === 'table' || obj.type === 'seat') {
        this.giveItem('wood', 1);
      } else if (obj.type.includes('stone') || obj.type.includes('white') || obj.type === 'furnace') {
        this.giveItem('stone', 2);
      } else if (obj.type.includes('iron') || obj.type === 'turret') {
        this.giveItem('iron', 2);
      }
    }
  }

  triggerGasStationExplosion(tx: number, ty: number, depth = 0) {
    const key = `${tx},${ty}`;
    if (this.gasDetonatingKeys.has(key)) return;
    this.gasDetonatingKeys.add(key);

    const existing = this.objects.get(key);
    if (existing) {
      this.objects.delete(key);
    }

    const gx = (tx + 0.5) * TILE_SIZE;
    const gy = (ty + 0.5) * TILE_SIZE;
    const blastRadius = 310; // Large range blast!

    if (depth === 0) {
      const nearestCity = this.findNearestCity(gx, gy);
      if (nearestCity) {
        nearestCity.gasStationBroken = true;
      }
      audio.sfxGasExplosion();
      this.screenShake = Math.max(this.screenShake, 1.35);
      this.spawnFloatingText(gx, gy - 32, '💥⛽ GAS STATION EXPLODED!', '#fb923c');
      this.toast('💥⛽ GAS STATION EXPLODED! Vehicles cannot fuel unless President pays!', 'rose');
    }

    // Shockwaves + Dense Particle Explosion + Smoke + Fire
    this.shockwaves.push({ x: gx, y: gy, radius: 16, maxRadius: blastRadius, alpha: 1.0 });
    this.shockwaves.push({ x: gx, y: gy, radius: 8, maxRadius: blastRadius * 0.62, alpha: 0.9 });
    this.spawnParticles(gx, gy, '#fef08a', 26, 280);
    this.spawnParticles(gx, gy, '#f97316', 38, 250);
    this.spawnParticles(gx, gy, '#ef4444', 32, 230);
    this.spawnParticles(gx, gy, '#475569', 26, 170);
    this.spawnParticles(gx, gy, '#0f172a', 22, 130);

    // Spawn lingering fire & smoke patches around the explosion site
    for (let f = 0; f < 5; f++) {
      const ang = (Math.PI * 2 * f) / 5 + Math.random() * 0.5;
      const dist = f === 0 ? 0 : 28 + Math.random() * 58;
      if (this.firePatches.length < 40) {
        this.firePatches.push({
          x: gx + Math.cos(ang) * dist,
          y: gy + Math.sin(ang) * dist,
          radius: 26 + Math.random() * 18,
          life: 6.5 + Math.random() * 2.5,
        });
      }
    }

    // Destroy surrounding objects in large range (and chain-detonate other gas pumps cleanly)
    const minTx = Math.floor((gx - blastRadius) / TILE_SIZE);
    const maxTx = Math.floor((gx + blastRadius) / TILE_SIZE);
    const minTy = Math.floor((gy - blastRadius) / TILE_SIZE);
    const maxTy = Math.floor((gy + blastRadius) / TILE_SIZE);
    const chainPumps: [number, number][] = [];

    for (let oty = minTy; oty <= maxTy; oty++) {
      for (let otx = minTx; otx <= maxTx; otx++) {
        const okey = `${otx},${oty}`;
        const ox = (otx + 0.5) * TILE_SIZE;
        const oy = (oty + 0.5) * TILE_SIZE;
        const dObj = Math.hypot(ox - gx, oy - gy);
        if (dObj > blastRadius) continue;

        const o = this.objects.get(okey);
        if (o) {
          if (o.type === 'gas_pump') {
            if (!this.gasDetonatingKeys.has(okey)) {
              chainPumps.push([otx, oty]);
            }
          } else {
            this.objects.delete(okey);
            if (Math.random() < 0.45) {
              this.spawnParticles(ox, oy, '#f97316', 4, 110);
              this.spawnParticles(ox, oy, '#475569', 3, 85);
            }
          }
        }
        const res = this.resources.get(okey);
        if (res && dObj <= blastRadius * 0.72) {
          this.resources.delete(okey);
        }
      }
    }

    // Kill all mobs (zombies, villagers, guards, builders, animals, horses) within large range!
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      const d = Math.hypot(e.x - gx, e.y - gy);
      if (d <= blastRadius + e.radius) {
        const dirX = d > 1 ? (e.x - gx) / d : 1;
        const dirY = d > 1 ? (e.y - gy) / d : 0;
        this.damageEntity(e, Math.max(9999, e.maxHp + 1000), dirX * 320, dirY * 320, true, 'other');
      }
    }

    // Destroy or heavily blast nearby vehicles in range
    for (let vi = this.vehicles.length - 1; vi >= 0; vi--) {
      const v = this.vehicles[vi];
      const d = Math.hypot(v.x - gx, v.y - gy);
      if (d <= blastRadius + v.radius) {
        this.damageVehicle(v, Math.max(260, v.maxHp + 100), 'meteor');
      }
    }

    // Deal 25% maxHp damage to Player if within blast range!
    if (!this.player.dead && Math.hypot(this.player.x - gx, this.player.y - gy) <= blastRadius + this.player.radius) {
      const pDmg = Math.max(1, Math.round(this.player.maxHp * 0.25));
      this.player.hp = Math.max(0, this.player.hp - pDmg);
      this.player.hurtFlash = 0.35;
      audio.sfxHit();
      this.spawnFloatingText(this.player.x, this.player.y - 24, `-${pDmg} HP (GAS BLAST 25%)`, '#ef4444');
      if (this.player.hp <= 0) {
        this.player.hp = 0;
        this.player.dead = true;
        this.player.inVehicle = null;
        this.player.mountedHorse = null;
        this.toast('💀 KILLED IN GAS STATION EXPLOSION!', 'rose');
      }
    }

    if (depth < 2) {
      for (const [ptx, pty] of chainPumps) {
        this.triggerGasStationExplosion(ptx, pty, depth + 1);
      }
    }
    this.gasDetonatingKeys.delete(key);
  }

  damageEntity(
    ent: GameEntity,
    dmg: number,
    kx = 0,
    ky = 0,
    ignite = false,
    source: 'other' | 'player_gun_or_tool' | 'vehicle' = 'other'
  ) {
    const armor = ent.armor || 0;
    const actual = Math.max(2, Math.round(dmg * (100 / (100 + armor * 2.5))));
    ent.hp -= actual;
    ent.damaged = true;
    ent.hurtFlash = 0.14;
    if (ignite) ent.burnTimer = 4;
    ent.x += kx * 0.08;
    ent.y += ky * 0.08;
    audio.sfxHit();
    this.spawnFloatingText(ent.x, ent.y - ent.radius - 6, `-${actual}`, ent.kind === 'zombie' ? '#fca5a5' : '#fde047');

    if (source === 'player_gun_or_tool' && (ent.kind === 'guard' || ent.kind === 'president') && ent.hp > 0) {
      if (ent.kind === 'guard' && !ent.hostileToPlayer) {
        ent.hostileToPlayer = true;
        ent.restingAtCamp = false;
        this.spawnFloatingText(ent.x, ent.y - 26, '🚨 HOSTILE!', '#f43f5e');
      }
      for (const g of this.entities) {
        if (g.kind === 'guard' && g.hp > 0 && !g.hostileToPlayer && Math.hypot(g.x - ent.x, g.y - ent.y) <= 950) {
          g.hostileToPlayer = true;
          g.restingAtCamp = false;
          this.spawnFloatingText(g.x, g.y - 26, '🚨 HOSTILE!', '#f43f5e');
        }
      }
    }

    if (ent.hp <= 0 && !ent.lootDropped) {
      ent.lootDropped = true;
      if (ent.kind === 'zombie') {
        this.player.kills++;
        this.player.xp += ent.subType === 'king' ? 220 : 18;
        this.player.cash += ent.subType === 'king' ? 250 : ent.subType === 'brute' ? 22 : 10;
        if (this.player.xp >= this.player.level * 100) {
          this.player.xp -= this.player.level * 100;
          this.player.level++;
          this.player.maxHp += 10;
          this.player.hp = this.player.maxHp;
          audio.sfxLevelUp();
          this.toast(`⭐ LEVEL UP! Survivor Lv.${this.player.level}`, 'amber');
        }
        if (ent.subType === 'king') {
          this.giveItem('gold', 5);
          this.giveItem('ammo_heavy', 50);
          this.toast('🏆 SLAIN ZOMBIE KING TITAN! +$250 & +5 Golden Ore!', 'amber');
        } else if (Math.random() < 0.35) {
          this.drops.push({ x: ent.x, y: ent.y, itemId: Math.random() < 0.5 ? 'ammo_light' : 'cloth', count: 2, bob: Math.random() * 6, vx: 0, vy: 0 });
        }
      } else if (ent.kind === 'animal' && ent.drops) {
        for (const dropId of ent.drops) {
          this.drops.push({ x: ent.x, y: ent.y, itemId: dropId, count: 1, bob: Math.random() * 6, vx: 0, vy: 0 });
        }
      } else if (ent.kind === 'horse') {
        this.drops.push({ x: ent.x, y: ent.y, itemId: 'raw_meat', count: 2, bob: Math.random() * 6, vx: 0, vy: 0 });
        this.drops.push({ x: ent.x, y: ent.y, itemId: 'cloth', count: 1, bob: Math.random() * 6, vx: 0, vy: 0 });
      } else if (
        (ent.kind === 'villager' ||
          ent.kind === 'builder' ||
          ent.kind === 'merchant' ||
          ent.kind === 'guard' ||
          ent.kind === 'president') &&
        source === 'player_gun_or_tool'
      ) {
        if (ent.cash && ent.cash > 0) {
          this.player.cash += ent.cash;
        }
        if (ent.kind === 'president') {
          this.player.cash += 150;
          this.giveItem('gold', 3);
        } else if (ent.kind === 'guard') {
          this.player.cash += 25;
          this.drops.push({ x: ent.x, y: ent.y, itemId: 'ammo_heavy', count: 8, bob: Math.random() * 6, vx: 0, vy: 0 });
        }
        let triggeredGuards = 0;
        for (const g of this.entities) {
          if (g !== ent && g.kind === 'guard' && g.hp > 0 && ((ent.city && g.city === ent.city) || Math.hypot(g.x - ent.x, g.y - ent.y) <= 1250)) {
            if (!g.hostileToPlayer) {
              g.hostileToPlayer = true;
              g.restingAtCamp = false;
              this.spawnFloatingText(g.x, g.y - 26, '🚨 HOSTILE!', '#f43f5e');
            }
            triggeredGuards++;
          }
        }
        if (triggeredGuards > 0) {
          audio.sfxAlert();
          this.toast(
            ent.kind === 'president'
              ? '🚨 ASSASSINATED THE PRESIDENT! All Secret Service & Guards hunting you!'
              : '🚨 You killed a Citizen/Guard! Guards are chasing & shooting you! Run far away so they turn innocent!',
            'rose'
          );
        }
      }
      const idx = this.entities.indexOf(ent);
      if (idx !== -1) this.entities.splice(idx, 1);
    }
  }

  damagePlayer(amount: number) {
    if (this.player.dead) return;
    let dmg = amount;
    if (this.player.blocking && this.player.equipment.shield) {
      dmg = Math.round(dmg * 0.25);
      audio.sfxShieldBlock();
    }
    const arm = this.getPlayerArmor();
    const finalDmg = Math.max(1, Math.round(dmg * (100 / (100 + arm * 2.2))));
    this.player.hp -= finalDmg;
    this.player.hurtFlash = 0.2;
    this.screenShake = Math.max(this.screenShake, 0.28);
    audio.sfxHit();
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.dead = true;
      this.player.inVehicle = null;
      this.player.mountedHorse = null;
      audio.sfxDeath();
      this.toast('💀 YOU WERE OVERRUN!', 'rose');
    }
  }

  respawnPlayer() {
    this.player.dead = false;
    this.player.hp = this.player.maxHp;
    this.player.hunger = this.player.maxHunger;
    this.player.stamina = this.player.maxStamina;
    this.player.poisonTimer = 0;
    this.player.x = 0;
    this.player.y = 0;
    this.camera.x = 0;
    this.camera.y = 0;
    audio.sfxRespawn();
    this.toast('⚡ Respawned at Starter Camp!', 'emerald');
  }

  // ---------------------------------------------------------
  // SIMULATION TICK
  // ---------------------------------------------------------
  private rebuildSpatialGrids() {
    this.zombieGrid.clear();
    this.humanGrid.clear();
    this.animalGrid.clear();
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.inVehicle || e.hp <= 0) continue;
      const key = (Math.floor(e.x / 192) + 2048) * 4096 + (Math.floor(e.y / 192) + 2048);
      if (e.kind === 'zombie') {
        let bucket = this.zombieGrid.get(key);
        if (!bucket) {
          bucket = [];
          this.zombieGrid.set(key, bucket);
        }
        bucket.push(e);
      } else if (
        e.kind === 'villager' ||
        e.kind === 'guard' ||
        e.kind === 'builder' ||
        e.kind === 'merchant' ||
        e.kind === 'president'
      ) {
        let bucket = this.humanGrid.get(key);
        if (!bucket) {
          bucket = [];
          this.humanGrid.set(key, bucket);
        }
        bucket.push(e);
      } else if (e.kind === 'animal' || e.kind === 'horse') {
        let bucket = this.animalGrid.get(key);
        if (!bucket) {
          bucket = [];
          this.animalGrid.set(key, bucket);
        }
        bucket.push(e);
      }
    }
  }

  private findNearestInGrid(grid: Map<number, GameEntity[]>, x: number, y: number, maxDist: number): { ent: GameEntity; dist: number } | null {
    const cx = Math.floor(x / 192) + 2048;
    const cy = Math.floor(y / 192) + 2048;
    const radCells = Math.min(3, Math.ceil(maxDist / 192));
    let best: GameEntity | null = null;
    let bestDistSq = maxDist * maxDist;

    for (let dy = -radCells; dy <= radCells; dy++) {
      for (let dx = -radCells; dx <= radCells; dx++) {
        const bucket = grid.get((cx + dx) * 4096 + (cy + dy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          const ex = e.x - x;
          const ey = e.y - y;
          const dSq = ex * ex + ey * ey;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            best = e;
          }
        }
      }
    }
    return best ? { ent: best, dist: Math.sqrt(bestDistSq) } : null;
  }

  update(dt: number) {
    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 2.2);
    if (this.lowFuelWarnTimer > 0) this.lowFuelWarnTimer = Math.max(0, this.lowFuelWarnTimer - dt);
    this.timeOfDay += dt / this.dayLengthSec;
    if (this.timeOfDay >= 1) {
      this.timeOfDay -= 1;
      this.day++;
      this.toast(`☀️ Day ${this.day} dawned!`, 'amber');
    }
    if (this.bloodmoonTimer > 0) this.bloodmoonTimer = Math.max(0, this.bloodmoonTimer - dt);

    // Tick World Event Timers & City Command Cooldowns
    for (const c of this.cities) {
      if (c.defenseCooldown > 0) c.defenseCooldown = Math.max(0, c.defenseCooldown - dt);
      if ((c.repairCooldown || 0) > 0) c.repairCooldown = Math.max(0, (c.repairCooldown || 0) - dt);
    }
    for (const ev of this.worldEvents) {
      ev.timer -= dt;
      if (ev.timer <= 0) {
        this.triggerWorldEvent(ev.id);
      }
    }

    this.tvTimer += dt;
    if (this.tvTimer > 0.35) {
      this.tvTimer = 0;
      this.tvFrame++;
      this.computerFrame++;
    }

    // Build spatial grids ONCE per frame so turrets, guards, jeeps, helis, bullets & zombies run O(1) neighbor queries!
    this.rebuildSpatialGrids();

    // Object updates (Crops, Turrets, Shower particles, Auto Iron Doors, Cooldowns)
    const visitedIronDoors = new Set<GridObject>();
    for (const obj of this.objects.values()) {
      if (obj.cooldown > 0) obj.cooldown = Math.max(0, obj.cooldown - dt);
      if (obj.type === 'iron_door' && !visitedIronDoors.has(obj)) {
        const gateDoors = this.getConnectedIronDoors(obj);
        for (const gd of gateDoors) visitedIronDoors.add(gd);

        let vehicleNear = false;
        for (const v of this.vehicles) {
          if (v.hp <= 0) continue;
          if (v.kind === 'helicopter' && v.altitude >= 0.35) continue;
          for (const gd of gateDoors) {
            const gx = (gd.tx + 0.5) * TILE_SIZE;
            const gy = (gd.ty + 0.5) * TILE_SIZE;
            if (Math.hypot(v.x - gx, v.y - gy) <= 112) {
              vehicleNear = true;
              break;
            }
          }
          if (vehicleNear) break;
        }

        const desiredOpen = obj.cooldown > 0 ? !!obj.manualOpen : vehicleNear ? true : !!obj.manualOpen;
        if (desiredOpen !== obj.open) {
          for (const gd of gateDoors) {
            gd.open = desiredOpen;
          }
          const doorMidX = (obj.tx + 0.5) * TILE_SIZE;
          const doorMidY = (obj.ty + 0.5) * TILE_SIZE;
          if (Math.hypot(doorMidX - this.player.x, doorMidY - this.player.y) < 420) {
            audio.sfxDoor(true, desiredOpen);
          }
        }
      }
      if (obj.type === 'crop_wheat' && obj.growth < 1) {
        obj.growth = Math.min(1, obj.growth + dt * 0.03);
      }
      if ((obj.type === 'shower' || obj.type === 'sink') && obj.isOn) {
        obj.particleTimer += dt;
        if (obj.particleTimer > 0.14) {
          obj.particleTimer = 0;
          this.spawnParticles((obj.tx + 0.5) * TILE_SIZE, (obj.ty + 0.5) * TILE_SIZE, '#38bdf8', 2, 35);
        }
      }
      if (obj.type === 'turret' && obj.cooldown <= 0) {
        const ox = (obj.tx + 0.5) * TILE_SIZE;
        const oy = (obj.ty + 0.5) * TILE_SIZE;
        const found = this.findNearestInGrid(this.zombieGrid, ox, oy, 320);
        if (found) {
          obj.cooldown = 0.48;
          const a = Math.atan2(found.ent.y - oy, found.ent.x - ox);
          this.bullets.push({
            x: ox,
            y: oy,
            vx: Math.cos(a) * 760,
            vy: Math.sin(a) * 760,
            damage: 24,
            dist: 0,
            maxRange: 340,
            color: '#38bdf8',
            friendlyToPlayer: true,
            friendlyToNPC: true,
          });
        }
      }
    }

    this.updateMilitaryRadar(dt);
    this.updatePlayerAndVehicle(dt);
    this.updateVehiclesAI(dt);
    this.updateEntities(dt);
    this.updateProjectiles(dt);
    this.updateEffectsAndDrops(dt);

    this.camera.x += (this.player.x - this.camera.x) * Math.min(1, dt * 8);
    this.camera.y += (this.player.y - this.camera.y) * Math.min(1, dt * 8);

    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.1) {
      this.hudSyncTimer = 0;
      this.callbacks.onHud?.(this.getHudSnapshot());
    }
  }

  private getSurfaceType(wx: number, wy: number): 'grass' | 'road' | 'stone' | 'water' | 'wood' {
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    const tile = getTile(this, tx, ty);
    if (isWaterTile(tile)) return 'water';
    if (
      tile === 'road' ||
      tile === 'sidewalk' ||
      tile === 'city_floor' ||
      tile === 'mall_floor' ||
      tile === 'hotel_carpet' ||
      tile === 'gas_pad' ||
      tile === 'white_floor' ||
      tile === 'gold_floor'
    ) {
      return 'road';
    }
    if (tile === 'cave_floor' || tile === 'stone' || tile === 'military_pad' || tile === 'helipad') return 'stone';
    if (tile === 'planks') return 'wood';
    return 'grass';
  }

  private getConnectedIronDoors(seed: GridObject): GridObject[] {
    const group: GridObject[] = [seed];
    const queue: GridObject[] = [seed];
    const seen = new Set<string>([`${seed.tx},${seed.ty}`]);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (queue.length > 0 && group.length < 12) {
      const cur = queue.shift()!;
      for (const [dx, dy] of dirs) {
        const nk = `${cur.tx + dx},${cur.ty + dy}`;
        if (seen.has(nk)) continue;
        const nObj = this.objects.get(nk);
        if (nObj && nObj.type === 'iron_door') {
          seen.add(nk);
          group.push(nObj);
          queue.push(nObj);
        }
      }
    }
    return group;
  }

  private getCollidingGridObject(wx: number, wy: number, radius: number): GridObject | null {
    const minTx = Math.floor((wx - radius) / TILE_SIZE);
    const maxTx = Math.floor((wx + radius) / TILE_SIZE);
    const minTy = Math.floor((wy - radius) / TILE_SIZE);
    const maxTy = Math.floor((wy + radius) / TILE_SIZE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const obj = this.objects.get(`${tx},${ty}`);
        if (obj && obj.solid && !obj.open) return obj;
      }
    }
    return null;
  }

  private moveWithCollision(obj: { x: number; y: number; radius: number }, dx: number, dy: number, flyOver = false) {
    const stepX = obj.x + dx;
    if (flyOver || !this.checkSolidCollision(stepX, obj.y, obj.radius)) obj.x = stepX;
    const stepY = obj.y + dy;
    if (flyOver || !this.checkSolidCollision(obj.x, stepY, obj.radius)) obj.y = stepY;
  }

  private moveGroundVehicleWithCrash(v: Vehicle, dx: number, dy: number) {
    let hitObj: GridObject | null = null;
    const stepX = v.x + dx;
    if (!this.checkSolidCollision(stepX, v.y, v.radius)) {
      v.x = stepX;
    } else {
      hitObj = this.getCollidingGridObject(stepX, v.y, v.radius);
    }

    const stepY = v.y + dy;
    if (!this.checkSolidCollision(v.x, stepY, v.radius)) {
      v.y = stepY;
    } else if (!hitObj) {
      hitObj = this.getCollidingGridObject(v.x, stepY, v.radius);
    }

    // Car or Jeep crashing into a solid GridObject at driving speed deals small-to-medium (15%) damage to the vehicle
    if (hitObj && (v.kind === 'car' || v.kind === 'jeep') && Math.hypot(v.vx, v.vy) >= 115 && (v.crashCooldown || 0) <= 0) {
      v.crashCooldown = 0.9;
      const crashDmg = Math.max(8, Math.round(v.maxHp * 0.15));
      v.vx *= 0.28;
      v.vy *= 0.28;
      this.spawnParticles(v.x, v.y, '#facc15', 8, 110);
      this.spawnFloatingText(v.x, v.y - 26, '💥 CRASH -15%!', '#f97316');
      if (Math.hypot(v.x - this.player.x, v.y - this.player.y) < 520) audio.sfxVehicleCrash();
      if (v.driver === 'player') this.screenShake = Math.max(this.screenShake, 0.28);
      this.damageVehicle(v, crashDmg, 'crash');
      // Chip the crashed object slightly
      hitObj.hp -= 14;
      hitObj.damaged = true;
      if (hitObj.hp <= 0) {
        if (hitObj.type === 'gas_pump') this.triggerGasStationExplosion(hitObj.tx, hitObj.ty);
        else this.objects.delete(`${hitObj.tx},${hitObj.ty}`);
      }
    }
  }

  private checkSolidCollision(wx: number, wy: number, radius: number): boolean {
    const minTx = Math.floor((wx - radius) / TILE_SIZE);
    const maxTx = Math.floor((wx + radius) / TILE_SIZE);
    const minTy = Math.floor((wy - radius) / TILE_SIZE);
    const maxTy = Math.floor((wy + radius) / TILE_SIZE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (isTileBlocked(this, tx, ty, true)) return true;
      }
    }
    return false;
  }

  private updateMilitaryRadar(dt: number) {
    for (const c of this.cities) {
      if ((c.radarHornCooldown || 0) > 0) {
        c.radarHornCooldown = Math.max(0, c.radarHornCooldown! - dt);
      }
    }

    this.radarScanTimer -= dt;
    if (this.radarScanTimer > 0) return;
    this.radarScanTimer = 0.75;

    for (const city of this.cities) {
      if (city.militaryRadarTx === undefined || city.militaryRadarTy === undefined) continue;
      const radarObj = this.objects.get(`${city.militaryRadarTx},${city.militaryRadarTy}`);
      if (!radarObj || radarObj.type !== 'military_radar' || radarObj.hp <= 0) {
        city.radarAlertActive = false;
        city.radarZombieCount = 0;
        continue;
      }

      const rx = (city.militaryRadarTx + 0.5) * TILE_SIZE;
      const ry = (city.militaryRadarTy + 0.5) * TILE_SIZE;
      const scanRange = 1000; // Medium RADAR detection range (~31 tiles)
      let count = 0;
      let sumX = 0;
      let sumY = 0;

      for (let i = 0; i < this.entities.length; i++) {
        const e = this.entities[i];
        if (e.kind !== 'zombie' || e.hp <= 0) continue;
        if (Math.abs(e.x - city.x) <= scanRange || Math.abs(e.x - rx) <= scanRange) {
          const dCity = Math.hypot(e.x - city.x, e.y - city.y);
          const dRadar = Math.hypot(e.x - rx, e.y - ry);
          if (dCity <= scanRange || dRadar <= scanRange) {
            count++;
            sumX += e.x;
            sumY += e.y;
          }
        }
      }

      city.radarZombieCount = count;
      if (count >= 100) {
        const wasAlert = !!city.radarAlertActive;
        city.radarAlertActive = true;
        city.alertActive = true;
        city.radarThreatX = sumX / count;
        city.radarThreatY = sumY / count;
        radarObj.isOn = true;

        if (!wasAlert || (city.radarHornCooldown || 0) <= 0) {
          city.radarHornCooldown = 9.5;
          audio.sfxRadarHorn();
          this.spawnFloatingText(rx, ry - 26, `📡🚨 ${count} ZOMBIES!`, '#ef4444');
          if (!wasAlert) {
            this.toast(`📡🔴 MILITARY RADAR RED ALERT: ${count} Zombies detected nearby! Horn sounding & FBI/Guards mobilizing!`, 'rose');
            this.commandPresidentDeployDefense(city);
          }
        }
      } else {
        city.radarAlertActive = false;
        radarObj.isOn = false;
      }
    }
  }

  private handleVehicleMobImpact(v: Vehicle, dt: number) {
    if ((v.ramCooldown || 0) > 0) {
      v.ramCooldown = Math.max(0, v.ramCooldown! - dt);
    }
    if (v.hp <= 0 || v.kind === 'helicopter') return;
    const spd = Math.hypot(v.vx, v.vy);
    if (spd < 55 || (v.ramCooldown || 0) > 0) return;

    const isJeep = v.kind === 'jeep';
    // Cars deal small damage (~14 dmg) & light scratch; Jeeps deal large damage (~68 dmg)!
    const mobDmg = isJeep ? Math.round(54 + Math.min(28, spd * 0.08)) : Math.round(11 + Math.min(7, spd * 0.02));
    const hitRadius = v.radius + 14;

    // 1. Check Player hit (only when unmanned/player-driven — pro AI drivers never touch humans!)
    if (!this.player.dead && !this.player.inVehicle && v.driver === 'none') {
      if (Math.hypot(this.player.x - v.x, this.player.y - v.y) <= hitRadius + this.player.radius) {
        this.damagePlayer(isJeep ? 48 : 11);
        this.player.x += (v.vx / spd) * (isJeep ? 18 : 8);
        this.player.y += (v.vy / spd) * (isJeep ? 18 : 8);
        v.ramCooldown = 0.35;
        return;
      }
    }

    // 2. Check Zombies (fast via spatial grid!)
    const zHit = this.findNearestInGrid(this.zombieGrid, v.x, v.y, hitRadius + 16);
    if (zHit && zHit.dist < hitRadius + zHit.ent.radius) {
      this.damageEntity(zHit.ent, mobDmg, v.vx * (isJeep ? 1.5 : 0.7), v.vy * (isJeep ? 1.5 : 0.7), false, 'vehicle');
      if (!isJeep) v.hp = Math.max(1, v.hp - 2);
      v.ramCooldown = 0.25;
      return;
    }

    // 3. Check Animals, Horses & Villagers (pro AI drivers never hit humans!)
    const hitRange = hitRadius + 16;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      if (ent.inVehicle || ent.hp <= 0) continue;
      if (Math.abs(ent.x - v.x) > hitRange || Math.abs(ent.y - v.y) > hitRange) continue;
      if (ent.kind === 'zombie') continue;
      // Pro AI drivers never hit humans (villager, builder, merchant, guard, president)
      const isHuman = ent.kind === 'villager' || ent.kind === 'builder' || ent.kind === 'merchant' || ent.kind === 'guard' || ent.kind === 'president';
      if (v.driver !== 'player' && isHuman) continue;
      if (ent.kind === 'animal' || ent.kind === 'horse' || isHuman) {
        if (Math.hypot(ent.x - v.x, ent.y - v.y) <= hitRadius + ent.radius) {
          this.damageEntity(ent, mobDmg, v.vx * (isJeep ? 1.4 : 0.65), v.vy * (isJeep ? 1.4 : 0.65), false, 'vehicle');
          if (!isJeep) v.hp = Math.max(1, v.hp - 2);
          v.ramCooldown = 0.3;
          return;
        }
      }
    }
  }

  private updatePlayerAndVehicle(dt: number) {
    if (this.player.dead) return;
    if (this.player.attackTimer > 0) this.player.attackTimer = Math.max(0, this.player.attackTimer - dt);
    if (this.player.swingAnim > 0) this.player.swingAnim = Math.max(0, this.player.swingAnim - dt);
    if (this.player.hurtFlash > 0) this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt);
    if (this.player.speedBoostTimer > 0) this.player.speedBoostTimer = Math.max(0, this.player.speedBoostTimer - dt);

    // Hunger & Poison drain
    this.player.hunger = Math.max(0, this.player.hunger - dt * 0.24);
    if (this.player.hunger <= 0) this.player.hp = Math.max(1, this.player.hp - dt * 0.6);
    if (this.player.poisonTimer > 0) {
      this.player.poisonTimer -= dt;
      this.player.poisonTickTimer += dt;
      if (this.player.poisonTickTimer >= 1) {
        this.player.poisonTickTimer = 0;
        this.player.hp = Math.max(1, this.player.hp - 3);
      }
    }

    if (this.mouse.down && !this.isModalOpen) {
      this.performPrimaryAction();
    }

    let ix = 0;
    let iy = 0;
    if (!this.isModalOpen) {
      if (this.keys['w'] || this.keys['arrowup']) iy -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) iy += 1;
      if (this.keys['a'] || this.keys['arrowleft']) ix -= 1;
      if (this.keys['d'] || this.keys['arrowright']) ix += 1;
    }
    const mag = Math.hypot(ix, iy);
    if (mag > 0) {
      ix /= mag;
      iy /= mag;
    }

    // Piloting / Driving a Vehicle!
    if (this.player.inVehicle) {
      const v = this.player.inVehicle;
      if ((v.crashCooldown || 0) > 0) v.crashCooldown = Math.max(0, v.crashCooldown! - dt);
      const isHeli = v.kind === 'helicopter';
      const hasFuel = v.fuel > 0;

      if (hasFuel) {
        if (isHeli) {
          v.altitude = Math.min(1, v.altitude + dt * 1.4);
          v.rotorAngle += dt * 22;
          v.fuel = Math.max(0, v.fuel - dt * (mag > 0 ? 1.8 : 0.7));
          audio.sfxHelicopterRotor(0.42);
        } else if (mag > 0) {
          v.fuel = Math.max(0, v.fuel - dt * 1.45);
        }
      } else {
        if (isHeli) {
          v.altitude = Math.max(0, v.altitude - dt * 0.75);
          if (v.altitude > 0.05) v.rotorAngle += dt * 9;
        }
        if (mag > 0 && this.lowFuelWarnTimer <= 0) {
          this.lowFuelWarnTimer = 4.0;
          this.toast('⛽ Vehicle OUT OF FUEL! Refuel at the City Gas Station (NE Boulevard)!', 'rose');
        }
      }

      const targetVx = hasFuel ? ix * v.maxSpeed : 0;
      const targetVy = hasFuel ? iy * v.maxSpeed : 0;
      v.vx += (targetVx - v.vx) * Math.min(1, dt * 6);
      v.vy += (targetVy - v.vy) * Math.min(1, dt * 6);

      const curSpeed = Math.hypot(v.vx, v.vy);
      if (curSpeed > 12) {
        const targetAng = Math.atan2(v.vy, v.vx);
        let angDiff = Math.atan2(Math.sin(targetAng - v.angle), Math.cos(targetAng - v.angle));
        const maxTurn = (isHeli ? 5.5 : 3.4) * dt;
        if (Math.abs(angDiff) > maxTurn) {
          if (!isHeli && curSpeed > v.maxSpeed * 0.45 && Math.abs(angDiff) > 0.65) {
            audio.sfxTireTurn();
          }
          angDiff = Math.sign(angDiff) * maxTurn;
        }
        v.angle = Math.atan2(Math.sin(v.angle + angDiff), Math.cos(v.angle + angDiff));
        if (!isHeli && hasFuel) {
          audio.sfxVehicleEngine(v.kind as 'car' | 'jeep', curSpeed / v.maxSpeed, 0.36);
        }
      }

      if (isHeli && v.altitude > 0.3) {
        v.x += v.vx * dt;
        v.y += v.vy * dt;
      } else {
        this.moveGroundVehicleWithCrash(v, v.vx * dt, v.vy * dt);
      }

      // Ground vehicle hitting mobs (zombies, animals, villagers): Cars deal small damage, Jeeps deal large damage!
      if (!isHeli) {
        this.handleVehicleMobImpact(v, dt);
      }

      this.player.x = v.x;
      this.player.y = v.y;
      this.updateChunksAroundPlayer();
      return;
    }

    if (this.player.seatedObj) {
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + dt * 24);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + dt * 4);
      if (mag > 0) this.player.seatedObj = null;
      else return;
    }

    const sprinting = !!(this.keys['shift'] && mag > 0 && this.player.stamina > 2);
    if (sprinting) this.player.stamina = Math.max(0, this.player.stamina - dt * 15);
    else this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + dt * 14);

    const tileUnder = getTile(this, Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
    this.player.inWater = isWaterTile(tileUnder);

    let speed = this.player.speed;
    if (this.player.equipment.feet && ITEMS[this.player.equipment.feet.id]?.speedBonus) {
      speed += ITEMS[this.player.equipment.feet.id].speedBonus!;
    }
    if (this.player.speedBoostTimer > 0) speed *= 1.35;
    if (this.player.mountedHorse) {
      speed *= this.player.mountedHorse.speedMult || 1.56;
    }
    if (sprinting) speed *= 1.42;
    if (this.player.inWater && !this.player.mountedHorse) speed *= 0.62;

    if (mag > 0) {
      if (this.player.mountedHorse) {
        this.moveWithCollision(this.player.mountedHorse, ix * speed * dt, iy * speed * dt, false);
        this.player.x = this.player.mountedHorse.x;
        this.player.y = this.player.mountedHorse.y;
        this.player.mountedHorse.facingDir = ix < -0.1 ? -1 : ix > 0.1 ? 1 : this.player.mountedHorse.facingDir;
      } else {
        this.moveWithCollision(this.player, ix * speed * dt, iy * speed * dt, false);
      }
      this.player.walkCycle += dt * (sprinting ? 14 : 9.5);

      // PLAYER FOOTSTEP SOUND EFFECT synchronized to stride cycle!
      const halfCycle = Math.floor(this.player.walkCycle / Math.PI);
      if (halfCycle !== this.lastStepHalfCycle) {
        this.lastStepHalfCycle = halfCycle;
        if (this.player.mountedHorse) {
          audio.sfxHoof();
        } else {
          const surface = this.getSurfaceType(this.player.x, this.player.y);
          audio.sfxPlayerFootstep(surface, sprinting);
        }
      }

      if (this.player.inWater) {
        this.player.rippleTimer += dt;
        if (this.player.rippleTimer > 0.28) {
          this.player.rippleTimer = 0;
          if (this.ripples.length < 30) {
            this.ripples.push({ x: this.player.x, y: this.player.y + 8, radius: 4, alpha: 0.75 });
          }
        }
      }
    }

    this.player.angle = Math.atan2(this.mouse.worldY - this.player.y, this.mouse.worldX - this.player.x);
    this.player.facingDir = Math.cos(this.player.angle) >= 0 ? 1 : -1;
    this.player.blocking = !!(this.mouse.rightDown || this.keys['f']);
    this.updateChunksAroundPlayer();
  }

  damageVehicle(v: Vehicle, dmg: number, sourceType: 'melee' | 'spit' | 'meteor' | 'bullet' | 'crash') {
    if (v.hp <= 0) return;
    // Zombies CANNOT melee-break a helicopter while it is flying with a spinning animated propeller!
    if (v.kind === 'helicopter' && v.altitude >= 0.25 && sourceType === 'melee') {
      return;
    }

    const actual =
      sourceType === 'crash'
        ? Math.max(8, dmg)
        : sourceType === 'bullet' && v.kind === 'helicopter'
          ? Math.max(6, Math.round(dmg * 0.9))
          : Math.max(3, Math.round(dmg * (sourceType === 'meteor' ? 0.9 : 100 / (100 + v.armor * 1.8))));
    v.hp = Math.max(0, v.hp - actual);
    v.hurtFlash = 0.16;
    audio.sfxHit();
    if (sourceType === 'bullet') {
      this.spawnParticles(v.x, v.y - v.altitude * 28, '#facc15', 5, 95);
    }
    if (sourceType !== 'crash') {
      this.spawnFloatingText(v.x, v.y - 24 - v.altitude * 24, `-${actual} HP`, '#fb923c');
    }

    if (v.hp <= 0) {
      this.explodeVehicle(v);
    }
  }

  explodeVehicle(v: Vehicle) {
    const idx = this.vehicles.indexOf(v);
    if (idx === -1) return;
    this.vehicles.splice(idx, 1);

    // Boom sound, screen shake, shockwave, fire & smoke particles!
    audio.sfxExplosion();
    this.screenShake = Math.max(this.screenShake, 0.95);
    const blastRadius = 155;
    this.shockwaves.push({ x: v.x, y: v.y, radius: 14, maxRadius: blastRadius, alpha: 0.95 });
    this.spawnParticles(v.x, v.y, '#0f172a', 14, 120);
    this.spawnParticles(v.x, v.y, '#475569', 12, 140);
    this.spawnParticles(v.x, v.y, '#f97316', 18, 190);
    this.spawnParticles(v.x, v.y, '#ef4444', 14, 210);
    this.spawnParticles(v.x, v.y, '#facc15', 10, 165);
    this.spawnFloatingText(v.x, v.y - 26, '💥 BOOM!', '#f97316');
    this.toast(`💥 ${v.name} exploded in flames!`, 'rose');

    // Eject & damage any driver (both player AND AI driver take heavy blast damage!)
    if (this.player.inVehicle === v) {
      this.player.inVehicle = null;
      this.player.x = v.x + 26;
      this.player.y = v.y + 20;
      this.damagePlayer(42);
      this.spawnFloatingText(this.player.x, this.player.y - 26, '-42 DRIVER BLAST!', '#ef4444');
    }
    if (v.driverEntity) {
      const drv = v.driverEntity;
      drv.inVehicle = null;
      drv.assignedVehicle = null;
      drv.x = v.x + 24;
      drv.y = v.y + 20;
      const drvDmg = Math.max(55, Math.round(drv.maxHp * 0.48));
      this.damageEntity(drv, drvDmg, 180, 120, true, 'vehicle');
    }
    for (const ent of this.entities) {
      if (ent.assignedVehicle === v) ent.assignedVehicle = null;
    }

    // Medium-range blast kills zombies & nearby mobs!
    for (let j = this.entities.length - 1; j >= 0; j--) {
      const m = this.entities[j];
      const d = Math.hypot(m.x - v.x, m.y - v.y);
      if (d <= blastRadius + m.radius) {
        if (m.kind === 'zombie' || m.kind === 'animal') {
          const falloff = 1 - (d / (blastRadius + 20)) * 0.45;
          this.damageEntity(m, Math.round(230 * falloff), (m.x - v.x) * 2.5, (m.y - v.y) * 2.5, true);
        }
      }
    }
  }

  private updateVehiclesAI(dt: number) {
    let activeAiHelis = 0;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.kind === 'helicopter' && (v.driver === 'military' || v.driver === 'fbi')) activeAiHelis++;
    }
    const mechanicCities = new Set<CityData | null>();
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.kind === 'villager' && e.role === 'mechanic' && e.hp > 0) {
        mechanicCities.add(e.city || null);
      }
    }

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.hp <= 0) {
        this.explodeVehicle(v);
        continue;
      }
      if (v.hurtFlash > 0) v.hurtFlash = Math.max(0, v.hurtFlash - dt);
      if (v.fireCooldown > 0) v.fireCooldown = Math.max(0, v.fireCooldown - dt);
      if ((v.crashCooldown || 0) > 0) v.crashCooldown = Math.max(0, v.crashCooldown! - dt);

      // Damaged vehicles emit smoke & fire sparks!
      if (v.hp < v.maxHp * 0.5) {
        v.smokeTimer = (v.smokeTimer || 0) - dt;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = v.hp < v.maxHp * 0.25 ? 0.08 : 0.18;
          this.spawnParticles(v.x, v.y - v.altitude * 24, '#334155', 2, 32);
          if (v.hp < v.maxHp * 0.25) {
            this.spawnParticles(v.x, v.y - v.altitude * 24, '#f97316', 2, 48);
          }
        }
      }

      if (v.driver === 'player') continue;
      if (v.kind !== 'helicopter') {
        this.handleVehicleMobImpact(v, dt);
      }

      const gasCity = v.cityRef || this.cities[0];
      const gsX = gasCity?.gasStationX;
      const gsY = gasCity?.gasStationY;

      // Low-fuel & Low-HP check: AI vehicle heads to Gas Station when fuel <= 25% OR health < 45%!
      if (v.driver !== 'none' && gsX !== undefined && gsY !== undefined) {
        if (v.fuel <= 25 && !v.refueling) {
          v.refueling = true;
          if (Math.hypot(v.x - this.player.x, v.y - this.player.y) < 750) {
            this.spawnFloatingText(v.x, v.y - 26, '⛽ LOW FUEL → GAS STATION', '#facc15');
          }
        }
        if (v.hp > 0 && v.hp < v.maxHp * 0.45 && !v.repairing) {
          v.repairing = true;
          if (Math.hypot(v.x - this.player.x, v.y - this.player.y) < 750) {
            this.spawnFloatingText(v.x, v.y - 26, '🔧 LOW HP → GAS STATION', '#34d399');
          }
        }
      }

      if (v.kind === 'helicopter') {
        if (v.driver === 'none' && !v.engineOn && activeAiHelis < 2 && !v.repairing) {
          const threat = this.findNearestInGrid(this.zombieGrid, v.patrolCenterX, v.patrolCenterY, 550);
          if (threat) {
            v.driver = 'military';
            v.engineOn = true;
            activeAiHelis++;
          }
        }

        if (v.driver !== 'none' || v.engineOn) {
          if ((v.refueling || v.repairing) && gsX !== undefined && gsY !== undefined) {
            const dx = gsX - v.x;
            const dy = gsY - v.y;
            const dGs = Math.hypot(dx, dy);
            if (dGs > 52) {
              v.rotorAngle += dt * 20;
              v.altitude = Math.min(1, v.altitude + dt * 0.9);
              v.vx = (dx / dGs) * 175;
              v.vy = (dy / dGs) * 175;
              v.x += v.vx * dt;
              v.y += v.vy * dt;
              v.angle = Math.atan2(v.vy, v.vx);
              v.fuel = Math.max(0.5, v.fuel - dt * 0.4);
            } else {
              // Landed at Gas Station waiting until fueled & fixed by Mechanic!
              v.vx = 0;
              v.vy = 0;
              v.altitude = Math.max(0, v.altitude - dt * 1.1);
              if (v.altitude > 0.05) v.rotorAngle += dt * 8;
              if (v.refueling) {
                if (this.isGasStationOperational(gasCity)) {
                  v.fuel = Math.min(v.maxFuel || 100, v.fuel + dt * 26);
                  if (v.fuel >= (v.maxFuel || 100) - 0.5) {
                    v.fuel = v.maxFuel || 100;
                    v.refueling = false;
                    this.spawnFloatingText(v.x, v.y - 24, '⛽ 100% FUELED!', '#4ade80');
                  }
                } else if (gasCity && this.isPresidentAlive(gasCity) && gasCity.presidentCash >= 40) {
                  gasCity.presidentCash -= 40;
                  v.fuel = v.maxFuel || 100;
                  v.refueling = false;
                  this.spawnFloatingText(v.x, v.y - 24, '🏛️⛽ PRES PAID $40 FUEL!', '#38bdf8');
                } else if (Math.random() < dt * 0.45) {
                  this.spawnFloatingText(v.x, v.y - 24, '⛽🚫 BROKEN • NO PRES $', '#f43f5e');
                }
              }
              if (v.repairing && (v.hp >= v.maxHp || (!mechanicCities.has(gasCity || null) && !mechanicCities.has(null)))) {
                v.repairing = false;
              }
            }
            if (v.driverEntity) {
              v.driverEntity.x = v.x;
              v.driverEntity.y = v.y;
            }
          } else if (v.driver !== 'none' && v.fuel > 0) {
            v.rotorAngle += dt * 22;
            v.altitude = Math.min(1, v.altitude + dt * 0.9);
            v.fuel = Math.max(0, v.fuel - dt * 0.95);
            const distP = Math.hypot(v.x - this.player.x, v.y - this.player.y);
            if (distP < 520) audio.sfxHelicopterRotor(Math.max(0.08, 0.35 * (1 - distP / 520)));

            const foundZ = this.findNearestInGrid(this.zombieGrid, v.x, v.y, 520);
            const targetZ = foundZ ? foundZ.ent : null;

            v.patrolAngle += dt * 0.42;
            const destX = v.patrolCenterX + Math.cos(v.patrolAngle) * 320;
            const destY = v.patrolCenterY + Math.sin(v.patrolAngle) * 260;
            const toX = destX - v.x;
            const toY = destY - v.y;
            const dDest = Math.hypot(toX, toY) || 1;
            v.vx = (toX / dDest) * 155;
            v.vy = (toY / dDest) * 155;
            v.x += v.vx * dt;
            v.y += v.vy * dt;
            v.angle = targetZ ? Math.atan2(targetZ.y - v.y, targetZ.x - v.x) : Math.atan2(v.vy, v.vx);
            if (v.driverEntity) {
              v.driverEntity.x = v.x;
              v.driverEntity.y = v.y;
            }

            if (targetZ && v.fireCooldown <= 0) {
              v.fireCooldown = 0.2;
              const aim = Math.atan2(targetZ.y - v.y, targetZ.x - v.x);
              this.bullets.push({
                x: v.x + Math.cos(aim) * 16,
                y: v.y + Math.sin(aim) * 16,
                vx: Math.cos(aim) * 860,
                vy: Math.sin(aim) * 860,
                damage: 28,
                dist: 0,
                maxRange: 560,
                color: '#facc15',
                friendlyToPlayer: true,
                friendlyToNPC: true,
              });
              if (distP < 500) audio.sfxShoot('heli_gun');
            }
          } else {
            v.altitude = Math.max(0, v.altitude - dt * 0.8);
            if (v.altitude > 0.05) v.rotorAngle += dt * 10;
          }
        } else {
          v.altitude = Math.max(0, v.altitude - dt * 0.8);
          if (v.altitude > 0.05) v.rotorAngle += dt * 10;
        }
      } else if ((v.kind === 'jeep' || v.kind === 'car') && v.driver !== 'none' && v.driverEntity) {
        const driver = v.driverEntity;

        if ((v.refueling || v.repairing) && gsX !== undefined && gsY !== undefined) {
          let tx = gsX;
          let ty = gsY;
          const mb = v.cityRef?.militaryBounds;
          if (mb && v.cityRef?.militaryGateX !== undefined && v.cityRef?.militaryGateY !== undefined) {
            const insideBase = v.x >= mb.x1 - 16 && v.x <= mb.x2 + 16 && v.y >= mb.y1 - 16 && v.y <= mb.y2 + 16;
            if (insideBase) {
              tx = v.cityRef.militaryGateX;
              ty = v.cityRef.militaryGateY - 96;
            }
          }
          const dx = tx - v.x;
          const dy = ty - v.y;
          const dGs = Math.hypot(dx, dy);
          if (dGs > 74) {
            this.driveGroundVehiclePro(v, tx, ty, 145, dt);
            v.fuel = Math.max(0.5, v.fuel - dt * 0.45);
          } else {
            // Parked at City Gas Station waiting until fueled & fixed by Mechanic!
            v.vx = 0;
            v.vy = 0;
            if (v.refueling) {
              if (this.isGasStationOperational(gasCity)) {
                v.fuel = Math.min(v.maxFuel || 100, v.fuel + dt * 26);
                if (v.fuel >= (v.maxFuel || 100) - 0.5) {
                  v.fuel = v.maxFuel || 100;
                  v.refueling = false;
                  this.spawnFloatingText(v.x, v.y - 24, '⛽ 100% FUELED!', '#4ade80');
                }
              } else if (gasCity && this.isPresidentAlive(gasCity) && gasCity.presidentCash >= 40) {
                gasCity.presidentCash -= 40;
                v.fuel = v.maxFuel || 100;
                v.refueling = false;
                this.spawnFloatingText(v.x, v.y - 24, '🏛️⛽ PRES PAID $40 FUEL!', '#38bdf8');
              } else if (Math.random() < dt * 0.45) {
                this.spawnFloatingText(v.x, v.y - 24, '⛽🚫 BROKEN • NO PRES $', '#f43f5e');
              }
            }
            if (v.repairing && (v.hp >= v.maxHp || (!mechanicCities.has(gasCity || null) && !mechanicCities.has(null)))) {
              v.repairing = false;
            }
          }
          driver.x = v.x;
          driver.y = v.y;
        } else if (v.fuel > 0) {
          const foundZ = this.findNearestInGrid(this.zombieGrid, v.x, v.y, 460);
          const targetZ = foundZ ? foundZ.ent : null;
          const bestD = foundZ ? foundZ.dist : 9999;

          v.patrolAngle += dt * 0.38;
          let tx = targetZ ? targetZ.x : v.patrolCenterX + Math.cos(v.patrolAngle) * 340;
          let ty = targetZ ? targetZ.y : v.patrolCenterY + Math.sin(v.patrolAngle) * 280;

          const mb = v.cityRef?.militaryBounds;
          if (mb && v.cityRef?.militaryGateX !== undefined && v.cityRef?.militaryGateY !== undefined) {
            const insideBase = v.x >= mb.x1 - 16 && v.x <= mb.x2 + 16 && v.y >= mb.y1 - 16 && v.y <= mb.y2 + 16;
            if (insideBase) {
              const gx = v.cityRef.militaryGateX;
              const gy = v.cityRef.militaryGateY;
              const midRoadY = (mb.y1 + mb.y2) * 0.5;
              if (Math.abs(v.x - gx) > 54 && Math.abs(v.y - midRoadY) > 48 && v.y > gy + 120) {
                tx = gx;
                ty = midRoadY;
              } else if (Math.abs(v.x - gx) > 54) {
                tx = gx;
                ty = v.y;
              } else {
                tx = gx;
                ty = gy - 96;
              }
            }
          }

          const spd = targetZ ? 180 : 115;
          this.driveGroundVehiclePro(v, tx, ty, spd, dt);
          v.fuel = Math.max(0, v.fuel - dt * 0.85);
          driver.x = v.x;
          driver.y = v.y;

          if (targetZ && bestD < 280 && (driver.shootTimer || 0) <= 0) {
            driver.shootTimer = (driver.powerBoostTimer || 0) > 0 ? 0.38 : 0.52;
            const a = Math.atan2(targetZ.y - v.y, targetZ.x - v.x);
            const dmg = (driver.powerBoostTimer || 0) > 0 ? 32 : 24;
            this.bullets.push({
              x: v.x,
              y: v.y,
              vx: Math.cos(a) * 720,
              vy: Math.sin(a) * 720,
              damage: dmg,
              dist: 0,
              maxRange: 420,
              color: '#38bdf8',
              friendlyToPlayer: true,
              friendlyToNPC: true,
            });
          }
        }
      }
    }
  }

  // Pro AI steering: stays close to walls (nearest small turning distance) and executes slow, smooth turns around walls & humans!
  private driveGroundVehiclePro(v: Vehicle, targetX: number, targetY: number, baseSpeed: number, dt: number) {
    const desiredAngle = Math.atan2(targetY - v.y, targetX - v.x);
    const offsets = [0, 0.24, -0.24, 0.52, -0.52, 0.86, -0.86, 1.25, -1.25, 1.72, -1.72, 2.3, -2.3, Math.PI];

    let bestAngle = desiredAngle;
    let bestScore = Infinity;

    for (let o = 0; o < offsets.length; o++) {
      const ang = desiredAngle + offsets[o];
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const turnFromHeading = Math.abs(Math.atan2(Math.sin(ang - v.angle), Math.cos(ang - v.angle)));
      let penalty = Math.abs(offsets[o]) * 16 + turnFromHeading * 6;

      // Nearest-small lookahead distances from car to wall/object before turning
      for (const lookDist of [14, 24, 36]) {
        const px = v.x + cos * lookDist;
        const py = v.y + sin * lookDist;
        if (this.checkSolidCollision(px, py, v.radius + 3)) {
          penalty += 540 - lookDist * 4;
        }
        if (isWaterTile(getTile(this, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE)))) {
          penalty += 380;
        }
        // Keep clear of Player & friendly Humans along lookahead path
        if (!this.player.dead && !this.player.inVehicle && Math.hypot(this.player.x - px, this.player.y - py) < v.radius + this.player.radius + 14) {
          penalty += 460;
        }
        const hNear = this.findNearestInGrid(this.humanGrid, px, py, v.radius + 26);
        if (hNear && hNear.ent !== v.driverEntity && hNear.dist < v.radius + hNear.ent.radius + 14) {
          penalty += 480;
        }
      }

      if (penalty < bestScore) {
        bestScore = penalty;
        bestAngle = ang;
        if (penalty < 1) break;
      }
    }

    // Check immediate tight clearance right in front of the vehicle
    const nearWallAhead = this.checkSolidCollision(
      v.x + Math.cos(v.angle) * (v.radius + 14),
      v.y + Math.sin(v.angle) * (v.radius + 14),
      v.radius + 2
    );

    // Slow-smooth angular turn from current vehicle angle toward chosen path angle
    const rawDiff = Math.atan2(Math.sin(bestAngle - v.angle), Math.cos(bestAngle - v.angle));
    const maxTurnRate = nearWallAhead ? 1.95 : 1.25;
    const clampedTurn = Math.abs(rawDiff) > maxTurnRate * dt ? Math.sign(rawDiff) * maxTurnRate * dt : rawDiff;
    v.angle = Math.atan2(Math.sin(v.angle + clampedTurn), Math.cos(v.angle + clampedTurn));

    // Gently reduce speed during turns or tight wall maneuvers
    const turnFrac = Math.abs(rawDiff) / Math.PI;
    const speedScale = Math.max(0.32, (nearWallAhead ? 0.5 : 1.0) * (1 - Math.min(0.55, turnFrac * 0.72)));
    const targetVx = Math.cos(v.angle) * baseSpeed * speedScale;
    const targetVy = Math.sin(v.angle) * baseSpeed * speedScale;
    v.vx += (targetVx - v.vx) * Math.min(1, dt * 5.2);
    v.vy += (targetVy - v.vy) * Math.min(1, dt * 5.2);

    const nx = v.x + v.vx * dt;
    const ny = v.y + v.vy * dt;

    const distToPlayer = Math.hypot(v.x - this.player.x, v.y - this.player.y);
    if (distToPlayer < 420) {
      const spd = Math.hypot(v.vx, v.vy);
      if (spd > 28) {
        audio.sfxVehicleEngine(v.kind === 'jeep' ? 'jeep' : 'car', spd / Math.max(1, baseSpeed), Math.max(0.06, 0.24 * (1 - distToPlayer / 420)));
      }
      if (Math.abs(rawDiff) > 0.75 && nearWallAhead) {
        audio.sfxTireTurn();
      }
    }

    // Verify next position does NOT touch any human or solid object
    const humanTooClose =
      (!this.player.dead && !this.player.inVehicle && Math.hypot(this.player.x - nx, this.player.y - ny) < v.radius + this.player.radius + 10) ||
      (() => {
        const hCheck = this.findNearestInGrid(this.humanGrid, nx, ny, v.radius + 26);
        return !!(hCheck && hCheck.ent !== v.driverEntity && hCheck.dist < v.radius + hCheck.ent.radius + 10);
      })();

    if (humanTooClose) {
      v.vx = 0;
      v.vy = 0;
      return;
    }

    if (!this.checkSolidCollision(nx, ny, v.radius + 1)) {
      v.x = nx;
      v.y = ny;
    } else if (!this.checkSolidCollision(nx, v.y, v.radius + 1)) {
      v.vy *= 0.3;
      v.x = nx;
    } else if (!this.checkSolidCollision(v.x, ny, v.radius + 1)) {
      v.vx *= 0.3;
      v.y = ny;
    } else {
      // Smoothly rotate in place when dead-ended closely against a corner
      v.vx = 0;
      v.vy = 0;
      const inPlaceStep = Math.sign(rawDiff || 1) * 2.2 * dt;
      v.angle = Math.atan2(Math.sin(v.angle + inPlaceStep), Math.cos(v.angle + inPlaceStep));
    }
  }

  private updateEntities(dt: number) {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      if (ent.hurtFlash > 0) ent.hurtFlash = Math.max(0, ent.hurtFlash - dt);
      if (ent.shootTimer && ent.shootTimer > 0) ent.shootTimer = Math.max(0, ent.shootTimer - dt);
      if (ent.attackTimer && ent.attackTimer > 0) ent.attackTimer = Math.max(0, ent.attackTimer - dt);
      if (ent.burnTimer && ent.burnTimer > 0) {
        ent.burnTimer -= dt;
        if (Math.random() < 0.08) this.damageEntity(ent, 6);
        if (ent.hp <= 0) continue;
      }

      if (ent.inVehicle) continue;

      const distToPlayer = Math.hypot(ent.x - this.player.x, ent.y - this.player.y);
      let moved = false;

      // 1. PRESIDENT AI: Stays inside White House Oval Office, earns city tax, & spends Treasury money on every Command!
      if (ent.kind === 'president' && ent.city) {
        if (ent.city.surrendered) {
          // Evacuate toward Military Base during Retreat
          const rdx = ent.city.militaryBaseX - ent.x;
          const rdy = ent.city.militaryBaseY - ent.y;
          const rd = Math.hypot(rdx, rdy);
          if (rd > 56) {
            this.moveWithCollision(ent, (rdx / rd) * ent.speed * dt, (rdy / rd) * ent.speed * dt, false);
            ent.facingDir = rdx >= 0 ? 1 : -1;
            moved = true;
          }
          ent.workingAtComputer = false;
        } else if (ent.homeX !== undefined && ent.homeY !== undefined) {
          const hdx = ent.homeX - ent.x;
          const hdy = ent.homeY - ent.y;
          const hd = Math.hypot(hdx, hdy);
          if (hd > 24) {
            this.moveWithCollision(ent, (hdx / hd) * ent.speed * dt, (hdy / hd) * ent.speed * dt, false);
            ent.facingDir = hdx >= 0 ? 1 : -1;
            moved = true;
            ent.workingAtComputer = false;
          } else {
            ent.workingAtComputer = true;
          }
        }
        ent.commandCooldown = (ent.commandCooldown || 4) - dt;
        if (ent.commandCooldown <= 0) {
          ent.commandCooldown = 4.5;
          if (!ent.city.surrendered) {
            ent.city.presidentCash = Math.min(2500, (ent.city.presidentCash ?? 0) + 8);
          }
          this.evaluatePresidentCityCommand(ent.city, false);
        }
        ent.builderOrderTimer = (ent.builderOrderTimer ?? 3) - dt;
        if (ent.builderOrderTimer <= 0 && !ent.city.surrendered) {
          ent.builderOrderTimer = 11;
          const nextExp = EXPANSION_SEQUENCE.find((id) => !ent.city!.expansionsBuilt[id]);
          const hasFreeBuilder = this.entities.some((b) => b.kind === 'builder' && b.city === ent.city && !b.buildTask);
          if (nextExp && hasFreeBuilder) {
            const site = getExpansionSiteCoords(ent.city, nextExp);
            const spent = this.spendPresidentTreasury(ent.city, 45, false);
            if (spent >= 0) {
              ent.city.presidentOrder = `🏗️ EXPANDING: ${site.label.toUpperCase()} (-$${spent})`;
              audio.sfxPresidentCommand();
              for (const b of this.entities) {
                if (b.kind === 'builder' && b.city === ent.city && !b.buildTask) {
                  b.buildTask = {
                    expansionId: nextExp,
                    targetX: site.x,
                    targetY: site.y,
                    label: site.label,
                    workTimer: 3.0,
                  };
                }
              }
            } else {
              ent.city.presidentOrder = `💰 AWAITING TAX ($${Math.round(ent.city.presidentCash)}/$45)`;
            }
          }
        }
      }

      // 2. AUTONOMOUS 15 BUILDERS AI: Walk to site, fix damaged city objects or construct districts + Roadside!
      else if (ent.kind === 'builder' && ent.city) {
        if (ent.rallyTimer && ent.rallyTimer > 0 && ent.rallyX !== undefined && ent.rallyY !== undefined) {
          ent.rallyTimer -= dt;
          const dx = ent.rallyX - ent.x;
          const dy = ent.rallyY - ent.y;
          const d = Math.hypot(dx, dy);
          if (d > 58) {
            this.moveWithCollision(ent, (dx / d) * ent.speed * 1.15 * dt, (dy / d) * ent.speed * 1.15 * dt, false);
            ent.facingDir = dx >= 0 ? 1 : -1;
            moved = true;
          }
        } else if (ent.buildTask) {
          const dx = ent.buildTask.targetX - ent.x;
          const dy = ent.buildTask.targetY - ent.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 48) {
            this.moveWithCollision(ent, (dx / dist) * ent.speed * dt, (dy / dist) * ent.speed * dt, false);
            ent.facingDir = dx >= 0 ? 1 : -1;
            moved = true;
          } else {
            ent.buildTask.workTimer -= dt;
            if (Math.random() < 0.12) this.spawnParticles(ent.x, ent.y, '#facc15', 2, 45);
            if (ent.buildTask.workTimer <= 0) {
              if (ent.buildTask.repairKey) {
                const [rtxStr, rtyStr] = ent.buildTask.repairKey.split(',');
                const rtx = Number(rtxStr);
                const rty = Number(rtyStr);
                const robj = this.objects.get(ent.buildTask.repairKey);
                if (robj) {
                  robj.hp = robj.maxHp;
                  robj.damaged = false;
                  audio.sfxBuild();
                  this.spawnParticles(ent.buildTask.targetX, ent.buildTask.targetY, '#4ade80', 6, 60);
                  this.spawnFloatingText(ent.buildTask.targetX, ent.buildTask.targetY - 14, '🔧 FIXED!', '#4ade80');
                } else if (ent.buildTask.repairObjType && Number.isFinite(rtx) && Number.isFinite(rty)) {
                  this.resources.delete(ent.buildTask.repairKey);
                  placeObject(this, rtx, rty, ent.buildTask.repairObjType, false, null, ent.city);
                  if (ent.buildTask.repairObjType === 'gas_pump' && ent.city.gasStationBroken) {
                    ent.city.gasStationBroken = false;
                    this.toast(`⛽🔧 Builders rebuilt the Gas Station Fuel Pump in ${ent.city.name}! Refueling restored!`, 'emerald');
                  }
                  audio.sfxBuild();
                  this.spawnParticles(ent.buildTask.targetX, ent.buildTask.targetY, '#38bdf8', 8, 70);
                  this.spawnFloatingText(ent.buildTask.targetX, ent.buildTask.targetY - 14, '🏗️ REBUILT!', '#38bdf8');
                }
                // Chain to the next damaged/destroyed structure in the target zone if any remain
                const zoneFilter = (ent.buildTask.repairZone as 'all' | 'military_base' | 'gas_station' | 'white_house' | 'farmland') || 'all';
                this.cityMetricsCache.delete(ent.city);
                const remaining = this.getCityRepairTargets(ent.city, zoneFilter);
                if (remaining.length > 0) {
                  const nextTgt = remaining[(ent.builderIndex || 0) % remaining.length];
                  ent.buildTask = {
                    expansionId: 'fortify_walls',
                    targetX: (nextTgt.tx + 0.5) * TILE_SIZE,
                    targetY: (nextTgt.ty + 0.5) * TILE_SIZE,
                    label: `${nextTgt.destroyed ? 'Rebuild' : 'Fix'} ${nextTgt.name}`,
                    workTimer: nextTgt.destroyed ? 1.4 : 1.0,
                    repairKey: `${nextTgt.tx},${nextTgt.ty}`,
                    repairObjType: nextTgt.type,
                    repairZone: zoneFilter,
                  };
                  continue;
                }
              } else {
                const built = buildCityExpansion(this, ent.city, ent.buildTask.expansionId);
                if (built) {
                  audio.sfxBuild();
                  this.toast(`🏗️ President's Builders finished ${ent.buildTask.label} + Roadside in ${ent.city.name}!`, 'emerald');
                }
              }
              ent.buildTask = null;
            }
          }
        } else {
          ent.wanderTimer -= dt;
          if (ent.wanderTimer <= 0) {
            ent.wanderTimer = 2.5 + Math.random() * 2;
            ent.wanderAngle = Math.random() * Math.PI * 2;
          }
          const mx = Math.cos(ent.wanderAngle) * ent.speed * 0.45 * dt;
          const my = Math.sin(ent.wanderAngle) * ent.speed * 0.45 * dt;
          this.moveWithCollision(ent, mx, my, false);
          ent.facingDir = mx >= 0 ? 1 : -1;
          moved = true;
        }
      }

      // 3. GUARDS & FBI AI (Innocent vs Hostile-to-Player + RADAR Alert Mobilization + Camp Rest & Eat!)
      else if (ent.kind === 'guard') {
        if ((ent.powerBoostTimer || 0) > 0) ent.powerBoostTimer = Math.max(0, ent.powerBoostTimer! - dt);

        // If guard was provoked by player killing a villager, chase & shoot player until far away, then turn INNOCENT!
        if (ent.hostileToPlayer) {
          if (this.player.dead || distToPlayer > 780) {
            ent.hostileToPlayer = false;
            ent.shootTimer = 0.5;
            this.spawnFloatingText(ent.x, ent.y - 26, '🕊️ INNOCENT', '#4ade80');
          } else {
            ent.restingAtCamp = false;
            const a = Math.atan2(this.player.y - ent.y, this.player.x - ent.x);
            ent.facingDir = Math.cos(a) >= 0 ? 1 : -1;
            const chaseSpd = ent.speed * 1.18;
            const holdDist = ent.weaponMode === 'bat_shield' ? 32 : 145;
            if (distToPlayer > holdDist) {
              this.moveWithCollision(ent, Math.cos(a) * chaseSpd * dt, Math.sin(a) * chaseSpd * dt, false);
              moved = true;
            }
            if ((ent.shootTimer || 0) <= 0) {
              if (ent.weaponMode === 'bat_shield' && distToPlayer <= 44) {
                ent.shootTimer = 0.72;
                this.damagePlayer(ent.damage || 22);
              } else if (distToPlayer < 460) {
                ent.shootTimer = 0.55;
                this.bullets.push({
                  x: ent.x,
                  y: ent.y,
                  vx: Math.cos(a) * 680,
                  vy: Math.sin(a) * 680,
                  damage: ent.damage || 19,
                  dist: 0,
                  maxRange: 480,
                  color: '#f43f5e',
                  friendlyToPlayer: false,
                  friendlyToNPC: true,
                });
                audio.sfxShoot('pistol');
              }
            }
          }
        }

        if (!ent.hostileToPlayer && ent.assignedVehicle) {
          const av = ent.assignedVehicle;
          if (av.hp <= 0 || av.driver !== 'none') {
            ent.assignedVehicle = null;
          } else {
            const dx = av.x - ent.x;
            const dy = av.y - ent.y;
            const d = Math.hypot(dx, dy);
            if (d > 38) {
              const spd = ent.speed * 1.35;
              this.moveWithCollision(ent, (dx / d) * spd * dt, (dy / d) * spd * dt, false);
              ent.facingDir = dx >= 0 ? 1 : -1;
              moved = true;
            } else {
              av.driver = ent.role === 'fbi' ? 'fbi' : 'military';
              av.driverEntity = ent;
              av.engineOn = true;
              av.headlightsOn = true;
              ent.inVehicle = av;
              ent.assignedVehicle = null;
              if (distToPlayer < 650) {
                this.spawnFloatingText(av.x, av.y - 24, av.kind === 'helicopter' ? '🚁 FBI LIFTOFF!' : '🚙 FBI ROLLOUT!', '#38bdf8');
              }
              continue;
            }
          }
        }

        const radarAlert = !!ent.city?.radarAlertActive;
        const energy = ent.energy ?? 100;
        const needsCamp =
          ent.city &&
          !ent.protectingPresident &&
          !ent.assignedVehicle &&
          !ent.hostileToPlayer &&
          !radarAlert &&
          (energy < 35 || ent.hp < ent.maxHp * 0.65);

        if (ent.protectingPresident && ent.city && !ent.hostileToPlayer && !ent.assignedVehicle) {
          const pres = this.entities.find((p) => p.kind === 'president' && p.city === ent.city && p.hp > 0);
          const nearPresZ = pres ? this.findNearestInGrid(this.zombieGrid, pres.x, pres.y, 440) : null;
          const nearSelfZ = this.findNearestInGrid(this.zombieGrid, ent.x, ent.y, 380);
          const targetZ = nearPresZ ? nearPresZ.ent : nearSelfZ ? nearSelfZ.ent : null;
          const bestD = targetZ ? Math.hypot(targetZ.x - ent.x, targetZ.y - ent.y) : 9999;

          if (targetZ) {
            const a = Math.atan2(targetZ.y - ent.y, targetZ.x - ent.x);
            ent.facingDir = Math.cos(a) >= 0 ? 1 : -1;
            const escortAnchorDist = pres ? Math.hypot(ent.x - pres.x, ent.y - pres.y) : 0;
            if (bestD > 145 && escortAnchorDist < 220) {
              this.moveWithCollision(ent, Math.cos(a) * ent.speed * 1.12 * dt, Math.sin(a) * ent.speed * 1.12 * dt, false);
              moved = true;
            }
            if ((ent.shootTimer || 0) <= 0) {
              ent.shootTimer = 0.5;
              this.bullets.push({
                x: ent.x,
                y: ent.y,
                vx: Math.cos(a) * 700,
                vy: Math.sin(a) * 700,
                damage: Math.round((ent.damage || 24) * 1.15),
                dist: 0,
                maxRange: 420,
                color: ent.role === 'fbi' ? '#38bdf8' : '#facc15',
                friendlyToPlayer: true,
                friendlyToNPC: true,
              });
              if (distToPlayer < 420) audio.sfxShoot('pistol');
            }
          } else {
            const guardTargetX = pres && ent.city.surrendered ? pres.x : (ent.homeX ?? pres?.x ?? ent.x);
            const guardTargetY = pres && ent.city.surrendered ? pres.y : (ent.homeY ?? pres?.y ?? ent.y);
            const gdx = guardTargetX - ent.x;
            const gdy = guardTargetY - ent.y;
            const gd = Math.hypot(gdx, gdy);
            if (gd > 48) {
              this.moveWithCollision(ent, (gdx / gd) * ent.speed * dt, (gdy / gd) * ent.speed * dt, false);
              ent.facingDir = gdx >= 0 ? 1 : -1;
              moved = true;
            }
          }
        } else if (ent.restingAtCamp && ent.city && !ent.hostileToPlayer) {
          if (radarAlert && ent.hp > ent.maxHp * 0.45) {
            ent.restingAtCamp = false;
          } else {
            ent.restTimer = (ent.restTimer || 3.5) - dt;
            ent.hp = Math.min(ent.maxHp, ent.hp + dt * 22);
            ent.energy = Math.min(ent.maxEnergy || 100, energy + dt * 28);
            if (ent.restTimer <= 0 && ent.energy >= 95 && ent.hp >= ent.maxHp * 0.9) {
              ent.restingAtCamp = false;
              ent.powerBoostTimer = 40;
              this.spawnFloatingText(ent.x, ent.y - 24, '⚡ +POWER BOOST!', '#facc15');
            }
          }
        } else if (!ent.hostileToPlayer && !ent.assignedVehicle && !moved) {
          const detectRange = radarAlert ? 640 : 360;
          const foundZ = this.findNearestInGrid(this.zombieGrid, ent.x, ent.y, detectRange);
          const targetZ = foundZ ? foundZ.ent : null;
          const bestD = foundZ ? foundZ.dist : 9999;

          if (needsCamp && !targetZ && ent.city) {
            const dx = ent.city.militaryCampX - ent.x;
            const dy = ent.city.militaryCampY - ent.y;
            const dCamp = Math.hypot(dx, dy);
            if (dCamp > 56) {
              this.moveWithCollision(ent, (dx / dCamp) * ent.speed * dt, (dy / dCamp) * ent.speed * dt, false);
              ent.facingDir = dx >= 0 ? 1 : -1;
              moved = true;
            } else {
              ent.restingAtCamp = true;
              ent.restTimer = 3.5;
            }
          } else if (targetZ) {
            const a = Math.atan2(targetZ.y - ent.y, targetZ.x - ent.x);
            ent.facingDir = Math.cos(a) >= 0 ? 1 : -1;
            const speedMult = ((ent.powerBoostTimer || 0) > 0 ? 1.25 : 1.0) * (radarAlert ? 1.15 : 1.0);
            if (bestD > 160) {
              this.moveWithCollision(ent, Math.cos(a) * ent.speed * speedMult * dt, Math.sin(a) * ent.speed * speedMult * dt, false);
              moved = true;
            }
            ent.energy = Math.max(0, energy - dt * 2.2);
            if ((ent.shootTimer || 0) <= 0) {
              ent.shootTimer = (ent.powerBoostTimer || 0) > 0 ? 0.44 : 0.65;
              const dmg = Math.round((ent.damage || 22) * ((ent.powerBoostTimer || 0) > 0 ? 1.45 : 1.0));
              this.bullets.push({
                x: ent.x,
                y: ent.y,
                vx: Math.cos(a) * 680,
                vy: Math.sin(a) * 680,
                damage: dmg,
                dist: 0,
                maxRange: 380,
                color: (ent.powerBoostTimer || 0) > 0 ? '#facc15' : ent.role === 'fbi' ? '#38bdf8' : '#fde047',
                friendlyToPlayer: true,
                friendlyToNPC: true,
              });
              if (distToPlayer < 420) audio.sfxShoot('pistol');
            }
          } else if (radarAlert && ent.city?.radarThreatX !== undefined && ent.city?.radarThreatY !== undefined) {
            // Prepare & scramble toward detected zombie swarm!
            const rdx = ent.city.radarThreatX - ent.x;
            const rdy = ent.city.radarThreatY - ent.y;
            const rd = Math.hypot(rdx, rdy);
            if (rd > 120) {
              const spd = ent.speed * 1.18;
              this.moveWithCollision(ent, (rdx / rd) * spd * dt, (rdy / rd) * spd * dt, false);
              ent.facingDir = rdx >= 0 ? 1 : -1;
              moved = true;
            }
          } else {
            ent.wanderTimer -= dt;
            if (ent.wanderTimer <= 0) {
              ent.wanderTimer = 2.6;
              if (ent.homeX !== undefined && ent.homeY !== undefined && Math.hypot(ent.x - ent.homeX, ent.y - ent.homeY) > 110) {
                ent.wanderAngle = Math.atan2(ent.homeY - ent.y, ent.homeX - ent.x) + (Math.random() - 0.5) * 0.5;
              } else {
                ent.wanderAngle = Math.random() * Math.PI * 2;
              }
            }
            const mx = Math.cos(ent.wanderAngle) * ent.speed * 0.4 * dt;
            const my = Math.sin(ent.wanderAngle) * ent.speed * 0.4 * dt;
            this.moveWithCollision(ent, mx, my, false);
            ent.facingDir = mx >= 0 ? 1 : -1;
            moved = true;
          }
        }
      }

      // 4. ZOMBIE AI (Spatial Grid + Distant Offscreen AI Throttling for 750+ smooth zombies!)
      else if (ent.kind === 'zombie') {
        // Boss Zombie King Titan periodic Meteor Attack: 15 meteors closely around King (NOT targeting player!)
        if (ent.subType === 'king') {
          ent.leapCooldown = (ent.leapCooldown || 4) - dt;
          if (ent.leapCooldown <= 0) {
            ent.leapCooldown = 6.2;
            for (let mi = 0; mi < 15; mi++) {
              const a = Math.random() * Math.PI * 2;
              const d = 60 + Math.random() * 195;
              this.meteorImpacts.push({
                x: ent.x + Math.cos(a) * d,
                y: ent.y + Math.sin(a) * d,
                timer: 1.2 + Math.random() * 1.1,
                radius: 76,
                isPoison: false,
              });
            }
            audio.sfxBossRoarEarthquake();
            this.toast('☄️ ZOMBIE KING summoned 15 METEORS around itself!', 'rose');
          }
        }

        // Throttle offscreen distant non-king zombies (~4.5Hz AI tick instead of 60Hz) to keep FPS butter-smooth!
        let stepDt = dt;
        const farOffscreen = ent.subType !== 'king' && (Math.abs(ent.x - this.player.x) > 880 || Math.abs(ent.y - this.player.y) > 720);
        if (farOffscreen && ent.subType !== 'king') {
          ent.aiTickAccum = (ent.aiTickAccum || 0) + dt;
          if (ent.aiTickAccum < 0.22) {
            continue;
          }
          stepDt = ent.aiTickAccum;
          ent.aiTickAccum = 0;
        }

        let tx = this.player.x;
        let ty = this.player.y;
        let targetDist = distToPlayer;
        let chasingPlayer = !this.player.dead && distToPlayer < 420;

        // Check nearby Ground Vehicles (or landed helicopters altitude < 0.25) to break!
        let nearGroundVehicle: Vehicle | null = null;
        let bestVDist = 175;
        for (let vi = 0; vi < this.vehicles.length; vi++) {
          const v = this.vehicles[vi];
          if (v.hp <= 0) continue;
          if (v.kind === 'helicopter' && v.altitude >= 0.25) continue;
          if (Math.abs(v.x - ent.x) > bestVDist || Math.abs(v.y - ent.y) > bestVDist) continue;
          const d = Math.hypot(v.x - ent.x, v.y - ent.y);
          if (d < bestVDist) {
            bestVDist = d;
            nearGroundVehicle = v;
          }
        }

        let targetNpc: GameEntity | null = null;
        if (nearGroundVehicle && (!chasingPlayer || bestVDist < distToPlayer)) {
          tx = nearGroundVehicle.x;
          ty = nearGroundVehicle.y;
          targetDist = bestVDist;
        } else if (!chasingPlayer) {
          const foundNpc = this.findNearestInGrid(this.humanGrid, ent.x, ent.y, 260);
          if (foundNpc) {
            targetNpc = foundNpc.ent;
            tx = targetNpc.x;
            ty = targetNpc.y;
            targetDist = foundNpc.dist;
          } else if (ent.escortBoss && ent.escortBoss.hp > 0) {
            tx = ent.escortBoss.x;
            ty = ent.escortBoss.y;
            targetDist = Math.hypot(tx - ent.x, ty - ent.y);
          } else if (ent.targetCity) {
            tx = ent.targetCity.x;
            ty = ent.targetCity.y;
            targetDist = Math.hypot(tx - ent.x, ty - ent.y);
          }
        }

        if (chasingPlayer || nearGroundVehicle || targetNpc || ent.escortBoss || ent.targetCity || targetDist < 320) {
          const dx = tx - ent.x;
          const dy = ty - ent.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > ent.radius + 14) {
            const prevX = ent.x;
            const prevY = ent.y;
            if (farOffscreen) {
              // Fast step for far-away horde marching without repeated tile grid lookups
              ent.x += (dx / d) * ent.speed * stepDt;
              ent.y += (dy / d) * ent.speed * stepDt;
            } else {
              this.moveWithCollision(ent, (dx / d) * ent.speed * stepDt, (dy / d) * ent.speed * stepDt, false);
            }
            ent.facingDir = dx >= 0 ? 1 : -1;
            moved = true;

            if (!farOffscreen && Math.hypot(ent.x - prevX, ent.y - prevY) < ent.speed * stepDt * 0.25 && (ent.objectBashTimer || 0) <= 0) {
              ent.objectBashTimer = 1.0;
              const checkTx = Math.floor((ent.x + (dx / d) * (ent.radius + 18)) / TILE_SIZE);
              const checkTy = Math.floor((ent.y + (dy / d) * (ent.radius + 18)) / TILE_SIZE);
              const blockKey = `${checkTx},${checkTy}`;
              const bObj = this.objects.get(blockKey);
              if (bObj && bObj.solid && !bObj.open) {
                bObj.hp -= ent.damage || 16;
                bObj.damaged = true;
                if (bObj.hp <= 0) {
                  if (bObj.type === 'gas_pump') this.triggerGasStationExplosion(bObj.tx, bObj.ty);
                  else this.objects.delete(blockKey);
                }
              }
            }
          }
          if (ent.objectBashTimer && ent.objectBashTimer > 0) ent.objectBashTimer = Math.max(0, ent.objectBashTimer - stepDt);

          if (nearGroundVehicle && bestVDist < ent.radius + nearGroundVehicle.radius + 12 && (ent.attackTimer || 0) <= 0) {
            ent.attackTimer = 0.9;
            this.damageVehicle(nearGroundVehicle, ent.damage || 16, 'melee');
          } else if (targetNpc && targetDist < ent.radius + targetNpc.radius + 10 && (ent.attackTimer || 0) <= 0) {
            ent.attackTimer = 1.0;
            this.damageEntity(targetNpc, ent.damage || 14);
          } else if (chasingPlayer && !this.player.inVehicle && distToPlayer < ent.radius + this.player.radius + 10 && (ent.attackTimer || 0) <= 0) {
            ent.attackTimer = 0.95;
            this.damagePlayer(ent.damage || 14);
          }

          if (ent.subType === 'spitter' && !farOffscreen) {
            const targetHeli = this.vehicles.find(
              (v) => v.kind === 'helicopter' && v.altitude >= 0.2 && Math.hypot(v.x - ent.x, v.y - ent.y) < 340
            );
            if ((chasingPlayer && distToPlayer < 320) || targetHeli) {
              ent.spitTimer = (ent.spitTimer || 2) - stepDt;
              if (ent.spitTimer <= 0) {
                ent.spitTimer = 2.3;
                const aimX = targetHeli ? targetHeli.x : this.player.x;
                const aimY = targetHeli ? targetHeli.y : this.player.y;
                const a = Math.atan2(aimY - ent.y, aimX - ent.x);
                this.spitProjectiles.push({
                  x: ent.x,
                  y: ent.y,
                  vx: Math.cos(a) * 340,
                  vy: Math.sin(a) * 340,
                  damage: 16,
                  dist: 0,
                  maxRange: 370,
                  isBloodmoon: this.bloodmoonTimer > 0 || !!ent.isBodybuilder,
                });
                if (distToPlayer < 400) audio.sfxSpit();
              }
            }
          }
        } else {
          ent.wanderTimer -= stepDt;
          if (ent.wanderTimer <= 0) {
            ent.wanderTimer = 2 + Math.random() * 2;
            ent.wanderAngle = Math.random() * Math.PI * 2;
          }
          const mx = Math.cos(ent.wanderAngle) * ent.speed * 0.45 * stepDt;
          const my = Math.sin(ent.wanderAngle) * ent.speed * 0.45 * stepDt;
          if (farOffscreen) {
            ent.x += mx;
            ent.y += my;
          } else {
            this.moveWithCollision(ent, mx, my, false);
          }
          ent.facingDir = mx >= 0 ? 1 : -1;
          moved = true;
        }
      }

      // 5. VILLAGERS (including Hard-Working Farmers, Gas Man & President Retreat), ANIMALS, HORSES
      else {
        if (ent.kind === 'villager' && ent.rallyTimer && ent.rallyTimer > 0 && ent.rallyX !== undefined && ent.rallyY !== undefined) {
          ent.rallyTimer -= dt;
          const dx = ent.rallyX - ent.x;
          const dy = ent.rallyY - ent.y;
          const d = Math.hypot(dx, dy);
          if (d > 64) {
            this.moveWithCollision(ent, (dx / d) * ent.speed * 1.2 * dt, (dy / d) * ent.speed * 1.2 * dt, false);
            ent.facingDir = dx >= 0 ? 1 : -1;
            moved = true;
          }
        } else if (ent.kind === 'villager' && ent.role === 'farmer') {
          // Hard-Working Farmer AI: Plant empty farmland, water/tend growing wheat, harvest mature wheat, and store in Farmhouse!
          ent.farmerWorkTimer = (ent.farmerWorkTimer || 0) - dt;
          const fb = ent.city?.farmlandBounds;
          if ((ent.carryingCrops || 0) >= 2 && fb) {
            ent.farmerState = 'store';
            ent.farmerTargetX = fb.farmhouseX;
            ent.farmerTargetY = fb.farmhouseY;
          } else if (ent.farmerTargetX === undefined || ent.farmerTargetY === undefined || ent.farmerWorkTimer <= -3) {
            const centerX = Math.floor((ent.homeX ?? ent.x) / TILE_SIZE);
            const centerY = Math.floor((ent.homeY ?? ent.y) / TILE_SIZE);
            let chosenTx = centerX;
            let chosenTy = centerY;
            let chosenMode: 'plant' | 'tend' | 'harvest' | 'feed' = 'tend';
            let found = false;

            for (let attempt = 0; attempt < 22; attempt++) {
              const rx = centerX + Math.floor((Math.random() - 0.5) * 14);
              const ry = centerY + Math.floor((Math.random() - 0.5) * 12);
              const t = getTile(this, rx, ry);
              if (t !== 'farmland') continue;
              const existing = this.objects.get(`${rx},${ry}`);
              if (!existing) {
                chosenTx = rx;
                chosenTy = ry;
                chosenMode = 'plant';
                found = true;
                break;
              } else if (existing.type === 'crop_wheat') {
                if (existing.growth >= 1) {
                  chosenTx = rx;
                  chosenTy = ry;
                  chosenMode = 'harvest';
                  found = true;
                  break;
                } else if (!found) {
                  chosenTx = rx;
                  chosenTy = ry;
                  chosenMode = 'tend';
                  found = true;
                }
              }
            }
            if (!found && fb) {
              chosenTx = Math.floor(fb.farmhouseX / TILE_SIZE);
              chosenTy = Math.floor(fb.farmhouseY / TILE_SIZE);
              chosenMode = 'feed';
            }
            ent.farmerState = chosenMode;
            ent.farmerTargetX = (chosenTx + 0.5) * TILE_SIZE;
            ent.farmerTargetY = (chosenTy + 0.5) * TILE_SIZE;
            ent.farmerWorkTimer = 0.9;
          }

          const fdx = (ent.farmerTargetX ?? ent.x) - ent.x;
          const fdy = (ent.farmerTargetY ?? ent.y) - ent.y;
          const fdist = Math.hypot(fdx, fdy);
          if (fdist > 28) {
            this.moveWithCollision(ent, (fdx / fdist) * ent.speed * 1.1 * dt, (fdy / fdist) * ent.speed * 1.1 * dt, false);
            ent.facingDir = fdx >= 0 ? 1 : -1;
            moved = true;
          } else if ((ent.farmerWorkTimer || 0) <= 0) {
            const ttx = Math.floor((ent.farmerTargetX ?? ent.x) / TILE_SIZE);
            const tty = Math.floor((ent.farmerTargetY ?? ent.y) / TILE_SIZE);
            const tkey = `${ttx},${tty}`;
            if (ent.farmerState === 'store' && fb) {
              const chest = this.objects.get(fb.chestKey);
              if (chest) {
                const slot = chest.items.find((it) => it && it.id === 'wheat' && it.count < 30);
                if (slot) slot.count += 2;
                else {
                  const emptyIdx = chest.items.findIndex((it) => !it);
                  if (emptyIdx >= 0) chest.items[emptyIdx] = { id: 'wheat', count: 2 };
                }
              }
              ent.carryingCrops = 0;
              if (distToPlayer < 450) {
                this.spawnParticles(ent.x, ent.y, '#facc15', 5, 50);
                this.spawnFloatingText(ent.x, ent.y - 22, '🏠 STORED +2 WHEAT', '#fde047');
              }
            } else if (ent.farmerState === 'plant' && getTile(this, ttx, tty) === 'farmland' && !this.objects.has(tkey)) {
              placeObject(this, ttx, tty, 'crop_wheat', false);
              const newCrop = this.objects.get(tkey);
              if (newCrop) newCrop.growth = 0.16;
              if (distToPlayer < 420) this.spawnParticles(ent.x, ent.y, '#4ade80', 4, 40);
            } else if (ent.farmerState === 'tend') {
              const crop = this.objects.get(tkey);
              if (crop && crop.type === 'crop_wheat') {
                crop.growth = Math.min(1, crop.growth + 0.34);
                if (distToPlayer < 420) this.spawnParticles(ent.x, ent.y, '#38bdf8', 3, 35);
              }
            } else if (ent.farmerState === 'harvest') {
              const crop = this.objects.get(tkey);
              if (crop && crop.type === 'crop_wheat' && crop.growth >= 1) {
                crop.growth = 0.2;
                ent.carryingCrops = (ent.carryingCrops || 0) + 1;
                if (distToPlayer < 420) {
                  this.spawnParticles(ent.x, ent.y, '#facc15', 5, 45);
                  this.spawnFloatingText(ent.x, ent.y - 20, '🌾 +1 WHEAT', '#bef264');
                }
              }
            }
            ent.farmerTargetX = undefined;
            ent.farmerTargetY = undefined;
            ent.farmerWorkTimer = 0.6;
          }
        } else if (ent.kind === 'villager' && ent.role === 'mechanic') {
          // Villager Mechanic Man AI: walks up to damaged vehicles at the Gas Station and fixes them over time!
          const gsX = ent.city?.gasStationX ?? ent.homeX ?? ent.x;
          const gsY = ent.city?.gasStationY ?? ent.homeY ?? ent.y;
          let damagedV: Vehicle | null = null;
          let bestVD = 195;
          for (const v of this.vehicles) {
            if (v.hp <= 0 || v.hp >= v.maxHp) continue;
            if (v.kind === 'helicopter' && v.altitude >= 0.35) continue;
            const dGs = Math.hypot(v.x - gsX, v.y - gsY);
            if (dGs < bestVD) {
              bestVD = dGs;
              damagedV = v;
            }
          }
          if (damagedV) {
            ent.farmerState = 'repair';
            const rdx = damagedV.x - ent.x;
            const rdy = damagedV.y - ent.y;
            const rd = Math.hypot(rdx, rdy);
            if (rd > damagedV.radius + 22) {
              this.moveWithCollision(ent, (rdx / rd) * ent.speed * 1.15 * dt, (rdy / rd) * ent.speed * 1.15 * dt, false);
              ent.facingDir = rdx >= 0 ? 1 : -1;
              moved = true;
            } else {
              ent.facingDir = rdx >= 0 ? 1 : -1;
              damagedV.repairing = true;
              damagedV.hp = Math.min(damagedV.maxHp, damagedV.hp + 26 * dt);
              damagedV.repairSoundTimer = (damagedV.repairSoundTimer || 0) - dt;
              if (damagedV.repairSoundTimer <= 0) {
                damagedV.repairSoundTimer = 0.55;
                this.spawnParticles(damagedV.x, damagedV.y - 6, '#38bdf8', 5, 65);
                this.spawnParticles(damagedV.x, damagedV.y - 6, '#facc15', 4, 55);
                if (distToPlayer < 460) audio.sfxAnvil();
              }
              if (damagedV.hp >= damagedV.maxHp) {
                damagedV.hp = damagedV.maxHp;
                damagedV.repairing = false;
                if (distToPlayer < 520) audio.sfxCraft();
                this.spawnFloatingText(damagedV.x, damagedV.y - 26, '🔧✅ 100% FIXED!', '#4ade80');
              }
            }
          } else {
            ent.farmerState = undefined;
            const hdx = (ent.homeX ?? gsX) - ent.x;
            const hdy = (ent.homeY ?? gsY) - ent.y;
            const hd = Math.hypot(hdx, hdy);
            if (hd > 24) {
              this.moveWithCollision(ent, (hdx / hd) * ent.speed * 0.75 * dt, (hdy / hd) * ent.speed * 0.75 * dt, false);
              ent.facingDir = hdx >= 0 ? 1 : -1;
              moved = true;
            }
          }
        } else {
          ent.wanderTimer -= dt;
          if (ent.wanderTimer <= 0) {
            ent.wanderTimer = 2.2 + Math.random() * 2.5;
            if (ent.kind === 'villager' && ent.role === 'gas_attendant' && ent.homeX !== undefined && ent.homeY !== undefined) {
              // Keep Villager Gas Man right by his Gas Station fuel pumps!
              if (Math.hypot(ent.x - ent.homeX, ent.y - ent.homeY) > 42) {
                ent.wanderAngle = Math.atan2(ent.homeY - ent.y, ent.homeX - ent.x);
              } else {
                ent.wanderAngle = Math.random() * Math.PI * 2;
              }
            } else if (
              ent.kind === 'animal' &&
              !ent.aquatic &&
              ent.homeX !== undefined &&
              ent.homeY !== undefined &&
              this.cities.some((c) => c.farmlandBounds && Math.hypot(ent.homeX! - c.farmlandBounds.farmhouseX, ent.homeY! - c.farmlandBounds.farmhouseY) < 420)
            ) {
              // Keep Farmhouse livestock near their Farmhouse & haybales!
              if (Math.hypot(ent.x - ent.homeX, ent.y - ent.homeY) > 150) {
                ent.wanderAngle = Math.atan2(ent.homeY - ent.y, ent.homeX - ent.x) + (Math.random() - 0.5) * 0.6;
              } else {
                ent.wanderAngle = Math.random() * Math.PI * 2;
              }
            } else {
              ent.wanderAngle = Math.random() * Math.PI * 2;
            }
          }
          if (ent !== this.player.mountedHorse) {
            const mx = Math.cos(ent.wanderAngle) * ent.speed * 0.45 * dt;
            const my = Math.sin(ent.wanderAngle) * ent.speed * 0.45 * dt;
            if (ent.aquatic) {
              const nx = ent.x + mx;
              const ny = ent.y + my;
              if (isWaterTile(getTile(this, Math.floor(nx / TILE_SIZE), Math.floor(ny / TILE_SIZE)))) {
                ent.x = nx;
                ent.y = ny;
                moved = true;
              } else {
                ent.wanderAngle += Math.PI;
              }
            } else {
              this.moveWithCollision(ent, mx, my, false);
              moved = true;
            }
            ent.facingDir = mx >= 0 ? 1 : -1;
          }
        }
      }

      // MOB FOOTSTEP & PROXIMITY VOCAL SOUND EFFECTS
      if (ent.kind === 'zombie' && distToPlayer <= 420 && Math.random() < dt * 0.35) {
        audio.sfxZombieGrowl(ent.subType || 'walker', distToPlayer, 420);
      } else if (ent.kind === 'animal' && !ent.aquatic && distToPlayer <= 340 && Math.random() < dt * 0.25) {
        audio.sfxAnimalSound(ent.subType || 'cow', distToPlayer, 340);
      }
      if (moved) {
        ent.walkCycle = (ent.walkCycle || 0) + dt * 8;
        if (!ent.aquatic && distToPlayer <= 360) {
          ent.footstepTimer = (ent.footstepTimer || 0) - dt;
          if (ent.footstepTimer <= 0) {
            ent.footstepTimer = ent.kind === 'zombie' && ent.subType === 'runner' ? 0.28 : 0.42;
            const mobKind =
              ent.kind === 'zombie'
                ? ent.subType === 'king' || ent.subType === 'brute' || ent.isBodybuilder
                  ? 'brute'
                  : 'zombie'
                : ent.kind === 'animal' || ent.kind === 'horse'
                  ? 'animal'
                  : 'human';
            audio.sfxMobFootstep(mobKind, distToPlayer, 360);
          }
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    // Bullets (Spatial Grid zombie lookup + player gunfire can break objects & vehicles!)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const step = Math.hypot(b.vx * dt, b.vy * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.dist += step;

      let hit = b.dist >= b.maxRange;

      // Player gunfire can shoot & destroy Helicopters (checked at both ground center & lifted airborne fuselage!) and Ground Vehicles
      if (!hit && b.fromPlayer) {
        for (let vi = this.vehicles.length - 1; vi >= 0; vi--) {
          const v = this.vehicles[vi];
          if (v === this.player.inVehicle || v.hp <= 0) continue;
          const liftY = v.kind === 'helicopter' ? v.altitude * 28 : 0;
          const hitRad = v.radius + (v.kind === 'helicopter' ? 12 : 6);
          if (
            Math.hypot(v.x - b.x, v.y - b.y) <= hitRad ||
            (liftY > 0 && Math.hypot(v.x - b.x, v.y - liftY - b.y) <= hitRad)
          ) {
            this.damageVehicle(v, b.damage, 'bullet');
            audio.sfxBulletImpact(true);
            hit = true;
            break;
          }
        }
      }

      const btx = Math.floor(b.x / TILE_SIZE);
      const bty = Math.floor(b.y / TILE_SIZE);
      const bKey = `${btx},${bty}`;
      const obj = this.objects.get(bKey);
      if (!hit && obj && (obj.blocksLoS || (b.fromPlayer && obj.solid)) && !obj.open) {
        if (b.fromPlayer) {
          this.damageGridObject(bKey, obj, b.damage);
          audio.sfxBulletImpact(true);
        }
        hit = true;
      }

      if (!hit && !b.friendlyToPlayer && !this.player.dead) {
        if (this.player.inVehicle && Math.hypot(this.player.inVehicle.x - b.x, this.player.inVehicle.y - b.y) <= this.player.inVehicle.radius + 5) {
          this.damageVehicle(this.player.inVehicle, b.damage, 'bullet');
          hit = true;
        } else if (!this.player.inVehicle && Math.hypot(this.player.x - b.x, this.player.y - b.y) <= this.player.radius + 5) {
          this.damagePlayer(b.damage);
          hit = true;
        }
      }

      if (!hit) {
        const zHit = this.findNearestInGrid(this.zombieGrid, b.x, b.y, 34);
        if (zHit && zHit.dist <= zHit.ent.radius + 4) {
          this.damageEntity(zHit.ent, b.damage, b.vx * 0.08, b.vy * 0.08, false, b.fromPlayer ? 'player_gun_or_tool' : 'other');
          hit = true;
        }
      }

      // Player gunfire can hit & kill ANY human (villager, builder, merchant, guard/FBI, president) or animal/horse!
      if (!hit && b.fromPlayer) {
        const hHit = this.findNearestInGrid(this.humanGrid, b.x, b.y, 28);
        if (hHit && hHit.dist <= hHit.ent.radius + 4) {
          this.damageEntity(hHit.ent, b.damage, b.vx * 0.08, b.vy * 0.08, false, 'player_gun_or_tool');
          hit = true;
        }
      }

      if (!hit && b.fromPlayer) {
        const aHit = this.findNearestInGrid(this.animalGrid, b.x, b.y, 28);
        if (aHit && aHit.ent !== this.player.mountedHorse && aHit.dist <= aHit.ent.radius + 4) {
          this.damageEntity(aHit.ent, b.damage, b.vx * 0.08, b.vy * 0.08, false, 'player_gun_or_tool');
          hit = true;
        }
      }
      if (hit) this.bullets.splice(i, 1);
    }

    // Spitter Projectiles (hits player AND vehicles including flying helicopters!)
    for (let i = this.spitProjectiles.length - 1; i >= 0; i--) {
      const sp = this.spitProjectiles[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.dist += Math.hypot(sp.vx * dt, sp.vy * dt);
      let hit = sp.dist >= sp.maxRange;

      if (!hit) {
        for (let vi = this.vehicles.length - 1; vi >= 0; vi--) {
          const v = this.vehicles[vi];
          if (Math.hypot(sp.x - v.x, sp.y - v.y) < v.radius + 6) {
            this.damageVehicle(v, sp.damage * 1.6, 'spit');
            hit = true;
            break;
          }
        }
      }

      if (!hit && !this.player.dead && !this.player.inVehicle && Math.hypot(sp.x - this.player.x, sp.y - this.player.y) < this.player.radius + 6) {
        this.damagePlayer(sp.damage);
        this.player.poisonTimer = 6;
        if (this.virusPuddles.length < 45) {
          this.virusPuddles.push({ x: sp.x, y: sp.y, radius: 22, life: 6, isBloodmoon: sp.isBloodmoon });
        }
        hit = true;
      }
      if (hit) this.spitProjectiles.splice(i, 1);
    }

    // Grenades (breaks zombies, animals, objects & vehicles in blast radius!)
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= 0.94;
      g.vy *= 0.94;
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.screenShake = Math.max(this.screenShake, 0.7);
        audio.sfxExplosion();
        this.shockwaves.push({ x: g.x, y: g.y, radius: 10, maxRadius: g.radius, alpha: 0.9 });
        this.spawnParticles(g.x, g.y, '#f97316', 18, 160);
        for (let j = this.entities.length - 1; j >= 0; j--) {
          const e = this.entities[j];
          if ((e.kind === 'zombie' || e.kind === 'animal') && Math.hypot(e.x - g.x, e.y - g.y) <= g.radius + e.radius) {
            this.damageEntity(e, g.damage);
          }
        }
        for (let vi = this.vehicles.length - 1; vi >= 0; vi--) {
          const v = this.vehicles[vi];
          if (Math.hypot(v.x - g.x, v.y - g.y) <= g.radius + v.radius) {
            this.damageVehicle(v, g.damage, 'bullet');
          }
        }
        const gMinTx = Math.floor((g.x - g.radius) / TILE_SIZE);
        const gMaxTx = Math.floor((g.x + g.radius) / TILE_SIZE);
        const gMinTy = Math.floor((g.y - g.radius) / TILE_SIZE);
        const gMaxTy = Math.floor((g.y + g.radius) / TILE_SIZE);
        for (let gty = gMinTy; gty <= gMaxTy; gty++) {
          for (let gtx = gMinTx; gtx <= gMaxTx; gtx++) {
            const gKey = `${gtx},${gty}`;
            const gObj = this.objects.get(gKey);
            if (gObj && Math.hypot((gtx + 0.5) * TILE_SIZE - g.x, (gty + 0.5) * TILE_SIZE - g.y) <= g.radius) {
              this.damageGridObject(gKey, gObj, g.damage);
            }
          }
        }
        this.grenades.splice(i, 1);
      }
    }
  }

  private updateEffectsAndDrops(dt: number) {
    for (let i = this.virusPuddles.length - 1; i >= 0; i--) {
      const vp = this.virusPuddles[i];
      vp.life -= dt;
      if (!this.player.dead && !this.player.inVehicle && Math.hypot(this.player.x - vp.x, this.player.y - vp.y) <= vp.radius + 6) {
        this.player.poisonTimer = Math.max(this.player.poisonTimer, 4.5);
      }
      if (Math.random() < dt * 2.5) {
        for (const ent of this.entities) {
          if (ent.kind !== 'zombie' && Math.hypot(ent.x - vp.x, ent.y - vp.y) <= vp.radius + ent.radius) {
            this.damageEntity(ent, 3);
          }
        }
      }
      if (vp.life <= 0) this.virusPuddles.splice(i, 1);
    }
    for (let i = this.firePatches.length - 1; i >= 0; i--) {
      const fp = this.firePatches[i];
      fp.life -= dt;
      if (Math.random() < dt * 11) {
        const rx = fp.x + (Math.random() - 0.5) * fp.radius * 1.2;
        const ry = fp.y + (Math.random() - 0.5) * fp.radius * 0.8;
        this.spawnParticles(rx, ry, Math.random() < 0.55 ? '#f97316' : '#ef4444', 1, 45);
        this.spawnParticles(rx, ry - 4, '#334155', 1, 55);
      }
      if (fp.life <= 0) this.firePatches.splice(i, 1);
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += dt * 220;
      sw.alpha -= dt * 1.4;
      if (sw.alpha <= 0) this.shockwaves.splice(i, 1);
    }
    for (let i = this.meteorImpacts.length - 1; i >= 0; i--) {
      const m = this.meteorImpacts[i];
      m.timer -= dt;
      if (m.timer <= 0) {
        audio.sfxExplosion();
        this.screenShake = Math.max(this.screenShake, 0.75);
        this.shockwaves.push({ x: m.x, y: m.y, radius: 12, maxRadius: m.radius, alpha: 0.95 });
        this.spawnParticles(m.x, m.y, '#f97316', 18, 175);
        this.spawnParticles(m.x, m.y, '#334155', 14, 120);
        if (m.isPoison) {
          this.spawnParticles(m.x, m.y, '#84cc16', 18, 150);
          this.spawnParticles(m.x, m.y, '#a3e635', 12, 110);
          this.virusPuddles.push({ x: m.x, y: m.y, radius: m.radius * 0.72, life: 12, isBloodmoon: true });
        }

        // Meteors explode & damage grid objects/buildings in blast radius (fast local tile lookup)!
        const mMinTx = Math.floor((m.x - m.radius - 16) / TILE_SIZE);
        const mMaxTx = Math.floor((m.x + m.radius + 16) / TILE_SIZE);
        const mMinTy = Math.floor((m.y - m.radius - 16) / TILE_SIZE);
        const mMaxTy = Math.floor((m.y + m.radius + 16) / TILE_SIZE);
        for (let mty = mMinTy; mty <= mMaxTy; mty++) {
          for (let mtx = mMinTx; mtx <= mMaxTx; mtx++) {
            const okey = `${mtx},${mty}`;
            const obj = this.objects.get(okey);
            if (!obj) continue;
            const ox = (obj.tx + 0.5) * TILE_SIZE;
            const oy = (obj.ty + 0.5) * TILE_SIZE;
            const dObj = Math.hypot(ox - m.x, oy - m.y);
            if (dObj <= m.radius + 18) {
              const objDmg = Math.max(35, Math.round(95 * (1 - dObj / (m.radius + 50))));
              obj.hp -= objDmg;
              obj.damaged = true;
              if (obj.hp <= 0) {
                if (obj.type === 'gas_pump') {
                  this.triggerGasStationExplosion(obj.tx, obj.ty);
                } else {
                  this.objects.delete(okey);
                  this.spawnParticles(ox, oy, '#94a3b8', 6, 75);
                }
              }
            }
          }
        }

        // Meteors damage vehicles (including airborne helicopters!) & mobs/player
        for (let vi = this.vehicles.length - 1; vi >= 0; vi--) {
          const v = this.vehicles[vi];
          if (Math.hypot(v.x - m.x, v.y - m.y) <= m.radius + v.radius + 16) {
            this.damageVehicle(v, 195, 'meteor');
          }
        }
        for (let ei = this.entities.length - 1; ei >= 0; ei--) {
          const e = this.entities[ei];
          if (Math.hypot(e.x - m.x, e.y - m.y) <= m.radius + e.radius) {
            this.damageEntity(e, e.kind === 'zombie' ? 110 : 38);
          }
        }
        if (!this.player.dead && !this.player.inVehicle && Math.hypot(this.player.x - m.x, this.player.y - m.y) <= m.radius) {
          this.damagePlayer(42);
          if (m.isPoison) this.player.poisonTimer = Math.max(this.player.poisonTimer, 6);
        }

        const mtx = Math.floor(m.x / TILE_SIZE);
        const mty = Math.floor(m.y / TILE_SIZE);
        // Ores belong strictly in caves / stone cave tiles! Outside caves, meteors leave a stone boulder.
        if (getTile(this, mtx, mty) === 'cave_floor') {
          this.resources.set(`${mtx},${mty}`, { type: 'gold_ore', name: 'Cave Golden Ore', tx: mtx, ty: mty, hp: 110, maxHp: 110, scale: 1, damaged: false });
        }
        this.meteorImpacts.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += dt * 20;
      r.alpha -= dt * 0.9;
      if (r.alpha <= 0) this.ripples.splice(i, 1);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (Math.hypot(d.x - this.player.x, d.y - this.player.y) < 34) {
        if (this.giveItem(d.itemId, d.count)) {
          audio.sfxPickup();
          this.drops.splice(i, 1);
        }
      }
    }
  }

  findNearestCity(x: number, y: number): CityData | null {
    let best: CityData | null = null;
    let bestD = Infinity;
    for (const c of this.cities) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  // ---------------------------------------------------------
  // LIVE COMPUTER OS v1.98 & BREAKING NEWS TV CANVAS RENDERERS
  // ---------------------------------------------------------
  renderLiveComputerCanvas(canvas: HTMLCanvasElement) {
    const cctx = canvas.getContext('2d');
    if (!cctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const city = this.findNearestCity(this.player.x, this.player.y) || this.cities[0];

    cctx.fillStyle = '#022c22';
    cctx.fillRect(0, 0, w, h);

    // Subtle CRT scanlines
    cctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    for (let y = 0; y < h; y += 4) cctx.fillRect(0, y, w, 1);

    cctx.fillStyle = '#10b981';
    cctx.fillRect(0, 0, w, 18);
    cctx.fillStyle = '#022c22';
    cctx.font = 'bold 10px "JetBrains Mono", monospace';
    cctx.fillText('ComputerOS v1.98  •  CITY NET', 6, 13);

    const builtCount = city ? EXPANSION_SEQUENCE.filter((id) => city.expansionsBuilt[id]).length : 0;
    const helis = this.vehicles.filter((v) => v.kind === 'helicopter').length;
    const jeeps = this.vehicles.filter((v) => v.kind === 'jeep').length;
    const farCities = this.cities.filter((c) => c.isFarCity).length;

    const gasStatus = city?.gasStationBroken ? 'BROKEN (NEED PRES $)' : 'ONLINE';
    const presCash = city ? Math.round(city.presidentCash) : 0;

    cctx.fillStyle = '#6ee7b7';
    cctx.font = '9px "JetBrains Mono", monospace';
    cctx.fillText(`> CITY: ${city ? city.name : 'SCANNING...'}`, 8, 34);
    cctx.fillText(`> DISTRICTS: ${builtCount}/${EXPANSION_SEQUENCE.length}  | FAR CITIES: ${farCities}`, 8, 48);
    cctx.fillText(`> MILITARY: ${helis} ARMED HELIS | ${jeeps} JEEPS`, 8, 62);
    cctx.fillText(`> GAS: ${gasStatus} | PRES: $${presCash}`, 8, 76);

    const blink = Math.floor(this.computerFrame / 2) % 2 === 0 ? '_' : '';
    cctx.fillStyle = '#34d399';
    cctx.fillText(`> BUILDERS: 15 ACTIVE  [READY]${blink}`, 8, 96);
  }

  renderLiveTvCanvas(canvas: HTMLCanvasElement) {
    const tctx = canvas.getContext('2d');
    if (!tctx) return;
    const w = canvas.width;
    const h = canvas.height;
    tctx.fillStyle = '#0f172a';
    tctx.fillRect(0, 0, w, h);

    // Studio backdrop
    tctx.fillStyle = '#1e3a8a';
    tctx.fillRect(0, 0, w, h - 22);

    // News anchor pixel silhouette
    tctx.fillStyle = '#0f172a';
    tctx.fillRect(w / 2 - 14, 42, 28, 30);
    tctx.fillStyle = '#fed7aa';
    tctx.fillRect(w / 2 - 9, 20, 18, 20);
    tctx.fillStyle = '#475569';
    tctx.fillRect(w / 2 - 10, 16, 20, 6);

    // Live Breaking Banner
    tctx.fillStyle = this.bloodmoonTimer > 0 ? '#dc2626' : '#e11d48';
    tctx.fillRect(0, h - 24, w, 24);
    tctx.fillStyle = '#ffffff';
    tctx.font = 'bold 9px "JetBrains Mono", monospace';
    const ticker =
      this.bloodmoonTimer > 0
        ? 'BREAKING: CRIMSON BLOODMOON OVER METROPOLIS!'
        : this.cities.some((c) => c.alertActive)
          ? 'ALERT: ZOMBIE HORDE MARCHING INTO FAR CITY!'
          : 'LIVE: 20 BUILDERS CONSTRUCTING MALL & HOTEL!';
    const offset = (this.tvFrame * 10) % 140;
    tctx.fillText(ticker, 8 - offset * 0.25, h - 9);
  }

  // ---------------------------------------------------------
  // HUD SNAPSHOT FOR REACT UI
  // ---------------------------------------------------------
  getHudSnapshot(): HudSnapshot {
    const held = this.player.inventory[this.player.activeSlot] || null;
    const heldDef = held ? ITEMS[held.id] : null;
    const ammoDisplay =
      heldDef && heldDef.ammoType ? `${this.countItem(heldDef.ammoType)}` : '';

    const hrsFloat = (this.timeOfDay * 24 + 6) % 24;
    const hh = String(Math.floor(hrsFloat)).padStart(2, '0');
    const mm = String(Math.floor((hrsFloat % 1) * 60)).padStart(2, '0');
    const isNight = this.timeOfDay > 0.72 || this.timeOfDay < 0.25;

    const boss = this.entities.find((e) => e.kind === 'zombie' && e.subType === 'king') || null;
    const escortAlive = boss ? this.entities.filter((e) => e.escortBoss === boss).length : 0;

    let soonest = this.worldEvents[0];
    for (const ev of this.worldEvents) {
      if (ev.timer < soonest.timer) soonest = ev;
    }

    const nearestCity = this.findNearestCity(this.player.x, this.player.y);
    let compassText: string | null = null;
    if (this.countItem('compass') > 0 && nearestCity) {
      const dx = nearestCity.x - this.player.x;
      const dy = nearestCity.y - this.player.y;
      const distTiles = Math.round(Math.hypot(dx, dy) / TILE_SIZE);
      const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
      const dirName = dirs[Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
      compassText = `${nearestCity.name}: ${distTiles}m ${dirName}`;
    }

    // Floating [E] Prompt Detection (Fast local tile lookup)
    let interactPrompt: { text: string; detail: string } | null = null;
    if (this.player.inVehicle) {
      const v = this.player.inVehicle;
      const atGas = this.isVehicleAtGasStation(v);
      interactPrompt = {
        text: atGas && v.fuel < 99 ? `[G] Refuel at Gas Station • [E] Exit ${v.name}` : `[E] Exit ${v.name}`,
        detail: `Fuel ${Math.round(v.fuel)}% • WASD Move`,
      };
    } else if (!this.player.dead) {
      const nearGasMan = this.entities.find(
        (e) => e.kind === 'villager' && e.role === 'gas_attendant' && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 56
      );
      const nearMechanic = this.entities.find(
        (e) => e.kind === 'villager' && e.role === 'mechanic' && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 62
      );
      if (nearGasMan) {
        interactPrompt = {
          text: '[E] Pay Villager Gas Man to Refuel',
          detail: `Your Cash: $${this.player.cash} ($1 = 2% Fuel)`,
        };
      } else if (nearMechanic) {
        interactPrompt = {
          text: '[E] Fix Damaged Vehicle with Mechanic',
          detail: 'Repairs low-HP Cars, Jeeps & Helicopters at Gas Station',
        };
      } else {
        const nearV = this.vehicles.find((v) => v.hp > 0 && Math.hypot(v.x - this.player.x, v.y - this.player.y) < 62);
        if (nearV) {
          const needsGasRepair =
            this.isVehicleAtGasStation(nearV) &&
            nearV.hp < nearV.maxHp &&
            (nearV.repairing || nearV.hp < nearV.maxHp * 0.75);
          interactPrompt = needsGasRepair
            ? {
                text: `[E] Repair ${nearV.name} (${Math.round((nearV.hp / nearV.maxHp) * 100)}% HP)`,
                detail: 'Villager Mechanic is also repairing over time',
              }
            : {
                text: nearV.driver !== 'none'
                  ? `[E] Take Over Driver Seat (${nearV.name})`
                  : `[E] ${nearV.kind === 'helicopter' ? 'Fly' : 'Drive'} ${nearV.name}`,
                detail: `Fuel ${Math.round(nearV.fuel)}% • HP ${Math.round((nearV.hp / nearV.maxHp) * 100)}%`,
              };
        } else {
          const nearPres = this.entities.find((e) => e.kind === 'president' && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 68);
          if (nearPres) {
            interactPrompt = {
              text: '[E] Speak to President',
              detail: nearPres.city?.presidentOrder || 'Commands Defense, Repairs & Retreat',
            };
          } else {
            const nearM = this.entities.find((e) => e.kind === 'merchant' && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 60);
            if (nearM) {
              interactPrompt = { text: `[E] Trade with ${nearM.name}`, detail: 'Gold Converter & Supplies' };
            } else {
              const ptx = Math.floor(this.player.x / TILE_SIZE);
              const pty = Math.floor(this.player.y / TILE_SIZE);
              for (let ty = pty - 3; ty <= pty + 3 && !interactPrompt; ty++) {
                for (let tx = ptx - 3; tx <= ptx + 3; tx++) {
                  const obj = this.objects.get(`${tx},${ty}`);
                  if (!obj) continue;
                  const def = OBJECT_DEFS[obj.type];
                  if (!def?.interactive) continue;
                  if (Math.hypot((obj.tx + 0.5) * TILE_SIZE - this.player.x, (obj.ty + 0.5) * TILE_SIZE - this.player.y) < 62) {
                    interactPrompt = {
                      text: `[E] ${
                        obj.type === 'old_computer'
                          ? `ComputerOS (${obj.isOn ? 'ON' : 'OFF'})`
                          : obj.type === 'gas_pump'
                            ? 'Pay Gas Station to Fuel Vehicle'
                            : obj.type === 'military_radar'
                              ? 'Inspect Military RADAR'
                              : obj.type === 'military_flag'
                                ? 'Inspect Military Flag'
                                : obj.type === 'iron_door'
                                  ? `${obj.open ? 'Close' : 'Open'} Military Auto Iron Door`
                                  : def.name
                      }`,
                      detail:
                        obj.type === 'old_computer'
                          ? 'Toggle ComputerOS Terminal'
                          : obj.type === 'gas_pump'
                            ? `Cash: $${this.player.cash} ($1 = 2% Fuel)`
                            : obj.type === 'military_radar'
                              ? 'Scans for 100+ Zombies • Red Light + Horn Alert'
                              : obj.type === 'iron_door'
                                ? 'Auto-opens for Vehicles (Jeeps) • [E] Toggle'
                                : 'Press [E] to interact',
                    };
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }

    const nearComp = this.getNearbyComputer();
    const ptx = Math.floor(this.player.x / TILE_SIZE);
    const pty = Math.floor(this.player.y / TILE_SIZE);
    let nearTv = false;
    for (let ty = pty - 7; ty <= pty + 7 && !nearTv; ty++) {
      for (let tx = ptx - 7; tx <= ptx + 7; tx++) {
        const o = this.objects.get(`${tx},${ty}`);
        if (o && (o.type === 'old_tv' || o.type === 'cinema_screen') && o.isOn) {
          if (Math.hypot((o.tx + 0.5) * TILE_SIZE - this.player.x, (o.ty + 0.5) * TILE_SIZE - this.player.y) < 220) {
            nearTv = true;
            break;
          }
        }
      }
    }

    const cityMetrics = nearestCity ? this.getCityMetrics(nearestCity) : null;
    const cityPop = cityMetrics ? cityMetrics.population : 0;
    const farCitiesCount = this.cities.filter((c) => c.isFarCity).length;
    const buildersActive = this.entities.filter((e) => e.kind === 'builder' && e.buildTask).length;
    const activeV = this.player.inVehicle;

    return {
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      hunger: Math.ceil(this.player.hunger),
      maxHunger: this.player.maxHunger,
      stamina: Math.ceil(this.player.stamina),
      maxStamina: this.player.maxStamina,
      level: this.player.level,
      cash: this.player.cash,
      gold: this.countItem('gold'),
      armor: this.getPlayerArmor(),
      kills: this.player.kills,
      biome: getBiomeAt(this, Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE)).toUpperCase(),
      tx: Math.floor(this.player.x / TILE_SIZE),
      ty: Math.floor(this.player.y / TILE_SIZE),
      inWater: this.player.inWater,
      mountedHorseName: this.player.mountedHorse ? this.player.mountedHorse.name : null,
      mountedHorseSpeed: this.player.mountedHorse?.speedMult || 1,
      mountedHorseStam: Math.round(this.player.mountedHorse?.stamina || 0),
      mountedHorseMaxStam: this.player.mountedHorse?.maxStamina || 100,
      seated: !!this.player.seatedObj,
      poisoned: this.player.poisonTimer > 0,
      activeVehicle: activeV
        ? {
            id: activeV.id,
            kind: activeV.kind,
            name: activeV.name,
            hp: Math.ceil(activeV.hp),
            maxHp: activeV.maxHp,
            fuel: Math.round(activeV.fuel),
            maxFuel: activeV.maxFuel || 100,
            altitude: activeV.altitude,
            hasGuns: activeV.hasGuns,
            speedKmh: Math.round(Math.hypot(activeV.vx, activeV.vy) * 0.35),
            atGasStation: this.isVehicleAtGasStation(activeV),
          }
        : null,
      heldIcon: heldDef?.icon || '✊',
      heldName: heldDef?.name || 'Bare Hands',
      heldLevel: held?.level || 1,
      ammoDisplay,
      day: this.day,
      clock: `${hh}:${mm}`,
      timeIcon: this.bloodmoonTimer > 0 ? '🌑' : isNight ? '🌙' : '☀️',
      zoom: this.camera.zoom,
      bloodmoonTimer: Math.ceil(this.bloodmoonTimer),
      tvNearby: nearTv,
      computerNearby: !!(nearComp && nearComp.isOn),
      computerStatusLine: nearComp ? (nearComp.isOn ? 'ComputerOS Online' : 'Standby (Press E)') : 'Offline',
      boss: boss ? { hp: Math.ceil(boss.hp), maxHp: boss.maxHp, escortAlive } : null,
      nextEvent: soonest
        ? {
            icon: soonest.icon,
            name: soonest.name,
            timerText: `${Math.max(0, Math.ceil(soonest.timer))}s`,
          }
        : null,
      compassText,
      interactPrompt,
      cityBroadcast: {
        name: nearestCity ? nearestCity.name : 'Wilderness Frontier',
        population: cityPop,
        damaged: cityMetrics ? cityMetrics.repairTargets.length : 0,
        totalStructures: cityMetrics ? cityMetrics.totalCount : 40,
        status: nearestCity?.surrendered
          ? '🏳️ PRESIDENT ORDERED RETREAT'
          : nearestCity?.radarAlertActive
            ? '📡🔴 RADAR RED ALERT (100+ ZOMBIES)'
            : nearestCity?.alertActive
              ? '🚨 CITY UNDER ATTACK'
              : buildersActive > 0
                ? '🏗️ PRESIDENT BUILDING / REPAIRING'
                : '🛡️ PRESIDENT DEFENSES ONLINE',
        headline: this.bloodmoonTimer > 0
          ? 'CRIMSON BLOODMOON ACTIVE'
          : nearestCity?.radarAlertActive
            ? `MILITARY RADAR: ${nearestCity.radarZombieCount || 100}+ ZOMBIES`
            : nearestCity?.surrendered
              ? 'CITY EVACUATING TO BASE'
              : nearestCity?.alertActive
                ? 'ZOMBIE HORDE INVASION'
                : 'METROPOLIS GROWING',
        warning: nearestCity?.radarAlertActive
          ? `📡 RADAR HORN ACTIVE (${nearestCity.radarZombieCount} Zombies) • FBI & Guards Mobilized!`
          : nearestCity?.presidentOrder || 'President Commanding from White House • Farm & Military Ready',
        flagStatus: nearestCity?.surrendered ? '🏳️' : '🇺🇸',
        farCitiesCount,
        buildersActive,
        presidentOrder: nearestCity?.presidentOrder || '🛡️ President Defenses Ready',
        presidentCash: nearestCity?.presidentCash ?? 0,
        gasBroken: nearestCity ? !this.isGasStationOperational(nearestCity) : false,
      },
      dead: this.player.dead,
      deathSummary: {
        days: this.day,
        kills: this.player.kills,
        cash: this.player.cash,
      },
    };
  }
}
