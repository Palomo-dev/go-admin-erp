/**
 * Consignación recibida, vínculo entre organizaciones y documentos compartidos —
 * servicio de servidor. Lee con el cliente de la SESIÓN (RLS por pertenencia) y
 * escribe solo por RPC (`fn_consignacion_*`, `fn_vinculo_*`,
 * `fn_documento_compartido_*`). Nada de asientos, saldos, kardex ni cuentas por
 * pagar escritos aquí:
 * - la venta del producto en consignación es la del POS (`posService`) o la
 *   factura de venta de siempre; el disparador del kardex la asigna a la nota;
 * - en estimatorio, la adquisición es la factura de compra de siempre
 *   (`guardarFacturaCompra`, en BORRADOR para que se complete con el soporte del
 *   consignante); su confirmación crea la CxP por su disparador;
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
  type Contrato,
  type DocumentoPorAceptar,
  type ErrorRecibida,
  type EstadoRecibida,
  type NotaRecibida,
  type ParteContrato,
  type RespuestaRecibidas,
  type SolicitudRecibir,
} from '@/lib/inventario/consignaciones/recibidas';
import { guardarFacturaCompra, ErrorCompraServidor } from '@/lib/services/compras/facturasCompra.server';
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

const SELECT_RECIBIDA = `id, number, supplier_id, branch_id, contract_type, price_mode, remuneration_mode, commission_base, commission_pct,
  owner_obligation_at, risk_terms, billing_terms, status, link_id, external_number, delivered_at,
  memo_account_code, memo_contra_account_code, owner_account_code, remuneration_account_code, cost_account_code,
  suppliers:supplier_id (name),
  consignment_note_lines (id, product_id, qty_delivered, qty_sold, qty_returned, agreed_price, settlement_price, external_display, products:product_id (name)),
  consignment_settlements (id, status, period_from, period_to, sale_total, agreed_total, discount_total, tax_total, commission_amount, owner_amount, payable_amount, purchase_invoice_id, shared_document_id, created_at),
  consignment_allocations (line_id, kind, qty, sale_amount, agreed_amount, settlement_id, absorbed)`;

type FilaRecibida = {
  id: string;
  number: string;
  supplier_id: number;
  branch_id: number;
  contract_type: Exclude<Contrato, 'compra'>;
  price_mode: 'fijo' | 'minimo';
  remuneration_mode: 'porcentaje' | 'precio_liquidacion';
  commission_base: 'precio_pactado' | 'precio_venta';
  commission_pct: number | string;
  owner_obligation_at: 'venta' | 'cobro' | null;
  risk_terms: { devoluciones: ParteContrato; perdidas: ParteContrato; gastos: ParteContrato };
  billing_terms: { factura?: 'consignatario' | 'consignante' };
  status: EstadoRecibida;
  link_id: string | null;
  external_number: string | null;
  delivered_at: string;
  memo_account_code: string | null;
  memo_contra_account_code: string | null;
  owner_account_code: string | null;
  remuneration_account_code: string | null;
  cost_account_code: string | null;
  suppliers: { name: string | null } | null;
  consignment_note_lines: {
    id: string;
    product_id: number;
    qty_delivered: number | string;
    qty_sold: number | string;
    qty_returned: number | string;
    agreed_price: number | string | null;
    settlement_price: number | string | null;
    external_display: { nombre?: string } | null;
    products: { name: string | null } | null;
  }[];
  consignment_settlements: {
    id: string;
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
    purchase_invoice_id: string | null;
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
  }[];
};

export function aNotaRecibida(f: FilaRecibida): NotaRecibida {
  let vendido = 0;
  let unidades = 0;
  const porLinea = new Map<string, { cantidad: number; venta: number; pactado: number }>();
  for (const a of f.consignment_allocations ?? []) {
    if (a.settlement_id || a.absorbed || !a.line_id) continue;
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
    contrato: f.contract_type,
    precioModo: f.price_mode,
    remuneracionModo: f.remuneration_mode,
    baseComision: f.commission_base,
    comisionPct: num(f.commission_pct),
    obligacionDueno: f.owner_obligation_at,
    riesgos: f.risk_terms,
    factura: f.billing_terms?.factura ?? 'consignatario',
    estado: f.status,
    vinculada: Boolean(f.link_id),
    numeroExterno: f.external_number,
    cuentas: {
      orden: f.memo_account_code,
      contra: f.memo_contra_account_code,
      recaudo: f.owner_account_code,
      remuneracion: f.remuneration_account_code,
      costo: f.cost_account_code,
    },
    fecha: f.delivered_at,
    lineas: (f.consignment_note_lines ?? []).map((l) => ({
      id: l.id,
      productoId: l.product_id,
      producto: l.products?.name ?? '',
      productoConsignante: l.external_display?.nombre ?? null,
      recibido: num(l.qty_delivered),
      vendido: num(l.qty_sold),
      devuelto: num(l.qty_returned),
      precioPactado: num(l.agreed_price),
      precioLiquidacion: l.settlement_price == null ? null : num(l.settlement_price),
      sinLiquidar: porLinea.get(l.id) ?? { cantidad: 0, venta: 0, pactado: 0 },
    })),
    liquidaciones: (f.consignment_settlements ?? [])
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
        facturaCompraId: q.purchase_invoice_id,
        compartida: Boolean(q.shared_document_id),
        creada: q.created_at,
      }))
      .sort((a, b) => b.creada.localeCompare(a.creada)),
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
  estado: 'por_facturar' | 'liquidada';
  contrato: Exclude<Contrato, 'compra'>;
  venta: number;
  remuneracion: number;
  dueno: number;
  porPagar: number;
  /** Estimatorio: borrador de la factura de compra por completar con el soporte del consignante. */
  facturaCompraId: string | null;
}

