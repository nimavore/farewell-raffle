import type { RemainingPrize } from "./types";

export type WheelSegment = RemainingPrize & {
  start: number; // degrees, 0 = top, clockwise
  end: number;
  mid: number;
  color: string;
};

const FILLER_COLORS = [
  "#38bdf8",
  "#f472b6",
  "#34d399",
  "#fb923c",
  "#a78bfa",
  "#facc15",
  "#22d3ee",
  "#fca5a5",
];

// Build proportional wheel segments from the remaining prize counts. One
// segment per prize type, sized by how many of that prize are still unclaimed.
export function buildSegments(prizes: RemainingPrize[]): WheelSegment[] {
  const totalCount = prizes.reduce((s, p) => s + p.count, 0);
  if (totalCount === 0) return [];

  let cursor = 0;
  let fillerIdx = 0;
  return prizes.map((p) => {
    const sweep = (p.count / totalCount) * 360;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    const color = p.isShirt
      ? "#7c5cff"
      : p.isNoPrize
        ? "#4b5563"
        : FILLER_COLORS[fillerIdx++ % FILLER_COLORS.length];
    return { ...p, start, end, mid: (start + end) / 2, color };
  });
}

function polar(angleDeg: number, r: number, cx = 50, cy = 50) {
  const a = ((angleDeg - 90) * Math.PI) / 180; // 0deg = top, clockwise
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

// SVG arc path for a pie segment.
export function segmentPath(start: number, end: number, r = 46): string {
  const p1 = polar(start, r);
  const p2 = polar(end, r);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M 50 50 L ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} Z`;
}

export function labelPos(mid: number, r = 30) {
  return polar(mid, r);
}

// Given the wheel's current rotation, compute a new (larger) rotation that
// lands the winning segment under the top pointer. `power` (0..1) scales how
// many turns it makes.
export function landingRotation(
  currentRotation: number,
  seg: WheelSegment,
  power: number
): number {
  const turns = 4 + power * 6;
  // Pick a point inside the segment (padded from the edges) for a natural stop.
  const pad = Math.min((seg.end - seg.start) * 0.2, 8);
  const target = seg.start + pad + Math.random() * (seg.end - seg.start - 2 * pad);

  let next = currentRotation + turns * 360;
  // A point at local angle `target` appears under the top pointer when the
  // rotation ≡ -target (mod 360).
  const delta = (((-target - next) % 360) + 360) % 360;
  next += delta;
  return next;
}
