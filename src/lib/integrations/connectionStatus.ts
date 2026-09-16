/**
 * Estados de `integration_connections.status`.
 *
 * Snapshot del CHECK real (`integration_connections_status_check`), verificado
 * por MCP de Supabase el 2026-09-15:
 *
 *   draft | connected | paused | error | revoked
 *
 * `'active'` NO es un valor válido de esta tabla. Seis webhooks lo usaban como
 * filtro y nunca encontraban la conexión: el proveedor recibía `verified: false`
 * en silencio. No confundir con `integration_credentials.status`, cuyo CHECK sí
 * es `active | expired | revoked | rotating`.
 *
 * El guardarraíl 20 de `src/__tests__/guardrails.test.ts` prohíbe volver a
 * filtrar esta tabla por `'active'`.
 */

export const INTEGRATION_CONNECTION_STATUSES = ['draft', 'connected', 'paused', 'error', 'revoked'] as const;

export type IntegrationConnectionStatus = (typeof INTEGRATION_CONNECTION_STATUSES)[number];

/**
 * Único estado con credenciales utilizables: es el que deben pedir los webhooks
 * y los sincronizadores al buscar la conexión de un proveedor.
 *
 * Debe coincidir con `STRIPE_CONNECTION_USABLE_STATUS` de
 * `src/lib/services/crm/stripePaymentLinkService.ts` (F10); el guardarraíl 20
 * comprueba que ambas sigan iguales.
 */
export const INTEGRATION_CONNECTION_USABLE_STATUS: IntegrationConnectionStatus = 'connected';
