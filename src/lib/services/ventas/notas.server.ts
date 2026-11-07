/**
 * Notas crédito y débito de venta — servicio de servidor.
 *
 * - Listado (`GET /api/notas`): lee con el cliente de la SESIÓN (RLS) y la
 *   organización de la sesión; filtra, ordena, pagina y cuenta en el servidor.
 *   El volumen es bajo (28 notas en toda la base el 2026-09-28): se leen hasta
 *   `TOPE_LECTURA_NOTAS` filas del periodo y se avisa si se llegó al tope.
 * - Detalle (`GET /api/notas-credito/[id]`, `/api/notas-debito/[id]`):
 *   reutiliza `detalleFactura` (la nota es una fila de `invoice_sales`) y añade
 *   la factura de origen, el estado DIAN derivado, concepto, motivo, saldo a
 *   favor, devolución y reingreso.
 * - Nota débito: solo por `fn_nota_debito_emitir` / `fn_nota_debito_anular`
 *   (migración 20261108030000, SIN APLICAR). Mientras la función no exista,
 *   `nota_debito_no_disponible` (501): nada se escribe desde Node.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { nextPlainDay, startOfDayInstant } from '@/lib/utils/dateCore';
import { detalleFactura, ErrorFacturaServidor } from '@/lib/services/ventas/facturasVenta.server';
import type { DetalleFacturaVenta } from '@/lib/finanzas/ventas/contratoFacturas';
import {
  TOPE_LECTURA_NOTAS,
  codigoErrorNotaDebito,
  conceptoDeDescripcion,
  conceptoNotaCreditoDerivado,
  documentTypeDeNota,
  esFuncionInexistente,
  estadoDianNota,
  filtrarNotas,
  kpisNotas,
  motivoDeDescripcion,
  ordenarNotas,
  paginar,
  tipoNotaDeDocumento,
  type ConsultaNotas,
  type ContextoNotaDebito,
  type DetalleNotaExtra,
  type ErrorNotaDebito,
  type FacturaOrigenNota,
  type FilaNota,
  type RespuestaListadoNotas,
  type ResultadoNotaDebito,
  type SolicitudNotaDebito,
  type TipoNota,
} from '@/lib/finanzas/notas/contratoNotas';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const TROZO = 150;

function trozos<T>(lista: readonly T[], n = TROZO): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n));
  return r;
}

export class ErrorNotasServidor extends Error {
  constructor(public readonly codigo: 'error_desconocido' | 'nota_no_encontrada') {
    super(codigo);
  }
}

// ─── Lectura y enriquecimiento ──────────────────────────────────────────────

interface FilaBase {
  id: string;
  number: string | null;
  document_type: string | null;
  status: string;
  issue_date: string | null;
  total: number | string | null;
  balance: number | string | null;
  currency: string | null;
  einvoice_status: string | null;
  branch_id: number | null;
  description: string | null;
  customer_id: string | null;
  related_invoice_id: string | null;
  customers: { full_name: string | null; doc_number: string | null } | null;
}

interface Lectura {
  tipos: TipoNota[];
  desde?: string;
  hasta?: string;
  sucursal?: number;
  cliente?: string;
}

async function rangoInstantes(ctx: Ctx, desde?: string, hasta?: string): Promise<{ gte?: string; lt?: string }> {
  if (!desde && !hasta) return {};
  const tz = await getOrganizationTimezone(ctx.organizationId, ctx.supabase as never);
  return {
    gte: desde ? startOfDayInstant(desde, tz).toISOString() : undefined,
    lt: hasta ? startOfDayInstant(nextPlainDay(hasta), tz).toISOString() : undefined,
  };
}

async function leerNotas(ctx: Ctx, l: Lectura): Promise<{ filas: FilaNota[]; truncado: boolean }> {
  const db = ctx.supabase;
  const org = ctx.organizationId;
  const rango = await rangoInstantes(ctx, l.desde, l.hasta);
  let q = db
    .from('invoice_sales')
    .select(
      'id, number, document_type, status, issue_date, total, balance, currency, einvoice_status, branch_id, description, customer_id, related_invoice_id, ' +
        'customers:customer_id (full_name, doc_number)',
    )
    .eq('organization_id', org)
    .in('document_type', l.tipos.map(documentTypeDeNota))
    .order('issue_date', { ascending: false })
    .limit(TOPE_LECTURA_NOTAS + 1);
  if (rango.gte) q = q.gte('issue_date', rango.gte);
  if (rango.lt) q = q.lt('issue_date', rango.lt);
  if (l.sucursal) q = q.eq('branch_id', l.sucursal);
  if (l.cliente) q = q.eq('customer_id', l.cliente);
  const { data, error } = await q;
  if (error) {
    console.error('[notas] listado', { organizationId: org, message: error.message });
    throw new ErrorNotasServidor('error_desconocido');
  }
  const crudas = (data ?? []) as unknown as FilaBase[];
  const truncado = crudas.length > TOPE_LECTURA_NOTAS;
  const base = truncado ? crudas.slice(0, TOPE_LECTURA_NOTAS) : crudas;
  return { filas: await enriquecer(ctx, base), truncado };
}

async function enriquecer(ctx: Ctx, base: readonly FilaBase[]): Promise<FilaNota[]> {
  if (base.length === 0) return [];
  const db = ctx.supabase;
  const org = ctx.organizationId;
  const ids = base.map((f) => f.id);
  const facturaIds = [...new Set(base.map((f) => f.related_invoice_id).filter((x): x is string => !!x))];

  const facturas = new Map<string, { number: string | null; einvoice_status: string | null; total: number }>();
  const conProductos = new Set<string>();
  for (const t of trozos(facturaIds)) {
    const { data } = await db.from('invoice_sales').select('id, number, einvoice_status, total').eq('organization_id', org).in('id', t);
    for (const f of (data ?? []) as { id: string; number: string | null; einvoice_status: string | null; total: unknown }[]) {
      facturas.set(f.id, { number: f.number, einvoice_status: f.einvoice_status, total: num(f.total) });
    }
  }
  for (const t of trozos(ids)) {
    const { data } = await db.from('invoice_items').select('invoice_sales_id').in('invoice_sales_id', t).not('product_id', 'is', null);
    for (const r of (data ?? []) as { invoice_sales_id: string }[]) conProductos.add(r.invoice_sales_id);
  }

  // Envíos de notas (pocos): retenidos y concepto pedido al encolar.
  const { data: jobs } = await db
    .from('electronic_invoicing_jobs')
    .select('invoice_id, status, hold_reason, concepto:request_payload->opciones->>concepto')
    .eq('organization_id', org)
    .in('document_type', ['credit_note', 'debit_note'])
    .neq('status', 'cancelled')
    .limit(TOPE_LECTURA_NOTAS);
  const retenidas = new Set<string>();
  const conceptoJob = new Map<string, string>();
  for (const j of (jobs ?? []) as { invoice_id: string | null; status: string; hold_reason: string | null; concepto: string | null }[]) {
    if (!j.invoice_id) continue;
    if (j.status === 'pending' && j.hold_reason) retenidas.add(j.invoice_id);
    if (j.concepto) conceptoJob.set(j.invoice_id, j.concepto);
  }

  // Excedentes que quedaron como saldo a favor (credit_notes = saldos a favor).
  const excedentes = new Map<string, number>();
  const { data: creditos } = await db
    .from('credit_notes')
    .select('source_credit_note_id, amount, status')
    .eq('organization_id', org)
    .not('source_credit_note_id', 'is', null)
    .limit(TOPE_LECTURA_NOTAS);
  for (const c of (creditos ?? []) as { source_credit_note_id: string; amount: unknown; status: string | null }[]) {
    if (c.status === 'cancelled') continue;
    excedentes.set(c.source_credit_note_id, (excedentes.get(c.source_credit_note_id) ?? 0) + num(c.amount));
  }

  return base.map<FilaNota>((f) => {
    const tipo = tipoNotaDeDocumento(f.document_type) ?? 'credito';
    const fac = f.related_invoice_id ? facturas.get(f.related_invoice_id) ?? null : null;
    const valor = Math.abs(num(f.total));
    const anulada = ['void', 'voided', 'cancelled'].includes(f.status);
    const concepto =
      tipo === 'debito'
        ? conceptoDeDescripcion(f.description)
        : conceptoNotaCreditoDerivado({
            concepto: conceptoJob.get(f.id) ?? null,
            totalNota: valor,
            totalFactura: fac?.total ?? 0,
            conProductos: conProductos.has(f.id),
          });
    return {
      id: f.id,
      tipo,
      numero: f.number,
      fecha: f.issue_date,
      estado: f.status,
      anulada,
      valor,
      saldo: tipo === 'debito' && !anulada ? Math.max(0, num(f.balance)) : 0,
      moneda: f.currency ? f.currency.trim() : null,
      branchId: f.branch_id,
      cliente: f.customers?.full_name ?? null,
      clienteDoc: f.customers?.doc_number ?? null,
      clienteId: f.customer_id,
      factura: f.related_invoice_id ? { id: f.related_invoice_id, numero: fac?.number ?? null } : null,
      concepto,
      motivo: motivoDeDescripcion(f.description),
      dian: estadoDianNota({ notaFe: f.einvoice_status, facturaFe: fac?.einvoice_status ?? null, retenida: retenidas.has(f.id) }),
      excedente: Math.round((excedentes.get(f.id) ?? 0) * 100) / 100,
      conProductos: conProductos.has(f.id),
    };
  });
}

async function contar(ctx: Ctx, tipo: TipoNota, rango: { gte?: string; lt?: string }, sucursal?: number): Promise<number> {
  let q = ctx.supabase
    .from('invoice_sales')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .eq('document_type', documentTypeDeNota(tipo));
  if (rango.gte) q = q.gte('issue_date', rango.gte);
  if (rango.lt) q = q.lt('issue_date', rango.lt);
  if (sucursal) q = q.eq('branch_id', sucursal);
  const { count } = await q;
  return count ?? 0;
}

// ─── Listado ────────────────────────────────────────────────────────────────

export async function listadoNotas(ctx: Ctx, c: ConsultaNotas): Promise<RespuestaListadoNotas> {
  const lectura = await leerNotas(ctx, { tipos: [c.tipo], desde: c.desde, hasta: c.hasta, sucursal: c.sucursal, cliente: c.cliente });
  const filtradas = ordenarNotas(filtrarNotas(lectura.filas, c), c.orden, c.dir);

  const mismoPeriodo = (c.kpi_desde ?? c.desde) === c.desde && (c.kpi_hasta ?? c.hasta) === c.hasta && !c.cliente;
  const paraKpi = mismoPeriodo
    ? lectura
    : await leerNotas(ctx, { tipos: [c.tipo], desde: c.kpi_desde ?? c.desde, hasta: c.kpi_hasta ?? c.hasta, sucursal: c.sucursal });

  const rango = await rangoInstantes(ctx, c.desde, c.hasta);
  const [credito, debito] = await Promise.all([contar(ctx, 'credito', rango, c.sucursal), contar(ctx, 'debito', rango, c.sucursal)]);

  const monedas = new Map<string, number>();
  for (const f of paraKpi.filas) if (f.moneda) monedas.set(f.moneda, (monedas.get(f.moneda) ?? 0) + 1);
  const moneda = [...monedas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    total: filtradas.length,
    filas: paginar(filtradas, c.pagina, c.tamano),
    kpis: kpisNotas(moneda ? paraKpi.filas.filter((f) => !f.moneda || f.moneda === moneda) : paraKpi.filas),
    conteo: { credito, debito },
    moneda,
    truncado: lectura.truncado || paraKpi.truncado,
  };
}

// ─── Detalle ────────────────────────────────────────────────────────────────

export interface DetalleNotaServidor {
  base: DetalleFacturaVenta;
  extra: DetalleNotaExtra;
}

export async function detalleNota(ctx: Ctx, id: string, tipo: TipoNota): Promise<DetalleNotaServidor> {
  let base: DetalleFacturaVenta;
  try {
    base = await detalleFactura(ctx, id);
  } catch (err) {
    if (err instanceof ErrorFacturaServidor && err.codigo === 'factura_no_encontrada') throw new ErrorNotasServidor('nota_no_encontrada');
    throw err;
  }
  if (base.factura.tipoDocumento !== documentTypeDeNota(tipo)) throw new ErrorNotasServidor('nota_no_encontrada');

  const db = ctx.supabase;
  const org = ctx.organizationId;
  const relacionada = base.factura.facturaRelacionadaId;

  const [facturaRes, creditoRes, devolucionRes, reingresoRes, jobRes] = await Promise.all([
    relacionada
      ? db
          .from('invoice_sales')
          .select('id, number, issue_date, due_date, total, balance, status, einvoice_status, einvoice_number')
          .eq('organization_id', org)
          .eq('id', relacionada)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db.from('credit_notes').select('id, amount, balance, status').eq('organization_id', org).eq('source_credit_note_id', id).limit(1),
    db.from('payments').select('id, amount, status').eq('organization_id', org).eq('source', 'credit_note').eq('source_id', id).limit(1),
    db
      .from('stock_movements')
      .select('product_id')
      .eq('organization_id', org)
      .eq('source', 'credit_note')
      .eq('source_id', id)
      .eq('direction', 'in'),
    db
      .from('electronic_invoicing_jobs')
      .select('concepto:request_payload->opciones->>concepto')
      .eq('organization_id', org)
      .eq('invoice_id', id)
      .neq('status', 'cancelled')
      .limit(1),
  ]);

  type FilaOrigen = {
    id: string;
    number: string | null;
    issue_date: string | null;
    due_date: string | null;
    total: unknown;
    balance: unknown;
    status: string;
    einvoice_status: string | null;
    einvoice_number: string | null;
  };
  const o = (facturaRes.data ?? null) as FilaOrigen | null;
  const factura: FacturaOrigenNota | null = o
    ? {
        id: o.id,
        numero: o.number,
        emision: o.issue_date,
        vencimiento: o.due_date,
        total: num(o.total),
        saldo: num(o.balance),
        estado: o.status,
        fe: o.einvoice_status,
        feNumero: o.einvoice_number,
      }
    : null;

  const credito = ((creditoRes.data ?? []) as { id: string; amount: unknown; balance: unknown; status: string | null }[])[0] ?? null;
  const devolucion = ((devolucionRes.data ?? []) as { id: string; amount: unknown; status: string | null }[])[0] ?? null;
  const reingresados = new Set(((reingresoRes.data ?? []) as { product_id: number | null }[]).map((r) => r.product_id)).size;
  const conceptoJob = ((jobRes.data ?? []) as { concepto: string | null }[])[0]?.concepto ?? null;

  const descripcion = base.factura.descripcion;
  const conProductos = base.lineas.some((l) => l.productId != null);
  return {
    base,
    extra: {
      tipo,
      factura,
      dian: estadoDianNota({ notaFe: base.factura.fe.estado, facturaFe: factura?.fe ?? null, retenida: !!base.job?.retenido }),
      concepto:
        tipo === 'debito'
          ? conceptoDeDescripcion(descripcion)
          : conceptoNotaCreditoDerivado({
              concepto: conceptoJob,
              totalNota: Math.abs(base.factura.total),
              totalFactura: factura?.total ?? 0,
              conProductos,
            }),
      motivo: motivoDeDescripcion(descripcion),
      saldoAFavor: credito ? { id: credito.id, monto: num(credito.amount), saldo: num(credito.balance), estado: credito.status ?? 'active' } : null,
      devolucion: devolucion ? { id: devolucion.id, monto: num(devolucion.amount), estado: devolucion.status ?? 'completed' } : null,
      productosReingresados: reingresados,
      retenida: base.job?.retenido ?? null,
    },
  };
}

// ─── Nota débito ────────────────────────────────────────────────────────────

export class ErrorNotaDebitoServidor extends Error {
  constructor(public readonly codigo: ErrorNotaDebito) {
    super(codigo);
  }
}

function lanzarNd(etiqueta: string, ctx: Ctx, error: { code?: string; message: string }): never {
  if (esFuncionInexistente(error)) throw new ErrorNotaDebitoServidor('nota_debito_no_disponible');
  const codigo = codigoErrorNotaDebito(error.message);
  if (codigo === 'error_desconocido') console.error(`[notaDebito] ${etiqueta}`, { organizationId: ctx.organizationId, message: error.message });
  throw new ErrorNotaDebitoServidor(codigo);
}

/** ¿Está aplicada la migración? Llama a la función inmutable que la acompaña. */
export async function notaDebitoDisponible(ctx: Ctx): Promise<boolean> {
  const { error } = await ctx.supabase.rpc('fn_nota_debito_codigo_impuesto', { p_nombre: 'IVA', p_tarifa: 19 });
  return !error;
}

