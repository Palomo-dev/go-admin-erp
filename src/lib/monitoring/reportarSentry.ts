'use client';

/**
 * Reporte a Sentry desde el cliente con carga diferida del SDK (como
 * `SentryErrorBoundary`: `@sentry/react` no entra en el chunk inicial).
 * Paquete 5-nov, A5: fallos de /importar/lote y llegadas al login por
 * `corrupted-session`, con organización y número de bloque.
 */
export interface ContextoReporte {
  /** Etiqueta corta para agrupar en Sentry (p. ej. `importar_lote`). */
  area: string;
  orgId?: number | null;
  [clave: string]: string | number | boolean | null | undefined;
}

export function reportarSentry(error: unknown, contexto: ContextoReporte): void {
  if (typeof window === 'undefined') return;
  const { area, orgId, ...extra } = contexto;
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        scope.setTag('area', area);
        if (orgId) scope.setTag('organization_id', String(orgId));
        for (const [k, v] of Object.entries(extra)) if (v !== undefined) scope.setExtra(k, v);
        if (error instanceof Error) Sentry.captureException(error);
        else Sentry.captureMessage(typeof error === 'string' ? error : `[${area}] ${JSON.stringify(error)}`, 'warning');
      });
    })
    .catch((err) => console.error('[sentry] No se pudo reportar', err, error));
}

/** Organización activa leída de la cookie `org_id` (sin depender de la sesión). */
export function orgIdDeCookie(): number | null {
  if (typeof document === 'undefined') return null;
  const m = /(?:^|;\s*)org_id=(\d+)/.exec(document.cookie);
  return m ? Number(m[1]) : null;
}
