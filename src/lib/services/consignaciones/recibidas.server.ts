/**
 * Consignación recibida, vínculo entre organizaciones y documentos compartidos —
 * servicio de servidor. Lee con el cliente de la SESIÓN (RLS por pertenencia) y
 * escribe solo por RPC (`fn_consignacion_*`, `fn_vinculo_*`,
 * `fn_documento_compartido_*`). Nada de asientos, saldos, kardex ni cuentas por
 * pagar escritos aquí:
 * - la venta del producto en consignación es la del POS (`posService`) o la
 *   factura de venta de siempre; el disparador del kardex la asigna a la nota;
 * - nunca se fabrica una compra ni un documento soporte para pagarle al dueño: su
 *   saldo está en el auxiliar 281510 y un anticipo se cruza con esa obligación;
 * - la liquidación que le llega al consignante pasa por `liquidarConsignacion`
 *   (la misma «Facturar y cerrar» de la entregada).
 *
 * Sin las migraciones 20261108120500 y 20261108121000: lecturas `pendiente: true`,
 * escrituras 501. Si una RPC se bloquea por configuración contable, se deja el
 * pendiente contable visible (`fn_consignacion_registrar_pendiente`).
 */
import { NextResponse } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  ERRORES_DE_CONFIGURACION,
  codigoErrorRecibida,
  esPendienteRecibida,
  estadoHttpErrorRecibida,
  type AmbitoRetencion,
  type ClaseRetencion,
  type CondicionContable,
  type Contrato,
  type DocumentoPorAceptar,
  type ErrorRecibida,
  type EstadoRecibida,
  type NotaRecibida,
  type ParteContrato,
  type Reconocimiento,
  type ReglasRetencionConsignacion,
  type RespuestaRecibidas,
  type RetencionLiquidacion,
  type SolicitudRecibir,
  type SolicitudRetencionPracticada,
  type Valoracion,
} from '@/lib/inventario/consignaciones/recibidas';
import { liquidarConsignacion, type ResultadoLiquidar } from '@/lib/services/consignaciones/consignaciones.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export class ErrorRecibidaServidor extends Error {
  constructor(
    public readonly codigo: ErrorRecibida,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

export function respuestaErrorRecibida(codigo: ErrorRecibida, detalle: unknown = null): NextResponse {
  return NextResponse.json({ error: codigo, codigo, detalle }, { status: estadoHttpErrorRecibida(codigo), headers: SIN_CACHE });
}

/** Llama una RPC y traduce su error. Un bloqueo por configuración deja el pendiente contable. */
async function rpc<T>(ctx: Ctx, fn: string, args: Record<string, unknown>, referencia?: string): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(fn, args);
  if (!error) return data as T;
  if (esPendienteRecibida(error)) throw new ErrorRecibidaServidor('pendiente_de_activar');
  const codigo = codigoErrorRecibida(error.message);
  if (codigo === 'error_desconocido') console.error(`[consignaciones-recibidas] ${fn}`, { organizationId: ctx.organizationId, message: error.message });
  if (ERRORES_DE_CONFIGURACION.includes(codigo)) {
    const { error: e2 } = await ctx.supabase.rpc('fn_consignacion_registrar_pendiente', {
      p_organization_id: ctx.organizationId,
      p_codigo: codigo,
      p_referencia: referencia ?? null,
    });
    if (e2) console.warn('[consignaciones-recibidas] no se pudo registrar el pendiente contable', { codigo, message: e2.message });
  }
  return Promise.reject(new ErrorRecibidaServidor(codigo, (error as { hint?: unknown }).hint ?? null));
}

const num = (v: unknown) => Number(v ?? 0) || 0;

const SELECT_RECIBIDA = `id, number, supplier_id, branch_id, legal_modality, accounting_role, tax_treatment, memo_valuation, price_mode, remuneration_mode,
  commission_base, commission_pct, remuneration_recognition, post_sale_obligation, fee_invoice_required, owner_obligation_at, risk_terms, status, link_id,
  external_number, delivered_at, memo_account_code, memo_contra_account_code, owner_account_code, remuneration_account_code,
  suppliers:supplier_id (name),
  consignment_note_lines (id, product_id, qty_delivered, qty_sold, qty_returned, qty_incident, agreed_price, settlement_price, credited_cost, memo_unit_value, external_display, products:product_id (name)),
  consignment_settlements (id, seq, status, period_from, period_to, sale_total, agreed_total, discount_total, tax_total, commission_amount, owner_amount, payable_amount, rights_discounted, shared_document_id, created_at,
    consignment_settlement_withholdings (id, scope, class, payer, payer_group, base, rate, amount, status, reason, practiced_amount, practiced_base, practiced_at, practiced_support, reconciled_amount, reconciled_support, reconciled_at)),
  consignment_allocations (line_id, kind, qty, sale_amount, agreed_amount, remuneration_amount, remuneration_recognized, settlement_id, absorbed, owner_right)`;

