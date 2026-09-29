/**
 * Contratos del núcleo de existencias (INVENTARIO-PLAN.md §3.2 y §5.1, bloque B0).
 *
 * Todo movimiento de stock pasa por UNA primitiva SQL, `fn_inv_int_mover`
 * (migraciones `supabase/migrations/20260929020*_inv_b0_*.sql`). No se llama
 * desde el navegador: la invocan las RPC públicas SECURITY DEFINER después de
 * validar organización (`fn_assert_acceso_org`) y permiso
 * (`fn_inventario_exigir_permiso`). Este archivo es el espejo TypeScript de esos
 * contratos para los bloques B1–B10: cada tipo nombra la función SQL que lo
 * produce o lo consume.
 *
 * Reglas que NO se negocian (guardarraíl 33 de src/__tests__/guardrails.test.ts):
 *   1. Ningún archivo de `src/` escribe `stock_levels`, `stock_movements` ni
 *      `stock_reservations` con `.from(...).insert/update/upsert/delete`.
 *      Se llama a una RPC que pasa por `fn_inv_int_mover`.
 *   2. El costo promedio tiene UNA regla (`fn_inv_int_costo_promedio`, espejo en
 *      `./costo.ts`).
 *   3. La organización sale de la sesión; la RPC vuelve a exigir el permiso.
 */

import type { OrigenMovimientoStock } from '@/lib/inventario/origenesMovimientoStock';

export type { OrigenMovimientoStock };

/** `stock_movements.direction`. */
export type DireccionMovimiento = 'in' | 'out';

// ─── Primitiva (SQL interno) ─────────────────────────────────────────────────

/**
 * Opciones de `fn_inv_int_mover(..., p_opciones jsonb)`. Todas opcionales; el
 * valor por defecto sale del origen (ver la migración 3 de B0).
 */
export interface OpcionesMovimiento {
  /** Entradas: recalcula el promedio ponderado. Por defecto sí en compra, apertura, ajuste, producción y traslado; no en devoluciones, notas crédito ni anulaciones. */
  recalcular_costo?: boolean;
  /** Salidas: usar el costo que llega (reversión al costo original) en vez del promedio de la fila. */
  costo_fijo?: boolean;
  /** Salidas: permitir dejar la fila en negativo. Por defecto: ventas sí (salvo `bloquear_venta_sin_stock`), ajuste/traslado/pérdida no, el resto sí. */
  permitir_negativo?: boolean;
  /** Salidas sin lote de un producto con `track_lots`: repartir por FEFO (defecto true). */
  fefo?: boolean;
  /** FEFO: incluir lotes ya vencidos (defecto false). */
  incluir_vencidos?: boolean;
  /** Mover aunque el producto tenga `track_stock = false` (reversiones). */
  forzar?: boolean;
  /** Ids de `serial_numbers`; deben cuadrar con la cantidad. */
  seriales?: number[];
  /** Estado final de los seriales en una salida (`sold`, `in_transit`, `defective`…). Obligatorio si hay seriales de salida. */
  estado_serial?: string;
}

/** Un movimiento escrito por la primitiva (una fila de kardex). */
export interface MovimientoEscrito {
  movement_id: number;
  lot_id: number | null;
  direction: DireccionMovimiento;
  qty: number;
  unit_cost: number;
  /** Existencia de la fila (producto, sucursal, lote) tras el movimiento. */
  qty_after: number;
  /** Costo promedio guardado en la fila tras el movimiento (= `stock_movements.avg_cost_after`). */
  avg_cost_after: number;
  stock_level_id: number;
}

/** Respuesta de `fn_inv_int_mover`. Una salida FEFO puede escribir varios movimientos. */
export interface ResultadoMovimiento {
  omitido: boolean;
  motivo: 'producto_no_encontrado' | 'no_track_stock' | null;
  product_id: number;
  branch_id: number;
  movement_id: number | null;
  qty_after: number | null;
  avg_cost_after: number | null;
  movimientos: MovimientoEscrito[];
}

/**
 * Errores de negocio que la primitiva y las RPC del núcleo levantan (el
 * `message` de PostgREST). La interfaz los traduce con `inventario.errores.<clave>`
 * (ver `./errores.ts`).
 */
