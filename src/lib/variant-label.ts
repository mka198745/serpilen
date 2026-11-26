/** Keep variants distinguishable wherever an order or selector displays their identity. */
export function variantLabel(variant: { colorName?: string | null; size?: string | null; length?: string | null }): string {
  return [variant.colorName, variant.size, variant.length].map(value => value?.trim()).filter(Boolean).join(" · ");
}