type RespuestaLiquidar = {
  liquidacion_id: string;
  estado: 'por_facturar' | 'liquidada';
  contrato: Exclude<Contrato, 'compra'>;
  venta: number;
  remuneracion: number;
  dueno: number;
  por_pagar: number;
  proveedor_id: number;
  sucursal_id: number;
  numero_nota: string;
  lineas_compra: { product_id: number; qty: number; unit_price: number; cuenta_contable: string }[];
  factura_compra_id?: string | null;
};

/**
 * Liquida al consignante (RPC). Intermediación: queda liquidada (el saldo del
 * dueño está en su auxiliar 281510 y se paga por Dinero de terceros).
 * Estimatorio: crea el BORRADOR de la factura de compra de siempre por lo
 * vendido al precio del dueño y lo liga; se confirma desde Facturas de compra
 * con el soporte del consignante (y ahí puede aplicarse un anticipo a proveedor).
 */
export async function liquidarRecibida(ctx: Ctx, notaId: string, hasta: string | null, clave: string): Promise<ResultadoLiquidarRecibida> {
  const r = await rpc<RespuestaLiquidar>(ctx, 'fn_consignacion_recibida_liquidar', {
    p_nota: notaId,
    p_hasta: hasta,
    p_clave_idempotencia: clave,
    p_organization_id: ctx.organizationId,
  });
  const base = {
    liquidacionId: r.liquidacion_id,
    contrato: r.contrato,
    venta: num(r.venta),
    remuneracion: num(r.remuneracion),
    dueno: num(r.dueno),
    porPagar: num(r.por_pagar),
  };
  if (r.estado === 'liquidada' || r.contrato !== 'estimatorio') {
    return { ...base, estado: r.estado, facturaCompraId: r.factura_compra_id ?? null };
  }
  let facturaId = r.factura_compra_id ?? null;
  if (!facturaId && (r.lineas_compra ?? []).length > 0) {
    try {
      const guardada = await guardarFacturaCompra(ctx, {
        branch_id: r.sucursal_id,
        supplier_id: r.proveedor_id,
        number_ext: `${r.numero_nota}-${r.liquidacion_id.slice(0, 8)}`,
        tax_included: false,
        notes: `Adquisición por estimatorio de la nota ${r.numero_nota}. Completar con la factura o el documento soporte del consignante.`,
        lines: r.lineas_compra.map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price, cuenta_contable: l.cuenta_contable })),
      });
      facturaId = guardada.id;
    } catch (err) {
      if (err instanceof ErrorCompraServidor) throw new ErrorRecibidaServidor('factura_compra_no_creada', err.codigo);
      throw err;
    }
  }
  if (facturaId) {
    await rpc(ctx, 'fn_consignacion_recibida_cerrar_compra', {
      p_liquidacion: r.liquidacion_id,
      p_factura_compra: facturaId,
      p_organization_id: ctx.organizationId,
    });
  }
  return { ...base, estado: 'por_facturar', facturaCompraId: facturaId };
}

/** Reintento del cierre en estimatorio, cuando la factura de compra ya se confirmó. */
export function cerrarCompraRecibida(ctx: Ctx, liquidacionId: string, facturaId: string) {
  return rpc<{ estado: 'por_facturar' | 'liquidada' }>(ctx, 'fn_consignacion_recibida_cerrar_compra', {
    p_liquidacion: liquidacionId,
    p_factura_compra: facturaId,
    p_organization_id: ctx.organizationId,
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
  s: { sucursal_id: number; mapeo: { producto_ref: string; product_id: number; precio?: number | null }[]; cuenta_recaudo?: string | null; clave_idempotencia: string },
) {
  return rpc<{ nota_id: string; numero: string; repetida: boolean }>(ctx, 'fn_consignacion_recibida_aceptar', {
    p_documento: documentoId,
    p_branch: s.sucursal_id,
    p_mapeo: s.mapeo,
    p_cuenta_recaudo: s.cuenta_recaudo ?? null,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
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
