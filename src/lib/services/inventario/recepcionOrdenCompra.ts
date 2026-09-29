/**
 * Recepción de órdenes de compra (inventario B8, INVENTARIO-PLAN.md §5.9).
 *
 * Contrato TS de la RPC `fn_oc_recepcionar` (migración
 * `supabase/migrations/20260929170100_inv_b8_2_recepcionar.sql`) y de la ruta
 * `POST /api/inventario/ordenes-compra/[id]/recepcionar`, más la lógica pura
 * que usa la pantalla para armar las líneas.
 *
 * Todo pasa en UNA transacción en el servidor: cantidades con guarda de
 * sobre-recepción, lotes con vencimiento, seriales únicos por organización,
 * kardex por la primitiva (costo del proveedor → costo promedio), estado de la
 * OC y, al completarla, la factura de compra con su CxP. Si algo falla no queda
 * nada recibido. Antes esto se hacía en el navegador en varios pasos y los
 * errores de stock y de seriales se perdían en la consola.
 *
 * `qty` es lo que llega AHORA (no el acumulado). La organización nunca viaja en
 * el cuerpo: la pone el servidor desde la sesión (regla dura 5).
 */
import { z } from 'zod';

// ─── Cuerpo de la ruta ──────────────────────────────────────────────────────

const cantidad = z.coerce.number().finite().positive().max(1_000_000_000);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const loteRecepcionSchema = z
  .object({
    lot_id: z.coerce.number().int().positive().optional(),
    lot_code: z.string().trim().max(60).optional().nullable(),
    expiry_date: fecha.optional().nullable(),
    qty: cantidad,
  })
  .strict();

export const lineaRecepcionSchema = z
  .object({
    po_item_id: z.coerce.number().int().positive(),
    product_id: z.coerce.number().int().positive().optional(),
    qty: cantidad,
    lotes: z.array(loteRecepcionSchema).max(50).optional(),
    seriales: z.array(z.string().trim().min(1).max(120)).max(1000).optional(),
  })
  .strict();