type FilaRecibida = {
  id: string;
  number: string;
  supplier_id: number;
  branch_id: number;
  legal_modality: Exclude<Contrato, 'compra'>;
  accounting_role: CondicionContable;
  tax_treatment: 'mandato' | 'estimatorio_438_455';
  memo_valuation: Valoracion;
  price_mode: 'fijo' | 'minimo';
  remuneration_mode: 'porcentaje' | 'precio_liquidacion';
  commission_base: 'precio_pactado' | 'precio_venta';
  commission_pct: number | string;
  remuneration_recognition: Reconocimiento;
  post_sale_obligation: string | null;
  fee_invoice_required: boolean;
  owner_obligation_at: 'venta' | 'cobro' | null;
  risk_terms: { devoluciones: ParteContrato; perdidas: ParteContrato; gastos: ParteContrato };
  status: EstadoRecibida;
  link_id: string | null;
  external_number: string | null;
  delivered_at: string;
  memo_account_code: string | null;
  memo_contra_account_code: string | null;
  owner_account_code: string | null;
  remuneration_account_code: string | null;
  suppliers: { name: string | null } | null;
  consignment_note_lines: {
    id: string;
    product_id: number;
    qty_delivered: number | string;
    qty_sold: number | string;
    qty_returned: number | string;
    qty_incident: number | string;
    agreed_price: number | string | null;
    settlement_price: number | string | null;
    credited_cost: number | string | null;
    memo_unit_value: number | string;
    external_display: { nombre?: string } | null;
    products: { name: string | null } | null;
  }[];
  consignment_settlements: {
    id: string;
    seq: number | string;
    status: 'por_facturar' | 'liquidada' | 'anulada';
    period_from: string | null;
    period_to: string | null;
    sale_total: number | string;
    agreed_total: number | string;
    discount_total: number | string;
    tax_total: number | string;
    commission_amount: number | string;
    owner_amount: number | string;
    payable_amount: number | string;
    rights_discounted: number | string;
    consignment_settlement_withholdings: FilaRetencion[] | null;
    shared_document_id: string | null;
    created_at: string;
  }[];
  consignment_allocations: {
    line_id: string | null;
    kind: 'venta' | 'reverso';
    qty: number | string;
    sale_amount: number | string;
    agreed_amount: number | string;
    settlement_id: string | null;
    absorbed: boolean;
    owner_right: boolean;
    remuneration_amount: number | string;
    remuneration_recognized: boolean;
  }[];
};

type FilaRetencion = {
  id: string;
  scope: AmbitoRetencion;
  class: ClaseRetencion;
  payer: RetencionLiquidacion['pagador'];
  payer_group: RetencionLiquidacion['grupo'];
  base: number | string | null;
  rate: number | string | null;
  amount: number | string | null;
  status: RetencionLiquidacion['estado'];
  reason: string | null;
  practiced_amount?: number | string | null;
  practiced_base?: number | string | null;
  practiced_at?: string | null;
  practiced_support?: string | null;
  reconciled_amount: number | string | null;
  reconciled_support: string | null;
  reconciled_at: string | null;
};

const numONulo = (v: unknown) => (v == null ? null : num(v));

export const aRetencion = (r: FilaRetencion): RetencionLiquidacion => ({
  id: r.id,
  ambito: r.scope,
  clase: r.class,
  pagador: r.payer,
  grupo: r.payer_group,
  base: numONulo(r.base),
  tarifa: numONulo(r.rate),
  valor: numONulo(r.amount),
  estado: r.status,
  motivo: r.reason,
  practicada: r.practiced_at
    ? { valor: num(r.practiced_amount), base: numONulo(r.practiced_base), fecha: r.practiced_at, soporte: r.practiced_support ?? '' }
    : null,
  conciliado: r.reconciled_at ? { valor: num(r.reconciled_amount), soporte: r.reconciled_support ?? '', fecha: r.reconciled_at } : null,
});

