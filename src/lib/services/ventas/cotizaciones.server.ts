/**
 * Cotizaciones — servicio de servidor. Lee con el cliente de la SESIÓN (RLS)
 * filtrando por la organización de la sesión; escribe SOLO por RPC
 * (20260928172526): `fn_cotizacion_guardar`, `fn_cotizacion_cambiar_estado`,
 * `fn_cotizacion_eliminar`, `fn_cotizacion_duplicar` y `fn_cotizacion_convertir`,
 * que exigen pertenencia y permiso en la base y calculan número y totales.
 *
 * Reglas compartidas, sin segunda implementación:
 * - Impuesto de cada línea: `resolveLineTaxWith` (el resolver de facturas).
 * - Número del borrador de factura al convertir: `generateInvoiceNumberWithClient`
 *   (la regla del formulario de facturas); la base exige que sea único.
 * - Tasa de comisión del vendedor: `resolverTasaComision` (la de useCommissionRate).
 * - Factura: `fn_factura_venta_guardar` desde la RPC de conversión.
 * - Correo: `enviarDocumentoPorCorreo` con el PDF del motor de documentos.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { resolveLineTaxWith } from '@/lib/services/taxResolverCore';
import { generateInvoiceNumberWithClient } from '@/lib/utils/invoiceUtils';
import { resolverTasaComision } from '@/lib/services/comisiones/tasaComision';
import { enviarDocumentoPorCorreo, ErrorEnvioServidor, escaparHtml } from '@/lib/services/finanzas/enviarDocumento.server';
import { idiomaDelUsuario, traductorFinanzas } from '@/lib/finanzas/textosServidor.server';
import { formatMoneda } from '@/lib/utils/moneda';
import {
  codigoErrorCotizacion,
  type CotizacionDetalle,
  type CotizacionResumen,
  type DatosCotizacion,
  type ErrorCotizacion,
  type EstadoCotizacion,
  type FiltrosCotizacion,
  type LineaCotizacionDetalle,
  type ResultadoConversion,
  type ResultadoGuardarCotizacion,
} from '@/lib/finanzas/ventas/contratoCotizaciones';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;
type CtxCorreo = Pick<
  ServerOrgContext,
  'organizationId' | 'userId' | 'userEmail' | 'organizationName' | 'supabase' | 'roleId' | 'isSuperAdmin'
>;

export class ErrorCotizacionServidor extends Error {
  constructor(public readonly codigo: ErrorCotizacion) {
    super(codigo);
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function lanzar(etiqueta: string, ctx: Ctx, error: { message: string }): never {
  const codigo = codigoErrorCotizacion(error.message);
  if (codigo === 'error_desconocido') {
    console.error(`[cotizaciones] ${etiqueta}`, { organizationId: ctx.organizationId, message: error.message });
  }
  throw new ErrorCotizacionServidor(codigo);
}

// ─── Lectura ────────────────────────────────────────────────────────────────

type FilaListado = Record<string, unknown>;

function resumen(f: FilaListado): CotizacionResumen {
  return {
    id: String(f.id),
    number: String(f.number ?? ''),
    status: String(f.estado ?? f.status) as EstadoCotizacion,
    stored_status: String(f.status ?? ''),
    customer_id: String(f.customer_id ?? ''),
    branch_id: f.branch_id == null ? null : Number(f.branch_id),
    issue_date: String(f.issue_date ?? ''),
    valid_until: (f.valid_until as string | null) ?? null,
    currency: String(f.currency ?? ''),
    subtotal: num(f.subtotal),
    tax_total: num(f.tax_total),
    discount_total: num(f.discount_total),
    total: num(f.total),
    payment_terms: f.payment_terms == null ? null : Number(f.payment_terms),
    payment_method: (f.payment_method as string | null) ?? null,
    salesperson_id: (f.salesperson_id as string | null) ?? null,
    converted_invoice_id: (f.converted_invoice_id as string | null) ?? null,
    opportunity_id: (f.opportunity_id as string | null) ?? null,
    created_at: String(f.created_at ?? ''),
    updated_at: String(f.updated_at ?? ''),
    customers: f.customer_id
      ? {
          id: String(f.customer_id),
          full_name: String(f.customer_name ?? ''),
          email: (f.customer_email as string | undefined) ?? undefined,
          phone: (f.customer_phone as string | undefined) ?? undefined,
        }
      : null,
  };
}

/** Listado con el estado vivo ('expired' derivado al leer en la zona de la organización). */
export async function listarCotizaciones(ctx: Ctx, filtros: FiltrosCotizacion): Promise<CotizacionResumen[]> {
  const { data, error } = await ctx.supabase.rpc('fn_cotizaciones_listado', {
    p_org: ctx.organizationId,
    p_filtros: Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== undefined && v !== '')),
  });
  if (error) lanzar('fn_cotizaciones_listado', ctx, error);
  return ((data ?? []) as FilaListado[]).map(resumen);
}

