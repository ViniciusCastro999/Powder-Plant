<script lang="ts">
  import { onMount } from "svelte";
  import { SimGrid } from "../sim/grid";
  import { PixiStage } from "../render/PixiStage";
  import { BrushShape, type MaterialId } from "../sim/types";
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
    onCount?: (count: number) => void;
    onTemperature?: (celsius: number) => void;
  }
  let { selectedMaterial, brushSize, brushShape, paused = false, onCount, onTemperature }: Props = $props();

  let container: HTMLDivElement;
  let grid: SimGrid | undefined;
  let stage: PixiStage | undefined;
  let pointerDown = false;
  let startCell: [number, number] | null = null;
  let lastCell: [number, number] | null = null;

  // Screen-space (relative to container) points driving the dashed preview
  // guide for the line/square/circle brushes — kept separate from the grid
  // cell coordinates above since the SVG overlay draws in pixels, not cells.
  let previewStart = $state<{ x: number; y: number } | null>(null);
  let previewCurrent = $state<{ x: number; y: number } | null>(null);
  const showsPreview = $derived(brushShape !== BrushShape.Point);
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
    pointerDown = true;
    startCell = cell;
    lastCell = cell;
    if (brushShape === BrushShape.Point) {
      grid.paint(cell[0], cell[1], radiusFromSize(brushSize), selectedMaterial);
    } else {
      const p = localPoint(e.clientX, e.clientY);
      previewStart = p;
      previewCurrent = p;
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pointerDown || !grid) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (brushShape === BrushShape.Point) {
      if (cell && lastCell && !singleDrop) {
        grid.paintLine(lastCell[0], lastCell[1], cell[0], cell[1], radiusFromSize(brushSize), selectedMaterial);
      }
    } else {
      previewCurrent = localPoint(e.clientX, e.clientY);
    }
    if (cell) lastCell = cell;
  }

  function onPointerUp(e: PointerEvent): void {
    if (pointerDown && grid && startCell) {
      const end = cellAt(e.clientX, e.clientY) ?? lastCell;
      if (end) {
        if (brushShape === BrushShape.Line) {
          grid.paintLine(startCell[0], startCell[1], end[0], end[1], radiusFromSize(brushSize), selectedMaterial);
        } else if (brushShape === BrushShape.Square) {
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

<div
  bind:this={container}
  class="canvas-host"
  role="application"
  aria-label="Área de simulação"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointerleave={onPointerUp}
>
  {#if showsPreview && previewStart && previewCurrent}
    <svg class="preview-overlay">
      {#if brushShape === BrushShape.Line}
        <line x1={previewStart.x} y1={previewStart.y} x2={previewCurrent.x} y2={previewCurrent.y} />
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
    </svg>
  {/if}
</div>

<style>
  .canvas-host {
    position: relative;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
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
</style>
