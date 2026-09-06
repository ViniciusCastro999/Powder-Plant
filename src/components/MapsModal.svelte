<script lang="ts">
  import { untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import {
    listMaps,
    saveMap,
    loadMapSnapshot,
    deleteMap,
    toMapFile,
    parseMapFile,
    StorageFullError,
    type MapMeta,
    type MapSnapshot,
  } from "../sim/storage";

  interface Props {
    open: boolean;
    onclose: () => void;
    /** Grabs the current grid contents to save/export — null while the sim is still starting up. */
    getSnapshot: () => MapSnapshot | null;
    /** Hands a saved/imported map back to the canvas to load. */
    onload: (snap: MapSnapshot) => void;
  }
  let { open, onclose, getSnapshot, onload }: Props = $props();

  let maps = $state<MapMeta[]>([]);
  let name = $state("");
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let confirmingId = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();

  // Refresh the list (and clear stale messages) every time the dialog opens —
  // untracked so typing in the name field doesn't re-trigger it.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      maps = listMaps();
      error = null;
      notice = null;
      confirmingId = null;
      if (!name.trim()) name = suggestName(maps);
    });
  });

  function suggestName(existing: MapMeta[]): string {
    let n = existing.length + 1;
    const used = new Set(existing.map((m) => m.name.trim().toLowerCase()));
    while (used.has(`mapa ${n}`)) n++;
    return `Mapa ${n}`;
  }

  function close(): void {
    onclose();
  }

  function save(): void {
    const snap = getSnapshot();
    if (!snap) {
      error = "A simulação ainda está carregando.";
      return;
    }
    try {
      const meta = saveMap(name, snap);
      maps = listMaps();
      error = null;
      notice = `"${meta.name}" salvo.`;
      name = suggestName(maps);
    } catch (e) {
      notice = null;
      error = e instanceof StorageFullError ? e.message : "Não foi possível salvar o mapa.";
    }
  }

  function load(id: string): void {
    const snap = loadMapSnapshot(id);
    if (!snap) {
      error = "Mapa não encontrado.";
      maps = listMaps();
      return;
    }
    onload(snap);
    close();
  }

  function remove(id: string): void {
    deleteMap(id);
    maps = listMaps();
    confirmingId = null;
    notice = null;
    error = null;
  }

  function exportMap(meta: MapMeta): void {
    const snap = loadMapSnapshot(meta.id);
    if (!snap) {
      error = "Mapa não encontrado.";
      return;
    }
    const blob = new Blob([JSON.stringify(toMapFile(meta.name, snap))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.name.replace(/[^\w\-]+/g, "_") || "mapa"}.pnp.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFilePicked(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const { snapshot } = parseMapFile(await file.text());
      onload(snapshot);
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : "Não foi possível ler o arquivo.";
    }
  }

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
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
      aria-label="Salvar e carregar mapas"
      tabindex="-1"
    >
      <header>
        <span class="title">Mapas</span>
        <button class="close" onclick={close} aria-label="Fechar">✕</button>
      </header>

      <div class="save-row">
        <input
          type="text"
          bind:value={name}
          maxlength="40"
          placeholder="Nome do mapa"
          onkeydown={(e) => e.key === "Enter" && save()}
        />
        <button class="save-btn" onclick={save}>
          <Icon name="save" size={15} />
          Salvar mapa atual
        </button>
      </div>

      {#if error}
        <p class="msg error">{error}</p>
      {:else if notice}
        <p class="msg notice">{notice}</p>
      {/if}

      <div class="list">
        {#if maps.length === 0}
          <p class="empty">Nenhum mapa salvo ainda. Pinte alguma coisa e clique em “Salvar mapa atual”.</p>
        {:else}
          {#each maps as m (m.id)}
            <div class="map-row">
              <div class="map-info">
                <span class="map-name">{m.name}</span>
                <span class="map-date">{formatDate(m.savedAt)}</span>
              </div>
              <div class="map-actions">
                {#if confirmingId === m.id}
                  <button class="danger" onclick={() => remove(m.id)}>Confirmar</button>
                  <button class="ghost" onclick={() => (confirmingId = null)}>Cancelar</button>
                {:else}
                  <button class="primary" onclick={() => load(m.id)}>Carregar</button>
                  <button class="ghost" onclick={() => exportMap(m)} title="Baixar como arquivo" aria-label="Exportar">
                    <Icon name="export" size={15} />
                  </button>
                  <button class="ghost" onclick={() => (confirmingId = m.id)} title="Excluir" aria-label="Excluir">
                    <Icon name="trash" size={15} />
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <footer>
        <button class="import" onclick={() => fileInput?.click()}>
          <Icon name="import" size={15} />
          Importar arquivo
        </button>
        <input
          bind:this={fileInput}
          type="file"
          accept=".json,application/json"
          onchange={onFilePicked}
          hidden
        />
      </footer>
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
    width: min(520px, 100%);
    max-height: min(620px, 90vh);
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

  .save-row {
    display: flex;
    gap: 8px;
    padding: 14px 16px 8px;
    flex: none;
  }

  .save-row input {
    flex: 1;
    min-width: 0;
    padding: 8px 11px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
    font-size: 13px;
  }

  .save-row input:focus {
    outline: none;
    border-color: rgba(106, 160, 255, 0.55);
  }

  .save-btn {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 9px;
    border: 1px solid rgba(106, 160, 255, 0.45);
    background: rgba(106, 160, 255, 0.18);
    color: #fff;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .save-btn:hover {
    background: rgba(106, 160, 255, 0.28);
  }

  .msg {
    margin: 4px 16px 0;
    font-size: 12px;
    flex: none;
  }

  .msg.error {
    color: #ff8a72;
  }

  .msg.notice {
    color: #7ce08f;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 10px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 80px;
  }

  .empty {
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.5;
    margin: 8px 0;
  }

  .map-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 11px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.03);
  }

  .map-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .map-name {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .map-date {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    font-variant-numeric: tabular-nums;
  }

  .map-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }

  .map-actions button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }

  .map-actions .ghost {
    padding: 6px 8px;
  }

  .map-actions button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .map-actions .primary:hover {
    background: rgba(106, 160, 255, 0.22);
    border-color: rgba(106, 160, 255, 0.45);
  }

  .map-actions .danger {
    background: rgba(255, 99, 71, 0.16);
    border-color: rgba(255, 99, 71, 0.4);
    color: #ff9c85;
  }

  .map-actions .danger:hover {
    background: rgba(255, 99, 71, 0.26);
    color: #fff;
  }

  footer {
    flex: none;
    padding: 12px 16px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .import {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.82);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .import:hover {
    background: rgba(255, 255, 255, 0.1);
  }
</style>
