/**
 * L35-L36 (docs/implementacion/POS-PLAN.md §2.5): botón «Cobrar» del carrito.
 * Decisión D4 (paso 7 del rediseño, aprobada por el dueño): sin caja el botón
 * pasa a «Abrir caja para cobrar · F9» SOLO si la organización exige caja
 * (`pos_require_cash_session`); sin la exigencia se cobra sin caja. Antes de
 * este paso el carrito lo deshabilitaba SIEMPRE: la prueba cambió con la
 * decisión. El «Cobrar» de un carrito en deuda NO exige caja. `estadoBotonCobrar` y
 * `puedeCobrarDeuda` salen de `src/components/pos/CartView.tsx`.
 */
import { estadoBotonCobrar, esCarritoEnDeuda, puedeCobrarDeuda } from '@/lib/pos/venta/requisitosCarrito';
import type { Cart } from '@/components/pos/types';

const conLineas = (status: Cart['status']) => ({ status, items: [{ id: 'l1' }] }) as Cart;

describe('botón «Cobrar» (L35)', () => {
  it('listo con líneas, carrito activo y caja abierta', () => {
    expect(estadoBotonCobrar({ caja: true, carrito: conLineas('active') })).toBe('listo');
  });

  it('sin caja: «Abrir caja para cobrar» si la organización la exige (o no se sabe); si no, se cobra', () => {
    expect(estadoBotonCobrar({ caja: false, carrito: conLineas('active') })).toBe('sin-caja');
    expect(estadoBotonCobrar({ caja: false, config: { requiereCaja: true }, carrito: conLineas('active') })).toBe('sin-caja');
    expect(estadoBotonCobrar({ caja: false, config: { requiereCaja: false }, carrito: conLineas('active') })).toBe('listo');
  });

  it('en espera o en deuda: bloqueado (con o sin caja); sin líneas: vacío (la botonera no se pinta)', () => {
    expect(estadoBotonCobrar({ caja: true, carrito: conLineas('hold') })).toBe('bloqueado');
    expect(estadoBotonCobrar({ caja: false, carrito: conLineas('hold_with_debt') })).toBe('bloqueado');
    expect(estadoBotonCobrar({ caja: true, carrito: { status: 'active', items: [] } as unknown as Cart })).toBe('vacio');
  });
});

describe('«Cobrar» de un carrito en deuda (L36)', () => {
  it('se ofrece con el carrito en deuda y no depende de la caja', () => {
    expect(esCarritoEnDeuda(conLineas('hold_with_debt'))).toBe(true);
    expect(puedeCobrarDeuda(conLineas('hold_with_debt'))).toBe(true);
    expect(puedeCobrarDeuda(conLineas('active'))).toBe(false);
    // Mismo carrito sin caja: el «Cobrar» normal está bloqueado, el de deuda no.
    expect(estadoBotonCobrar({ caja: false, carrito: conLineas('hold_with_debt') })).toBe('bloqueado');
  });
});
