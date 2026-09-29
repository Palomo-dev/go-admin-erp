/**
 * Membresías en el POS (docs/design/MEMBRESIAS-FASE-1-2.md §4 y §9 P1/P4):
 * - P1 (decisión del dueño, amplía L33): una línea membresía exige cliente;
 *   «Cobrar» pasa a `sin-cliente` y, al agregarla sin cliente, se pide (D1).
 * - El resultado de `pos_checkout_v1` trae `membresias` y el POS las pasa al
 *   post-venta (D2); la confirmación web las activa con la RPC y nunca lanza.
 * - El enlace `/app/pos?cliente=&producto=` (renovar) se lee con lista blanca.
 */
import { estadoBotonCobrar, puedeRegistrarDeuda } from '@/lib/pos/venta/requisitosCarrito';
import {
  carritoTieneMembresia,
  claveEnlacePos,
  debePedirCliente,
  esErrorMembresiaSinCliente,
  estadoVisualVendida,
  leerEnlacePos,
  leerMembresiasVendidas,
  lineaParaQuitar,
  membresiaSinCliente,
  rutaMembresia,
} from '@/lib/pos/venta/membresias';
import { callCheckoutRpc, __resetCheckoutRpcForTests, type CheckoutEnvelope } from '@/lib/offline/checkoutRpc';
import { activarMembresiasVentaWeb } from '@/lib/services/webOrderServerConfirmation';
import type { Cart, CartItem, Product } from '@/components/pos/types';

// webOrderServerConfirmation arrastra el cliente del navegador (invoiceUtils): no se usa aquí.
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const producto = (id: number, service_type: string | null = null) => ({ id, name: `P${id}`, service_type }) as Product;
const linea = (id: string, p: Product, quantity = 1) => ({ id, product_id: p.id, product: p, quantity }) as CartItem;
const carrito = (items: CartItem[], extra: Partial<Cart> = {}) =>
  ({ id: 'c1', status: 'active', items, customer_id: undefined, ...extra }) as Cart;

const MEMBRESIA = producto(7, 'membership');
const CAFE = producto(3, 'standard');
const SIMPLE = producto(4);

describe('P1 · «Cobrar» con una membresía sin cliente', () => {
  it('sin cliente: `sin-cliente` (antes que la caja: abrirla no basta)', () => {
    const c = carrito([linea('l1', CAFE), linea('l2', MEMBRESIA)]);
    expect(estadoBotonCobrar({ caja: true, carrito: c })).toBe('sin-cliente');
    expect(estadoBotonCobrar({ caja: false, carrito: c })).toBe('sin-cliente');
  });

  it('con cliente vuelve a las reglas de siempre (L35 + D4)', () => {
    const c = carrito([linea('l2', MEMBRESIA)], { customer_id: 'cli-1' });
    expect(estadoBotonCobrar({ caja: true, carrito: c })).toBe('listo');
    expect(estadoBotonCobrar({ caja: false, carrito: c })).toBe('sin-caja');
    expect(estadoBotonCobrar({ caja: false, config: { requiereCaja: false }, carrito: c })).toBe('listo');
  });

  it('en espera o en deuda sigue `bloqueado`; vacío sigue `vacio`', () => {
    expect(estadoBotonCobrar({ caja: true, carrito: carrito([linea('l2', MEMBRESIA)], { status: 'hold' }) })).toBe('bloqueado');
    expect(estadoBotonCobrar({ caja: true, carrito: carrito([], {}) })).toBe('vacio');
  });

  it('sin membresía no exige cliente (la regla L33 solo se amplía a membresías)', () => {
    expect(estadoBotonCobrar({ caja: true, carrito: carrito([linea('l1', CAFE), linea('l3', SIMPLE)]) })).toBe('listo');
    // Líneas sin producto cargado (carritos viejos): no se rompe.
    expect(estadoBotonCobrar({ caja: true, carrito: { status: 'active', items: [{ id: 'x' }] } as unknown as Cart })).toBe('listo');
  });

  it('una línea membresía en cantidad 0 no cuenta', () => {
    expect(membresiaSinCliente(carrito([linea('l2', MEMBRESIA, 0)]))).toBe(false);
    expect(carritoTieneMembresia(carrito([linea('l2', MEMBRESIA, 2)]))).toBe(true);
  });

  it('«Deuda» no cambia: exige cliente como antes', () => {
    expect(puedeRegistrarDeuda(carrito([linea('l2', MEMBRESIA)]))).toBe(false);
    expect(puedeRegistrarDeuda(carrito([linea('l2', MEMBRESIA)], { customer_id: 'cli-1' }))).toBe(true);
  });
});

