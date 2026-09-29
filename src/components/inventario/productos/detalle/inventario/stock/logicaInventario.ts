/**
 * Lógica pura de la pestaña «Inventario» del detalle de producto (stock por
 * sucursal, desglose por variante, lotes y kardex) y de la tabla de stock
 * inicial del formulario. Sin React: la prueban los tests.
 */

// ── Rutas a otros módulos ─────────────────────────────────────────────────

export type TipoAjuste = 'entrada' | 'salida';

/**
 * Nuevo ajuste con el producto, el tipo y la sucursal preseleccionados.
 * `NuevoAjusteForm` lee `producto_id` (o `productId`), `type` (entrada →
 * gain, salida → loss) y `branchId`. Sin `productId` (producto padre: el
 * ajuste solo admite variantes) se abre con la sucursal y el tipo.
 */
export function rutaAjuste(productId: number | null, tipo: TipoAjuste | null, branchId?: number | null): string {
  const p = new URLSearchParams();
  if (productId) p.set('producto_id', String(productId));
  if (tipo) p.set('type', tipo);
  if (branchId) p.set('branchId', String(branchId));
  const qs = p.toString();
  return qs ? `/app/inventario/ajustes/nuevo?${qs}` : '/app/inventario/ajustes/nuevo';
}

/**
 * Nueva transferencia con el producto y la sucursal de origen
 * (`NuevaTransferenciaForm` lee `producto_id` y `origen`).
 */
export function rutaTransferencia(productId: number | null, origenId?: number | null): string {
  const p = new URLSearchParams();
  if (productId) p.set('producto_id', String(productId));
  if (origenId) p.set('origen', String(origenId));
  const qs = p.toString();
  return qs ? `/app/inventario/transferencias/nuevo?${qs}` : '/app/inventario/transferencias/nuevo';
}

/** Kardex completo del módulo filtrado por el producto (la página lee `producto`). */
export function rutaKardexCompleto(productId: number): string {
  return `/app/inventario/kardex?producto=${productId}`;
}

/** Kardex filtrado por un lote (y su producto): la página lee `producto` y `lote`. */
export function rutaKardexLote(productId: number, lotId: number): string {
  return `/app/inventario/kardex?producto=${productId}&lote=${lotId}`;
}

/** Lotes del módulo filtrados por el producto (la página lee `producto`). */
export function rutaLotesProducto(productId: number): string {
  return `/app/inventario/lotes?producto=${productId}`;
}

/**
 * Ajuste por conteo (B2) con la sucursal y, si llegan, los productos contados.
 * `NuevoAjusteForm` lee `producto_id` y `branchId`; `modo=conteo` y `productos`
 * (lista separada por comas) quedan para el formulario de conteo de B2.
 */
export function rutaAjustePorConteo(productIds: readonly number[], branchId?: number | null): string {
  const p = new URLSearchParams({ modo: 'conteo' });
  if (productIds.length === 1) p.set('producto_id', String(productIds[0]));
  if (productIds.length > 1) p.set('productos', productIds.join(','));
  if (branchId) p.set('branchId', String(branchId));
  return `/app/inventario/ajustes/nuevo?${p.toString()}`;
}

// ── Stock por variante ────────────────────────────────────────────────────

export interface FilaStockLevel {
  product_id: number;
  branch_id: number;
  qty_on_hand: number | string | null;
  qty_reserved: number | string | null;
  min_level: number | string | null;
  avg_cost: number | string | null;
  updated_at: string | null;
}

export interface StockVarianteSucursal {
  product_id: number;
  branch_id: number;
  qty_on_hand: number;
  qty_reserved: number;
  disponible: number;
  min_level: number;
  avg_cost: number;
  actualizado: string | null;
  con_registro: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Suma las filas de `stock_levels` por (producto, sucursal): una variante con
 * lotes tiene varias filas por sucursal. El costo promedio se pondera por la
 * existencia y el mínimo es el mayor de las filas (vive en la fila sin lote).
 */
export function agregarStockLevels(filas: readonly FilaStockLevel[]): Map<string, StockVarianteSucursal> {
  const acumulado = new Map<string, StockVarianteSucursal & { valor: number }>();
  for (const f of filas) {
    const clave = claveVarianteSucursal(f.product_id, f.branch_id);
    const qty = num(f.qty_on_hand);
    const previo = acumulado.get(clave) ?? {
      product_id: f.product_id,
      branch_id: f.branch_id,
      qty_on_hand: 0,
      qty_reserved: 0,
      disponible: 0,
      min_level: 0,
      avg_cost: 0,
      actualizado: null,
      con_registro: true,
      valor: 0,
    };
    const valor = previo.valor + qty * num(f.avg_cost);
    const existencia = previo.qty_on_hand + qty;
    const reservado = previo.qty_reserved + num(f.qty_reserved);
    acumulado.set(clave, {
      ...previo,
      qty_on_hand: existencia,
      qty_reserved: reservado,
      disponible: existencia - reservado,
      min_level: Math.max(previo.min_level, num(f.min_level)),
      avg_cost: existencia > 0 ? Math.round((valor / existencia) * 10000) / 10000 : Math.max(previo.avg_cost, num(f.avg_cost)),
      actualizado:
        !previo.actualizado || (f.updated_at && f.updated_at > previo.actualizado) ? f.updated_at ?? previo.actualizado : previo.actualizado,
      valor,
    });
  }
  const salida = new Map<string, StockVarianteSucursal>();
  acumulado.forEach((fila, clave) => {
    const resto: StockVarianteSucursal & { valor?: number } = { ...fila };
    delete resto.valor;
    salida.set(clave, resto);
  });
  return salida;
}

export function claveVarianteSucursal(productId: number, branchId: number): string {
  return `${productId}:${branchId}`;
}

// ── Kardex ─────────────────────────────────────────────────────────────────
//
// El tipo del movimiento, su tono y el documento salen del kit de B0
// (`BadgeOrigenMovimiento`, `EnlaceDocumento` + `fn_inv_documentos`): aquí ya no
// hay un segundo mapa de orígenes ni de rutas. El vencimiento de los lotes, de
// `BadgeVencimiento` y el estado que calcula `fn_lotes_listado`.

/** Tope de filas del CSV del kardex (se piden en páginas de 500). */
export const TOPE_EXPORTAR_KARDEX = 10000;
export const PAGINA_EXPORTAR_KARDEX = 500;

/** Celda CSV con `;` como separador: entre comillas si hace falta, sin saltos de línea. */
export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor).replace(/[\r\n]+/g, ' ');
  return /[;"]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function armarCsv(filas: readonly (readonly (string | number | null | undefined)[])[]): string {
  return `﻿${filas.map((f) => f.map(celdaCsv).join(';')).join('\r\n')}`;
}

/** Nombre de archivo seguro («kardex-ZAP-0042-2026-09-23.csv»). */
export function nombreArchivoKardex(sku: string, hoy: string): string {
  const limpio = sku.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'producto';
  return `kardex-${limpio}-${hoy}.csv`;
}
