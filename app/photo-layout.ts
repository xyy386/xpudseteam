import type { CSSProperties } from "react";
import type { PhotoLayout } from "./content";

const gap = 1.7;
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function gridLayouts(count: number): PhotoLayout[] {
  if (!count) return [];
  const columns = count === 1 ? 1 : count === 2 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  const width = (100 - gap * (columns + 1)) / columns;
  const height = (100 - gap * (rows + 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: gap + (index % columns) * (width + gap),
    y: gap + Math.floor(index / columns) * (height + gap),
    w: width,
    h: height,
  }));
}

export function mobileGridLayouts(count: number): PhotoLayout[] {
  if (!count) return [];
  const columns = count <= 3 ? 1 : 2;
  const rows = Math.ceil(count / columns);
  const width = (100 - gap * (columns + 1)) / columns;
  const height = (100 - gap * (rows + 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: gap + (index % columns) * (width + gap),
    y: gap + Math.floor(index / columns) * (height + gap),
    w: width,
    h: height,
  }));
}

export function featureLayouts(count: number): PhotoLayout[] {
  if (count < 2) return gridLayouts(count);
  const rest = count - 1;
  const columns = rest < 3 ? 1 : 2;
  const rows = Math.ceil(rest / columns);
  const width = (49 - gap * (columns + 1)) / columns;
  const height = (100 - gap * (rows + 1)) / rows;
  return [
    { x: gap, y: gap, w: 49 - gap * 1.5, h: 100 - gap * 2 },
    ...Array.from({ length: rest }, (_, index) => ({
      x: 51 + gap + (index % columns) * (width + gap),
      y: gap + Math.floor(index / columns) * (height + gap),
      w: width,
      h: height,
    })),
  ];
}

export function safeLayout(layout: PhotoLayout | undefined, fallback: PhotoLayout): PhotoLayout {
  if (!layout || ![layout.x, layout.y, layout.w, layout.h].every(Number.isFinite)) return fallback;
  const w = Math.min(100, Math.max(14, layout.w));
  const h = Math.min(100, Math.max(14, layout.h));
  return { x: Math.min(100 - w, Math.max(0, layout.x)), y: Math.min(100 - h, Math.max(0, layout.y)), w, h };
}

export function layoutStyle(layout: PhotoLayout): CSSProperties {
  return { left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.w}%`, height: `${layout.h}%` };
}

export function movePhoto(origin: PhotoLayout, dx: number, dy: number): PhotoLayout {
  return safeLayout({ ...origin, x: origin.x + dx, y: origin.y + dy }, origin);
}

export function resizePhoto(origin: PhotoLayout, handle: ResizeHandle, dx: number, dy: number): PhotoLayout {
  let { x, y, w, h } = origin;
  if (handle.includes("e")) w = Math.min(100 - x, Math.max(14, w + dx));
  if (handle.includes("s")) h = Math.min(100 - y, Math.max(14, h + dy));
  if (handle.includes("w")) {
    const right = x + w;
    x = Math.min(right - 14, Math.max(0, x + dx));
    w = right - x;
  }
  if (handle.includes("n")) {
    const bottom = y + h;
    y = Math.min(bottom - 14, Math.max(0, y + dy));
    h = bottom - y;
  }
  return safeLayout({ x, y, w, h }, origin);
}
