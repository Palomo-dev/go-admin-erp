/**
 * Resolución del precio por sede en el cliente (docs/inventario/PRECIOS-POR-SEDE.md):
 * sede → general, con la ÚNICA regla de vigencia (`precioVigente`), y su uso
 * en el carrito del POS. Retrocompatibilidad: sin filas de sede, exactamente
 * el resultado de antes.
 *
 * Datos inventados: organización 120, sucursal 7.
 */
const mockRespuestas: Record<string, { data: unknown; error: unknown }> = {};
const mockConsultas: Array<{ tabla: string; filtros: unknown[][] }> = [];
const mockSucursal: { id: number | null } = { id: 7 };

jest.mock('@/lib/supabase/config', () => {
  const tabla = (nombre: string) => {
    const registro = { tabla: nombre, filtros: [] as unknown[][] };
    mockConsultas.push(registro);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gt', 'gte', 'lte', 'or', 'not']) {
      chain[m] = (...args: unknown[]) => {
        registro.filtros.push([m, ...args]);
        return chain;
      };
    }
    const respuesta = () => mockRespuestas[nombre] ?? { data: [], error: null };
    chain.maybeSingle = () => Promise.resolve(respuesta());
    chain.single = () => Promise.resolve(respuesta());
    chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(respuesta()).then(ok, ko);
    return chain;
  };
  return { supabase: { from: tabla } };
});
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => mockSucursal.id,
  getCurrentBranchIdWithFallback: () => mockSucursal.id ?? 7,
  getCurrentUserId: () => 'user-1',
}));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({
  getPosDisplayEmitter: () => ({ onCartsSaved: () => undefined, setMode: () => undefined, setTotals: () => undefined }),
}));

import { POSService } from '@/lib/services/posService';
import {
  ProductoSinPrecioError,
  importePrecioVigente,
  importePrecioVigenteEnSede,
  precioVigente,
  precioVigenteEnSede,
  type FilaPrecio,
} from '@/lib/pos/precioVigente';
import type { Product } from '@/components/pos/types';
import { almacen, carrito, guardarCarritos, instalarAlmacen } from '../../pos/venta/utilesServicio';

const AHORA = new Date('2026-10-05T15:00:00Z');
const fila = (price: string, desde: string, hasta: string | null = null): FilaPrecio => ({ price, effective_from: desde, effective_to: hasta });