export function aNotaRecibida(f: FilaRecibida): NotaRecibida {
  let vendido = 0;
  let unidades = 0;
  let derechos = 0;
  let porReconocer = 0;
  const porDevengarLiq = new Map<string, number>();
  for (const a of f.consignment_allocations ?? []) {
    if (a.absorbed || !a.line_id || a.remuneration_recognized) continue;
    const r = (a.kind === 'venta' ? 1 : -1) * num(a.remuneration_amount);
    porReconocer += r;
    if (a.settlement_id) porDevengarLiq.set(a.settlement_id, (porDevengarLiq.get(a.settlement_id) ?? 0) + r);
  }
  const porLinea = new Map<string, { cantidad: number; venta: number; pactado: number }>();
  for (const a of f.consignment_allocations ?? []) {
    if (a.settlement_id || a.absorbed || !a.line_id) continue;
    // Derecho frente al dueño: no entra a la siguiente liquidación sin acuerdo.
    if (a.owner_right) {
      derechos += num(a.sale_amount);
      continue;
    }
    const signo = a.kind === 'venta' ? 1 : -1;
    vendido += signo * num(a.agreed_amount);
    unidades += signo * num(a.qty);
    const acc = porLinea.get(a.line_id) ?? { cantidad: 0, venta: 0, pactado: 0 };
    acc.cantidad += signo * num(a.qty);
    acc.venta += signo * num(a.sale_amount);
    acc.pactado += signo * num(a.agreed_amount);
    porLinea.set(a.line_id, acc);
  }
  return {
    id: f.id,
    numero: f.number,
    proveedorId: f.supplier_id,
    consignante: f.suppliers?.name ?? '',
    sucursalId: f.branch_id,
    contrato: f.legal_modality,
    condicion: f.accounting_role,
    tributario: f.tax_treatment,
    valoracion: f.memo_valuation,
    precioModo: f.price_mode,
    remuneracionModo: f.remuneration_mode,
    baseComision: f.commission_base,
    comisionPct: num(f.commission_pct),
    reconocimiento: f.remuneration_recognition,
    obligacionPosterior: f.post_sale_obligation,
    remuneracionPorReconocer: Math.round(porReconocer * 100) / 100,
    facturaRemuneracion: Boolean(f.fee_invoice_required),
    obligacionDueno: f.owner_obligation_at,
    riesgos: f.risk_terms,
    estado: f.status,
    vinculada: Boolean(f.link_id),
    numeroExterno: f.external_number,
    cuentas: {
      orden: f.memo_account_code,
      contra: f.memo_contra_account_code,
      recaudo: f.owner_account_code,
      remuneracion: f.remuneration_account_code,
    },
    derechosFrenteAlDueno: Math.round(derechos * 100) / 100,
    fecha: f.delivered_at,
    lineas: (f.consignment_note_lines ?? []).map((l) => ({
      id: l.id,
      productoId: l.product_id,
      producto: l.products?.name ?? '',
      productoConsignante: l.external_display?.nombre ?? null,
      recibido: num(l.qty_delivered),
      vendido: num(l.qty_sold),
      devuelto: num(l.qty_returned),
      novedades: num(l.qty_incident),
      precioPactado: num(l.agreed_price),
      precioLiquidacion: l.settlement_price == null ? null : num(l.settlement_price),
      costoAcreditado: l.credited_cost == null ? null : num(l.credited_cost),
      valorCustodia: num(l.memo_unit_value),
      sinLiquidar: porLinea.get(l.id) ?? { cantidad: 0, venta: 0, pactado: 0 },
    })),
    // La más reciente primero, por orden de creación (created_at empata dentro de una transacción).
    liquidaciones: [...(f.consignment_settlements ?? [])]
      .sort((a, b) => num(b.seq) - num(a.seq))
      .map((q) => ({
        id: q.id,
        estado: q.status,
        desde: q.period_from,
        hasta: q.period_to,
        venta: num(q.sale_total),
        pactado: num(q.agreed_total),
        descuentos: num(q.discount_total),
        iva: num(q.tax_total),
        remuneracion: num(q.commission_amount),
        dueno: num(q.owner_amount),
        porPagar: num(q.payable_amount),
        derechosDescontados: num(q.rights_discounted),
        remuneracionPorDevengar: Math.round((porDevengarLiq.get(q.id) ?? 0) * 100) / 100,
        retenciones: (q.consignment_settlement_withholdings ?? []).map(aRetencion),
        compartida: Boolean(q.shared_document_id),
        creada: q.created_at,
      })),
    vendidoSinLiquidar: Math.round(vendido * 100) / 100,
    unidadesSinLiquidar: Math.round(unidades * 1000) / 1000,
  };
}

type FilaDocumento = {
  id: string;
  kind: DocumentoPorAceptar['tipo'];
  from_org_id: number;
  payload: Record<string, unknown>;
  created_at: string;
  organization_links: { inviter_org_id: number; inviter_display: { nombre?: string; nit?: string } | null; invitee_display: { nombre?: string; nit?: string } | null } | null;
};

function aDocumento(d: FilaDocumento): DocumentoPorAceptar {
  const l = d.organization_links;
  const de = l ? (l.inviter_org_id === d.from_org_id ? l.inviter_display : l.invitee_display) : null;
  const numero = (d.payload?.numero ?? d.payload?.nota ?? null) as string | null;
  return { id: d.id, tipo: d.kind, de: { nombre: de?.nombre ?? null, nit: de?.nit ?? null }, numero, fecha: d.created_at, payload: d.payload ?? {} };
}

export async function listarRecibidas(ctx: Ctx): Promise<RespuestaRecibidas> {
  const { data, error } = await ctx.supabase
    .from('consignment_notes')
    .select(SELECT_RECIBIDA)
    .eq('organization_id', ctx.organizationId)
    .eq('direction', 'recibida')
    .order('delivered_at', { ascending: false })
    .limit(500);
  if (error) {
    if (esPendienteRecibida(error)) return { pendiente: true, notas: [], porAceptar: [] };
    throw new ErrorRecibidaServidor(codigoErrorRecibida(error.message));
  }
  const docs = await listarPorAceptar(ctx);
  return { pendiente: false, notas: ((data ?? []) as unknown as FilaRecibida[]).map(aNotaRecibida), porAceptar: docs };
}

