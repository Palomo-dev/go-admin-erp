import { supabase } from '@/lib/supabase/config';
import { filasParaGuardar, leerFilasPropias, type FilaFichaPropia } from '@/lib/website/v2/seccionesFicha';

/**
 * Datos de la pestaña «Tienda» del producto: relacionados elegidos a mano (`product_relations`) y
 * filas propias de la ficha técnica (`products.specifications`). Migración
 * 20261124190000_ficha_relacionados_y_ficha_tecnica.
 *
 * RLS por pertenencia a la organización (leer: miembro; escribir: miembro activo) y un trigger que
 * rechaza colgar un producto de otra organización. Todas las consultas filtran además por la
 * organización de la sesión. La tienda lee lo mismo con service role y caché del catálogo: después
 * de guardar, `avisarCambioCatalogo()` (lo llama la pantalla).
 */

export type TipoRelacion = 'related' | 'bought_together';

export interface ProductoRelacionado {
  id: number;
  nombre: string;
  sku: string | null;
}

export const MAX_RELACIONADOS_A_MANO = 12;

interface FilaRelacion {
  related_product_id: number;
  kind: TipoRelacion;
  position: number;
  producto: { id: number; name: string; sku: string | null } | null;
}

export async function cargarRelaciones(organizacionId: number, productoId: number): Promise<Record<TipoRelacion, ProductoRelacionado[]>> {
  const { data, error } = await supabase
    .from('product_relations')
    .select('related_product_id, kind, position, producto:products!product_relations_related_product_id_fkey(id, name, sku)')
    .eq('organization_id', organizacionId)
    .eq('product_id', productoId)
    .order('position', { ascending: true });
  if (error) throw error;
  const salida: Record<TipoRelacion, ProductoRelacionado[]> = { related: [], bought_together: [] };
  for (const fila of (data ?? []) as unknown as FilaRelacion[]) {
    if (!fila.producto) continue;
    salida[fila.kind]?.push({ id: fila.producto.id, nombre: fila.producto.name, sku: fila.producto.sku });
  }
  return salida;
}

/**
 * Deja la lista de un tipo exactamente como `ids` (en ese orden): actualiza la posición de los que
 * siguen, agrega los nuevos y borra los que salieron. Sin ventana con la lista vacía.
 */
export async function guardarRelaciones(organizacionId: number, productoId: number, tipo: TipoRelacion, ids: readonly number[]): Promise<void> {
  const unicos = [...new Set(ids)].filter((id) => id !== productoId).slice(0, MAX_RELACIONADOS_A_MANO);
  if (unicos.length > 0) {
    const { error } = await supabase.from('product_relations').upsert(
      unicos.map((id, position) => ({ organization_id: organizacionId, product_id: productoId, related_product_id: id, kind: tipo, position })),
      { onConflict: 'product_id,related_product_id,kind' },
    );
    if (error) throw error;
  }
  let borrar = supabase.from('product_relations').delete().eq('organization_id', organizacionId).eq('product_id', productoId).eq('kind', tipo);
  if (unicos.length > 0) borrar = borrar.not('related_product_id', 'in', `(${unicos.join(',')})`);
  const { error } = await borrar;
  if (error) throw error;
}

/** Productos de la organización para elegir (activos, sin variantes sueltas: la tienda muestra el padre). */
export async function buscarProductosTienda(organizacionId: number, texto: string, excluir: readonly number[], senal?: AbortSignal): Promise<ProductoRelacionado[]> {
  let q = supabase
    .from('products')
    .select('id, name, sku')
    .eq('organization_id', organizacionId)
    .eq('status', 'active')
    .is('parent_product_id', null)
    .order('name', { ascending: true })
    .limit(20);
  const limpio = texto.trim().replace(/[%,()]/g, ' ').trim();
  if (limpio) q = q.or(`name.ilike.%${limpio}%,sku.ilike.%${limpio}%`);
  if (senal) q = q.abortSignal(senal);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as { id: number; name: string; sku: string | null }[])
    .filter((p) => !excluir.includes(p.id))
    .map((p) => ({ id: p.id, nombre: p.name, sku: p.sku }));
}

export async function cargarFichaTecnica(organizacionId: number, productoId: number): Promise<FilaFichaPropia[]> {
  const { data, error } = await supabase
    .from('products')
    .select('specifications')
    .eq('organization_id', organizacionId)
    .eq('id', productoId)
    .maybeSingle();
  if (error) throw error;
  return leerFilasPropias((data as { specifications?: unknown } | null)?.specifications);
}

export async function guardarFichaTecnica(organizacionId: number, productoId: number, filas: readonly { nombre: string; valor: string }[]): Promise<FilaFichaPropia[]> {
  const valor = filasParaGuardar(filas);
  const { error } = await supabase
    .from('products')
    .update({ specifications: valor })
    .eq('organization_id', organizacionId)
    .eq('id', productoId);
  if (error) throw error;
  return valor ?? [];
}
