/**
 * Eventos a los que puede suscribirse un webhook saliente (`webhook_endpoints.events`).
 * Módulo puro compartido por el servidor (validación) y el diálogo del navegador (casillas),
 * igual que `alcancesLlave.ts`. La lista es la que ofrecía la página vieja de Webhooks salientes.
 */
export const EVENTOS_WEBHOOK = [
  'order.created',
  'order.updated',
  'order.completed',
  'order.cancelled',
  'product.created',
  'product.updated',
  'product.deleted',
  'inventory.low_stock',
  'inventory.updated',
  'customer.created',
  'payment.received',
  'payment.refunded',
] as const;

export type EventoWebhook = (typeof EVENTOS_WEBHOOK)[number];

/** Clave i18n de un evento (`order.created` → `order_created`). */
export const claveEventoWebhook = (e: string): string => e.replace(/\./g, '_');
