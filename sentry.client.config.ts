/**
 * Sentry client config - cargado dinámicamente para evitar OOM en build.
 *
 * Next.js detecta automáticamente `sentry.client.config.ts` y lo incluye
 * en el bundle. Al usar import dinámico, el SDK de Sentry no se carga
 * durante la compilación de webpack, solo en runtime en el navegador.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== 'undefined') {
  import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      release: `goadmin-web@${process.env.npm_package_version}`,
    });
  }).catch(() => {
    // Sentry no disponible, ignorar
  });
}
