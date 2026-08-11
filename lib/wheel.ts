import type { RemainingPrize } from "./types";

export type WheelSegment = RemainingPrize & {
  key: string; // unique per slice (prize names repeat across slices)
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

// Blend a hex color toward white by `amt` (0..1) so adjacent same-prize slices
// are visually distinct.
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, "0")}`;
}

// Build the wheel as one equal-sized slice per remaining prize slot, so 6
// shirts show as 6 shirt slices, etc. The wheel shrinks slot-by-slot as prizes
// are claimed. Adjacent slices of the same prize alternate shade to stay
// readable.
export function buildSegments(prizes: RemainingPrize[]): WheelSegment[] {
  const totalCount = prizes.reduce((s, p) => s + p.count, 0);
  if (totalCount === 0) return [];

  const slice = 360 / totalCount;
  const segs: WheelSegment[] = [];
  let cursor = 0;
  let fillerIdx = 0;

  for (const p of prizes) {
    const base = p.isShirt
      ? "#7c5cff"
      : p.isNoPrize
        ? "#4b5563"
        : FILLER_COLORS[fillerIdx++ % FILLER_COLORS.length];

    for (let i = 0; i < p.count; i++) {
      const start = cursor;
      const end = cursor + slice;
      cursor = end;
      segs.push({
        ...p,
        key: `${p.prizeName}#${i}`,
        start,
        end,
        mid: (start + end) / 2,
        color: i % 2 === 0 ? base : lighten(base, 0.16),
      });
    }
  }
  return segs;
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
