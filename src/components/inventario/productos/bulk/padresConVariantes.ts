/**
 * Solo lectura: qué productos de la lista son padres con variantes vivas. El ajuste masivo los omite
 * porque el stock vive en las variantes (la migración 20261027214000 lo bloquea en la base).
 */
import { supabase } from '@/lib/supabase/config';
import { partirEnLotes } from './ajusteMasivoStock';

/** Padres (de la lista) que tienen variantes vivas. */
export async function padresConVariantes(organizationId: number, ids: number[]): Promise<Set<number>> {
  const padres = new Set<number>();
  for (const lote of partirEnLotes(ids)) {
    const { data, error } = await supabase
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
