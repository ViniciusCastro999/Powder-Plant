<script lang="ts">
  interface Props {
    name: string;
    size?: number;
  }
  let { name, size = 20 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  {#if name === "sand"}
    <path d="M3 18 L9 8 L13 14 L16 9 L21 18 Z" />
  {:else if name === "water"}
    <path d="M12 3 C8 8 5 12.5 5 15.5 A7 7 0 0 0 19 15.5 C19 12.5 16 8 12 3 Z" />
  {:else if name === "stone"}
    <path d="M4 16 L6 8 L12 5 L18 8 L20 16 L15 19 L9 19 Z" />
  {:else if name === "wood"}
    <path d="M4 12 A4 4 0 0 1 8 8 H16 A4 4 0 0 1 20 12 A4 4 0 0 1 16 16 H8 A4 4 0 0 1 4 12 Z" />
    <path d="M8 8 V16 M16 8 V16" />
  {:else if name === "fire"}
    <path d="M12 2 C9 6 6 9 6 13 A6 6 0 0 0 18 13 C18 10 16 9 16 11 C16 7 13 6 12 2 Z" />
  {:else if name === "plant"}
    <path d="M12 21 V10" />
    <path d="M12 14 C12 14 6 14 5 8 C10 7 12 11 12 14 Z" />
    <path d="M12 12 C12 12 18 12 19 6 C14 5 12 9 12 12 Z" />
  {:else if name === "eraser"}
    <path d="M6 15 L15 6 L19 10 L10 19 H6 Z" />
    <path d="M6 15 L10 19" />
  {:else if name === "dirt"}
    <path d="M3 18 C6 15 9 15 12 18 C15 15 18 15 21 18 V19 H3 Z" />
    <path d="M6 13.5 H9 M11 11.5 H14.5 M15.5 14 H18.5" />
  {:else if name === "mud"}
    <path d="M3 15 C5 12 8 12 10 14 C12 11 15 11 17 13.5 C19 12 20.5 13 21 15 V18 H3 Z" />
  {:else if name === "electricity"}
    <path d="M13 2 L5 14 H11 L9 22 L19 9 H13 Z" fill="currentColor" stroke="none" />
  {:else if name === "metal"}
    <path d="M4 8 H20 V16 H4 Z" />
    <path d="M7 8 L11 16 M13 8 L17 16" stroke-width="1.3" />
  {:else if name === "seed"}
    <path d="M12 4 C17 8 17 15 12 20 C7 15 7 8 12 4 Z" />
    <path d="M12 8 V17" stroke-width="1.3" />
  {:else if name === "acid"}
    <path d="M10 3 H14 V9 L18 18 A2 2 0 0 1 16 21 H8 A2 2 0 0 1 6 18 L10 9 Z" />
    <path d="M8.5 16 H15.5" stroke-width="1.3" />
    <circle cx="13" cy="18" r="0.9" fill="currentColor" stroke="none" />
  {:else if name === "gunpowder"}
    <circle cx="12" cy="14" r="7" />
    <path d="M14.5 8 L17 4 M17 4 L16 6.5 M17 4 L19 5" stroke-width="1.4" />
  {:else if name === "c4"}
    <path d="M5 9 H19 V17 H5 Z" />
    <path d="M14.5 9 L17 5 M17 5 L16 7.5 M17 5 L19 6" stroke-width="1.4" />
  {:else if name === "gas"}
    <path d="M6 15 A3.5 3.5 0 0 1 8 8.5 A4.5 4.5 0 0 1 16.5 9 A3.5 3.5 0 0 1 17 15.9 Z" />
    <path d="M14.5 8.5 L16.5 5 M16.5 5 L15.7 7.2 M16.5 5 L18.2 5.9" stroke-width="1.4" />
  {:else if name === "oil"}
    <path d="M12 3 C8 8 5 12.5 5 15.5 A7 7 0 0 0 19 15.5 C19 12.5 16 8 12 3 Z" />
    <path d="M9 15.5 A3 3 0 0 0 12 18.5" stroke-width="1.3" />
  {:else if name === "salt"}
    <path d="M12 4 L18 9 L15.5 16 H8.5 L6 9 Z" />
    <path d="M12 4 V20 M6 9 L18 9 M8.5 16 L15.5 16" stroke-width="1.1" />
  {:else if name === "point"}
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
  {:else if name === "line"}
    <path d="M5 19 L19 5" />
  {:else if name === "square"}
    <path d="M5 5 H19 V19 H5 Z" />
  {:else if name === "circle"}
    <circle cx="12" cy="12" r="7.2" />
  {:else if name === "lava"}
    <path d="M12 3 C8 8 5 12.5 5 15.5 A7 7 0 0 0 19 15.5 C19 12.5 16 8 12 3 Z" fill="currentColor" fill-opacity="0.25" />
    <path d="M9 15.5 A3 3 0 0 0 12 18.5 A3 3 0 0 0 15 15.5 C15 14 13.5 13.5 12 15 C11 12.5 13 11.5 12 9.5 C10 12 9 13.5 9 15.5 Z" fill="currentColor" stroke="none" />
  {:else if name === "life"}
    <rect x="10" y="4" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
    <rect x="15" y="9" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
    <rect x="4" y="14" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
    <rect x="10" y="14" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
    <rect x="15" y="14" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
  {:else if name === "ice"}
    <path d="M12 2 V22 M4.5 6 L19.5 18 M19.5 6 L4.5 18" />
    <path d="M12 2 L9.5 4.5 M12 2 L14.5 4.5 M12 22 L9.5 19.5 M12 22 L14.5 19.5" stroke-width="1.3" />
    <path d="M4.5 6 L4.7 9 M4.5 6 L7.5 5.6 M19.5 18 L19.3 15 M19.5 18 L16.5 18.4" stroke-width="1.3" />
    <path d="M19.5 6 L19.3 9 M19.5 6 L16.5 5.6 M4.5 18 L4.7 15 M4.5 18 L7.5 18.4" stroke-width="1.3" />
  {:else if name === "cold-1"}
    <path d="M12 4 V20" />
    <path d="M12 4 L9.8 6.2 M12 4 L14.2 6.2 M12 20 L9.8 17.8 M12 20 L14.2 17.8" stroke-width="1.3" />
  {:else if name === "cold-3"}
    <circle cx="12" cy="12" r="9.5" stroke-width="1.4" />
    <path d="M12 5 V19 M6 8 L18 16 M18 8 L6 16" stroke-width="1.3" />
    <path d="M12 5 L10 7 M12 5 L14 7 M12 19 L10 17 M12 19 L14 17" stroke-width="1.1" />
  {:else if name === "hot-1"}
    <path d="M12 7 C10.5 9.5 9.3 11.2 9.3 13 A2.7 2.7 0 0 0 14.7 13 C14.7 11.5 13.5 11 13.5 12.2 C13.5 10 12.6 9 12 7 Z" stroke-width="1.5" />
  {:else if name === "hot-3"}
    <circle cx="12" cy="12" r="9.5" stroke-width="1.4" />
    <path d="M12 5 C9.5 8.5 7.5 11 7.5 13.8 A4.5 4.5 0 0 0 16.5 13.8 C16.5 11.5 14.5 10.5 14.5 12.2 C14.5 8.8 13 7.5 12 5 Z" stroke-width="1.4" />
  {:else if name === "neutral"}
    <circle cx="12" cy="12" r="8" />
    <path d="M8 12 H16" stroke-width="1.5" />
  {:else if name === "clone"}
    <path d="M4 4 H14 V14 H4 Z" />
    <path d="M10 10 H20 V20 H10 Z" />
  {:else if name === "heat-block"}
    <path d="M4 4 H20 V20 H4 Z" />
    <path d="M12 8 C10.5 10.2 9.5 11.7 9.5 13.2 A2.5 2.5 0 0 0 14.5 13.2 C14.5 11.9 13.4 11.4 13.4 12.5 C13.4 10.5 12.6 9.6 12 8 Z" fill="currentColor" stroke="none" />
  {:else if name === "cold-block"}
    <path d="M4 4 H20 V20 H4 Z" />
    <path d="M12 8 V18 M8.2 10.5 L15.8 15.5 M15.8 10.5 L8.2 15.5" stroke-width="1.3" />
  {:else if name === "glass"}
    <path d="M6 3 H18 L16.5 16 A4.5 4.5 0 0 1 7.5 16 Z" />
    <path d="M6 3 H18" stroke-width="1.3" />
    <path d="M9 6 L9.6 13" stroke-width="1.2" opacity="0.6" />
  {:else if name === "help"}
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 9.5 A2.8 2.6 0 0 1 12 7 A2.8 2.6 0 0 1 14.8 9.5 C14.8 11.3 12 11.5 12 14" />
    <circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" />
  {:else if name === "back"}
    <path d="M19 12 H6 M11 6 L5 12 L11 18" />
  {:else if name === "save"}
    <path d="M5 4 H16 L20 8 V19 A1 1 0 0 1 19 20 H5 A1 1 0 0 1 4 19 V5 A1 1 0 0 1 5 4 Z" />
    <path d="M8 4 V9 H15 V4" />
    <rect x="8" y="13" width="8" height="7" />
  {:else if name === "map-load"}
    <path d="M12 3 V15 M12 15 L8 11 M12 15 L16 11" />
    <path d="M5 17 V20 H19 V17" />
  {:else if name === "export"}
    <path d="M12 15 V4 M12 4 L8 8 M12 4 L16 8" />
    <path d="M5 14 V19 A1 1 0 0 0 6 20 H18 A1 1 0 0 0 19 19 V14" />
  {:else if name === "import"}
    <path d="M12 4 V15 M12 15 L8 11 M12 15 L16 11" />
    <path d="M5 14 V19 A1 1 0 0 0 6 20 H18 A1 1 0 0 0 19 19 V14" />
  {:else if name === "trash"}
    <path d="M5 7 H19 M10 4 H14 M6 7 L7 20 H17 L18 7 M10 11 V16 M14 11 V16" />
  {:else if name === "globe"}
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12 H21 M12 3 C14.5 6 15.5 9 15.5 12 C15.5 15 14.5 18 12 21 C9.5 18 8.5 15 8.5 12 C8.5 9 9.5 6 12 3 Z" />
  {/if}
</svg>
