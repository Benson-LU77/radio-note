/**
 * City renderer — native pixel art on Canvas 2D.
 * Everything is drawn in integer coordinates on a low-res virtual buffer
 * (~216 px tall), then integer-scaled to the device. The scale factor is
 * computed in DEVICE pixels so fractional DPRs never break the grid.
 * Palette: five greys + one amber — tonight's window light is the only
 * colour in the city.
 */

import type { Building } from "./layout";
import { CITY } from "./palette";

export type Camera = { x: number; scale: number };

export type RenderState = {
  buildings: Building[];
  camera: Camera;
  /** sweep centre as 0..1 of viewport width; < 0 = no sweep */
  sweep: number;
  /** draw-in progress 0..1 */
  intro: number;
  focus: string | null;
  matches: Set<string> | null;
  hover: string | null;
};

/** 1 floor = 4 virtual px — buildings grow storey by storey */
export const FLOOR = 4;

const P = CITY;

const OB_X = 3; // oblique offset, virtual px
const OB_Y = 2;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  const buffer = document.createElement("canvas");
  const bctx = buffer.getContext("2d");

  let S = 3; // device px per virtual px
  let vw = 320;
  let vh = 216;
  let dpr = 1;

  /** Bayer-dithered pattern tiles, one per (colour, level) pair we use */
  const patternCache = new Map<string, CanvasPattern>();
  function dither(color: string, level: number): CanvasPattern | string {
    if (!bctx) return color;
    const key = `${color}:${level}`;
    const hit = patternCache.get(key);
    if (hit) return hit;
    const tile = document.createElement("canvas");
    tile.width = 4;
    tile.height = 4;
    const tctx = tile.getContext("2d");
    if (!tctx) return color;
    tctx.fillStyle = color;
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        if (BAYER4[y][x] < level) tctx.fillRect(x, y, 1, 1);
      }
    }
    const pattern = bctx.createPattern(tile, "repeat");
    if (pattern) patternCache.set(key, pattern);
    return pattern ?? color;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const dw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const dh = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    S = Math.max(2, Math.floor(dh / 216));
    vw = Math.ceil(dw / S);
    vh = Math.floor(dh / S);
    if (buffer.width !== vw || buffer.height !== vh) {
      buffer.width = vw;
      buffer.height = vh;
    }
    if (canvas.width !== dw || canvas.height !== dh) {
      canvas.width = dw;
      canvas.height = dh;
    }
  }

  function groundY(): number {
    return Math.floor(vh * 0.78);
  }

  /** world → virtual px scale */
  function kScale(cam: Camera): number {
    return (cam.scale * dpr) / S;
  }

  function screenX(worldX: number, cam: Camera): number {
    return Math.round(vw / 2 + (worldX - cam.x) * kScale(cam));
  }

  function alphaTier(b: Building, state: RenderState): 0 | 1 | 2 {
    // 2 = full, 1 = dimmed (unfocused while writing), 0 = ghost (search miss)
    if (state.matches) return state.matches.has(b.file) ? 2 : 0;
    if (state.focus && state.focus !== b.file) return 1;
    return 2;
  }

  function draw(state: RenderState) {
    if (!ctx || !bctx) return;
    resize();
    const cam = state.camera;
    const k = kScale(cam);
    const gy = groundY();
    const sweepVx = state.sweep >= 0 ? Math.round(state.sweep * vw) : -1;

    bctx.imageSmoothingEnabled = false;
    bctx.fillStyle = P.sky;
    bctx.fillRect(0, 0, vw, vh);

    // ground
    bctx.fillStyle = P.far;
    bctx.fillRect(0, gy, vw, 1);
    bctx.fillStyle = dither(P.far, 4);
    bctx.fillRect(0, gy + 1, vw, vh - gy - 1);

    const count = state.buildings.length;
    for (let i = 0; i < count; i += 1) {
      const b = state.buildings[i];
      const x = screenX(b.x, cam);
      const w = Math.max(3, Math.round(b.w * k));
      if (x + w + OB_X + 2 < 0 || x - 2 > vw) continue;

      const start = 0.12 + (i / Math.max(1, count)) * 0.62;
      const riseT = Math.min(1, Math.max(0, (state.intro - start) / 0.26));
      const rise = 1 - (1 - riseT) ** 3;
      if (rise <= 0) continue;

      // storey-quantised height — growth lands floor by floor
      const h = Math.max(FLOOR, Math.round((b.h * k * rise) / FLOOR) * FLOOR);

      const tier = alphaTier(b, state);
      const isFocus = state.focus === b.file;
      const isHover = state.hover === b.file;
      const inSweep = sweepVx >= 0 && Math.abs(x + (w >> 1) - sweepVx) < vw * 0.07;

      if (tier === 0) {
        // search miss: ghost outline only
        bctx.fillStyle = dither(P.far, 6);
        bctx.fillRect(x, gy - h, w, h);
        continue;
      }

      const dimmed = tier === 1;
      const faceCol = dimmed ? P.far : inSweep || isHover ? P.top : P.face;
      const sideCol = dimmed ? P.sky : P.side;
      const topCol = dimmed ? P.face : inSweep || isHover || isFocus ? P.light : P.top;

      // side (right, oblique)
      bctx.fillStyle = sideCol;
      for (let d = 1; d <= OB_X; d += 1) {
        const dy = Math.round((d * OB_Y) / OB_X);
        bctx.fillRect(x + w - 1 + d, gy - h - dy, 1, h);
      }
      // top
      bctx.fillStyle = topCol;
      for (let d = 0; d <= OB_X; d += 1) {
        const dy = Math.round((d * OB_Y) / OB_X);
        bctx.fillRect(x + d, gy - h - dy - 1, w, 1);
      }
      // front face
      bctx.fillStyle = faceCol;
      bctx.fillRect(x, gy - h, w, h);
      // face edge highlight (left)
      if (!dimmed) {
        bctx.fillStyle = P.side;
        bctx.fillRect(x, gy - h, 1, h);
      }

      // windows — one per floor grid cell, seeded
      const rand = mulberry(b.seed);
      const cols = Math.max(1, Math.floor((w - 2) / 3));
      const floors = Math.floor(h / FLOOR);
      for (let f = 1; f < floors; f += 1) {
        for (let c = 0; c < cols; c += 1) {
          const r = rand();
          const on = r < 0.14 + b.lit * 0.3;
          if (!on) continue;
          const wx = x + 1 + c * 3 + 1;
          const wy = gy - f * FLOOR + 1;
          if (wx >= x + w - 1) continue;
          if (isFocus) {
            bctx.fillStyle = r < 0.1 ? P.amber : P.amberDim;
          } else {
            bctx.fillStyle = dimmed ? P.face : r < 0.06 ? P.bright : inSweep ? P.light : P.top;
          }
          bctx.fillRect(wx, wy, 1, 2);
        }
      }

      // focus: amber baseline under tonight's building
      if (isFocus) {
        bctx.fillStyle = P.amber;
        bctx.fillRect(x, gy + 2, w, 1);
      }

      // ground reflection — dithered, short
      if (!dimmed) {
        bctx.fillStyle = dither(isFocus ? P.amberDim : P.face, isFocus ? 6 : 4);
        bctx.fillRect(x, gy + 1, w, Math.min(6, Math.max(2, h >> 4)));
      }
    }

    // sweep afterglow — one dashed vertical trace
    if (sweepVx >= 0 && sweepVx < vw) {
      bctx.fillStyle = dither(P.light, 3);
      bctx.fillRect(sweepVx, 0, 1, gy);
    }

    // blit — integer scale, no smoothing
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buffer, 0, 0, vw, vh, 0, 0, vw * S, vh * S);
  }

  function hitTest(cssX: number, cssY: number, state: RenderState): string | null {
    const px = (cssX * dpr) / S;
    const py = (cssY * dpr) / S;
    const cam = state.camera;
    const k = kScale(cam);
    const gy = groundY();
    for (const b of state.buildings) {
      const x = screenX(b.x, cam);
      const w = Math.max(3, Math.round(b.w * k));
      const h = Math.max(FLOOR, Math.round((b.h * k) / FLOOR) * FLOOR);
      if (px >= x - 1 && px <= x + w + OB_X && py <= gy + 3 && py >= gy - h - OB_Y - 2) {
        return b.file;
      }
    }
    return null;
  }

  return { draw, resize, hitTest };
}
