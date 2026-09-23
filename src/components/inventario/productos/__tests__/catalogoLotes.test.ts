/// <reference types="jest" />
/**
 * Carga del catálogo por lotes (RPC `catalogo_productos_lote`).
 *
 * Dos regresiones que cubre:
 * - El badge de stock por sucursal pintaba solo las filas del padre; un
 *   producto con variantes tiene casi todo su stock en ellas.
 * - La exportación CSV sacaba las variantes con precio, costo y stock en 0
 *   porque nunca se cargaban.
 */

const rpc = jest.fn();
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  stockPorSucursalConVariantes,
  mapearFilaCatalogo,
  cargarCatalogo,
  PRIMER_LOTE,
  LOTE,
} from '../catalogoLotes';
import { stockVisibleDe } from '../stockVisible';

const CENTRO = 10;
const NORTE = 20;

function padreConVariantes() {
  return {
    id: 1,
    organization_id: 120,
    name: 'Camiseta básica',
    category_id: 5,
    category: { id: 5, name: 'Ropa' },
    track_stock: true,
    is_parent: true,
    product_prices: [{ price: 50000, compare_price: 60000 }],
    product_costs: [{ cost: 20000 }],
    stock_levels: [{ branch_id: CENTRO, qty_on_hand: 1, qty_reserved: 0 }],
    product_images: [{ storage_path: 'products/a.jpg', is_primary: true }],
    children: [
      {
        id: 11, sku: 'CAM-S', name: 'Camiseta básica S', track_stock: true,
        price: 52000, compare_price: null, cost: 21000,
        stock_levels: [
          { branch_id: CENTRO, qty_on_hand: 4, qty_reserved: 1 },
          { branch_id: NORTE, qty_on_hand: 7, qty_reserved: 0 },
        ],
      },
      {
        id: 12, sku: 'CAM-M', name: 'Camiseta básica M', track_stock: true,
        price: null, compare_price: null, cost: null,
        stock_levels: [{ branch_id: NORTE, qty_on_hand: 3, qty_reserved: 0 }],
      },
    ],
  };
}

describe('stockPorSucursalConVariantes', () => {
  it('suma padre y variantes por sucursal', () => {
    const p = padreConVariantes();
    expect(stockPorSucursalConVariantes(p.stock_levels, p.children)).toEqual([
      { branch_id: CENTRO, qty_on_hand: 5, qty_reserved: 1 },
      { branch_id: NORTE, qty_on_hand: 10, qty_reserved: 0 },
    ]);
  });

  it('sin variantes devuelve las filas propias', () => {
    expect(stockPorSucursalConVariantes([{ branch_id: CENTRO, qty_on_hand: '2.5' }], [])).toEqual([
      { branch_id: CENTRO, qty_on_hand: 2.5, qty_reserved: 0 },
    ]);
  });
});

describe('mapearFilaCatalogo', () => {
  const fila = mapearFilaCatalogo(padreConVariantes());

  it('el badge por sucursal y el orden por stock ven las variantes', () => {
    expect(stockVisibleDe(fila, NORTE)).toBe(10);
    expect(stockVisibleDe(fila, CENTRO)).toBe(5);
    expect(stockVisibleDe(fila, null)).toBe(15);
  });

  it('el total disponible descuenta lo reservado', () => {
    expect(fila.stock).toBe(14);
  });

  it('las variantes traen su precio, costo y stock (para la exportación)', () => {
    const [s, m] = fila.children!;
    expect(s.price).toBe(52000);
    expect(s.cost).toBe(21000);
    expect(s.stock).toBe(10);
    expect(s.category?.name).toBe('Ropa');
    expect(m.price).toBe(0);
    expect(m.product_prices).toEqual([]);
  });

  it('precio, comparación, costo e imagen principal del padre', () => {
    expect(fila.price).toBe(50000);
    expect(fila.compare_price).toBe(60000);
    expect(fila.cost).toBe(20000);
    expect(fila.image_url).toBe('products/a.jpg');
  });

  it('sin seguimiento de inventario no hay stock', () => {
    const f = mapearFilaCatalogo({ ...padreConVariantes(), track_stock: false });
    expect(f.stock).toBeUndefined();
  });
});

describe('cargarCatalogo', () => {
  const params = { organizationId: 120, busqueda: '', categoria: null, estado: null, ordenarPor: 'name' };
  const TOTAL = PRIMER_LOTE + LOTE * 2 + 5;

  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation(async (_fn: string, args: any) => {
      const desde = args.p_offset;
      const hasta = Math.min(desde + args.p_limit, TOTAL);
      // El segundo lote tarda más que el tercero: llega después.
      if (desde === PRIMER_LOTE) await new Promise((r) => setTimeout(r, 20));
      const items = [];
      for (let i = desde; i < hasta; i++) items.push({ id: i + 1, name: `P${i}`, track_stock: false });
      return { data: { items, total: TOTAL }, error: null };
    });
  });

  it('publica los lotes en orden aunque lleguen desordenados', async () => {
    const avances: number[] = [];
    let primero = 0;
    const lista = await cargarCatalogo(params, {
      cancelado: () => false,
      alPrimerLote: (p) => { primero = p.length; },
      alAvanzar: (p) => avances.push(p.length),
    });
    expect(primero).toBe(PRIMER_LOTE);
    expect(lista!.map((p) => p.id)).toEqual(Array.from({ length: TOTAL }, (_, i) => i + 1));
    // Nunca se publica el tercer lote sin el segundo: los avances crecen en orden.
    expect(avances[avances.length - 1]).toBe(TOTAL);
    expect([...avances].sort((a, b) => a - b)).toEqual(avances);
  });

  it('si se cancela no devuelve nada', async () => {
    let cancelado = false;
    const lista = await cargarCatalogo(params, {
      cancelado: () => cancelado,
      alPrimerLote: () => { cancelado = true; },
    });
    expect(lista).toBeNull();
  });
});