/** Detalle: cabecera con el estado vivo, líneas, cliente y número de la factura convertida. 404 si no es de la sesión. */
export async function detalleCotizacion(ctx: Ctx, id: string): Promise<CotizacionDetalle> {
  const { data, error } = await ctx.supabase.rpc('fn_cotizaciones_listado', { p_org: ctx.organizationId, p_filtros: { id } });
  if (error) lanzar('fn_cotizaciones_listado', ctx, error);
  const fila = ((data ?? []) as FilaListado[])[0];
  if (!fila) throw new ErrorCotizacionServidor('cotizacion_no_encontrada');
  const cab = resumen(fila);

  const [extraRes, itemsRes, clienteRes, facturaRes] = await Promise.all([
    ctx.supabase.from('quotations').select('notes, terms_conditions').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle(),
    ctx.supabase
      .from('quotation_items')
      .select('id, product_id, description, qty, unit_price, discount_amount, tax_code, tax_rate, tax_included, total_line, created_at')
      .eq('quotation_id', id)
      .order('created_at', { ascending: true }),
    ctx.supabase
      .from('customers')
      .select('id, full_name, email, phone, address, identification_number, identification_type, avatar_url')
      .eq('id', cab.customer_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle(),
    cab.converted_invoice_id
      ? ctx.supabase.from('invoice_sales').select('number').eq('id', cab.converted_invoice_id).eq('organization_id', ctx.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const extra = (extraRes.data ?? {}) as { notes?: string | null; terms_conditions?: string | null };
  const items: LineaCotizacionDetalle[] = ((itemsRes.data ?? []) as Record<string, unknown>[]).map((i) => ({
    id: String(i.id),
    product_id: i.product_id == null ? null : Number(i.product_id),
    description: String(i.description ?? ''),
    qty: num(i.qty),
    unit_price: num(i.unit_price),
    discount_amount: num(i.discount_amount),
    tax_code: (i.tax_code as string | null) ?? null,
    tax_rate: num(i.tax_rate),
    tax_included: i.tax_included === true,
    total_line: num(i.total_line),
  }));
  return {
    ...cab,
    notes: extra.notes ?? null,
    terms_conditions: extra.terms_conditions ?? null,
    tax_included: items.some((i) => i.tax_included),
    converted_invoice_number: ((facturaRes as { data: { number?: string | null } | null }).data?.number as string | undefined) ?? null,
    customers: (clienteRes.data as CotizacionDetalle['customers']) ?? cab.customers,
    quotation_items: items,
  };
}

// ─── Escritura ──────────────────────────────────────────────────────────────

/**
 * Crea (`id` null) o edita (solo draft/sent) una cotización en una transacción.
 * Las líneas sin tarifa toman la del documento, la del producto o la de la
 * organización con el resolver de facturas; la base recalcula total_line y la
 * cabecera y pone el número.
 */
export async function guardarCotizacion(ctx: Ctx, id: string | null, datos: DatosCotizacion): Promise<ResultadoGuardarCotizacion> {
  const incluido = datos.tax_included ?? datos.items.some((i) => i.tax_included === true);
  const aplicados = datos.applied_taxes ?? [];
  const appliedTaxes = Object.fromEntries(aplicados.map((t) => [t.tax_code, true]));
  const appliedTaxTotals = Object.fromEntries(
    aplicados.map((t) => [t.tax_code, { rate: t.tax_rate, base: 0, amount: 0, name: t.tax_code, included: incluido }]),
  );
  const items = await Promise.all(
    datos.items.map(async (it) => {
      const r = await resolveLineTaxWith(ctx.supabase, {
        itemTaxRate: it.tax_rate ?? 0,
        itemTaxCode: it.tax_code ?? null,
        appliedTaxes,
        appliedTaxTotals,
        productId: it.product_id ?? null,
        organizationId: ctx.organizationId,
        taxIncluded: incluido,
        qty: it.qty,
        unitPrice: it.unit_price,
        discountAmount: it.discount_amount ?? 0,
      });
      return {
        product_id: it.product_id ?? null,
        description: it.description,
        qty: it.qty,
        unit_price: it.unit_price,
        discount_amount: it.discount_amount ?? 0,
        tax_code: r.tax_code,
        tax_rate: r.tax_rate,
        tax_included: incluido,
      };
    }),
  );
  const { applied_taxes: _aplicados, ...cabecera } = datos;
  void _aplicados;
  const { data, error } = await ctx.supabase.rpc('fn_cotizacion_guardar', {
    p_org: ctx.organizationId,
    p_id: id,
    p_datos: { ...cabecera, tax_included: incluido, items },
  });
  if (error) lanzar('fn_cotizacion_guardar', ctx, error);
  const r = (data ?? {}) as Record<string, unknown>;
  return { id: String(r.id), numero: String(r.numero ?? ''), total: num(r.total) };
}

export async function cambiarEstadoCotizacion(ctx: Ctx, id: string, estado: 'sent' | 'accepted' | 'rejected'): Promise<{ status: string; sinCambio: boolean }> {
  const { data, error } = await ctx.supabase.rpc('fn_cotizacion_cambiar_estado', { p_org: ctx.organizationId, p_id: id, p_estado: estado });
  if (error) lanzar('fn_cotizacion_cambiar_estado', ctx, error);
  const r = (data ?? {}) as Record<string, unknown>;
  return { status: String(r.status ?? estado), sinCambio: r.sin_cambio === true };
}

export async function eliminarCotizacion(ctx: Ctx, id: string): Promise<void> {
  const { error } = await ctx.supabase.rpc('fn_cotizacion_eliminar', { p_org: ctx.organizationId, p_id: id });
  if (error) lanzar('fn_cotizacion_eliminar', ctx, error);
}

export async function duplicarCotizacion(ctx: Ctx, id: string, validUntil: string | null): Promise<{ id: string; numero: string; validUntil: string | null }> {
  const { data, error } = await ctx.supabase.rpc('fn_cotizacion_duplicar', { p_org: ctx.organizationId, p_id: id, p_valid_until: validUntil });
  if (error) lanzar('fn_cotizacion_duplicar', ctx, error);
  const r = (data ?? {}) as Record<string, unknown>;
  return { id: String(r.id), numero: String(r.numero ?? ''), validUntil: (r.valid_until as string | null) ?? null };
}

/**
 * Convierte en factura BORRADOR por `fn_cotizacion_convertir` (una transacción:
 * venta ligada, impuestos, comisión, quotation_id y la cotización 'converted').
 * Idempotente en la base. Si otro usuario tomó el número propuesto a la vez
 * (numero_duplicado), se propone otro.
 */
export async function convertirCotizacion(
  ctx: Ctx,
  id: string,
  opciones: { branchId?: number | null; opportunityId?: string | null } = {},
): Promise<ResultadoConversion> {
  const { data: cot } = await ctx.supabase
    .from('quotations')
    .select('id, salesperson_id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!cot) throw new ErrorCotizacionServidor('cotizacion_no_encontrada');
  const tasa = await resolverTasaComision(ctx.supabase, ctx.organizationId, (cot as { salesperson_id: string | null }).salesperson_id);

  let ultimo: { message: string } | null = null;
  for (let intento = 0; intento < 3; intento += 1) {
    const numero = await generateInvoiceNumberWithClient(ctx.supabase, ctx.organizationId, 'FACT');
    const { data, error } = await ctx.supabase.rpc('fn_cotizacion_convertir', {
      p_org: ctx.organizationId,
      p_id: id,
      p_numero: numero,
      p_branch: opciones.branchId ?? null,
      p_opportunity: opciones.opportunityId ?? null,
      p_commission_rate: tasa,
    });
    if (!error) {
      const r = (data ?? {}) as Record<string, unknown>;
      return {
        invoiceId: String(r.invoice_id),
        numero: (r.numero as string | null) ?? null,
        yaConvertida: r.ya_convertida === true,
        faltantes: Array.isArray(r.faltantes) ? (r.faltantes as ResultadoConversion['faltantes']) : [],
      };
    }
    ultimo = error;
    if (codigoErrorCotizacion(error.message) !== 'numero_duplicado') break;
  }
  lanzar('fn_cotizacion_convertir', ctx, ultimo ?? { message: 'error_desconocido' });
}

/**
 * Envía la cotización al cliente con el PDF del motor de documentos (tipo
 * 'cotizacion') y, si era un borrador, la marca como enviada. Antes el botón
 * «Email» decía que la había enviado sin enviar nada.
 */
export async function enviarCotizacion(
  ctx: CtxCorreo,
  id: string,
  opciones: { para?: string; mensaje?: string | null; idioma?: string; clave?: string },
): Promise<{ enviado: true; destino: string; adjunto: boolean; status: string }> {
  const cot = await detalleCotizacion(ctx, id);
  const para = opciones.para ?? cot.customers?.email?.trim() ?? '';
  if (!para) throw new ErrorCotizacionServidor('cliente_sin_correo');

  const idioma = await idiomaDelUsuario(ctx, opciones.idioma);
  const t = await traductorFinanzas('documentosVenta', idioma);
  const total = cot.currency ? formatMoneda(cot.total, cot.currency) : String(cot.total);
  const nota = opciones.mensaje?.trim() ?? '';
  const html = [
    `<p>${escaparHtml(t('cotizaciones.correo.saludo', { nombre: cot.customers?.full_name ?? '' }))}</p>`,
    `<p>${escaparHtml(t('cotizaciones.correo.cuerpo', { organizacion: ctx.organizationName, numero: cot.number, total }))}</p>`,
    nota ? `<p>${escaparHtml(nota).replace(/\n/g, '<br>')}</p>` : '',
    `<p>${escaparHtml(t('cotizaciones.correo.despedida', { organizacion: ctx.organizationName }))}</p>`,
  ].join('');

  let adjunto = false;
  try {
    const r = await enviarDocumentoPorCorreo(ctx, {
      tipo: 'cotizacion',
      id,
      para,
      customerId: cot.customer_id || null,
      asunto: t('cotizaciones.correo.asunto', { organizacion: ctx.organizationName, numero: cot.number }),
      html,
      relatedType: 'quotations',
      relatedId: id,
      idioma,
      claveCliente: opciones.clave ?? null,
    });
    adjunto = r.adjunto;
  } catch (err) {
    if (err instanceof ErrorEnvioServidor) {
      throw new ErrorCotizacionServidor(err.codigo === 'error_desconocido' ? 'error_desconocido' : err.codigo);
    }
    throw err;
  }

  // El correo ya salió: un borrador pasa a enviada (si está vencida, sigue como está).
  let status: string = cot.status;
  if (cot.stored_status === 'draft') {
    try {
      status = (await cambiarEstadoCotizacion(ctx, id, 'sent')).status;
    } catch {
      /* se informa el estado que quedó */
    }
  }
  return { enviado: true, destino: para, adjunto, status };
}
