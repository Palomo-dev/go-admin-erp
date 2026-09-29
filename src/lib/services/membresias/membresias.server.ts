/**
 * Membresías — lecturas y acciones del lado del servidor (docs/design/MEMBRESIAS-FASE-1-2.md).
 *
 * Solo se usa desde `src/app/api/membresias/**` con el contexto de `withOrg`: la organización sale
 * de la sesión y el cliente es el de la sesión (RLS por pertenencia). Nada de lógica de negocio
 * aquí: crear, activar, renovar, recortar, congelar, cancelar y validar una entrada lo hacen las
 * funciones de la base (M6). Este módulo lee, arma las vistas y traduce errores.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { plainDateToInstant, toPlainDate } from '@/lib/utils/dateCore';
import { estadoVisual, vencePronto, type EstadoMembresia, type UnidadDuracion } from './vigencia';
import {
  ERRORES_MEMBRESIAS,
  PERMISOS_MEMBRESIAS,
  type AccionMembresias,
  type BillingMode,
  type ClienteResumen,
  type ConteoEstados,
  type DetalleMembresia,
  type DetallePlan,
  type ErrorMembresias,
  type EventoMembresia,
  type FiltroEstado,
  type ListadoMembresias,
  type ListadoMiembros,
  type ListadoPagos,
  type ListadoPlanes,
  type MembresiaFila,
  type MiembroFila,
  type PagoFila,
  type PagoMembresia,
  type PermisosMembresias,
  type PlanFila,
  type PlanResumen,
  type ReglasPlan,
  type ResultadoCheckin,
  type ResumenMembresias,
} from './tipos';

export class ErrorMembresiasServidor extends Error {
  constructor(public readonly codigo: ErrorMembresias, public readonly estado: number = 400, detalle?: string) {
    super(detalle ?? codigo);
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

type Fila = Record<string, unknown>;

const RENOVACION_APLICADA = 'renovacion_aplicada';
const MAX_POR_PAGINA = 100;

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numeroONulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function paginacion(pagina?: number, porPagina?: number): { pagina: number; porPagina: number; desde: number; hasta: number } {
  const p = Math.max(1, Math.floor(Number(pagina) || 1));
  const pp = Math.min(MAX_POR_PAGINA, Math.max(1, Math.floor(Number(porPagina) || 20)));
  return { pagina: p, porPagina: pp, desde: (p - 1) * pp, hasta: p * pp - 1 };
}

/** Escapa comodines de `ilike` y caracteres que rompen el filtro `or` de PostgREST. */
export function patronBusqueda(q: string): string {
  return q.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, ' ').trim();
}

function cliente(c: Fila | null): ClienteResumen {
  const nombre =
    texto(c?.full_name) ?? [texto(c?.first_name), texto(c?.last_name)].filter(Boolean).join(' ').trim();
  return {
    id: String(c?.id ?? ''),
    nombre: nombre || '—',
    documento: texto(c?.identification_number) ?? texto(c?.doc_number),
    email: texto(c?.email),
    telefono: texto(c?.phone),
    avatarUrl: texto(c?.avatar_url),
  };
}

function reglas(fuente: Fila | null): ReglasPlan {
  const f = fuente ?? {};
  const horario = f.access_schedule;
  const sedes = f.allowed_branch_ids;
  return {
    durationUnit: (texto(f.duration_unit) ?? 'month') as UnidadDuracion,
    durationValue: numero(f.duration_value) || 1,
    billingMode: (texto(f.billing_mode) ?? 'prepaid') as BillingMode,
    graceDays: numero(f.grace_days),
    requiresActivation: f.requires_activation === true,
    activationWindowDays: numeroONulo(f.activation_window_days),
    freezeAllowed: f.freeze_allowed === true,
    freezeMaxTimes: numeroONulo(f.freeze_max_times),
    freezeMaxDays: numeroONulo(f.freeze_max_days),
    allowedBranchIds: Array.isArray(sedes) && sedes.length > 0 ? sedes.map(Number) : null,
    accessSchedule: horario && typeof horario === 'object' ? (horario as ReglasPlan['accessSchedule']) : null,
    dailyCheckinLimit: numeroONulo(f.daily_checkin_limit),
  };
}

const SELECT_MEMBRESIA =
  'id, status, start_date, end_date, grace_until, access_code, source, sale_id, invoice_id, branch_id, ' +
  'membership_plan_id, product_id, cancel_reason, customer_id, ' +
  'customers(id, full_name, first_name, last_name, identification_number, doc_number, email, phone, avatar_url), ' +
  'membership_plans(id, name, product_id)';

function fila(r: Fila, tz: string, ahora: Date, pagadas: Set<string>): MembresiaFila {
  const plan = uno(r.membership_plans as Fila | Fila[] | null);
  const e = estadoVisual(
    {
      status: String(r.status),
      end_date: String(r.end_date),
      start_date: texto(r.start_date),
      grace_until: texto(r.grace_until),
      pagada: r.sale_id ? pagadas.has(String(r.sale_id)) : false,
    },
    ahora,
    tz,
  );
  return {
    id: numero(r.id),
    estado: String(r.status) as EstadoMembresia,
    estadoVisual: e.estado,
    dias: e.dias,
    desde: texto(r.start_date),
    hasta: String(r.end_date),
    graceUntil: texto(r.grace_until),
    codigo: texto(r.access_code),
    origen: (texto(r.source) as MembresiaFila['origen']) ?? null,
    cliente: cliente(uno(r.customers as Fila | Fila[] | null)),
    plan: { id: numero(plan?.id ?? r.membership_plan_id), nombre: texto(plan?.name) ?? '—', productId: numeroONulo(plan?.product_id ?? r.product_id) },
    saleId: texto(r.sale_id),
    invoiceId: texto(r.invoice_id),
    branchId: numeroONulo(r.branch_id),
  };
}

