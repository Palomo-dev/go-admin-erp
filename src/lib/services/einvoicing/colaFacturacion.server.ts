/**
 * Cola de facturación electrónica — SOLO SERVIDOR.
 *
 * Un documento (factura, nota crédito, documento soporte) tiene como mucho UN
 * job vivo (`uq_ei_jobs_documento_vivo` / `uq_ei_jobs_documento_soporte_vivo`)
 * y un solo envío en vuelo: el job se reclama con `fn_einvoicing_reclamar_jobs`
 * (FOR UPDATE SKIP LOCKED) y solo quien lo reclamó registra el resultado con
 * `fn_einvoicing_registrar_resultado`, que actualiza job, documento y evento
 * en una transacción. El `reference_code` es estable entre reintentos: si
 * Factus ya validó el documento, responde con el existente (verificado en
 * sandbox), así que reenviar no duplica.
 *
 * El envío «inmediato» de las rutas y el cron usan el mismo camino
 * (`procesarJob`): no hay dos implementaciones.
 *
 * Organizaciones sin el servicio activo: no se reclama nada. Lo que se encola
 * mientras el servicio no está activo queda RETENIDO (`hold_reason`): Factus
 * emite con la fecha del día de envío, y enviar después una venta de otro día
 * lo decide una persona (configuración de facturación → «Enviar»).
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient, assertServerOnly } from '@/lib/supabase/server-service';
import factusService, { FactusApiError, type FactusEstablishment, mapPaymentMethod } from '@/lib/services/factusService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { todayInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { obtenerAccesoFactus, invalidarAcceso, FacturacionNoActivadaError, verificarPendientesDeActivacion, type AccesoFactus } from './accesoFactus.server';
import { clasificarHttp, decidirTrasFallo, type ClaseFallo } from './politicaReintentos';
import { leerResultadoFactus } from './respuestaFactus';
import {
  construirFactura,
  construirNotaCredito,
  construirDocumentoSoporte,
  conceptoNotaCredito,
  elegirRango,
  mapearCliente,
  DatosIncompletosError,
  DependenciaPendienteError,
  CONCEPTOS_NOTA_CREDITO,
  type ConceptoNotaCredito,
  type LineaDocumento,
  type RangoNumeracion,
  type ClienteDocumento,
} from './payloadsFactus';

export type TipoDocumentoElectronico = 'invoice' | 'credit_note' | 'debit_note' | 'support_document';

export interface JobCola {
  id: string;
  organization_id: number;
  invoice_id: string | null;
  support_document_id: string | null;
  document_type: TipoDocumentoElectronico;
  status: string;
  attempt_count: number;
  max_attempts: number;
  reference_code: string | null;
  request_payload: { opciones?: OpcionesEnvio } | Record<string, unknown> | null;
  hold_reason?: string | null;
}

export interface OpcionesEnvio {
  /** Nota crédito: concepto DIAN (1–5). Si falta, se deduce. */
  concepto?: string;
  /** Nota crédito: motivo, va a `observation`. */
  observacion?: string;
}

const MOTIVO_RETENCION =
  'Se registró sin el servicio de facturación electrónica activo. Factus emite con la fecha del día de envío, no con la de la venta: requiere confirmación.';

// ─── Encolar ─────────────────────────────────────────────────────────────────

export interface ResultadoEncolar {
  job: JobCola;
  creado: boolean;
  servicioActivo: boolean;
}

async function servicioActivo(db: SupabaseClient, organizationId: number): Promise<boolean> {
  const { data } = await db
    .from('electronic_invoicing_config')
    .select('service_status, is_active, credentials_secret_id')
    .eq('organization_id', organizationId)
    .eq('provider', 'factus')
    .maybeSingle();
  const fila = data as { service_status?: string; is_active?: boolean; credentials_secret_id?: string | null } | null;
  return !!fila && fila.is_active === true && fila.service_status === 'active' && !!fila.credentials_secret_id;
}

/**
 * Encola el documento (idempotente). Si ya tiene un job vivo lo devuelve; si
 * ese job terminó en `failed` o `rejected`, lo vuelve a poner en cola (es el
 * reenvío tras corregir). La organización ya viene validada por la ruta.
 */