export async function listarPorAceptar(ctx: Ctx): Promise<DocumentoPorAceptar[]> {
  const { data, error } = await ctx.supabase
    .from('organization_shared_documents')
    .select('id, kind, from_org_id, payload, created_at, organization_links:link_id (inviter_org_id, inviter_display, invitee_display)')
    .eq('to_org_id', ctx.organizationId)
    .eq('status', 'enviado')
    .in('kind', ['consignacion_nota', 'consignacion_liquidacion', 'consignacion_devolucion'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    if (esPendienteRecibida(error)) return [];
    throw new ErrorRecibidaServidor(codigoErrorRecibida(error.message));
  }
  return ((data ?? []) as unknown as FilaDocumento[]).map(aDocumento);
}

export async function documentoPorAceptar(ctx: Ctx, id: string): Promise<DocumentoPorAceptar & { estado: string }> {
  const { data, error } = await ctx.supabase
    .from('organization_shared_documents')
    .select('id, kind, from_org_id, payload, created_at, status, organization_links:link_id (inviter_org_id, inviter_display, invitee_display)')
    .eq('to_org_id', ctx.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (esPendienteRecibida(error)) throw new ErrorRecibidaServidor('pendiente_de_activar');
    throw new ErrorRecibidaServidor(codigoErrorRecibida(error.message));
  }
  if (!data) throw new ErrorRecibidaServidor('documento_no_encontrado');
  const fila = data as unknown as FilaDocumento & { status: string };
  return { ...aDocumento(fila), estado: fila.status };
}

export async function detalleRecibida(ctx: Ctx, id: string): Promise<{ pendiente: boolean; nota: NotaRecibida | null }> {
  const { data, error } = await ctx.supabase
    .from('consignment_notes')
    .select(SELECT_RECIBIDA)
    .eq('organization_id', ctx.organizationId)
    .eq('direction', 'recibida')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (esPendienteRecibida(error)) return { pendiente: true, nota: null };
    throw new ErrorRecibidaServidor(codigoErrorRecibida(error.message));
  }
  if (!data) throw new ErrorRecibidaServidor('nota_no_encontrada');
  return { pendiente: false, nota: aNotaRecibida(data as unknown as FilaRecibida) };
}

export function recibir(ctx: Ctx, s: SolicitudRecibir): Promise<{ nota_id: string; numero: string; repetida: boolean; pactado: number }> {
  return rpc(ctx, 'fn_consignacion_recibir', {
    p_proveedor: s.proveedor_id,
    p_branch: s.sucursal_id,
    p_lineas: s.lineas,
    p_comision: s.comision,
    p_terminos: s.terminos,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_notas: s.notas ?? null,
  });
}

export function devolver(ctx: Ctx, notaId: string, lineas: { linea_id: string; qty: number }[], clave: string, notas: string | null) {
  return rpc<{ devolucion_id: string; total: number; repetida: boolean }>(ctx, 'fn_consignacion_recibida_devolver', {
    p_nota: notaId,
    p_lineas: lineas,
    p_clave_idempotencia: clave,
    p_organization_id: ctx.organizationId,
    p_notas: notas,
  });
}

export interface ResultadoLiquidarRecibida {
  liquidacionId: string;
  estado: 'liquidada';
  contrato: Exclude<Contrato, 'compra'>;
  venta: number;
  remuneracion: number;
  dueno: number;
  porPagar: number;
  derechosDescontados: number;
  remuneracionPorDevengar: number;
  retenciones: RetencionLiquidacion[];
  /** La remuneración se factura aparte: la liquidación no sustituye esa factura (queda el pendiente). */
  facturaRemuneracion: boolean;
  /** Ronda 6 (respuesta 12): lo recaudado aplicado en el orden del contrato; null fuera del mandato recibido. */
  aplicacion: AplicacionRecaudo | null;
  /** Ronda 6 (respuesta 13): plazo de la entrega por escrito (desde el corte del período, salvo pacto distinto). */
  entregaEscrita: EntregaEscritaLiquidacion | null;
}

/** Ronda 6: un concepto del orden de aplicación con lo que tomó de lo recaudado. */
export interface ConceptoAplicado {
  concepto: 'remuneracion' | 'gastos_reembolsables' | 'anticipos' | 'derechos_frente_al_dueno';
  monto: number;
  aplicado: number;
  porCobrarAlDueno: number | null;
  enEspera: number | null;
  motivo: string | null;
}

export interface AplicacionRecaudo {
  recaudado: number;
  conceptos: ConceptoAplicado[];
  remuneracionPorCobrarAlDueno: number;
  saldoParaElDueno: number;
  compensacionPactada: boolean;
}

export interface EntregaEscritaLiquidacion {
  medio: string;
  plazoDias: number;
  plazoDesde: 'corte_del_periodo' | 'fecha_de_liquidacion';
  cuentaDesde: string;
  vence: string;
  estado: 'por_entregar' | 'vencida';
}

type RespuestaAplicacion = {
  recaudado: number;
  conceptos: { concepto: ConceptoAplicado['concepto']; monto: number; aplicado: number; por_cobrar_al_dueno?: number | null; en_espera?: number | null;
               motivo?: string | null }[];
  remuneracion_por_cobrar_al_dueno: number;
  saldo_para_el_dueno: number;
  compensacion_pactada: boolean;
};

