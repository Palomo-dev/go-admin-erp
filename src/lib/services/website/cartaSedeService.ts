/**
 * Carta por sede — SOLO SERVIDOR. Lee y escribe `website_branch_products` con
 * el cliente de la SESIÓN (RLS: miembros leen; escribe quien tiene
 * `website.sites.edit`). La organización llega del contexto de la sesión,
 * nunca del cliente.
 *
 * - Precio vigente: `importePrecioVigente` (`@/lib/pos/precioVigente`), la
 *   única regla de vigencia de `product_prices`. Aquí no se reimplementa.
 * - Escritura: UN upsert por lote (`onConflict: branch_id,product_id`, la PK;
 *   ninguna columna admite NULL ahí, así que sí deduplica). Antes de escribir
 *   se comprueba que la sede y TODOS los productos son de la organización: un
 *   solo producto ajeno rechaza el lote entero (403). El trigger
 *   `fn_website_branch_products_coherencia` lo vuelve a exigir en la base.
 * - Sin DELETE: «volver a como el principal» escribe la fila neutra.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { importePrecioVigente } from '@/lib/pos/precioVigente';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import { todayInTz } from '@/lib/utils/dateCore';
import {
  MAX_LOTE_CARTA_SEDE,
  TAMANO_PAGINA_CARTA_SEDE,
  agotadoAhora,
  cambioDeAccion,
  diaAgotadoHasta,
  fusionarAjuste,
  type AjusteSede,
  type CambioProducto,
  type EscrituraCartaSede,
  type ListadoCartaSede,
  type ProductoCartaSede,
  type RespuestaListadoCartaSede,
  type ResultadoEscrituraCartaSede,
} from './cartaSede';

export const PERMISO_EDITAR_SITIO = 'website.sites.edit';

/** Ids por petición en un filtro `in` (la URL de PostgREST tiene tope). */
const TROZO_IN = 200;

export interface ContextoCartaSede {
  organizationId: number;
  userId?: string | null;
  supabase: SupabaseClient;
  /** Zona IANA de la organización (getOrganizationTimezone). */
  timezone: string;
}

interface FilaProducto {
  id: number;
  name: string;
  sku: string;
  category_id: number | null;
}

function trozos<T>(lista: readonly T[], tamano = TROZO_IN): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function ajusteDeFila(f: Record<string, unknown>): AjusteSede {
  return {
    is_listed: f.is_listed !== false,
    web_price: numero(f.web_price),
    is_sold_out: f.is_sold_out === true,
    sold_out_until: (f.sold_out_until as string | null) ?? null,
  };
}

function falla(etiqueta: string, error: { message?: string; code?: string } | null): never {
  if (error?.code === '42501') throw new OrgContextError('No tienes permiso para editar el sitio', 403, 'sin_permiso');
  if (error?.code === '23514') throw new OrgContextError('Producto de otra organización', 403, 'producto_de_otra_organizacion');
  console.error(`[cartaSede] ${etiqueta} falló`, { message: error?.message, code: error?.code });
  throw new Error(`carta_sede_${etiqueta}`);
}

/** ¿Puede editar el sitio? Un error de la RPC cuenta como «no» (fail-closed). */
export async function puedeEditarCartaSede(ctx: ContextoCartaSede): Promise<boolean> {
  try {
    const { data, error } = await ctx.supabase.rpc('fn_website_tiene_permiso', {
      p_org: ctx.organizationId,
      p_code: PERMISO_EDITAR_SITIO,
    });
    if (error) {
      console.warn('[cartaSede] fn_website_tiene_permiso falló; se deniega', { organizationId: ctx.organizationId, message: error.message });
      return false;
    }
    return data === true;
  } catch {
    return false;
  }
}

/** La sede debe ser de la organización de la sesión; si no, 404 (no se distingue «no existe» de «es ajena»). */
export async function exigirSedeDeLaOrganizacion(ctx: ContextoCartaSede, branchId: number): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) falla('sede', error);
  if (!data) {
    console.warn('[cartaSede] sede ajena o inexistente', { organizationId: ctx.organizationId, branchId, userId: ctx.userId ?? null });
    throw new OrgContextError('Sede no encontrada', 404, 'sede_no_encontrada');
  }
}

