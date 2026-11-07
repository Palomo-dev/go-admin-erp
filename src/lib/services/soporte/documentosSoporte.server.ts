/**
 * Documento soporte — servicio de servidor. Lee con el cliente de la SESIÓN
 * (RLS) filtrando por la organización de la sesión; escribe por RPC
 * (`fn_documento_soporte_guardar`, migración 20261108020000) y borra un
 * borrador con la sesión (política de borrado por pertenencia).
 *
 * Única excepción con service role: las LÍNEAS del detalle. La RLS de
 * `invoice_items` no cubría `support_document` hasta esa migración; se leen
 * con el cliente de servicio SOLO por el `support_document_id` de un documento
 * que ya se comprobó de la organización de la sesión. Cuando la migración esté
 * aplicada, la lectura con la sesión devuelve lo mismo.
 *
 * El envío a la DIAN NO pasa por aquí: sigue en `POST /api/factus/support-document`
 * (cola `colaFacturacion`).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { nextPlainDay, startOfDayInstant } from '@/lib/utils/dateCore';
import { mapearTipoDocADian } from '@/lib/utils/nitDv';
import { mapPaymentMethod } from '@/lib/services/factusService';
import {
  codigoErrorSoporte,
  type ContextoSoporte,
  type DatosSoporteValidados,
  type DetalleSoporte,
  type ErrorSoporte,
  type EventoEnvioSoporte,
  type FilaSoporteListado,
  type KpisSoporte,
  type ParametrosListadoSoporte,
  type RespuestaListadoSoporte,
  type ResultadoGuardarSoporte,
} from '@/lib/finanzas/soporte/contratoSoporte';
import {
  COLUMNAS_PROVEEDOR_SOPORTE,
  FILTROS_ESTADO,
  envioVivo,
  esEstadoSoporte,
  faltantesProveedor,
  proveedorDesdeFila,
  textoBusquedaSeguro,
  type FilaProveedorSoporte,
} from '@/lib/finanzas/soporte/soporteLogica';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export class ErrorSoporteServidor extends Error {
  constructor(public readonly codigo: ErrorSoporte) {
    super(codigo);
  }
}

function lanzar(etiqueta: string, ctx: Ctx, error: { message?: string; code?: string }): never {
  const codigo = codigoErrorSoporte(error);
  if (codigo === 'error_desconocido' || codigo === 'migracion_pendiente') {
    console.error(`[documentos-soporte] ${etiqueta}`, { organizationId: ctx.organizationId, code: error.code ?? null, message: error.message ?? null });
  }
  throw new ErrorSoporteServidor(codigo);
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Límites de un periodo de días de la organización sobre `issue_date` (timestamptz). */
async function limitesPeriodo(ctx: Ctx, desde?: string, hasta?: string): Promise<{ gte?: string; lt?: string }> {
  if (!desde && !hasta) return {};
  const tz = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
  return {
    ...(desde ? { gte: startOfDayInstant(desde, tz).toISOString() } : {}),
    ...(hasta ? { lt: startOfDayInstant(nextPlainDay(hasta), tz).toISOString() } : {}),
  };
}

// ─── Listado ────────────────────────────────────────────────────────────────

const COLUMNAS_LISTADO =
  'id, reference_code, number, issue_date, total, currency, status, provider, supplier_id, invoice_purchase_id, branch_id, created_at';

const ORDEN: Record<ParametrosListadoSoporte['orden'], { columna: string; asc: boolean }> = {
  referencia_asc: { columna: 'reference_code', asc: true },
  referencia_desc: { columna: 'reference_code', asc: false },
  fecha_asc: { columna: 'issue_date', asc: true },
  fecha_desc: { columna: 'issue_date', asc: false },
  total_asc: { columna: 'total', asc: true },
  total_desc: { columna: 'total', asc: false },
};

