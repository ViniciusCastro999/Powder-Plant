<script lang="ts">
  import Icon from "./Icon.svelte";
  import { BrushShape, MaterialId } from "../sim/types";
  import { MATERIALS, PALETTE_CATEGORIES, ICON_BY_MATERIAL, type PaletteCategory } from "../sim/materials";
  import { COLD_1, COLD_2, COLD_3, PROSPEROUS_LOW, HOT_2, HOT_3, isProsperous } from "../sim/temperature";
  import { t, materialName, categoryLabel, intlLocale } from "../i18n";
  import { displayTemperature, temperatureUnit } from "../settings.svelte";
  import type { UIStrings } from "../i18n/ui";

  const SHAPES: { id: BrushShape; icon: string; labelKey: keyof UIStrings }[] = [
    { id: BrushShape.Point, icon: "point", labelKey: "shapePoint" },
    { id: BrushShape.Line, icon: "line", labelKey: "shapeLine" },
    { id: BrushShape.Square, icon: "square", labelKey: "shapeSquare" },
    { id: BrushShape.Circle, icon: "circle", labelKey: "shapeCircle" },
  ];

  interface Props {
    selected: MaterialId;
    secondarySelected: MaterialId;
    secondaryIsDrag: boolean;
    brushSize: number;
    brushShape: BrushShape;
    paused: boolean;
    gravityOn: boolean;
    pixelCount: number;
    temperature: number;
    fps: number;
    onclear: () => void;
    onmaps: () => void;
    onoptions: () => void;
  }
  let {
    selected = $bindable(),
    secondarySelected = $bindable(),
    secondaryIsDrag = $bindable(),
    brushSize = $bindable(),
    brushShape = $bindable(),
    paused = $bindable(),
    gravityOn = $bindable(),
    pixelCount,
    temperature,
    fps,
    onclear,
    onmaps,
    onoptions,
  }: Props = $props();

  /** Which category owns a given material, so the tab bar can show it as the "current" one. */
  function categoryOf(id: MaterialId): string {
    return PALETTE_CATEGORIES.find((c) => c.materials.includes(id))?.id ?? PALETTE_CATEGORIES[0].id;
  }
  let activeCategory = $state(categoryOf(selected));
  /** The category currently showing its material picker popup — every tab opens one, closes itself the moment a tile is picked, no separate close button needed. */
  let materialPopup = $state<{ cat: PaletteCategory; left: number } | null>(null);

  function openCategory(cat: PaletteCategory, buttonEl: HTMLElement): void {
    materialPopup = { cat, left: buttonEl.offsetLeft };
  }

  // The three tools (erase / drag / gravity) and painting a material are all
  // one "what does a click do" choice — picking one drops the others, so the
  // eraser and the drag brush can never both look active at once.
  let lastMaterial = $state(selected === MaterialId.Empty ? MaterialId.Sand : selected);

  function pick(id: MaterialId): void {
    selected = id;
    activeCategory = categoryOf(id);
    materialPopup = null;
    if (id !== MaterialId.Empty) {
      lastMaterial = id;
      if (brushShape === BrushShape.Drag) brushShape = BrushShape.Point;
    }
  }

  /** Right-click on a tile sets the secondary (right mouse button) material instead — like a paint program's background color — without closing the popup, so both can be picked from the same open list. Right-clicking Vírus specifically gives its rival, Vírus Rosa, instead of the same purple strain — that tile is the only way to ever reach the pink one. */
  function pickSecondary(e: MouseEvent, id: MaterialId): void {
    e.preventDefault();
    secondarySelected = id === MaterialId.Virus ? MaterialId.VirusPink : id;
    secondaryIsDrag = false;
  }

  /** Whether a tile's own right-click ring should light up — Vírus's tile lights up for its rival Vírus Rosa too, since that's the only place the pink strain is ever reached from. */
  function tileIsSecondary(id: MaterialId): boolean {
    if (secondarySelected === id) return true;
    return id === MaterialId.Virus && secondarySelected === MaterialId.VirusPink;
  }

  function selectErase(): void {
    selected = MaterialId.Empty;
    if (brushShape === BrushShape.Drag) brushShape = BrushShape.Point;
  }

  function selectDrag(): void {
    brushShape = BrushShape.Drag;
    if (selected === MaterialId.Empty) selected = lastMaterial;
  }

  /** Right-click the Erase tool: the right mouse button erases on the canvas instead of whatever it was painting. */
  function selectEraseSecondary(e: MouseEvent): void {
    e.preventDefault();
    secondarySelected = MaterialId.Empty;
    secondaryIsDrag = false;
  }

  /** Right-click the Drag tool: the right mouse button picks up/moves a blob, independent of whatever the left button is set to do. */
  function selectDragSecondary(e: MouseEvent): void {
    e.preventDefault();
    secondaryIsDrag = true;
  }

  /** How many 78px columns a material grid needs for `count` tiles, capped at 4 — an explicit count instead of `auto-fit` because an auto-fit grid inside a width:fit-content popup has no definite width to size against and collapses to a single column. Capped so a big category (the 6-material Pó group) wraps into more rows instead of stretching the popup wide. */
  function cols(count: number): number {
    return Math.min(4, Math.max(1, count));
  }

  function swatchStyle(id: MaterialId): string {
    const [r, g, b] = MATERIALS[id].color;
    return `--swatch: rgb(${r}, ${g}, ${b})`;
  }

  /** Neutral (non-material) swatch background for the dual indicator when a tool — not a material — is what's actually active for that button. */
  const TOOL_SWATCH = "--swatch: rgba(255, 255, 255, 0.14)";

  function primaryIcon(): string {
    if (brushShape === BrushShape.Drag) return "drag";
    if (selected === MaterialId.Empty) return "eraser";
    return ICON_BY_MATERIAL[selected];
  }
  function primaryStyle(): string {
    return brushShape === BrushShape.Drag || selected === MaterialId.Empty ? TOOL_SWATCH : swatchStyle(selected);
  }
  function primaryLabel(): string {
    if (brushShape === BrushShape.Drag) return t("shapeDrag");
    if (selected === MaterialId.Empty) return t("erase");
    return materialName(selected);
  }
  function secondaryIcon(): string {
    if (secondaryIsDrag) return "drag";
    if (secondarySelected === MaterialId.Empty) return "eraser";
    return ICON_BY_MATERIAL[secondarySelected];
  }
  function secondaryStyle(): string {
    return secondaryIsDrag || secondarySelected === MaterialId.Empty ? TOOL_SWATCH : swatchStyle(secondarySelected);
  }
  function secondaryLabel(): string {
    if (secondaryIsDrag) return t("shapeDrag");
    if (secondarySelected === MaterialId.Empty) return t("erase");
    return materialName(secondarySelected);
  }

  /** Text/icon color for the temperature readout — blue when cold, green right at the prosperous band, warm/red the hotter it gets. */
  function temperatureColor(t: number): string {
    if (t <= COLD_3) return "#8fc4f5";
    if (t <= COLD_2) return "#7ec8f2";
    if (t <= COLD_1) return "#a9d8ee";
    if (t < PROSPEROUS_LOW) return "rgba(255, 255, 255, 0.72)";
    if (isProsperous(t)) return "#7ce08f";
    if (t >= HOT_3) return "#ff5c3c";
    if (t >= HOT_2) return "#ff8a5c";
    return "#ffb37a";
  }

  /** Icon for the readout — a distinct glyph for each of the 8 bands: 3 cold, Neutro, Próspero, 3 hot. */
  function temperatureIcon(t: number): string {
    if (t <= COLD_3) return "cold-3";
    if (t <= COLD_2) return "ice";
    if (t <= COLD_1) return "cold-1";
    if (t < PROSPEROUS_LOW) return "neutral";
    if (isProsperous(t)) return "plant";
    if (t >= HOT_3) return "hot-3";
    if (t >= HOT_2) return "fire";
    return "hot-1";
  }
