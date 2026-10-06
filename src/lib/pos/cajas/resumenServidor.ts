/**
 * Resumen de una caja armado EN EL SERVIDOR (paso 6 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md): sesión, esperado de
 * `pos_caja_esperado`, movimientos, arqueos y ventas del turno en una sola
 * respuesta, con la máscara del cierre ciego ya aplicada (D8): quien no puede
 * ver el esperado no lo recibe, ni el desglose que permite reconstruirlo, ni
 * la diferencia.
 *
 * Solo lectura, con el cliente de la sesión (`ctx.supabase`): la RLS de
 * `cash_sessions`, `cash_movements`, `cash_counts` y `sales` (pertenencia y
 * acceso a la sucursal) sigue aplicando. Lo usan `GET /api/pos/cajas/[id]/resumen`
 * y, para varias cajas, `GET /api/pos/cajas/resumenes`.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { claveDeConcepto } from './conceptos';
import {
  enmascararArqueo,
  enmascararEsperado,
  enmascararSesion,
  leerEsperado,
  visibilidadImportes,
  type EsperadoCaja,
  type LineaArqueo,
} from './cierreCiego';
import { organizacionUsaCierreCiego, resolverPermisosCaja, type PermisosCaja } from './permisosCaja';
import { puedeCerrarCaja } from './reglasCierre';
import { mesaDelPedido, tipoEntregaEfectivo, type TipoEntregaWeb } from '@/lib/pos/pedidosWeb/tipoEntrega';

type Ctx = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

export interface SesionResumen {
  id: number;
  uuid: string;
  organization_id: number;
  branch_id: number | null;
  branch_name: string | null;
  opened_by: string;
  opened_by_name: string | null;
  opened_at: string;
  initial_amount: number;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  final_amount: number | null;
  difference: number | null;
  status: 'open' | 'closed';
  notes: string | null;
}

export interface MovimientoResumen {
  id: number;
  uuid: string | null;
  type: 'in' | 'out';
  concept: string;
  concept_code: string | null;
  /** Clave del catálogo con que se traduce el concepto (también para movimientos viejos), o `null` = texto tal cual. */
  clave_concepto: string | null;
  reference: string | null;
  amount: number;
  notes: string | null;
  created_at: string;
  user_id: string;
  user_name: string | null;
}

