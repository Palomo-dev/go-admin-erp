/**
 * Límites y ventanas de las rutas de la Fase 4 de la pantalla del cliente
 * (calificación y cartelera del reposo). SOLO servidor.
 *
 * Viven aquí y no en los `route.ts` porque un route handler solo puede
 * exportar handlers y opciones de segmento: cualquier otra exportación rompe
 * la comprobación de tipos de `next build` (mismo motivo por el que
 * `PAIR_RATE_LIMIT` vive en displayTokens.ts).
 */

/** Calificaciones: una por venta, así que 20 por minuto y terminal solo frena una ráfaga. */
export const FEEDBACK_RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 } as const;
export const FEEDBACK_RATE_LIMIT_PREFIX = 'pos-display:feedback:terminal:';

/**
 * Ventana de la calificación SIN venta. La definición está en `feedback.ts`
 * (módulo puro, lado caja) y se re-exporta aquí: la caja y el servidor deben
 * decidir «repetida» con el MISMO número. Cuando eran dos constantes, la de
 * la caja ni siquiera se consultaba (ronda 1, defecto alto). CLAUDE.md §7.
 */
export { FEEDBACK_ANONYMOUS_WINDOW_MS } from '../feedback';

/**
 * Cuántas filas de `promotions` lee la cartelera antes de filtrar en memoria
 * por vigencia, día de la semana y sucursal. Holgado respecto a las diez que
 * se rotan: si se recortara antes de filtrar, un comercio con muchas
 * promociones de otros días se quedaría sin cartel.
 */
export const PROMOTIONS_READ_LIMIT = 200;

/** La pantalla relee la cartelera cada pocos minutos; 10 por minuto y terminal sobra. */
export const PROMOTIONS_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 } as const;
export const PROMOTIONS_RATE_LIMIT_PREFIX = 'pos-display:promotions:terminal:';
