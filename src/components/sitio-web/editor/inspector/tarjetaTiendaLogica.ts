/**
 * Lógica pura de los controles nuevos de «Tarjeta de producto» para las plantillas de tienda
 * (PLANO §2 ítems 1-9, Figma B1). Sin React: la prueba `__tests__/tarjetaPlantillasTienda.test.tsx`.
 *
 * Regla: la opción «como hoy» de cada lista NO escribe la clave (la borra), y así el sitio pinta la
 * tarjeta de hoy. Única excepción: una sección que hereda del sitio un valor distinto necesita
 * escribir el de hoy explícito para pisarlo (si no, al borrar volvería a heredar el del sitio).
 */
import {
  FUENTES_TITULO,
  POSICIONES_FAVORITO,
  PREFIJOS_PRECIO,
  SUBTITULOS_TARJETA,
  TRANSICIONES_HOVER_IMAGEN,
  normalizarTarjeta,
  type EstiloTarjetaProducto,
} from '@/lib/website/tarjetaProducto';

/**
 * Valor de cada clave nueva que equivale a la tarjeta de hoy (el que el sitio usa sin la clave).
 * `wishlist_style` no tiene: sin la clave lo decide `card_buttons` de la sección.
 */
export const HOY_TARJETA_TIENDA = {
  card_subtitle: SUBTITULOS_TARJETA[0],
  price_prefix: PREFIJOS_PRECIO[0],
  title_font: FUENTES_TITULO[0],
  wishlist_position: POSICIONES_FAVORITO[0],
  hover_image_transition: TRANSICIONES_HOVER_IMAGEN[0],
} as const satisfies Partial<Record<keyof EstiloTarjetaProducto, string>>;

/** Claves de lista nuevas que editan los controles (con o sin valor «de hoy» explícito). */
export type ClaveListaTienda = keyof typeof HOY_TARJETA_TIENDA | 'wishlist_style';

/** Opción «como hoy» de las listas: no es un valor del contrato, es «sin la clave». */
export const OPCION_HOY = '' as const;

function valorDe(estilo: unknown, clave: ClaveListaTienda): string | undefined {
  const v = normalizarTarjeta(estilo)?.[clave];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Qué escribir al elegir una opción. Un valor del contrato se escribe tal cual; «como hoy» (`''`)
 * borra la clave (`null`), salvo que lo heredado del sitio sea otro: entonces el de hoy explícito.
 */
export function valorAlElegirTarjeta(clave: ClaveListaTienda, elegido: string, heredado: unknown): string | null {
  if (elegido !== OPCION_HOY) return elegido;
  if (clave === 'wishlist_style') return null;
  const hoy = HOY_TARJETA_TIENDA[clave];
  const delSitio = valorDe(heredado, clave);
  return delSitio && delSitio !== hoy ? hoy : null;
}

/** Opción que muestra la lista: el valor efectivo, o «como hoy» si no hay o equivale al de hoy. */
export function opcionVisibleTarjeta(clave: ClaveListaTienda, vista: EstiloTarjetaProducto): string {
  const v = vista[clave];
  if (typeof v !== 'string') return OPCION_HOY;
  if (clave !== 'wishlist_style' && v === HOY_TARJETA_TIENDA[clave]) return OPCION_HOY;
  return v;
}

/**
 * Texto del botón «Elegir» al confirmarlo (blur o Enter): espacios colapsados y recortado al
 * máximo del contrato. Vacío = `null` (borra la clave: el texto de hoy).
 */
export function textoElegirAlGuardar(borrador: string, maximo: number): string | null {
  const limpio = borrador.replace(/\s+/g, ' ').trim().slice(0, maximo).trim();
  return limpio ? limpio : null;
}
