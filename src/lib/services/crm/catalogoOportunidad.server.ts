/**
 * Lecturas del selector «Agregar a la oportunidad» (Figma 1771:171737
 * Productos, 1771:172205 Servicios y 1783:310575 Hospedaje) y de la pestaña
 * «Líneas», EN EL SERVIDOR (guardarraíl 36, ola 3B): catálogo con el padre con
 * variantes UNA sola vez, insignias, stock por sucursal, configuración de
 * servicios y disponibilidad del hospedaje.
 *
 * Lo llama solo `GET /api/crm/catalogo-oportunidad`, con el cliente de la
 * sesión (RLS) y la organización de la sesión: el navegador nunca la elige.
 * Cada consulta filtra además por `organization_id` (o por la organización de
 * la sucursal / del tipo de habitación cuando la tabla no la tiene). El
 * hospedaje usa las mismas funciones del PMS: `fn_availability` y
 * `calculate_reservation_total`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import { vigente } from '@/lib/services/documentos/vigencia';
import { CrmHttpError, UUID_RE } from '@/lib/services/crm/crmRouteSupport';
import { tasaDeImpuestos, tipoServicio, type TipoServicio } from '@/components/crm/oportunidad/lineasLogica';
import type { ImpuestoProductoApi } from '@/components/crm/oportunidad/apiOportunidades';

/** Lo que necesita el catálogo de la sesión. */
export interface CtxCatalogo {
  organizationId: number;
  supabase: SupabaseClient;
}

export type PestanaCatalogo = 'productos' | 'servicios';

export interface StockSucursal {
  branch_id: number;
  cantidad: number;
}

/** Stock de un producto tal como viaja por la API (un `Map` no se serializa). */
export interface StockProductoApi {
  product_id: number;
  sucursales: StockSucursal[];
}

export interface ItemCatalogo {
  id: number;
  nombre: string;
  sku: string | null;
  descripcion: string | null;
  es_servicio: boolean;
  tipo_servicio: TipoServicio | null;
  controla_stock: boolean;
  compuesto: boolean;
  /** Precio vigente; en un padre con variantes, el menor de sus variantes («desde»). */
  precio: number;
  /** Variantes activas (0 = producto simple). */
  variantes: number;
  /** Nombres de los atributos de las variantes («talla», «color»). */
  atributos: string[];
  modificadores: boolean;
  /** Algún grupo de modificadores obligatorio. */
  modificadorObligatorio: boolean;
  /** Stock por sucursal (del producto o la suma de sus variantes). */
  stock: StockSucursal[];
  tasa_impuesto: number;
}

export interface PadreVariante {
  id: number;
  nombre: string;
  sku: string | null;
}

export interface PlanMembresia {
  id: number;
  nombre: string;
  duracion: number | null;
  unidad: string | null;
  requiereActivacion: boolean;
}

export interface ClaseProxima {
  id: number;
  titulo: string;
  inicio: string;
  capacidad: number;
  reservados: number;
  sucursal: number | null;
}

export interface IntervaloOcupado {
  inicio: string;
  fin: string;
}

export interface TipoHospedaje {
  space_type_id: string;
  nombre: string;
  capacidad: number | null;
  branch_id: number;
  habitaciones: number;
  tarifaBase: number;
}

export interface HabitacionDisponible {
  space_id: string;
  etiqueta: string;
  libre: boolean;
}

export interface TotalHospedaje {
  total: number;
  noches: number;
  tarifa: number;
  origen: string;
}

type FilaProducto = {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  product_type: string | null;
  service_type: string | null;
  track_stock: boolean | null;
  is_composite: boolean | null;
  product_prices: { price: number | string | null; effective_from: string | null; effective_to: string | null }[] | null;
  product_tax_relations: { organization_taxes: ImpuestoProductoApi | ImpuestoProductoApi[] | null }[] | null;
};

type FilaHijo = { id: number; parent_product_id: number; variant_data: Record<string, string> | null; product_prices: FilaProducto['product_prices'] };

const SELECT_PRODUCTO =
  'id, name, sku, description, product_type, service_type, track_stock, is_composite, product_prices(price, effective_from, effective_to), product_tax_relations(organization_taxes(rate, kind, is_active, tax_templates(code)))';

/** Tope de productos por consulta de stock (igual que antes en el navegador). */
export const MAX_IDS_STOCK = 1000;

const precioDe = (filas: FilaProducto['product_prices']) => Number(vigente(filas ?? [])?.price) || 0;

