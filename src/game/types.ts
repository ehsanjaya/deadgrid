export type ItemType =
  | 'horse_gear'
  | 'armor'
  | 'utility'
  | 'throwable'
  | 'tool'
  | 'weapon'
  | 'shield'
  | 'ammo'
  | 'material'
  | 'seed'
  | 'food'
  | 'placeable';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  type: ItemType;
  stackable: boolean;
  maxStack?: number;
  value: number;
  desc: string;
  slot?: 'head' | 'body' | 'feet';
  armor?: number;
  lightBonus?: number;
  speedBonus?: number;
  defense?: number;
  damage?: number;
  radius?: number;
  cooldown?: number;
  toolType?: string;
  weaponType?: string;
  power?: number;
  range?: number;
  speed?: number;
  magSize?: number;
  ammoType?: string;
  spread?: number;
  pellets?: number;
  hunger?: number;
  heal?: number;
  stamina?: number;
  speedBoost?: number;
  curesPoison?: boolean;
  objType?: string;
}

export interface InventoryItem {
  id: string;
  count: number;
  level?: number;
}

export interface ObjectDef {
  name: string;
  maxHp: number;
  solid: boolean;
  blocksLoS: boolean;
  interactive?: string;
  color: string;
  lightRadius: number;
}

export interface GridObject {
  type: string;
  tx: number;
  ty: number;
  name: string;
  hp: number;
  maxHp: number;
  damaged: boolean;
  solid: boolean;
  blocksLoS: boolean;
  open: boolean;
  manualOpen?: boolean;
  isOn: boolean;
  particleTimer: number;
  isPlayerBuilt: boolean;
  cityRef: CityData | null;
  items: (InventoryItem | null)[];
  cooldown: number;
  growth: number;
}

export interface ResourceNode {
  type: string;
  name: string;
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  scale: number;
  damaged: boolean;
  harvested?: boolean;
}

export type ExpansionId =
  | 'house_north'
  | 'house_south'
  | 'shop_west'
  | 'office_jobs'
  | 'grand_mall'
  | 'luxury_hotel'
  | 'farmland_zone'
  | 'military_camp'
  | 'fortify_walls';

export interface CityBlueprintTile {
  tx: number;
  ty: number;
  type: string;
  zone: 'white_house' | 'gas_station' | 'military_base' | 'farmland' | 'hospital' | 'city';
}

export interface HospitalRoomSlot {
  roomNum: number;
  bedTx: number;
  bedTy: number;
  standX: number;
  standY: number;
  occupant: GameEntity | null;
}

export interface CityData {
  name: string;
  isFarCity?: boolean;
  tx: number;
  ty: number;
  x: number;
  y: number;
  radius: number;
  alertActive: boolean;
  defenseCooldown: number;
  surrendered: boolean;
  flagColor: string;
  whiteHouseOfficeX: number;
  whiteHouseOfficeY: number;
  whiteHouseCompKey: string;
  militaryBaseX: number;
  militaryBaseY: number;
  militaryCampX: number;
  militaryCampY: number;
  militaryGateX?: number;
  militaryGateY?: number;
  militaryBounds?: { x1: number; y1: number; x2: number; y2: number };
  gasStationX?: number;
  gasStationY?: number;
  farmlandBounds?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    farmhouseX: number;
    farmhouseY: number;
    chestKey: string;
  };
  hospitalBounds?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    lobbyX: number;
    lobbyY: number;
    maxRooms: number;
    rooms: HospitalRoomSlot[];
    cabinetKeys: string[];
    medicineLeft: number;
    outOfMedicine: boolean;
  };
  militaryRadarTx?: number;
  militaryRadarTy?: number;
  radarAlertActive?: boolean;
  radarZombieCount?: number;
  radarThreatX?: number;
  radarThreatY?: number;
  radarHornCooldown?: number;
  repairCooldown?: number;
  presidentCash: number;
  gasStationBroken?: boolean;
  presidentOrder?: string;
  blueprints?: CityBlueprintTile[];
  expansionsBuilt: Record<string, boolean>;
}

