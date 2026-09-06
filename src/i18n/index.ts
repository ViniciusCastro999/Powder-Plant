import type { MaterialId } from "../sim/types";
import { locale } from "./locale.svelte";
import { UI, type UIStrings } from "./ui";
import { CATEGORY_LABELS, MATERIAL_NAMES } from "./materials";
import { MATERIAL_INFO, type MaterialInfo } from "./materialInfo";

export { locale, setLocale, intlLocale, LOCALES, type Locale } from "./locale.svelte";
export type { MaterialInfo } from "./materialInfo";

/** A fixed UI string in the current language. Reactive — call it in markup. */
export function t(key: keyof UIStrings): string {
  return UI[locale()][key] ?? UI.en[key];
}

/** Fills `{name}` / `{n}` placeholders: `format(t("mapSaved"), { name })`. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Display name of a material in the current language. */
export function materialName(id: MaterialId): string {
  return MATERIAL_NAMES[locale()][id] ?? MATERIAL_NAMES.en[id];
}

/** Palette category label (keyed by `PaletteCategory.id`) in the current language. */
export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[locale()][id] ?? CATEGORY_LABELS.en[id] ?? id;
}

/** Description + interactions for a material in the current language. */
export function materialInfo(id: MaterialId): MaterialInfo | undefined {
  return MATERIAL_INFO[locale()][id] ?? MATERIAL_INFO.en[id];
}
