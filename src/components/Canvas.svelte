<script lang="ts">
  import { onMount } from "svelte";
  import { SimGrid } from "../sim/grid";
  import { PixiStage } from "../render/PixiStage";
  import { BrushShape, MaterialId, type DragBlob } from "../sim/types";
  import { SINGLE_DROP_MATERIALS } from "../sim/materials";
  import type { MapSnapshot } from "../sim/storage";

  /** Fixed row count; column count is derived from the container's actual aspect ratio at mount (see onMount) so the sim grid always exactly fills the box instead of letterboxing on whichever axis the window happens to be wider or narrower on. */
  const GRID_H = 216;
  const MIN_GRID_W = 240;
  const MAX_GRID_W = 640;

  interface Props {
    selectedMaterial: MaterialId;
    brushSize: number;
    brushShape: BrushShape;
    paused?: boolean;
    gravityOn?: boolean;
    onCount?: (count: number) => void;
    onTemperature?: (celsius: number) => void;
  }
  let { selectedMaterial, brushSize, brushShape, paused = false, gravityOn = true, onCount, onTemperature }: Props = $props();

  let container: HTMLDivElement;
  let grid: SimGrid | undefined;
  let stage: PixiStage | undefined;
  let pointerDown = false;
  let startCell: [number, number] | null = null;
  let lastCell: [number, number] | null = null;
  // The Line brush is a two-click tool: the first click drops this anchor,
  // the second paints the segment from it. Held between clicks (not while a
  // button is down), so a hovering cursor previews where the line will land.
  let lineAnchor = $state<[number, number] | null>(null);

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
    const cs = stage.cellSize;
    const box = stage.spriteBox;
    return {
      cx: box.x + (hoverCell[0] + 0.5) * cs,
      cy: box.y + (hoverCell[1] + 0.5) * cs,
      r: Math.max(cs * 0.6, (singleDrop ? 0.5 : brushSize / 2) * cs),
    };
  });

  // Switching away from the Line brush drops any pending anchor.
  $effect(() => {
    if (brushShape !== BrushShape.Line) cancelLine();
  });

  function cancelLine(): void {
    lineAnchor = null;
    previewStart = null;
    previewCurrent = null;
  }
  // O povo drop one per click, whatever the brush — so no painting on drag,
  // no painting while the pointer is held still, and a shape brush just
  // drops one at the press point on release.
  const singleDrop = $derived(SINGLE_DROP_MATERIALS.includes(selectedMaterial));

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
        if (pointerDown && brushShape === BrushShape.Point && lastCell && !singleDrop) {
          localGrid.paint(lastCell[0], lastCell[1], radiusFromSize(brushSize), selectedMaterial);
        }
        s.renderFrame();
        // The counter is a stat display, not something that needs to be
        // exact to the frame — updating it 60x/sec would just churn Svelte
        // reactivity for no visible benefit.
        frame++;
        if (frame % 10 === 0) {
          onCount?.(s.activeCellCount);
          onTemperature?.(localGrid.temperature);
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

  function onPointerDown(e: PointerEvent): void {
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell || !grid) return;

    // Right-click with the Alavanca tool flips whatever's under the cursor
    // on/off instead of painting — never places or erases anything, so it's
    // a no-op over empty ground or any other material.
    if (e.button === 2 && selectedMaterial === MaterialId.Lever) {
      grid.toggleLever(cell[0], cell[1]);
      return;
    }

    const p = localPoint(e.clientX, e.clientY);

    // Line: two clicks. First sets the anchor, second draws the segment.
    if (brushShape === BrushShape.Line) {
      if (e.button === 2) { cancelLine(); return; } // right-click aborts
      if (!lineAnchor) {
        lineAnchor = cell;
        previewStart = p;
        previewCurrent = p;
      } else {
        grid.paintLine(lineAnchor[0], lineAnchor[1], cell[0], cell[1], radiusFromSize(brushSize), selectedMaterial);
        cancelLine();
      }
      return;
    }

    pointerDown = true;
    startCell = cell;
    lastCell = cell;
    if (brushShape === BrushShape.Point) {
      grid.paint(cell[0], cell[1], radiusFromSize(brushSize), selectedMaterial);
    } else if (brushShape === BrushShape.Drag) {
      dragBlob = grid.pickUpBlob(cell[0], cell[1], radiusFromSize(brushSize));
    } else {
      previewStart = p;
      previewCurrent = p;
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!grid) return;
    hoverCell = cellAt(e.clientX, e.clientY);
    // Line: preview follows the hovering cursor between the two clicks.
    if (brushShape === BrushShape.Line) {
      if (lineAnchor) previewCurrent = localPoint(e.clientX, e.clientY);
      return;
    }
    if (!pointerDown) return;
    const cell = hoverCell;
    if (brushShape === BrushShape.Drag) {
      if (dragBlob && cell) grid.moveBlob(dragBlob, cell[0], cell[1]);
    } else if (brushShape === BrushShape.Point) {
      if (cell && lastCell && !singleDrop) {
        grid.paintLine(lastCell[0], lastCell[1], cell[0], cell[1], radiusFromSize(brushSize), selectedMaterial);
      }
    } else {
      previewCurrent = localPoint(e.clientX, e.clientY);
    }
    if (cell) lastCell = cell;
  }

  function onPointerUp(e: PointerEvent): void {
    if (brushShape === BrushShape.Line) return; // two-click tool, handled in onPointerDown
    if (brushShape === BrushShape.Drag) {
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
    if (pointerDown && grid && startCell) {
      const end = cellAt(e.clientX, e.clientY) ?? lastCell;
      if (end) {
        if (brushShape === BrushShape.Square) {
          grid.paintRect(startCell[0], startCell[1], end[0], end[1], selectedMaterial);
        } else if (brushShape === BrushShape.Circle) {
          // Drag a bounding box, same as the square brush — the circle fills
          // it (start and end sit on opposite ends of a diameter), so it
          // grows toward the cursor instead of ballooning out behind the
          // press point.
          const cx = (startCell[0] + end[0]) / 2;
          const cy = (startCell[1] + end[1]) / 2;
          const radius = Math.max(1, Math.round(Math.hypot(end[0] - startCell[0], end[1] - startCell[1]) / 2));
          grid.paint(Math.round(cx), Math.round(cy), radius, selectedMaterial);
        }
      }
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
    if (e.key === "Escape") cancelLine();
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
  oncontextmenu={(e) => {
    if (brushShape === BrushShape.Line || selectedMaterial === MaterialId.Lever) e.preventDefault();
  }}
>
  {#if cursorRing || (showsPreview && previewStart && previewCurrent)}
    <svg class="preview-overlay">
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

  .preview-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
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
  .preview-overlay circle.cursor-dot {
    stroke: none;
    fill: rgba(255, 255, 255, 0.9);
  }
  .preview-overlay circle.cursor-dot.erase { fill: rgba(255, 96, 96, 0.95); }
  .preview-overlay circle.cursor-dot.drag { fill: rgba(120, 190, 255, 0.95); }
</style>