type RespuestaEntregaEscrita = {
  medio: string;
  plazo_dias: number;
  plazo_desde: EntregaEscritaLiquidacion['plazoDesde'];
  cuenta_desde: string;
  vence: string;
  estado: EntregaEscritaLiquidacion['estado'];
};

function aplicacionDeRespuesta(a: RespuestaAplicacion | null | undefined): AplicacionRecaudo | null {
  if (!a) return null;
  return {
    recaudado: num(a.recaudado),
    conceptos: (a.conceptos ?? []).map((c) => ({
      concepto: c.concepto,
      monto: num(c.monto),
      aplicado: num(c.aplicado),
      porCobrarAlDueno: numONulo(c.por_cobrar_al_dueno ?? null),
      enEspera: numONulo(c.en_espera ?? null),
      motivo: c.motivo ?? null,
    })),
    remuneracionPorCobrarAlDueno: num(a.remuneracion_por_cobrar_al_dueno),
    saldoParaElDueno: num(a.saldo_para_el_dueno),
    compensacionPactada: Boolean(a.compensacion_pactada),
  };
}

function entregaDeRespuesta(e: RespuestaEntregaEscrita | null | undefined): EntregaEscritaLiquidacion | null {
  if (!e) return null;
  return { medio: e.medio, plazoDias: num(e.plazo_dias), plazoDesde: e.plazo_desde, cuentaDesde: e.cuenta_desde, vence: e.vence, estado: e.estado };
}

type RespuestaLiquidar = {
  liquidacion_id: string;
  contrato: Exclude<Contrato, 'compra'>;
  venta: number;
  remuneracion: number;
  dueno: number;
  por_pagar: number;
  derechos_descontados: number;
  factura_remuneracion: boolean;
  remuneracion_por_devengar: number;
  retenciones: { id: string; ambito: AmbitoRetencion; clase: ClaseRetencion; pagador: RetencionLiquidacion['pagador']; grupo: RetencionLiquidacion['grupo'];
                 base: number | null; tarifa: number | null; valor: number | null; estado: RetencionLiquidacion['estado']; motivo: string | null }[];
  aplicacion?: RespuestaAplicacion | null;
  entrega_escrita?: RespuestaEntregaEscrita | null;
};

/**
 * Liquida al consignante (RPC). Queda liquidada: el saldo del dueño está en su
 * auxiliar 281510 y se paga por Dinero de terceros. Nunca se crea una compra ni
 * un documento soporte para pagarle (Ronda 2 del Contador). Los derechos frente
 * al dueño solo se descuentan con `descontar_derechos` y el acuerdo escrito.
 */
export async function liquidarRecibida(
  ctx: Ctx,
  notaId: string,
  s: { hasta?: string | null; descontar_derechos?: boolean; acuerdo?: string | null; clave_idempotencia: string },
): Promise<ResultadoLiquidarRecibida> {
  const r = await rpc<RespuestaLiquidar>(ctx, 'fn_consignacion_recibida_liquidar', {
    p_nota: notaId,
    p_hasta: s.hasta ?? null,
    p_descontar_derechos: Boolean(s.descontar_derechos),
    p_acuerdo: s.descontar_derechos ? (s.acuerdo ?? null) : null,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
  });
  return {
    liquidacionId: r.liquidacion_id,
    estado: 'liquidada',
    contrato: r.contrato,
    venta: num(r.venta),
    remuneracion: num(r.remuneracion),
    dueno: num(r.dueno),
    porPagar: num(r.por_pagar),
    derechosDescontados: num(r.derechos_descontados),
    remuneracionPorDevengar: num(r.remuneracion_por_devengar),
    retenciones: (r.retenciones ?? []).map((x) => ({ ...x, base: numONulo(x.base), tarifa: numONulo(x.tarifa), valor: numONulo(x.valor), conciliado: null })),
    facturaRemuneracion: Boolean(r.factura_remuneracion),
    aplicacion: aplicacionDeRespuesta(r.aplicacion),
    entregaEscrita: entregaDeRespuesta(r.entrega_escrita),
  };
}

/**
 * Ronda 6 (respuesta 13): constancia de la entrega de la liquidación por escrito al dueño (fecha, medio pactado y
 * soporte). Cierra el pendiente «por entregar» y, si había vencido, deja escrito que se entregó fuera de plazo
 * (`fn_consignacion_liquidacion_entrega_registrar`).
 */
export function registrarEntregaEscrita(ctx: Ctx, liquidacionId: string, s: { fecha: string; medio: string; soporte: string }) {
  return rpc<{ liquidacion_id: string; repetida: boolean; entregada_el: string; medio: string; vence: string; fuera_de_plazo: boolean }>(
    ctx,
    'fn_consignacion_liquidacion_entrega_registrar',
    { p_liquidacion: liquidacionId, p_fecha: s.fecha, p_medio: s.medio, p_soporte: s.soporte, p_organization_id: ctx.organizationId },
  );
}