describe('D1 · pedir el titular al agregar', () => {
  it('solo una membresía en un carrito sin cliente', () => {
    expect(debePedirCliente(MEMBRESIA, { customer_id: undefined })).toBe(true);
    expect(debePedirCliente(MEMBRESIA, { customer_id: 'cli-1' })).toBe(false);
    expect(debePedirCliente(CAFE, { customer_id: undefined })).toBe(false);
    expect(debePedirCliente(SIMPLE, { customer_id: undefined })).toBe(false);
  });

  it('«Quitar la membresía» deshace solo las unidades recién agregadas', () => {
    const items = [linea('a', MEMBRESIA, 1), linea('b', CAFE), linea('c', MEMBRESIA, 3)];
    // La última línea del producto recibió la suma: se le restan las 2 nuevas.
    expect(lineaParaQuitar(items, MEMBRESIA.id, 2)).toEqual({ itemId: 'c', nuevaCantidad: 1 });
    // Si solo tenía esas unidades, se quita la línea.
    expect(lineaParaQuitar(items, MEMBRESIA.id, 3)).toEqual({ itemId: 'c', nuevaCantidad: 0 });
    expect(lineaParaQuitar(items, 999, 1)).toBeNull();
  });
});

describe('D2 · membresías del resultado', () => {
  const crudo = [
    { id: 42, plan: 'Plan mensual', plan_id: 5, product_id: 7, estado: 'active', desde: '2026-09-28T15:00:00+00:00', hasta: '2026-11-28T04:59:59+00:00', codigo: 'AB12CD34EF', customer_id: 'cli-1' },
    { id: '43', plan: 'Plan anual', plan_id: '6', product_id: null, estado: 'pending', desde: null, hasta: null, codigo: null, customer_id: 'cli-1' },
    { id: null, estado: 'active' },
    { id: 44, estado: 'inventado' },
    'basura',
  ];

  it('lee lo válido y descarta el resto sin lanzar', () => {
    const m = leerMembresiasVendidas(crudo);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({
      id: 42, plan: 'Plan mensual', planId: 5, productId: 7, estado: 'active',
      desde: '2026-09-28T15:00:00+00:00', hasta: '2026-11-28T04:59:59+00:00', codigo: 'AB12CD34EF', customerId: 'cli-1',
    });
    expect(m[1]).toMatchObject({ id: 43, planId: 6, productId: null, estado: 'pending', desde: null, codigo: null });
    expect(leerMembresiasVendidas(undefined)).toEqual([]);
    expect(leerMembresiasVendidas({})).toEqual([]);
  });

  it('«pending» se lee «Por activar» con la venta pagada y «Pendiente de pago» sin pagar', () => {
    expect(estadoVisualVendida('pending', true)).toBe('por_activar');
    expect(estadoVisualVendida('pending', false)).toBe('pendiente_pago');
    expect(estadoVisualVendida('active', true)).toBe('activa');
    expect(estadoVisualVendida('frozen', true)).toBe('congelada');
    expect(estadoVisualVendida('past_due', true)).toBe('en_gracia');
  });

  it('«Ver membresía» va al detalle del módulo', () => {
    expect(rutaMembresia(42)).toBe('/app/membresias/membresias/42');
  });

  it('reconoce el rechazo `membresia_sin_cliente` de la base', () => {
    expect(esErrorMembresiaSinCliente({ message: 'membresia_sin_cliente', code: '22023' })).toBe(true);
    expect(esErrorMembresiaSinCliente({ message: 'membresia_sin_cliente: detalle' })).toBe(true);
    expect(esErrorMembresiaSinCliente({ message: 'deuda_sin_cliente' })).toBe(false);
    expect(esErrorMembresiaSinCliente(null)).toBe(false);
  });
});

