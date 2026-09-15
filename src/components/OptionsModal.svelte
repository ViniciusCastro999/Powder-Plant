<script lang="ts">
  import Icon from "./Icon.svelte";
  import Modal from "./Modal.svelte";
  import { t, locale, setLocale, LOCALES } from "../i18n";
  import {
    temperatureUnit, setTemperatureUnit, showGrid, setShowGrid,
    snapToGrid, setSnapToGrid, gridSize, setGridSize, type GridSize,
  } from "../settings.svelte";

  interface Props {
    open: boolean;
    onclose: () => void;
    onhints: () => void;
  }
  let { open, onclose, onhints }: Props = $props();

  const GRID_SIZES: { id: GridSize; labelKey: "gridSizeSmall" | "gridSizeMedium" | "gridSizeLarge" }[] = [
    { id: "small", labelKey: "gridSizeSmall" },
    { id: "medium", labelKey: "gridSizeMedium" },
    { id: "large", labelKey: "gridSizeLarge" },
  ];

  function openHints(): void {
    onclose();
    onhints();
  }

  const gridActive = $derived(showGrid() || snapToGrid());
</script>

<Modal {open} {onclose} ariaLabel={t("optionsDialogLabel")} width="360px" maxHeight="600px">
  <header>
    <span class="title">{t("options")}</span>
    <button class="close" onclick={onclose} aria-label={t("close")}>✕</button>
  </header>

  <div class="body">
    <button class="hints-card" onclick={openHints}>
      <span class="hints-icon"><Icon name="help" size={17} /></span>
      <span class="hints-text">{t("hints")}</span>
      <Icon name="chevron-right" size={14} />
    </button>

    <div class="row">
      <span class="row-label">
        <Icon name="globe" size={15} />
        {t("languageLabel")}
      </span>
      <div class="segmented" role="group" aria-label={t("languageLabel")}>
        {#each LOCALES as l (l.id)}
          <button class:active={locale() === l.id} onclick={() => setLocale(l.id)} aria-pressed={locale() === l.id}>
            {l.short}
          </button>
        {/each}
      </div>
    </div>

    <div class="row">
      <span class="row-label">{t("temperatureUnit")}</span>
      <div class="segmented" role="group" aria-label={t("temperatureUnit")}>
        <button class:active={temperatureUnit() === "c"} onclick={() => setTemperatureUnit("c")} aria-pressed={temperatureUnit() === "c"}>°C</button>
        <button class:active={temperatureUnit() === "f"} onclick={() => setTemperatureUnit("f")} aria-pressed={temperatureUnit() === "f"}>°F</button>
      </div>
    </div>

    <div class="row">
      <span class="row-label">{t("showGrid")}</span>
      <button class="toggle" class:on={showGrid()} onclick={() => setShowGrid(!showGrid())} role="switch" aria-checked={showGrid()} aria-label={t("showGrid")}>
        <span class="knob"></span>
      </button>
    </div>

    <div class="row">
      <span class="row-label">{t("snapToGrid")}</span>
      <button class="toggle" class:on={snapToGrid()} onclick={() => setSnapToGrid(!snapToGrid())} role="switch" aria-checked={snapToGrid()} aria-label={t("snapToGrid")}>
        <span class="knob"></span>
      </button>
    </div>

    <div class="row" class:disabled={!gridActive}>
      <span class="row-label">{t("gridSize")}</span>
      <div class="segmented" role="group" aria-label={t("gridSize")} aria-disabled={!gridActive}>
        {#each GRID_SIZES as g (g.id)}
          <button
            disabled={!gridActive}
            class:active={gridSize() === g.id}
            onclick={() => setGridSize(g.id)}
            aria-pressed={gridSize() === g.id}
          >
            {t(g.labelKey)}
          </button>
        {/each}
      </div>
    </div>
  </div>
</Modal>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex: none;
  }

  .title {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: rgba(255, 255, 255, 0.88);
  }

  .close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: 8px;
  }

  .close:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .body {
    display: flex;
    flex-direction: column;
    padding: 8px 16px 16px;
    overflow-y: auto;
    gap: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.82);
  }

  .row.disabled {
    opacity: 0.4;
  }

  .hints-card {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    margin-bottom: 6px;
    background: rgba(106, 160, 255, 0.1);
    border: 1px solid rgba(106, 160, 255, 0.28);
    border-radius: 10px;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.88);
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .hints-card:hover {
    background: rgba(106, 160, 255, 0.2);
    border-color: rgba(106, 160, 255, 0.5);
  }

  .hints-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: rgba(106, 160, 255, 0.22);
    color: #a9c8ff;
    flex: none;
  }

  .hints-text {
    flex: 1;
    text-align: left;
    font-size: 13px;
    font-weight: 600;
  }

  .segmented {
    display: flex;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .segmented button {
    padding: 5px 10px;
    background: none;
    border: none;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .segmented button:first-child {
    border-left: none;
  }

  .segmented button:hover {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.06);
  }

  .segmented button.active {
    color: #fff;
    background: rgba(106, 160, 255, 0.25);
  }

  .segmented button:disabled {
    cursor: not-allowed;
  }

  .segmented button:disabled:hover {
    background: none;
    color: rgba(255, 255, 255, 0.6);
  }

  .toggle {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
    cursor: pointer;
    flex: none;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .toggle .knob {
    position: absolute;
    top: 1px;
    left: 1px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.7);
    transition: transform 0.15s ease, background 0.15s ease;
  }

  .toggle.on {
    background: rgba(106, 160, 255, 0.5);
    border-color: rgba(106, 160, 255, 0.7);
  }

  .toggle.on .knob {
    transform: translateX(16px);
    background: #fff;
  }
</style>
