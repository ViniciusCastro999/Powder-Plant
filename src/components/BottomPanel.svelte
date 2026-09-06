<script lang="ts">
  import Icon from "./Icon.svelte";
  import { BrushShape, MaterialId } from "../sim/types";
  import { MATERIALS, PALETTE_CATEGORIES } from "../sim/materials";
  import { COLD_1, COLD_2, COLD_3, PROSPEROUS_LOW, HOT_2, HOT_3, isProsperous } from "../sim/temperature";
  import { t, materialName, categoryLabel, intlLocale, locale, setLocale, LOCALES } from "../i18n";
  import type { UIStrings } from "../i18n/ui";

  const ICON_BY_MATERIAL: Record<MaterialId, string> = {
    [MaterialId.Empty]: "eraser",
    [MaterialId.Sand]: "sand",
    [MaterialId.Water]: "water",
    [MaterialId.Stone]: "stone",
    [MaterialId.Wood]: "wood",
    [MaterialId.Fire]: "fire",
    [MaterialId.Plant]: "plant",
    [MaterialId.Dirt]: "dirt",
    [MaterialId.Mud]: "mud",
    [MaterialId.Electricity]: "electricity",
    [MaterialId.Metal]: "metal",
    [MaterialId.Seed]: "seed",
    [MaterialId.Acid]: "acid",
    [MaterialId.Gunpowder]: "gunpowder",
    [MaterialId.Oil]: "oil",
    [MaterialId.Salt]: "salt",
    [MaterialId.Lava]: "lava",
    [MaterialId.Vida]: "life",
    [MaterialId.Ice]: "ice",
    [MaterialId.Glass]: "glass",
    [MaterialId.Clone]: "clone",
    [MaterialId.HeatBlock]: "heat-block",
    [MaterialId.ColdBlock]: "cold-block",
    [MaterialId.C4]: "c4",
    // Vapor/Vapor de Ácido are never directly paintable — only ever appear
    // by boiling — but the type still needs an entry for every id.
    [MaterialId.Steam]: "water",
    [MaterialId.AcidVapor]: "acid",
    [MaterialId.CombustibleGas]: "gas",
    // Sprout and Flor only ever appear by germinating from a Semente —
    // neither has a palette button, but the type still needs an entry for
    // every id.
    [MaterialId.Sprout]: "plant",
    [MaterialId.Flor]: "plant",
  };

  const SHAPES: { id: BrushShape; icon: string; labelKey: keyof UIStrings }[] = [
    { id: BrushShape.Point, icon: "point", labelKey: "shapePoint" },
    { id: BrushShape.Line, icon: "line", labelKey: "shapeLine" },
    { id: BrushShape.Square, icon: "square", labelKey: "shapeSquare" },
    { id: BrushShape.Circle, icon: "circle", labelKey: "shapeCircle" },
  ];

  interface Props {
    selected: MaterialId;
    brushSize: number;
    brushShape: BrushShape;
    pixelCount: number;
    temperature: number;
    onclear: () => void;
    onhints: () => void;
    onmaps: () => void;
  }
  let {
    selected = $bindable(),
    brushSize = $bindable(),
    brushShape = $bindable(),
    pixelCount,
    temperature,
    onclear,
    onhints,
    onmaps,
  }: Props = $props();

  /** Which category's tile grid is currently expanded — a single-open accordion (never fully collapsed, so the footer's height stays constant) starting on whichever category the initial selection belongs to. */
  function categoryOf(id: MaterialId): string {
    return PALETTE_CATEGORIES.find((c) => c.materials.includes(id))?.id ?? PALETTE_CATEGORIES[0].id;
  }
  let expandedCategory = $state(categoryOf(selected));
  const expandedMaterials = $derived(PALETTE_CATEGORIES.find((c) => c.id === expandedCategory)?.materials ?? []);

  function pick(id: MaterialId): void {
    selected = id;
  }

  function swatchStyle(id: MaterialId): string {
    const [r, g, b] = MATERIALS[id].color;
    return `--swatch: rgb(${r}, ${g}, ${b})`;
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
      {Math.round(temperature)}°C
    </span>
    <div class="lang" role="group" aria-label={t("languageLabel")}>
      <Icon name="globe" size={12} />
      {#each LOCALES as l (l.id)}
        <button
          class="lang-btn"
          class:active={locale() === l.id}
          onclick={() => setLocale(l.id)}
          aria-pressed={locale() === l.id}
          title={l.label}
        >
          {l.short}
        </button>
      {/each}
    </div>
  </div>

  <div class="material-panel">
    <div class="category-bar">
      {#each PALETTE_CATEGORIES as cat (cat.id)}
        <button class="category-tab" class:active={expandedCategory === cat.id} onclick={() => (expandedCategory = cat.id)}>
          <Icon name={cat.icon} size={13} />
          {categoryLabel(cat.id)}
        </button>
      {/each}
      <button class="category-tab eraser-tab" class:active={selected === MaterialId.Empty} onclick={() => pick(MaterialId.Empty)}>
        <Icon name="eraser" size={13} />
        {t("erase")}
      </button>
    </div>
    <div class="material-grid">
      {#each expandedMaterials as id (id)}
        <button class="tile" class:active={selected === id} onclick={() => pick(id)}>
          <span class="icon-badge" style={swatchStyle(id)}>
            <Icon name={ICON_BY_MATERIAL[id]} size={16} />
          </span>
          <span class="name">{materialName(id)}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="controls-col">
    <div class="shape-list">
      {#each SHAPES as shape (shape.id)}
        <button class="shape" class:active={brushShape === shape.id} onclick={() => (brushShape = shape.id)} title={t(shape.labelKey)} aria-label={t(shape.labelKey)}>
          <Icon name={shape.icon} size={16} />
        </button>
      {/each}
    </div>
    <div class="brush-size">
      <input type="range" min="1" max="10" step="1" bind:value={brushSize} />
      <span class="size-value">{brushSize}px</span>
    </div>
    <div class="button-row">
      <button class="hints-btn" onclick={onhints}>
        <Icon name="help" size={15} />
        <span>{t("hints")}</span>
      </button>
      <button class="maps-btn" onclick={onmaps}>
        <Icon name="save" size={15} />
        <span>{t("maps")}</span>
      </button>
    </div>
    <button class="clear" onclick={onclear}>{t("clearAll")}</button>
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

  .lang {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-top: 2px;
    color: rgba(255, 255, 255, 0.4);
  }

  .lang-btn {
    padding: 2px 5px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  }

  .lang-btn:hover {
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.06);
  }

  .lang-btn.active {
    color: #fff;
    background: rgba(106, 160, 255, 0.18);
    border-color: rgba(106, 160, 255, 0.5);
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
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
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

  .eraser-tab {
    margin-left: auto;
  }

  .eraser-tab.active {
    background: rgba(255, 99, 71, 0.18);
    border-color: rgba(255, 99, 71, 0.45);
    color: #fff;
  }

  .material-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
    gap: 6px;
    min-width: 0;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 2px;
    border-radius: 9px;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.78);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .tile:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .tile.active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
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
    line-height: 1.1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .controls-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    flex: none;
    width: 190px;
    padding-left: 16px;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }

  .shape-list {
    display: flex;
    gap: 6px;
  }

  .shape {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
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
    gap: 8px;
  }

  .brush-size input[type="range"] {
    flex: 1;
    accent-color: #6aa0ff;
  }

  .size-value {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.55);
    font-variant-numeric: tabular-nums;
    width: 30px;
    text-align: right;
  }

  .button-row {
    display: flex;
    gap: 8px;
  }

  .hints-btn,
  .maps-btn,
  .clear {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.85);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .clear {
    width: 100%;
  }

  .hints-btn:hover,
  .maps-btn:hover {
    background: rgba(106, 160, 255, 0.2);
    border-color: rgba(106, 160, 255, 0.45);
  }

  .clear:hover {
    background: rgba(255, 99, 71, 0.18);
    border-color: rgba(255, 99, 71, 0.4);
  }
</style>
