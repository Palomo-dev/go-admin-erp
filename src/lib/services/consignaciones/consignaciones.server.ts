/**
 * Consignaciones — servicio de servidor. Lee con el cliente de la SESIÓN (RLS
 * por pertenencia) y escribe solo por RPC:
 * - entregar → `fn_consignacion_entregar`
 * - liquidar → `fn_consignacion_liquidar`, y para lo vendido la factura de venta
 *   de SIEMPRE (`guardarFactura` + `emitirFactura`, las mismas funciones que la
 *   pantalla de facturas; impuestos con el mismo resolver de la cotización) y
 *   `fn_consignacion_cerrar` (comisión como saldo a favor aplicado).
 * Nada de asientos, saldos ni kardex escritos aquí.
 *
 * Sin la migración 20261108121000: lecturas `pendiente: true`, escrituras 501.
 */
import { NextResponse } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  codigoErrorConsignacion,
  esPendienteConsignacion,
  estadoHttpErrorConsignacion,
  type ErrorConsignacion,
  type EstadoNota,
  type NotaConsignacion,
  type RespuestaListadoConsignaciones,
  type SolicitudEntregar,
  type SolicitudLiquidar,
} from '@/lib/finanzas/consignaciones/consignaciones';
import { resolveLineTaxWith } from '@/lib/services/taxResolverCore';
import { emitirFactura, ErrorFacturaServidor, guardarFactura } from '@/lib/services/ventas/facturasVenta.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export class ErrorConsignacionServidor extends Error {
  constructor(
    public readonly codigo: ErrorConsignacion,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

export function respuestaErrorConsignacion(codigo: ErrorConsignacion, detalle: unknown = null): NextResponse {
  return NextResponse.json({ error: codigo, codigo, detalle }, { status: estadoHttpErrorConsignacion(codigo), headers: SIN_CACHE });
}

function errorDeRpc(rpc: string, ctx: Ctx, error: { message: string; code?: string; details?: unknown }): ErrorConsignacionServidor {
  if (esPendienteConsignacion(error)) return new ErrorConsignacionServidor('pendiente_de_activar');
  const codigo = codigoErrorConsignacion(error.message);
  if (codigo === 'error_desconocido') console.error(`[consignaciones] ${rpc}`, { organizationId: ctx.organizationId, message: error.message });
  let detalle: unknown = null;
  if (typeof error.details === 'string' && error.details) {
    try {
      detalle = JSON.parse(error.details);
    } catch {
      detalle = null;
    }
  }
  return new ErrorConsignacionServidor(codigo, detalle);
}

const num = (v: unknown) => Number(v ?? 0) || 0;

const SELECT_NOTA = `id, number, customer_id, branch_id, location, commission_pct, status, total_cost, delivered_at,
  customers:customer_id (full_name),
  consignment_note_lines (id, product_id, qty_delivered, qty_sold, qty_returned, unit_cost, products:product_id (name)),
  consignment_settlements (id, status, sale_total, commission_pct, commission_amount, net_amount, returned_cost, invoice_id, period_from, period_to, created_at,
    invoice_sales:invoice_id (number, balance, status))`;

type FilaNota = {
  id: string;
  number: string;
  customer_id: string;
  branch_id: number;
  location: string | null;
  commission_pct: number | string;
  status: EstadoNota;
  total_cost: number | string;
  delivered_at: string;
  customers: { full_name: string | null } | null;
  consignment_note_lines: {
    id: string;
    product_id: number;
    qty_delivered: number | string;
    qty_sold: number | string;
    qty_returned: number | string;
    unit_cost: number | string;
    products: { name: string | null } | null;
  }[];
  consignment_settlements: {
    id: string;
    status: 'por_facturar' | 'liquidada';
    sale_total: number | string;
    commission_pct: number | string;
    commission_amount: number | string;
    net_amount: number | string;
    returned_cost: number | string;
    invoice_id: string | null;
    period_from: string | null;
    period_to: string | null;
    created_at: string;
    invoice_sales: { number: string | null; balance: number | string | null; status: string | null } | null;
  }[];
};

function aNota(f: FilaNota): NotaConsignacion {
  return {
    id: f.id,
    numero: f.number,
    clienteId: f.customer_id,
    consignatario: f.customers?.full_name ?? '',
    sucursalId: f.branch_id,
    ubicacion: f.location,
    comisionPct: num(f.commission_pct),
    estado: f.status,
    costoTotal: num(f.total_cost),
    fecha: f.delivered_at,
    lineas: (f.consignment_note_lines ?? []).map((l) => ({
      id: l.id,
      productoId: l.product_id,
      producto: l.products?.name ?? '',
      entregado: num(l.qty_delivered),
      vendido: num(l.qty_sold),
      devuelto: num(l.qty_returned),
      costoUnitario: num(l.unit_cost),
    })),
    liquidaciones: (f.consignment_settlements ?? [])
      .map((q) => ({
        id: q.id,
        estado: q.status,
        venta: num(q.sale_total),
        comisionPct: num(q.commission_pct),
        comision: num(q.commission_amount),
        neto: num(q.net_amount),
        costoDevuelto: num(q.returned_cost),
        facturaId: q.invoice_id,
        facturaNumero: q.invoice_sales?.number ?? null,
        facturaSaldo: q.invoice_sales && q.invoice_sales.status !== 'draft' ? num(q.invoice_sales.balance) : null,
        desde: q.period_from,
        hasta: q.period_to,
        creada: q.created_at,
      }))
      .sort((a, b) => b.creada.localeCompare(a.creada)),
  };
}

export async function listarConsignaciones(ctx: Ctx): Promise<RespuestaListadoConsignaciones> {
  const { data, error } = await ctx.supabase
    .from('consignment_notes')
    .select(SELECT_NOTA)
    .eq('organization_id', ctx.organizationId)
    .eq('direction', 'entregada')
    .order('delivered_at', { ascending: false })
    .limit(500);
  if (error) {
    if (esPendienteConsignacion(error)) return { pendiente: true, notas: [] };
    throw errorDeRpc('consignment_notes', ctx, error);
  }
  return { pendiente: false, notas: ((data ?? []) as unknown as FilaNota[]).map(aNota) };
}

export async function detalleConsignacion(ctx: Ctx, id: string): Promise<{ pendiente: boolean; nota: NotaConsignacion | null }> {
  const { data, error } = await ctx.supabase
    .from('consignment_notes')
    .select(SELECT_NOTA)
    .eq('organization_id', ctx.organizationId)
    .eq('direction', 'entregada')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (esPendienteConsignacion(error)) return { pendiente: true, nota: null };
    throw errorDeRpc('consignment_notes', ctx, error);
  }
  if (!data) throw new ErrorConsignacionServidor('nota_no_encontrada');
  return { pendiente: false, nota: aNota(data as unknown as FilaNota) };
}

