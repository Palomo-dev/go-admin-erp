/**
 * Tasa de comisión de un vendedor, con el cliente que se le pase (navegador o
 * sesión del servidor). La usan `useCommissionRate` (formularios de factura y
 * POS) y la conversión de cotización a factura en el servidor.
 *
 * La resolución vive en UN solo sitio: la RPC `fn_tasa_comision_vigente`
 * (migración 20260928180000), la misma que usa el CRM (`commissionService`):
 *   1. Tasa del vendedor vigente HOY.
 *   2. Si no hay, la tasa general de la organización vigente hoy.
 *   3. 0 (sin comisión).
 * «Hoy» es el día calendario de la organización (`fn_today_for_org`, su zona
 * horaria), y `valid_from` / `valid_to` son columnas `date` que se comparan
 * como días, ambos inclusivos.
 *
 * Antes se comparaba aquí `new Date()` contra `new Date('YYYY-MM-DD')`, que es
 * la medianoche UTC: en Bogotá una tasa dejaba de valer a las 19:00 del día
 * anterior a su `valid_to` y empezaba a valer a las 19:00 del día anterior a
 * su `valid_from`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type ClienteLectura = Pick<SupabaseClient, 'rpc'>;

export async function resolverTasaComision(
  client: ClienteLectura,
  organizationId: number,
  salespersonId: string | null | undefined,
): Promise<number> {
  if (!salespersonId || !organizationId) return 0;

  const { data, error } = await client.rpc('fn_tasa_comision_vigente', {
    p_org: organizationId,
    p_salesperson: salespersonId,
    p_incluir_general: true,
  });
  if (error) throw error;
  const tasa = Number(data);
  return Number.isFinite(tasa) && tasa > 0 ? tasa : 0;
}
