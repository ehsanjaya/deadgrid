import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  Coins,
  Compass,
  Crosshair,
  Hammer,
  Heart,
  HelpCircle,
  Monitor,
  Package,
  Radio,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { audio } from './game/audio';
import { ITEMS, RECIPES, TILE_SIZE } from './game/data';
import { DeadGridGame, EXPANSION_SEQUENCE } from './game/engine';
import { GameEntity, HudSnapshot, InventoryItem, ToastMessage } from './game/types';

type ModalId = 'none' | 'inventory' | 'craft' | 'base' | 'upgrade' | 'events' | 'guide' | 'storage' | 'merchant';

const DEFAULT_HUD: HudSnapshot = {
  hp: 100,
  maxHp: 100,
  hunger: 100,
  maxHunger: 100,
  stamina: 100,
  maxStamina: 100,
  level: 1,
  cash: 150,
  gold: 1,
  armor: 0,
  kills: 0,
  biome: 'PLAINS',
  tx: 0,
  ty: 0,
  inWater: false,
  mountedHorseName: null,
  mountedHorseSpeed: 1,
  mountedHorseStam: 0,
  mountedHorseMaxStam: 100,
  seated: false,
  poisoned: false,
  activeVehicle: null,
  heldIcon: '🗡️',
  heldName: 'Tactical Machete',
  heldLevel: 1,
  ammoDisplay: '',
  day: 1,
  clock: '06:00',
  timeIcon: '☀️',
  zoom: 1.05,
  bloodmoonTimer: 0,
  tvNearby: false,
  computerNearby: false,
  computerStatusLine: 'Offline',
  boss: null,
  nextEvent: null,
  compassText: null,
  interactPrompt: null,
  cityBroadcast: {
    name: 'New Haven Metropolis',
    population: 64,
    damaged: 0,
    totalStructures: 40,
    status: '🛡️ DEFENSES ONLINE',
    headline: 'METROPOLIS GROWING',
    warning: 'Cave Ores NW • Military Base West',
    flagStatus: '🇺🇸',
    farCitiesCount: 0,
    buildersActive: 0,
  },
  dead: false,
  deathSummary: { days: 1, kills: 0, cash: 150 },
};

