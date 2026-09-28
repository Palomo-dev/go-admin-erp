/**
 * Stock del producto por sucursal: estado frente al mínimo y totales según la
 * sucursal activa del selector global. Mismo criterio que «stock bajo» del
 * catálogo: bajo mínimo si hay mínimo > 0 y el disponible ≤ mínimo.
 */

export interface StockSucursalBasico {
  branch_id: number;
  qty_on_hand: number;
  qty_reserved: number;
  min_level: number;
  con_registro?: boolean;
}

export type EstadoStock = 'sin_registro' | 'agotado' | 'bajo_minimo' | 'disponible';

export function estadoStockSucursal(s: StockSucursalBasico): EstadoStock {
  if (s.con_registro === false) return 'sin_registro';
  const disponible = s.qty_on_hand - s.qty_reserved;
  if (disponible <= 0) return 'agotado';
  if (s.min_level > 0 && disponible <= s.min_level) return 'bajo_minimo';
  return 'disponible';
}

export const TONO_ESTADO_STOCK: Record<EstadoStock, 'neutro' | 'peligro' | 'advertencia' | 'exito'> = {
  sin_registro: 'neutro',
  agotado: 'peligro',
  bajo_minimo: 'advertencia',
  disponible: 'exito',
};

export interface TotalesStock {
  enExistencia: number;
  reservado: number;
  disponible: number;
  minimo: number;
  sucursales: number;
  bajoMinimo: number;
  agotadas: number;
}

/** Totales de las sucursales visibles (`branchId` null = todas). */
export function totalesStock(sucursales: readonly StockSucursalBasico[], branchId: number | null = null): TotalesStock {
  const visibles = branchId === null ? sucursales : sucursales.filter((s) => s.branch_id === branchId);
  return visibles.reduce<TotalesStock>(
    (t, s) => {
      const estado = estadoStockSucursal(s);
      return {
        enExistencia: t.enExistencia + s.qty_on_hand,
        reservado: t.reservado + s.qty_reserved,
        disponible: t.disponible + (s.qty_on_hand - s.qty_reserved),
        minimo: t.minimo + s.min_level,
        sucursales: t.sucursales + 1,
        bajoMinimo: t.bajoMinimo + (estado === 'bajo_minimo' ? 1 : 0),
        agotadas: t.agotadas + (estado === 'agotado' ? 1 : 0),
      };
    },
    { enExistencia: 0, reservado: 0, disponible: 0, minimo: 0, sucursales: 0, bajoMinimo: 0, agotadas: 0 },
  );
}

/** Valor del inventario de una fila: existencia × costo promedio. */
export function valorInventario(qty: number, costoPromedio: number): number {
  return Math.round(qty * costoPromedio * 100) / 100;
}

/** Stock inicial del formulario: total de unidades y valor (cantidad × costo unitario). */
export function totalesStockInicial(
  filas: readonly { qty: number | null; unit_cost: number | null }[],
  costoPorDefecto: number | null,
): { unidades: number; valor: number } {
  return filas.reduce(
    (t, f) => {
      const qty = f.qty ?? 0;
      const costo = f.unit_cost ?? costoPorDefecto ?? 0;
      return { unidades: t.unidades + qty, valor: Math.round((t.valor + qty * costo) * 100) / 100 };
    },
    { unidades: 0, valor: 0 },
  );
}