function filtroPestana<Q extends { eq: (c: string, v: string) => Q; or: (f: string) => Q }>(q: Q, pestana: PestanaCatalogo): Q {
  return pestana === 'servicios' ? q.eq('product_type', 'service') : q.or('product_type.is.null,product_type.neq.service');
}

/** Cuántos productos y servicios vendibles hay (contadores de las pestañas). */
export async function contarCatalogo(ctx: CtxCatalogo): Promise<{ productos: number; servicios: number }> {
  const contar = async (pestana: PestanaCatalogo) => {
    let q = ctx.supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.organizationId).eq('status', 'active').is('parent_product_id', null);
    q = filtroPestana(q, pestana);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };
  const [productos, servicios] = await Promise.all([contar('productos'), contar('servicios')]);
  return { productos, servicios };
}

/**
 * Búsqueda del selector: productos raíz (sin padre) activos de la pestaña;
 * el padre con variantes aparece una vez con «N variantes · desde $».
 */
export async function buscarCatalogo(ctx: CtxCatalogo, c: { texto: string; pestana: PestanaCatalogo; limite?: number }): Promise<ItemCatalogo[]> {
  const org = ctx.organizationId;
  const limite = Math.min(Math.max(c.limite ?? 30, 1), 60);
  let q = ctx.supabase.from('products').select(SELECT_PRODUCTO).eq('organization_id', org).eq('status', 'active').is('parent_product_id', null);
  q = filtroPestana(q, c.pestana);
  const texto = ilikeAnyOf(['name', 'sku', 'barcode', 'reference'], c.texto ?? '');
  if (texto) q = q.or(texto);
  const { data, error } = await q.order('name').order('id').limit(limite);
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaProducto[];
  if (filas.length === 0) return [];
  const ids = filas.map((p) => p.id);

  const [hijosR, modsR] = await Promise.all([
    ctx.supabase.from('products').select('id, parent_product_id, variant_data, product_prices(price, effective_from, effective_to)').eq('organization_id', org).eq('status', 'active').in('parent_product_id', ids).limit(2000),
    ctx.supabase.from('product_modifier_groups').select('product_id, required, min_selections').eq('organization_id', org).in('product_id', ids),
  ]);
  if (hijosR.error) throw hijosR.error;
  if (modsR.error) throw modsR.error;
  const hijos = (hijosR.data ?? []) as unknown as FilaHijo[];
  const porPadre = new Map<number, FilaHijo[]>();
  for (const h of hijos) porPadre.set(h.parent_product_id, [...(porPadre.get(h.parent_product_id) ?? []), h]);
  const mods = new Map<number, boolean>();
  for (const g of (modsR.data ?? []) as { product_id: number; required: boolean | null; min_selections: number | null }[]) {
    mods.set(g.product_id, (mods.get(g.product_id) ?? false) || !!g.required || (g.min_selections ?? 0) > 0);
  }

  const stock = await stockPorProducto(ctx, [...ids, ...hijos.map((h) => h.id)]);
  const padreDe = new Map(hijos.map((h) => [h.id, h.parent_product_id]));
  const stockRaiz = new Map<number, Map<number, number>>();
  for (const { product_id, sucursales } of stock) {
    const raiz = padreDe.get(product_id) ?? product_id;
    const m = stockRaiz.get(raiz) ?? new Map<number, number>();
    for (const f of sucursales) m.set(f.branch_id, (m.get(f.branch_id) ?? 0) + f.cantidad);
    stockRaiz.set(raiz, m);
  }

  return filas.map((p) => {
    const variantes = porPadre.get(p.id) ?? [];
    const precios = variantes.map((v) => precioDe(v.product_prices)).filter((x) => x > 0);
    const atributos = [...new Set(variantes.flatMap((v) => Object.keys(v.variant_data ?? {})))];
    return {
      id: p.id,
      nombre: p.name,
      sku: p.sku,
      descripcion: p.description ? p.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || null : null,
      es_servicio: p.product_type === 'service',
      tipo_servicio: p.product_type === 'service' ? (tipoServicio(p.service_type) ?? 'standard') : null,
      controla_stock: p.track_stock === true,
      compuesto: p.is_composite === true,
      precio: variantes.length && precios.length ? Math.min(...precios) : precioDe(p.product_prices),
      variantes: variantes.length,
      atributos,
      modificadores: mods.has(p.id),
      modificadorObligatorio: mods.get(p.id) === true,
      stock: [...(stockRaiz.get(p.id) ?? new Map<number, number>()).entries()].map(([branch_id, cantidad]) => ({ branch_id, cantidad })),
      tasa_impuesto: tasaDeImpuestos(p.product_tax_relations),
    };
  });
}