export interface ArqueoResumen {
  id: number;
  count_type: 'opening' | 'partial' | 'closing';
  counted_amount: number;
  expected_amount: number | null;
  difference: number | null;
  denominations: { bills?: Record<string, number>; coins?: Record<string, number> } | null;
  method_breakdown: Record<string, LineaArqueo> | null;
  counted_by: string;
  counted_by_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface VentaTurno {
  id: string;
  total: number;
  status: string;
  payment_status: string | null;
  created_at: string;
  numero: string | null;
  cliente: string | null;
  /** Número del pedido web (W-xxxx) si la venta viene de un pedido web cobrado en esta caja. */
  pedido_web?: string | null;
  /** De dónde viene la venta (columna «Origen»): POS, mesa (con su zona) o pedido web. */
  origen?: OrigenVentaTurno;
  /** Método del cobro (código de payment_methods), o `mixed` si hubo varios. */
  metodo?: string | null;
  /** Pedido web pagado en línea: se lista, pero NO entra al arqueo ni al total del turno. */
  en_linea?: boolean;
}

export type OrigenVentaTurno =
  | { tipo: 'pos' }
  | { tipo: 'mesa'; mesa: string; zona: string | null }
  | { tipo: 'web'; pedido: string; entrega: TipoEntregaWeb; mesa: string | null };

/** Cifras de pedidos web del turno (tarjetas de la pestaña Ventas, Figma 3b). */
export interface VentasWebTurno {
  /** Pedidos web cobrados en esta caja (pago en el local, E4): están en el total y en el arqueo. */
  enCaja: { cantidad: number; total: number };
  /** Pedidos web pagados en línea en la sede durante el turno: fuera del arqueo de efectivo. */
  enLinea: { cantidad: number; total: number; metodos: string[] };
}

export interface ResumenCaja {
  sesion: SesionResumen;
  modo: 'branch' | 'user';
  esperado: EsperadoCaja;
  movimientos: MovimientoResumen[];
  arqueos: ArqueoResumen[];
  ventas: { cantidad: number; total: number; filas: VentaTurno[]; truncadas: boolean; web?: VentasWebTurno };
  permisos: PermisosCaja & { puedeCerrar: boolean; esPropia: boolean };
  cierreCiego: boolean;
  /** false = las cifras de esperado, desglose y diferencias vienen ocultas. */
  verImportes: boolean;
}

export class ErrorResumenCaja extends Error {
  constructor(
    readonly codigo: 'caja_no_encontrada' | 'lectura_fallida' | 'caja_invalida',
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITE_VENTAS = 500;

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

async function nombres(ctx: Ctx, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map();
  const { data } = await ctx.supabase.from('profiles').select('id, first_name, last_name, email').in('id', unicos);
  return new Map(
    ((data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || '',
    ]),
  );
}

/** Modo de caja de la organización (`organization_settings.pos_cash_session_mode`). */
export async function modoCajaOrganizacion(ctx: Pick<Ctx, 'organizationId' | 'supabase'>): Promise<'branch' | 'user'> {
  const { data } = await ctx.supabase
    .from('organization_settings')
    .select('settings')
    .eq('organization_id', ctx.organizationId)
    .eq('key', 'pos_cash_session_mode')
    .maybeSingle();
  return (data as { settings?: { mode?: unknown } } | null)?.settings?.mode === 'user' ? 'user' : 'branch';
}

/** Lee la sesión por id numérico o por uuid (la URL del detalle usa el uuid). */
async function leerSesion(ctx: Ctx, idOUuid: string) {
  let q = ctx.supabase
    .from('cash_sessions')
    .select('id, uuid, organization_id, branch_id, opened_by, opened_at, initial_amount, closed_at, closed_by, final_amount, difference, status, notes')
    .eq('organization_id', ctx.organizationId);
  if (UUID.test(idOUuid)) q = q.eq('uuid', idOUuid.toLowerCase());
  else if (/^\d{1,10}$/.test(idOUuid)) q = q.eq('id', Number(idOUuid));
  else throw new ErrorResumenCaja('caja_invalida', 400, 'Identificador de caja inválido');
  const { data, error } = await q.maybeSingle();
  if (error) throw new ErrorResumenCaja('lectura_fallida', 500, error.message);
  if (!data) throw new ErrorResumenCaja('caja_no_encontrada', 404, 'La caja no existe');
  return data as {
    id: number;
    uuid: string;
    organization_id: number;
    branch_id: number | null;
    opened_by: string;
    opened_at: string;
    initial_amount: number | string;
    closed_at: string | null;
    closed_by: string | null;
    final_amount: number | string | null;
    difference: number | string | null;
    status: 'open' | 'closed';
    notes: string | null;
  };
}

/** Ventas del turno: misma regla que `CajasService.getSessionSales` (las que entran en caja y no están pendientes). */
type FilaVenta = {
  id: string;
  total: number | string | null;
  status: string;
  payment_status: string | null;
  created_at: string;
  customer_id: string | null;
  source: string | null;
  web_order_id: string | null;
  table_session_id: string | null;
};
const COLUMNAS_VENTA = 'id, total, status, payment_status, created_at, customer_id, source, web_order_id, table_session_id';

/**
 * Ventas del turno (pestaña Ventas del detalle de caja).
 *
 * - Ventas de caja (POS y mesas): `include_in_cash_register`, creadas en la
 *   ventana del turno y, en modo cajero, por quien abrió la caja. Igual que
 *   antes, salvo que las de origen web van aparte (abajo): hoy no hay ninguna
 *   venta web dentro de caja (verificado por MCP, 2026-10-06: 721 ventas web,
 *   todas con include_in_cash_register=false).
 * - Pedidos web cobrados en esta caja (E4): el turno lo decide el PAGO, no la
 *   venta. La venta nace al confirmar (quizá antes de abrir la caja, o la
 *   confirmó otra persona); el pago lo registra el cajero al cobrar, y es lo
 *   que `pos_caja__esperado_calculo` suma al arqueo (misma ventana, sede y, en
 *   modo cajero, `payments.created_by`).
 * - Pedidos web pagados en línea en la sede durante el turno (solo en modo
 *   sede): se listan como «No · pagado en línea» y van en su propia tarjeta,
 *   sin sumar al total ni al arqueo de efectivo.
 */
async function ventasDelTurno(
  ctx: Ctx,
  s: { branch_id: number | null; opened_at: string; closed_at: string | null; opened_by: string },
  modo: 'branch' | 'user',
): Promise<ResumenCaja['ventas']> {
  const hasta = s.closed_at ?? new Date().toISOString();
  let q = ctx.supabase
    .from('sales')
    .select(COLUMNAS_VENTA, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .eq('include_in_cash_register', true)
    .neq('payment_status', 'pending')
    .neq('source', 'web')
    .gte('created_at', s.opened_at)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })
    .limit(LIMITE_VENTAS);
  if (s.branch_id) q = q.eq('branch_id', s.branch_id);
  if (modo === 'user') q = q.eq('user_id', s.opened_by);

  // Pagos de facturas en la ventana del turno: dan los pedidos web cobrados aquí.
  let pagosQ = ctx.supabase
    .from('payments')
    .select('source_id, method, created_at')
    .eq('organization_id', ctx.organizationId)
    .eq('source', 'invoice_sales')
    .eq('status', 'completed')
    .gte('created_at', s.opened_at)
    .lte('created_at', hasta)
    .limit(LIMITE_VENTAS * 2);
  if (s.branch_id) pagosQ = pagosQ.eq('branch_id', s.branch_id);
  if (modo === 'user') pagosQ = pagosQ.eq('created_by', s.opened_by);

  // Pagados en línea en la sede durante el turno (solo modo sede: en modo
  // cajero no son de nadie y saldrían repetidos en cada caja).
  let enLineaQ =
    modo === 'branch'
      ? ctx.supabase
          .from('sales')
          .select(COLUMNAS_VENTA)
          .eq('organization_id', ctx.organizationId)
          .eq('source', 'web')
          .eq('include_in_cash_register', false)
          .eq('payment_status', 'paid')
          .gte('created_at', s.opened_at)
          .lte('created_at', hasta)
          .order('created_at', { ascending: false })
          .limit(LIMITE_VENTAS)
      : null;
  if (enLineaQ && s.branch_id) enLineaQ = enLineaQ.eq('branch_id', s.branch_id);

  const [principal, pagos, enLineaRes] = await Promise.all([q, pagosQ, enLineaQ ?? Promise.resolve({ data: [], error: null })]);
  if (principal.error) throw new ErrorResumenCaja('lectura_fallida', 500, principal.error.message);
  const filasCaja = (principal.data ?? []) as FilaVenta[];
  const count = principal.count;

  // Pedidos web cobrados en esta caja, por el pago. Si una lectura auxiliar
  // falla, la pestaña sale como antes (solo ventas de caja).
  const pagosFact = pagos.error ? [] : ((pagos.data ?? []) as Array<{ source_id: string; method: string | null; created_at: string }>);
  const facturasPagadas = [...new Set(pagosFact.map((p) => p.source_id))];
  const factWeb = facturasPagadas.length
    ? await ctx.supabase.from('invoice_sales').select('id, sale_id').eq('organization_id', ctx.organizationId).in('id', facturasPagadas)
    : { data: [] as unknown[], error: null };
  const ventaDeFactura = new Map(((factWeb.data ?? []) as Array<{ id: string; sale_id: string | null }>).map((f) => [f.id, f.sale_id]));
  const pagoPorVenta = new Map<string, { metodos: Set<string>; created_at: string }>();
  for (const p of pagosFact) {
    const venta = ventaDeFactura.get(p.source_id);
    if (!venta) continue;
    const previo = pagoPorVenta.get(venta) ?? { metodos: new Set<string>(), created_at: p.created_at };
    if (p.method) previo.metodos.add(p.method);
    if (p.created_at > previo.created_at) previo.created_at = p.created_at;
    pagoPorVenta.set(venta, previo);
  }
  const ventasPagadasAqui = [...pagoPorVenta.keys()];
  const webEnCajaRes = ventasPagadasAqui.length
    ? await ctx.supabase
        .from('sales')
        .select(COLUMNAS_VENTA)
        .eq('organization_id', ctx.organizationId)
        .eq('source', 'web')
        .eq('include_in_cash_register', true)
        .in('id', ventasPagadasAqui)
    : { data: [] as unknown[], error: null };
  const filasWebCaja = (webEnCajaRes.error ? [] : (webEnCajaRes.data ?? []) as FilaVenta[]).map((f) => ({
    ...f,
    // El turno y la hora son los del cobro.
    created_at: pagoPorVenta.get(f.id)?.created_at ?? f.created_at,
  }));
  const filasEnLinea = enLineaRes.error ? [] : ((enLineaRes.data ?? []) as FilaVenta[]);

  const todas = [...filasCaja, ...filasWebCaja, ...filasEnLinea];
  const ids = todas.map((f) => f.id);
  const clientesIds = [...new Set(todas.map((f) => f.customer_id).filter((x): x is string => !!x))];
  const pedidosIds = [...new Set(todas.filter((f) => f.source === 'web' && f.web_order_id).map((f) => f.web_order_id as string))];
  const sesionesIds = [...new Set(todas.map((f) => f.table_session_id).filter((x): x is string => !!x))];
  const [facturas, clientes, pedidosWeb, sesiones] = await Promise.all([
    ids.length
      ? ctx.supabase.from('invoice_sales').select('id, sale_id, number, document_type, status').in('sale_id', ids)
      : Promise.resolve({ data: [] as unknown[] }),
    clientesIds.length
      ? ctx.supabase.from('customers').select('id, full_name').in('id', clientesIds)
      : Promise.resolve({ data: [] as unknown[] }),
    pedidosIds.length
      ? ctx.supabase
          .from('web_orders')
          .select('id, order_number, delivery_type, internal_notes, payment_method')
          .eq('organization_id', ctx.organizationId)
          .in('id', pedidosIds)
      : Promise.resolve({ data: [] as unknown[] }),
    sesionesIds.length
      ? ctx.supabase
          .from('table_sessions')
          .select('id, restaurant_tables(name, zone)')
          .eq('organization_id', ctx.organizationId)
          .in('id', sesionesIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  type Pedido = { id: string; order_number: string; delivery_type: string | null; internal_notes: string | null; payment_method: string | null };
  const pedidoPorId = new Map(((pedidosWeb.data ?? []) as Pedido[]).map((p) => [p.id, p]));
  const mesaPorSesion = new Map(
    ((sesiones.data ?? []) as Array<{ id: string; restaurant_tables: { name: string | null; zone: string | null } | Array<{ name: string | null; zone: string | null }> | null }>).map((x) => {
      const t = Array.isArray(x.restaurant_tables) ? x.restaurant_tables[0] : x.restaurant_tables;
      return [x.id, { mesa: t?.name ?? '', zona: t?.zone ?? null }];
    }),
  );
  const numeros = new Map<string, string>();
  const facturaPorVenta = new Map<string, string>();
  for (const f of (facturas.data ?? []) as Array<{ id: string; sale_id: string; number: string; document_type: string | null; status: string }>) {
    if (f.document_type === 'credit_note') continue;
    if (!numeros.has(f.sale_id) || f.status !== 'void') {
      numeros.set(f.sale_id, f.number);
      facturaPorVenta.set(f.sale_id, f.id);
    }
  }
  const nombresClientes = new Map(((clientes.data ?? []) as Array<{ id: string; full_name: string | null }>).map((c) => [c.id, c.full_name]));

  // Método de las ventas de caja: los pagos de su factura (o de la venta).
  const facturasCaja = filasCaja.map((f) => facturaPorVenta.get(f.id)).filter((x): x is string => !!x);
  const metodosCaja = new Map<string, Set<string>>();
  if (filasCaja.length) {
    const [pf, pv] = await Promise.all([
      facturasCaja.length
        ? ctx.supabase.from('payments').select('source_id, method').eq('organization_id', ctx.organizationId).eq('source', 'invoice_sales').eq('status', 'completed').in('source_id', facturasCaja)
        : Promise.resolve({ data: [] as unknown[] }),
      ctx.supabase.from('payments').select('source_id, method').eq('organization_id', ctx.organizationId).eq('source', 'sale').eq('status', 'completed').in('source_id', filasCaja.map((f) => f.id)),
    ]);
    const ventaPorFactura = new Map([...facturaPorVenta.entries()].map(([venta, fact]) => [fact, venta]));
    for (const p of (pf.data ?? []) as Array<{ source_id: string; method: string | null }>) {
      const venta = ventaPorFactura.get(p.source_id);
      if (venta && p.method) metodosCaja.set(venta, (metodosCaja.get(venta) ?? new Set()).add(p.method));
    }
    for (const p of (pv.data ?? []) as Array<{ source_id: string; method: string | null }>) {
      if (p.method) metodosCaja.set(p.source_id, (metodosCaja.get(p.source_id) ?? new Set()).add(p.method));
    }
  }
  const unMetodo = (m: Set<string> | undefined): string | null => (!m || m.size === 0 ? null : m.size > 1 ? 'mixed' : [...m][0]);

  const origenDe = (f: FilaVenta): OrigenVentaTurno => {
    const pedido = f.source === 'web' && f.web_order_id ? pedidoPorId.get(f.web_order_id) : undefined;
    if (pedido) {
      return { tipo: 'web', pedido: pedido.order_number, entrega: tipoEntregaEfectivo(pedido), mesa: mesaDelPedido(pedido) };
    }
    const mesa = f.table_session_id ? mesaPorSesion.get(f.table_session_id) : undefined;
    if (mesa && mesa.mesa) return { tipo: 'mesa', mesa: mesa.mesa, zona: mesa.zona };
    return { tipo: 'pos' };
  };
  const fila = (f: FilaVenta, extra: Partial<VentaTurno>): VentaTurno => {
    const origen = origenDe(f);
    return {
      id: f.id,
      total: n(f.total),
      status: f.status,
      payment_status: f.payment_status,
      created_at: f.created_at,
      numero: numeros.get(f.id) ?? null,
      cliente: f.customer_id ? nombresClientes.get(f.customer_id) ?? null : null,
      pedido_web: origen.tipo === 'web' ? origen.pedido : null,
      origen,
      ...extra,
    };
  };

  const filas = [
    ...filasCaja.map((f) => fila(f, { metodo: unMetodo(metodosCaja.get(f.id)), en_linea: false })),
    ...filasWebCaja.map((f) => fila(f, { metodo: unMetodo(pagoPorVenta.get(f.id)?.metodos), en_linea: false })),
    ...filasEnLinea.map((f) => fila(f, { metodo: (f.web_order_id ? pedidoPorId.get(f.web_order_id)?.payment_method : null) ?? null, en_linea: true })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  const suma = (xs: FilaVenta[]) => Math.round(xs.reduce((acc, f) => acc + n(f.total), 0) * 100) / 100;
  const web: VentasWebTurno = {
    enCaja: { cantidad: filasWebCaja.length, total: suma(filasWebCaja) },
    enLinea: {
      cantidad: filasEnLinea.length,
      total: suma(filasEnLinea),
      metodos: [...new Set(filas.filter((f) => f.en_linea).map((f) => f.metodo).filter((x): x is string => !!x))],
    },
  };

  // El total del turno cuenta lo cobrado en esta caja (no lo pagado en línea).
  // Si hay más de LIMITE_VENTAS ventas de caja se avisa.
  return {
    cantidad: (count ?? filasCaja.length) + filasWebCaja.length,
    total: Math.round((suma(filasCaja) + suma(filasWebCaja)) * 100) / 100,
    truncadas: (count ?? 0) > filasCaja.length,
    filas,
    web,
  };
}

/** Cifras de una caja abierta para el listado «Cajas abiertas» (sin N+1 desde el navegador). */
export interface ResumenCompacto {
  sales_cash: number | null;
  sales_cash_count: number;
  expected_amount: number | null;
  cash_in: number;
  cash_out: number;
  cash_in_count: number;
  cash_out_count: number;
}

const MAX_CAJAS_LOTE = 60;

/**
 * Resumen compacto de varias cajas (`GET /api/pos/cajas/resumenes?ids=…`):
 * esperado y ventas en efectivo de `pos_caja_esperado`, conteo de movimientos
 * y de cobros en efectivo. Con cierre ciego sin permiso, sin cifras de dinero.
 * Antes el listado pedía `getCashSummary` por cada caja desde el navegador (R12).
 */
export async function resumenesCompactos(ctx: Ctx, ids: readonly number[]): Promise<Record<number, ResumenCompacto>> {
  const unicos = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_CAJAS_LOTE);
  if (unicos.length === 0) return {};
  const [permisos, cierreCiego, modo, sesionesRes, movRes] = await Promise.all([
    resolverPermisosCaja(ctx),
    organizacionUsaCierreCiego(ctx),
    modoCajaOrganizacion(ctx),
    ctx.supabase
      .from('cash_sessions')
      .select('id, branch_id, opened_by, opened_at, closed_at')
      .eq('organization_id', ctx.organizationId)
      .in('id', unicos),
    ctx.supabase.from('cash_movements').select('cash_session_id, type, amount').eq('organization_id', ctx.organizationId).in('cash_session_id', unicos),
  ]);
  if (sesionesRes.error) throw new ErrorResumenCaja('lectura_fallida', 500, sesionesRes.error.message);
  const visible = visibilidadImportes(cierreCiego, permisos.verEsperadoEnCierreCiego);
  const sesiones = (sesionesRes.data ?? []) as Array<{ id: number; branch_id: number | null; opened_by: string; opened_at: string; closed_at: string | null }>;
  const movimientos = (movRes.data ?? []) as Array<{ cash_session_id: number; type: string; amount: number | string }>;

  const salida: Record<number, ResumenCompacto> = {};
  await Promise.all(
    sesiones.map(async (s) => {
      let cobros = ctx.supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('method', 'cash')
        .eq('status', 'completed')
        .in('source', ['invoice_sales', 'sale'])
        .gte('created_at', s.opened_at)
        .lte('created_at', s.closed_at ?? new Date().toISOString());
      if (s.branch_id) cobros = cobros.eq('branch_id', s.branch_id);
      if (modo === 'user') cobros = cobros.eq('created_by', s.opened_by);
      const [esp, cuenta] = await Promise.all([ctx.supabase.rpc('pos_caja_esperado', { p_session_id: s.id }), cobros]);
      const e = esp.error ? null : enmascararEsperado(leerEsperado(esp.data), visible);
      const propios = movimientos.filter((m) => m.cash_session_id === s.id);
      const entradas = propios.filter((m) => m.type === 'in');
      const salidas = propios.filter((m) => m.type === 'out');
      salida[s.id] = {
        sales_cash: e?.detalle ? e.detalle.ventas_efectivo : null,
        sales_cash_count: cuenta.count ?? 0,
        expected_amount: e?.efectivo_esperado ?? null,
        cash_in: entradas.reduce((acc, m) => acc + n(m.amount), 0),
        cash_out: salidas.reduce((acc, m) => acc + n(m.amount), 0),
        cash_in_count: entradas.length,
        cash_out_count: salidas.length,
      };
    }),
  );
  return salida;
}

/** Resumen completo de una caja con la máscara del cierre ciego aplicada. */
export async function resumenCaja(ctx: Ctx, idOUuid: string, opciones: { ventas?: boolean } = {}): Promise<ResumenCaja> {
  const s = await leerSesion(ctx, idOUuid);
  const [permisos, cierreCiego, modo, esperadoRes, movRes, arqRes, rama] = await Promise.all([
    resolverPermisosCaja(ctx),
    organizacionUsaCierreCiego(ctx),
    modoCajaOrganizacion(ctx),
    ctx.supabase.rpc('pos_caja_esperado', { p_session_id: s.id }),
    ctx.supabase
      .from('cash_movements')
      .select('id, uuid, type, concept, concept_code, reference, amount, notes, created_at, user_id')
      .eq('organization_id', ctx.organizationId)
      .eq('cash_session_id', s.id)
      .order('created_at', { ascending: true }),
    ctx.supabase
      .from('cash_counts')
      .select('id, count_type, counted_amount, expected_amount, difference, denominations, method_breakdown, counted_by, notes, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('cash_session_id', s.id)
      .order('created_at', { ascending: true }),
    s.branch_id ? ctx.supabase.from('branches').select('name').eq('id', s.branch_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (esperadoRes.error) throw new ErrorResumenCaja('lectura_fallida', 500, esperadoRes.error.message);
  if (movRes.error) throw new ErrorResumenCaja('lectura_fallida', 500, movRes.error.message);
  if (arqRes.error) throw new ErrorResumenCaja('lectura_fallida', 500, arqRes.error.message);

  const visible = visibilidadImportes(cierreCiego, permisos.verEsperadoEnCierreCiego);
  const movimientosCrudos = (movRes.data ?? []) as Array<{
    id: number;
    uuid: string | null;
    type: 'in' | 'out';
    concept: string;
    concept_code: string | null;
    reference: string | null;
    amount: number | string;
    notes: string | null;
    created_at: string;
    user_id: string;
  }>;
  const arqueosCrudos = (arqRes.data ?? []) as Array<{
    id: number;
    count_type: ArqueoResumen['count_type'];
    counted_amount: number | string;
    expected_amount: number | string | null;
    difference: number | string | null;
    denominations: ArqueoResumen['denominations'];
    method_breakdown: Record<string, LineaArqueo> | null;
    counted_by: string;
    notes: string | null;
    created_at: string;
  }>;
  const gente = await nombres(ctx, [s.opened_by, s.closed_by, ...movimientosCrudos.map((m) => m.user_id), ...arqueosCrudos.map((a) => a.counted_by)]);
  const ventas = opciones.ventas === false ? { cantidad: 0, total: 0, filas: [], truncadas: false } : await ventasDelTurno(ctx, s, modo);

  const sesion = enmascararSesion(
    {
      id: s.id,
      uuid: s.uuid,
      organization_id: s.organization_id,
      branch_id: s.branch_id,
      branch_name: (rama as { data: { name?: string } | null }).data?.name ?? null,
      opened_by: s.opened_by,
      opened_by_name: gente.get(s.opened_by) ?? null,
      opened_at: s.opened_at,
      initial_amount: n(s.initial_amount),
      closed_at: s.closed_at,
      closed_by: s.closed_by,
      closed_by_name: s.closed_by ? gente.get(s.closed_by) ?? null : null,
      final_amount: nOrNull(s.final_amount),
      difference: nOrNull(s.difference),
      status: s.status,
      notes: s.notes,
    },
    visible,
  );

  return {
    sesion,
    modo,
    esperado: enmascararEsperado(leerEsperado(esperadoRes.data), visible),
    movimientos: movimientosCrudos.map((m) => ({
      id: m.id,
      uuid: m.uuid,
      type: m.type,
      concept: m.concept,
      concept_code: m.concept_code,
      clave_concepto: claveDeConcepto(m),
      reference: m.reference,
      amount: n(m.amount),
      notes: m.notes,
      created_at: m.created_at,
      user_id: m.user_id,
      user_name: gente.get(m.user_id) ?? null,
    })),
    arqueos: arqueosCrudos.map((a) =>
      enmascararArqueo(
        {
          id: a.id,
          count_type: a.count_type,
          counted_amount: n(a.counted_amount),
          expected_amount: nOrNull(a.expected_amount),
          difference: nOrNull(a.difference),
          denominations: a.denominations,
          method_breakdown: a.method_breakdown,
          counted_by: a.counted_by,
          counted_by_name: gente.get(a.counted_by) ?? null,
          notes: a.notes,
          created_at: a.created_at,
        },
        visible,
      ),
    ),
    ventas,
    permisos: {
      ...permisos,
      esPropia: s.opened_by === ctx.userId,
      puedeCerrar: puedeCerrarCaja(s, ctx.userId, permisos.cerrarCajasAjenas),
    },
    cierreCiego,
    verImportes: visible,
  };
}
