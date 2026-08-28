/**
 * Instrumentation hook de Next.js.
 *
 * Sentry server-side se maneja via @sentry/react en el cliente.
 * El server no inicializa Sentry para evitar OOM en el build de Vercel.
 */
export async function register() {
  // No-op: Sentry se inicializa en sentry.client.config.ts (cliente solo)
}
