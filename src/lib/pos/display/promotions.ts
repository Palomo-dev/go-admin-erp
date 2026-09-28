/**
 * Promociones tal como las ve la PANTALLA del cliente en reposo (Fase 4,
 * PLAN §5.2 modo «promociones»). Módulo PURO: lo comparten la ruta de
 * servidor (`/api/pos/display/promotions`, que proyecta las filas) y la
 * pantalla (que sanea lo que recibe). Sin Supabase, sin React.
 *
 * Solo viaja lo que se pinta —nombre, descripción corta y vigencia— y nunca
 * los importes ni las reglas de la promoción: la pantalla es un cartel y no
 * debe poder contradecir a `promotionEngine`, que es quien decide de verdad
 * el descuento de una venta.
 */

/** Cuántas promociones rota la pantalla como mucho (8 s cada una: 10 son más de un minuto de ciclo). */
export const DISPLAY_PROMOTIONS_MAX = 10;

/** Descripción «corta»: lo que cabe sin convertir el cartel en un párrafo. */
export const PROMOTION_DESCRIPTION_MAX_CHARS = 160;

export interface DisplayPromotion {
  id: string;
  name: string;
  /** Descripción recortada a PROMOTION_DESCRIPTION_MAX_CHARS, o null. */
  description: string | null;
  /** ISO 8601 de `promotions.end_date`, o null si no vence. */
  endsAt: string | null;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Recorta en el último espacio antes del límite y remata con «…»; nunca parte una palabra por la mitad. */
export function shortenDescription(value: unknown, max: number = PROMOTION_DESCRIPTION_MAX_CHARS): string | null {
  const raw = text(value);
  if (raw === null) return null;
  // Los saltos de línea se vuelven espacios: el cartel es una sola frase.
  const flat = raw.replace(/\s+/g, ' ');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Proyecta una fila de `promotions` (o cualquier cosa que llegue por la red)
 * a lo que la pantalla pinta. null si no tiene id y nombre: una promoción sin
 * nombre no es un cartel.
 */
export function toDisplayPromotion(row: unknown): DisplayPromotion | null {
  if (typeof row !== 'object' || row === null) return null;
  const value = row as Record<string, unknown>;
  const id = text(value.id);
  const name = text(value.name);
  if (id === null || name === null) return null;
  return {
    id,
    name,
    description: shortenDescription(value.description),
    endsAt: text(value.endsAt) ?? text(value.end_date),
  };
}

/** Sanea la lista que devuelve la ruta: descarta lo que no sea promoción y recorta al máximo. */
export function sanitizeDisplayPromotions(value: unknown): DisplayPromotion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(toDisplayPromotion)
    .filter((p): p is DisplayPromotion => p !== null)
    .slice(0, DISPLAY_PROMOTIONS_MAX);
}