/**
 * Stock por sucursal de cada producto. `stock_levels` no tiene
 * `organization_id`: se acota a las sucursales de la organización de la sesión
 * (`branches!inner`, FK `stock_levels_branch_id_fkey`).
 */
export async function stockPorProducto(ctx: CtxCatalogo, ids: readonly number[]): Promise<StockProductoApi[]> {
  const unicos = [...new Set(ids)].slice(0, MAX_IDS_STOCK);
  if (unicos.length === 0) return [];
  const { data, error } = await ctx.supabase
    .from('stock_levels')
    .select('product_id, branch_id, qty_on_hand, sucursal:branches!inner(organization_id)')
    .eq('sucursal.organization_id', ctx.organizationId)
    .in('product_id', unicos)
    .limit(5000);
  if (error) throw error;
  const acumulado = new Map<number, Map<number, number>>();
  for (const r of (data ?? []) as unknown as { product_id: number; branch_id: number; qty_on_hand: number | string | null }[]) {
    const m = acumulado.get(r.product_id) ?? new Map<number, number>();
    m.set(r.branch_id, (m.get(r.branch_id) ?? 0) + (Number(r.qty_on_hand) || 0));
    acumulado.set(r.product_id, m);
  }
  return [...acumulado].map(([product_id, m]) => ({ product_id, sucursales: [...m.entries()].map(([branch_id, cantidad]) => ({ branch_id, cantidad })) }));
}

/** Producto padre de una variante (para «Cambiar variante» desde la línea). */
export async function padreDeVariante(ctx: CtxCatalogo, productId: number): Promise<PadreVariante | null> {
  const { data, error } = await ctx.supabase
    .from('products')
    .select('parent_product_id, padre:products!products_parent_product_id_fkey(id, name, sku)')
    .eq('id', productId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  const padre = (data as { padre?: PadreFila | PadreFila[] | null } | null)?.padre;
  const p = Array.isArray(padre) ? padre[0] : padre;
  return p ? { id: p.id, nombre: p.name, sku: p.sku } : null;
}

type PadreFila = { id: number; name: string; sku: string | null };

// ─── Servicios ─────────────────────────────────────────────────────────────

export async function planDeMembresia(ctx: CtxCatalogo, productId: number): Promise<PlanMembresia | null> {
  const { data, error } = await ctx.supabase
    .from('membership_plans')
    .select('id, name, duration_value, duration_unit, requires_activation')
    .eq('organization_id', ctx.organizationId)
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as { id: number; name: string; duration_value: number | null; duration_unit: string | null; requires_activation: boolean | null };
  return { id: d.id, nombre: d.name, duracion: d.duration_value, unidad: d.duration_unit, requiereActivacion: d.requires_activation === true };
}

/** Clases programadas desde `desde` (cupos en vivo: capacidad − reservas activas). */
export async function clasesProximas(ctx: CtxCatalogo, desde: string): Promise<ClaseProxima[]> {
  const org = ctx.organizationId;
  const { data, error } = await ctx.supabase.from('gym_classes').select('id, title, start_at, capacity, branch_id, status').eq('organization_id', org).gte('start_at', desde).neq('status', 'cancelled').order('start_at').limit(30);
  if (error) throw error;
  const clases = (data ?? []) as { id: number; title: string; start_at: string; capacity: number | null; branch_id: number | null }[];
  if (clases.length === 0) return [];
  const r = await ctx.supabase
    .from('class_reservations')
    .select('gym_class_id')
    .eq('organization_id', org)
    .in('gym_class_id', clases.map((c) => c.id))
    .not('status', 'in', '(cancelled,no_show)');
  if (r.error) throw r.error;
  const cuenta = new Map<number, number>();
  for (const x of (r.data ?? []) as { gym_class_id: number }[]) cuenta.set(x.gym_class_id, (cuenta.get(x.gym_class_id) ?? 0) + 1);
  return clases.map((c) => ({ id: c.id, titulo: c.title, inicio: c.start_at, capacidad: c.capacity ?? 0, reservados: cuenta.get(c.id) ?? 0, sucursal: c.branch_id }));
}

/** Instantes ocupados del profesional entre `desde` y `hasta` (eventos del calendario). */
export async function ocupadoProfesional(ctx: CtxCatalogo, usuario: string, desde: string, hasta: string): Promise<IntervaloOcupado[]> {
  const { data, error } = await ctx.supabase
    .from('calendar_events')
    .select('start_at, end_at, status')
    .eq('organization_id', ctx.organizationId)
    .eq('assigned_to', usuario)
    .lt('start_at', hasta)
    .gt('end_at', desde)
    .neq('status', 'cancelled')
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as { start_at: string; end_at: string }[]).map((e) => ({ inicio: e.start_at, fin: e.end_at }));
}