/** Todos los productos deben ser de la organización: uno ajeno rechaza el lote (403 registrado). */
async function exigirProductosDeLaOrganizacion(ctx: ContextoCartaSede, ids: readonly number[]): Promise<void> {
  const encontrados = new Set<number>();
  for (const trozo of trozos(ids)) {
    const { data, error } = await ctx.supabase
      .from('products')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .in('id', trozo);
    if (error) falla('productos', error);
    for (const f of (data ?? []) as { id: number }[]) encontrados.add(Number(f.id));
  }
  const ajenos = ids.filter((id) => !encontrados.has(id));
  if (ajenos.length > 0) {
    console.warn('[cartaSede] productos ajenos en el lote → 403', {
      organizationId: ctx.organizationId,
      userId: ctx.userId ?? null,
      ajenos: ajenos.slice(0, 10),
      total: ajenos.length,
    });
    throw new OrgContextError('Hay productos que no son de tu organización', 403, 'producto_de_otra_organizacion');
  }
}

async function ajustesActuales(ctx: ContextoCartaSede, branchId: number, ids: readonly number[]): Promise<Map<number, AjusteSede>> {
  const mapa = new Map<number, AjusteSede>();
  for (const trozo of trozos(ids)) {
    const { data, error } = await ctx.supabase
      .from('website_branch_products')
      .select('product_id, is_listed, web_price, is_sold_out, sold_out_until')
      .eq('organization_id', ctx.organizationId)
      .eq('branch_id', branchId)
      .in('product_id', trozo);
    if (error) falla('ajustes', error);
    for (const f of (data ?? []) as Record<string, unknown>[]) mapa.set(Number(f.product_id), ajusteDeFila(f));
  }
  return mapa;
}

/** Ids de los productos de una categoría (de la organización, activos, sin variantes). */
async function productosDeCategoria(ctx: ContextoCartaSede, categoryId: number): Promise<number[]> {
  const { data, error } = await ctx.supabase
    .from('products')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('category_id', categoryId)
    .eq('status', 'active')
    .is('parent_product_id', null)
    .order('id', { ascending: true })
    .limit(MAX_LOTE_CARTA_SEDE + 1);
  if (error) falla('categoria', error);
  const ids = ((data ?? []) as { id: number }[]).map((f) => Number(f.id));
  if (ids.length > MAX_LOTE_CARTA_SEDE) {
    throw new OrgContextError(`La categoría tiene más de ${MAX_LOTE_CARTA_SEDE} productos: edítala por partes`, 400, 'lote_demasiado_grande');
  }
  return ids;
}

/**
 * Aplica un lote. Los cambios se aplican EN ORDEN sobre el ajuste actual (o el
 * neutro), así un «restablecer» seguido de «ocultar» deja el producto oculto.
 */