export async function encolarDocumento(params: {
  organizationId: number;
  documentType: TipoDocumentoElectronico;
  invoiceId?: string;
  supportDocumentId?: string;
  opciones?: OpcionesEnvio;
}): Promise<ResultadoEncolar> {
  assertServerOnly();
  const db = getServiceClient();
  const { organizationId, documentType } = params;
  const esSoporte = documentType === 'support_document';
  if (esSoporte ? !params.supportDocumentId : !params.invoiceId) {
    throw new Error('Documento sin id para encolar');
  }
  const activo = await servicioActivo(db, organizationId);

  const buscar = async (): Promise<JobCola | null> => {
    let q = db
      .from('electronic_invoicing_jobs')
      .select('*')
      .eq('organization_id', organizationId)
      .neq('status', 'cancelled')
      .limit(1);
    q = esSoporte
      ? q.eq('support_document_id', params.supportDocumentId as string)
      : q.eq('invoice_id', params.invoiceId as string).eq('document_type', documentType);
    const { data } = await q.maybeSingle();
    return (data as JobCola | null) ?? null;
  };

  const existente = await buscar();
  if (existente) {
    if (existente.status === 'failed' || existente.status === 'rejected') {
      const { data, error } = await db
        .from('electronic_invoicing_jobs')
        .update({
          status: 'pending',
          attempt_count: 0,
          next_retry_at: null,
          error_code: null,
          error_message: null,
          hold_reason: activo ? null : MOTIVO_RETENCION,
          ...(params.opciones ? { request_payload: { opciones: params.opciones } } : {}),
        })
        .eq('id', existente.id)
        .in('status', ['failed', 'rejected'])
        .select('*')
        .maybeSingle();
      if (error) throw error;
      await marcarDocumento(db, { ...existente, status: 'pending' }, 'pending');
      return { job: (data as JobCola | null) ?? existente, creado: false, servicioActivo: activo };
    }
    if (!activo && existente.status === 'pending' && !existente.hold_reason) {
      // Encolado por otro camino sin retención: se retiene igual que los nuevos.
      const { data } = await db
        .from('electronic_invoicing_jobs')
        .update({ hold_reason: MOTIVO_RETENCION })
        .eq('id', existente.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();
      return { job: (data as JobCola | null) ?? existente, creado: false, servicioActivo: activo };
    }
    return { job: existente, creado: false, servicioActivo: activo };
  }

  const { data, error } = await db
    .from('electronic_invoicing_jobs')
    .insert({
      organization_id: organizationId,
      invoice_id: esSoporte ? null : params.invoiceId,
      support_document_id: esSoporte ? params.supportDocumentId : null,
      document_type: documentType,
      provider: 'factus',
      status: 'pending',
      attempt_count: 0,
      max_attempts: 5,
      request_payload: params.opciones ? { opciones: params.opciones } : null,
      hold_reason: activo ? null : MOTIVO_RETENCION,
    })
    .select('*')
    .single();

  if (error) {
    // Carrera con otra petición: el índice único parcial ya tiene el job vivo.
    if (error.code === '23505') {
      const otro = await buscar();
      if (otro) return { job: otro, creado: false, servicioActivo: activo };
    }
    throw error;
  }
  const job = data as JobCola;
  await marcarDocumento(db, job, 'pending');
  return { job, creado: true, servicioActivo: activo };
}

async function marcarDocumento(db: SupabaseClient, job: JobCola, estado: string): Promise<void> {
  if (job.document_type === 'support_document' && job.support_document_id) {
    await db.from('support_documents').update({ status: estado, updated_at: new Date().toISOString() })
      .eq('id', job.support_document_id).eq('organization_id', job.organization_id);
  } else if (job.invoice_id) {
    await db.from('invoice_sales').update({ einvoice_status: estado })
      .eq('id', job.invoice_id).eq('organization_id', job.organization_id);
  }
}

// ─── Construir el envío ──────────────────────────────────────────────────────

interface Envio {
  tipo: TipoDocumentoElectronico;
  referencia: string;
  payload: unknown;
  avisos: string[];
  meta: Record<string, unknown>;
}

async function codigoMunicipio(db: SupabaseClient, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const { data } = await db.from('municipalities').select('code').eq('id', id).maybeSingle();
  return (data as { code?: string } | null)?.code ?? null;
}

interface ContextoOrganizacion {
  tz: string;
  hoy: string;
  municipioOrg: string | null;
  org: { name?: string | null; address?: string | null; phone?: string | null; email?: string | null };
}

async function contextoOrganizacion(db: SupabaseClient, organizationId: number): Promise<ContextoOrganizacion> {
  const tz = await getOrganizationTimezone(organizationId, db);
  const { data: org } = await db
    .from('organizations')
    .select('name, address, phone, email, municipality_id')
    .eq('id', organizationId)
    .maybeSingle();
  const o = (org ?? {}) as { name?: string; address?: string; phone?: string; email?: string; municipality_id?: string };
  return { tz, hoy: todayInTz(tz), municipioOrg: await codigoMunicipio(db, o.municipality_id), org: o };
}

interface Sucursal {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  municipality_id?: string | null;
}

/**
 * Establecimiento que emite. Solo se envía si está completo: con datos
 * inventados (teléfono o correo de relleno) la DIAN recibiría un documento
 * falso. Sin él, Factus usa los datos de la empresa registrada en la cuenta.
 */
function establecimiento(sucursal: Sucursal | null, ctx: ContextoOrganizacion, municipio: string | null): FactusEstablishment | undefined {
  const nombre = sucursal?.name || ctx.org.name;
  const direccion = sucursal?.address || ctx.org.address;
  const telefono = (sucursal?.phone || ctx.org.phone || '').trim();
  const correo = sucursal?.email || ctx.org.email;
  if (!nombre || !direccion || !telefono || !correo || !municipio) return undefined;
  return { name: nombre, address: direccion, phone_number: telefono, email: correo, municipality_code: municipio };
}

async function rangosDe(db: SupabaseClient, organizationId: number, documentType: string): Promise<RangoNumeracion[]> {
  const { data } = await db
    .from('invoice_sequences')
    .select('id, branch_id, document_type, prefix, is_active, factus_numbering_range_id, valid_from, valid_until')
    .eq('organization_id', organizationId)
    .eq('document_type', documentType);
  return (data as RangoNumeracion[] | null) ?? [];
}

function sinGuiones(id: string): string {
  return id.replace(/-/g, '');
}

async function construirEnvioFactura(db: SupabaseClient, job: JobCola): Promise<Envio> {
  const { data: factura, error } = await db
    .from('invoice_sales')
    .select('*, customer:customers(*), branch:branches(*)')
    .eq('id', job.invoice_id as string)
    .eq('organization_id', job.organization_id)
    .maybeSingle();
  if (error || !factura) throw new DatosIncompletosError(['la factura no existe']);
  const f = factura as Record<string, unknown> & { customer?: Record<string, unknown> | null; branch?: Sucursal | null };

  const ctx = await contextoOrganizacion(db, job.organization_id);
  const municipioSucursal = await codigoMunicipio(db, f.branch?.municipality_id);
  const municipioCliente =
    (await codigoMunicipio(db, (f.customer?.fiscal_municipality_id as string | null) ?? null)) ?? municipioSucursal ?? ctx.municipioOrg;
  const faltan: string[] = [];
  if (!municipioCliente) faltan.push('ni el cliente, ni la sucursal, ni la organización tienen municipio');

  const { data: lineas } = await db.from('invoice_items').select('*').eq('invoice_sales_id', job.invoice_id as string);
  const eleccion = elegirRango(await rangosDe(db, job.organization_id, 'invoice'), {
    branchId: (f.branch_id as number | null) ?? null,
    documentType: 'invoice',
    hoy: ctx.hoy,
  });
  if (!eleccion.rango?.factus_numbering_range_id) faltan.push('no hay un rango de numeración de Factus activo y vigente para facturas');
  if (faltan.length > 0) throw new DatosIncompletosError(faltan);

  let referencia = job.reference_code || (f.reference_code as string | null) || `INV-${sinGuiones(String(f.id))}`;
  referencia = referencia.slice(0, 100);
  if (!f.reference_code) {
    await db.from('invoice_sales').update({ reference_code: referencia }).eq('id', f.id as string).eq('organization_id', job.organization_id);
  }

  const { payload, total } = construirFactura({
    factura: f as never,
    lineas: (lineas as LineaDocumento[] | null) ?? [],
    cliente: mapearCliente((f.customer as ClienteDocumento | null) ?? null, municipioCliente as string),
    referencia,
    numberingRangeId: eleccion.rango!.factus_numbering_range_id as number,
    establecimiento: establecimiento(f.branch ?? null, ctx, municipioSucursal ?? ctx.municipioOrg),
    vencimiento: f.due_date ? toPlainDate(new Date(String(f.due_date)), ctx.tz) : undefined,
  });

  return {
    tipo: 'invoice',
    referencia,
    payload,
    avisos: eleccion.aviso ? [eleccion.aviso] : [],
    meta: {
      rango: eleccion.rango!.prefix,
      total_calculado: total,
      total_factura: Number(f.total ?? 0),
    },
  };
}

async function construirEnvioNotaCredito(db: SupabaseClient, job: JobCola): Promise<Envio> {
  const { data: nota } = await db
    .from('invoice_sales')
    .select('*')
    .eq('id', job.invoice_id as string)
    .eq('organization_id', job.organization_id)
    .maybeSingle();
  if (!nota) throw new DatosIncompletosError(['la nota crédito no existe']);
  const n = nota as Record<string, unknown>;
  if (!n.related_invoice_id) throw new DatosIncompletosError(['la nota crédito no está ligada a una factura']);

  const { data: original } = await db
    .from('invoice_sales')
    .select('*, customer:customers(*), branch:branches(*)')
    .eq('id', n.related_invoice_id as string)
    .eq('organization_id', job.organization_id)
    .maybeSingle();
  if (!original) throw new DatosIncompletosError(['la factura original no existe']);
  const o = original as Record<string, unknown> & { customer?: Record<string, unknown> | null; branch?: Sucursal | null };

  if (!o.einvoice_number || o.einvoice_status !== 'accepted') {
    const { data: jobFactura } = await db
      .from('electronic_invoicing_jobs')
      .select('status')
      .eq('invoice_id', o.id as string)
      .eq('document_type', 'invoice')
      .in('status', ['pending', 'processing', 'sent'])
      .limit(1)
      .maybeSingle();
    if (jobFactura) throw new DependenciaPendienteError('La factura original todavía no ha sido aceptada por la DIAN; la nota espera.');
    throw new DatosIncompletosError(['la factura original no ha sido aceptada por la DIAN']);
  }

  const ctx = await contextoOrganizacion(db, job.organization_id);
  const municipioSucursal = await codigoMunicipio(db, o.branch?.municipality_id);
  const municipioCliente =
    (await codigoMunicipio(db, (o.customer?.fiscal_municipality_id as string | null) ?? null)) ?? municipioSucursal ?? ctx.municipioOrg;
  if (!municipioCliente) throw new DatosIncompletosError(['ni el cliente, ni la sucursal, ni la organización tienen municipio']);

  const { data: lineas } = await db.from('invoice_items').select('*').eq('invoice_sales_id', n.id as string);
  const lineasNota = (lineas as LineaDocumento[] | null) ?? [];
  const eleccion = elegirRango(await rangosDe(db, job.organization_id, 'credit_note'), {
    branchId: ((n.branch_id ?? o.branch_id) as number | null) ?? null,
    documentType: 'credit_note',
    hoy: ctx.hoy,
  });

  const opciones = ((job.request_payload as { opciones?: OpcionesEnvio } | null)?.opciones ?? {}) as OpcionesEnvio;
  const concepto: ConceptoNotaCredito = (CONCEPTOS_NOTA_CREDITO as readonly string[]).includes(String(opciones.concepto))
    ? (opciones.concepto as ConceptoNotaCredito)
    : conceptoNotaCredito({
        totalNota: Number(n.total ?? 0),
        totalFactura: Number(o.total ?? 0),
        conProductos: lineasNota.some((l) => !!l.product_id),
      });

  const referencia = (job.reference_code || (n.reference_code as string | null) || `NC-${sinGuiones(String(n.id))}`).slice(0, 100);
  if (!n.reference_code) {
    await db.from('invoice_sales').update({ reference_code: referencia }).eq('id', n.id as string).eq('organization_id', job.organization_id);
  }

  const { payload, total } = construirNotaCredito({
    lineas: lineasNota,
    cliente: mapearCliente((o.customer as ClienteDocumento | null) ?? null, municipioCliente),
    referencia,
    numberingRangeId: eleccion.rango?.factus_numbering_range_id ?? null,
    numeroFacturaDian: String(o.einvoice_number),
    concepto,
    observacion: opciones.observacion || (n.notes as string | null) || (n.description as string | null) || 'Nota crédito',
    formaPago: (o.payment_form as string | null) ?? '1',
    metodoPago: (o.payment_method_code as string | null) || mapPaymentMethod((o.payment_method as string | undefined) || undefined),
  });

  return {
    tipo: 'credit_note',
    referencia,
    payload,
    avisos: eleccion.aviso ? [eleccion.aviso] : [],
    meta: { concepto, rango: eleccion.rango?.prefix ?? null, total_calculado: total, factura: o.einvoice_number },
  };
}

async function construirEnvioDocumentoSoporte(db: SupabaseClient, job: JobCola): Promise<Envio> {
  const { data: sd } = await db
    .from('support_documents')
    .select('*, branch:branches(*)')
    .eq('id', job.support_document_id as string)
    .eq('organization_id', job.organization_id)
    .maybeSingle();
  if (!sd) throw new DatosIncompletosError(['el documento soporte no existe']);
  const d = sd as Record<string, unknown> & { branch?: Sucursal | null };

  const ctx = await contextoOrganizacion(db, job.organization_id);
  const { data: lineas } = await db
    .from('invoice_items')
    .select('*')
    .eq('support_document_id', d.id as string)
    .order('created_at', { ascending: true });

  let rangoId = (d.numbering_range_id as number | null) ?? null;
  let aviso: string | null = null;
  if (!rangoId) {
    const eleccion = elegirRango(await rangosDe(db, job.organization_id, 'support_document'), {
      branchId: (d.branch_id as number | null) ?? null,
      documentType: 'support_document',
      hoy: ctx.hoy,
    });
    rangoId = eleccion.rango?.factus_numbering_range_id ?? null;
    aviso = eleccion.aviso;
  }
  const municipioSucursal = (await codigoMunicipio(db, d.branch?.municipality_id)) ?? ctx.municipioOrg;
  const payload = construirDocumentoSoporte({
    documento: d as never,
    lineas: (lineas as LineaDocumento[] | null) ?? [],
    numberingRangeId: rangoId,
    establecimiento: establecimiento(d.branch ?? null, ctx, municipioSucursal),
  });
  if (rangoId && rangoId !== d.numbering_range_id) {
    await db.from('support_documents').update({ numbering_range_id: rangoId }).eq('id', d.id as string).eq('organization_id', job.organization_id);
  }

  return {
    tipo: 'support_document',
    referencia: String(d.reference_code),
    payload,
    avisos: aviso ? [aviso] : [],
    meta: {},
  };
}

async function construirEnvio(db: SupabaseClient, job: JobCola): Promise<Envio> {
  switch (job.document_type) {
    case 'invoice':
      return construirEnvioFactura(db, job);
    case 'credit_note':
      return construirEnvioNotaCredito(db, job);
    case 'support_document':
      return construirEnvioDocumentoSoporte(db, job);
    default:
      throw new DatosIncompletosError(['la nota débito todavía no se envía por la cola']);
  }
}

async function enviar(acceso: AccesoFactus, envio: Envio): Promise<unknown> {
  switch (envio.tipo) {
    case 'invoice':
      return factusService.createInvoice(acceso.environment, acceso.accessToken, envio.payload as never);
    case 'credit_note':
      return factusService.createCreditNote(acceso.environment, acceso.accessToken, envio.payload as never);
    case 'support_document':
      return factusService.createSupportDocument(acceso.environment, acceso.accessToken, envio.payload as never);
    default:
      throw new DatosIncompletosError(['tipo de documento no soportado']);
  }
}

// ─── Procesar ────────────────────────────────────────────────────────────────

export interface ResultadoJob {
  jobId: string;
  estado: 'accepted' | 'sent' | 'rejected' | 'pending' | 'failed';
  numero?: string | null;
  cufe?: string | null;
  mensaje?: string;
}

interface Registro {
  estado: ResultadoJob['estado'];
  contarIntento: boolean;
  siguienteIntento?: Date | null;
  referencia?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  cufe?: string | null;
  numero?: string | null;
  qr?: string | null;
  validadoEn?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown>;
}

async function registrar(db: SupabaseClient, job: JobCola, worker: string, r: Registro): Promise<void> {
  const { error } = await db.rpc('fn_einvoicing_registrar_resultado', {
    p_job_id: job.id,
    p_worker: worker,
    p_estado: r.estado,
    p_contar_intento: r.contarIntento,
    p_next_retry_at: r.siguienteIntento ? r.siguienteIntento.toISOString() : null,
    p_reference_code: r.referencia ?? null,
    p_request_payload: r.requestPayload ?? null,
    p_response_payload: r.responsePayload ?? null,
    p_cufe: r.cufe ?? null,
    p_numero: r.numero ?? null,
    p_qr: r.qr ?? null,
    p_qr_image: null,
    p_validated_at: r.validadoEn ? r.validadoEn.toISOString() : null,
    p_error_code: r.errorCode ?? null,
    p_error_message: r.errorMessage ?? null,
    p_evento_meta: r.meta ?? {},
  });
  if (error) {
    // El job queda en 'processing' con el bloqueo; tras 10 minutos se vuelve a reclamar.
    console.error('[colaFacturacion] no se pudo registrar el resultado', { jobId: job.id, code: error.code, message: error.message });
    throw new Error(`No se pudo registrar el resultado del job ${job.id}`);
  }
}

function claseDe(err: unknown): ClaseFallo {
  if (err instanceof FacturacionNoActivadaError) return 'no_activado';
  if (err instanceof DatosIncompletosError) return 'datos';
  if (err instanceof FactusApiError) return clasificarHttp(err.status);
  return 'pasajero';
}

function codigoError(err: unknown): string {
  if (err instanceof FacturacionNoActivadaError) return 'servicio_no_activo';
  if (err instanceof DatosIncompletosError) return 'datos_incompletos';
  if (err instanceof DependenciaPendienteError) return 'esperando_factura';
  if (err instanceof FactusApiError) return err.status === null ? 'factus_sin_respuesta' : `factus_http_${err.status}`;
  return 'error_interno';
}

/**
 * Envía un job YA RECLAMADO por `worker` y registra el resultado. Nunca lanza
 * por un fallo del envío: el fallo queda en el job (reintento, rechazo o
 * fallo definitivo según la política).
 */
export async function procesarJob(job: JobCola, worker: string, db: SupabaseClient = getServiceClient()): Promise<ResultadoJob> {
  let acceso: AccesoFactus | null = null;
  let envio: Envio | null = null;
  const opciones = (job.request_payload as { opciones?: OpcionesEnvio } | null)?.opciones;
  try {
    acceso = await obtenerAccesoFactus(job.organization_id);
    envio = await construirEnvio(db, job);
    const respuesta = await enviar(acceso, envio);
    const r = leerResultadoFactus(respuesta);
    const estado = r.validado ? 'accepted' : 'sent';
    await registrar(db, job, worker, {
      estado,
      contarIntento: true,
      referencia: envio.referencia,
      requestPayload: { ...(opciones ? { opciones } : {}), factus: envio.payload },
      responsePayload: respuesta,
      cufe: r.codigoUnico,
      numero: r.numero,
      qr: r.qr,
      validadoEn: r.validado ? new Date() : null,
      meta: { ...envio.meta, avisos: envio.avisos, notificaciones_dian: r.notificaciones, url_publica: r.urlPublica, ambiente: acceso.environment },
    });
    return { jobId: job.id, estado, numero: r.numero, cufe: r.codigoUnico };
  } catch (err) {
    if (err instanceof FactusApiError && err.status === 401 && acceso) invalidarAcceso(acceso);
    const mensaje = err instanceof Error ? err.message : String(err);
    const base: Omit<Registro, 'estado' | 'contarIntento'> = {
      referencia: envio?.referencia ?? null,
      requestPayload: envio ? { ...(opciones ? { opciones } : {}), factus: envio.payload } : null,
      responsePayload: err instanceof FactusApiError ? (err.body as object | null) ?? null : null,
      errorCode: codigoError(err),
      errorMessage: mensaje,
      meta: { ...(envio?.meta ?? {}), avisos: envio?.avisos ?? [], http: err instanceof FactusApiError ? err.status : null },
    };

    if (err instanceof DependenciaPendienteError) {
      // Esperar a la factura sin gastar intentos.
      const siguiente = new Date(Date.now() + 5 * 60 * 1000);
      await registrar(db, job, worker, { ...base, estado: 'pending', contarIntento: false, siguienteIntento: siguiente });
      return { jobId: job.id, estado: 'pending', mensaje };
    }

    const decision = decidirTrasFallo({ clase: claseDe(err), intentosPrevios: job.attempt_count, maxIntentos: job.max_attempts });
    await registrar(db, job, worker, {
      ...base,
      estado: decision.estado,
      contarIntento: decision.contarIntento,
      siguienteIntento: decision.siguienteIntento,
      meta: { ...base.meta, espera_minutos: decision.esperaMinutos },
    });
    return { jobId: job.id, estado: decision.estado, mensaje };
  }
}

async function reclamar(db: SupabaseClient, worker: string, limite: number, jobId?: string): Promise<JobCola[]> {
  const { data, error } = await db.rpc('fn_einvoicing_reclamar_jobs', {
    p_worker: worker,
    p_limite: limite,
    p_job_id: jobId ?? null,
  });
  if (error) throw error;
  return (data as JobCola[] | null) ?? [];
}

/**
 * Intenta enviar YA un job (lo que antes hacían las rutas por su cuenta).
 * Si no se puede reclamar —servicio inactivo, retenido, esperando su turno de
 * reintento o ya en vuelo— devuelve null y el job sigue en la cola.
 */
export async function procesarAhora(jobId: string): Promise<ResultadoJob | null> {
  assertServerOnly();
  const db = getServiceClient();
  const worker = `ruta:${randomUUID()}`;
  const [job] = await reclamar(db, worker, 1, jobId);
  if (!job) return null;
  return procesarJob(job, worker, db);
}

/** Lo que corre el cron: verifica credenciales recién cargadas y procesa la cola. */
export async function procesarPendientes(limite = 10): Promise<{
  verificadas: Array<{ organizationId: number; ok: boolean; activado: boolean }>;
  resultados: ResultadoJob[];
}> {
  assertServerOnly();
  const db = getServiceClient();
  const verificadas = await verificarPendientesDeActivacion();
  const worker = `cron:${randomUUID()}`;
  const jobs = await reclamar(db, worker, limite);
  const resultados: ResultadoJob[] = [];
  // En serie: una cuenta de Factus tiene límite de peticiones por minuto.
  for (const job of jobs) {
    try {
      resultados.push(await procesarJob(job, worker, db));
    } catch (err) {
      resultados.push({ jobId: job.id, estado: 'pending', mensaje: err instanceof Error ? err.message : String(err) });
    }
  }
  return { verificadas, resultados };
}

/** Libera un documento retenido (la persona acepta que salga con la fecha de hoy). */
export async function liberarRetenido(params: { jobId: string; organizationId: number; actor: string }): Promise<JobCola> {
  assertServerOnly();
  const db = getServiceClient();
  const { data, error } = await db.rpc('fn_einvoicing_liberar_job', {
    p_job_id: params.jobId,
    p_organization_id: params.organizationId,
    p_actor: params.actor,
  });
  if (error) throw error;
  return data as JobCola;
}
