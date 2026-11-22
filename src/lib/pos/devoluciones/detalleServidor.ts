/**
 * Detalle de una devolución del POS en UNA respuesta (Figma `874:578562`,
 * ruta `/app/pos/devoluciones/[id]`): la devolución y sus líneas, el motivo,
 * la venta original con su factura, cobros y lo devuelto antes, la nota
 * crédito, el egreso de caja o el saldo a favor, los asientos y un historial
 * armado con las fechas de cada documento.
 *
 * Solo lectura, con el cliente de la sesión (RLS) y la organización de la
 * sesión en cada consulta. Nada se recalcula: los importes son los que dejó
 * `procesar_devolucion`.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { estadoVenta, type EstadoVenta } from '@/lib/pos/ventas/estadoVenta';
import { numeroDevolucion, textoPlano } from './presentacionDevoluciones';
import { productoLineaEliminado } from '@/lib/inventario/enlaceProducto';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase' | 'userId'>;

export class ErrorDetalleDevolucion extends Error {
  constructor(readonly codigo: 'devolucion_no_encontrada' | 'devolucion_invalida' | 'lectura_fallida', readonly status: number, mensaje: string) {
    super(mensaje);
  }
}

export interface LineaDetalleDevolucion {
  id: number;
  producto: {
    id: number | null;
    nombre: string | null;
    sku: string | null;
    /** Variante: el producto padre (la línea enlaza a su ficha). */
    padre_id?: number | null;
    /** Baja lógica del producto o de su padre: no enlaza y dice «Producto eliminado». */
    eliminado?: boolean;
  };
  /** Posición de la línea en la venta (1, 2…), o null si no se encontró. */
  linea_venta: number | null;
  cantidad: number;
  neto: number;
  impuesto: number;
  reintegro: number;
  repuesta: boolean;
  seriales: { codigo: string; disposicion: string | null }[];
}

export type EventoHistorial =
  | { tipo: 'creada'; fecha: string; usuario: string | null }
  | { tipo: 'egreso_caja'; fecha: string; sesion: number | null }
  | { tipo: 'nota_credito'; fecha: string; numero: string | null }
  | { tipo: 'saldo_a_favor'; fecha: string }
  | { tipo: 'asiento'; fecha: string; numero: string }
  | { tipo: 'anulada'; fecha: string; usuario: string | null; motivo: string }
  | { tipo: 'espejo'; fecha: string; numeros: string; monto: number | null; sesion: number | null };

/**
 * Anulación de la devolución (`fn_devolucion_anular`, Figma 2721:17): quién,
 * cuándo y por qué, los asientos espejo, el ingreso de caja y lo que volvió a
 * salir del inventario.
 */
export interface AnulacionDevolucion {
  fecha: string;
  usuario: { id: string | null; nombre: string | null };
  motivo: string;
  espejos: { id: number; numero: string; fecha: string | null }[];
  ingreso_caja: { id: number; monto: number; fecha: string | null; sesion: number | null } | null;
  unidades_retiradas: number;
}

