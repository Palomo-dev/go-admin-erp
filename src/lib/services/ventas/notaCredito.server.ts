/**
 * Nota crédito de una factura de venta — servicio de servidor (plan P1.6, P7).
 * Lee con el cliente de la SESIÓN, filtrado por la organización de la sesión;
 * escribe solo por `fn_nota_credito_emitir` (una transacción: documento,
 * líneas con su impuesto, reingreso, excedente y auditoría). El saldo de la
 * factura y la cartera los mueven los disparadores. La factura electrónica de
 * la nota se encola DESPUÉS, fuera de la transacción, con la cola única.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  codigoErrorNota,
  type ContextoNota,
  type ErrorNota,
  type LineaAcreditable,
  type ResultadoNota,
  type SolicitudNota,
} from '@/lib/finanzas/ventas/contratoNotaCredito';
import { encolarDocumento } from '@/lib/services/einvoicing/colaFacturacion.server';
import { conceptoNotaCredito } from '@/lib/services/einvoicing/payloadsFactus';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export class ErrorNotaServidor extends Error {
  constructor(
    public readonly codigo: ErrorNota,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function detalleJson(detail: unknown): unknown {
  if (typeof detail !== 'string' || !detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

function lanzar(etiqueta: string, ctx: Ctx, error: { message: string; details?: unknown }): never {
  const codigo = codigoErrorNota(error.message);
  if (codigo === 'error_desconocido' || codigo === 'sin_regla_contable') {
    console.error(`[notaCredito] ${etiqueta}`, { organizationId: ctx.organizationId, message: error.message });
  }
  throw new ErrorNotaServidor(codigo, detalleJson(error.details));
}

interface FacturaBase {
  id: string;
  total: number | string | null;
  balance: number | string | null;
  currency: string | null;
  customer_id: string | null;
  einvoice_status: string | null;
  document_type: string | null;
  status: string;
}

async function facturaDeLaSesion(ctx: Ctx, id: string): Promise<FacturaBase> {
  const { data, error } = await ctx.supabase
    .from('invoice_sales')
    .select('id, total, balance, currency, customer_id, einvoice_status, document_type, status')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error || !data) throw new ErrorNotaServidor('factura_no_encontrada');
  return data as FacturaBase;
}

/** Lo que el diálogo necesita: líneas con lo disponible, tope y datos de la factura. */
export async function contextoNota(ctx: Ctx, id: string): Promise<ContextoNota> {
  const f = await facturaDeLaSesion(ctx, id);
  const [lineasRes, notasRes] = await Promise.all([
    ctx.supabase.rpc('fn_nota_credito_lineas_disponibles', { p_invoice_id: id }),
    ctx.supabase
      .from('invoice_sales')
      .select('total, status')
      .eq('organization_id', ctx.organizationId)
      .eq('related_invoice_id', id)
      .eq('document_type', 'credit_note'),
  ]);
  if (lineasRes.error) lanzar('fn_nota_credito_lineas_disponibles', ctx, lineasRes.error);
  const acreditado = ((notasRes.data ?? []) as { total: number | string | null; status: string }[])
    .filter((n) => !['draft', 'void', 'voided', 'cancelled'].includes(n.status))
    .reduce((s, n) => s + Math.abs(num(n.total)), 0);
  const lineas: LineaAcreditable[] = ((lineasRes.data ?? []) as Record<string, unknown>[]).map((l) => ({
    itemId: String(l.item_id),
    productId: l.product_id == null ? null : Number(l.product_id),
    descripcion: String(l.descripcion ?? ''),
    cantidad: num(l.cantidad),
    acreditada: num(l.acreditada),
    disponible: num(l.disponible),
    precioUnitario: num(l.unit_price),
    descuento: num(l.discount_amount),
    total: num(l.total_line),
    tarifa: num(l.tax_rate),
    incluido: l.tax_included === true,
  }));
  const total = num(f.total);
  return {
    lineas,
    tope: Math.max(0, Math.round((total - acreditado) * 100) / 100),
    total,
    saldo: num(f.balance),
    moneda: f.currency,
    tieneCliente: !!f.customer_id,
    feAceptada: f.einvoice_status === 'accepted',
  };
}

export async function emitirNotaCredito(ctx: Ctx, id: string, s: SolicitudNota): Promise<ResultadoNota> {
  const f = await facturaDeLaSesion(ctx, id);
  const { data, error } = await ctx.supabase.rpc('fn_nota_credito_emitir', {
    p_invoice_id: id,
    p_modo: s.modo,
    p_lineas: s.modo === 'lineas' ? (s.lineas ?? []).map((l) => ({ item_id: l.itemId.toLowerCase(), cantidad: l.cantidad })) : null,
    p_valor: s.modo === 'valor' ? s.valor ?? null : null,
    p_concepto: s.modo === 'valor' ? s.concepto ?? null : null,
    p_motivo: s.motivo,
    p_reingresar: s.reingresar,
    p_liquidacion: s.liquidacion,
    p_metodo_devolucion: s.metodoDevolucion ?? null,
    p_cuenta_bancaria: s.cuentaBancariaId ?? null,
    p_clave_idempotencia: s.claveIdempotencia,
  });
  if (error) lanzar('fn_nota_credito_emitir', ctx, error);
  const r = (data ?? {}) as Record<string, unknown>;
  const resultado: ResultadoNota = {
    id: String(r.id),
    numero: (r.numero as string | null) ?? null,
    total: num(r.total),
    repetida: r.repetida === true,
    excedente: num(r.excedente),
    liquidacion: (r.liquidacion as ResultadoNota['liquidacion']) ?? null,
    productosReingresados: num(r.productos_reingresados),
    fe: 'no_aplica',
  };

  // Ante la DIAN, la nota solo existe si la factura fue aceptada: se encola
  // con la cola única (idempotente por documento), fuera de la transacción.
  if (f.einvoice_status === 'accepted') {
    try {
      await encolarDocumento({
        organizationId: ctx.organizationId,
        documentType: 'credit_note',
        invoiceId: resultado.id,
        opciones: {
          concepto:
            s.conceptoDian ??
            conceptoNotaCredito({ totalNota: resultado.total, totalFactura: num(f.total), conProductos: s.modo !== 'valor' }),
          observacion: s.motivo,
        },
      });
      resultado.fe = 'encolada';
    } catch (err) {
      console.error('[notaCredito] encolar FE', {
        organizationId: ctx.organizationId,
        nota: resultado.id,
        message: err instanceof Error ? err.message : String(err),
      });
      resultado.fe = 'error';
    }
  }
  return resultado;
}
