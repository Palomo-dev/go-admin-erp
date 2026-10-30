/**
 * Lógica pura de la pantalla «Stock sin seriales» (filtros y totales).
 * El cálculo de las filas no cambia: lo hace `fn_reporte_stock_sin_seriales`.
 */
import type { FilaStockSinSerial } from '@/lib/services/seriales/contrato';

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Filtra por sucursal (null = todas) y por texto en producto o SKU (sin tildes ni mayúsculas). */
export function filtrarStockSinSeriales(
  filas: readonly FilaStockSinSerial[],
  sucursal: number | null,
  busqueda: string,
): FilaStockSinSerial[] {
  const q = normalizar(busqueda);
  return filas.filter(
    (f) =>
      (sucursal == null || Number(f.branch_id) === sucursal) &&
      (!q || normalizar(f.nombre ?? '').includes(q) || normalizar(f.sku ?? '').includes(q)),
  );
}

export interface TotalesStockSinSeriales {
  productos: number;
  sucursales: number;
  existencia: number;
  seriales: number;
  sinSerial: number;
}

export function totalesStockSinSeriales(filas: readonly FilaStockSinSerial[]): TotalesStockSinSeriales {
  return {
    productos: new Set(filas.map((f) => f.product_id)).size,
    sucursales: new Set(filas.map((f) => f.branch_id)).size,
    existencia: filas.reduce((s, f) => s + num(f.qty_on_hand), 0),
    seriales: filas.reduce((s, f) => s + num(f.seriales), 0),
    sinSerial: filas.reduce((s, f) => s + num(f.sin_serial), 0),
  };
}

/** Sucursales presentes en el reporte, para el filtro (ordenadas por nombre). */
export function sucursalesDelReporte(filas: readonly FilaStockSinSerial[]): { id: number; nombre: string }[] {
  const m = new Map<number, string>();
  for (const f of filas) m.set(Number(f.branch_id), f.sucursal);
  return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
