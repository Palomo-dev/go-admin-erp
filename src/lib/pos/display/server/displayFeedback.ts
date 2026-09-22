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
 * Ventana en la que una calificación SIN venta (`saleId` null) se considera
 * repetida en la misma terminal. La unicidad de la base es
 * `(terminal_id, sale_id) WHERE sale_id IS NOT NULL`: sin venta no hay clave
 * que la base pueda deduplicar, así que se mira el reloj. Dos minutos cubren
 * de sobra los 8 s de «Gracias» sin tapar la calificación del cliente
 * siguiente en una caja con cola.
 */
export const FEEDBACK_ANONYMOUS_WINDOW_MS = 2 * 60 * 1000;

/** La pantalla relee la cartelera cada pocos minutos; 10 por minuto y terminal sobra. */
export const PROMOTIONS_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 } as const;
export const PROMOTIONS_RATE_LIMIT_PREFIX = 'pos-display:promotions:terminal:';