export async function entregarConsignacion(ctx: Ctx, s: SolicitudEntregar): Promise<{ nota_id: string; numero: string; repetida: boolean; costo: number }> {
  const { data, error } = await ctx.supabase.rpc('fn_consignacion_entregar', {
    p_customer: s.cliente_id,
    p_branch: s.sucursal_id,
    p_lineas: s.lineas,
    p_comision: s.comision,
    p_terminos: s.terminos,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_ubicacion: s.ubicacion ?? null,
    p_notas: s.notas ?? null,
  });
  if (error) throw errorDeRpc('fn_consignacion_entregar', ctx, error);
  return data as { nota_id: string; numero: string; repetida: boolean; costo: number };
}

export interface ResultadoLiquidar {
  liquidacionId: string;
  estado: 'por_facturar' | 'liquidada';
  facturaId: string | null;
  facturaNumero: string | null;
  venta: number;
  comision: number;
  neto: number;
  /** Factura emitida que falta enviar a la DIAN (la pantalla lo pide por la ruta de siempre). */
  enviarDian: boolean;
  /** Si la factura no se pudo emitir: el código, para «Facturar» otra vez. */
  errorFactura: string | null;
}

/**
 * Registra la liquidación (RPC) y, si hubo ventas, factura y cierra. Si la
 * factura falla, la liquidación queda «por facturar» y `errorFactura` lo dice.
 */
export async function liquidarConsignacion(ctx: Ctx, notaId: string, s: SolicitudLiquidar): Promise<ResultadoLiquidar> {
  const { data, error } = await ctx.supabase.rpc('fn_consignacion_liquidar', {
    p_nota: notaId,
    p_lineas: s.lineas,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_desde: s.desde ?? null,
    p_hasta: s.hasta ?? null,
  });
  if (error) throw errorDeRpc('fn_consignacion_liquidar', ctx, error);
  const r = data as { liquidacion_id: string; estado: 'por_facturar' | 'liquidada'; venta: number; comision: number; neto: number; factura_id?: string | null };
  if (r.estado === 'liquidada') {
    return { liquidacionId: r.liquidacion_id, estado: 'liquidada', facturaId: null, facturaNumero: null, venta: num(r.venta), comision: num(r.comision), neto: num(r.neto), enviarDian: false, errorFactura: null };
  }
  return facturarLiquidacion(ctx, r.liquidacion_id, s.clave_idempotencia);
}