/** Reconocer la remuneración al cumplirse la obligación posterior del contrato, con evidencia. */
export function reconocerRemuneracion(ctx: Ctx, notaId: string, s: { evidencia: string; clave_idempotencia: string }) {
  return rpc<{ reconocimiento_id: string; repetida: boolean; monto: number }>(ctx, 'fn_consignacion_reconocer_remuneracion', {
    p_nota: notaId,
    p_evidencia: s.evidencia,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
  });
}

/** Conciliar una retención con su soporte (valor que consta en el certificado). */
export function conciliarRetencion(ctx: Ctx, retencionId: string, s: { valor: number; soporte: string }) {
  return rpc<{ retencion_id: string; repetida: boolean; valor: number }>(ctx, 'fn_consignacion_conciliar_retencion', {
    p_retencion: retencionId,
    p_valor: s.valor,
    p_soporte: s.soporte,
    p_organization_id: ctx.organizationId,
  });
}

/**
 * Ronda 4, punto 4: reconoce la retención PRACTICADA cuando ocurre (no espera el certificado). De la operación: el
 * dueño la asume contra 281510 y la cartera del cliente queda con un pendiente de abono; de la remuneración: retención
 * sufrida contra la cuenta por cobrar al dueño (`fn_consignacion_retencion_practicada`). Ronda 5: la de la operación va
 * con el cobro de la factura (`p_pago`) y su abono a la factura queda en ese momento, sin superar el saldo de la factura.
 */
export function registrarRetencionPracticada(ctx: Ctx, retencionId: string, s: SolicitudRetencionPracticada) {
  return rpc<{
    retencion_id: string;
    repetida?: boolean;
    valor: number;
    cobro_id?: string | null;
    /** Ronda 6: con 20261110100000 el abono nace «aplicada» y el saldo de la factura ya lo cuenta (como un pago). */
    abono_factura?: {
      factura_id: string;
      valor: number;
      estado: 'por_aplicar' | 'aplicada';
      saldo_factura_antes?: number;
      saldo_factura: number;
      saldo_real_exigible: number;
    } | null;
    certificado?: 'pendiente_de_soporte';
  }>(ctx, 'fn_consignacion_retencion_practicada', {
    p_retencion: retencionId,
    p_valor: s.valor,
    p_base: s.base,
    p_fecha: s.fecha,
    p_soporte: s.soporte,
    p_organization_id: ctx.organizationId,
    p_factura: s.factura_id ?? null,
    p_pago: s.cobro_id ?? null,
  });
}

/** Reglas de retención de consignación y las reglas configuradas de la organización entre las que se elige. */
export async function leerRetencionesConsignacion(ctx: Ctx): Promise<{
  pendiente: boolean;
  reglas: ReglasRetencionConsignacion;
  disponibles: { id: string; nombre: string; tarifa: number; clase: ClaseRetencion | null }[];
}> {
  const vacio: ReglasRetencionConsignacion = { operacion: {}, remuneracion: {} };
  const { data, error } = await ctx.supabase
    .from('consignment_account_settings')
    .select('withholding_rules')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) {
    if (esPendienteRecibida(error)) return { pendiente: true, reglas: vacio, disponibles: [] };
    throw new ErrorRecibidaServidor(codigoErrorRecibida(error.message));
  }
  const { data: conf, error: e2 } = await ctx.supabase.rpc('fn_retenciones_configuracion', { p_organization_id: ctx.organizationId });
  if (e2) throw new ErrorRecibidaServidor(codigoErrorRecibida(e2.message));
  // Ronda 4: la de reteICA es la regla MUNICIPAL registrada (reteica_reglas, la de anticipos), no un impuesto de la
  // organización; renta e IVA siguen saliendo de las retenciones configuradas.
  const filas: { id: string; nombre: string; tarifa: number; clase: ClaseRetencion | null }[] = (
    (conf as { retenciones?: { id: string; nombre: string; tarifa: number | string; activo: boolean; clase: string | null }[] } | null)?.retenciones ?? []
  )
    .filter((r) => r.activo && r.clase !== 'reteica')
    .map((r) => ({
      id: r.id,
      nombre: r.nombre,
      tarifa: num(r.tarifa),
      clase: (['retefuente', 'reteiva'] as const).find((c) => c === r.clase) ?? null,
    }));
  const { data: ica, error: e3 } = await ctx.supabase
    .from('reteica_reglas')
    .select('id, actividad, tarifa_por_mil, municipalities:municipality_id (name)')
    .eq('organization_id', ctx.organizationId)
    .order('vigente_desde', { ascending: false });
  if (e3 && !esPendienteRecibida(e3)) throw new ErrorRecibidaServidor(codigoErrorRecibida(e3.message));
  for (const r of (e3 ? [] : (ica ?? [])) as unknown as { id: string; actividad: string; tarifa_por_mil: number | string; municipalities: { name: string } | null }[]) {
    // tarifa en porcentaje, como las demás (9,66 ‰ = 0,966 %).
    filas.push({ id: r.id, nombre: `${r.municipalities?.name ?? ''} · ${r.actividad}`, tarifa: num(r.tarifa_por_mil) / 10, clase: 'reteica' });
  }
  const reglas = ((data as { withholding_rules?: ReglasRetencionConsignacion } | null)?.withholding_rules ?? vacio) as ReglasRetencionConsignacion;
  return { pendiente: false, reglas: { operacion: reglas.operacion ?? {}, remuneracion: reglas.remuneracion ?? {} }, disponibles: filas };
}

