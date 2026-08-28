/**
 * Inicializa Sentry en el contexto móvil (Capacitor).
 *
 * @sentry/capacitor enruta errores nativos (iOS/Android) a Sentry,
 * mientras @sentry/react aporta integraciones de browser tracing.
 * Usa el mismo DSN que la app web (Sentry diferencia por platform tag).
 */

import * as SentryCapacitor from "@sentry/capacitor";
import * as SentryReact from "@sentry/react";
import { isMobile } from "@/lib/utils/mobile";

export async function initSentryMobile(): Promise<void> {
  if (!isMobile()) return;

  try {
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
