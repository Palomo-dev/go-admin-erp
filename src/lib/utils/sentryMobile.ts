/**
 * Inicializa Sentry en el contexto móvil (Capacitor).
 *
 * @sentry/capacitor enruta errores nativos (iOS/Android) a Sentry,
 * mientras @sentry/react aporta integraciones de browser tracing.
 * Usa el mismo DSN que la app web (Sentry diferencia por platform tag).
 *
 * IMPORTANTE — por qué los `import` viven DENTRO de la función:
 * este módulo lo monta `SentryMobileInit`, que cuelga del layout raíz, así que
 * un `import` estático arrastra `@sentry/capacitor` y `@sentry/react` al chunk
 * del layout **también en web**, donde `isMobile()` es falso y no se usan nunca.
 * En desarrollo ese chunk va sin minificar y llegó a pesar 6,7 MB, de los cuales
 * Sentry era la mayor parte; el navegador agotaba el tiempo de espera al cargarlo
 * y la app no arrancaba con `ChunkLoadError: Loading chunk app/layout failed`.
 * Con la importación diferida, el SDK móvil solo se descarga cuando de verdad se
 * está en un dispositivo. Sentry web se sigue inicializando por su vía propia
 * (`sentry.client.config.ts`), que Next carga en su propio bundle.
 */

import { isMobile } from "@/lib/utils/mobile";

export async function initSentryMobile(): Promise<void> {
  if (!isMobile()) return;

  try {
    const [SentryCapacitor, SentryReact] = await Promise.all([
      import("@sentry/capacitor"),
      import("@sentry/react"),
    ]);

    SentryCapacitor.init(
      {
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 0.1,
        environment: process.env.NODE_ENV,
        release: `goadmin-mobile@${process.env.npm_package_version}`,
        enableLogs: true,
      },
      SentryReact.init
    );
  } catch (e) {
    console.warn("[sentry] Error inicializando Sentry Capacitor", e);
  }
}
