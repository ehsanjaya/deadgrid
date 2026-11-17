import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';

interface PlayerAppearance {
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
  hairStyle: 'short' | 'spiky' | 'bob' | 'mohawk' | 'bald';
  hairColor: string;
  hat: 'none' | 'cap' | 'bandana' | 'cowboy' | 'beanie' | 'crown';
  glasses: 'none' | 'shades' | 'visor';
}

interface ServerPlayerState {
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

const DEFAULT_APPEARANCE: PlayerAppearance = {
  skinColor: '#fed7aa',
  shirtColor: '#0284c7',
  pantsColor: '#1e293b',
  hairStyle: 'short',
  hairColor: '#451a03',
  hat: 'none',
  glasses: 'none',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json());

  const players = new Map<string, ServerPlayerState>();
  const sockets = new Map<string, WebSocket>();
  let nextSeq = 1;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, playersOnline: players.size });
  });

  app.get('/api/players', (_req, res) => {
    res.json({ players: Array.from(players.values()) });
  });

  if (IS_PROD) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (payload: unknown, excludeId?: string) => {
    const encoded = JSON.stringify(payload);
    for (const [id, ws] of sockets.entries()) {
      if (id === excludeId) continue;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoded);
      }
    }
  };

  wss.on('connection', (ws) => {
    const playerId = `p_${Date.now().toString(36)}_${nextSeq++}`;
    sockets.set(playerId, ws);

    const initialPlayer: ServerPlayerState = {
      id: playerId,
      name: `Survivor-${String(nextSeq - 1).padStart(2, '0')}`,
      appearance: { ...DEFAULT_APPEARANCE },
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      facingDir: 1,
      walkCycle: 0,
      hp: 100,
      maxHp: 100,
      armor: 0,
      level: 1,
      kills: 0,
      cash: 150,
      poisoned: false,
      dead: false,
      biome: 'PLAINS',
      heldItemId: 'sword_iron',
      heldItemName: 'Tactical Machete',
      vehicleKind: null,
      vehicleName: null,
      swingAnim: 0,
      blocking: false,
      updatedAt: Date.now(),
    };
    players.set(playerId, initialPlayer);

    ws.send(
      JSON.stringify({
        type: 'welcome',
        playerId,
        players: Array.from(players.values()),
      })
    );
    broadcast({ type: 'player_joined', player: initialPlayer }, playerId);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const p = players.get(playerId);
        if (!p || !msg || typeof msg !== 'object') return;

        if (msg.type === 'join' || msg.type === 'customize') {
          if (typeof msg.name === 'string') {
            const clean = msg.name.trim().slice(0, 20);
            if (clean.length > 0) p.name = clean;
          }
          if (msg.appearance && typeof msg.appearance === 'object') {
            p.appearance = {
              skinColor: typeof msg.appearance.skinColor === 'string' ? msg.appearance.skinColor.slice(0, 20) : p.appearance.skinColor,
              shirtColor: typeof msg.appearance.shirtColor === 'string' ? msg.appearance.shirtColor.slice(0, 20) : p.appearance.shirtColor,
              pantsColor: typeof msg.appearance.pantsColor === 'string' ? msg.appearance.pantsColor.slice(0, 20) : p.appearance.pantsColor,
              hairStyle: ['short', 'spiky', 'bob', 'mohawk', 'bald'].includes(msg.appearance.hairStyle)
                ? msg.appearance.hairStyle
                : p.appearance.hairStyle,
              hairColor: typeof msg.appearance.hairColor === 'string' ? msg.appearance.hairColor.slice(0, 20) : p.appearance.hairColor,
              hat: ['none', 'cap', 'bandana', 'cowboy', 'beanie', 'crown'].includes(msg.appearance.hat)
                ? msg.appearance.hat
                : p.appearance.hat,
              glasses: ['none', 'shades', 'visor'].includes(msg.appearance.glasses)
                ? msg.appearance.glasses
                : p.appearance.glasses,
            };
          }
          p.updatedAt = Date.now();
          broadcast({ type: 'player_updated', player: p });
        } else if (msg.type === 'state' && msg.state && typeof msg.state === 'object') {
          const s = msg.state;
          if (Number.isFinite(s.x)) p.x = s.x;
          if (Number.isFinite(s.y)) p.y = s.y;
          if (Number.isFinite(s.vx)) p.vx = s.vx;
          if (Number.isFinite(s.vy)) p.vy = s.vy;
          if (Number.isFinite(s.angle)) p.angle = s.angle;
          if (s.facingDir === 1 || s.facingDir === -1) p.facingDir = s.facingDir;
          if (Number.isFinite(s.walkCycle)) p.walkCycle = s.walkCycle;
          if (Number.isFinite(s.hp)) p.hp = s.hp;
          if (Number.isFinite(s.maxHp)) p.maxHp = s.maxHp;
          if (Number.isFinite(s.armor)) p.armor = s.armor;
          if (Number.isFinite(s.level)) p.level = s.level;
          if (Number.isFinite(s.kills)) p.kills = s.kills;
          if (Number.isFinite(s.cash)) p.cash = s.cash;
          p.poisoned = !!s.poisoned;
          p.dead = !!s.dead;
          if (typeof s.biome === 'string') p.biome = s.biome.slice(0, 24);
          p.heldItemId = typeof s.heldItemId === 'string' ? s.heldItemId.slice(0, 32) : null;
          p.heldItemName = typeof s.heldItemName === 'string' ? s.heldItemName.slice(0, 36) : 'Bare Hands';
          p.vehicleKind = typeof s.vehicleKind === 'string' ? s.vehicleKind.slice(0, 20) : null;
          p.vehicleName = typeof s.vehicleName === 'string' ? s.vehicleName.slice(0, 40) : null;
          if (Number.isFinite(s.swingAnim)) p.swingAnim = s.swingAnim;
          p.blocking = !!s.blocking;
          p.updatedAt = Date.now();
        } else if (msg.type === 'chat' && typeof msg.text === 'string') {
          const cleanText = msg.text.trim().slice(0, 140);
          if (cleanText.length > 0) {
            broadcast({
              type: 'chat',
              playerId,
              name: p.name,
              text: cleanText,
              ts: Date.now(),
            });
          }
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      sockets.delete(playerId);
      players.delete(playerId);
      broadcast({ type: 'player_left', playerId });
    });
  });

  // Authoritative 20Hz multiplayer state snapshot broadcast
  setInterval(() => {
    if (sockets.size === 0) return;
    broadcast({
      type: 'snapshot',
      players: Array.from(players.values()),
    });
  }, 50);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`DeadGrid server + WebSocket multiplayer listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
