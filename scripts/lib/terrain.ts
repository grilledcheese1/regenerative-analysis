// Elevation from Mapbox Terrain-DEM v1 raster tiles ("Terrain-RGB"), decoded with node built-ins only.
// height (m) = -10000 + (R * 65536 + G * 256 + B) * 0.1
import { inflateSync } from "node:zlib";

const TILE = 512;
export const TERRAIN_ZOOM = 14; // highest zoom of mapbox-terrain-dem-v1, about 4.8 m per pixel at Austin

interface Tile {
  rgb: Uint8Array; // TILE * TILE * 3
}

/** Minimal non-interlaced 8-bit PNG decoder for RGB and RGBA images. */
export function decodePng(buf: Uint8Array): { width: number; height: number; rgb: Uint8Array } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8; // skip signature
  let width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0;
  const idat: Uint8Array[] = [];
  while (pos < buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType}, interlace ${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  if (bpp === 3) return { width, height, rgb: out };
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) rgb.set(out.subarray(i * 4, i * 4 + 3), i * 3);
  return { width, height, rgb };
}

function worldPixel(lon: number, lat: number, z: number): { x: number; y: number } {
  const size = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

export class TerrainSampler {
  private tiles = new Map<string, Promise<Tile>>(); // in-flight requests are shared, so a tile is fetched once
  private queue: Promise<unknown> = Promise.resolve(); // downloads run one at a time to stay under the rate limit
  private token: string;
  constructor(token: string) {
    this.token = token;
  }

  private tile(tx: number, ty: number): Promise<Tile> {
    const key = `${tx}/${ty}`;
    let p = this.tiles.get(key);
    if (!p) {
      p = this.queue.then(() => this.download(tx, ty));
      this.queue = p.catch(() => undefined);
      this.tiles.set(key, p);
    }
    return p;
  }

  private async download(tx: number, ty: number): Promise<Tile> {
    const url = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/${TERRAIN_ZOOM}/${tx}/${ty}@2x.pngraw?access_token=${this.token}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url);
      if (res.ok) {
        const png = decodePng(new Uint8Array(await res.arrayBuffer()));
        if (png.width !== TILE) throw new Error(`Terrain tile ${tx}/${ty}: expected ${TILE}px, got ${png.width}px`);
        return { rgb: png.rgb };
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 6) {
        // Wait for the reset time Mapbox reports (epoch seconds), else back off exponentially.
        const reset = Number(res.headers.get("x-rate-limit-reset"));
        const waitMs = res.status === 429 && reset > 0 ? Math.max(1000, reset * 1000 - Date.now() + 1000) : 2000 * 2 ** attempt;
        console.warn(`  terrain tile ${tx}/${ty}: HTTP ${res.status}, waiting ${Math.round(waitMs / 1000)} s`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(`Terrain tile ${tx}/${ty}: HTTP ${res.status}`);
    }
  }

  private heightAt(t: Tile, px: number, py: number): number {
    const i = (Math.min(TILE - 1, Math.max(0, py)) * TILE + Math.min(TILE - 1, Math.max(0, px))) * 3;
    return -10000 + (t.rgb[i] * 65536 + t.rgb[i + 1] * 256 + t.rgb[i + 2]) * 0.1;
  }

  /** Bilinear elevation (m) at a coordinate. */
  async elevation(lon: number, lat: number): Promise<number> {
    const w = worldPixel(lon, lat, TERRAIN_ZOOM);
    const gx = w.x - 0.5, gy = w.y - 0.5; // pixel centers
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const at = async (x: number, y: number) => {
      const tile = await this.tile(Math.floor(x / TILE), Math.floor(y / TILE));
      return this.heightAt(tile, ((x % TILE) + TILE) % TILE, ((y % TILE) + TILE) % TILE);
    };
    const [a, b, c, d] = await Promise.all([at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)]);
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
}