const MERCHANT_CATALOG: { id: string; price: number; count: number }[] = [
  { id: 'rifle', price: 240, count: 1 },
  { id: 'shotgun', price: 185, count: 1 },
  { id: 'sniper', price: 360, count: 1 },
  { id: 'ammo_heavy', price: 35, count: 30 },
  { id: 'ammo_shells', price: 30, count: 16 },
  { id: 'ammo_light', price: 24, count: 30 },
  { id: 'grenade', price: 45, count: 2 },
  { id: 'vest_kevlar', price: 150, count: 1 },
  { id: 'helmet_iron', price: 95, count: 1 },
  { id: 'medkit', price: 50, count: 1 },
  { id: 'energy_drink', price: 40, count: 1 },
  { id: 'popcorn', price: 18, count: 2 },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const compCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tvCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<DeadGridGame | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(DEFAULT_HUD);
  const [modal, setModal] = useState<ModalId>('none');
  const [craftCat, setCraftCat] = useState<string>('All');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [muted, setMuted] = useState(false);
  const [musicLabel, setMusicLabel] = useState('Auto');
  const [, setInvTick] = useState(0);
  const [storageInfo, setStorageInfo] = useState<{ title: string; slots: (InventoryItem | null)[]; isHorse: boolean } | null>(null);
  const [merchantInfo, setMerchantInfo] = useState<GameEntity | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const minimap = minimapRef.current;
    if (!canvas || !minimap) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const game = new DeadGridGame(canvas, minimap, {
      onHud: (snap) => {
        setHud(snap);
        if (compCanvasRef.current && snap.computerNearby) {
          game.renderLiveComputerCanvas(compCanvasRef.current);
        }
        if (tvCanvasRef.current && snap.tvNearby) {
          game.renderLiveTvCanvas(tvCanvasRef.current);
        }
      },
      onToast: (t) => {
        setToasts((prev) => [...prev.slice(-3), t]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((item) => item.id !== t.id));
        }, 4200);
      },
      onStorageOpen: (title, slots, isHorse) => {
        setStorageInfo({ title, slots: [...slots], isHorse });
        setModal('storage');
      },
      onMerchantOpen: (merchant) => {
        setMerchantInfo(merchant);
        setModal('merchant');
      },
      onOpenWorkbench: () => setModal('craft'),
      onOpenAnvil: () => setModal('upgrade'),
      onInventoryChanged: () => setInvTick((n) => n + 1),
    });

    gameRef.current = game;
    game.start();
    game.toast('Welcome to DeadGrid! Mine Cave Ores (NW) or explore Metropolis & Military Base (East)!', 'sky');

    const updateMouseWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      game.mouse.x = clientX - rect.left;
      game.mouse.y = clientY - rect.top;
      game.mouse.worldX = (game.mouse.x - canvas.width / 2) / game.camera.zoom + game.camera.x;
      game.mouse.worldY = (game.mouse.y - canvas.height / 2) / game.camera.zoom + game.camera.y;
    };

    const onMouseMove = (e: MouseEvent) => updateMouseWorld(e.clientX, e.clientY);
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;
      audio.init();
      updateMouseWorld(e.clientX, e.clientY);
      if (e.button === 0) game.mouse.down = true;
      if (e.button === 2) game.mouse.rightDown = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) game.mouse.down = false;
      if (e.button === 2) game.mouse.rightDown = false;
    };
    const onContextMenu = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'CANVAS') e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;
      game.camera.zoom = Math.max(0.55, Math.min(2.0, +(game.camera.zoom + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      game.keys[k] = true;

      if (k >= '1' && k <= '9') {
        game.selectHotbarSlot(parseInt(k, 10) - 1);
      } else if (k === 'e') {
        game.interact();
      } else if (k === 'g') {
        game.openHorseBag();
      } else if (k === 'h') {
        game.honkVehicleHorn();
      } else if (k === 'i') {
        setModal((m) => (m === 'inventory' ? 'none' : 'inventory'));
      } else if (k === 'c') {
        setModal((m) => (m === 'craft' ? 'none' : 'craft'));
      } else if (k === 'b') {
        setModal((m) => (m === 'base' ? 'none' : 'base'));
      } else if (k === 'u') {
        setModal((m) => (m === 'upgrade' ? 'none' : 'upgrade'));
      } else if (k === 't') {
        setModal((m) => (m === 'events' ? 'none' : 'events'));
      } else if (k === 'escape') {
        setModal('none');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      game.keys[e.key.toLowerCase()] = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      game.destroy();
      audio.destroy();
    };
  }, []);

  useEffect(() => {
    gameRef.current?.setModalOpen(modal !== 'none');
  }, [modal]);

  const game = gameRef.current;

  const toggleMute = () => {
    setMuted(audio.toggleMute());
  };

  const cycleMusic = () => {
    audio.cycleMusicMode();
    setMusicLabel(audio.getMusicLabel());
  };

  const refreshStorageSlots = () => {
    if (!game) return;
    const container = game.activeStorageHorse ? game.activeStorageHorse.items : game.activeStorageObj?.items;
    if (container && storageInfo) {
      setStorageInfo({ ...storageInfo, slots: [...container] });
    }
    setInvTick((n) => n + 1);
  };

  const categories = ['All', 'Weapons', 'Ammo', 'Tools', 'Furniture', 'Base', 'Armor', 'Mounts', 'Survival'];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090c10] text-slate-100 select-none">
      {/* Main Pixel World Canvas */}
      <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />

      {/* Top-Left Vitals & Economy HUD */}
      <div className="fixed top-3 left-3 z-20 flex flex-col gap-2 w-74 pointer-events-auto">
        <div className="glass-panel hud-scanlines rounded-xl p-3 border-t-amber-400/50 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
              <span className="font-pixel text-[11px] text-amber-400 tracking-wider drop-shadow-[0_0_6px_rgba(251,191,36,0.45)]">
                DEADGRID
              </span>
              <span className="px-1.5 py-0.5 rounded bg-sky-950/90 border border-sky-500/40 font-mono-tabular text-[10px] font-bold text-sky-300">
                LV.{hud.level}
              </span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-700/70 font-mono-tabular text-[9px] text-slate-300">
              {hud.biome} • {hud.tx},{hud.ty}
            </span>
          </div>

          {/* HP, Hunger, Stamina Bars */}
          <div className="space-y-2 text-[11px] font-mono-tabular">
            <div>
              <div className="flex justify-between text-rose-300 mb-0.5 font-semibold">
                <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-rose-400" /> VITALS</span>
                <span>{hud.hp} / {hud.maxHp}</span>
              </div>
              <div className="h-2.5 bg-slate-950/90 rounded-full overflow-hidden border border-rose-950/80 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-500 to-orange-400 shadow-[0_0_8px_rgba(244,63,94,0.55)] transition-all duration-150"
                  style={{ width: `${Math.max(0, (hud.hp / hud.maxHp) * 100)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-amber-300 mb-0.5 text-[10px]">
                  <span>RATIONS</span>
                  <span>{hud.hunger}%</span>
                </div>
                <div className="h-1.5 bg-slate-950/90 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all duration-150"
                    style={{ width: `${Math.max(0, (hud.hunger / hud.maxHunger) * 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sky-300 mb-0.5 text-[10px]">
                  <span>STAMINA</span>
                  <span>{hud.stamina}%</span>
                </div>
                <div className="h-1.5 bg-slate-950/90 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-sky-300 transition-all duration-150"
                    style={{ width: `${Math.max(0, (hud.stamina / hud.maxStamina) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Cash / Gold / Armor / Kills */}
          <div className="mt-2.5 pt-2 border-t border-slate-800/90 grid grid-cols-4 gap-1.5 text-center font-mono-tabular text-[11px]">
            <div className="bg-slate-950/80 rounded-lg py-1 border border-slate-800/80 border-t-2 border-t-emerald-500/70">
              <div className="text-[8px] tracking-wider text-slate-400">CASH</div>
              <div className="text-emerald-400 font-bold">${hud.cash}</div>
            </div>
            <div className="bg-slate-950/80 rounded-lg py-1 border border-slate-800/80 border-t-2 border-t-amber-500/70">
              <div className="text-[8px] tracking-wider text-slate-400">GOLD</div>
              <div className="text-amber-400 font-bold">{hud.gold}</div>
            </div>
            <div className="bg-slate-950/80 rounded-lg py-1 border border-slate-800/80 border-t-2 border-t-sky-500/70">
              <div className="text-[8px] tracking-wider text-slate-400">ARMOR</div>
              <div className="text-sky-400 font-bold">{hud.armor}</div>
            </div>
            <div className="bg-slate-950/80 rounded-lg py-1 border border-slate-800/80 border-t-2 border-t-rose-500/70">
              <div className="text-[8px] tracking-wider text-slate-400">KILLS</div>
              <div className="text-rose-400 font-bold">{hud.kills}</div>
            </div>
          </div>

          {hud.compassText && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono-tabular text-cyan-200 bg-cyan-950/50 border border-cyan-500/40 rounded-lg px-2 py-1 shadow-[0_0_10px_rgba(34,211,238,0.12)]">
              <Compass className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
              <span className="truncate">{hud.compassText}</span>
            </div>
          )}

          {hud.poisoned && (
            <div className="mt-1.5 text-[10px] font-bold text-lime-300 bg-lime-950/70 border border-lime-500/60 rounded-lg px-2 py-1 text-center animate-pulse">
              ☣️ BIO-POISONED — Bandage, Medkit, or Shower!
            </div>
          )}
        </div>

        {/* Live ComputerOS v1.98 Preview Panel */}
        {hud.computerNearby && (
          <div className="glass-panel rounded-xl p-2.5 border-emerald-500/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                <Monitor className="w-3.5 h-3.5" /> ComputerOS v1.98 [ON]
              </span>
              <button
                onClick={() => game?.toggleNearbyComputer()}
                className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/50"
              >
                Power OFF [E]
              </button>
            </div>
            <canvas ref={compCanvasRef} width={256} height={110} className="w-full rounded border border-emerald-500/40 mb-2" />
            <button
              onClick={() => game?.runComputerWorkShift()}
              className="w-full flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[10px]"
            >
              <Briefcase className="w-3 h-3" /> Work Job Shift +$45
            </button>
            <div className="mt-1.5 rounded bg-slate-900/90 border border-sky-700/50 px-2 py-1 text-[10px] text-sky-300 font-mono-tabular">
              🏛️ President Command: {hud.cityBroadcast.presidentOrder || 'Defenses Ready'}
            </div>
          </div>
        )}

        {/* Live Breaking News TV Preview */}
        {hud.tvNearby && (
          <div className="glass-panel rounded-xl p-2 border-sky-500/40">
            <div className="text-[10px] font-bold text-sky-300 mb-1 flex items-center gap-1">
              <Radio className="w-3 h-3 text-rose-400 animate-pulse" /> LIVE TELEVISION FEED
            </div>
            <canvas ref={tvCanvasRef} width={256} height={94} className="w-full rounded border border-slate-700" />
          </div>
        )}
      </div>

      {/* Top-Center Time, Audio, Zoom & Event Countdown */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-auto">
        <div className="glass-panel hud-scanlines rounded-2xl px-3.5 py-1.5 flex items-center gap-3 font-mono-tabular text-xs border-sky-500/25">
          <div className="flex items-center gap-1.5 font-bold text-amber-300">
            <span className="text-sm">{hud.timeIcon}</span>
            <span>DAY {hud.day}</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700/80 text-slate-100">{hud.clock}</span>
          </div>
          <div className="h-4 w-px bg-slate-700/80" />
          {hud.nextEvent && (
            <button
              onClick={() => setModal('events')}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-amber-500/30 hover:border-amber-400/60 text-[11px] transition-colors"
              title="Open World Events & Far City Invader"
            >
              <span>{hud.nextEvent.icon}</span>
              <span className="text-slate-200 hidden sm:inline font-medium">{hud.nextEvent.name}</span>
              <span className="text-amber-400 font-bold">{hud.nextEvent.timerText}</span>
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (game) game.camera.zoom = Math.max(0.55, +(game.camera.zoom - 0.15).toFixed(2));
              }}
              className="p-1 rounded-md hover:bg-slate-800 text-slate-300"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (game) game.camera.zoom = Math.min(2.0, +(game.camera.zoom + 0.15).toFixed(2));
              }}
              className="p-1 rounded-md hover:bg-slate-800 text-slate-300"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={cycleMusic} className="px-2 py-0.5 rounded-md bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-[10px] text-sky-300">
              ♪ {musicLabel}
            </button>
            <button onClick={toggleMute} className="p-1 rounded-md hover:bg-slate-800 text-slate-300" title="Mute / Unmute">
              {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            </button>
          </div>
        </div>

        {/* Military Base RADAR Red Alert Banner */}
        {hud.cityBroadcast.status.includes('RADAR RED ALERT') && (
          <div className="px-4 py-1 rounded-full bg-rose-950/95 border border-rose-500/80 text-rose-200 font-mono-tabular text-[11px] font-bold shadow-[0_0_20px_rgba(239,68,68,0.45)] animate-pulse">
            📡🚨 {hud.cityBroadcast.status} — FBI &amp; GUARDS MOBILIZED
          </div>
        )}

        {/* Bloodmoon / Zombie King Boss Bar */}
        {hud.bloodmoonTimer > 0 && (
          <div className="px-4 py-1 rounded-full bg-rose-950/90 border border-rose-500/70 text-rose-200 font-mono-tabular text-xs font-bold shadow-[0_0_16px_rgba(244,63,94,0.4)] animate-pulse">
            🌑 BLOODMOON SURGE — {hud.bloodmoonTimer}s REMAINING
          </div>
        )}

        {hud.boss && (
          <div className="glass-panel rounded-xl px-4 py-2.5 w-88 border-rose-500/70 shadow-[0_0_24px_rgba(244,63,94,0.3)]">
            <div className="flex justify-between text-[11px] font-bold text-rose-200 mb-1.5">
              <span className="flex items-center gap-1.5">👑 ZOMBIE KING TITAN</span>
              <span className="font-mono-tabular text-amber-300">{hud.boss.hp} / {hud.boss.maxHp} • Escorts: {hud.boss.escortAlive}</span>
            </div>
            <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-rose-900 p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-700 via-red-500 to-amber-400 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                style={{ width: `${Math.max(0, (hud.boss.hp / hud.boss.maxHp) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Top-Right Radar Minimap & City Network Feed */}
      <div className="fixed top-3 right-3 z-20 flex flex-col items-end gap-2 pointer-events-auto">
        <div className="glass-panel hud-scanlines rounded-xl p-2 border-emerald-500/30">
          <div className="relative rounded-lg overflow-hidden border border-emerald-500/40 shadow-[inset_0_0_18px_rgba(16,185,129,0.2)]">
            <canvas ref={minimapRef} width={148} height={148} className="block" />
            <div className="radar-sweep absolute inset-0 pointer-events-none opacity-65" />
            <div className="absolute top-1 left-1.5 text-[8px] font-mono-tabular font-bold text-emerald-300/90 drop-shadow pointer-events-none">
              TACTICAL RADAR
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono-tabular text-slate-200 px-0.5">
            <span className="truncate max-w-[105px] font-semibold">{hud.cityBroadcast.flagStatus} {hud.cityBroadcast.name}</span>
            <span className="text-sky-300 font-bold">👥 {hud.cityBroadcast.population}</span>
          </div>
        </div>

        <div className="glass-panel hud-scanlines rounded-xl p-2.5 w-64 text-[11px] border-sky-500/25">
          <div className="flex items-center justify-between font-bold text-slate-100 mb-1">
            <span className={hud.cityBroadcast.status.includes('ALERT') ? 'text-rose-400' : 'text-emerald-300'}>
              {hud.cityBroadcast.status}
            </span>
            <span className="text-[10px] font-mono-tabular text-amber-300 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700">
              Far Cities: {hud.cityBroadcast.farCitiesCount}
            </span>
          </div>
          <div className="text-[10px] text-slate-300/90 leading-snug">{hud.cityBroadcast.warning}</div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono-tabular">
            <span className="text-amber-300">🏛️ Pres Treasury: ${hud.cityBroadcast.presidentCash ?? 0}</span>
            <span className={hud.cityBroadcast.gasBroken ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
              {hud.cityBroadcast.gasBroken ? '⛽🚫 GAS BROKEN' : '⛽ GAS OK'}
            </span>
          </div>
          {hud.cityBroadcast.buildersActive > 0 && (
            <div className="mt-1 text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span>🏗️</span>
              <span>{hud.cityBroadcast.buildersActive}/15 Builders Constructing + Fixing</span>
            </div>
          )}
        </div>
      </div>

      {/* Active Vehicle Pilot/Driver HUD */}
      {hud.activeVehicle && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 glass-panel rounded-xl px-4 py-2 border-sky-500/60 flex items-center gap-3 text-xs font-mono-tabular">
          <span className="font-bold text-amber-300">
            {hud.activeVehicle.kind === 'helicopter' ? '🚁' : hud.activeVehicle.kind === 'jeep' ? '🚙' : '🚗'} {hud.activeVehicle.name}
          </span>
          <span className="text-emerald-400">HP {hud.activeVehicle.hp}/{hud.activeVehicle.maxHp}</span>
          <span className={hud.activeVehicle.fuel <= 25 ? 'text-rose-400 font-bold' : 'text-amber-300'}>
            ⛽ {hud.activeVehicle.fuel}%
          </span>
          <span className="text-sky-300">{hud.activeVehicle.speedKmh} km/h</span>
          {hud.activeVehicle.atGasStation && hud.activeVehicle.fuel < 99 && (
            <button
              onClick={() => game?.openHorseBag()}
              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              ⛽ Refuel [G]
            </button>
          )}
          {hud.activeVehicle.kind === 'helicopter' ? (
            <span className="text-amber-300 flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5" /> ALT {Math.round(hud.activeVehicle.altitude * 100)}% • LMB Twin Guns
            </span>
          ) : (
            <button
              onClick={() => game?.honkVehicleHorn()}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700"
            >
              Horn [H]
            </button>
          )}
          <button
            onClick={() => game?.interact()}
            className="px-2 py-0.5 rounded bg-rose-700 hover:bg-rose-600 text-white font-bold"
          >
            Exit [E]
          </button>
        </div>
      )}

      {/* Floating [E] Interaction Prompt */}
      {hud.interactPrompt && !hud.dead && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          {!hud.activeVehicle && (
            <div className="glass-panel rounded-full px-4 py-1.5 border-amber-400/60 flex items-center gap-2 text-xs">
              <span className="font-bold text-amber-300">{hud.interactPrompt.text}</span>
              <span className="text-slate-400 text-[10px]">• {hud.interactPrompt.detail}</span>
            </div>
          )}
        </div>
      )}

      {/* Toast Stack */}
      <div className="fixed bottom-24 right-3 z-20 flex flex-col gap-1.5 items-end pointer-events-none max-w-xs">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`glass-panel rounded-lg px-3 py-1.5 text-xs font-medium border ${
              t.tone === 'rose'
                ? 'border-rose-500/60 text-rose-200'
                : t.tone === 'emerald'
                  ? 'border-emerald-500/60 text-emerald-200'
                  : t.tone === 'amber'
                    ? 'border-amber-500/60 text-amber-200'
                    : 'border-sky-500/60 text-sky-200'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* Bottom Held Item Telemetry, Hotbar & Quick Action Dock */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
        {!hud.activeVehicle && (
          <div className="glass-panel rounded-full px-3.5 py-0.5 border-slate-700/70 flex items-center gap-2 text-[11px] font-mono-tabular">
            <span>{hud.heldIcon}</span>
            <span className="font-bold text-slate-100">{hud.heldName}</span>
            {hud.heldLevel > 1 && <span className="text-amber-400 font-bold">Lv.{hud.heldLevel}</span>}
            {hud.ammoDisplay && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
                {hud.ammoDisplay}
              </span>
            )}
          </div>
        )}
        <div className="flex items-end gap-2.5">
          <div className="glass-panel hud-scanlines rounded-2xl p-1.5 flex items-center gap-1.5 border-amber-500/25">
            {Array.from({ length: 9 }).map((_, idx) => {
              const slot = game?.player.inventory[idx] || null;
              const def = slot ? ITEMS[slot.id] : null;
              const active = game?.player.activeSlot === idx;
              return (
                <button
                  key={idx}
                  onClick={() => game?.selectHotbarSlot(idx)}
                  className={`relative w-11 h-11 rounded-xl border bg-slate-950/90 flex items-center justify-center slot-box ${
                    active ? 'slot-active border-amber-400' : 'border-slate-700/80'
                  }`}
                  title={def ? `${def.name}: ${def.desc}` : `Slot ${idx + 1}`}
                >
                  <span className="absolute top-0.5 left-1 text-[9px] font-mono-tabular text-slate-500">{idx + 1}</span>
                  {def && <span className="text-xl drop-shadow">{def.icon}</span>}
                  {slot && slot.count > 1 && (
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-mono-tabular font-bold text-slate-100 drop-shadow">
                      {slot.count}
                    </span>
                  )}
                  {slot && slot.level && slot.level > 1 && (
                    <span className="absolute top-0.5 right-1 text-[9px] font-mono-tabular text-amber-400 font-bold">
                      +{slot.level - 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Menu Buttons */}
          <div className="glass-panel hud-scanlines rounded-2xl p-1.5 flex items-center gap-1 border-sky-500/25">
            <button
              onClick={() => setModal(modal === 'inventory' ? 'none' : 'inventory')}
              className="px-2.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 hover:border-sky-400/50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Inventory & Armor [I]"
            >
              <Package className="w-4 h-4 text-sky-400" />
              <span className="hidden md:inline">Bag [I]</span>
            </button>
            <button
              onClick={() => setModal(modal === 'craft' ? 'none' : 'craft')}
              className="px-2.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-400/50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Crafting Bench [C]"
            >
              <Wrench className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline">Craft [C]</span>
            </button>
            <button
              onClick={() => setModal(modal === 'upgrade' ? 'none' : 'upgrade')}
              className="px-2.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 hover:border-purple-400/50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Upgrade Anvil [U]"
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="hidden md:inline">Anvil [U]</span>
            </button>
            <button
              onClick={() => setModal(modal === 'events' ? 'none' : 'events')}
              className="px-2.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 hover:border-rose-400/50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="World Events, Far City & Builders [T]"
            >
              <Zap className="w-4 h-4 text-rose-400" />
              <span className="hidden md:inline">Events [T]</span>
            </button>
            <button
              onClick={() => setModal(modal === 'guide' ? 'none' : 'guide')}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 hover:border-emerald-400/50 text-xs transition-colors"
              title="Controls & Guide"
            >
              <HelpCircle className="w-4 h-4 text-emerald-400" />
            </button>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {modal === 'inventory' && game && (
        <ModalFrame title="🎒 Survivor Inventory & Equipment" onClose={() => setModal('none')}>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {(['head', 'body', 'feet', 'shield'] as const).map((slotKey) => {
              const eq = game.player.equipment[slotKey];
              const def = eq ? ITEMS[eq.id] : null;
              return (
                <button
                  key={slotKey}
                  onClick={() => game.unequipSlot(slotKey)}
                  className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-sky-400 flex flex-col items-center text-xs"
                >
                  <span className="text-[10px] uppercase text-slate-400">{slotKey}</span>
                  <span className="text-2xl my-1">{def ? def.icon : '▫️'}</span>
                  <span className="text-[10px] truncate max-w-full">{def ? def.name : 'Empty'}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-9 gap-1.5">
            {game.player.inventory.map((slot, i) => {
              const def = slot ? ITEMS[slot.id] : null;
              return (
                <button
                  key={i}
                  onClick={() => game.handleInventoryClick(i)}
                  className="relative h-12 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 flex items-center justify-center"
                  title={def ? `${def.name} — Click to equip/use/move to active slot` : 'Empty'}
                >
                  {def && <span className="text-xl">{def.icon}</span>}
                  {slot && slot.count > 1 && (
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-mono-tabular font-bold">{slot.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </ModalFrame>
      )}

      {(modal === 'craft' || modal === 'base') && game && (
        <ModalFrame title="🛠️ Crafting & City Base Workbench" onClose={() => setModal('none')}>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCraftCat(c)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                  craftCat === c ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
            {RECIPES.filter((r) => craftCat === 'All' || r.cat === craftCat).map((r) => {
              const resDef = ITEMS[r.result];
              return (
                <div key={r.id} className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <span>{resDef?.icon}</span>
                      <span>{resDef?.name} x{r.count}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-2 font-mono-tabular">
                      {Object.entries(r.cost).map(([k, v]) => (
                        <span key={k} className={game.countItem(k) >= v ? 'text-emerald-400' : 'text-rose-400'}>
                          {ITEMS[k]?.icon} {v} ({game.countItem(k)})
                        </span>
                      ))}
                      {r.cash && (
                        <span className={game.player.cash >= r.cash ? 'text-emerald-400' : 'text-rose-400'}>
                          ${r.cash}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => game.craftRecipe(r.id)}
                    className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-xs font-bold shrink-0"
                  >
                    Craft
                  </button>
                </div>
              );
            })}
          </div>
        </ModalFrame>
      )}

      {modal === 'upgrade' && game && (
        <ModalFrame title="🔨 Tactical Upgrade Anvil" onClose={() => setModal('none')}>
          <p className="text-xs text-slate-400 mb-3">
            Upgrade weapons, tools & armor using Cave Iron Ore, Golden Ore, and Cash up to Lv.5.
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {game.player.inventory.map((slot, i) => {
              if (!slot) return null;
              const def = ITEMS[slot.id];
              if (!def || !['weapon', 'tool', 'armor', 'shield'].includes(def.type)) return null;
              const lvl = slot.level || 1;
              return (
                <div key={i} className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-xl">{def.icon}</span>
                    <div>
                      <div className="font-bold">{def.name} <span className="text-amber-400">Lv.{lvl}</span></div>
                      <div className="text-[10px] text-slate-400 font-mono-tabular">
                        Cost: ⚙️ {lvl * 2} Iron • 🪙 {Math.max(0, lvl - 1)} Gold • ${lvl * 35}
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={lvl >= 5}
                    onClick={() => game.upgradeInventorySlot(i)}
                    className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-xs font-bold"
                  >
                    {lvl >= 5 ? 'MAX' : 'Upgrade'}
                  </button>
                </div>
              );
            })}
          </div>
        </ModalFrame>
      )}

      {modal === 'events' && game && (
        <ModalFrame title="⚡ World Timer Events, Far City & President Autonomous Command" onClose={() => setModal('none')}>
          <div className="mb-4 p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-amber-300 flex items-center gap-1">
                <Hammer className="w-3.5 h-3.5" /> 🏛️ President Autonomous Command (Defense, Repairs, Building & Retreat)
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                Protected inside the <strong>Luxurious White House</strong> by <strong>6 Guards &amp; FBI</strong>, the President commands <strong>15 Builders</strong> to build or fix the <strong>Military Base</strong>, <strong>Gas Station</strong>, <strong>White House</strong>, <strong>Houses</strong>, <strong>Shops</strong>, <strong>Job Office</strong>, <strong>Mall</strong>, <strong>Hotel</strong> &amp; <strong>Farmland + Farmhouse</strong>.
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => game.dispatchBuildersNow()}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold"
                >
                  🏗️ Build District (-$40)
                </button>
                <button
                  onClick={() => game.commandPresidentFixBuildings(undefined, 'all')}
                  className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold"
                >
                  🔧 Fix Anything (-$30)
                </button>
                <button
                  onClick={() => game.commandPresidentFixBuildings(undefined, 'military_base')}
                  className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white text-[10px] font-bold"
                >
                  🪖 Fix Military Base (-$30)
                </button>
                <button
                  onClick={() => game.commandPresidentFixBuildings(undefined, 'gas_station')}
                  className="px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white text-[10px] font-bold"
                >
                  ⛽ Fix Gas Station (-$30)
                </button>
                <button
                  onClick={() => game.commandPresidentFixBuildings(undefined, 'white_house')}
                  className="px-2.5 py-1 rounded bg-slate-200 hover:bg-white text-slate-950 text-[10px] font-bold"
                >
                  🏛️ Fix White House (-$30)
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {EXPANSION_SEQUENCE.map((exp) => {
                  const built = game.cities[0]?.expansionsBuilt[exp];
                  return (
                    <span
                      key={exp}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono-tabular ${
                        built ? 'bg-emerald-900/70 text-emerald-300 border border-emerald-600/50' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {built ? '✓ ' : ''}{exp.replace('_', ' ')}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-sky-600/50 text-[10px] font-mono-tabular text-sky-300 shrink-0 max-w-[195px]">
              <div className="text-amber-300 font-bold mb-0.5">{hud.cityBroadcast.status}</div>
              <div>Pop: {hud.cityBroadcast.population} • Damaged: {hud.cityBroadcast.damaged}</div>
              <div className="text-emerald-300">Treasury: ${hud.cityBroadcast.presidentCash ?? 0}</div>
              <div className={hud.cityBroadcast.gasBroken ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                Gas: {hud.cityBroadcast.gasBroken ? 'BROKEN (Pres $)' : 'ONLINE'}
              </div>
              <div className="text-slate-300 mt-0.5 truncate">{hud.cityBroadcast.presidentOrder}</div>
            </div>
          </div>

          <div className="space-y-2">
            {game.worldEvents.map((ev) => (
              <div key={ev.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <span>{ev.icon}</span>
                    <span>{ev.name}</span>
                    <span className="font-mono-tabular text-amber-400 text-[10px]">({Math.max(0, Math.ceil(ev.timer))}s)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{ev.desc}</div>
                </div>
                <button
                  onClick={() => {
                    game.triggerWorldEvent(ev.id);
                    setModal('none');
                  }}
                  className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-xs font-bold shrink-0"
                >
                  Trigger Now
                </button>
              </div>
            ))}
          </div>
        </ModalFrame>
      )}

      {modal === 'storage' && game && storageInfo && (
        <ModalFrame title={`📦 ${storageInfo.title}`} onClose={() => setModal('none')}>
          <div className="text-[11px] text-slate-400 mb-2">Container Slots (click item to take):</div>
          <div className="grid grid-cols-6 gap-1.5 mb-4">
            {storageInfo.slots.map((slot, i) => {
              const def = slot ? ITEMS[slot.id] : null;
              return (
                <button
                  key={i}
                  onClick={() => {
                    game.transferStorageSlot(true, i);
                    refreshStorageSlots();
                  }}
                  className="relative h-12 rounded bg-slate-900 border border-slate-700 hover:border-emerald-400 flex items-center justify-center"
                >
                  {def && <span className="text-xl">{def.icon}</span>}
                  {slot && slot.count > 1 && <span className="absolute bottom-0.5 right-1 text-[10px] font-bold">{slot.count}</span>}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-slate-400 mb-2">Your Bag (click item to store):</div>
          <div className="grid grid-cols-9 gap-1">
            {game.player.inventory.map((slot, i) => {
              const def = slot ? ITEMS[slot.id] : null;
              return (
                <button
                  key={i}
                  onClick={() => {
                    game.transferStorageSlot(false, i);
                    refreshStorageSlots();
                  }}
                  className="relative h-10 rounded bg-slate-900 border border-slate-800 hover:border-amber-400 flex items-center justify-center"
                >
                  {def && <span className="text-lg">{def.icon}</span>}
                  {slot && slot.count > 1 && <span className="absolute bottom-0 right-1 text-[9px] font-bold">{slot.count}</span>}
                </button>
              );
            })}
          </div>
        </ModalFrame>
      )}

      {modal === 'merchant' && game && (
        <ModalFrame title={`🪙 ${merchantInfo?.name || 'City Merchant & Gold Exchanger'}`} onClose={() => setModal('none')}>
          <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 mb-3 flex items-center justify-between">
            <div className="text-xs">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Coins className="w-4 h-4" /> Gold Converter ($120 Cash per Golden Ore)
              </div>
              <div className="text-[11px] text-slate-300">
                You hold <span className="text-amber-400 font-bold">{game.countItem('gold')}</span> Golden Ore & <span className="text-emerald-400 font-bold">${game.player.cash}</span> Cash.
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => game.convertGoldToCash(false)}
                className="px-2.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold"
              >
                Sell 1 Gold
              </button>
              <button
                onClick={() => game.convertGoldToCash(true)}
                className="px-2.5 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold"
              >
                Sell All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
            {MERCHANT_CATALOG.map((offer) => {
              const def = ITEMS[offer.id];
              return (
                <button
                  key={offer.id}
                  onClick={() => game.buyMerchantItem(offer.id, offer.price, offer.count)}
                  className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-emerald-400 text-left flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold">{def?.icon} {def?.name}</div>
                    <div className="text-[10px] text-slate-400">Qty: {offer.count}</div>
                  </div>
                  <span className="text-xs font-mono-tabular font-bold text-emerald-400">${offer.price}</span>
                </button>
              );
            })}
          </div>
        </ModalFrame>
      )}

      {modal === 'guide' && (
        <ModalFrame title="📖 DeadGrid Tactical Field Manual" onClose={() => setModal('none')}>
          <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
            <p><strong className="text-amber-300">Movement, Pro Drivers &amp; Vehicle Explosions:</strong> WASD move, Shift sprint, Left-Click shoot/swing/mine/place, Right-Click or [F] Shield Block, Scroll Zoom. Shoot &amp; destroy <strong>Helicopters</strong> (flying or parked), ground vehicles, and objects. Crashing a Car/Jeep into an object deals <strong>15% vehicle damage</strong>. <strong>Pro AI Drivers</strong> steer cleanly around objects &amp; humans without hitting them. If ANY vehicle explodes, <strong>its driver (player or AI) takes heavy blast damage</strong>!</p>
            <p><strong className="text-emerald-300">Luxurious White House, 6 Bodyguards &amp; 15 Builders:</strong> The <strong>President Villager</strong> lives inside the <strong>Luxurious White House</strong> (Marble Fountain, Pillars, Gold Chandeliers, Velvet Sofas &amp; Oval Office) guarded by <strong>6 Guards &amp; FBI</strong>! The President commands <strong>15 Builders</strong> to build or fix/rebuild the <strong>Military Base</strong>, <strong>Gas Station</strong>, <strong>White House</strong>, <strong>Houses</strong>, <strong>Shops</strong>, <strong>Job Office (ComputerOS [E])</strong>, <strong>Mall</strong>, <strong>Luxury Hotel</strong>, &amp; <strong>Farmland</strong>.</p>
            <p><strong className="text-lime-300">Expanded Farmland, Farmhouse &amp; Hard-Working Farmers:</strong> East of Gold Shop lies a huge irrigated <strong>Wheat Farmland &amp; Wooden Farmhouse</strong> filled with <strong>Haybales</strong>, storage chests &amp; farm animals (cows, pigs, goats, chickens). <strong>Farmers</strong> tirelessly plant wheat, water/tend crops, harvest wheat &amp; store harvests inside the Farmhouse!</p>
            <p><strong className="text-cyan-300">NE Boulevard Gas Station &amp; Broken Fuel Rule:</strong> Press <strong>[E]</strong> by the <strong>Villager Gas Man</strong> / Pump (or <strong>[G]</strong> in a vehicle) to refuel. Breaking a pump triggers an <strong>instant massive gas explosion</strong> (25% HP player damage), and once broken, <strong>vehicles cannot fuel unless the President is alive with Treasury funds</strong> ($50 player / $40 AI) — or until Builders rebuild the Gas Station!</p>
            <p><strong className="text-sky-300">Medium-Range Military RADAR &amp; Guard Law:</strong> The Military Base <strong>RADAR</strong> scans <strong>1000px</strong>: 100+ zombies trigger a flashing red beacon, warning horn, and full <strong>FBI &amp; Guard</strong> mobilization! Guards stay <strong>innocent</strong> unless you kill a villager, chasing you until you escape far away.</p>
            <p><strong className="text-rose-300">750-Zombie Boss Swarm, Meteor Shower &amp; Cave Ores:</strong> Zombie King Titan summons <strong>750 zombies</strong> + <strong>15 close meteors</strong>. Coal ⬛, Iron ⚙️, and Golden Ores 🪙 generate <strong>exclusively inside stone caves</strong> (such as NW Cave -20,-14).</p>
          </div>
        </ModalFrame>
      )}

      {/* Game Over Modal */}
      {hud.dead && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 max-w-sm w-full text-center border-rose-500/50">
            <div className="text-3xl mb-2">💀</div>
            <h2 className="font-pixel text-base text-rose-400 mb-2">OVERRUN</h2>
            <p className="text-xs text-slate-300 mb-4 font-mono-tabular">
              Survived {hud.deathSummary.days} Days • {hud.deathSummary.kills} Kills • ${hud.deathSummary.cash} Cash
            </p>
            <button
              onClick={() => game?.respawnPlayer()}
              className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm"
            >
              Respawn at Starter Camp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-panel rounded-2xl p-5 max-w-2xl w-full border-slate-600/60" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/80">
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
          >
            Close [ESC]
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
