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
}

export interface ResumenCaja {
  sesion: SesionResumen;
  modo: 'branch' | 'user';
  esperado: EsperadoCaja;
  movimientos: MovimientoResumen[];
  arqueos: ArqueoResumen[];
  ventas: { cantidad: number; total: number; filas: VentaTurno[]; truncadas: boolean };
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
async function ventasDelTurno(
  ctx: Ctx,
  s: { branch_id: number | null; opened_at: string; closed_at: string | null; opened_by: string },
  modo: 'branch' | 'user',
): Promise<ResumenCaja['ventas']> {
  let q = ctx.supabase
    .from('sales')
    .select('id, total, status, payment_status, created_at, customer_id', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .eq('include_in_cash_register', true)
    .neq('payment_status', 'pending')
    .gte('created_at', s.opened_at)
    .lte('created_at', s.closed_at ?? new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(LIMITE_VENTAS);
  if (s.branch_id) q = q.eq('branch_id', s.branch_id);
  if (modo === 'user') q = q.eq('user_id', s.opened_by);
  const { data, error, count } = await q;
  if (error) throw new ErrorResumenCaja('lectura_fallida', 500, error.message);
  const filas = (data ?? []) as Array<{ id: string; total: number | string | null; status: string; payment_status: string | null; created_at: string; customer_id: string | null }>;

  const ids = filas.map((f) => f.id);
  const clientesIds = [...new Set(filas.map((f) => f.customer_id).filter((x): x is string => !!x))];
  const [facturas, clientes] = await Promise.all([
    ids.length
      ? ctx.supabase.from('invoice_sales').select('sale_id, number, document_type, status').in('sale_id', ids)
      : Promise.resolve({ data: [] as unknown[] }),
    clientesIds.length
      ? ctx.supabase.from('customers').select('id, full_name').in('id', clientesIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const numeros = new Map<string, string>();
  for (const f of (facturas.data ?? []) as Array<{ sale_id: string; number: string; document_type: string | null; status: string }>) {
    if (f.document_type === 'credit_note') continue;
    if (!numeros.has(f.sale_id) || f.status !== 'void') numeros.set(f.sale_id, f.number);
  }
  const nombresClientes = new Map(((clientes.data ?? []) as Array<{ id: string; full_name: string | null }>).map((c) => [c.id, c.full_name]));

  // El total del turno cuenta solo las filas leídas; si hay más de LIMITE_VENTAS se avisa.
  return {
    cantidad: count ?? filas.length,
    total: Math.round(filas.reduce((acc, f) => acc + n(f.total), 0) * 100) / 100,
    truncadas: (count ?? 0) > filas.length,
    filas: filas.map((f) => ({
      id: f.id,
      total: n(f.total),
      status: f.status,
      payment_status: f.payment_status,
      created_at: f.created_at,
      numero: numeros.get(f.id) ?? null,
      cliente: f.customer_id ? nombresClientes.get(f.customer_id) ?? null : null,
    })),
  };
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
