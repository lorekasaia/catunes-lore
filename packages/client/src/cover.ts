// Cover art for the playing track: YouTube's thumbnail (i.ytimg.com — the
// image CDN, not the rate-limited extraction API), decoded with jpeg-js (pure
// JS, so it works on Termux too), cropped to the panel's shape and box-filtered
// down to a few dozen "pixels". Also derives an accent colour from it.

import jpeg from "jpeg-js";
import { youtubeId } from "./playlist.ts";
import type { Theme } from "./theme.ts";

export interface Cover {
  w: number; // pixel columns
  h: number; // pixel rows
  rgb: Uint8Array; // w*h*3
  theme: Theme; // colours picked from the image
}

const cache = new Map<string, Promise<Cover | null>>();

/** Cover for a track URL (null if it has none or it can't be fetched). Cached. */
export function getCover(url: string, w: number, h: number): Promise<Cover | null> {
  const key = `${url}|${w}x${h}`;
  let p = cache.get(key);
  if (!p) {
    p = loadCover(url, w, h).catch(() => null);
    cache.set(key, p);
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
  }
  return p;
}

async function loadCover(url: string, w: number, h: number): Promise<Cover | null> {
  const id = youtubeId(url);
  if (!id) return null;
  const res = await fetch(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const img = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true, formatAsRGBA: true });
  return fromRgba(img.data, img.width, img.height, w, h);
}

/** Pure: crop (centered, to w:h) + box-filter RGBA down to w×h RGB, plus colours. */
export function fromRgba(data: Uint8Array, iw: number, ih: number, w: number, h: number): Cover {
  // Crop to the target aspect ratio so nothing is squashed.
  const target = w / h;
  let cw = iw;
  let ch = ih;
  if (iw / ih > target) cw = Math.round(ih * target);
  else ch = Math.round(iw / target);
  const ox = Math.floor((iw - cw) / 2);
  const oy = Math.floor((ih - ch) / 2);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const y0 = oy + Math.floor((y * ch) / h);
    const y1 = Math.max(y0 + 1, oy + Math.floor(((y + 1) * ch) / h));
    for (let x = 0; x < w; x++) {
      const x0 = ox + Math.floor((x * cw) / w);
      const x1 = Math.max(x0 + 1, ox + Math.floor(((x + 1) * cw) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * iw + xx) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n++;
        }
      }
      const o = (y * w + x) * 3;
      rgb[o] = r / n;
      rgb[o + 1] = g / n;
      rgb[o + 2] = b / n;
    }
  }
  return { w, h, rgb, theme: themeFromPixels(rgb) };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function hsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
      .toString(16)
      .padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Pure: the image's dominant vivid hue → a readable theme (bright enough on a
 * dark terminal), with neighbouring hues for the spectrum. Greyish images
 * fall back to a soft neutral.
 */
export function themeFromPixels(rgb: Uint8Array): Theme {
  const bins = new Float64Array(24);
  for (let i = 0; i < rgb.length; i += 3) {
    const [h, s, l] = rgbToHsl(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!);
    if (l < 0.12 || l > 0.92) continue; // ignore near-black/white
    bins[Math.floor(h / 15) % 24]! += s * s; // favour saturated colours
  }
  let best = 0;
  for (let i = 1; i < 24; i++) if (bins[i]! > bins[best]!) best = i;
  const total = bins.reduce((a, b) => a + b, 0);
  if (total < (rgb.length / 3) * 0.02) {
    return { accent: "#c8c8d0", spectrum: ["#8a8a9a", "#c8c8d0", "#ffffff"] };
  }
  const hue = best * 15 + 7.5;
  return {
    accent: hsl(hue, 0.75, 0.62),
    spectrum: [hsl(hue - 25, 0.7, 0.5), hsl(hue, 0.8, 0.6), hsl(hue + 35, 0.85, 0.72)],
  };
}