describe('pos_checkout_v1 → resultado del cobro', () => {
  beforeEach(() => __resetCheckoutRpcForTests());
  const env = { sale_id: 'venta-1' } as unknown as CheckoutEnvelope;
  const cliente = (data: unknown, error: unknown = null) => ({ rpc: async () => ({ data, error }) });

  it('pasa las membresías leídas', async () => {
    const r = await callCheckoutRpc(cliente({ sale: { id: 'venta-1' }, membresias: [{ id: 9, plan: 'Plan', estado: 'active', desde: 'a', hasta: 'b' }] }), env);
    expect(r?.membresias).toEqual([expect.objectContaining({ id: 9, plan: 'Plan', estado: 'active' })]);
  });

  it('sin la clave (base anterior o venta sin membresías): []', async () => {
    const r = await callCheckoutRpc(cliente({ sale: { id: 'venta-1' } }), env);
    expect(r?.membresias).toEqual([]);
  });

  it('`membresia_sin_cliente` rechaza el cobro entero (lanza con el código)', async () => {
    await expect(callCheckoutRpc(cliente(null, { message: 'membresia_sin_cliente', code: '22023' }), env)).rejects.toMatchObject({
      message: 'membresia_sin_cliente',
    });
  });
});

describe('confirmación web · fn_membresias_activar_venta', () => {
  const silenciar = () => jest.spyOn(console, 'error').mockImplementation(() => undefined);

  it('llama la RPC con la venta, sin factura, origen web y pagada', async () => {
    const rpc = jest.fn(async () => ({ data: [{ id: 1, plan: 'Plan', estado: 'active' }], error: null }));
    const r = await activarMembresiasVentaWeb({ rpc } as never, 'venta-web', 'W-1');
    expect(rpc).toHaveBeenCalledWith('fn_membresias_activar_venta', { p_sale_id: 'venta-web', p_invoice_id: null, p_source: 'web', p_pagado: true });
    expect(r).toEqual({ membresias: [expect.objectContaining({ id: 1 })], error: null });
  });

  it('sin cliente no lanza: devuelve el código y el pedido sigue', async () => {
    const espia = silenciar();
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'membresia_sin_cliente' } }));
    await expect(activarMembresiasVentaWeb({ rpc } as never, 'venta-web')).resolves.toEqual({ membresias: [], error: 'membresia_sin_cliente' });
    espia.mockRestore();
  });

  it('cualquier otro fallo tampoco lanza', async () => {
    const espia = silenciar();
    const rpc = jest.fn(async () => {
      throw new Error('red');
    });
    await expect(activarMembresiasVentaWeb({ rpc } as never, 'venta-web')).resolves.toEqual({ membresias: [], error: 'error_activacion' });
    espia.mockRestore();
  });
});

describe('enlace de renovación /app/pos?cliente=&producto=', () => {
  const p = (q: string) => new URLSearchParams(q);
  const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('lee cliente y producto con la forma esperada', () => {
    expect(leerEnlacePos(p(`cliente=${UUID}&producto=12`))).toEqual({ clienteId: UUID, productoId: 12 });
    expect(leerEnlacePos(p('producto=12'))).toEqual({ clienteId: null, productoId: 12 });
    expect(leerEnlacePos(p(`cliente=${UUID.toUpperCase()}`))).toEqual({ clienteId: UUID, productoId: null });
  });

  it('ignora lo que no tiene la forma (lista blanca)', () => {
    expect(leerEnlacePos(p('cliente=1 or 1=1&producto=-3'))).toBeNull();
    expect(leerEnlacePos(p('producto=12abc'))).toBeNull();
    expect(leerEnlacePos(p(''))).toBeNull();
    expect(leerEnlacePos(null)).toBeNull();
  });

  it('la clave identifica el enlace para aplicarlo una sola vez', () => {
    expect(claveEnlacePos({ clienteId: UUID, productoId: 12 })).toBe(`${UUID}|12`);
    expect(claveEnlacePos({ clienteId: null, productoId: 12 })).toBe('-|12');
  });
});
