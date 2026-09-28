import { supabase } from '@/lib/supabase/config';
import { sinRetenciones } from '@/lib/services/taxResolverCore';
import type { SucursalBasica } from '../logica/formularioProducto';
import type {
  CatalogosFormulario,
  CategoriaCatalogo,
  EtiquetaCatalogo,
  ImpuestoCatalogo,
  ProveedorCatalogo,
  TipoVarianteCatalogo,
  UnidadCatalogo,
} from './tipos';

/**
 * Catálogos del formulario único de producto, en paralelo y una sola vez por
 * apertura. Todo filtra por la organización de la sesión (RLS por pertenencia
 * además). Columnas verificadas en la BD el 2026-09-23.
 */

interface FilaSucursal {
  id: number;
  name: string;
  is_main: boolean | null;
}

interface FilaTipoVariante {
  id: number;
  name: string;
  variant_values: { id: number; value: string; display_order: number | null }[] | null;
}

export async function cargarCatalogos(organizacionId: number): Promise<CatalogosFormulario> {
  const [sucursales, categorias, unidades, impuestos, proveedores, etiquetas, tipos, grupos] = await Promise.all([
    supabase
      .from('branches')
      .select('id, name, is_main')
      .eq('organization_id', organizacionId)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, parent_id, station')
      .eq('organization_id', organizacionId)
      .order('name'),
    supabase.from('units').select('code, name, unit_type').order('name'),
    supabase
      .from('organization_taxes')
      .select('id, name, rate, is_default, tax_included, kind')
      .eq('organization_id', organizacionId)
      .eq('is_active', true)
      .order('name'),
    supabase.from('suppliers').select('id, name, nit').eq('organization_id', organizacionId).order('name'),
    supabase.from('product_tags').select('id, name, color').eq('organization_id', organizacionId).order('name'),
    supabase
      .from('variant_types')
      .select('id, name, variant_values(id, value, display_order)')
      // Catálogo de la organización + el global (organization_id = 0).
      .or(`organization_id.eq.${organizacionId},organization_id.eq.0`)
      .order('name'),
    supabase.from('product_modifier_groups').select('name').eq('organization_id', organizacionId).limit(1000),
  ]);

  const error =
    sucursales.error ?? categorias.error ?? unidades.error ?? impuestos.error ?? proveedores.error ?? etiquetas.error ?? tipos.error;
  if (error) throw error;

  const nombresGrupos = new Map<string, string>();
  for (const g of (grupos.data ?? []) as { name: string | null }[]) {
    const nombre = (g.name ?? '').trim();
    if (nombre && !nombresGrupos.has(nombre.toLowerCase())) nombresGrupos.set(nombre.toLowerCase(), nombre);
  }

  return {
    sucursales: ((sucursales.data ?? []) as FilaSucursal[]).map<SucursalBasica>((s) => ({
      branch_id: s.id,
      nombre: s.name,
      principal: Boolean(s.is_main),
    })),
    categorias: (categorias.data ?? []) as CategoriaCatalogo[],
    unidades: ((unidades.data ?? []) as UnidadCatalogo[]).map((u) => ({ code: u.code.trim(), name: u.name, unit_type: u.unit_type ?? null })),
    // Las retenciones no se asignan a productos (la base también lo impide).
    impuestos: sinRetenciones((impuestos.data ?? []) as (ImpuestoCatalogo & { kind?: string | null })[]).map((i) => ({
      ...i,
      rate: Number(i.rate) || 0,
    })),
    proveedores: (proveedores.data ?? []) as ProveedorCatalogo[],
    etiquetas: (etiquetas.data ?? []) as EtiquetaCatalogo[],
    tiposVariante: ((tipos.data ?? []) as FilaTipoVariante[]).map<TipoVarianteCatalogo>((t) => ({
      id: t.id,
      name: t.name,
      valores: [...(t.variant_values ?? [])]
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((v) => ({ id: v.id, value: v.value })),
    })),
    gruposModificador: Array.from(nombresGrupos.values()).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * SKU sugerido para un producto nuevo (el mismo formato de antes,
 * «PROD-001-XYZ»: consecutivo por cantidad de productos + sufijo corto). La
 * unicidad la garantiza la RPC al guardar (`sku_duplicado`).
 */
export async function generarSkuSugerido(organizacionId: number): Promise<string> {
  const sufijo = Date.now().toString(36).slice(-3).toUpperCase();
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizacionId);
  return `PROD-${String((count ?? 0) + 1).padStart(3, '0')}-${sufijo}`;
}

/** Id numérico de un producto por su uuid, dentro de la organización de la sesión. */
export async function idProductoPorUuid(organizacionId: number, uuid: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('uuid', uuid)
    .eq('organization_id', organizacionId)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { id: number }).id) : null;
}

/** Permisos resueltos en el servidor (`fn_productos_permisos`); `null` si no se pudieron leer. */
export async function leerPermisos(organizacionId: number): Promise<{ crear: boolean; editar: boolean } | null> {
  const { data, error } = await supabase.rpc('fn_productos_permisos', { p_org: organizacionId });
  if (error || !data) return null;
  const p = data as Record<string, unknown>;
  return { crear: Boolean(p.crear), editar: Boolean(p.editar) };
}
