/**
 * Lectura del recaudo por medio de pago (`fn_recaudo_pagos`, migración 20261126020000).
 *
 * La función es SECURITY INVOKER: corre con la sesión de quien llama y RLS de `payments`,
 * `invoice_sales` y `web_orders` decide qué filas ve (pertenencia y acceso por sede). Aquí solo se
 * pagina y se clasifica con `recaudoPorMedio.ts`; no hay ninguna regla de negocio en este archivo.
 * En el navegador se usa el cliente de la sesión (`@/lib/supabase/config`); en un route handler,
 * el de `getServerOrgContext()`. Nunca el service role (la función no filtra por pertenencia).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as clienteNavegador } from '@/lib/supabase/config';
import { leerPaginado } from '@/lib/services/reportes/leerPaginado';
import { pagoDeFila, type FilaRecaudoBD, type PagoRecaudo } from '@/lib/finanzas/recaudo/recaudoPorMedio';

/** Desde el primer pago posible (periodo «Todo»). */
const INICIO_DE_LOS_TIEMPOS = '2000-01-01T00:00:00Z';

export interface RangoInstantes {
  /** ISO con offset (inicio del primer día en la zona de la organización). */
  desde?: string | null;
  /** ISO con offset (fin del último día); sin él, hasta ahora. */
  hasta?: string | null;
}

export async function leerPagosRecaudo(
  organizacionId: number,
  rango: RangoInstantes,
  sedeId?: number | null,
  cliente: SupabaseClient = clienteNavegador,
): Promise<PagoRecaudo[]> {
  const desde = rango.desde || INICIO_DE_LOS_TIEMPOS;
  const hasta = rango.hasta || new Date().toISOString();
  const filas = await leerPaginado<FilaRecaudoBD>((a, b) =>
    cliente
      .rpc('fn_recaudo_pagos', {
        p_organization_id: organizacionId,
        p_desde: desde,
        p_hasta: hasta,
        p_branch_id: sedeId ?? null,
      })
      .range(a, b) as unknown as PromiseLike<{ data: FilaRecaudoBD[] | null; error: unknown }>,
  );
  return filas.map(pagoDeFila);
}
