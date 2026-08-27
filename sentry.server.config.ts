/**
 * Sentry server config - deshabilitado para evitar OOM en build de Vercel.
 *
 * @sentry/nextjs tiene plugins de webpack que consumen ~1GB durante el build.
 * Sentry client-side funciona via @sentry/react en sentry.client.config.ts.
 * Para reactivar server-side: instalar @sentry/node e importarlo aquí.
 */
// No-op: Sentry server-side deshabilitado para evitar OOM en Vercel.
