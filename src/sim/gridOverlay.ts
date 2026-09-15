/**
 * The reference grid the player can turn on in Options (see
 * settings.svelte.ts) — a perfectly centered set of vertical/horizontal
 * lines, `spacing` cells apart, used both to draw the overlay
 * (PixiStage.ts) and to snap painting to it (Canvas.svelte). Centered
 * exactly on the grid's own middle cell, growing outward by whole
 * squares: whatever doesn't divide evenly becomes an unpaintable margin
 * split evenly on the two far sides instead of a lopsided partial square,
 * so the grid — and, while snapping is on, the paintable area itself —
 * always "fits" the map exactly, however the window happens to be sized.
 */

export interface GridOverlay {
  /** Cell x-indices of every vertical line, left to right (always includes the exact center). */
  verticalLines: number[];
  /** Cell y-indices of every horizontal line, top to bottom. */
  horizontalLines: number[];
  spacing: number;
  /** The paintable region while snapping is on: [minX, maxX] × [minY, maxY], inclusive, both ends always themselves on a line. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function computeGridOverlay(width: number, height: number, spacing: number): GridOverlay {
  const axisLines = (size: number): { lines: number[]; min: number; max: number } => {
    const center = Math.floor(size / 2);
    const half = Math.floor(center / spacing) * spacing;
    const min = center - half;
    const max = center + half;
    const lines: number[] = [];
    for (let v = min; v <= max; v += spacing) lines.push(v);
    return { lines, min, max };
  };
  const x = axisLines(width);
  const y = axisLines(height);
  return { verticalLines: x.lines, horizontalLines: y.lines, spacing, minX: x.min, maxX: x.max, minY: y.min, maxY: y.max };
}

/**
 * Snaps (x, y) to the nearest grid-line intersection, clamped to the
 * overlay's paintable region — or null if snapping is on and the point
 * falls in the unpaintable margin outside it entirely.
 */
export function snapToOverlay(overlay: GridOverlay, x: number, y: number): [number, number] | null {
  if (x < overlay.minX || x > overlay.maxX || y < overlay.minY || y > overlay.maxY) return null;
  const sx = overlay.minX + Math.round((x - overlay.minX) / overlay.spacing) * overlay.spacing;
  const sy = overlay.minY + Math.round((y - overlay.minY) / overlay.spacing) * overlay.spacing;
  return [sx, sy];
}