export async function listarDocumentosSoporte(ctx: Ctx, p: ParametrosListadoSoporte): Promise<RespuestaListadoSoporte> {
  const periodo = await limitesPeriodo(ctx, p.desde, p.hasta);
  const kpiPeriodo = await limitesPeriodo(ctx, p.kpi_desde, p.kpi_hasta);
  const orden = ORDEN[p.orden];
  const desdeFila = (p.pagina - 1) * p.tamano;

  let q = ctx.supabase.from('support_documents').select(COLUMNAS_LISTADO, { count: 'exact' }).eq('organization_id', ctx.organizationId);
  if (p.sucursal) q = q.eq('branch_id', p.sucursal);
  if (p.estado) q = q.in('status', [...FILTROS_ESTADO[p.estado]]);
  if (periodo.gte) q = q.gte('issue_date', periodo.gte);
  if (periodo.lt) q = q.lt('issue_date', periodo.lt);
  if (p.proveedor) q = q.eq('supplier_id', p.proveedor);
  if (p.compra === 'con') q = q.not('invoice_purchase_id', 'is', null);
  if (p.compra === 'sin') q = q.is('invoice_purchase_id', null);
  const busqueda = textoBusquedaSeguro(p.q);
  if (busqueda) {
    const patron = `*${busqueda}*`;
    q = q.or(`reference_code.ilike.${patron},number.ilike.${patron},provider->>names.ilike.${patron},provider->>identification.ilike.${patron}`);
  }
  q = q.order(orden.columna, { ascending: orden.asc, nullsFirst: false }).order('created_at', { ascending: false }).range(desdeFila, desdeFila + p.tamano - 1);

  const conteo = (estados: readonly string[]) => {
    let c = ctx.supabase.from('support_documents').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.organizationId).in('status', [...estados]);
    if (p.sucursal) c = c.eq('branch_id', p.sucursal);
    return c;
  };
  let periodoQ = ctx.supabase
    .from('support_documents')
    .select('total')
    .eq('organization_id', ctx.organizationId)
    .not('status', 'in', '(draft,cancelled)')
    .limit(5000);
  if (p.sucursal) periodoQ = periodoQ.eq('branch_id', p.sucursal);
  if (kpiPeriodo.gte) periodoQ = periodoQ.gte('issue_date', kpiPeriodo.gte);
  if (kpiPeriodo.lt) periodoQ = periodoQ.lt('issue_date', kpiPeriodo.lt);

  const [lista, borradores, aceptados, rechazados, delPeriodo] = await Promise.all([
    q,
    conteo(FILTROS_ESTADO.borrador),
    conteo(FILTROS_ESTADO.aceptado),
    conteo(FILTROS_ESTADO.rechazado),
    periodoQ,
  ]);
  if (lista.error) lanzar('listar', ctx, lista.error);
  const filasBd = (lista.data ?? []) as Array<Record<string, unknown>>;

  // Facturas de compra y último envío de la página (dos lecturas, no N).
  const idsCompra = [...new Set(filasBd.map((f) => texto(f.invoice_purchase_id)).filter((x): x is string => !!x))];
  const ids = filasBd.map((f) => String(f.id));
  const [compras, envios, lineasCompra] = await Promise.all([
    idsCompra.length
      ? ctx.supabase.from('invoice_purchase').select('id, number_ext').eq('organization_id', ctx.organizationId).in('id', idsCompra)
      : Promise.resolve({ data: [] as Array<{ id: string; number_ext: string | null }>, error: null }),
    ids.length
      ? ctx.supabase
          .from('electronic_invoicing_jobs')
          .select('support_document_id, status, hold_reason, attempt_count, max_attempts, created_at')
          .eq('organization_id', ctx.organizationId)
          .in('support_document_id', ids)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    // Documentos nacidos de una compra: comparten las líneas de la compra (RLS de compra).
    ids.length
      ? ctx.supabase.from('invoice_items').select('support_document_id').in('support_document_id', ids).eq('invoice_type', 'purchase')
      : Promise.resolve({ data: [] as Array<{ support_document_id: string }>, error: null }),
  ]);
  const deCompra = new Set(((lineasCompra.data ?? []) as Array<{ support_document_id: string | null }>).map((x) => String(x.support_document_id)));
  const numeroCompra = new Map(((compras.data ?? []) as Array<{ id: string; number_ext: string | null }>).map((c) => [c.id, c.number_ext ?? '']));
  const envioDe = new Map<string, FilaSoporteListado['envio']>();
  for (const j of (envios.data ?? []) as Array<Record<string, unknown>>) {
    const sd = String(j.support_document_id);
    if (envioDe.has(sd)) continue; // el más reciente primero
    envioDe.set(sd, { estado: String(j.status), retenido: !!texto(j.hold_reason), intentos: num(j.attempt_count), maxIntentos: num(j.max_attempts) || 5 });
  }

  const filas: FilaSoporteListado[] = filasBd.map((f) => {
    const proveedor = (f.provider ?? {}) as Record<string, unknown>;
    const idCompra = texto(f.invoice_purchase_id);
    return {
      id: String(f.id),
      referencia: String(f.reference_code ?? ''),
      numero: texto(f.number),
      fecha: texto(f.issue_date),
      total: num(f.total),
      moneda: texto(f.currency),
      estado: esEstadoSoporte(f.status) ? f.status : 'draft',
      proveedor: texto(proveedor.names) ?? texto(proveedor.trade_name),
      proveedorDoc: texto(proveedor.identification),
      compra: idCompra ? { id: idCompra, numero: numeroCompra.get(idCompra) || '' } : null,
      sucursalId: f.branch_id == null ? null : Number(f.branch_id),
      deCompra: deCompra.has(String(f.id)),
      envio: envioDe.get(String(f.id)) ?? null,
    };
  });

  const kpis: KpisSoporte = {
    emitidosPeriodo: (delPeriodo.data ?? []).length,
    valorPeriodo: ((delPeriodo.data ?? []) as Array<{ total: unknown }>).reduce((s, r) => s + num(r.total), 0),
    borradores: borradores.count ?? 0,
    aceptados: aceptados.count ?? 0,
    rechazados: rechazados.count ?? 0,
  };
  return { filas, total: lista.count ?? filas.length, kpis };
}

