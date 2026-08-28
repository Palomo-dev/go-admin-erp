"use client";
import { useEffect } from "react";
import { initSentryMobile } from "@/lib/utils/sentryMobile";

/**
 * Componente invisible que inicializa Sentry Capacitor al montar.
 * Solo ejecuta init en contexto móvil; en web/desktop es no-op.
 */
export function SentryMobileInit() {
  useEffect(() => {
    initSentryMobile();
  }, []);

  return null;
}
