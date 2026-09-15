<script lang="ts">
  import { onMount } from "svelte";
  import { SimGrid, FIXED_SHAPES } from "../sim/grid";
  import { PixiStage } from "../render/PixiStage";
  import { BrushShape, MaterialId, type DragBlob } from "../sim/types";
  import { SINGLE_DROP_MATERIALS } from "../sim/materials";
  import type { MapSnapshot } from "../sim/storage";
  import { computeGridOverlay, snapToOverlay } from "../sim/gridOverlay";
  import { showGrid, snapToGrid, gridSpacing } from "../settings.svelte";

  /** Fixed row count; column count is derived from the container's actual aspect ratio at mount (see onMount) so the sim grid always exactly fills the box instead of letterboxing on whichever axis the window happens to be wider or narrower on. */
  const GRID_H = 216;
  const MIN_GRID_W = 240;
  const MAX_GRID_W = 640;

  interface Props {
    selectedMaterial: MaterialId;
    secondaryMaterial: MaterialId;
    secondaryIsDrag: boolean;
    brushSize: number;
    brushShape: BrushShape;
    paused?: boolean;
    gravityOn?: boolean;
    onCount?: (count: number) => void;
    onTemperature?: (celsius: number) => void;
    onFps?: (fps: number) => void;
  }
  let {
    selectedMaterial, secondaryMaterial, secondaryIsDrag, brushSize, brushShape, paused = false, gravityOn = true,
    onCount, onTemperature, onFps,
  }: Props = $props();

  /** Which material the Point brush is actually laying down for the button
   * currently held — the left button paints `selectedMaterial`, the right
   * one paints `secondaryMaterial` (mirrors a paint program's foreground/
   * background color pair). Set once on pointer-down and read for the rest
   * of that stroke, including the "keep painting while the pointer sits
   * still" tick below. */
  let paintMaterial: MaterialId = MaterialId.Sand;
  const isSingleDrop = (id: MaterialId) => SINGLE_DROP_MATERIALS.includes(id);
  /** Whether the stroke currently held down is a drag (pick up/move a blob)
   * rather than painting — decided once on pointer-down from whichever
   * button was pressed (the left button follows `brushShape`, the right one
   * follows `secondaryIsDrag` independently), then read for the rest of that
   * gesture so switching tools mid-stroke can't change what's already happening. */
  let activeIsDrag = false;

  let container: HTMLDivElement;
  let grid: SimGrid | undefined;
  let stage: PixiStage | undefined;
  let pointerDown = false;
  let startCell: [number, number] | null = null;
  let lastCell: [number, number] | null = null;
  // Line, Square and Circle are all two-click tools: the first click drops
  // this anchor, the second commits the shape from it (a segment, a
  // rectangle, a circle). Held between clicks (not while a button is down),
  // so a hovering cursor previews where the shape will land.
  let shapeAnchor = $state<[number, number] | null>(null);
  const isShapeTool = (s: BrushShape) => s === BrushShape.Line || s === BrushShape.Square || s === BrushShape.Circle;

  // Screen-space (relative to container) points driving the dashed preview
  // guide for the line/square/circle brushes — kept separate from the grid
  // cell coordinates above since the SVG overlay draws in pixels, not cells.
  let previewStart = $state<{ x: number; y: number } | null>(null);
  let previewCurrent = $state<{ x: number; y: number } | null>(null);
  const showsPreview = $derived(
    brushShape === BrushShape.Line || brushShape === BrushShape.Square || brushShape === BrushShape.Circle,
  );
  // The clump the drag tool is currently carrying, if any.
  let dragBlob: DragBlob | null = null;

  // Where the pointer is hovering, in grid cells — drives the ring that shows
  // how much ground the current tool would cover (the eraser, the drag pickup,
  // and the point brush all paint/lift a disc sized by the slider).
  let hoverCell = $state<[number, number] | null>(null);
  let frameTick = $state(0); // bumped each rendered frame so the ring re-reads cellSize after a resize
  const cursorRing = $derived.by(() => {
    void frameTick;
    if (!hoverCell || !stage || (pointerDown && showsPreview)) return null;
    if (FIXED_SHAPES[selectedMaterial]) return null; // shapeOutline below takes over for these
    const cs = stage.cellSize;
    const box = stage.spriteBox;
    return {
      cx: box.x + (hoverCell[0] + 0.5) * cs,
      cy: box.y + (hoverCell[1] + 0.5) * cs,
      r: Math.max(cs * 0.6, (singleDrop ? 0.5 : brushSize / 2) * cs),
    };
  });

  /**
   * For a material that stamps a fixed multi-cell footprint (Alavanca, Torre
   * de defesa) — the exact silhouette it'll actually land as, traced as a
   * clean outline (not a grid of individual cell borders) so the player can
   * see the real size and position before committing, the same anchor
   * `grid.findShapeAnchor` would actually place at. Turns red instead of the
   * usual paint-white when nothing in range is clear enough to fit it.
   */
  const shapeOutline = $derived.by(() => {
    void frameTick;
    if (!hoverCell || !stage || !grid) return null;
    const shape = FIXED_SHAPES[selectedMaterial];
    if (!shape) return null;
    const anchor = grid.findShapeAnchor(selectedMaterial, hoverCell[0], hoverCell[1]);
    const [originX, originY] = anchor ?? hoverCell;
    const cs = stage.cellSize;
    const box = stage.spriteBox;
    const px = (gx: number, gy: number) => `${box.x + gx * cs} ${box.y + gy * cs}`;
    const cellSet = new Set(shape.map(([x, y]) => `${x},${y}`));
    let d = "";
    for (const [x, y] of shape) {
      // One boundary edge per side that's NOT shared with another cell of
      // the same shape — collectively, exactly the silhouette's contour.
      if (!cellSet.has(`${x},${y - 1}`)) d += `M${px(originX + x, originY + y)} L${px(originX + x + 1, originY + y)} `;
      if (!cellSet.has(`${x},${y + 1}`)) d += `M${px(originX + x, originY + y + 1)} L${px(originX + x + 1, originY + y + 1)} `;
      if (!cellSet.has(`${x - 1},${y}`)) d += `M${px(originX + x, originY + y)} L${px(originX + x, originY + y + 1)} `;
      if (!cellSet.has(`${x + 1},${y}`)) d += `M${px(originX + x + 1, originY + y)} L${px(originX + x + 1, originY + y + 1)} `;
    }
    return { d, blocked: !anchor };
  });

  /** The reference grid's own line positions (in cells) for the current map size and picked spacing — see settings.svelte.ts / sim/gridOverlay.ts. Recomputed only from grid size and spacing, not on every hover. */
  const gridOverlay = $derived.by(() => {
    if (!grid) return null;
    return computeGridOverlay(grid.width, grid.height, gridSpacing());
  });

  /** Screen-space grid lines to actually draw, converted from cells once stage/frameTick are known — null while the toggle is off. */
  const gridOverlayLines = $derived.by(() => {
    void frameTick;
    if (!showGrid() || !stage || !gridOverlay) return null;
    const cs = stage.cellSize;
    const box = stage.spriteBox;
    return {
      vertical: gridOverlay.verticalLines.map((x) => box.x + x * cs),
      horizontal: gridOverlay.horizontalLines.map((y) => box.y + y * cs),
      x0: box.x + gridOverlay.minX * cs,
      x1: box.x + gridOverlay.maxX * cs,
      y0: box.y + gridOverlay.minY * cs,
      y1: box.y + gridOverlay.maxY * cs,
    };
  });

  /** Snaps a cell to the reference grid when the toggle is on, or passes it through unchanged otherwise — null if snapping is on and the point falls in the unpaintable margin outside the grid's exact fit (see sim/gridOverlay.ts). */
  function snappedCell(cell: [number, number] | null): [number, number] | null {
    if (!cell || !snapToGrid() || !grid) return cell;
    return snapToOverlay(gridOverlay ?? computeGridOverlay(grid.width, grid.height, gridSpacing()), cell[0], cell[1]);
  }

  // Switching away from a two-click shape tool drops any pending anchor.
  $effect(() => {
    if (!isShapeTool(brushShape)) cancelShape();
  });

  function cancelShape(): void {
    shapeAnchor = null;
    previewStart = null;
    previewCurrent = null;
  }
  // O povo drop one per click, whatever the brush — so no painting on drag,
  // no painting while the pointer is held still, and a shape brush just
  // drops one at the press point on release.
  const singleDrop = $derived(isSingleDrop(selectedMaterial));

  export function clear(): void {
    grid?.reset();
  }

  /** Current grid contents, for saving/exporting — null until the sim is mounted. */
  export function snapshot(): MapSnapshot | null {
    return grid?.serialize() ?? null;
  }

  /** Replaces the grid with a saved/imported map. */
  export function loadMap(snap: MapSnapshot): void {
    grid?.load(snap);
  }

  onMount(() => {
    let destroyed = false;
    const rect = container.getBoundingClientRect();
    const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
    const gridW = Math.round(Math.min(MAX_GRID_W, Math.max(MIN_GRID_W, GRID_H * aspect)));
    grid = new SimGrid(gridW, GRID_H);
    const localGrid = grid;

    PixiStage.create(container, localGrid).then((s) => {
      if (destroyed) {
        s.app.destroy(true, { children: true });
        return;
      }
      stage = s;
      let frame = 0;
      s.app.ticker.add(() => {
        localGrid.gravityEnabled = gravityOn;
        // When paused the simulation is frozen — no falling, no reactions,
        // no particles — but painting still works so the player can keep
        // building and positioning elements. Releasing pause resumes from
        // exactly the state left on screen.
        if (!paused) {
          localGrid.step();
        }
        // Keeps emitting while the pointer is held still — otherwise a
        // brush parked over a spot that just freed up (e.g. sand falling
        // out from under it) stays dry until the pointer actually moves.
        if (pointerDown && !activeIsDrag && lastCell && !isSingleDrop(paintMaterial)) {
          localGrid.paint(lastCell[0], lastCell[1], radiusFromSize(brushSize), paintMaterial);
        }
        s.renderFrame();
        // The counter is a stat display, not something that needs to be
        // exact to the frame — updating it 60x/sec would just churn Svelte
        // reactivity for no visible benefit.
        frame++;
        if (frame % 10 === 0) {
          onCount?.(s.activeCellCount);
          onTemperature?.(localGrid.temperature);
          onFps?.(Math.round(s.app.ticker.FPS));
          if (hoverCell) frameTick = frame; // keep the brush ring sized right through a resize
        }
      });
    });

    return () => {
      destroyed = true;
      stage?.app.destroy(true, { children: true });
    };
  });

  /** Brush "size" is a 1-10 diameter, so size 1 always paints exactly one cell. */
  function radiusFromSize(size: number): number {
    return (size - 1) / 2;
  }

  function cellAt(clientX: number, clientY: number): [number, number] | null {
    if (!stage) return null;
    const rect = container.getBoundingClientRect();
    return stage.pointerToCell(clientX - rect.left, clientY - rect.top);
  }

  function localPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /** Commits the shape brush currently selected from `anchor` to `end` — a segment, a filled rectangle, or a circle (anchor/end sit on opposite ends of its diameter, so it grows toward the cursor instead of ballooning out behind the first click). */
  function commitShape(anchor: [number, number], end: [number, number]): void {
    if (!grid) return;
    if (brushShape === BrushShape.Line) {
      grid.paintLine(anchor[0], anchor[1], end[0], end[1], radiusFromSize(brushSize), selectedMaterial);
    } else if (brushShape === BrushShape.Square) {
      grid.paintRect(anchor[0], anchor[1], end[0], end[1], selectedMaterial);
    } else if (brushShape === BrushShape.Circle) {
      const cx = (anchor[0] + end[0]) / 2;
      const cy = (anchor[1] + end[1]) / 2;
      const radius = Math.max(1, Math.round(Math.hypot(end[0] - anchor[0], end[1] - anchor[1]) / 2));
      grid.paint(Math.round(cx), Math.round(cy), radius, selectedMaterial);
    }
  }

  function onPointerDown(e: PointerEvent): void {
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell || !grid) return;

    // Right-click on a placed Alavanca flips it on/off, and on a Ventilador
    // flips which way it blows, whatever tool is currently selected — a
    // switch anyone can reach without first swapping back to that brush.
    // Over empty ground or any other material it's a no-op, and the click
    // falls through to its usual meaning for whatever tool is selected (a
    // shape tool's right-click abort, mainly). Deliberately checked against
    // the raw cell, not the grid-snapped one — toggling something that's
    // already placed shouldn't be constrained by the grid at all.
    if (e.button === 2 && (grid.toggleLever(cell[0], cell[1]) || grid.toggleFan(cell[0], cell[1]))) return;

    const p = localPoint(e.clientX, e.clientY);

    // Line/Square/Circle: two clicks, whichever button starts them — the
    // right button still just aborts a pending anchor here, same as always.
    // The primary/secondary button split below is only for the immediate
    // tools (Point/Drag), which is why this has to come first.
    if (isShapeTool(brushShape)) {
      if (e.button === 2) { cancelShape(); return; } // right-click aborts
      const target = snappedCell(cell);
      if (!target) return; // snapping is on and this point falls outside the grid's exact fit
      if (!shapeAnchor) {
        shapeAnchor = target;
        previewStart = p;
        previewCurrent = p;
      } else {
        commitShape(shapeAnchor, target);
        cancelShape();
      }
      return;
    }

    // Which action this button press performs: the left button follows
    // whatever tool is currently selected, the right one follows its own
    // independent secondary choice (paint a material, or drag) — set once
    // here and read for the rest of the gesture.
    activeIsDrag = e.button === 2 ? secondaryIsDrag : brushShape === BrushShape.Drag;

    // Drag never snaps — repositioning an existing clump needs full
    // precision regardless of the reference grid, which is there to help
    // placing new material, not to lock an already-placed one to it.
    if (activeIsDrag) {
      pointerDown = true;
      startCell = cell;
      lastCell = cell;
      dragBlob = grid.pickUpBlob(cell[0], cell[1], radiusFromSize(brushSize));
      return;
    }

    const target = snappedCell(cell);
    if (!target) return;
    pointerDown = true;
    startCell = target;
    lastCell = target;
    paintMaterial = e.button === 2 ? secondaryMaterial : selectedMaterial;
    grid.paint(target[0], target[1], radiusFromSize(brushSize), paintMaterial);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!grid) return;
    const raw = cellAt(e.clientX, e.clientY);
    const dragHover = pointerDown ? activeIsDrag : brushShape === BrushShape.Drag;
    hoverCell = dragHover ? raw : snappedCell(raw);
    // Line/Square/Circle: preview follows the hovering cursor between the
    // two clicks.
    if (isShapeTool(brushShape)) {
      if (shapeAnchor) previewCurrent = localPoint(e.clientX, e.clientY);
      return;
    }
    if (!pointerDown) return;
    const cell = hoverCell;
    if (activeIsDrag) {
      if (dragBlob && cell) grid.moveBlob(dragBlob, cell[0], cell[1]);
    } else if (cell && lastCell && !isSingleDrop(paintMaterial)) {
      grid.paintLine(lastCell[0], lastCell[1], cell[0], cell[1], radiusFromSize(brushSize), paintMaterial);
    }
    if (cell) lastCell = cell;
  }

  function onPointerUp(e: PointerEvent): void {
    if (isShapeTool(brushShape)) return; // two-click tool, handled in onPointerDown
    if (activeIsDrag) {
      if (dragBlob && grid) {
        const end = cellAt(e.clientX, e.clientY) ?? lastCell;
        if (end) grid.dropBlob(dragBlob, end[0], end[1]);
      }
      dragBlob = null;
      pointerDown = false;
      startCell = null;
      lastCell = null;
      return;
    }
    pointerDown = false;
    startCell = null;
    lastCell = null;
    previewStart = null;
    previewCurrent = null;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") cancelShape();
  }}