export function configurarRetencionesConsignacion(ctx: Ctx, reglas: ReglasRetencionConsignacion) {
  return rpc<ReglasRetencionConsignacion>(ctx, 'fn_consignacion_configurar_retenciones', {
    p_organization_id: ctx.organizationId,
    p_reglas: reglas,
  });
}

/** Faltante o daño (evidencia, responsable, obligación). Sin gasto ni cuenta por pagar automáticos. */
export function registrarNovedad(
  ctx: Ctx,
  notaId: string,
  s: { linea_id: string; tipo: 'faltante' | 'dano'; cantidad: number; responsable: string; evidencia: string; obligacion?: string | null; clave_idempotencia: string },
) {
  return rpc<{ novedad_id: string; repetida: boolean; custodia: number }>(ctx, 'fn_consignacion_registrar_novedad', {
    p_nota: notaId,
    p_linea: s.linea_id,
    p_tipo: s.tipo,
    p_cantidad: s.cantidad,
    p_responsable: s.responsable,
    p_evidencia: s.evidencia,
    p_obligacion: s.obligacion ?? null,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
  });
}

/** Anticipos vigentes del consignante (los de anticipos a proveedores) para cruzarlos con la obligación del mandato. */
export async function anticiposDelConsignante(ctx: Ctx, proveedorId: number): Promise<{ id: string; saldo: number; cuenta: string; creado: string }[]> {
  const { data, error } = await ctx.supabase
    .from('supplier_advances')
    .select('id, balance, account_code, created_at')
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', proveedorId)
    .eq('status', 'active')
    .gt('balance', 0)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw new ErrorRecibidaServidor(codigoErrorRecibida(error.message));
  return ((data ?? []) as { id: string; balance: number | string; account_code: string; created_at: string }[]).map((a) => ({
    id: a.id,
    saldo: num(a.balance),
    cuenta: a.account_code,
    creado: a.created_at,
  }));
}

export function cruzarAnticipo(ctx: Ctx, notaId: string, s: { anticipo_id: string; monto: number; clave_idempotencia: string }) {
  return rpc<{ cruce_id: string; repetida: boolean; monto: number; saldo_anticipo: number }>(ctx, 'fn_consignacion_cruzar_anticipo', {
    p_nota: notaId,
    p_anticipo: s.anticipo_id,
    p_monto: s.monto,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
  });
}

/** Cuentas de consignación definidas por la organización. */
export async function leerCuentasConsignacion(ctx: Ctx): Promise<{ pendiente: boolean; orden: string | null; contra: string | null; remuneracion: string | null; estimatorioHabilitado: boolean }> {
  const { data, error } = await ctx.supabase
    .from('consignment_account_settings')
    .select('memo_account_code, memo_contra_account_code, remuneration_account_code, estimatorio_rules_approved_at')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) {
    if (esPendienteRecibida(error)) return { pendiente: true, orden: null, contra: null, remuneracion: null, estimatorioHabilitado: false };
    throw new ErrorRecibidaServidor(codigoErrorRecibida(error.message));
  }
  const f = data as { memo_account_code: string | null; memo_contra_account_code: string | null; remuneration_account_code: string | null; estimatorio_rules_approved_at: string | null } | null;
  return {
    pendiente: false,
    orden: f?.memo_account_code ?? null,
    contra: f?.memo_contra_account_code ?? null,
    remuneracion: f?.remuneration_account_code ?? null,
    estimatorioHabilitado: Boolean(f?.estimatorio_rules_approved_at),
  };
}

export function configurarCuentasConsignacion(ctx: Ctx, s: { orden?: string | null; contra: string; remuneracion?: string | null }) {
  return rpc<{ orden: string | null; contra: string; remuneracion: string | null }>(ctx, 'fn_consignacion_configurar_cuentas', {
    p_organization_id: ctx.organizationId,
    p_orden: s.orden ?? null,
    p_contra: s.contra,
    p_remuneracion: s.remuneracion ?? null,
  });
}

export function anularLiquidacionRecibida(ctx: Ctx, liquidacionId: string, motivo: string) {
  return rpc<{ estado: 'anulada'; repetida: boolean }>(ctx, 'fn_consignacion_recibida_anular_liquidacion', {
    p_liquidacion: liquidacionId,
    p_motivo: motivo,
    p_organization_id: ctx.organizationId,
  });
}

