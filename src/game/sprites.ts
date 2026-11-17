export class PixelArtCache {
  tiles: Record<string, HTMLCanvasElement> = {};
  blocks: Record<string, HTMLCanvasElement> = {};

  constructor() {
    this.buildTileSprites();
    this.buildBlockSprites();
  }

  private makeCanvas(
    w: number,
    h: number,
    drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  ): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    drawFn(ctx, w, h);
    return c;
  }

  private buildTileSprites() {
    for (let v = 0; v < 4; v++) {
      this.tiles['grass_' + v] = this.makeCanvas(32, 32, (ctx) => {
        ctx.fillStyle = '#2c6137';
        ctx.fillRect(0, 0, 32, 32);
        ctx.fillStyle = '#336e3f';
        ctx.fillRect((v * 8) % 24, (v * 12) % 24, 8, 8);
        ctx.fillStyle = '#25522e';
        ctx.fillRect((v * 14 + 4) % 24, (v * 6 + 10) % 24, 6, 6);
        ctx.fillStyle = '#438750';
        for (let i = 0; i < 12; i++) {
          const px = (i * 7 + v * 11) % 30;
          const py = (i * 13 + v * 5) % 29;
          ctx.fillRect(px, py, 1, 3);
          ctx.fillRect(px + 1, py + 1, 1, 2);
        }
        if (v === 2) {
          ctx.fillStyle = '#fde047';
          ctx.fillRect(10, 14, 2, 2);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(22, 24, 2, 2);
        } else if (v === 3) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(18, 8, 2, 2);
        }
      });
    }

    this.tiles['hole_dirt'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#422612';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#2b1709';
      ctx.fillRect(0, 0, 32, 3);
      ctx.fillRect(0, 0, 3, 32);
      ctx.fillStyle = '#5c381e';
      ctx.fillRect(3, 3, 27, 27);
      ctx.fillStyle = '#361e0d';
      ctx.fillRect(7, 8, 6, 5);
      ctx.fillRect(19, 17, 7, 6);
      ctx.fillRect(10, 22, 5, 4);
    });

    for (let f = 0; f < 2; f++) {
      this.tiles['hole_water_' + f] = this.makeCanvas(32, 32, (ctx) => {
        ctx.fillStyle = '#3b210e';
        ctx.fillRect(0, 0, 32, 32);
        ctx.fillStyle = '#1d4ed8';
        ctx.fillRect(2, 2, 28, 28);
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(4, 4, 24, 24);
        ctx.fillStyle = '#93c5fd';
        const ox = f * 6;
        ctx.fillRect(5 + ox, 9, 8, 2);
        ctx.fillRect(12 - ox, 20, 9, 2);
      });
    }

    this.tiles['road'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#334155';
      ctx.fillRect(2, 2, 12, 12);
      ctx.fillRect(18, 18, 12, 12);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(14, 4, 4, 9);
      ctx.fillRect(14, 19, 4, 9);
    });

    this.tiles['sidewalk'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(1, 1, 14, 14);
      ctx.fillRect(17, 1, 14, 14);
      ctx.fillRect(1, 17, 14, 14);
      ctx.fillRect(17, 17, 14, 14);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 15, 32, 2);
      ctx.fillRect(15, 0, 2, 32);
    });

    this.tiles['helipad'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#475569';
      ctx.fillRect(2, 2, 28, 28);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(2, 2, 28, 2);
      ctx.fillRect(2, 28, 28, 2);
      ctx.fillRect(2, 2, 2, 28);
      ctx.fillRect(28, 2, 2, 28);
      // Bold H marking
      ctx.fillRect(9, 8, 3, 16);
      ctx.fillRect(20, 8, 3, 16);
      ctx.fillRect(12, 14, 8, 3);
    });

    this.tiles['military_pad'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#293529';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#364536';
      ctx.fillRect(1, 1, 30, 30);
      ctx.fillStyle = '#4d5d4d';
      ctx.fillRect(3, 3, 12, 12);
      ctx.fillRect(17, 17, 12, 12);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(0, 0, 4, 2);
      ctx.fillRect(28, 0, 4, 2);
    });

    this.tiles['gas_pad'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#475569';
      ctx.fillRect(1, 1, 30, 30);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, 32, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(0, 2, 8, 2);
      ctx.fillRect(16, 2, 8, 2);
    });

    this.tiles['city_floor'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillRect(16, 16, 16, 16);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 31, 32, 1);
      ctx.fillRect(31, 0, 1, 32);
    });

    this.tiles['white_floor'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillRect(16, 16, 16, 16);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(15, 15, 2, 2);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 31, 32, 1);
      ctx.fillRect(31, 0, 1, 32);
    });

    this.tiles['gold_floor'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#fefce8';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(2, 2, 28, 28);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, 32, 1);
      ctx.fillRect(0, 0, 1, 32);
      ctx.fillRect(14, 14, 4, 4);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(15, 15, 2, 2);
    });

    this.tiles['mall_floor'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillRect(16, 16, 16, 16);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(15, 15, 2, 2);
    });

    this.tiles['hotel_carpet'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(2, 2, 28, 28);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(14, 14, 4, 4);
      ctx.fillRect(4, 4, 2, 2);
      ctx.fillRect(26, 26, 2, 2);
    });

    this.tiles['forest'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1e462b';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#265736';
      ctx.fillRect(2, 2, 12, 10);
      ctx.fillRect(16, 18, 14, 12);
      ctx.fillStyle = '#163520';
      ctx.fillRect(6, 22, 6, 4);
      ctx.fillRect(20, 6, 6, 4);
    });

    this.tiles['jungle'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#155e2c';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(3, 4, 8, 6);
      ctx.fillRect(18, 16, 10, 8);
    });

    this.tiles['taiga'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#284b3c';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#335c4a';
      ctx.fillRect(4, 3, 10, 8);
      ctx.fillRect(18, 19, 10, 9);
    });

    this.tiles['savanna'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#8a7d2b';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#a39436';
      ctx.fillRect(2, 4, 12, 8);
      ctx.fillRect(16, 18, 13, 10);
    });

    this.tiles['snow'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(2, 2, 14, 10);
      ctx.fillRect(16, 16, 14, 12);
    });

    this.tiles['swamp'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#2b3d28';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#364d32';
      ctx.fillRect(3, 3, 11, 9);
    });

    this.tiles['sand'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#d6b46c';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#e6c885';
      ctx.fillRect(2, 4, 14, 4);
      ctx.fillRect(14, 18, 16, 4);
    });

    this.tiles['stone'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#3e4c5e';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#4d5d73';
      ctx.fillRect(2, 2, 13, 11);
      ctx.fillRect(17, 16, 13, 13);
      ctx.fillRect(17, 2, 12, 11);
      ctx.fillRect(2, 16, 12, 13);
    });

    // Dark atmospheric cave stone floor with subtle mineral specks
    this.tiles['cave_floor'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#273040';
      ctx.fillRect(2, 2, 12, 10);
      ctx.fillRect(16, 17, 13, 12);
      ctx.fillStyle = '#141923';
      ctx.fillRect(4, 18, 8, 8);
      ctx.fillRect(19, 4, 9, 7);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(12, 12, 1, 1);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(25, 22, 1, 1);
    });

    this.tiles['farmland'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#5c381e';
      ctx.fillRect(0, 0, 32, 32);
      for (let y = 2; y < 32; y += 6) {
        ctx.fillStyle = '#422612';
        ctx.fillRect(1, y, 30, 2);
        ctx.fillStyle = '#734829';
        ctx.fillRect(1, y + 2, 30, 2);
      }
    });

    this.tiles['planks'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#854d27';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#9c5d32';
      ctx.fillRect(1, 1, 30, 6);
      ctx.fillRect(1, 9, 30, 6);
      ctx.fillRect(1, 17, 30, 6);
      ctx.fillRect(1, 25, 30, 6);
      ctx.fillStyle = '#593116';
      ctx.fillRect(0, 7, 32, 1);
      ctx.fillRect(0, 15, 32, 1);
      ctx.fillRect(0, 23, 32, 1);
      ctx.fillRect(0, 31, 32, 1);
    });

    for (let f = 0; f < 2; f++) {
      this.tiles['water_' + f] = this.makeCanvas(32, 32, (ctx) => {
        ctx.fillStyle = '#1e40af';
        ctx.fillRect(0, 0, 32, 32);
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(0, 0, 32, 18);
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(2, 4, 28, 10);
        ctx.fillStyle = '#93c5fd';
        const ox = f * 7;
        ctx.fillRect((4 + ox) % 24, 6, 7, 2);
        ctx.fillRect((16 + ox) % 24, 19, 6, 2);
      });
    }
  }

  private buildBlockSprites() {
    this.blocks['wood_wall'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#5c3114';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#a15e30';
      ctx.fillRect(2, 2, 28, 12);
      ctx.fillStyle = '#854920';
      ctx.fillRect(2, 14, 28, 16);
      ctx.fillStyle = '#47240d';
      ctx.fillRect(1, 1, 4, 30);
      ctx.fillRect(27, 1, 4, 30);
    });

    this.blocks['stone_wall'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(2, 2, 28, 9);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(2, 12, 13, 8);
      ctx.fillRect(17, 12, 13, 8);
      ctx.fillRect(2, 22, 10, 8);
      ctx.fillRect(14, 22, 16, 8);
    });

    this.blocks['white_wall'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(2, 2, 28, 11);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(2, 14, 13, 7);
      ctx.fillRect(17, 14, 13, 7);
      ctx.fillRect(2, 22, 28, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(2, 12, 28, 2);
    });

    this.blocks['barrier'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(2, 8, 28, 18);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(4, 10, 6, 14);
      ctx.fillRect(14, 10, 6, 14);
      ctx.fillRect(24, 10, 4, 14);
    });

    this.blocks['chest'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(3, 5, 26, 23);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(4, 6, 24, 9);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(4, 16, 24, 11);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(14, 13, 4, 5);
    });

    this.blocks['secret_locker'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(4, 2, 24, 28);
      ctx.fillStyle = '#475569';
      ctx.fillRect(6, 4, 20, 24);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(5, 3, 22, 2);
      ctx.fillRect(5, 27, 22, 2);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(16, 16, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(15, 12, 2, 8);
      ctx.fillRect(12, 15, 8, 2);
    });

    this.blocks['shop_counter'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(1, 4, 30, 24);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(2, 5, 28, 12);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(6, 8, 6, 5);
      ctx.fillRect(19, 8, 6, 5);
    });

    this.blocks['playground_slide'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(5, 4, 4, 24);
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(7, 6, 10, 6);
      ctx.fillRect(12, 11, 10, 6);
      ctx.fillRect(17, 16, 10, 8);
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(9, 7, 16, 3);
    });

    this.blocks['playground_swing'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#475569';
      ctx.fillRect(4, 3, 24, 3);
      ctx.fillRect(4, 3, 3, 26);
      ctx.fillRect(25, 3, 3, 26);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(11, 6, 1, 15);
      ctx.fillRect(20, 6, 1, 15);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(9, 20, 14, 4);
    });

    this.blocks['fridge'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(5, 2, 22, 28);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(6, 3, 20, 10);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(6, 14, 20, 15);
      ctx.fillStyle = '#475569';
      ctx.fillRect(21, 6, 2, 5);
      ctx.fillRect(21, 17, 2, 7);
    });

    this.blocks['bed'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(3, 2, 26, 28);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(5, 4, 22, 7);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(5, 11, 22, 17);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(6, 12, 20, 4);
    });

    this.blocks['seat'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(8, 5, 16, 6);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(7, 11, 18, 12);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(8, 23, 4, 6);
      ctx.fillRect(20, 23, 4, 6);
    });

    this.blocks['table'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(2, 4, 28, 24);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(3, 5, 26, 18);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(5, 7, 22, 14);
    });

    this.blocks['kitchen_counter'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#475569';
      ctx.fillRect(1, 3, 30, 26);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(2, 4, 28, 14);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, 7, 7, 7);
      ctx.fillRect(18, 7, 7, 7);
    });

    this.blocks['sink'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(2, 3, 28, 26);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(4, 5, 24, 18);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(7, 8, 18, 11);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(14, 3, 4, 6);
    });

    this.blocks['shower'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(4, 4, 24, 24);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(6, 6, 20, 20);
      ctx.fillStyle = '#475569';
      ctx.fillRect(13, 2, 6, 7);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(11, 8, 10, 3);
    });

    this.blocks['statue_villager'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#475569';
      ctx.fillRect(3, 20, 26, 11);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(5, 18, 22, 4);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(10, 8, 12, 10);
      ctx.fillStyle = '#34d399';
      ctx.fillRect(11, 2, 10, 7);
      ctx.fillStyle = '#065f46';
      ctx.fillRect(14, 5, 4, 4);
    });

    this.blocks['workbench'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(2, 4, 28, 25);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(3, 5, 26, 11);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(11, 5, 1, 11);
      ctx.fillRect(20, 5, 1, 11);
    });

    this.blocks['anvil'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(4, 7, 24, 8);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(5, 8, 22, 4);
      ctx.fillStyle = '#334155';
      ctx.fillRect(10, 15, 12, 6);
      ctx.fillStyle = '#475569';
      ctx.fillRect(6, 21, 20, 6);
    });

    this.blocks['hay_bale'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#a16207';
      ctx.fillRect(3, 6, 26, 22);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(4, 7, 24, 18);
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(4, 12, 24, 2);
      ctx.fillRect(4, 19, 24, 2);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(10, 7, 2, 20);
      ctx.fillRect(20, 7, 2, 20);
    });

    this.blocks['scarecrow'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(14, 10, 4, 20);
      ctx.fillRect(6, 14, 20, 3);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(11, 13, 10, 10);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(11, 4, 10, 8);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(8, 5, 16, 3);
    });

    this.blocks['windmill'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(7, 8, 18, 22);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(6, 4, 20, 6);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(13, 20, 6, 10);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(4, 9, 24, 3);
      ctx.fillRect(14, 1, 4, 20);
    });

    this.blocks['military_tent'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1a2e05';
      ctx.fillRect(2, 6, 28, 24);
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(3, 8, 26, 20);
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(14, 4, 4, 24);
      ctx.fillStyle = '#090c10';
      ctx.fillRect(12, 18, 8, 10);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(6, 10, 4, 3);
    });

    this.blocks['gas_pump'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(5, 24, 22, 6);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(7, 4, 18, 21);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(9, 6, 14, 7);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(10, 7, 12, 4);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(9, 15, 14, 2);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(24, 9, 4, 12);
      ctx.fillRect(22, 9, 3, 3);
    });

    this.blocks['luxury_sofa'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(2, 6, 28, 22);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(3, 8, 26, 16);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(5, 13, 22, 10);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(2, 6, 28, 3);
      ctx.fillRect(2, 10, 4, 14);
      ctx.fillRect(26, 10, 4, 14);
      ctx.fillRect(15, 14, 2, 8);
    });

    this.blocks['marble_pillar'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(4, 2, 24, 28);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(7, 3, 18, 26);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(10, 6, 2, 20);
      ctx.fillRect(15, 6, 2, 20);
      ctx.fillRect(20, 6, 2, 20);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(4, 2, 24, 4);
      ctx.fillRect(4, 26, 24, 4);
    });

    this.blocks['gold_statue'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(4, 22, 24, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6, 19, 20, 4);
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(10, 7, 12, 13);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(7, 8, 18, 5);
      ctx.fillRect(12, 2, 8, 7);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(14, 4, 4, 3);
      ctx.fillRect(9, 9, 4, 3);
      ctx.fillRect(19, 9, 4, 3);
    });

    this.blocks['grand_piano'] = this.makeCanvas(32, 32, (ctx) => {
      ctx.fillStyle = '#090c10';
      ctx.fillRect(3, 4, 26, 20);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(5, 5, 22, 14);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(3, 4, 26, 2);
      ctx.fillRect(6, 24, 3, 5);
      ctx.fillRect(23, 24, 3, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 19, 20, 5);
      ctx.fillStyle = '#0f172a';
      for (let kx = 8; kx <= 22; kx += 4) ctx.fillRect(kx, 19, 2, 3);
    });
  }
}