/** Ventas (de membresías pendientes) que ya están pagadas: la factura manda si existe. */
async function ventasPagadas(ctx: ServerOrgContext, filas: Fila[]): Promise<Set<string>> {
  const ids = Array.from(new Set(filas.filter((f) => f.status === 'pending' && f.sale_id).map((f) => String(f.sale_id))));
  const pagadas = new Set<string>();
  if (ids.length === 0) return pagadas;
  const [{ data: facturas }, { data: ventas }] = await Promise.all([
    ctx.supabase
      .from('invoice_sales')
      .select('sale_id, status, balance, document_type')
      .eq('organization_id', ctx.organizationId)
      .in('sale_id', ids),
    ctx.supabase.from('sales').select('id, status, balance').eq('organization_id', ctx.organizationId).in('id', ids),
  ]);
  const conFactura = new Set<string>();
  for (const f of (facturas ?? []) as Fila[]) {
    if ((texto(f.document_type) ?? 'invoice') !== 'invoice') continue;
    const st = String(f.status);
    if (['void', 'voided', 'cancelled'].includes(st)) continue;
    conFactura.add(String(f.sale_id));
    if (st !== 'draft' && (st === 'paid' || numero(f.balance) <= 0.009)) pagadas.add(String(f.sale_id));
  }
  for (const v of (ventas ?? []) as Fila[]) {
    const id = String(v.id);
    if (!conFactura.has(id) && v.status === 'paid' && numero(v.balance) <= 0.009) pagadas.add(id);
  }
  return pagadas;
}

export async function zonaDe(ctx: ServerOrgContext): Promise<string> {
  return getOrganizationTimezone(ctx.organizationId, ctx.supabase);
}

// ─── Permisos (siempre en el servidor, nunca por nombre de rol) ─────────────

export async function permisosMembresias(ctx: ServerOrgContext): Promise<PermisosMembresias> {
  const todos = Object.fromEntries(Object.keys(PERMISOS_MEMBRESIAS).map((k) => [k, true])) as PermisosMembresias;
  if (isOrgAdminLike(ctx)) return todos;
  const [{ data: org }, { data: codigos, error }] = await Promise.all([
    ctx.supabase.from('organizations').select('owner_user_id').eq('id', ctx.organizationId).maybeSingle(),
    ctx.supabase.rpc('get_user_permission_codes', { p_user_id: ctx.userId, p_organization_id: ctx.organizationId }),
  ]);
  if (org && (org as Fila).owner_user_id === ctx.userId) return todos;
  if (error) {
    console.warn('[membresias] get_user_permission_codes falló; se deniega', { organizationId: ctx.organizationId });
  }
  const set = new Set<string>(Array.isArray(codigos) ? (codigos as string[]) : []);
  return Object.fromEntries(
    (Object.entries(PERMISOS_MEMBRESIAS) as Array<[AccionMembresias, string]>).map(([k, code]) => [k, set.has(code)]),
  ) as PermisosMembresias;
}

export async function exigir(ctx: ServerOrgContext, accion: AccionMembresias): Promise<PermisosMembresias> {
  const permisos = await permisosMembresias(ctx);
  if (!permisos[accion]) throw new ErrorMembresiasServidor('sin_permiso', 403);
  return permisos;
}

// ─── Conteos por estado ─────────────────────────────────────────────────────

function conteoVacio(): ConteoEstados {
  return { total: 0, activa: 0, en_gracia: 0, congelada: 0, pendiente: 0, vencida: 0, cancelada: 0, porVencer: 0 };
}

async function conteoEstados(ctx: ServerOrgContext, tz: string, ahora: Date): Promise<ConteoEstados> {
  const { data, error } = await ctx.supabase
    .from('memberships')
    .select('status, end_date, grace_until, cancel_reason')
    .eq('organization_id', ctx.organizationId)
    .limit(10000);
  if (error) throw new ErrorMembresiasServidor('error_interno', 500, error.message);
  const c = conteoVacio();
  for (const r of (data ?? []) as Fila[]) {
    if (r.cancel_reason === RENOVACION_APLICADA) continue;
    c.total += 1;
    const m = { status: String(r.status), end_date: String(r.end_date), grace_until: texto(r.grace_until) };
    const e = estadoVisual(m, ahora, tz).estado;
    if (e === 'pendiente_pago' || e === 'por_activar') c.pendiente += 1;
    else c[e] += 1;
    if (vencePronto(m, ahora, tz)) c.porVencer += 1;
  }
  return c;
}

// ─── Membresías: listado ────────────────────────────────────────────────────

export interface FiltrosMembresias {
  q?: string;
  estado?: FiltroEstado;
  planId?: number;
  clienteId?: string;
  pagina?: number;
  porPagina?: number;
}

async function clientesQueCoinciden(ctx: ServerOrgContext, q: string): Promise<string[]> {
  const p = patronBusqueda(q);
  if (!p) return [];
  const { data } = await ctx.supabase
    .from('customers')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .or(`full_name.ilike.%${p}%,identification_number.ilike.%${p}%,email.ilike.%${p}%,phone.ilike.%${p}%`)
    .limit(300);
  return ((data ?? []) as Fila[]).map((c) => String(c.id));
}