</script>

<footer class="panel">
  <div class="brand-col">
    <span class="brand">Powder &amp; Plant</span>
    <span class="counter">{pixelCount.toLocaleString(intlLocale())} px</span>
    <span class="counter temp" style="color: {temperatureColor(temperature)}">
      <Icon name={temperatureIcon(temperature)} size={12} />
      {Math.round(displayTemperature(temperature))}°{temperatureUnit() === "f" ? "F" : "C"}
    </span>
    <span class="counter fps">
      <Icon name="fps" size={12} />
      {fps} FPS
    </span>
  </div>

  <div class="material-panel">
    <div class="category-bar">
      <div class="dual-swatch" title="{primaryLabel()} / {secondaryLabel()}">
        <span class="swatch-primary" style={primaryStyle()} aria-label="{t('selectedMaterial')}: {primaryLabel()}">
          <Icon name={primaryIcon()} size={12} />
        </span>
        <span class="swatch-secondary" style={secondaryStyle()} aria-label={secondaryLabel()}>
          <Icon name={secondaryIcon()} size={10} />
        </span>
      </div>
      <span class="bar-divider"></span>
      {#each PALETTE_CATEGORIES as cat (cat.id)}
        <button
          class="category-tab"
          class:active={activeCategory === cat.id}
          onclick={(e) => openCategory(cat, e.currentTarget)}
        >
          <Icon name={cat.icon} size={13} />
          {categoryLabel(cat.id)}
        </button>
      {/each}
      {#if materialPopup}
        {@const popup = materialPopup}
        <button class="popup-backdrop" aria-label={t("close")} onclick={() => (materialPopup = null)}></button>
        <div class="material-popup" style="left: {popup.left}px">
          <span class="popup-title">{categoryLabel(popup.cat.id)}</span>
          {#if popup.cat.subcategories}
            {#each popup.cat.subcategories as sub (sub.id)}
              <span class="popup-group-title">{categoryLabel(sub.id)}</span>
              <div class="material-grid" style="grid-template-columns: repeat({cols(sub.materials.length)}, 78px)">
                {#each sub.materials as id (id)}
                  <button
                    class="tile"
                    class:active={selected === id}
                    class:secondary={tileIsSecondary(id)}
                    onclick={() => pick(id)}
                    oncontextmenu={(e) => pickSecondary(e, id)}
                  >
                    <span class="icon-badge" style={swatchStyle(id)}>
                      <Icon name={ICON_BY_MATERIAL[id]} size={16} />
                    </span>
                    <span class="name">{materialName(id)}</span>
                  </button>
                {/each}
              </div>
            {/each}
          {:else}
            <div class="material-grid" style="grid-template-columns: repeat({cols(popup.cat.materials.length)}, 78px)">
              {#each popup.cat.materials as id (id)}
                <button
                  class="tile"
                  class:active={selected === id}
                  class:secondary={tileIsSecondary(id)}
                  onclick={() => pick(id)}
                  oncontextmenu={(e) => pickSecondary(e, id)}
                >
                  <span class="icon-badge" style={swatchStyle(id)}>
                    <Icon name={ICON_BY_MATERIAL[id]} size={16} />
                  </span>
                  <span class="name">{materialName(id)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Ferramentas — apagar, arrastar, gravidade, e as ações do app. Sempre aqui,
       entre os elementos e os pincéis. -->
  <div class="tools-col">
    <div class="tools" role="group" aria-label={t("tools")}>
      <button
        class="tool"
        class:active={selected === MaterialId.Empty}
        class:secondary={!secondaryIsDrag && secondarySelected === MaterialId.Empty}
        onclick={selectErase}
        oncontextmenu={selectEraseSecondary}
      >
        <Icon name="eraser" size={15} />
        <span>{t("erase")}</span>
      </button>
      <button
        class="tool"
        class:active={brushShape === BrushShape.Drag}
        class:secondary={secondaryIsDrag}
        onclick={selectDrag}
        oncontextmenu={selectDragSecondary}
      >
        <Icon name="drag" size={15} />
        <span>{t("shapeDrag")}</span>
      </button>
      <button class="tool" class:active={!gravityOn} onclick={() => (gravityOn = !gravityOn)} aria-pressed={!gravityOn}>
        <Icon name={gravityOn ? "gravity" : "gravity-off"} size={15} />
        <span>{t("gravity")}</span>
      </button>
    </div>
    <div class="button-row">
      <button
        class="icon-btn"
        class:paused
        onclick={() => (paused = !paused)}
        title={paused ? t("play") : t("pause")}
        aria-label={paused ? t("play") : t("pause")}
        aria-pressed={paused}
      >
        <Icon name={paused ? "play" : "pause"} size={15} />
      </button>
      <button class="icon-btn" onclick={onoptions} title={t("options")} aria-label={t("options")}>
        <Icon name="settings" size={15} />
      </button>
      <button class="icon-btn" onclick={onmaps} title={t("maps")} aria-label={t("maps")}>
        <Icon name="save" size={15} />
      </button>
      <button class="icon-btn danger" onclick={onclear} title={t("clearAll")} aria-label={t("clearAll")}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  </div>

  <!-- Pincéis — formato e tamanho. -->
  <div class="brush-col">
    <div class="shape-list">
      {#each SHAPES as shape (shape.id)}
        <button class="shape" class:active={brushShape === shape.id} onclick={() => (brushShape = shape.id)} title={t(shape.labelKey)} aria-label={t(shape.labelKey)}>
          <Icon name={shape.icon} size={15} />
        </button>
      {/each}
    </div>
    <div class="brush-size">
      <input type="range" min="1" max="10" step="1" bind:value={brushSize} aria-label="brush size" />
      <span class="size-value">{brushSize}</span>
    </div>
  </div>


</footer>

<style>
  .panel {
    display: flex;
    align-items: stretch;
    gap: 20px;
    padding: 14px 20px;
    background: rgba(15, 17, 24, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .brand-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    flex: none;
    padding-right: 16px;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
  }

  .brand {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }


  .counter {
    font-size: 12.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.72);
  }

  .temp {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
    transition: color 0.4s ease;
  }

  .fps {
    display: flex;
    align-items: center;
    gap: 4px;
    color: rgba(255, 255, 255, 0.4);
  }

  .dual-swatch {
    position: relative;
    width: 30px;
    height: 30px;
    flex: none;
  }

  .swatch-primary,
  .swatch-secondary {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--swatch, #333);
    color: rgba(0, 0, 0, 0.65);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  }

  .swatch-primary {
    top: 0;
    left: 0;
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.55);
    z-index: 2;
  }

  .swatch-secondary {
    bottom: 0;
    right: 0;
    width: 17px;
    height: 17px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    z-index: 1;
  }

  .bar-divider {
    width: 1px;
    align-self: stretch;
    background: rgba(255, 255, 255, 0.1);
    flex: none;
  }

  .material-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    min-width: 0;
  }

  .category-bar {
    position: relative;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .popup-backdrop {
    position: fixed;
    inset: 0;
    background: none;
    border: none;
    cursor: default;
    z-index: 39;
  }

  .material-popup {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    width: fit-content;
    min-width: 170px;
    max-width: 352px;
    max-height: 340px;
    overflow-y: auto;
    background: #1c202c;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    z-index: 40;
  }

  .popup-title {
    padding: 0 2px 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.5);
  }

  .popup-group-title {
    padding: 4px 2px 0;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.35);
  }

  .category-tab {
    padding: 5px 11px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.62);
    font-size: 11.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }

  .category-tab:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .category-tab.active {
    background: rgba(106, 160, 255, 0.18);
    border-color: rgba(106, 160, 255, 0.5);
    color: #fff;
  }

  .material-grid {
    display: grid;
    gap: 6px;
    min-width: 0;
    align-content: start;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 4px;
    border-radius: 9px;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.78);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
  }

  .tile:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .tile.active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .tile.secondary {
    box-shadow: 0 0 0 2px rgba(106, 160, 255, 0.7);
  }

  .tile.active.secondary {
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 0 2px rgba(106, 160, 255, 0.7), 0 0 0 4px rgba(255, 255, 255, 0.2);
  }

  .icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--swatch, #333);
    color: rgba(0, 0, 0, 0.65);
    flex: none;
  }

  .name {
    font-size: 10px;
    font-weight: 500;
    line-height: 1.15;
    text-align: center;
    white-space: normal;
    overflow-wrap: break-word;
    max-width: 100%;
  }

  .tools-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    flex: none;
    width: 176px;
    padding-left: 16px;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }

  .brush-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    flex: none;
    width: 148px;
    padding-left: 16px;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }

  .tools {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .tool {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 7px 2px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.75);
    font-size: 9.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }

  .tool:hover {
    background: rgba(255, 255, 255, 0.09);
    color: #fff;
  }

  .tool.active {
    background: rgba(106, 160, 255, 0.2);
    border-color: rgba(106, 160, 255, 0.5);
    color: #fff;
  }

  .tool.secondary {
    box-shadow: 0 0 0 2px rgba(106, 160, 255, 0.7);
  }

  .tool.active.secondary {
    box-shadow: 0 0 0 2px rgba(106, 160, 255, 0.7), 0 0 0 4px rgba(255, 255, 255, 0.2);
  }

  .shape-list {
    display: flex;
    gap: 5px;
    justify-content: space-between;
  }

  .shape {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }

  .shape:hover {
    background: rgba(255, 255, 255, 0.09);
  }

  .shape.active {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.3);
    color: #fff;
  }

  .brush-size {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .brush-size input[type="range"] {
    flex: 1;
    min-width: 0;
    accent-color: #6aa0ff;
  }

  .size-value {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
    font-variant-numeric: tabular-nums;
    width: 16px;
    text-align: right;
  }

  .button-row {
    display: flex;
    gap: 6px;
  }

  .icon-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }

  .icon-btn:hover {
    background: rgba(106, 160, 255, 0.2);
    border-color: rgba(106, 160, 255, 0.45);
    color: #fff;
  }

  .icon-btn.paused {
    background: rgba(124, 224, 143, 0.18);
    border-color: rgba(124, 224, 143, 0.5);
    color: #7ce08f;
  }

  .icon-btn.danger:hover {
    background: rgba(255, 99, 71, 0.18);
    border-color: rgba(255, 99, 71, 0.4);
    color: #ff8a5c;
  }
</style>