// ─── Hospedaje ─────────────────────────────────────────────────────────────

/**
 * Tipos de habitación por sucursal (los que tienen al menos una habitación).
 * `spaces` no tiene `organization_id`: se exige que el tipo Y la sucursal sean
 * de la organización de la sesión.
 */
export async function tiposHospedaje(ctx: CtxCatalogo): Promise<TipoHospedaje[]> {
  const org = ctx.organizationId;
  const { data, error } = await ctx.supabase
    .from('spaces')
    .select('branch_id, space_type_id, tipo:space_types!inner(id, name, capacity, base_rate, is_active, organization_id), sucursal:branches!inner(organization_id)')
    .eq('tipo.organization_id', org)
    .eq('sucursal.organization_id', org)
    .limit(2000);
  if (error) throw error;
  const m = new Map<string, TipoHospedaje>();
  for (const r of (data ?? []) as unknown as { branch_id: number; space_type_id: string; tipo: { id: string; name: string; capacity: number | null; base_rate: number | string | null; is_active: boolean | null } | null }[]) {
    if (!r.tipo || r.tipo.is_active === false) continue;
    const clave = `${r.space_type_id}:${r.branch_id}`;
    const a = m.get(clave);
    if (a) a.habitaciones += 1;
    else m.set(clave, { space_type_id: r.space_type_id, nombre: r.tipo.name, capacidad: r.tipo.capacity, branch_id: r.branch_id, habitaciones: 1, tarifaBase: Number(r.tipo.base_rate) || 0 });
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.branch_id - b.branch_id);
}

/** Planes de tarifa del tipo (`rates.restrictions.plan`). */
export async function planesTarifa(ctx: CtxCatalogo, spaceTypeId: string): Promise<string[]> {
  const { data, error } = await ctx.supabase.from('rates').select('restrictions').eq('organization_id', ctx.organizationId).eq('space_type_id', spaceTypeId).eq('is_active', true).limit(200);
  if (error) throw error;
  const planes = ((data ?? []) as { restrictions: Record<string, unknown> | null }[]).map((r) => r.restrictions?.plan).filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  return [...new Set(planes)].sort();
}

/** 404 si el tipo de habitación no es de la organización de la sesión. */
async function exigirTipoDeLaOrganizacion(ctx: CtxCatalogo, spaceTypeId: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('space_types').select('id').eq('id', spaceTypeId).eq('organization_id', ctx.organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'tipo_no_encontrado', 'Tipo de habitación no encontrado');
}

/**
 * `fn_availability` no recibe la organización (y no es SECURITY DEFINER): antes
 * de llamarla se comprueba que la sucursal y el tipo sean de la sesión.
 */
export async function disponibilidad(ctx: CtxCatalogo, entrada: string, salida: string, spaceTypeId: string, branchId: number): Promise<HabitacionDisponible[]> {
  const [sucursal] = await Promise.all([
    ctx.supabase.from('branches').select('id').eq('id', branchId).eq('organization_id', ctx.organizationId).maybeSingle(),
    exigirTipoDeLaOrganizacion(ctx, spaceTypeId),
  ]);
  if (sucursal.error) throw sucursal.error;
  if (!sucursal.data) throw new CrmHttpError(404, 'sucursal_no_encontrada', 'Sucursal no encontrada');
  const { data, error } = await ctx.supabase.rpc('fn_availability', { p_start_date: entrada, p_end_date: salida, p_space_type_id: spaceTypeId, p_branch_id: branchId });
  if (error) throw error;
  return ((data ?? []) as { space_id: string; space_label: string; is_available: boolean }[]).map((r) => ({ space_id: r.space_id, etiqueta: r.space_label, libre: r.is_available }));
}

/** `calculate_reservation_total` con la organización de la sesión (nunca la del navegador). */
export async function totalHospedaje(ctx: CtxCatalogo, spaceTypeId: string, entrada: string, salida: string, plan: string | null): Promise<TotalHospedaje | null> {
  await exigirTipoDeLaOrganizacion(ctx, spaceTypeId);
  const { data, error } = await ctx.supabase.rpc('calculate_reservation_total', { p_organization_id: ctx.organizationId, p_space_type_id: spaceTypeId, p_checkin: entrada, p_checkout: salida, p_plan: plan });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) as { total_amount: number | string; nights: number; daily_rate: number | string; rate_source: string } | null;
  return r ? { total: Number(r.total_amount) || 0, noches: Number(r.nights) || 0, tarifa: Number(r.daily_rate) || 0, origen: r.rate_source } : null;
}

