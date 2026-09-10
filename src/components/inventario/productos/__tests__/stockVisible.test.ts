/// <reference types="jest" />
/**
 * Regresión del orden por stock en el catálogo de productos.
 *
 * La columna pintaba `qty_on_hand` de la sucursal filtrada, pero el
 * comparador ordenaba por `producto.stock` (todas las sucursales, menos
 * reservas, más el stock de las variantes hijas). Al ordenar ascendente
 * salía la secuencia 49, 50, 47, 49… — desordenada a la vista, porque el
 * criterio no era el número mostrado.
 */

import { stockVisibleDe, claveOrdenStock, type ProductoConStock } from '../stockVisible';

const SUCURSAL = 110;
const OTRA = 999;

/** Producto con el desajuste real: lo visible (110) difiere del total. */
function producto(visibleEnSucursal: number, totalPrecalculado: number): ProductoConStock {
  return {
    track_stock: true,
    stock: totalPrecalculado, // lo que usaba el comparador viejo
    stock_levels: [
      { branch_id: SUCURSAL, qty_on_hand: visibleEnSucursal },
      { branch_id: OTRA, qty_on_hand: 1000 },
    ],
  };
}

describe('stockVisibleDe', () => {
  it('con sucursal filtrada devuelve solo esa sucursal', () => {
    expect(stockVisibleDe(producto(49, 812), SUCURSAL)).toBe(49);
  });

  it('sin filtro suma todas las sucursales', () => {
    expect(stockVisibleDe(producto(49, 812), null)).toBe(1049);
  });

  it('devuelve 0 si la sucursal elegida no tiene fila', () => {
    const p: ProductoConStock = { track_stock: true, stock: 500, stock_levels: [{ branch_id: OTRA, qty_on_hand: 7 }] };
    expect(stockVisibleDe(p, SUCURSAL)).toBe(0);
  });

  it('devuelve null si el producto no rastrea inventario', () => {
    expect(stockVisibleDe({ track_stock: false, stock_levels: [] }, SUCURSAL)).toBeNull();
  });

  it('tolera qty_on_hand como texto (numeric de Postgres)', () => {
    const p: ProductoConStock = { track_stock: true, stock_levels: [{ branch_id: SUCURSAL, qty_on_hand: '49.000' }] };
    expect(stockVisibleDe(p, SUCURSAL)).toBe(49);
  });
});

describe('orden por stock', () => {
  const ordenar = (ps: ProductoConStock[], dir: 'asc' | 'desc') =>
    [...ps]
      .sort((a, b) => {
        const va = claveOrdenStock(a, SUCURSAL, dir);
        const vb = claveOrdenStock(b, SUCURSAL, dir);
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
      })
      .map((p) => stockVisibleDe(p, SUCURSAL));

  // Los totales precalculados van a propósito en desorden respecto a lo visible:
  // es justo lo que rompía el orden antes.
  const CATALOGO = [producto(49, 812), producto(50, 133), producto(47, 990), producto(48, 4)];

  it('ascendente ordena por el número que se ve, de menor a mayor', () => {
    expect(ordenar(CATALOGO, 'asc')).toEqual([47, 48, 49, 50]);
  });

  it('descendente ordena de mayor a menor', () => {
    expect(ordenar(CATALOGO, 'desc')).toEqual([50, 49, 48, 47]);
  });

  it('deja "sin seguimiento" al final en AMBAS direcciones', () => {
    const sinSeguimiento: ProductoConStock = { track_stock: false, stock_levels: [] };
    const conSinSeguimiento = [...CATALOGO, sinSeguimiento];

    expect(ordenar(conSinSeguimiento, 'asc')).toEqual([47, 48, 49, 50, null]);
    expect(ordenar(conSinSeguimiento, 'desc')).toEqual([50, 49, 48, 47, null]);
  });

  it('los de inventario más bajo salen primero al ordenar ascendente', () => {
    const conCeros = [...CATALOGO, producto(0, 700), producto(3, 850)];
    expect(ordenar(conCeros, 'asc').slice(0, 3)).toEqual([0, 3, 47]);
  });
});
