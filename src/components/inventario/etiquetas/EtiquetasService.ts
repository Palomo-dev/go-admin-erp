import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ProductTag } from './types';

/**
 * Etiquetas de producto (tags de clasificación). El listado, la fusión y el
 * borrado van por RPC (migración 20260924031000): una sola consulta con los
 * productos de cada etiqueta —relaciones y la columna heredada
 * `products.tag_id`— y su uso en reglas de categoría, en lugar de una
 * petición por etiqueta. Crear y renombrar van por `fn_etiqueta_guardar`
 * (migración 20260929021000): todas las escrituras exigen el permiso de
 * catálogo en el servidor.
 */
export class EtiquetasService {
  static async obtenerEtiquetas(): Promise<ProductTag[]> {
    const organizationId = getOrganizationId();
    const { data, error } = await supabase.rpc('etiquetas_producto_listado', { p_org: organizationId });
    if (error) throw error;
    return ((data ?? []) as Array<ProductTag & { productos: number; reglas: number; regla_categoria: string | null }>).map((t) => ({
      id: Number(t.id),
      organization_id: organizationId,
      name: t.name,
      color: t.color || '#3B82F6',
      created_at: t.created_at,
      product_count: Number(t.productos) || 0,
      rule_count: Number(t.reglas) || 0,
      rule_category: t.regla_categoria,
    }));
  }

  /** Productos etiquetados (sin repetir) y total del catálogo. */
  static async obtenerResumen(): Promise<{ etiquetados: number; total: number }> {
    const { data, error } = await supabase.rpc('etiquetas_producto_resumen', { p_org: getOrganizationId() });
    if (error) throw error;
    const r = (data ?? {}) as { productos_etiquetados?: number; productos_total?: number };
    return { etiquetados: Number(r.productos_etiquetados) || 0, total: Number(r.productos_total) || 0 };
  }

  static async obtenerEtiquetaPorId(id: number): Promise<ProductTag | null> {
    const { data, error } = await supabase
      .from('product_tags')
      .select('*')
      .eq('id', id)
      .eq('organization_id', getOrganizationId())
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Crear o renombrar por `fn_etiqueta_guardar`: permiso de catálogo en el
   * servidor y nombre único sin distinguir mayúsculas (23505 si ya existe).
   */
  static async guardarEtiqueta(id: number | null, datos: { name: string; color: string }): Promise<ProductTag> {
    const organizationId = getOrganizationId();
    const { data, error } = await supabase.rpc('fn_etiqueta_guardar', {
      p_org: organizationId,
      p_id: id,
      p_nombre: datos.name.trim(),
      p_color: datos.color,
    });
    if (error) throw error;
    const r = (data ?? {}) as { id: number; name: string; color: string; created_at?: string };
    return { id: Number(r.id), organization_id: organizationId, name: r.name, color: r.color, created_at: r.created_at };
  }

  static async crearEtiqueta(datos: { name: string; color: string }): Promise<ProductTag> {
    return this.guardarEtiqueta(null, datos);
  }

  static async actualizarEtiqueta(id: number, datos: { name: string; color: string }): Promise<ProductTag> {
    return this.guardarEtiqueta(id, datos);
  }

  /** Borra etiquetas (sus productos las pierden). Falla si alguna está en una regla de categoría. */
  static async eliminarEtiquetas(ids: number[]): Promise<number> {
    const { data, error } = await supabase.rpc('etiquetas_producto_eliminar', { p_org: getOrganizationId(), p_ids: ids });
    if (error) throw error;
    return Number(data) || 0;
  }

  static async eliminarEtiqueta(id: number): Promise<void> {
    await this.eliminarEtiquetas([id]);
  }

  /** Pasa productos y reglas de `origenes` a `destino` y borra las de origen. */
  static async fusionarEtiquetas(destino: number, origenes: number[]): Promise<number> {
    const { data, error } = await supabase.rpc('etiquetas_producto_fusionar', {
      p_org: getOrganizationId(),
      p_destino: destino,
      p_origenes: origenes,
    });
    if (error) throw error;
    return Number(data) || 0;
  }

  static async duplicarEtiqueta(id: number, sufijo: string): Promise<ProductTag> {
    const original = await this.obtenerEtiquetaPorId(id);
    if (!original) throw new Error('not_found');
    return this.crearEtiqueta({ name: `${original.name} ${sufijo}`, color: original.color });
  }
}