export function aceptarNota(
  ctx: Ctx,
  documentoId: string,
  s: {
    sucursal_id: number;
    mapeo: { producto_ref: string; product_id: number; precio?: number | null }[];
    cuenta_recaudo?: string | null;
    valoracion: 'costo_acreditado' | 'valor_convenido';
    /** Ronda 5: compensación, orden de aplicación y liquidación por escrito que declara quien recibe en mandato. */
    terminos_contrato?: {
      compensacion_remuneracion: boolean;
      orden_aplicacion: string[];
      liquidacion_escrita: { medio: string; plazo_dias: number };
    } | null;
    clave_idempotencia: string;
  },
) {
  return rpc<{ nota_id: string; numero: string; repetida: boolean }>(ctx, 'fn_consignacion_recibida_aceptar', {
    p_documento: documentoId,
    p_branch: s.sucursal_id,
    p_mapeo: s.mapeo,
    p_cuenta_recaudo: s.cuenta_recaudo ?? null,
    p_valoracion: s.valoracion,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_terminos_contrato: s.terminos_contrato ?? null,
  });
}

export function responderDocumento(ctx: Ctx, documentoId: string, accion: 'rechazar' | 'anular', motivo: string) {
  return rpc<{ estado: string }>(ctx, 'fn_documento_compartido_responder', {
    p_doc: documentoId,
    p_organization_id: ctx.organizationId,
    p_accion: accion,
    p_motivo: motivo,
  });
}

/**
 * El consignante acepta la liquidación (o devolución) que le llegó (R8): la
 * valida contra SU nota y la pasa por el flujo de siempre de la entregada
 * (`liquidarConsignacion`: liquidar + factura de venta + cerrar). No hay una
 * segunda implementación.
 */
export async function aceptarDocumentoRecibido(ctx: Ctx, documentoId: string): Promise<ResultadoLiquidar> {
  const p = await rpc<{
    nota_id: string;
    lineas: { linea_id: string; vendido: number; precio: number; devuelto: number }[];
    diferencias: { tipo: string }[];
  }>(ctx, 'fn_consignacion_documento_recibido_preparar', { p_documento: documentoId, p_organization_id: ctx.organizationId });
  // En mandato, la liquidación del lado del dueño espera al Contador; el estimatorio, a los arts. 438 y 455.
  if (p.diferencias.some((d) => d.tipo === 'mandante_pendiente')) throw new ErrorRecibidaServidor('liquidacion_mandante_pendiente');
  if (p.diferencias.some((d) => d.tipo === 'estimatorio_bloqueado')) throw new ErrorRecibidaServidor('estimatorio_bloqueado_438_455');
  const bloqueante = p.diferencias.find((d) => d.tipo !== 'comision_distinta');
  if (bloqueante) throw new ErrorRecibidaServidor('datos_invalidos', p.diferencias);
  const resultado = await liquidarConsignacion(ctx, p.nota_id, {
    lineas: p.lineas.map((l) => ({ linea_id: l.linea_id, vendido: num(l.vendido), precio: num(l.precio), devuelto: num(l.devuelto) })),
    clave_idempotencia: `doc:${documentoId}`,
  });
  await rpc(ctx, 'fn_consignacion_documento_recibido_cerrar', {
    p_documento: documentoId,
    p_liquidacion: resultado.liquidacionId,
    p_organization_id: ctx.organizationId,
  });
  return resultado;
}

export function prepararDocumentoRecibido(ctx: Ctx, documentoId: string) {
  return rpc<{ nota_id: string; numero_nota: string; comision_pct: number; lineas: unknown[]; diferencias: { tipo: string }[] }>(
    ctx,
    'fn_consignacion_documento_recibido_preparar',
    { p_documento: documentoId, p_organization_id: ctx.organizationId },
  );
}

// ─── Vínculo entre organizaciones ────────────────────────────────────────────

export function invitar(ctx: Ctx, s: { proveedor_id?: number | null; cliente_id?: string | null; correo: string; propositos: string[] }) {
  return rpc<{ vinculo_id: string; token: string; vence: string }>(ctx, 'fn_vinculo_invitar', {
    p_organization_id: ctx.organizationId,
    p_propositos: s.propositos,
    p_proveedor: s.proveedor_id ?? null,
    p_cliente: s.cliente_id ?? null,
    p_correo: s.correo,
    p_dias: 7,
  });
}

export function verInvitacion(ctx: Pick<Ctx, 'supabase' | 'organizationId' | 'userId'>, token: string) {
  return rpc<{ estado: 'pendiente' | 'invalida' | 'vencida'; invita?: { nombre?: string; nit?: string }; vence?: string; creada?: string; organizaciones?: { id: number; nombre: string }[] }>(
    ctx as Ctx,
    'fn_vinculo_invitacion_ver',
    { p_token: token },
  );
}

export function aceptarVinculo(ctx: Ctx, token: string, organizacionId: number, proveedorId: number | null, clienteId: string | null) {
  return rpc<{ vinculo_id: string; estado: 'activo' }>(ctx, 'fn_vinculo_aceptar', {
    p_token: token,
    p_organization_id: organizacionId,
    p_proveedor: proveedorId,
    p_cliente: clienteId,
  });
}

export function rechazarVinculo(ctx: Ctx, token: string, motivo: string | null) {
  return rpc<{ vinculo_id: string; estado: 'rechazado' }>(ctx, 'fn_vinculo_rechazar', { p_token: token, p_motivo: motivo });
}
