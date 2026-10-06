/**
 * Periodo actual de una suscripción de Stripe.
 *
 * Desde las versiones «basil» de la API, `current_period_start` y `current_period_end`
 * viven en cada ítem (`items.data[0]`) y ya no en la suscripción. Se leen primero del
 * ítem y, si no están, del nivel superior (versiones anteriores). Un único punto de
 * lectura para el webhook, el servicio de suscripciones y el checkout de plan.
 */
type ConPeriodo = { current_period_start?: number | null; current_period_end?: number | null };

export type SuscripcionConPeriodo = ConPeriodo & { items?: { data?: ConPeriodo[] } | null };

function aFecha(segundos: number | null | undefined): Date | null {
  return typeof segundos === 'number' && Number.isFinite(segundos) ? new Date(segundos * 1000) : null;
}

export function periodoSuscripcion(suscripcion: unknown): { inicio: Date | null; fin: Date | null } {
  const s = (suscripcion ?? {}) as SuscripcionConPeriodo;
  const item = s.items?.data?.[0] ?? {};
  return {
    inicio: aFecha(item.current_period_start) ?? aFecha(s.current_period_start),
    fin: aFecha(item.current_period_end) ?? aFecha(s.current_period_end),
  };
}

/** Igual que `periodoSuscripcion`, en ISO (o null) para escribir en la base. */
export function periodoSuscripcionISO(suscripcion: unknown): { inicio: string | null; fin: string | null } {
  const { inicio, fin } = periodoSuscripcion(suscripcion);
  return { inicio: inicio?.toISOString() ?? null, fin: fin?.toISOString() ?? null };
}
