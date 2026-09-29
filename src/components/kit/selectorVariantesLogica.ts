/**
 * Lógica pura del `SelectorVariantes` (Figma `VariantModifierDialog` 155:7980):
 * cómo se nombran los atributos en el subtítulo, la etiqueta del resumen, la
 * cantidad y el total del botón. Sin React: se prueba sola.
 *
 * Las reglas de negocio (qué variante coincide, qué opciones pide cada grupo,
 * cuándo se puede agregar) NO viven aquí: las decide la pantalla con
 * `src/lib/pos/venta/modificadores.ts` y llegan ya resueltas por props.
 */

/** Tope de la cantidad del selector (el mismo orden de magnitud que el carrito). */
export const CANTIDAD_MAXIMA_SELECTOR = 9999;

/**
 * Nombre de atributo dentro de una frase: «Talla» → «talla», pero una sigla
 * («RAM», «SKU») o un nombre que empieza con dos mayúsculas se deja igual.
 */
export function nombreEnFrase(nombre: string, locale = 'es-CO'): string {
  const limpio = nombre.trim();
  if (limpio.length < 2) return limpio.toLocaleLowerCase(locale);
  const segunda = limpio.charAt(1);
  if (segunda !== segunda.toLocaleLowerCase(locale)) return limpio;
  return limpio.charAt(0).toLocaleLowerCase(locale) + limpio.slice(1);
}

/** «talla y color», «talla, color y material» (según el idioma activo). */
export function atributosEnFrase(nombres: string[], locale = 'es-CO'): string {
  const enFrase = nombres.map((n) => nombreEnFrase(n, locale)).filter(Boolean);
  if (enFrase.length === 0) return '';
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(enFrase);
  } catch {
    return enFrase.join(', ');
  }
}

/** Resumen de la variante elegida: «40 · Negro · ZAP-0042-40-NEG». */
export function etiquetaResumenVariante(valores: Array<string | null | undefined>, sku?: string | null): string {
  return [...valores, sku]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

/** Cantidad válida del selector: entero entre 1 y el tope. */
export function acotarCantidad(n: number, maximo = CANTIDAD_MAXIMA_SELECTOR): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.trunc(n)), maximo);
}

/** Total del botón «Agregar N · $ total» (null si la variante no tiene precio). */
export function totalSelector(precioUnitario: number | null | undefined, cantidad: number): number | null {
  if (precioUnitario === null || precioUnitario === undefined) return null;
  return precioUnitario * acotarCantidad(cantidad);
}
