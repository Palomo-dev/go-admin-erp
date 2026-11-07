/**
 * Saldos a favor — lectura del listado y del detalle en el servidor.
 *
 * Base: `fn_list_customer_credits` (permiso `finance.view`, acceso por sucursal
 * y estado vivo en la base, vía `listarSaldos`). Encima, con el cliente de la
 * SESIÓN (RLS por pertenencia), se completan el documento de origen (recibo,
 * nota crédito, devolución), el documento del cliente, las aplicaciones y las
 * devoluciones. Nunca escribe. Filtro, orden, página y KPI: `listadoLogica.ts`,
 * con el día de la organización (`toPlainDate` + su zona), nunca el día UTC.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { nextPlainDay, startOfDayInstant, toPlainDate } from '@/lib/utils/dateCore';
import type { SaldoAFavorFila } from '@/lib/finanzas/saldosAFavor/contrato';
import {
  esOrigenSaldo,
  estadoDeStatus,
  filtrarSaldos,
  kpisSaldos,
  ordenarMovimientos,
  ordenarSaldos,
  paginarSaldos,
  type ConsultaListadoSaldos,
  type DetalleSaldo,
  type FilaListadoSaldo,
  type KpisSaldos,
  type MovimientoKpi,
  type MovimientoSaldo,
} from '@/lib/finanzas/saldosAFavor/listadoLogica';
import { ErrorSaldoFavorServidor, listarSaldos } from './saldosAFavor.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

/** Tope de ids por `.in(...)`: la URL de PostgREST tiene límite. */
const TROZO = 150;

function trozos<T>(lista: readonly T[], n = TROZO): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += n) salida.push(lista.slice(i, i + n));
  return salida;
}

function falla(tabla: string, ctx: Ctx, error: { message: string }): never {
  console.error(`[saldos-a-favor] lectura de ${tabla}`, { organizationId: ctx.organizationId, message: error.message });
  throw new ErrorSaldoFavorServidor('error_desconocido');
}

/** Lee por trozos de ids con el cliente de la sesión. */
async function leerPorIds<T>(
  ctx: Ctx,
  tabla: string,
  columnas: string,
  campo: string,
  ids: readonly string[],
  iguales: Record<string, string> = {},
): Promise<T[]> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (unicos.length === 0) return [];
  const salida: T[] = [];
  for (const parte of trozos(unicos)) {
    let q = ctx.supabase.from(tabla).select(columnas).eq('organization_id', ctx.organizationId);
    for (const [k, v] of Object.entries(iguales)) q = q.eq(k, v);
    const { data, error } = await q.in(campo, parte);
    if (error) falla(tabla, ctx, error);
    salida.push(...((data ?? []) as T[]));
  }
  return salida;
}

interface PagoOrigen {
  id: string;
  source_id: string;
  receipt_number: string | null;
  method: string | null;
  amount: number | string;
  reference: string | null;
  status: string | null;
  created_at: string;
  void_reason: string | null;
  voided_at: string | null;
  payment_groups: { receipt_number: string | null } | { receipt_number: string | null }[] | null;
}

function reciboDe(p: PagoOrigen): string | null {
  const g = Array.isArray(p.payment_groups) ? p.payment_groups[0] : p.payment_groups;
  return g?.receipt_number ?? p.receipt_number ?? null;
}

const COLUMNAS_PAGO =
  'id, source_id, receipt_number, method, amount, reference, status, created_at, void_reason, voided_at, payment_groups:payment_group_id (receipt_number)';

interface Enriquecido {
  filas: FilaListadoSaldo[];
  pagosOrigen: Map<string, PagoOrigen>;
}

/**
 * Pasa las filas de la RPC a filas de pantalla con el documento de origen y el
 * documento del cliente. Una lectura por tabla (por trozos), no una por fila.
 */
