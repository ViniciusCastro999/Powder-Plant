/**
 * The one piece of i18n state: which language the UI is in. Kept in a
 * `.svelte.ts` module so a single `$state` rune is shared by every
 * component — reading `locale()` inside any markup makes that spot
 * re-render when the player switches language.
 */

export type Locale = "pt" | "en" | "ja";

export const LOCALES: { id: Locale; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "pt", label: "Português", short: "PT" },
  { id: "ja", label: "日本語", short: "日本語" },
];

const STORAGE_KEY = "powder-and-plant:locale";

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "pt" || saved === "en" || saved === "ja") return saved;
  } catch {
    // localStorage can throw in private mode — fall through to nav language.
  }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "").toLowerCase();
  if (nav.startsWith("pt")) return "pt";
  if (nav.startsWith("ja")) return "ja";
  return "en";
}

let current = $state<Locale>(detect());

/** Current UI language. Reactive — call it in markup. */
export function locale(): Locale {
  return current;
}

/** BCP-47 tag for `Intl` / `toLocaleString` calls. */
export function intlLocale(): string {
  return current === "pt" ? "pt-BR" : current === "ja" ? "ja-JP" : "en-US";
}

export function setLocale(next: Locale): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore — the choice just won't persist across reloads.
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = intlLocale();
  }
}