export async function guardarCartaSede(ctx: ContextoCartaSede, entrada: EscrituraCartaSede): Promise<ResultadoEscrituraCartaSede> {
  if (!(await puedeEditarCartaSede(ctx))) {
    console.warn('[cartaSede] escritura sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId ?? null });
    throw new OrgContextError('No tienes permiso para editar el sitio', 403, 'sin_permiso');
  }
  await exigirSedeDeLaOrganizacion(ctx, entrada.branch_id);

  let cambios: CambioProducto[];
  if (entrada.tipo === 'categoria') {
    // La consulta ya filtra por la organización: no hace falta una segunda comprobación.
    const ids = await productosDeCategoria(ctx, entrada.category_id);
    if (ids.length === 0) return { guardados: 0 };
    cambios = ids.map((id) => cambioDeAccion(id, entrada.accion, entrada.agotado_hasta));
  } else {
    cambios = entrada.cambios;
    const ids = Array.from(new Set(cambios.map((c) => c.product_id)));
    await exigirProductosDeLaOrganizacion(ctx, ids);
  }

  const ids = Array.from(new Set(cambios.map((c) => c.product_id)));
  const actuales = await ajustesActuales(ctx, entrada.branch_id, ids);
  for (const c of cambios) {
    actuales.set(c.product_id, fusionarAjuste(actuales.get(c.product_id) ?? null, c, ctx.timezone));
  }

  const filas = ids.map((product_id) => ({
    organization_id: ctx.organizationId,
    branch_id: entrada.branch_id,
    product_id,
    ...(actuales.get(product_id) as AjusteSede),
  }));

  const { error } = await ctx.supabase
    .from('website_branch_products')
    .upsert(filas, { onConflict: 'branch_id,product_id' });
  if (error) falla('upsert', error);
  return { guardados: filas.length };
}

const SELECT_PRODUCTO = 'id, name, sku, category_id';

/** Listado paginado de una sede con su ajuste y el precio vigente. */
export async function listarCartaSede(ctx: ContextoCartaSede, params: ListadoCartaSede): Promise<RespuestaListadoCartaSede> {
  await exigirSedeDeLaOrganizacion(ctx, params.branch_id);
  const tamano = TAMANO_PAGINA_CARTA_SEDE;
  const desde = (params.pagina - 1) * tamano;
  const busqueda = params.q ? ilikeAnyOf(['name', 'sku'], params.q) : '';

  let productos: FilaProducto[] = [];
  let total = 0;
  const ajustes = new Map<number, AjusteSede>();

  if (params.filtro === 'todos') {
    let consulta = ctx.supabase
      .from('products')
      .select(SELECT_PRODUCTO, { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active')
      .is('parent_product_id', null);
    if (params.category_id) consulta = consulta.eq('category_id', params.category_id);
    if (busqueda) consulta = consulta.or(busqueda);
    const { data, error, count } = await consulta
      .order('category_id', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .range(desde, desde + tamano - 1);
    if (error) falla('listado', error);
    productos = (data ?? []) as FilaProducto[];
    total = count ?? 0;
    const leidos = await ajustesActuales(ctx, params.branch_id, productos.map((p) => p.id));
    leidos.forEach((v, k) => ajustes.set(k, v));
  } else {
    // Filtros sobre el ajuste: se parte de la tabla de la sede con el producto embebido (inner).
    let consulta = ctx.supabase
      .from('website_branch_products')
      .select(`product_id, is_listed, web_price, is_sold_out, sold_out_until, products!inner(${SELECT_PRODUCTO}, organization_id, status, parent_product_id)`, { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .eq('branch_id', params.branch_id)
      .eq('products.organization_id', ctx.organizationId)
      .eq('products.status', 'active')
      .is('products.parent_product_id', null);
    if (params.filtro === 'personalizados') consulta = consulta.not('web_price', 'is', null);
    if (params.filtro === 'ocultos') consulta = consulta.eq('is_listed', false);
    if (params.filtro === 'agotados') {
      consulta = consulta.eq('is_sold_out', true).or(`sold_out_until.is.null,sold_out_until.gt.${new Date().toISOString()}`);
    }
    if (params.category_id) consulta = consulta.eq('products.category_id', params.category_id);
    if (busqueda) consulta = consulta.or(busqueda, { referencedTable: 'products' });
    const { data, error, count } = await consulta
      .order('product_id', { ascending: true })
      .range(desde, desde + tamano - 1);
    if (error) falla('listado', error);
    for (const f of (data ?? []) as Record<string, unknown>[]) {
      const p = (Array.isArray(f.products) ? f.products[0] : f.products) as FilaProducto | undefined;
      if (!p) continue;
      productos.push({ id: Number(p.id), name: p.name, sku: p.sku, category_id: p.category_id ?? null });
      ajustes.set(Number(f.product_id), ajusteDeFila(f));
    }
    total = count ?? 0;
  }

  // Precio vigente: la regla única de product_prices (no se reimplementa).
  const precios = new Map<number, { price: number | string | null; effective_from: string | null; effective_to: string | null }[]>();
  const ahora = new Date();
  for (const trozo of trozos(productos.map((p) => p.id))) {
    const { data, error } = await ctx.supabase
      .from('product_prices')
      .select('product_id, price, effective_from, effective_to')
      .in('product_id', trozo)
      .lte('effective_from', ahora.toISOString());
    if (error) falla('precios', error);
    for (const f of (data ?? []) as { product_id: number; price: number | string | null; effective_from: string | null; effective_to: string | null }[]) {
      const lista = precios.get(Number(f.product_id)) ?? [];
      lista.push(f);
      precios.set(Number(f.product_id), lista);
    }
  }

  const salida: ProductoCartaSede[] = productos.map((p) => {
    const a = ajustes.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category_id: p.category_id,
      precio_vigente: importePrecioVigente(precios.get(p.id), ahora),
      ajuste: a
        ? { ...a, agotado_hasta: diaAgotadoHasta(a.sold_out_until, ctx.timezone), agotado_ahora: agotadoAhora(a, ahora) }
        : null,
    };
  });

  return {
    productos: salida,
    total,
    pagina: params.pagina,
    tamano,
    puedeEditar: await puedeEditarCartaSede(ctx),
    hoy: todayInTz(ctx.timezone),
  };
}