/>

<div
  bind:this={container}
  class="canvas-host"
  role="application"
  aria-label="Área de simulação"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointerleave={(e) => { hoverCell = null; onPointerUp(e); }}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#if gridOverlayLines}
    <svg class="grid-overlay">
      {#each gridOverlayLines.vertical as x (x)}
        <line x1={x} y1={gridOverlayLines.y0} x2={x} y2={gridOverlayLines.y1} />
      {/each}
      {#each gridOverlayLines.horizontal as y (y)}
        <line x1={gridOverlayLines.x0} y1={y} x2={gridOverlayLines.x1} y2={y} />
      {/each}
    </svg>
  {/if}

  {#if cursorRing || shapeOutline || (showsPreview && previewStart && previewCurrent)}
    <svg class="preview-overlay">
      {#if shapeOutline}
        <path class="cursor shape {shapeOutline.blocked ? 'blocked' : 'paint'}" d={shapeOutline.d} />
      {/if}
      {#if cursorRing}
        {@const kind = brushShape === BrushShape.Drag ? "drag" : selectedMaterial === 0 ? "erase" : "paint"}
        <circle class="cursor {kind}" cx={cursorRing.cx} cy={cursorRing.cy} r={cursorRing.r} />
        <circle class="cursor-dot {kind}" cx={cursorRing.cx} cy={cursorRing.cy} r="1.5" />
      {/if}
      {#if showsPreview && previewStart && previewCurrent}
        {#if brushShape === BrushShape.Line}
          <line x1={previewStart.x} y1={previewStart.y} x2={previewCurrent.x} y2={previewCurrent.y} />
          <circle class="anchor" cx={previewStart.x} cy={previewStart.y} r="4" />
        {:else if brushShape === BrushShape.Square}
          <rect
            x={Math.min(previewStart.x, previewCurrent.x)}
            y={Math.min(previewStart.y, previewCurrent.y)}
            width={Math.abs(previewCurrent.x - previewStart.x)}
            height={Math.abs(previewCurrent.y - previewStart.y)}
          />
        {:else if brushShape === BrushShape.Circle}
          <circle
            cx={(previewStart.x + previewCurrent.x) / 2}
            cy={(previewStart.y + previewCurrent.y) / 2}
            r={Math.hypot(previewCurrent.x - previewStart.x, previewCurrent.y - previewStart.y) / 2}
          />
        {/if}
      {/if}
    </svg>
  {/if}
</div>

<style>
  .canvas-host {
    position: relative;
    width: 100%;
    height: 100%;
    touch-action: none;
    /* The brush ring is the cursor now — hide the native crosshair. */
    cursor: none;
  }

  .preview-overlay,
  .grid-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .grid-overlay line {
    stroke: rgba(255, 0, 0, 0.08);
    stroke-width: 1;
  }

  .preview-overlay line,
  .preview-overlay rect,
  .preview-overlay circle {
    fill: none;
    stroke: rgba(255, 64, 64, 0.75);
    stroke-width: 2;
    stroke-dasharray: 6 5;
  }

  .preview-overlay circle.anchor {
    fill: rgba(255, 64, 64, 0.9);
    stroke: none;
  }

  /* Live cursor ring — shows the area the current tool would cover. */
  .preview-overlay circle.cursor {
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
    opacity: 0.9;
  }
  .preview-overlay circle.cursor.paint {
    stroke: rgba(255, 255, 255, 0.85);
    fill: rgba(255, 255, 255, 0.06);
  }
  .preview-overlay circle.cursor.erase {
    stroke: rgba(255, 96, 96, 0.95);
    fill: rgba(255, 96, 96, 0.1);
  }
  .preview-overlay circle.cursor.drag {
    stroke: rgba(120, 190, 255, 0.95);
    fill: rgba(120, 190, 255, 0.1);
  }
  /* The traced silhouette of a fixed-shape piece (Alavanca, Torre de
     defesa) — a solid outline, not dashed, so it reads as "this exact shape
     lands here" rather than just a rough area like the plain cursor ring. */
  .preview-overlay path.cursor.shape {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    opacity: 0.95;
  }
  .preview-overlay path.cursor.shape.paint {
    stroke: rgba(255, 255, 255, 0.9);
  }
  .preview-overlay path.cursor.shape.blocked {
    stroke: rgba(255, 96, 96, 0.95);
  }

  .preview-overlay circle.cursor-dot {
    stroke: none;
    fill: rgba(255, 255, 255, 0.9);
  }
  .preview-overlay circle.cursor-dot.erase { fill: rgba(255, 96, 96, 0.95); }
  .preview-overlay circle.cursor-dot.drag { fill: rgba(120, 190, 255, 0.95); }
</style>