export async function listarMembresias(ctx: ServerOrgContext, filtros: FiltrosMembresias): Promise<ListadoMembresias> {
  const tz = await zonaDe(ctx);
  const ahora = new Date();
  const ahoraIso = ahora.toISOString();
  const { pagina, porPagina, desde, hasta } = paginacion(filtros.pagina, filtros.porPagina);

  let query = ctx.supabase
    .from('memberships')
    .select(SELECT_MEMBRESIA, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .or(`cancel_reason.is.null,cancel_reason.neq.${RENOVACION_APLICADA}`);

  if (filtros.planId) query = query.eq('membership_plan_id', filtros.planId);
  if (filtros.clienteId) query = query.eq('customer_id', filtros.clienteId);

  const q = (filtros.q ?? '').trim();
  if (q) {
    const ids = await clientesQueCoinciden(ctx, q);
    const p = patronBusqueda(q);
    const partes = [`access_code.ilike.%${p}%`];
    if (ids.length > 0) partes.push(`customer_id.in.(${ids.join(',')})`);
    query = query.or(partes.join(','));
  }

  const semana = new Date(ahora.getTime() + 7 * 86_400_000).toISOString();
  switch (filtros.estado) {
    case 'activa':
      query = query.eq('status', 'active').gte('end_date', ahoraIso);
      break;
    case 'por_vencer':
      query = query.eq('status', 'active').gte('end_date', ahoraIso).lte('end_date', semana);
      break;
    case 'en_gracia':
      query = query.eq('status', 'past_due').gte('grace_until', ahoraIso);
      break;
    case 'congelada':
      query = query.eq('status', 'frozen');
      break;
    case 'pendiente':
      query = query.eq('status', 'pending');
      break;
    case 'vencida':
      query = query.or(
        `status.eq.expired,and(status.eq.active,end_date.lt.${ahoraIso}),and(status.eq.past_due,grace_until.lt.${ahoraIso})`,
      );
      break;
    case 'cancelada':
      query = query.eq('status', 'cancelled');
      break;
    default:
      break;
  }

  const [{ data, error, count }, conteo, { data: planes }] = await Promise.all([
    query.order('end_date', { ascending: true }).range(desde, hasta),
    conteoEstados(ctx, tz, ahora),
    ctx.supabase
      .from('membership_plans')
      .select('id, name, product_id')
      .eq('organization_id', ctx.organizationId)
      .order('name'),
  ]);
  if (error) throw new ErrorMembresiasServidor('error_interno', 500, error.message);
  const filas = (data ?? []) as unknown as Fila[];
  const pagadas = await ventasPagadas(ctx, filas);
  return {
    zona: tz,
    filas: filas.map((r) => fila(r, tz, ahora, pagadas)),
    total: count ?? filas.length,
    pagina,
    porPagina,
    conteo,
    planes: ((planes ?? []) as Fila[]).map((p) => ({ id: numero(p.id), nombre: String(p.name), productId: numeroONulo(p.product_id) })),
  };
}

// ─── Membresía: detalle ─────────────────────────────────────────────────────

export async function detalleMembresia(ctx: ServerOrgContext, id: number): Promise<DetalleMembresia> {
  const tz = await zonaDe(ctx);
  const ahora = new Date();
  const { data: m, error } = await ctx.supabase
    .from('memberships')
    .select(`${SELECT_MEMBRESIA}, notes, cancelled_at, activated_at, plan_snapshot, sale_item_id`)
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ErrorMembresiasServidor('error_interno', 500, error.message);
  if (!m) throw new ErrorMembresiasServidor('membresia_no_encontrada', 404);
  const r = m as unknown as Fila;

  const [eventos, congelamientos, entradas, permisos, pagadas, plan] = await Promise.all([
    ctx.supabase
      .from('membership_events')
      .select('id, event_type, description, created_at, metadata')
      .eq('organization_id', ctx.organizationId)
      .eq('membership_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    ctx.supabase
      .from('membership_freezes')
      .select('id, start_date, end_date, days_frozen, status, reason')
      .eq('membership_id', id)
      .order('start_date', { ascending: false }),
    ctx.supabase
      .from('member_checkins')
      .select('id, checkin_at, method, denied_reason, branches(name)')
      .eq('organization_id', ctx.organizationId)
      .eq('membership_id', id)
      .order('checkin_at', { ascending: false })
      .limit(50),
    permisosMembresias(ctx),
    ventasPagadas(ctx, [r]),
    ctx.supabase
      .from('membership_plans')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('id', numero(r.membership_plan_id))
      .maybeSingle(),
  ]);

  const evs = ((eventos.data ?? []) as Fila[]).map<EventoMembresia>((e) => ({
    id: String(e.id),
    tipo: String(e.event_type),
    descripcion: texto(e.description),
    fecha: String(e.created_at),
    metadata: (e.metadata as Record<string, unknown>) ?? {},
  }));

  // Pagos: la línea propia y las renovaciones (ligadas por el evento).
  const lineas = new Map<string, 'venta' | 'renovacion'>();
  if (r.sale_item_id) lineas.set(String(r.sale_item_id), 'venta');
  for (const e of evs) {
    const si = e.metadata?.sale_item_id;
    if ((e.tipo === 'renewed' || e.tipo === 'reactivated') && typeof si === 'string') lineas.set(si, 'renovacion');
  }
  const pagos: PagoMembresia[] = [];
  if (lineas.size > 0) {
    const { data: items } = await ctx.supabase
      .from('sale_items')
      .select('id, sale_id, quantity, total, created_at, sales!inner(organization_id, status, sale_date)')
      .in('id', Array.from(lineas.keys()))
      .eq('sales.organization_id', ctx.organizationId);
    const saleIds = Array.from(new Set(((items ?? []) as Fila[]).map((i) => String(i.sale_id))));
    const { data: facturas } = saleIds.length
      ? await ctx.supabase
          .from('invoice_sales')
          .select('id, number, status, balance, sale_id, document_type')
          .eq('organization_id', ctx.organizationId)
          .in('sale_id', saleIds)
      : { data: [] as Fila[] };
    const factPorVenta = new Map<string, Fila>();
    for (const f of (facturas ?? []) as Fila[]) {
      if ((texto(f.document_type) ?? 'invoice') === 'invoice' && !['void', 'voided'].includes(String(f.status))) {
        factPorVenta.set(String(f.sale_id), f);
      }
    }
    for (const i of (items ?? []) as Fila[]) {
      const venta = uno(i.sales as Fila | Fila[] | null);
      const f = factPorVenta.get(String(i.sale_id));
      pagos.push({
        saleItemId: String(i.id),
        saleId: String(i.sale_id),
        fecha: texto(venta?.sale_date) ?? texto(i.created_at),
        cantidad: numero(i.quantity),
        total: numero(i.total),
        estadoVenta: texto(venta?.status),
        factura: f ? { id: String(f.id), numero: String(f.number), estado: String(f.status), saldo: numero(f.balance) } : null,
        tipo: lineas.get(String(i.id)) ?? 'venta',
      });
    }
    pagos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  const freezes = (congelamientos.data ?? []) as Fila[];
  const usado = freezes
    .filter((f) => f.status !== 'cancelled')
    .reduce((acc, f) => ({ dias: acc.dias + numero(f.days_frozen), veces: acc.veces + 1 }), { dias: 0, veces: 0 });

  const snapshot = (r.plan_snapshot as Fila | null) ?? (plan.data as Fila | null);
  const productId = numeroONulo(r.product_id) ?? numeroONulo((plan.data as Fila | null)?.product_id);
  let precio: number | null = null;
  if (productId) precio = (await preciosVigentes(ctx, [productId])).get(productId) ?? null;

  const base = fila(r, tz, ahora, pagadas);
  return {
    zona: tz,
    membresia: {
      ...base,
      notas: texto(r.notes),
      motivoCancelacion: texto(r.cancel_reason),
      canceladaEn: texto(r.cancelled_at),
      activadaEn: texto(r.activated_at),
      periodos: numero((r.plan_snapshot as Fila | null)?.periodos) || 1,
      reglas: reglas(snapshot),
    },
    eventos: evs,
    congelamientos: freezes.map((f) => ({
      id: String(f.id),
      desde: String(f.start_date),
      hasta: texto(f.end_date),
      dias: numero(f.days_frozen),
      estado: String(f.status) as DetalleMembresia['congelamientos'][number]['estado'],
      motivo: texto(f.reason),
    })),
    entradas: ((entradas.data ?? []) as Fila[]).map((c) => ({
      id: numero(c.id),
      fecha: String(c.checkin_at),
      metodo: texto(c.method),
      permitido: !c.denied_reason,
      motivo: texto(c.denied_reason),
      sucursal: texto(uno(c.branches as Fila | Fila[] | null)?.name),
    })),
    pagos,
    congelamientoUsado: usado,
    precioRenovacion: precio,
    permisos,
  };
}

// ─── Planes ─────────────────────────────────────────────────────────────────

async function preciosVigentes(ctx: ServerOrgContext, productIds: number[]): Promise<Map<number, number>> {
  const res = new Map<number, number>();
  if (productIds.length === 0) return res;
  const ahora = new Date().toISOString();
  const { data } = await ctx.supabase
    .from('product_prices')
    .select('product_id, price, effective_from, effective_to')
    .in('product_id', productIds)
    .lte('effective_from', ahora)
    .order('effective_from', { ascending: false });
  for (const p of (data ?? []) as Fila[]) {
    const pid = numero(p.product_id);
    if (res.has(pid)) continue;
    const hasta = texto(p.effective_to);
    if (hasta && hasta <= ahora) continue;
    res.set(pid, numero(p.price));
  }
  return res;
}

async function planesConDatos(ctx: ServerOrgContext, soloId?: number): Promise<Array<PlanFila & { categoria: string | null; creado: string | null }>> {
  let q = ctx.supabase
    .from('membership_plans')
    .select('*, products(id, sku, name, status, description, categories(name))')
    .eq('organization_id', ctx.organizationId)
    .order('name');
  if (soloId) q = q.eq('id', soloId);
  const { data, error } = await q;
  if (error) throw new ErrorMembresiasServidor('error_interno', 500, error.message);
  const planes = (data ?? []) as Fila[];
  const productIds = planes.map((p) => numeroONulo(p.product_id)).filter((v): v is number => v !== null);
  const ahora = new Date().toISOString();
  const [precios, { data: vivas }] = await Promise.all([
    preciosVigentes(ctx, productIds),
    ctx.supabase
      .from('memberships')
      .select('membership_plan_id, status, end_date')
      .eq('organization_id', ctx.organizationId)
      .in('status', ['active', 'frozen', 'past_due', 'pending'])
      .limit(10000),
  ]);
  const conteo = new Map<number, { vivas: number; activas: number }>();
  for (const m of (vivas ?? []) as Fila[]) {
    const k = numero(m.membership_plan_id);
    const c = conteo.get(k) ?? { vivas: 0, activas: 0 };
    c.vivas += 1;
    if (m.status === 'active' && String(m.end_date) >= ahora) c.activas += 1;
    conteo.set(k, c);
  }
  return planes.map((p) => {
    const prod = uno(p.products as Fila | Fila[] | null);
    const pid = numeroONulo(p.product_id);
    const c = conteo.get(numero(p.id)) ?? { vivas: 0, activas: 0 };
    return {
      id: numero(p.id),
      nombre: texto(prod?.name) ?? String(p.name),
      descripcion: texto(prod?.description) ?? texto(p.description),
      productId: pid,
      sku: texto(prod?.sku),
      estadoProducto: texto(prod?.status),
      activo: p.is_active !== false && (texto(prod?.status) ?? 'active') === 'active',
      // P9: el precio es el del producto; membership_plans.price solo si el plan no tiene producto.
      precio: pid ? precios.get(pid) ?? null : numeroONulo(p.price),
      reglas: reglas(p),
      membresiasVivas: c.vivas,
      membresiasActivas: c.activas,
      categoria: texto(uno(prod?.categories as Fila | Fila[] | null)?.name),
      creado: texto(p.created_at),
    };
  });
}

export async function listarPlanes(ctx: ServerOrgContext): Promise<ListadoPlanes> {
  const [tz, planes, permisos] = await Promise.all([zonaDe(ctx), planesConDatos(ctx), permisosMembresias(ctx)]);
  return { zona: tz, planes, permisos };
}

function inicioDeMes(tz: string, ahora: Date): string {
  const hoy = toPlainDate(ahora, tz);
  return plainDateToInstant(`${hoy.slice(0, 7)}-01`, tz, '00:00');
}

export async function detallePlan(ctx: ServerOrgContext, id: number): Promise<DetallePlan> {
  const tz = await zonaDe(ctx);
  const ahora = new Date();
  const [planes, permisos] = await Promise.all([planesConDatos(ctx, id), permisosMembresias(ctx)]);
  const plan = planes[0];
  if (!plan) throw new ErrorMembresiasServidor('membresia_no_encontrada', 404, 'plan_no_encontrado');
  let ingresosMes = 0;
  let ventasMes = 0;
  if (plan.productId) {
    const { data: items } = await ctx.supabase
      .from('sale_items')
      .select('total, quantity, sales!inner(organization_id, status, sale_date)')
      .eq('product_id', plan.productId)
      .eq('sales.organization_id', ctx.organizationId)
      .neq('sales.status', 'void')
      .gte('sales.sale_date', inicioDeMes(tz, ahora))
      .limit(5000);
    for (const i of (items ?? []) as Fila[]) {
      ingresosMes += numero(i.total);
      ventasMes += 1;
    }
  }
  const { data: ultimas } = await ctx.supabase
    .from('memberships')
    .select(SELECT_MEMBRESIA)
    .eq('organization_id', ctx.organizationId)
    .eq('membership_plan_id', id)
    .or(`cancel_reason.is.null,cancel_reason.neq.${RENOVACION_APLICADA}`)
    .order('created_at', { ascending: false })
    .limit(10);
  const filas = (ultimas ?? []) as unknown as Fila[];
  const pagadas = await ventasPagadas(ctx, filas);
  return {
    zona: tz,
    plan,
    ingresosMes,
    ventasMes,
    ultimas: filas.map((r) => fila(r, tz, ahora, pagadas)),
    permisos,
  };
}

// ─── Miembros (personas) ────────────────────────────────────────────────────

const PRIORIDAD: Record<string, number> = { activa: 0, en_gracia: 1, congelada: 2, por_activar: 3, pendiente_pago: 4, vencida: 5, cancelada: 6 };

export async function listarMiembros(
  ctx: ServerOrgContext,
  filtros: { q?: string; pagina?: number; porPagina?: number; estado?: 'todos' | 'con_vigente' | 'sin_vigente' },
): Promise<ListadoMiembros> {
  const tz = await zonaDe(ctx);
  const ahora = new Date();
  const { pagina, porPagina, desde } = paginacion(filtros.pagina, filtros.porPagina);
  let query = ctx.supabase
    .from('memberships')
    .select(SELECT_MEMBRESIA)
    .eq('organization_id', ctx.organizationId)
    .or(`cancel_reason.is.null,cancel_reason.neq.${RENOVACION_APLICADA}`)
    .limit(5000);
  const q = (filtros.q ?? '').trim();
  if (q) {
    const ids = await clientesQueCoinciden(ctx, q);
    if (ids.length === 0) return { zona: tz, filas: [], total: 0, pagina, porPagina };
    query = query.in('customer_id', ids);
  }
  const { data, error } = await query;
  if (error) throw new ErrorMembresiasServidor('error_interno', 500, error.message);
  const filas = (data ?? []) as unknown as Fila[];
  const pagadas = await ventasPagadas(ctx, filas);

  const porCliente = new Map<string, MiembroFila>();
  for (const r of filas) {
    const f = fila(r, tz, ahora, pagadas);
    const actual = porCliente.get(f.cliente.id);
    if (!actual) {
      porCliente.set(f.cliente.id, { cliente: f.cliente, membresias: 1, vigente: f, ultimaEntrada: null });
      continue;
    }
    actual.membresias += 1;
    const a = actual.vigente;
    if (!a || PRIORIDAD[f.estadoVisual] < PRIORIDAD[a.estadoVisual] || (PRIORIDAD[f.estadoVisual] === PRIORIDAD[a.estadoVisual] && f.hasta > a.hasta)) {
      actual.vigente = f;
    }
  }
  let lista = Array.from(porCliente.values());
  if (filtros.estado === 'con_vigente') lista = lista.filter((m) => m.vigente && ['activa', 'en_gracia', 'congelada'].includes(m.vigente.estadoVisual));
  if (filtros.estado === 'sin_vigente') lista = lista.filter((m) => !m.vigente || !['activa', 'en_gracia', 'congelada'].includes(m.vigente.estadoVisual));
  lista.sort((a, b) => a.cliente.nombre.localeCompare(b.cliente.nombre, 'es'));
  const pagina_ = lista.slice(desde, desde + porPagina);

  const ids = pagina_.map((m) => m.cliente.id);
  if (ids.length > 0) {
    const { data: entradas } = await ctx.supabase
      .from('member_checkins')
      .select('customer_id, checkin_at')
      .eq('organization_id', ctx.organizationId)
      .in('customer_id', ids)
      .is('denied_reason', null)
      .order('checkin_at', { ascending: false })
      .limit(500);
    const ultima = new Map<string, string>();
    for (const e of (entradas ?? []) as Fila[]) {
      const k = String(e.customer_id);
      if (!ultima.has(k)) ultima.set(k, String(e.checkin_at));
    }
    for (const m of pagina_) m.ultimaEntrada = ultima.get(m.cliente.id) ?? null;
  }
  return { zona: tz, filas: pagina_, total: lista.length, pagina, porPagina };
}

// ─── Pagos (ventas y facturas con líneas membresía) ─────────────────────────

export async function listarPagos(
  ctx: ServerOrgContext,
  filtros: { pagina?: number; porPagina?: number; desde?: string; hasta?: string },
): Promise<ListadoPagos> {
  const tz = await zonaDe(ctx);
  const { pagina, porPagina, desde, hasta } = paginacion(filtros.pagina, filtros.porPagina);
  const { data: planes } = await ctx.supabase
    .from('membership_plans')
    .select('product_id, products(name)')
    .eq('organization_id', ctx.organizationId)
    .not('product_id', 'is', null);
  const nombres = new Map<number, string>();
  for (const p of (planes ?? []) as Fila[]) {
    nombres.set(numero(p.product_id), texto(uno(p.products as Fila | Fila[] | null)?.name) ?? '—');
  }
  const ids = Array.from(nombres.keys());
  if (ids.length === 0) return { zona: tz, filas: [], total: 0, pagina, porPagina, totalImporte: 0 };

  let q = ctx.supabase
    .from('sale_items')
    .select(
      'id, sale_id, product_id, quantity, total, created_at, ' +
        'sales!inner(organization_id, status, sale_date, customers(id, full_name, first_name, last_name, identification_number, doc_number, email, phone, avatar_url))',
      { count: 'exact' },
    )
    .in('product_id', ids)
    .eq('sales.organization_id', ctx.organizationId)
    .gt('quantity', 0);
  if (filtros.desde) q = q.gte('sales.sale_date', plainDateToInstant(filtros.desde, tz, '00:00'));
  if (filtros.hasta) q = q.lte('sales.sale_date', plainDateToInstant(filtros.hasta, tz, '23:59:59'));
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(desde, hasta);
  if (error) throw new ErrorMembresiasServidor('error_interno', 500, error.message);
  const items = (data ?? []) as unknown as Fila[];

  const saleIds = Array.from(new Set(items.map((i) => String(i.sale_id))));
  const itemIds = items.map((i) => String(i.id));
  const [{ data: facturas }, { data: membresias }] = await Promise.all([
    saleIds.length
      ? ctx.supabase
          .from('invoice_sales')
          .select('id, number, status, balance, sale_id, document_type')
          .eq('organization_id', ctx.organizationId)
          .in('sale_id', saleIds)
      : Promise.resolve({ data: [] as Fila[] }),
    itemIds.length
      ? ctx.supabase.from('memberships').select('id, sale_item_id').eq('organization_id', ctx.organizationId).in('sale_item_id', itemIds)
      : Promise.resolve({ data: [] as Fila[] }),
  ]);
  const fact = new Map<string, Fila>();
  for (const f of (facturas ?? []) as Fila[]) {
    if ((texto(f.document_type) ?? 'invoice') === 'invoice' && !['void', 'voided'].includes(String(f.status))) fact.set(String(f.sale_id), f);
  }
  const memPorLinea = new Map<string, number>();
  for (const m of (membresias ?? []) as Fila[]) memPorLinea.set(String(m.sale_item_id), numero(m.id));

  let totalImporte = 0;
  const filas: PagoFila[] = items.map((i) => {
    const venta = uno(i.sales as Fila | Fila[] | null);
    const c = uno(venta?.customers as Fila | Fila[] | null);
    const f = fact.get(String(i.sale_id));
    totalImporte += numero(i.total);
    return {
      saleItemId: String(i.id),
      saleId: String(i.sale_id),
      fecha: texto(venta?.sale_date) ?? texto(i.created_at),
      cliente: c ? cliente(c) : null,
      producto: nombres.get(numero(i.product_id)) ?? '—',
      cantidad: numero(i.quantity),
      total: numero(i.total),
      estadoVenta: texto(venta?.status),
      factura: f ? { id: String(f.id), numero: String(f.number), estado: String(f.status), saldo: numero(f.balance) } : null,
      membresiaId: memPorLinea.get(String(i.id)) ?? null,
    };
  });
  return { zona: tz, filas, total: count ?? filas.length, pagina, porPagina, totalImporte };
}

// ─── Resumen del módulo (E1/E2) ─────────────────────────────────────────────

export async function resumenMembresias(ctx: ServerOrgContext): Promise<ResumenMembresias> {
  const tz = await zonaDe(ctx);
  const ahora = new Date();
  const inicioMes = inicioDeMes(tz, ahora);
  const hoy = plainDateToInstant(toPlainDate(ahora, tz), tz, '00:00');
  const semana = new Date(ahora.getTime() + 7 * 86_400_000).toISOString();

  const [conteo, permisos, nuevas, entradas, porVencerQ, graciaQ, actividadQ, planesQ] = await Promise.all([
    conteoEstados(ctx, tz, ahora),
    permisosMembresias(ctx),
    ctx.supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .gte('created_at', inicioMes)
      .or(`cancel_reason.is.null,cancel_reason.neq.${RENOVACION_APLICADA}`),
    ctx.supabase
      .from('member_checkins')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .is('denied_reason', null)
      .gte('checkin_at', hoy),
    ctx.supabase
      .from('memberships')
      .select(SELECT_MEMBRESIA)
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active')
      .gte('end_date', ahora.toISOString())
      .lte('end_date', semana)
      .order('end_date')
      .limit(8),
    ctx.supabase
      .from('memberships')
      .select(SELECT_MEMBRESIA)
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'past_due')
      .order('grace_until')
      .limit(8),
    ctx.supabase
      .from('membership_events')
      .select('id, event_type, description, created_at, metadata, membership_id, memberships(customers(full_name, first_name, last_name))')
      .eq('organization_id', ctx.organizationId)
      .in('event_type', ['created', 'activated', 'renewed', 'reactivated', 'frozen', 'unfrozen', 'cancelled', 'expired', 'trimmed', 'grace_started'])
      .order('created_at', { ascending: false })
      .limit(10),
    planesConDatos(ctx),
  ]);

  let ingresosMes = 0;
  const productos = planesQ.map((p) => p.productId).filter((v): v is number => v !== null);
  if (productos.length > 0) {
    const { data: items } = await ctx.supabase
      .from('sale_items')
      .select('total, sales!inner(organization_id, status, sale_date)')
      .in('product_id', productos)
      .eq('sales.organization_id', ctx.organizationId)
      .neq('sales.status', 'void')
      .gte('sales.sale_date', inicioMes)
      .limit(10000);
    for (const i of (items ?? []) as Fila[]) ingresosMes += numero(i.total);
  }

  const vence = (porVencerQ.data ?? []) as unknown as Fila[];
  const gracia = (graciaQ.data ?? []) as unknown as Fila[];
  const pagadas = new Set<string>();
  return {
    zona: tz,
    conteo,
    nuevasMes: nuevas.count ?? 0,
    ingresosMes,
    entradasHoy: entradas.count ?? 0,
    porVencer: vence.map((r) => fila(r, tz, ahora, pagadas)),
    enGracia: gracia.map((r) => fila(r, tz, ahora, pagadas)).filter((m) => m.estadoVisual === 'en_gracia'),
    porPlan: planesQ
      .filter((p) => p.membresiasActivas > 0)
      .map((p) => ({ plan: { id: p.id, nombre: p.nombre, productId: p.productId } as PlanResumen, activas: p.membresiasActivas }))
      .sort((a, b) => b.activas - a.activas),
    actividad: ((actividadQ.data ?? []) as Fila[]).map((e) => {
      const mem = uno(e.memberships as Fila | Fila[] | null);
      const c = uno(mem?.customers as Fila | Fila[] | null);
      return {
        id: String(e.id),
        tipo: String(e.event_type),
        descripcion: texto(e.description),
        fecha: String(e.created_at),
        metadata: (e.metadata as Record<string, unknown>) ?? {},
        membresiaId: numero(e.membership_id),
        cliente: c ? cliente(c).nombre : null,
      };
    }),
    planesSinProducto: planesQ.filter((p) => !p.productId).length,
    permisos,
  };
}

// ─── Acciones (RPC con permiso y guarda de organización dentro) ─────────────

const CODIGOS = new Set<string>(ERRORES_MEMBRESIAS);

function traducirError(err: { message?: string; code?: string } | null): ErrorMembresiasServidor {
  const msg = err?.message ?? '';
  if (CODIGOS.has(msg)) {
    const estado = msg === 'sin_permiso' ? 403 : msg === 'membresia_no_encontrada' || msg === 'cliente_no_encontrado' ? 404 : 422;
    return new ErrorMembresiasServidor(msg as ErrorMembresias, estado);
  }
  if (err?.code === '42501') return new ErrorMembresiasServidor('sin_permiso', 403);
  console.error('[membresias] RPC falló', { code: err?.code, message: msg.slice(0, 200) });
  return new ErrorMembresiasServidor('error_interno', 500);
}

/** La membresía existe Y es de la organización de la sesión (si no, 404: no se revela). */
async function exigirDeLaOrganizacion(ctx: ServerOrgContext, id: number): Promise<void> {
  const { data } = await ctx.supabase
    .from('memberships')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (!data) throw new ErrorMembresiasServidor('membresia_no_encontrada', 404);
}

export async function congelarMembresia(
  ctx: ServerOrgContext,
  id: number,
  datos: { desde: string; hasta: string; motivo?: string | null },
): Promise<Record<string, unknown>> {
  await exigir(ctx, 'congelar');
  await exigirDeLaOrganizacion(ctx, id);
  const { data, error } = await ctx.supabase.rpc('fn_membresia_congelar', {
    p_membership_id: id,
    p_desde: datos.desde,
    p_hasta: datos.hasta,
    p_motivo: datos.motivo ?? null,
  });
  if (error) throw traducirError(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function descongelarMembresia(ctx: ServerOrgContext, id: number): Promise<Record<string, unknown>> {
  await exigir(ctx, 'congelar');
  await exigirDeLaOrganizacion(ctx, id);
  const { data, error } = await ctx.supabase.rpc('fn_membresia_descongelar', { p_membership_id: id });
  if (error) throw traducirError(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function cancelarMembresia(ctx: ServerOrgContext, id: number, motivo: string): Promise<Record<string, unknown>> {
  await exigir(ctx, 'cancelar');
  await exigirDeLaOrganizacion(ctx, id);
  const { data, error } = await ctx.supabase.rpc('fn_membresia_cancelar', { p_membership_id: id, p_motivo: motivo });
  if (error) throw traducirError(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function registrarEntrada(
  ctx: ServerOrgContext,
  datos: { clienteId: string; sucursalId: number; metodo?: string; membresiaId?: number | null },
): Promise<ResultadoCheckin> {
  await exigir(ctx, 'checkin');
  const { data, error } = await ctx.supabase.rpc('fn_membresia_registrar_checkin', {
    p_organization_id: ctx.organizationId,
    p_customer_id: datos.clienteId,
    p_branch_id: datos.sucursalId,
    p_method: datos.metodo ?? 'manual',
    p_membership_id: datos.membresiaId ?? null,
  });
  if (error) throw traducirError(error);
  const r = (data ?? {}) as Fila;
  const m = r.membresia as Fila | null;
  return {
    permitido: r.permitido === true,
    motivo: texto(r.motivo),
    aviso: texto(r.aviso),
    diasGracia: numeroONulo(r.dias_gracia),
    checkinId: numero(r.checkin_id),
    membresia: m
      ? {
          id: numero(m.id),
          estado: String(m.estado) as EstadoMembresia,
          plan: texto(m.plan),
          desde: String(m.desde),
          hasta: String(m.hasta),
          graceUntil: texto(m.grace_until),
          codigo: texto(m.codigo),
        }
      : null,
  };
}

/** Búsqueda para el check-in: nombre, documento (identification_number), correo, teléfono o código. */
export async function buscarParaEntrada(
  ctx: ServerOrgContext,
  q: string,
): Promise<Array<{ cliente: ClienteResumen; vigente: MembresiaFila | null }>> {
  await exigir(ctx, 'checkin');
  const texto_ = q.trim();
  if (texto_.length < 2) return [];
  const p = patronBusqueda(texto_);
  const [ids, { data: porCodigo }] = await Promise.all([
    clientesQueCoinciden(ctx, texto_),
    ctx.supabase.from('memberships').select('customer_id').eq('organization_id', ctx.organizationId).ilike('access_code', `%${p}%`).limit(20),
  ]);
  const todos = Array.from(new Set([...ids, ...((porCodigo ?? []) as Fila[]).map((m) => String(m.customer_id))])).slice(0, 20);
  if (todos.length === 0) return [];
  const listado = await listarMiembrosPorIds(ctx, todos);
  return listado;
}

async function listarMiembrosPorIds(
  ctx: ServerOrgContext,
  ids: string[],
): Promise<Array<{ cliente: ClienteResumen; vigente: MembresiaFila | null }>> {
  const tz = await zonaDe(ctx);
  const ahora = new Date();
  const [{ data: clientes }, { data: membresias }] = await Promise.all([
    ctx.supabase
      .from('customers')
      .select('id, full_name, first_name, last_name, identification_number, doc_number, email, phone, avatar_url')
      .eq('organization_id', ctx.organizationId)
      .in('id', ids),
    ctx.supabase
      .from('memberships')
      .select(SELECT_MEMBRESIA)
      .eq('organization_id', ctx.organizationId)
      .in('customer_id', ids)
      .or(`cancel_reason.is.null,cancel_reason.neq.${RENOVACION_APLICADA}`),
  ]);
  const filas = (membresias ?? []) as unknown as Fila[];
  const pagadas = await ventasPagadas(ctx, filas);
  const mejor = new Map<string, MembresiaFila>();
  for (const r of filas) {
    const f = fila(r, tz, ahora, pagadas);
    const a = mejor.get(f.cliente.id);
    if (!a || PRIORIDAD[f.estadoVisual] < PRIORIDAD[a.estadoVisual]) mejor.set(f.cliente.id, f);
  }
  return ((clientes ?? []) as Fila[]).map((c) => {
    const cr = cliente(c);
    return { cliente: cr, vigente: mejor.get(cr.id) ?? null };
  });
}