async function enriquecer(ctx: Ctx, base: readonly SaldoAFavorFila[]): Promise<Enriquecido> {
  const conNota = base.filter((s) => s.origen === 'nota_credito').map((s) => s.id);
  const conPago = base.filter((s) => s.origen === 'pago').map((s) => s.id);
  const conDevolucion = base.filter((s) => s.origen === 'devolucion').map((s) => s.id);

  const [fuentes, pagos, devoluciones, clientes] = await Promise.all([
    leerPorIds<{ id: string; source_credit_note_id: string | null }>(ctx, 'credit_notes', 'id, source_credit_note_id', 'id', conNota),
    leerPorIds<PagoOrigen>(ctx, 'payments', COLUMNAS_PAGO, 'source_id', conPago, { source: 'customer_credit' }),
    leerPorIds<{ id: string; customer_credit_id: string; credit_note_invoice_id: string | null }>(
      ctx,
      'returns',
      'id, customer_credit_id, credit_note_invoice_id',
      'customer_credit_id',
      conDevolucion,
    ),
    leerPorIds<{ id: string; identification_number: string | null }>(ctx, 'customers', 'id, identification_number', 'id', base.map((s) => s.customer_id)),
  ]);

  const notaDe = new Map(fuentes.map((f) => [f.id, f.source_credit_note_id]));
  const devolucionDe = new Map(devoluciones.map((d) => [d.customer_credit_id, d]));
  const pagoDe = new Map<string, PagoOrigen>();
  // El pago que creó el anticipo (positivo); el más antiguo si hubiera varios.
  for (const p of [...pagos].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (Number(p.amount) > 0 && !pagoDe.has(p.source_id)) pagoDe.set(p.source_id, p);
  }
  const docDe = new Map(clientes.map((c) => [c.id, c.identification_number]));

  const facturas = await leerPorIds<{ id: string; number: string | null }>(ctx, 'invoice_sales', 'id, number', 'id', [
    ...Array.from(notaDe.values()).filter((v): v is string => !!v),
    ...devoluciones.map((d) => d.credit_note_invoice_id).filter((v): v is string => !!v),
  ]);
  const numeroFactura = new Map(facturas.map((f) => [f.id, f.number]));

  const filas = base.map((s): FilaListadoSaldo => {
      const origen = esOrigenSaldo(s.origen) ? s.origen : 'otro';
      let origenNumero: string | null = null;
      let origenId: string | null = null;
      if (origen === 'pago') {
        const p = pagoDe.get(s.id);
        origenNumero = p ? reciboDe(p) : null;
        origenId = p?.id ?? null;
      } else if (origen === 'nota_credito') {
        origenId = notaDe.get(s.id) ?? null;
        origenNumero = origenId ? numeroFactura.get(origenId) ?? null : null;
      } else if (origen === 'devolucion') {
        const d = devolucionDe.get(s.id);
        origenId = d?.credit_note_invoice_id ?? null;
        origenNumero = origenId ? numeroFactura.get(origenId) ?? null : null;
      }
      return {
        id: s.id,
        clienteId: s.customer_id,
        cliente: s.customer_name,
        clienteDoc: docDe.get(s.customer_id) ?? null,
        origen,
        origenNumero,
        origenId,
        fecha: s.created_at,
        valor: Number(s.amount),
        usado: Number(s.used),
        disponible: Number(s.balance),
        vence: s.expiry_date,
        estado: estadoDeStatus(s.status),
        anulable: !!s.anulable,
        sucursalId: s.branch_id,
        notas: s.notes,
      };
    });
  return { filas, pagosOrigen: pagoDe };
}

