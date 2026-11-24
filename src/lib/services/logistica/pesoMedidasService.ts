/**
 * Peso y medidas por defecto (logística Fase 1, Figma 2800:3649).
 *
 * Cadena del peso de un ítem (`resolverPeso`, presentacionEnvio.ts): el del producto
 * (`products.weight_kg` y medidas), el por defecto de su categoría (`categories.default_weight_kg`
 * y `default_length/width/height_cm`, migración 20261123153810) y el de la organización
 * (`shipping_settings.default_*`).
 *
 * Recibe el cliente Supabase de quien llama. El peso por categoría se escribe desde Inventario
 * (`categoryService`, formulario de la categoría); `shipping_settings` solo administradores.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PesoCategoria {
  id: number;
  name: string;
  default_weight_kg: number | null;
  default_length_cm: number | null;
  default_width_cm: number | null;
  default_height_cm: number | null;
}

export interface PesoOrganizacion {
  default_weight_kg: number | null;
  default_length_cm: number | null;
  default_width_cm: number | null;
  default_height_cm: number | null;
}

export interface ConteoCategoria {
  productos: number;
  conPeso: number;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export async function listarPesoCategorias(client: SupabaseClient, organizationId: number): Promise<PesoCategoria[]> {
  const { data, error } = await client
    .from('categories')
    .select('id, name, default_weight_kg, default_length_cm, default_width_cm, default_height_cm')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: Number(c.id),
    name: String(c.name ?? ''),
    default_weight_kg: num(c.default_weight_kg),
    default_length_cm: num(c.default_length_cm),
    default_width_cm: num(c.default_width_cm),
    default_height_cm: num(c.default_height_cm),
  }));
}

/** Productos por categoría y cuántos tienen peso propio (`null` = sin categoría). Lee por páginas. */
export async function contarProductosPorCategoria(client: SupabaseClient, organizationId: number): Promise<Map<number | null, ConteoCategoria>> {
  const conteo = new Map<number | null, ConteoCategoria>();
  const pagina = 1000;
  for (let desde = 0; desde < 50_000; desde += pagina) {
    const { data, error } = await client
      .from('products')
      .select('id, category_id, weight_kg')
      .eq('organization_id', organizationId)
      .order('id', { ascending: true })
      .range(desde, desde + pagina - 1);
    if (error) throw error;
    const filas = (data ?? []) as { category_id: number | null; weight_kg: number | string | null }[];
    for (const f of filas) {
      const clave = f.category_id ?? null;
      const c = conteo.get(clave) ?? { productos: 0, conPeso: 0 };
      c.productos += 1;
      if (num(f.weight_kg) !== null && Number(f.weight_kg) > 0) c.conPeso += 1;
      conteo.set(clave, c);
    }
    if (filas.length < pagina) break;
  }
  return conteo;
}

export async function leerPesoOrganizacion(client: SupabaseClient, organizationId: number): Promise<PesoOrganizacion> {
  const { data, error } = await client
    .from('shipping_settings')
    .select('default_weight_kg, default_length_cm, default_width_cm, default_height_cm')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    default_weight_kg: num(d.default_weight_kg),
    default_length_cm: num(d.default_length_cm),
    default_width_cm: num(d.default_width_cm),
    default_height_cm: num(d.default_height_cm),
  };
}

export async function guardarPesoOrganizacion(client: SupabaseClient, organizationId: number, valores: PesoOrganizacion): Promise<void> {
  const { error } = await client
    .from('shipping_settings')
    .upsert({ organization_id: organizationId, ...valores, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
  if (error) throw error;
}