type FilaLiquidacion = {
  id: string;
  status: 'por_facturar' | 'liquidada';
  sale_total: number | string;
  commission_amount: number | string;
  net_amount: number | string;
  invoice_id: string | null;
  consignment_notes: { number: string; customer_id: string; branch_id: number } | null;
  consignment_settlement_lines: { product_id: number; qty_sold: number | string; unit_price: number | string; products: { name: string | null } | null }[];
  invoice_sales: { number: string | null; status: string | null } | null;
};

/**
 * Factura lo vendido de una liquidación «por facturar» y la cierra. Idempotente:
 * reutiliza el borrador ya ligado; si la factura ya está emitida solo cierra.
 */
export async function facturarLiquidacion(ctx: Ctx, liquidacionId: string, clave: string): Promise<ResultadoLiquidar> {
  const { data, error } = await ctx.supabase
    .from('consignment_settlements')
    .select(
      `id, status, sale_total, commission_amount, net_amount, invoice_id,
       consignment_notes:note_id (number, customer_id, branch_id),
       consignment_settlement_lines (product_id, qty_sold, unit_price, products:product_id (name)),
       invoice_sales:invoice_id (number, status)`,
    )
    .eq('organization_id', ctx.organizationId)
    .eq('id', liquidacionId)
    .maybeSingle();
  if (error) throw errorDeRpc('consignment_settlements', ctx, error);
  if (!data) throw new ErrorConsignacionServidor('liquidacion_no_encontrada');
  const q = data as unknown as FilaLiquidacion;
  const base = { liquidacionId: q.id, venta: num(q.sale_total), comision: num(q.commission_amount), neto: num(q.net_amount) };
  if (q.status === 'liquidada') {
    return { ...base, estado: 'liquidada', facturaId: q.invoice_id, facturaNumero: q.invoice_sales?.number ?? null, enviarDian: false, errorFactura: null };
  }
  const nota = q.consignment_notes;
  if (!nota) throw new ErrorConsignacionServidor('nota_no_encontrada');

  let facturaId = q.invoice_id;
  let estadoFactura = q.invoice_sales?.status ?? null;
  const cerrar = async (id: string) => {
    const { data: c, error: e } = await ctx.supabase.rpc('fn_consignacion_cerrar', {
      p_liquidacion: q.id,
      p_factura: id,
      p_clave_idempotencia: clave.slice(0, 150),
      p_organization_id: ctx.organizationId,
    });
    if (e) throw errorDeRpc('fn_consignacion_cerrar', ctx, e);
    return c as { estado: 'por_facturar' | 'liquidada' };
  };

  if (!facturaId) {
    // Lo vendido como líneas de la factura de siempre: precio reportado con impuestos incluidos y la tarifa del producto.
    const vendidas = q.consignment_settlement_lines.filter((l) => num(l.qty_sold) > 0);
    const items = await Promise.all(
      vendidas.map(async (l) => {
        const qty = num(l.qty_sold);
        const unit = num(l.unit_price);
        const imp = await resolveLineTaxWith(ctx.supabase, {
          productId: l.product_id,
          organizationId: ctx.organizationId,
          taxIncluded: true,
          qty,
          unitPrice: unit,
          discountAmount: 0,
        });
        return {
          product_id: l.product_id,
          description: l.products?.name || `#${l.product_id}`,
          qty,
          unit_price: unit,
          discount_amount: 0,
          tax_code: imp.tax_code,
          tax_rate: imp.tax_rate,
          tax_included: true,
          total_line: imp.total_line,
        };
      }),
    );
    const aplicados = [...new Map(items.filter((i) => i.tax_code).map((i) => [i.tax_code as string, i.tax_rate])).entries()].map(([tax_code, tax_rate]) => ({ tax_code, tax_rate }));
    const guardada = await guardarFactura(ctx, null, {
      customer_id: nota.customer_id,
      branch_id: nota.branch_id,
      tax_included: true,
      notes: `Liquidación de consignación ${nota.number}`,
      applied_taxes: aplicados,
      items,
    });
    facturaId = guardada.id;
    estadoFactura = 'draft';
    // Liga el borrador antes de emitir: un reintento lo reutiliza y no crea otra factura.
    await cerrar(facturaId);
  }

  let errorFactura: string | null = null;
  let numero = q.invoice_sales?.number ?? null;
  if (estadoFactura === 'draft') {
    try {
      const emitida = await emitirFactura(ctx, facturaId);
      numero = emitida.numero;
    } catch (err) {
      if (err instanceof ErrorFacturaServidor) errorFactura = String(err.codigo);
      else throw err;
    }
  }
  if (errorFactura) {
    return { ...base, estado: 'por_facturar', facturaId, facturaNumero: numero, enviarDian: false, errorFactura };
  }
  const cierre = await cerrar(facturaId);
  return { ...base, estado: cierre.estado, facturaId, facturaNumero: numero, enviarDian: estadoFactura === 'draft', errorFactura: null };
}