export type VehicleKind = 'car' | 'jeep' | 'helicopter';

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  name: string;
  color: string;
  accentColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxSpeed: number;
  altitude: number; // 0 = landed, 0..1 = airborne (for helicopters)
  rotorAngle: number;
  hasGuns: boolean;
  fireCooldown: number;
  driver: 'none' | 'player' | 'fbi' | 'military';
  driverEntity: GameEntity | null;
  cityRef: CityData | null;
  patrolAngle: number;
  patrolCenterX: number;
  patrolCenterY: number;
  headlightsOn: boolean;
  engineOn?: boolean;
  smokeTimer?: number;
  hurtFlash: number;
  fuel: number;
  maxFuel: number;
  refueling?: boolean;
  repairing?: boolean;
  repairSoundTimer?: number;
  crashCooldown?: number;
  ramCooldown?: number;
}

export interface GameEntity {
  kind: 'zombie' | 'villager' | 'guard' | 'president' | 'builder' | 'merchant' | 'animal' | 'horse';
  subType?: string;
  role?: string;
  shopType?: string;
  weaponMode?: string;
  name: string;
  city?: CityData | null;
  x: number;
  y: number;
  homeX?: number;
  homeY?: number;
  vx?: number;
  vy?: number;
  hp: number;
  maxHp: number;
  armor?: number;
  damaged: boolean;
  speed: number;
  damage?: number;
  radius: number;
  cash?: number;
  shirtColor?: string;
  hairColor?: string;
  color?: string;
  drops?: string[];
  aquatic?: boolean;
  aggroRange?: number;
  facing?: number;
  facingDir: number;
  walkCycle: number;
  footstepTimer?: number;
  missingArm?: string;
  missingLeg?: string;
  spitTimer?: number;
  roarTimer?: number;
  bloodDropTimer?: number;
  escortBoss?: GameEntity | null;
  escortOffsetAngle?: number;
  escortOffsetDist?: number;
  targetCity?: CityData | null;
  wanderAngle: number;
  wanderTimer: number;
  attackTimer?: number;
  objectBashTimer?: number;
  burnTimer?: number;
  poisonTimer?: number;
  poisonTickTimer?: number;
  hurtFlash: number;
  lootDropped?: boolean;
  convertedToZombie?: boolean;
  infectedSource?: boolean;
  isBodybuilder?: boolean;
  hostileToPlayer?: boolean;
  shootTimer?: number;
  bombTimer?: number;
  buildTimer?: number;
  rallyX?: number;
  rallyY?: number;
  rallyTimer?: number;
  panicTimer?: number;
  fleeTimer?: number;
  workingAtComputer?: boolean;
  workComputerTimer?: number;
  builderOrderTimer?: number;
  commandCooldown?: number;
  builderIndex?: number;
  heldTool?: string;
  carrying?: string;
  buildTask?: {
    expansionId: ExpansionId;
    targetX: number;
    targetY: number;
    label: string;
    workTimer: number;
    repairKey?: string;
    repairObjType?: string;
    repairZone?: string;
  } | null;
  // President / Hospital Guard & Farmer / Doctor labor fields
  protectingPresident?: boolean;
  protectingHospital?: boolean;
  hospitalRoomIdx?: number;
  doctorState?: 'idle' | 'fetch_meds' | 'treat';
  doctorTarget?: GameEntity | null;
  doctorCabinetKey?: string;
  farmerState?: 'plant' | 'tend' | 'harvest' | 'store' | 'feed' | 'repair';
  farmerTargetX?: number;
  farmerTargetY?: number;
  farmerWorkTimer?: number;
  carryingCrops?: number;
  // Horse fields
  coat?: string;
  mane?: string;
  spotted?: boolean;
  speedMult?: number;
  stamina?: number;
  maxStamina?: number;
  saddled?: boolean;
  hasChest?: boolean;
  items?: (InventoryItem | null)[];
  hoofTimer?: number;
  // Boss slam
  leapCooldown?: number;
  leapPhase?: 'air' | 'slam' | null;
  leapTimer?: number;
  leapStartX?: number;
  leapStartY?: number;
  leapTargetX?: number;
  leapTargetY?: number;
  // Vehicle riding & Military Camp energy/power
  inVehicle?: Vehicle | null;
  assignedVehicle?: Vehicle | null;
  energy?: number;
  maxEnergy?: number;
  powerBoostTimer?: number;
  restingAtCamp?: boolean;
  restTimer?: number;
  aiTickAccum?: number;
}