/** Movimientos de dinero del periodo (aplicaciones y devoluciones) para los KPI. */
async function movimientosPeriodo(
  ctx: Ctx,
  tz: string,
  desde: string,
  hasta: string,
): Promise<{ aplicaciones: MovimientoKpi[]; devoluciones: MovimientoKpi[] }> {
  const ini = startOfDayInstant(desde, tz).toISOString();
  const fin = startOfDayInstant(nextPlainDay(hasta), tz).toISOString();
  const [apl, dev] = await Promise.all([
    ctx.supabase
      .from('credit_note_applications')
      .select('credit_note_id, invoice_id, amount, created_at')
      .eq('organization_id', ctx.organizationId)
      .gte('created_at', ini)
      .lt('created_at', fin)
      .limit(5000),
    ctx.supabase
      .from('payments')
      .select('source_id, amount, method, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('source', 'customer_credit_refund')
      .eq('status', 'completed')
      .gte('created_at', ini)
      .lt('created_at', fin)
      .limit(5000),
  ]);
  if (apl.error) falla('credit_note_applications', ctx, apl.error);
  if (dev.error) falla('payments', ctx, dev.error);
  type A = { credit_note_id: string; invoice_id: string; amount: number | string; created_at: string };
  type D = { source_id: string; amount: number | string; method: string | null; created_at: string };
  return {
    aplicaciones: ((apl.data ?? []) as A[]).map((a) => ({ creditoId: a.credit_note_id, monto: Number(a.amount), fecha: a.created_at, referencia: a.invoice_id })),
    devoluciones: ((dev.data ?? []) as D[]).map((d) => ({ creditoId: d.source_id, monto: Number(d.amount), fecha: d.created_at, referencia: d.method })),
  };
}

export interface RespuestaListadoSaldos {
  filas: FilaListadoSaldo[];
  total: number;
  kpis: KpisSaldos;
  hoy: string;
}

export async function listadoSaldos(ctx: Ctx, consulta: ConsultaListadoSaldos): Promise<RespuestaListadoSaldos> {
  const [base, tz] = await Promise.all([listarSaldos(ctx, consulta.sucursal), getOrganizationTimezone(ctx.organizationId, ctx.supabase)]);
  const diaDe = (iso: string) => toPlainDate(new Date(iso), tz);
  const hoy = toPlainDate(new Date(), tz);
  const kpiDesde = consulta.kpiDesde ?? `${hoy.slice(0, 7)}-01`;
  const kpiHasta = consulta.kpiHasta ?? hoy;

  const [{ filas: todas }, movs] = await Promise.all([enriquecer(ctx, base), movimientosPeriodo(ctx, tz, kpiDesde, kpiHasta)]);
  const filtradas = ordenarSaldos(filtrarSaldos(todas, consulta.filtros, diaDe), consulta.orden.campo, consulta.orden.direccion);
  return {
    filas: paginarSaldos(filtradas, consulta.pagina, consulta.tamano),
    total: filtradas.length,
    kpis: kpisSaldos(todas, movs.aplicaciones, movs.devoluciones, { desde: kpiDesde, hasta: kpiHasta }, diaDe),
    hoy,
  };
}

/**
 * Detalle de un saldo: la fila (de la misma RPC, así permiso, sucursal y estado
 * vivo los decide la base), su origen, aplicaciones, devoluciones y anulación.
 */
export async function detalleSaldo(ctx: Ctx, id: string): Promise<DetalleSaldo> {
  const base = (await listarSaldos(ctx, null)).filter((s) => s.id === id);
  if (base.length === 0) throw new ErrorSaldoFavorServidor('saldo_no_encontrado');
  const { filas, pagosOrigen } = await enriquecer(ctx, base);
  const saldo = filas[0];

  const [aplicaciones, devoluciones, sucursal] = await Promise.all([
    ctx.supabase
      .from('credit_note_applications')
      .select('id, invoice_id, amount, created_at, invoice:invoice_sales (number)')
      .eq('organization_id', ctx.organizationId)
      .eq('credit_note_id', id)
      .order('created_at', { ascending: true }),
    ctx.supabase
      .from('payments')
      .select('id, amount, method, reference, status, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('source', 'customer_credit_refund')
      .eq('source_id', id)
      .order('created_at', { ascending: true }),
    saldo.sucursalId
      ? ctx.supabase.from('branches').select('name').eq('organization_id', ctx.organizationId).eq('id', saldo.sucursalId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (aplicaciones.error) falla('credit_note_applications', ctx, aplicaciones.error);
  if (devoluciones.error) falla('payments', ctx, devoluciones.error);

  const movimientos: MovimientoSaldo[] = [];
  const pago = pagosOrigen.get(id);
  movimientos.push({
    tipo: 'origen',
    id: pago?.id ?? saldo.origenId ?? id,
    numero: saldo.origenNumero,
    documentoId: saldo.origenId,
    monto: saldo.valor,
    fecha: pago?.created_at ?? saldo.fecha,
    metodo: pago?.method ?? null,
    referencia: pago?.reference ?? null,
  });

  type Apl = { id: string; invoice_id: string; amount: number | string; created_at: string; invoice: { number: string | null } | { number: string | null }[] | null };
  for (const a of (aplicaciones.data ?? []) as Apl[]) {
    const f = Array.isArray(a.invoice) ? a.invoice[0] : a.invoice;
    movimientos.push({ tipo: 'aplicacion', id: a.id, numero: f?.number ?? null, documentoId: a.invoice_id, monto: Number(a.amount), fecha: a.created_at });
  }
  type Dev = { id: string; amount: number | string; method: string | null; reference: string | null; status: string | null; created_at: string };
  for (const d of (devoluciones.data ?? []) as Dev[]) {
    if (d.status === 'void') continue;
    movimientos.push({ tipo: 'devolucion', id: d.id, numero: null, documentoId: d.id, monto: Math.abs(Number(d.amount)), fecha: d.created_at, metodo: d.method, referencia: d.reference });
  }
  if (saldo.estado === 'anulado' && pago?.voided_at) {
    movimientos.push({ tipo: 'anulacion', id: `${pago.id}:anulacion`, numero: null, documentoId: null, monto: saldo.valor, fecha: pago.voided_at, motivo: pago.void_reason });
  }

  const nombreSucursal = (sucursal.data as { name?: string } | null)?.name ?? null;
  return { saldo, sucursal: nombreSucursal, movimientos: ordenarMovimientos(movimientos) };
}