// ─── Detalle ────────────────────────────────────────────────────────────────

export async function detalleDocumentoSoporte(ctx: Ctx, id: string): Promise<DetalleSoporte> {
  const { data, error } = await ctx.supabase
    .from('support_documents')
    .select('*, branch:branches(name)')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) lanzar('detalle', ctx, error);
  if (!data) throw new ErrorSoporteServidor('documento_no_encontrado');
  const d = data as Record<string, unknown> & { branch?: { name?: string | null } | null };

  const idCompra = texto(d.invoice_purchase_id);
  const [lineasRes, jobsRes, compraRes] = await Promise.all([
    // Documento ya comprobado de la organización: ver la nota de cabecera.
    getServiceClient()
      .from('invoice_items')
      .select('id, invoice_type, product_id, description, code_reference, qty, unit_price, discount_amount, tax_rate, tax_code, is_excluded, total_line, cuenta_contable, note, created_at')
      .eq('support_document_id', id)
      .order('created_at', { ascending: true }),
    ctx.supabase
      .from('electronic_invoicing_jobs')
      .select('id, status, attempt_count, max_attempts, hold_reason, error_message, next_retry_at, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('support_document_id', id)
      .order('created_at', { ascending: false })
      .limit(1),
    idCompra
      ? ctx.supabase.from('invoice_purchase').select('id, number_ext, issue_date').eq('id', idCompra).eq('organization_id', ctx.organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (lineasRes.error) lanzar('detalle.lineas', ctx, lineasRes.error);

  const job = ((jobsRes.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  let eventos: EventoEnvioSoporte[] = [];
  if (job) {
    const ev = await ctx.supabase
      .from('electronic_invoicing_events')
      .select('event_type, event_code, event_message, created_at, event_time')
      .eq('organization_id', ctx.organizationId)
      .eq('job_id', String(job.id))
      .order('created_at', { ascending: true })
      .limit(50);
    eventos = ((ev.data ?? []) as Array<Record<string, unknown>>).map((e) => ({
      tipo: String(e.event_type ?? ''),
      codigo: texto(e.event_code),
      mensaje: texto(e.event_message),
      fecha: String(e.event_time ?? e.created_at ?? ''),
    }));
  }

  const pagos = Array.isArray(d.payment_details) ? (d.payment_details as Array<Record<string, unknown>>) : [];
  const pago = pagos[0] ?? {};
  const prov = (d.provider ?? {}) as Record<string, unknown>;
  const compra = compraRes.data as { id: string; number_ext: string | null; issue_date: string | null } | null;

  return {
    documento: {
      id: String(d.id),
      referencia: String(d.reference_code ?? ''),
      numero: texto(d.number),
      estado: esEstadoSoporte(d.status) ? d.status : 'draft',
      fecha: texto(d.issue_date),
      hora: texto(d.created_time),
      observacion: texto(d.observation),
      sucursalId: d.branch_id == null ? null : Number(d.branch_id),
      sucursal: texto(d.branch?.name),
      moneda: texto(d.currency),
      impuestosIncluidos: d.tax_included === true,
      subtotal: num(d.subtotal),
      impuestos: num(d.tax_total),
      total: num(d.total),
      cuds: texto(d.cufe),
      qr: texto(d.qr_code),
      validadoEn: texto(d.validated_at),
      error: texto(d.error_message),
      formaPago: String(pago.payment_form ?? '1') === '2' ? '2' : '1',
      medioPago: texto(pago.payment_method_code),
      vence: texto(pago.due_date),
      creadoEn: String(d.created_at ?? ''),
      deCompra: ((lineasRes.data ?? []) as Array<{ invoice_type?: string }>).some((l) => l.invoice_type === 'purchase'),
    },
    proveedor: {
      id: d.supplier_id == null ? null : Number(d.supplier_id),
      nombre: texto(prov.names) ?? texto(prov.trade_name),
      identificacion: texto(prov.identification),
      tipoDocumento: texto(prov.identification_document_code),
      dv: texto(prov.dv),
      direccion: texto(prov.address),
      correo: texto(prov.email),
      telefono: texto(prov.phone),
    },
    compra: compra ? { id: compra.id, numero: compra.number_ext ?? '', fecha: compra.issue_date } : null,
    lineas: ((lineasRes.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
      id: String(l.id),
      productoId: l.product_id == null ? null : Number(l.product_id),
      descripcion: String(l.description ?? ''),
      codigo: texto(l.code_reference),
      cantidad: num(l.qty),
      precioUnitario: num(l.unit_price),
      descuento: num(l.discount_amount),
      tarifa: num(l.tax_rate),
      codigoImpuesto: texto(l.tax_code),
      excluido: num(l.is_excluded) === 1,
      total: num(l.total_line),
      cuentaContable: texto(l.cuenta_contable),
      nota: texto(l.note),
    })),
    envio: job
      ? {
          id: String(job.id),
          estado: String(job.status),
          intentos: num(job.attempt_count),
          maxIntentos: num(job.max_attempts) || 5,
          retenido: texto(job.hold_reason),
          error: texto(job.error_message),
          proximoIntento: texto(job.next_retry_at),
          eventos,
        }
      : null,
  };
}

// ─── Guardar ────────────────────────────────────────────────────────────────

/**
 * Crea (`id` null) o edita. El vendedor se arma AQUÍ desde `suppliers` (nunca
 * desde el cuerpo) y el método de pago de la organización se lleva al código
 * DIAN con la misma tabla de la factura (`mapPaymentMethod`): antes se guardaba
 * el código interno («cash») y el proveedor lo recibía tal cual.
 */
export async function guardarDocumentoSoporte(ctx: Ctx, id: string | null, datos: DatosSoporteValidados): Promise<ResultadoGuardarSoporte> {
  const { data: fila, error: errorProveedor } = await ctx.supabase
    .from('suppliers')
    .select(COLUMNAS_PROVEEDOR_SOPORTE)
    .eq('id', datos.supplier_id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (errorProveedor) lanzar('guardar.proveedor', ctx, errorProveedor);
  if (!fila) throw new ErrorSoporteServidor('proveedor_invalido');
  const provider = proveedorDesdeFila(fila as unknown as FilaProveedorSoporte, mapearTipoDocADian);
  if (faltantesProveedor(provider).length > 0) throw new ErrorSoporteServidor('proveedor_incompleto');

  const { data, error } = await ctx.supabase.rpc('fn_documento_soporte_guardar', {
    p_org: ctx.organizationId,
    p_id: id,
    p_datos: {
      branch_id: datos.branch_id,
      supplier_id: datos.supplier_id,
      provider,
      invoice_purchase_id: datos.invoice_purchase_id ?? null,
      issue_date: datos.issue_date,
      payment_form: datos.payment_form,
      payment_method_code: mapPaymentMethod(datos.payment_method),
      due_date: datos.payment_form === '2' ? datos.due_date ?? null : null,
      currency: datos.currency ?? null,
      observation: datos.observation ?? null,
      tax_included: datos.tax_included,
      items: datos.items,
    },
  });
  if (error) lanzar('guardar', ctx, error);
  const r = (data ?? {}) as Record<string, unknown>;
  return { id: String(r.id), referencia: String(r.referencia ?? ''), total: num(r.total) };
}

// ─── Eliminar ───────────────────────────────────────────────────────────────

/**
 * Borra un documento que la DIAN no recibió: borrador, rechazado, con error o
 * cancelado en el proveedor (lo que deja `DELETE /api/factus/support-document`),
 * nunca validado ni con un envío vivo. Las líneas y los envíos caen por las FK
 * `ON DELETE CASCADE`.
 */
export async function eliminarDocumentoSoporte(ctx: Ctx, id: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('support_documents')
    .select('id, status, is_validated')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) lanzar('eliminar', ctx, error);
  if (!data) throw new ErrorSoporteServidor('documento_no_encontrado');
  const d = data as { status: string; is_validated: boolean | null };
  if (d.is_validated || !['draft', 'failed', 'rejected', 'cancelled'].includes(d.status)) throw new ErrorSoporteServidor('documento_no_eliminable');

  const { data: jobs } = await ctx.supabase
    .from('electronic_invoicing_jobs')
    .select('status')
    .eq('organization_id', ctx.organizationId)
    .eq('support_document_id', id);
  if (((jobs ?? []) as Array<{ status: string }>).some((j) => envioVivo(j.status))) throw new ErrorSoporteServidor('documento_en_envio');

  // Nacido de una compra: sus líneas son las de la compra y la FK borraría las de la compra en cascada.
  const { count: deCompra } = await ctx.supabase
    .from('invoice_items')
    .select('id', { count: 'exact', head: true })
    .eq('support_document_id', id)
    .eq('invoice_type', 'purchase');
  if ((deCompra ?? 0) > 0) throw new ErrorSoporteServidor('documento_de_compra');

  const { error: errorBorrar, count } = await ctx.supabase
    .from('support_documents')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId);
  if (errorBorrar) lanzar('eliminar.borrar', ctx, errorBorrar);
  if (!count) throw new ErrorSoporteServidor('documento_no_encontrado');
  await ctx.supabase.from('finance_audit_log').insert({
    organization_id: ctx.organizationId,
    entity: 'support_documents',
    entity_id: id,
    action: 'delete',
    user_id: ctx.userId,
    diff: { estado: d.status },
  });
}

// ─── Contexto del formulario ────────────────────────────────────────────────

/** Métodos de pago, monedas, compras recientes y la resolución de la sucursal. */
export async function contextoDocumentoSoporte(ctx: Ctx, sucursal: number | null): Promise<ContextoSoporte> {
  const org = ctx.organizationId;
  const [metodos, monedas, compras, rangos] = await Promise.all([
    ctx.supabase
      .from('organization_payment_methods')
      .select('payment_method_code, payment_methods(name)')
      .eq('organization_id', org)
      .eq('is_active', true)
      .order('id'),
    ctx.supabase.from('organization_currencies').select('currency_code, is_base').eq('organization_id', org).order('is_base', { ascending: false }),
    ctx.supabase
      .from('invoice_purchase')
      .select('id, number_ext, issue_date, total, currency, supplier:suppliers(name)')
      .eq('organization_id', org)
      .order('created_at', { ascending: false })
      .limit(50),
    sucursal
      ? ctx.supabase
          .from('invoice_sequences')
          .select('prefix, resolution_number, resolution_date, range_start, range_end, current_number, valid_until, alert_threshold, branch_id, id')
          .eq('organization_id', org)
          .eq('document_type', 'support_document')
          .eq('is_active', true)
          .or(`branch_id.eq.${sucursal},branch_id.is.null`)
          .order('id', { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);
  const listaRangos = (rangos.data ?? []) as Array<Record<string, unknown>>;
  // La de la sucursal manda; sin ella, la general (misma preferencia que `elegirRango` de la cola).
  const r = listaRangos.find((x) => Number(x.branch_id) === sucursal) ?? listaRangos[0] ?? null;
  return {
    metodos: ((metodos.data ?? []) as Array<{ payment_method_code: string; payment_methods: { name: string | null } | Array<{ name: string | null }> | null }>).map((m) => {
      const pm = Array.isArray(m.payment_methods) ? m.payment_methods[0] : m.payment_methods;
      return { codigo: m.payment_method_code, nombre: pm?.name || m.payment_method_code };
    }),
    monedas: ((monedas.data ?? []) as Array<{ currency_code: string }>).map((m) => m.currency_code.trim().toUpperCase()),
    compras: ((compras.data ?? []) as Array<Record<string, unknown>>).map((c) => {
      const s = c.supplier as { name?: string | null } | Array<{ name?: string | null }> | null;
      const sup = Array.isArray(s) ? s[0] : s;
      return { id: String(c.id), numero: String(c.number_ext ?? ''), proveedor: sup?.name ?? null, fecha: texto(c.issue_date), total: num(c.total), moneda: texto(c.currency) };
    }),
    rango: r
      ? {
          prefix: texto(r.prefix),
          resolucion: texto(r.resolution_number),
          fechaResolucion: texto(r.resolution_date),
          range_start: r.range_start == null ? null : Number(r.range_start),
          range_end: r.range_end == null ? null : Number(r.range_end),
          current_number: r.current_number == null ? null : Number(r.current_number),
          valid_until: texto(r.valid_until),
          alert_threshold: r.alert_threshold == null ? null : Number(r.alert_threshold),
        }
      : null,
  };
}
