/**
 * Tasa de comisión de un vendedor desde `vendor_commission_rates`, con el
 * cliente que se le pase (navegador o sesión del servidor). Es la ÚNICA
 * cadena de resolución: la usan `useCommissionRate` (formularios de factura y
 * POS) y la conversión de cotización a factura en el servidor.
 *
 * 1. Tasa del vendedor (salesperson_id = vendedor), la más reciente, si está vigente.
 * 2. Tasa general de la organización (salesperson_id IS NULL), si está vigente.
 * 3. 0 (sin comisión).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

interface FilaTasa {
  rate: number | string | null;
  valid_from: string | null;
  valid_to: string | null;
}

function vigente(fila: FilaTasa, ahora: Date): boolean {
  if (fila.valid_from && ahora < new Date(fila.valid_from)) return false;
  if (fila.valid_to && ahora > new Date(fila.valid_to)) return false;
  return true;
}

type ClienteLectura = Pick<SupabaseClient, 'from'>;

export async function resolverTasaComision(
  client: ClienteLectura,
  organizationId: number,
  salespersonId: string | null | undefined,
  ahora: Date = new Date(),
): Promise<number> {
  if (!salespersonId || !organizationId) return 0;

  const { data: delVendedor } = await client
    .from('vendor_commission_rates')
    .select('rate, valid_from, valid_to')
    .eq('organization_id', organizationId)
    .eq('salesperson_id', salespersonId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (delVendedor && vigente(delVendedor as FilaTasa, ahora)) {
    return Number((delVendedor as FilaTasa).rate) || 0;
  }

  const { data: general } = await client
    .from('vendor_commission_rates')
    .select('rate, valid_from, valid_to')
    .eq('organization_id', organizationId)
    .is('salesperson_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (general) {
    return vigente(general as FilaTasa, ahora) ? Number((general as FilaTasa).rate) || 0 : 0;
  }
  return 0;
}