export const recepcionSchema = z
  .object({
    lineas: z.array(lineaRecepcionSchema).min(1).max(500),
    clave: z.string().trim().min(8).max(120),
    notas: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export type LoteRecepcion = z.infer<typeof loteRecepcionSchema>;
export type LineaRecepcion = z.infer<typeof lineaRecepcionSchema>;
export type CuerpoRecepcion = z.infer<typeof recepcionSchema>;

// ─── Respuesta ──────────────────────────────────────────────────────────────

export interface LineaRecibida {
  po_item_id: number;
  product_id: number;
  producto: string;
  pedido: number;
  recibido_antes: number;
  recibido_ahora: number;
  recibido_total: number;
  pendiente: number;
  costo_unitario: number;
  lotes: { lot_id: number; lot_code: string; expiry_date: string | null; qty: number }[];
  seriales: { id: number; serial: string }[];
  movimientos: number[];
}

export interface PendienteOrden {
  po_item_id: number;
  product_id: number;
  producto: string | null;
  pedido: number;
  recibido: number;
  pendiente: number;
}

export interface ResultadoRecepcionOC {
  recepcion_id: number;
  codigo: string;
  ya_procesada: boolean;
  orden: { id: number; uuid: string; codigo: string; estado: 'partial' | 'received'; completa: boolean };
  lineas: LineaRecibida[];
  /** Diferencia con la orden: líneas que siguen pendientes tras esta recepción. */
  pendientes: PendienteOrden[];
  /** Líneas que no movieron stock (p. ej. producto sin control de existencias). */
  saltadas: { po_item_id: number; product_id: number | null; product_name?: string; reason: string }[];
  factura: { invoice_id: string; number_ext?: string; ya_existia: boolean; accounts_payable_id?: string | null } | null;
}

// ─── Errores ────────────────────────────────────────────────────────────────

/** Códigos que levanta `fn_oc_recepcionar` (en `message`) y los de la ruta. */
export const ERRORES_RECEPCION_OC = [
  'sin_sesion',
  'sin_permiso',
  'organizacion_no_permitida',
  'sucursal_sin_acceso',
  'orden_no_encontrada',
  'orden_no_recibible',
  'datos_invalidos',
  'clave_invalida',
  'clave_reutilizada',
  'sin_lineas',
  'demasiadas_lineas',
  'linea_invalida',
  'linea_repetida',
  'linea_no_es_de_la_orden',
  'producto_no_coincide',
  'producto_con_variantes',
  'cantidad_invalida',
  'sobre_recepcion',
  'cantidad_serial_entera',
  'seriales_no_cuadran',
  'serial_repetido',
  'producto_sin_control_de_stock',
  'lote_requerido',
  'lotes_no_cuadran',
  'lote_invalido',
  'lote_repetido',
  'lote_vencimiento_distinto',
  'fecha_invalida',
  'error_desconocido',
] as const;
export type ErrorRecepcionOC = (typeof ERRORES_RECEPCION_OC)[number];

const MENSAJES_SQL: Record<string, ErrorRecepcionOC> = {
  SUCURSAL_NO_PERMITIDA: 'sucursal_sin_acceso',
  SUCURSAL_NO_ES_DE_LA_ORG: 'sin_permiso',
  PRODUCTO_NO_ES_DE_LA_ORG: 'sin_permiso',
  'Acceso denegado a la organización': 'sin_permiso',
};

/** Traduce el error de la RPC a un código estable (el `message` es el código de negocio). */
export function codigoErrorRecepcionOC(error: { message?: string | null; code?: string | null } | null | undefined): ErrorRecepcionOC {
  const mensaje = (error?.message ?? '').trim();
  if ((ERRORES_RECEPCION_OC as readonly string[]).includes(mensaje)) return mensaje as ErrorRecepcionOC;
  if (MENSAJES_SQL[mensaje]) return MENSAJES_SQL[mensaje];
  if (error?.code === '42501') return 'sin_permiso';
  if (error?.code === 'P0002') return 'orden_no_encontrada';
  return 'error_desconocido';
}

export function estadoHttpErrorRecepcionOC(codigo: ErrorRecepcionOC): number {
  switch (codigo) {
    case 'sin_sesion':
      return 401;
    case 'sin_permiso':
    case 'organizacion_no_permitida':
    case 'sucursal_sin_acceso':
      return 403;
    case 'orden_no_encontrada':
      return 404;
    case 'orden_no_recibible':
    case 'sobre_recepcion':
    case 'serial_repetido':
    case 'lote_repetido':
    case 'clave_reutilizada':
      return 409;
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}

/** `details` de la RPC: JSON (sobre-recepción, seriales o lotes que no cuadran) o texto (el serial repetido). */
export function detalleErrorRecepcionOC(details: string | null | undefined): Record<string, unknown> | string | null {
  if (!details) return null;
  try {
    const d: unknown = JSON.parse(details);
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : String(d);
  } catch {
    return details;
  }
}

export class ErrorRecepcionOrdenCompra extends Error {
  constructor(
    public readonly codigo: ErrorRecepcionOC,
    public readonly detalle: Record<string, unknown> | string | null = null,
    public readonly estado = 0,
  ) {
    super(codigo);
    this.name = 'ErrorRecepcionOrdenCompra';
  }
}

// ─── Lógica pura de la pantalla ─────────────────────────────────────────────

/** Línea de la OC tal como la tiene la pantalla. */
export interface LineaOrdenParaRecibir {
  id: number;
  product_id: number;
  quantity: number;
  received_quantity: number | null;
  serials_received?: string[] | null;
}

/** Lote que la pantalla captura para una línea (nuevo o existente). */
export interface LoteCapturado {
  lot_id?: number | null;
  lot_code?: string | null;
  expiry_date?: string | null;
  qty: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * La pantalla trabaja con el ACUMULADO recibido por línea (el campo «Recibido»
 * arranca en lo ya recibido) y con la lista acumulada de seriales. La RPC
 * recibe lo que llega AHORA: la diferencia, solo de las líneas que suben, y
 * solo los seriales nuevos. Bajar lo ya recibido no es una recepción (el valor
 * menor se ignora; la pantalla no lo permite).
 */
export function construirLineasRecepcion(
  items: readonly LineaOrdenParaRecibir[],
  acumulado: Readonly<Record<number, number>>,
  seriales: Readonly<Record<number, readonly string[]>> = {},
  lotes: Readonly<Record<number, readonly LoteCapturado[]>> = {},
): LineaRecepcion[] {
  const lineas: LineaRecepcion[] = [];
  for (const item of items) {
    const antes = Number(item.received_quantity) || 0;
    const total = Number(acumulado[item.id] ?? antes) || 0;
    const ahora = r3(total - antes);
    if (ahora <= 0) continue;
    const linea: LineaRecepcion = { po_item_id: item.id, product_id: item.product_id, qty: ahora };
    const previos = new Set((item.serials_received ?? []).map((s) => s.trim()));
    const nuevos = (seriales[item.id] ?? []).map((s) => s.trim()).filter((s) => s && !previos.has(s));
    if (nuevos.length > 0) linea.seriales = nuevos;
    const capturados = (lotes[item.id] ?? []).filter((l) => Number(l.qty) > 0);
    if (capturados.length > 0) {
      linea.lotes = capturados.map((l) => ({
        ...(l.lot_id ? { lot_id: l.lot_id } : {}),
        lot_code: l.lot_code?.trim() || null,
        expiry_date: l.expiry_date || null,
        qty: r3(Number(l.qty)),
      }));
    }
    lineas.push(linea);
  }
  return lineas;
}

/** «Marcar recibida» del listado: todo lo pendiente de cada línea. */
export function lineasPendientes(items: readonly LineaOrdenParaRecibir[]): LineaRecepcion[] {
  return items
    .map((i) => ({ po_item_id: i.id, product_id: i.product_id, qty: r3(Number(i.quantity) - (Number(i.received_quantity) || 0)) }))
    .filter((l) => l.qty > 0);
}

/** Suma de lo asignado a lotes de una línea (para avisar si no cuadra con lo que llega). */
export function totalLotes(lotes: readonly LoteCapturado[] | undefined): number {
  return r3((lotes ?? []).reduce((s, l) => s + (Number(l.qty) || 0), 0));
}

export function nuevaClaveRecepcion(): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `oc-rec-${id}`;
}

// ─── Llamada desde el navegador ─────────────────────────────────────────────

/**
 * Recibe mercancía de la OC por la ruta del servidor. Lanza
 * `ErrorRecepcionOrdenCompra` con un código estable si falla: nunca devuelve
 * un «éxito» con errores escondidos.
 */
export async function recepcionarOrdenCompra(
  ordenUuid: string,
  cuerpo: CuerpoRecepcion,
  fetcher: typeof fetch = fetch,
): Promise<ResultadoRecepcionOC> {
  const res = await fetcher(`/api/inventario/ordenes-compra/${encodeURIComponent(ordenUuid)}/recepcionar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datos: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const d = (datos ?? {}) as { codigo?: string; code?: string; detalle?: Record<string, unknown> | string | null };
    const crudo = d.codigo ?? d.code ?? '';
    const codigo: ErrorRecepcionOC =
      (ERRORES_RECEPCION_OC as readonly string[]).includes(crudo)
        ? (crudo as ErrorRecepcionOC)
        : res.status === 401
          ? 'sin_sesion'
          : res.status === 403
            ? 'sin_permiso'
            : 'error_desconocido';
    throw new ErrorRecepcionOrdenCompra(codigo, d.detalle ?? null, res.status);
  }
  return datos as ResultadoRecepcionOC;
}
