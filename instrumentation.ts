/**
 * Instrumentation hook de Next.js.
 *
 * Sentry se inicializa solo en runtime (no durante el build) para evitar OOM
 * en Vercel. El import dinámico con `process.env.NEXT_RUNTIME` asegura que
 * el código de Sentry no se cargue durante la compilación de webpack.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
    try {
      await import('./sentry.server.config');
    } catch (e) {
      console.warn('[Sentry] No se pudo inicializar server config:', e);
    }
  }
}

/**
 * Captura errores de server components en runtime.
 * Usa import dinámico para no cargar Sentry durante el build.
 */
export async function onRequestError(
  error: Error & { digest?: string },
  request: { path: string; method: string },
) {
  if (process.env.NODE_ENV === 'production') {
    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureRequestError(error, request);
    } catch {
      // Sentry no disponible, ignorar
    }
  }
}