// ─── Lectura de la query de la ruta ──────────────────────────────────────────

export const OPERACIONES_CATALOGO = [
  'contar',
  'buscar',
  'stock',
  'padre',
  'membresia',
  'clases',
  'ocupado',
  'tipos-hospedaje',
  'planes-tarifa',
  'disponibilidad',
  'total-hospedaje',
] as const;
export type OperacionCatalogo = (typeof OPERACIONES_CATALOGO)[number];

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const invalido = (campo: string) => new CrmHttpError(400, 'parametro_invalido', `${campo} inválido`);

function entero(sp: URLSearchParams, campo: string): number {
  const v = sp.get(campo) ?? '';
  const n = Number(v);
  if (!/^\d{1,15}$/.test(v) || !Number.isSafeInteger(n) || n <= 0) throw invalido(campo);
  return n;
}

function uuid(sp: URLSearchParams, campo: string): string {
  const v = sp.get(campo) ?? '';
  if (!UUID_RE.test(v)) throw invalido(campo);
  return v;
}

/** Día calendario `YYYY-MM-DD` (columnas `date` de las RPC del PMS). */
function fecha(sp: URLSearchParams, campo: string): string {
  const v = sp.get(campo) ?? '';
  if (!FECHA_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw invalido(campo);
  return v;
}

/** Instante ISO 8601 (comparado contra `timestamptz`). */
function instante(sp: URLSearchParams, campo: string): string {
  const v = sp.get(campo) ?? '';
  if (v.length < 10 || v.length > 40 || !/^\d{4}-\d{2}-\d{2}/.test(v) || Number.isNaN(Date.parse(v))) throw invalido(campo);
  return v;
}

/** `ids=1,2,3` → enteros positivos únicos (máx. `MAX_IDS_STOCK`). */
export function idsDesdeQuery(valor: string | null): number[] {
  const partes = (valor ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (partes.length > MAX_IDS_STOCK) throw invalido('ids');
  const ids = partes.map((s) => (/^\d{1,15}$/.test(s) ? Number(s) : NaN));
  if (ids.some((n) => !Number.isSafeInteger(n) || n <= 0)) throw invalido('ids');
  return [...new Set(ids)];
}

/**
 * Resuelve una operación de `GET /api/crm/catalogo-oportunidad`. Ningún
 * parámetro elige la organización: cualquier `org`/`organization_id` de la
 * query se ignora.
 */
export async function resolverCatalogo(ctx: CtxCatalogo, sp: URLSearchParams): Promise<unknown> {
  const op = sp.get('op') as OperacionCatalogo | null;
  switch (op) {
    case 'contar':
      return contarCatalogo(ctx);
    case 'buscar': {
      const pestana = sp.get('pestana');
      if (pestana !== 'productos' && pestana !== 'servicios') throw invalido('pestana');
      const texto = (sp.get('texto') ?? '').slice(0, 200);
      const limite = sp.get('limite') ? entero(sp, 'limite') : undefined;
      return buscarCatalogo(ctx, { texto, pestana, limite });
    }
    case 'stock':
      return stockPorProducto(ctx, idsDesdeQuery(sp.get('ids')));
    case 'padre':
      return padreDeVariante(ctx, entero(sp, 'product_id'));
    case 'membresia':
      return planDeMembresia(ctx, entero(sp, 'product_id'));
    case 'clases':
      return clasesProximas(ctx, instante(sp, 'desde'));
    case 'ocupado':
      return ocupadoProfesional(ctx, uuid(sp, 'usuario'), instante(sp, 'desde'), instante(sp, 'hasta'));
    case 'tipos-hospedaje':
      return tiposHospedaje(ctx);
    case 'planes-tarifa':
      return planesTarifa(ctx, uuid(sp, 'space_type_id'));
    case 'disponibilidad':
      return disponibilidad(ctx, fecha(sp, 'entrada'), fecha(sp, 'salida'), uuid(sp, 'space_type_id'), entero(sp, 'branch_id'));
    case 'total-hospedaje': {
      const plan = (sp.get('plan') ?? '').trim().slice(0, 120);
      return totalHospedaje(ctx, uuid(sp, 'space_type_id'), fecha(sp, 'entrada'), fecha(sp, 'salida'), plan === '' ? null : plan);
    }
    default:
      throw invalido('op');
  }
}