export const ERRORES_NUCLEO = [
  'stock_insuficiente', // 23514, detail JSON {product_id, branch_id, lot_id, disponible, solicitado}
  'cantidad_invalida', // 22023
  'direccion_invalida',
  'origen_requerido',
  'lote_invalido',
  'serial_repetido',
  'seriales_no_cuadran',
  'serial_no_disponible',
  'estado_serial_requerido',
  'sin_permiso', // 42501
  'SUCURSAL_NO_ES_DE_LA_ORG', // 42501
  'PRODUCTO_NO_ES_DE_LA_ORG', // 42501
  'PEDIDO_NO_ES_DE_LA_ORG', // 42501
  'ORIGEN_INVALIDO',
  'ORIGEN_SIN_ID',
  'conversion_faltante',
] as const;

export type ErrorNucleo = (typeof ERRORES_NUCLEO)[number];

// ─── Permisos (fn_inventario_permisos / fn_inventario_exigir_permiso) ────────

/** Claves de `fn_inventario_permisos(p_org)`. Las RPC exigen con `fn_inventario_exigir_permiso(org, array['<acción>'])`. */
export const ACCIONES_INVENTARIO = [
  'ver',
  'crear',
  'editar_catalogo',
  'eliminar',
  'ajustar',
  'trasladar',
  'recibir',
  'producir',
  'garantias',
  'costos',
  'configurar',
] as const;

export type AccionInventario = (typeof ACCIONES_INVENTARIO)[number];

export type PermisosInventario = Record<AccionInventario, boolean> & {
  /** true cuando ya llegó la respuesta del servidor (antes todo es false). */
  resueltos: boolean;
};

// ─── Configuración (fn_inventario_config / fn_inventario_config_guardar) ─────

export interface ConfigInventario {
  /** P5: false (defecto) = se puede vender sin existencias, como hoy. */
  bloquear_venta_sin_stock: boolean;
}

// ─── Documento de un movimiento (fn_inv_documentos) ─────────────────────────

export type TipoDocumentoMovimiento =
  | 'venta'
  | 'factura_venta'
  | 'nota_credito'
  | 'devolucion'
  | 'anulacion_venta'
  | 'factura_compra'
  | 'orden_compra'
  | 'ajuste'
  | 'traslado'
  | 'orden_produccion'
  | 'folio'
  | 'pedido_web'
  | 'producto'
  | 'otro';

/** Entrada de `fn_inv_documentos(p_org, p_refs)` (máximo 500 por llamada). */
export interface RefDocumento {
  source: OrigenMovimientoStock | string;
  source_id: string | null;
  product_id?: number | null;
}

/** Salida de `fn_inv_documentos`: `numero` y `ruta` son null si el documento no existe o no es de la organización. */
export interface DocumentoMovimiento {
  source: string;
  source_id: string | null;
  product_id: number | null;
  tipo: TipoDocumentoMovimiento;
  numero: string | null;
  ruta: string | null;
}

// ─── Reservas (stock_reservations) ───────────────────────────────────────────

/** Ítem de `reserve_stock_for_web_order` / `fn_stock_reservar` / `fn_stock_liberar_reserva`. Se expande la receta en el servidor. */
export interface ItemReserva {
  product_id: number;
  quantity: number;
}

/** Respuesta de `fn_stock_reservar` y `reserve_stock_for_web_order`. */
export interface ResultadoReserva {
  ok: boolean;
  /** El documento ya tenía una reserva activa: no se reservó dos veces. */
  ya_reservado?: boolean;
  reservas?: { product_id: number; qty: number }[];
  /** Solo la tienda web (todo o nada): faltantes que impidieron reservar. */
  shortages?: { product_id: number; available: number; requested: number }[];
  /** Panel/CRM: reservado aunque no alcanzara (P5), para avisar. */
  sin_disponible?: { product_id: number; available: number; requested: number }[];
}

/** Respuesta de `fn_stock_liberar_reserva` y `release_stock_for_order`. */
export interface ResultadoLiberacion {
  ok: boolean;
  items_released?: number;
  already_released?: boolean;
  error?: string;
}

// ─── Entrada por compra (fn_kardex_entrada_compra) ───────────────────────────

export type OrigenCompra = 'purchase' | 'purchase_order' | 'purchase_invoice';

export interface LineaEntradaCompra {
  product_id: number;
  qty: number;
  /** Costo unitario neto (sin IVA descontable). */
  unit_cost: number;
  lot_id?: number | null;
  note?: string | null;
}