export async function contextoNotaDebito(ctx: Ctx, facturaId: string): Promise<ContextoNotaDebito> {
  const db = ctx.supabase;
  const { data, error } = await db
    .from('invoice_sales')
    .select('id, number, status, document_type, balance, total, currency, einvoice_status, issue_date, due_date, customers:customer_id (full_name)')
    .eq('id', facturaId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error || !data) throw new ErrorNotaDebitoServidor('factura_no_encontrada');
  const f = data as unknown as {
    id: string;
    number: string | null;
    status: string;
    document_type: string | null;
    balance: unknown;
    total: unknown;
    currency: string | null;
    einvoice_status: string | null;
    issue_date: string | null;
    due_date: string | null;
    customers: { full_name: string | null } | null;
  };
  const [{ data: impuestos }, disponible] = await Promise.all([
    db
      .from('organization_taxes')
      .select('id, name, rate, kind, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('rate', { ascending: false }),
    notaDebitoDisponible(ctx),
  ]);
  return {
    disponible,
    factura: {
      id: f.id,
      numero: f.number,
      cliente: f.customers?.full_name ?? null,
      estado: f.status,
      tipoDocumento: f.document_type ?? 'invoice',
      saldo: num(f.balance),
      total: num(f.total),
      moneda: f.currency ? f.currency.trim() : null,
      feAceptada: f.einvoice_status === 'accepted',
      emision: f.issue_date,
      vencimiento: f.due_date,
    },
    impuestos: ((impuestos ?? []) as { id: string; name: string | null; rate: unknown; kind: string | null }[])
      .filter((i) => (i.kind ?? 'tax') === 'tax')
      .map((i) => ({ id: i.id, nombre: i.name ?? '', tarifa: num(i.rate) })),
  };
}

export async function emitirNotaDebito(ctx: Ctx, facturaId: string, s: SolicitudNotaDebito): Promise<ResultadoNotaDebito> {
  const { data: f } = await ctx.supabase
    .from('invoice_sales')
    .select('id')
    .eq('id', facturaId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!f) throw new ErrorNotaDebitoServidor('factura_no_encontrada');
  const { data, error } = await ctx.supabase.rpc('fn_nota_debito_emitir', {
    p_invoice_id: facturaId,
    p_concepto: s.concepto,
    p_lineas: s.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      valor_unitario: l.valorUnitario,
      impuesto_id: l.impuestoId ?? null,
    })),
    p_motivo: s.motivo,
    p_clave_idempotencia: s.claveIdempotencia,
  });
  if (error) lanzarNd('fn_nota_debito_emitir', ctx, error);
  const r = (data ?? {}) as Record<string, unknown>;
  // El envío a la DIAN de la nota débito aún no existe en la cola
  // (`colaFacturacion.construirEnvio` lo rechaza): no se encola para no dejar
  // un envío fallido. Queda «pendiente» si la factura fue aceptada.
  return {
    id: String(r.id),
    numero: (r.numero as string | null) ?? null,
    total: num(r.total),
    repetida: r.repetida === true,
    fe: r.fe_factura === 'accepted' ? 'pendiente' : 'no_aplica',
  };
}

export async function anularNotaDebito(ctx: Ctx, id: string, motivo: string): Promise<{ id: string; yaAnulada: boolean }> {
  const { data: nota } = await ctx.supabase
    .from('invoice_sales')
    .select('id, document_type')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!nota || (nota as { document_type: string | null }).document_type !== 'debit_note') {
    throw new ErrorNotaDebitoServidor('nota_no_encontrada');
  }
  const { data, error } = await ctx.supabase.rpc('fn_nota_debito_anular', { p_nota_id: id, p_motivo: motivo });
  if (error) lanzarNd('fn_nota_debito_anular', ctx, error);
  const r = (data ?? {}) as Record<string, unknown>;
  return { id: String(r.id ?? id), yaAnulada: r.ya_anulada === true };
}