export interface DetalleDevolucion {
  id: number;
  numero: string;
  fecha: string;
  estado: string;
  metodo: string;
  total: number;
  impuesto: number;
  notas: string | null;
  sucursal: { id: number; nombre: string | null };
  usuario: { id: string; nombre: string | null };
  motivo: { id: number | null; codigo: string | null; nombre: string | null; afecta_inventario: boolean | null; requiere_foto: boolean | null; texto: string };
  lineas: LineaDetalleDevolucion[];
  unidades: number;
  unidades_vendidas: number;
  venta: {
    id: string;
    fecha: string | null;
    total: number;
    estado: EstadoVenta;
    /** Σ devoluciones procesadas de la venta anteriores a esta. */
    devuelto_antes: number;
    cliente: { id: string; nombre: string | null; tipo_documento: string | null; documento: string | null } | null;
    factura: { id: string; numero: string | null; estado: string | null; total: number } | null;
    cobros: { id: string; metodo: string | null; monto: number; fecha: string | null; estado: string | null }[];
  };
  nota_credito: {
    id: string;
    numero: string | null;
    total: number;
    estado: string | null;
    einvoice_status: string | null;
    fecha: string | null;
    /** Último envío a la DIAN (`electronic_invoicing_jobs`): para «Reenviar nota crédito a la DIAN». */
    envio?: { job_id: string; estado: string } | null;
  } | null;
  /**
   * Ventas nuevas que revenden esta devolución (`sales.resale_of_return_id`,
   * «Registrar venta nueva»): la cadena termina en «Venta nueva».
   */
  ventas_nuevas?: { id: string; numero: string | null; fecha: string | null; total: number; estado: EstadoVenta }[];
  /** Acciones que el servidor permite (permisos de la sesión). */
  permisos?: { reenviar_nc: boolean };
  caja: { sesion_id: number; movimiento: { id: number; monto: number; fecha: string | null } | null } | null;
  saldo_a_favor: { id: string; monto: number; saldo: number; estado: string | null } | null;
  asientos: { id: number; fecha: string | null; memo: string | null; numero: string }[];
  /** Solo si la devolución está anulada. */
  anulacion?: AnulacionDevolucion | null;
  historial: EventoHistorial[];
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

async function nombrePerfil(ctx: Ctx, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await ctx.supabase.from('profiles').select('first_name, last_name, email').eq('id', id).maybeSingle();
  const p = data as { first_name: string | null; last_name: string | null; email: string | null } | null;
  if (!p) return null;
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || null;
}

export async function detalleDevolucion(ctx: Ctx, idTexto: string): Promise<DetalleDevolucion> {
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorDetalleDevolucion('devolucion_invalida', 400, 'Identificador de devolución inválido');

  const { data: fila, error } = await ctx.supabase
    .from('returns')
    .select('id, branch_id, sale_id, user_id, total_refund, reason, reason_id, return_date, created_at, status, refund_method, cash_session_id, cash_movement_id, credit_note_invoice_id, customer_credit_id, notes, voided_at, voided_by, void_reason')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw new ErrorDetalleDevolucion('lectura_fallida', 500, error.message);
  if (!fila) throw new ErrorDetalleDevolucion('devolucion_no_encontrada', 404, 'La devolución no existe');
  const r = fila as {
    id: number; branch_id: number; sale_id: string; user_id: string; total_refund: number | string; reason: string | null; reason_id: number | null;
    return_date: string | null; created_at: string | null; status: string | null; refund_method: string | null; cash_session_id: number | null;
    cash_movement_id: number | null; credit_note_invoice_id: string | null; customer_credit_id: string | null; notes: string | null;
    voided_at: string | null; voided_by: string | null; void_reason: string | null;
  };
  const fecha = r.return_date ?? r.created_at ?? '';

  const [lineasRes, ventaRes, itemsRes, docsRes, motivoRes, ramaRes, devsRes, asientosRes, movRes, creditoRes, usuario] = await Promise.all([
    ctx.supabase
      .from('return_lines')
      .select('id, sale_item_id, product_id, quantity, refund_amount, tax_amount, restocked, serial_ids, serial_dispositions, products(name, sku, status, parent_product_id, padre:products!parent_product_id(status))')
      .eq('organization_id', ctx.organizationId)
      .eq('return_id', id)
      .order('id', { ascending: true }),
    ctx.supabase.from('sales').select('id, sale_date, total, status, payment_status, customer_id').eq('id', r.sale_id).eq('organization_id', ctx.organizationId).maybeSingle(),
    ctx.supabase.from('sale_items').select('id, quantity, created_at').eq('sale_id', r.sale_id).order('created_at', { ascending: true }).order('id', { ascending: true }),
    ctx.supabase
      .from('invoice_sales')
      .select('id, number, document_type, status, total, einvoice_status, created_at')
      .eq('sale_id', r.sale_id)
      .eq('organization_id', ctx.organizationId),
    r.reason_id
      ? ctx.supabase.from('return_reasons').select('id, code, name, affects_inventory, requires_photo').eq('id', r.reason_id).eq('organization_id', ctx.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase.from('branches').select('name').eq('id', r.branch_id).maybeSingle(),
    ctx.supabase
      .from('returns')
      .select('id, total_refund, status, return_date, created_at')
      .eq('sale_id', r.sale_id)
      .eq('organization_id', ctx.organizationId),
    ctx.supabase
      .from('journal_entries')
      .select('id, entry_date, memo, comprobante_prefijo, comprobante_numero')
      .eq('organization_id', ctx.organizationId)
      .eq('source', 'returns')
      .eq('source_id', String(id))
      .order('entry_date', { ascending: true }),
    r.cash_movement_id
      ? ctx.supabase.from('cash_movements').select('id, amount, created_at, cash_session_id').eq('id', r.cash_movement_id).eq('organization_id', ctx.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    r.customer_credit_id
      ? ctx.supabase.from('credit_notes').select('id, amount, balance, status').eq('id', r.customer_credit_id).eq('organization_id', ctx.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    nombrePerfil(ctx, r.user_id),
  ]);
  if (lineasRes.error) throw new ErrorDetalleDevolucion('lectura_fallida', 500, lineasRes.error.message);

  type Doc = { id: string; number: string | null; document_type: string | null; status: string | null; total: number | string | null; einvoice_status: string | null; created_at: string | null };
  const docs = (docsRes.data ?? []) as Doc[];
  const anulada = (d: Doc) => ['void', 'voided', 'cancelled'].includes(String(d.status));
  const facturas = docs.filter((d) => d.document_type !== 'credit_note').sort((a, b) => Number(anulada(a)) - Number(anulada(b)) || String(b.created_at).localeCompare(String(a.created_at)));
  const factura = facturas[0] ?? null;
  const nc = r.credit_note_invoice_id ? docs.find((d) => d.id === r.credit_note_invoice_id) ?? null : null;

  const venta = ventaRes.data as { id: string; sale_date: string | null; total: number | string; status: string | null; payment_status: string | null; customer_id: string | null } | null;
  const [clienteRes, cobrosRes] = await Promise.all([
    venta?.customer_id
      ? ctx.supabase.from('customers').select('id, full_name, identification_type, identification_number, doc_type, doc_number').eq('id', venta.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase
      .from('payments')
      .select('id, method, amount, payment_date, created_at, status, source, source_id')
      .eq('organization_id', ctx.organizationId)
      .in('source', ['sale', 'invoice_sales'])
      .in('source_id', [r.sale_id, ...facturas.map((f) => f.id)]),
  ]);

  const items = (itemsRes.data ?? []) as Array<{ id: string; quantity: number | string }>;
  const posicion = new Map(items.map((it, i) => [it.id, i + 1]));
  const unidadesVendidas = items.reduce((a, it) => a + n(it.quantity), 0);

  // Seriales de las líneas: los códigos se leen en una sola consulta.
  type LineaFila = {
    id: number; sale_item_id: string | null; product_id: number | null; quantity: number | string; refund_amount: number | string; tax_amount: number | string;
    restocked: boolean; serial_ids: number[] | null; serial_dispositions: Record<string, string> | null; products: {
      name: string | null;
      sku: string | null;
      status?: string | null;
      parent_product_id?: number | null;
      padre?: { status: string | null } | { status: string | null }[] | null;
    } | null;
  };
  const filasLineas = (lineasRes.data ?? []) as unknown as LineaFila[];
  const idsSeriales = [...new Set(filasLineas.flatMap((l) => l.serial_ids ?? []))];
  const codigos = new Map<number, string>();
  if (idsSeriales.length) {
    const { data } = await ctx.supabase.from('serial_numbers').select('id, serial').eq('organization_id', ctx.organizationId).in('id', idsSeriales);
    for (const s of (data ?? []) as Array<{ id: number; serial: string }>) codigos.set(Number(s.id), String(s.serial));
  }
  const lineas: LineaDetalleDevolucion[] = filasLineas.map((l) => ({
    id: Number(l.id),
    producto: {
      id: l.product_id,
      nombre: l.products?.name ?? null,
      sku: l.products?.sku ?? null,
      padre_id: l.products?.parent_product_id ?? null,
      eliminado: productoLineaEliminado({
        id: l.product_id,
        status: l.products?.status,
        parent_product_id: l.products?.parent_product_id,
        padreStatus: (Array.isArray(l.products?.padre) ? l.products?.padre[0] : l.products?.padre)?.status,
      }),
    },
    linea_venta: l.sale_item_id ? posicion.get(l.sale_item_id) ?? null : null,
    cantidad: n(l.quantity),
    neto: n(l.refund_amount) - n(l.tax_amount),
    impuesto: n(l.tax_amount),
    reintegro: n(l.refund_amount),
    repuesta: l.restocked === true,
    seriales: (l.serial_ids ?? []).map((sid) => ({ codigo: codigos.get(Number(sid)) ?? `#${sid}`, disposicion: l.serial_dispositions?.[String(sid)] ?? null })),
  }));

  const devs = (devsRes.data ?? []) as Array<{ id: number; total_refund: number | string; status: string | null; return_date: string | null; created_at: string | null }>;
  const procesadas = devs.filter((d) => d.status === 'processed');
  const fechaDe = (d: { return_date: string | null; created_at: string | null }) => d.return_date ?? d.created_at ?? '';
  const devueltoAntes = procesadas.filter((d) => d.id !== id && (fechaDe(d) < fecha || (fechaDe(d) === fecha && d.id < id))).reduce((a, d) => a + n(d.total_refund), 0);
  const devueltoTotal = procesadas.reduce((a, d) => a + n(d.total_refund), 0);

  const cliente = clienteRes.data as { id: string; full_name: string | null; identification_type: string | null; identification_number: string | null; doc_type: string | null; doc_number: string | null } | null;
  const motivo = motivoRes.data as { id: number; code: string; name: string; affects_inventory: boolean; requires_photo: boolean } | null;
  const mov = movRes.data as { id: number; amount: number | string; created_at: string | null; cash_session_id: number } | null;
  const credito = creditoRes.data as { id: string; amount: number | string; balance: number | string; status: string | null } | null;
  const asientos = ((asientosRes.data ?? []) as Array<{ id: number; entry_date: string | null; memo: string | null; comprobante_prefijo: string | null; comprobante_numero: number | null }>).map((a) => ({
    id: Number(a.id),
    fecha: a.entry_date,
    memo: a.memo,
    numero: a.comprobante_numero ? `${a.comprobante_prefijo ?? ''}${a.comprobante_numero}` : `#${a.id}`,
  }));

  const anulacion = r.status === 'cancelled' ? await leerAnulacion(ctx, r, asientos.map((a) => a.id), filasLineas.map((l) => l.product_id)) : null;
  const [envio, ventasNuevas] = await Promise.all([nc ? ultimoEnvio(ctx, nc.id) : Promise.resolve(null), leerVentasNuevas(ctx, r.id)]);

  const historial: EventoHistorial[] = [
    { tipo: 'creada' as const, fecha, usuario },
    ...(mov?.created_at ? [{ tipo: 'egreso_caja' as const, fecha: mov.created_at, sesion: mov.cash_session_id ?? r.cash_session_id }] : []),
    ...(nc?.created_at ? [{ tipo: 'nota_credito' as const, fecha: nc.created_at, numero: nc.number }] : []),
    ...(credito ? [{ tipo: 'saldo_a_favor' as const, fecha }] : []),
    ...asientos.filter((a) => a.fecha).map((a) => ({ tipo: 'asiento' as const, fecha: a.fecha as string, numero: a.numero })),
    ...(anulacion
      ? [
          { tipo: 'anulada' as const, fecha: anulacion.fecha, usuario: anulacion.usuario.nombre, motivo: anulacion.motivo },
          ...(anulacion.espejos.length || anulacion.ingreso_caja
            ? [{
                tipo: 'espejo' as const,
                fecha: anulacion.fecha,
                numeros: anulacion.espejos.map((e) => e.numero).join(', '),
                monto: anulacion.ingreso_caja?.monto ?? null,
                sesion: anulacion.ingreso_caja?.sesion ?? null,
              }]
            : []),
        ]
      : []),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    id: r.id,
    numero: numeroDevolucion(r.id),
    fecha,
    estado: r.status ?? 'processed',
    metodo: r.refund_method ?? 'sin_definir',
    total: n(r.total_refund),
    impuesto: lineas.reduce((a, l) => a + l.impuesto, 0),
    notas: r.notes ? textoPlano(r.notes) || null : null,
    sucursal: { id: r.branch_id, nombre: (ramaRes.data as { name: string | null } | null)?.name ?? null },
    usuario: { id: r.user_id, nombre: usuario },
    motivo: {
      id: motivo?.id ?? r.reason_id,
      codigo: motivo?.code ?? null,
      nombre: motivo?.name ?? null,
      afecta_inventario: motivo ? motivo.affects_inventory : null,
      requiere_foto: motivo ? motivo.requires_photo : null,
      texto: textoPlano(r.reason),
    },
    lineas,
    unidades: lineas.reduce((a, l) => a + l.cantidad, 0),
    unidades_vendidas: unidadesVendidas,
    venta: {
      id: r.sale_id,
      fecha: venta?.sale_date ?? null,
      total: n(venta?.total),
      estado: estadoVenta({ status: venta?.status, payment_status: venta?.payment_status, total: venta?.total, devuelto: devueltoTotal }),
      devuelto_antes: devueltoAntes,
      cliente: cliente
        ? {
            id: cliente.id,
            nombre: cliente.full_name,
            tipo_documento: cliente.identification_type || cliente.doc_type,
            documento: cliente.identification_number || cliente.doc_number,
          }
        : null,
      factura: factura ? { id: factura.id, numero: factura.number, estado: factura.status, total: n(factura.total) } : null,
      cobros: ((cobrosRes.data ?? []) as Array<{ id: string; method: string | null; amount: number | string; payment_date: string | null; created_at: string | null; status: string | null }>).map((p) => ({
        id: p.id,
        metodo: p.method,
        monto: n(p.amount),
        fecha: p.payment_date ?? p.created_at,
        estado: p.status,
      })),
    },
    nota_credito: nc ? { id: nc.id, numero: nc.number, total: n(nc.total), estado: nc.status, einvoice_status: nc.einvoice_status, fecha: nc.created_at, envio } : null,
    ventas_nuevas: ventasNuevas,
    caja: r.cash_session_id ? { sesion_id: r.cash_session_id, movimiento: mov ? { id: Number(mov.id), monto: n(mov.amount), fecha: mov.created_at } : null } : null,
    saldo_a_favor: credito ? { id: credito.id, monto: n(credito.amount), saldo: n(credito.balance), estado: credito.status } : null,
    asientos,
    anulacion,
    historial,
  };
}

/** Último envío de la nota crédito a la DIAN (la cola de facturación electrónica). */
async function ultimoEnvio(ctx: Ctx, notaId: string): Promise<{ job_id: string; estado: string } | null> {
  const { data } = await ctx.supabase
    .from('electronic_invoicing_jobs')
    .select('id, status')
    .eq('organization_id', ctx.organizationId)
    .eq('invoice_id', notaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const job = data as { id: string; status: string | null } | null;
  return job ? { job_id: String(job.id), estado: job.status ?? 'pending' } : null;
}

/** Ventas que revenden la devolución (sin las anuladas), con el número de su factura. */
async function leerVentasNuevas(ctx: Ctx, devolucionId: number): Promise<NonNullable<DetalleDevolucion['ventas_nuevas']>> {
  const { data } = await ctx.supabase
    .from('sales')
    .select('id, sale_date, total, status, payment_status')
    .eq('organization_id', ctx.organizationId)
    .eq('resale_of_return_id', devolucionId)
    .neq('status', 'void')
    .order('sale_date', { ascending: true });
  const ventas = (data ?? []) as Array<{ id: string; sale_date: string | null; total: number | string; status: string | null; payment_status: string | null }>;
  if (!ventas.length) return [];
  const { data: facturas } = await ctx.supabase
    .from('invoice_sales')
    .select('sale_id, number, document_type, status, created_at')
    .eq('organization_id', ctx.organizationId)
    .in('sale_id', ventas.map((v) => v.id));
  const numero = new Map<string, string>();
  for (const f of ((facturas ?? []) as Array<{ sale_id: string; number: string | null; document_type: string | null; status: string | null }>)) {
    if (f.document_type === 'credit_note' || !f.number || ['void', 'voided', 'cancelled'].includes(String(f.status))) continue;
    if (!numero.has(f.sale_id)) numero.set(f.sale_id, f.number);
  }
  return ventas.map((v) => ({
    id: v.id,
    numero: numero.get(v.id) ?? null,
    fecha: v.sale_date,
    total: n(v.total),
    estado: estadoVenta({ status: v.status, payment_status: v.payment_status, total: v.total, devuelto: 0 }),
  }));
}

/**
 * Lo que dejó `fn_devolucion_anular`: los contra-asientos (`reversal:<id>`) de
 * los asientos de la devolución, de su nota crédito y de su saldo a favor; el
 * ingreso de caja (movimiento `in` con `return_id`) y las salidas de kardex
 * (origen `return`, dirección `out`) de los productos devueltos.
 */
async function leerAnulacion(
  ctx: Ctx,
  r: { id: number; credit_note_invoice_id: string | null; customer_credit_id: string | null; voided_at: string | null; voided_by: string | null; void_reason: string | null; return_date: string | null; created_at: string | null },
  asientosDevolucion: number[],
  productos: Array<number | null>,
): Promise<AnulacionDevolucion> {
  const claves = [
    ...(r.credit_note_invoice_id ? [`accrual:credit_note:${r.credit_note_invoice_id}`] : []),
    ...(r.customer_credit_id ? [`customer_credit:${r.customer_credit_id}`] : []),
  ];
  const [otrosRes, cajaRes, stockRes, usuario] = await Promise.all([
    claves.length
      ? ctx.supabase.from('journal_entries').select('id').eq('organization_id', ctx.organizationId).in('fact_key', claves)
      : Promise.resolve({ data: [] as Array<{ id: number }> }),
    ctx.supabase
      .from('cash_movements')
      .select('id, amount, created_at, cash_session_id')
      .eq('organization_id', ctx.organizationId)
      .eq('return_id', r.id)
      .eq('type', 'in')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from('stock_movements')
      .select('product_id, qty')
      .eq('organization_id', ctx.organizationId)
      .eq('source', 'return')
      .eq('source_id', String(r.id))
      .eq('direction', 'out'),
    nombrePerfil(ctx, r.voided_by),
  ]);
  const originales = [...asientosDevolucion, ...((otrosRes.data ?? []) as Array<{ id: number }>).map((a) => Number(a.id))];
  let espejos: AnulacionDevolucion['espejos'] = [];
  if (originales.length) {
    const { data } = await ctx.supabase
      .from('journal_entries')
      .select('id, entry_date, comprobante_prefijo, comprobante_numero')
      .eq('organization_id', ctx.organizationId)
      .in('fact_key', originales.map((id) => `reversal:${id}`))
      .order('id', { ascending: true });
    espejos = ((data ?? []) as Array<{ id: number; entry_date: string | null; comprobante_prefijo: string | null; comprobante_numero: number | null }>).map((a) => ({
      id: Number(a.id),
      numero: a.comprobante_numero ? `${a.comprobante_prefijo ?? ''}${a.comprobante_numero}` : `#${a.id}`,
      fecha: a.entry_date,
    }));
  }
  const devueltos = new Set(productos.filter((p): p is number => p !== null).map(Number));
  const caja = cajaRes.data as { id: number; amount: number | string; created_at: string | null; cash_session_id: number | null } | null;
  return {
    fecha: r.voided_at ?? r.return_date ?? r.created_at ?? '',
    usuario: { id: r.voided_by, nombre: usuario },
    motivo: textoPlano(r.void_reason),
    espejos,
    ingreso_caja: caja ? { id: Number(caja.id), monto: n(caja.amount), fecha: caja.created_at, sesion: caja.cash_session_id } : null,
    unidades_retiradas: ((stockRes.data ?? []) as Array<{ product_id: number; qty: number | string }>)
      .filter((m) => devueltos.has(Number(m.product_id)))
      .reduce((a, m) => a + n(m.qty), 0),
  };
}
