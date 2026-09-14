<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    onclose: () => void;
    ariaLabel: string;
    /** CSS width/max-height for the dialog box; each modal sizes itself. */
    width: string;
    maxHeight: string;
    children: Snippet;
  }
  let { open, onclose, ariaLabel, width, maxHeight, children }: Props = $props();
</script>

{#if open}
  <div class="backdrop" onclick={onclose} onkeydown={(e) => e.key === "Escape" && onclose()} role="presentation">
    <div
      class="dialog"
      style="--modal-width: {width}; --modal-max-height: {maxHeight}"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabindex="-1"
    >
      {@render children()}
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
    position: relative;
    width: min(var(--modal-width), 100%);
    max-height: min(var(--modal-max-height), 90vh);
    display: flex;
    flex-direction: column;
    background: #161a26;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 16px;
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }
</style>