export interface WorldEventDef {
  id: string;
  name: string;
  icon: string;
  timer: number;
  interval: number;
  desc: string;
}

export interface ToastMessage {
  id: number;
  msg: string;
  tone: 'sky' | 'emerald' | 'amber' | 'rose';
}

export interface PlayerAppearance {
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
  hairStyle: 'short' | 'spiky' | 'bob' | 'mohawk' | 'bald';
  hairColor: string;
  hat: 'none' | 'cap' | 'bandana' | 'cowboy' | 'beanie' | 'crown';
  glasses: 'none' | 'shades' | 'visor';
}

export interface RemotePlayerState {
  id: string;
  name: string;
  appearance: PlayerAppearance;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  facingDir: number;
  walkCycle: number;
  hp: number;
  maxHp: number;
  armor: number;
  level: number;
  kills: number;
  cash: number;
  poisoned: boolean;
  dead: boolean;
  biome: string;
  heldItemId: string | null;
  heldItemName: string;
  vehicleKind: string | null;
  vehicleName: string | null;
  swingAnim: number;
  blocking: boolean;
  updatedAt: number;
}

export interface HoverPlayerStatus {
  id: string;
  isLocal: boolean;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  armor: number;
  kills: number;
  cash: number;
  heldItemName: string;
  vehicleName: string | null;
  poisoned: boolean;
  dead: boolean;
  biome: string;
  screenX: number;
  screenY: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  ts: number;
}

export interface HudSnapshot {
  playerId: string | null;
  playerName: string;
  appearance: PlayerAppearance;
  multiplayerConnected: boolean;
  onlineCount: number;
  remotePlayersSummary: {
    id: string;
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    kills: number;
    cash: number;
    biome: string;
    dead: boolean;
  }[];
  hoveredPlayer: HoverPlayerStatus | null;
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
  stamina: number;
  maxStamina: number;
  level: number;
  cash: number;
  gold: number;
  armor: number;
  kills: number;
  biome: string;
  tx: number;
  ty: number;
  inWater: boolean;
  mountedHorseName: string | null;
  mountedHorseSpeed: number;
  mountedHorseStam: number;
  mountedHorseMaxStam: number;
  seated: boolean;
  poisoned: boolean;
  activeVehicle: {
    id: string;
    kind: VehicleKind;
    name: string;
    hp: number;
    maxHp: number;
    fuel: number;
    maxFuel: number;
    altitude: number;
    hasGuns: boolean;
    speedKmh: number;
    atGasStation: boolean;
  } | null;
  heldIcon: string;
  heldName: string;
  heldLevel: number;
  ammoDisplay: string;
  day: number;
  clock: string;
  timeIcon: string;
  zoom: number;
  bloodmoonTimer: number;
  tvNearby: boolean;
  computerNearby: boolean;
  computerStatusLine: string;
  boss: {
    hp: number;
    maxHp: number;
    escortAlive: number;
  } | null;
  nextEvent: {
    icon: string;
    name: string;
    timerText: string;
  } | null;
  compassText: string | null;
  interactPrompt: {
    text: string;
    detail: string;
  } | null;
  cityBroadcast: {
    name: string;
    population: number;
    damaged: number;
    totalStructures: number;
    status: string;
    headline: string;
    warning: string;
    flagStatus: string;
    farCitiesCount: number;
    buildersActive: number;
    presidentOrder?: string;
    presidentCash?: number;
    gasBroken?: boolean;
    hospitalRoomsUsed?: number;
    hospitalMaxRooms?: number;
    hospitalMedicine?: number;
    hospitalOutOfMedicine?: boolean;
  };
  dead: boolean;
  deathSummary: {
    days: number;
    kills: number;
    cash: number;
  };
}
