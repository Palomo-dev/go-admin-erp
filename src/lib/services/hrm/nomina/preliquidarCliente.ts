/**
 * Puente de las pantallas viejas de nómina (`/app/hrm/nomina` y `/app/hrm/nomina/periodos/[id]`)
 * al motor del servidor (ADR-003). Reemplaza a `payrollCalculationService.ts`, que
 * calculaba en el navegador con el error de escala ×100. Esas pantallas se
 * reemplazan con el diseño nuevo; mientras tanto, «Calcular» preliquida en el servidor.
 *
 * La organización y el actor salen de la sesión en la ruta, nunca de aquí.
 */
export interface ResumenPreliquidacion {
  created: number;
  errors: number;
  totals: { net_pay: number; gross_pay: number };
  soloPreliquidacion: boolean;
}

export async function preliquidarPeriodo(periodoId: string): Promise<ResumenPreliquidacion> {
  const res = await fetch(`/api/hrm/nomina/periodos/${encodeURIComponent(periodoId)}/preliquidar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    totales?: { empleados?: number; neto?: number; devengado?: number };
    bloqueos?: unknown[];
    solo_preliquidacion?: boolean;
  };
  if (!res.ok) throw new Error(data.error || 'No se pudo preliquidar la nómina');
  return {
    created: data.totales?.empleados ?? 0,
    errors: Array.isArray(data.bloqueos) ? data.bloqueos.length : 0,
    totals: { net_pay: data.totales?.neto ?? 0, gross_pay: data.totales?.devengado ?? 0 },
    soloPreliquidacion: data.solo_preliquidacion === true,
  };
}
