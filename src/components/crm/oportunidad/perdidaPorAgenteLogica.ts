/**
 * Franja del agente de voz en el detalle de la oportunidad (Figma: sección
 * «CRM · Voz — desinterés definitivo…», componente
 * `VozDesinteres/AvisoPerdidaAgente`). Sin React.
 *
 * - `perdida`: la oportunidad está perdida y el ÚLTIMO cambio de etapa lo hizo
 *   el agente (`metadata.cierre_agente_voz`, que `changeStage` borra en
 *   cualquier otro cambio de etapa). Motivo, resumen, enlace a la llamada y
 *   «Reabrir» (a la etapa en la que estaba, si sigue abierta en el pipeline).
 * - `decidir`: se llegó desde el aviso del agente (`?llamada=<calls.id>`) y la
 *   oportunidad sigue abierta: el agente dejó la decisión al vendedor.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FranjaAgenteVoz =
  | { tipo: 'perdida'; en: string | null; motivo: string | null; resumen: string | null; callId: string | null; etapaAnteriorId: string | null }
  | { tipo: 'decidir'; callId: string };

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function uuid(v: unknown): string | null {
  return typeof v === 'string' && UUID.test(v) ? v : null;
}

export function franjaAgenteVoz(
  op: { status: string | null; metadata?: Record<string, unknown> | null } | null | undefined,
  llamadaParam: string | null | undefined,
): FranjaAgenteVoz | null {
  if (!op) return null;
  const m = op.metadata?.cierre_agente_voz;
  if (op.status === 'lost' && m && typeof m === 'object' && !Array.isArray(m)) {
    const c = m as Record<string, unknown>;
    return {
      tipo: 'perdida',
      en: texto(c.at),
      motivo: texto(c.motivo),
      resumen: texto(c.resumen),
      callId: uuid(c.call_id) ?? uuid(llamadaParam),
      etapaAnteriorId: uuid(c.etapa_anterior_id),
    };
  }
  const llamada = uuid(llamadaParam);
  if ((op.status === 'open' || op.status === null) && llamada) return { tipo: 'decidir', callId: llamada };
  return null;
}

/** Enlace a la llamada en Llamadas (`?call=` abre la hoja de detalle). */
export function enlaceLlamada(callId: string): string {
  return `/app/crm/llamadas?call=${encodeURIComponent(callId)}`;
}

/** Etapa a la que vuelve «Reabrir»: la anterior si sigue siendo abierta; si no, la primera abierta. */
export function etapaParaReabrir(
  etapas: ReadonlyArray<{ id: string; position: number; is_won?: boolean | null; is_lost?: boolean | null }>,
  anteriorId: string | null,
): string | null {
  const abiertas = etapas.filter((e) => !e.is_won && !e.is_lost).sort((a, b) => a.position - b.position);
  if (anteriorId && abiertas.some((e) => e.id === anteriorId)) return anteriorId;
  return abiertas[0]?.id ?? null;
}