export type MotivoLineaSaltada = 'no_product' | 'invalid_qty' | 'product_not_found' | 'not_tracked';

export interface ResultadoEntradaCompra {
  ya_recepcionado: boolean;
  procesadas: {
    product_id: number;
    product_name: string;
    qty: number;
    unit_cost: number;
    avg_cost: number;
    lot_id: number | null;
    movement_id: number;
  }[];
  saltadas: { product_id: number | null; product_name?: string; reason: MotivoLineaSaltada }[];
}

// ─── Lotes (lots + stock_levels.lot_id) ──────────────────────────────────────

/** Lote con existencia en una sucursal, como lo pinta `kit/inventario/LotPicker`. */
export interface LoteDisponible {
  lot_id: number;
  lot_code: string;
  /** Día calendario `YYYY-MM-DD` (columna `date`: se muestra con formatPlainDate, nunca con zona). */
  expiry_date: string | null;
  qty_on_hand: number;
}

export type EstadoVencimiento = 'vigente' | 'por_vencer' | 'vencido' | 'sin_vencimiento';

// ─── Contratos de las RPC que implementan los bloques B1–B9 ─────────────────
// Firmas acordadas en INVENTARIO-PLAN.md §3.2. Todas: SECURITY DEFINER,
// fn_inventario_exigir_permiso, REVOKE … FROM anon, public, y el movimiento por
// fn_inv_int_mover. Cambiar una firma aquí exige avisar al bloque dueño.

/** B1 · `fn_stock_registrar_movimiento` (diálogos «Registrar entrada/salida»). Permiso: `ajustar`. */
export interface ParamsRegistrarMovimiento {
  p_org: number;
  p_branch: number;
  p_product: number;
  p_lot: number | null;
  p_direccion: DireccionMovimiento;
  p_qty: number;
  /** Entradas: costo unitario (recalcula el promedio). Salidas: se ignora (promedio de la fila). */
  p_costo: number | null;
  p_motivo: string;
}

/** B1 · `fn_lote_guardar` (alta/edición de lote). Permiso: `crear` o `editar_catalogo`. */
export interface ParamsLoteGuardar {
  p_org: number;
  p_lote: {
    id?: number;
    product_id: number;
    lot_code: string;
    expiry_date?: string | null;
    supplier_id?: number | null;
    branch_id?: number | null;
    notes?: string | null;
  };
}

/** B2 · `fn_ajuste_aplicar` (idempotente; congela «sistema al contar»). Permiso: `ajustar`. */
export interface ParamsAjusteAplicar {
  p_org: number;
  p_ajuste_id: number;
  p_clave_idempotencia: string;
}

/** B3 · `fn_traslado_despachar` / `fn_traslado_recibir` (P7). Permiso: `trasladar`. */
export interface ParamsTrasladoRecibir {
  p_org: number;
  p_traslado_id: number;
  p_lineas: { item_id: number; recibido: number; motivo_diferencia?: string | null }[];
  p_clave_idempotencia: string;
}

/** B5 · `complete_production_order` v2 (costo del terminado = Σ consumos ÷ producido). Permiso: `producir`. */
export interface ParamsCompletarProduccion {
  p_order_id: number;
  p_produced_qty: number;
  p_updated_by?: string | null;
}

/**
 * B8 · `fn_oc_recepcionar` (recepción de OC en una transacción). Permiso: `recibir` (P6).
 * `qty` es lo que llega AHORA. Contrato completo, respuesta y errores en
 * `@/lib/services/inventario/recepcionOrdenCompra`.
 */
export interface ParamsRecepcionOC {
  p_org: number;
  p_po_uuid: string;
  p_lineas: {
    po_item_id: number;
    product_id?: number;
    qty: number;
    /** Lote existente (`lot_id`) o nuevo (`lot_code` + `expiry_date`); la suma debe ser `qty`. */
    lotes?: { lot_id?: number; lot_code?: string | null; expiry_date?: string | null; qty: number }[];
    seriales?: string[];
  }[];
  p_clave_idempotencia: string;
  p_notas?: string | null;
}

/** B9 · `fn_pedido_web_confirmar_stock` (descuenta con receta, libera la reserva exacta, vende seriales). */
export interface ParamsPedidoWebConfirmarStock {
  p_order_id: string;
}