describe('precioVigenteEnSede (regla pura)', () => {
  const general = [fila('18000', '2026-01-01T00:00:00Z')];

  it('el precio vigente de la sede manda sobre el general', () => {
    const sede = [fila('20000', '2026-09-01T00:00:00Z')];
    expect(precioVigenteEnSede(sede, general, AHORA)).toEqual({ fila: sede[0], origen: 'sede' });
    expect(importePrecioVigenteEnSede(sede, general, AHORA)).toBe(20000);
  });

  it('sin precio de sede vigente (vencido, programado o ninguno) rige el general', () => {
    expect(importePrecioVigenteEnSede([fila('20000', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')], general, AHORA)).toBe(18000);
    expect(importePrecioVigenteEnSede([fila('20000', '2026-10-06T00:00:00Z')], general, AHORA)).toBe(18000);
    expect(importePrecioVigenteEnSede([], general, AHORA)).toBe(18000);
    expect(importePrecioVigenteEnSede(null, general, AHORA)).toBe(18000);
    expect(precioVigenteEnSede(undefined, general, AHORA)?.origen).toBe('general');
  });

  it('varias filas de sede: la de effective_from más reciente entre las vigentes', () => {
    const sede = [fila('19000', '2026-08-01T00:00:00Z'), fila('21000', '2026-09-15T00:00:00Z'), fila('25000', '2026-11-01T00:00:00Z')];
    expect(importePrecioVigenteEnSede(sede, general, AHORA)).toBe(21000);
  });

  it('un precio de sede 0 es un precio (no cae al general)', () => {
    expect(importePrecioVigenteEnSede([fila('0', '2026-09-01T00:00:00Z')], general, AHORA)).toBe(0);
  });

  it('ni sede ni general → null', () => {
    expect(precioVigenteEnSede([], [], AHORA)).toBeNull();
    expect(importePrecioVigenteEnSede(null, null, AHORA)).toBeNull();
  });

  it('retrocompatibilidad: sin filas de sede es EXACTAMENTE precioVigente(general), caso por caso', () => {
    const casos: FilaPrecio[][] = [
      [],
      [fila('1', '2026-01-01T00:00:00Z')],
      [fila('1', '2026-01-01T00:00:00Z', '2026-10-05T15:00:00Z'), fila('2', '2026-10-05T15:00:00Z')],
      [fila('3', '2026-10-05T15:00:01Z')],
      [fila('4', '2026-02-01T00:00:00Z'), fila('5', '2026-03-01T00:00:00Z', null), fila('6', '2026-01-01T00:00:00Z')],
      [fila('7', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')],
    ];
    for (const g of casos) {
      expect(precioVigenteEnSede([], g, AHORA)?.fila ?? null).toBe(precioVigente(g, AHORA));
      expect(importePrecioVigenteEnSede(undefined, g, AHORA)).toBe(importePrecioVigente(g, AHORA));
    }
  });
});

describe('carrito del POS con precio de sede', () => {
  const producto = { id: 1001, name: 'Hamburguesa' } as Product;
  const general = { data: [{ price: '18000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null };

  beforeAll(() => instalarAlmacen());
  beforeEach(() => {
    almacen.clear();
    guardarCarritos([carrito('cart-1')]);
    for (const k of Object.keys(mockRespuestas)) delete mockRespuestas[k];
    mockConsultas.length = 0;
    mockSucursal.id = 7;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  const consultasA = (t: string) => mockConsultas.filter((c) => c.tabla === t);

  it('con precio propio de la sucursal, la línea toma ese precio y lo busca en ESA sucursal', async () => {
    mockRespuestas.product_prices = general;
    mockRespuestas.product_branch_prices = {
      data: [{ product_id: 1001, price: '20000', compare_price: null, effective_from: '2026-09-01T00:00:00Z', effective_to: null }],
      error: null,
    };
    const cart = await POSService.addItemToCart('cart-1', producto, 2);
    expect(cart.items[0]).toMatchObject({ unit_price: 20000, total: 40000 });
    expect(consultasA('product_branch_prices')[0].filtros).toContainEqual(['eq', 'branch_id', 7]);
  });

  it('sin precio de la sucursal: exactamente el general de antes', async () => {
    mockRespuestas.product_prices = general;
    const cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0].unit_price).toBe(18000);
  });

  it('sin sucursal elegida («Todas») no consulta precios de sede: general', async () => {
    mockSucursal.id = null;
    mockRespuestas.product_prices = general;
    const cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0].unit_price).toBe(18000);
    expect(consultasA('product_branch_prices')).toHaveLength(0);
  });

  it('si la lectura del precio de sede falla, NO entra con el general: avisa (el servidor validaría otro precio)', async () => {
    mockRespuestas.product_prices = general;
    mockRespuestas.product_branch_prices = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    await expect(POSService.addItemToCart('cart-1', producto, 1)).rejects.toMatchObject({
      name: 'ProductoSinPrecioError',
      causa: 'consulta_fallida',
    });
  });

  it('migración aún sin aplicar (tabla ausente): general, sin error', async () => {
    mockRespuestas.product_prices = general;
    mockRespuestas.product_branch_prices = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.product_branch_prices'" } };
    const cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0].unit_price).toBe(18000);
  });

  it('sin precio de sede ni general sigue siendo ProductoSinPrecioError', async () => {
    await expect(POSService.addItemToCart('cart-1', producto, 1)).rejects.toBeInstanceOf(ProductoSinPrecioError);
  });
});
