/**
 * Utilidades para construir nombres legibles de variantes de producto.
 *
 * En la BD, las variantes hijas tienen `name` como "iPhone 16 Pro Max - Variante 1"
 * y `variant_data` como { Talla: "256 GB", Color: "Negro" }.
 * Para mostrar al usuario, construimos "iPhone 16 Pro Max (256 GB, Negro)"
 * a partir del nombre del padre + los valores de variant_data.
 */

/**
 * Construye un nombre legible para una variante combinando el nombre del
 * producto padre con los valores de variant_data.
 *
 * Ejemplo:
 *   buildVariantDisplayName("iPhone 16 Pro Max", { Talla: "256 GB" })
 *   → "iPhone 16 Pro Max (256 GB)"
 *
 *   buildVariantDisplayName("Camiseta", { Talla: "M", Color: "Azul" })
 *   → "Camiseta (M, Azul)"
 *
 * Si variant_data está vacío o no existe, devuelve el nombre del padre tal cual.
 */
export function buildVariantDisplayName(
  parentName: string,
  variantData: Record<string, string> | null | undefined
): string {
  if (!variantData || Object.keys(variantData).length === 0) {
    return parentName;
  }

  const values = Object.values(variantData).filter(Boolean);
  if (values.length === 0) return parentName;

  return `${parentName} (${values.join(', ')})`;
}

/**
 * Extrae el nombre del producto padre desde el nombre de una variante.
 *
 * Ejemplo:
 *   extractParentName("iPhone 16 Pro Max - Variante 1") → "iPhone 16 Pro Max"
 *   extractParentName("iPhone 16 Pro Max") → "iPhone 16 Pro Max"
 */
export function extractParentName(variantName: string): string {
  // Patrón común: "Nombre del padre - Variante N"
  const match = variantName.match(/^(.+?)\s*-\s*Variante\s+\d+$/i);
  if (match) return match[1].trim();
  return variantName;
}

/**
 * Construye el nombre a mostrar para una variante, usando variant_data si
 * está disponible, o el nombre original de la variante como fallback.
 *
 * Esta es la función principal que deben usar los componentes de UI.
 */
export function resolveVariantDisplayName(
  variantName: string,
  variantData: Record<string, string> | null | undefined,
  parentName?: string | null
): string {
  // Si tenemos variant_data con valores, construir desde ahí
  if (variantData && Object.keys(variantData).length > 0) {
    const baseName = parentName || extractParentName(variantName);
    return buildVariantDisplayName(baseName, variantData);
  }

  // Fallback: usar el nombre original de la variante
  return variantName;
}
