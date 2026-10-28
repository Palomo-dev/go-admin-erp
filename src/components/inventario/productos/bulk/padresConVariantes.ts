/**
 * Solo lectura: qué productos de la lista son padres con variantes vivas (no eliminadas). El stock vive en
 * las variantes (la migración 20261027214000 lo bloquea en la base): el ajuste masivo omite a esos padres y
 * el importador no les carga stock. Recibe el cliente para servir en el navegador y en el servidor.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { partirEnLotes } from './ajusteMasivoStock';

export async function padresConVariantes(cliente: SupabaseClient, organizationId: number, ids: number[]): Promise<Set<number>> {
  const padres = new Set<number>();
  for (const lote of partirEnLotes(ids)) {
    const { data, error } = await cliente
      .from('products')
      .select('parent_product_id')
      .eq('organization_id', organizationId)
      .in('parent_product_id', lote)
      .neq('status', 'deleted');
    if (error) throw error;
    for (const fila of (data ?? []) as { parent_product_id: number | null }[]) {
      if (fila.parent_product_id !== null) padres.add(Number(fila.parent_product_id));
    }
  }
  return padres;
}
