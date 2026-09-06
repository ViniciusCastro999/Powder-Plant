<script lang="ts">
  import Icon from "./Icon.svelte";
  import { MaterialId } from "../sim/types";
  import { MATERIALS, PALETTE_CATEGORIES } from "../sim/materials";
  import { t, materialName, categoryLabel, materialInfo } from "../i18n";

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
    [MaterialId.Steam]: "water",
    [MaterialId.AcidVapor]: "acid",
    [MaterialId.CombustibleGas]: "gas",
    [MaterialId.Sprout]: "plant",
    [MaterialId.Flor]: "plant",
  };

  interface Props {
    open: boolean;
    onclose: () => void;
  }
  let { open, onclose }: Props = $props();

  let selected = $state<MaterialId | null>(null);
  const info = $derived(selected !== null ? materialInfo(selected) : undefined);

  function close(): void {
    selected = null;
    onclose();
  }

  function swatchStyle(id: MaterialId): string {
    const [r, g, b] = MATERIALS[id].color;
    return `--swatch: rgb(${r}, ${g}, ${b})`;
  }
</script>

{#if open}
  <div class="backdrop" onclick={close} onkeydown={(e) => e.key === "Escape" && close()} role="presentation">
    <div
      class="dialog"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={t("materialHints")}
      tabindex="-1"
    >
      <header>
        {#if selected !== null}
          <button class="back" onclick={() => (selected = null)} aria-label={t("back")}>
            <Icon name="back" size={18} />
            <span>{t("back")}</span>
          </button>
        {:else}
          <span class="title">{t("materialHints")}</span>
        {/if}
        <button class="close" onclick={close} aria-label={t("close")}>✕</button>
      </header>

      {#if selected === null}
        <p class="hint">{t("hintsIntro")}</p>
        <div class="categories">
          {#each PALETTE_CATEGORIES as cat (cat.id)}
            <section>
              <span class="category-label">
                <Icon name={cat.icon} size={12} />
                {categoryLabel(cat.id)}
              </span>
              <div class="grid">
                {#each cat.materials as id (id)}
                  <button class="tile" onclick={() => (selected = id)}>
                    <span class="icon-badge" style={swatchStyle(id)}>
                      <Icon name={ICON_BY_MATERIAL[id]} size={18} />
                    </span>
                    <span class="name">{materialName(id)}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {:else}
        <div class="detail">
          <div class="detail-head">
            <span class="icon-badge large" style={swatchStyle(selected)}>
              <Icon name={ICON_BY_MATERIAL[selected]} size={26} />
            </span>
            <span class="detail-name">{materialName(selected)}</span>
          </div>
          <p class="description">{info?.description}</p>
          {#if info?.interactions.length}
            <div class="interactions">
              <span class="section-label">{t("interactions")}</span>
              <ul>
                {#each info?.interactions ?? [] as line}
                  <li>{line}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(4, 5, 8, 0.6);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 24px;
  }

  .dialog {
    width: min(560px, 100%);
    max-height: min(600px, 90vh);
    display: flex;
    flex-direction: column;
    background: #161a26;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 16px;
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }

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

  .back {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.75);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 8px;
  }

  .back:hover {
    background: rgba(255, 255, 255, 0.07);
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

  .hint {
    margin: 12px 16px 4px;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.5);
  }

  .categories {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 16px 16px;
    overflow-y: auto;
  }

  .category-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 8px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
  }

  .tile:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--swatch, #333);
    color: rgba(0, 0, 0, 0.65);
    flex: none;
  }

  .icon-badge.large {
    width: 48px;
    height: 48px;
    border-radius: 12px;
  }

  .name {
    font-size: 11px;
    font-weight: 500;
    text-align: center;
  }

  .detail {
    padding: 16px 20px 22px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .detail-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .detail-name {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
  }

  .description {
    font-size: 13.5px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.82);
    margin: 0;
  }

  .section-label {
    display: block;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 6px;
  }

  .interactions ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .interactions li {
    font-size: 13px;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.72);
  }
</style>
