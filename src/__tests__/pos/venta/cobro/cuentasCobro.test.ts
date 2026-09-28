/**
 * L41 (POS-PLAN §2.6): cuentas del cobro, extraídas literal de
 * `CheckoutDialog.tsx` a `src/lib/pos/venta/cobro/cuentasCobro.ts`.
 * Pruebas de caracterización: fijan lo que el cobro hace HOY.
 *
 * Datos inventados (pesos colombianos, sin centavos).
 */

import { baseDelCobro, cuentasDelCobro } from '@/lib/pos/venta/cobro/cuentasCobro';

const CON_IVA = { subtotal: 20000, totalTaxAmount: 3800, finalTotal: 23800 };
const SIN_CALCULO = { subtotal: 0, totalTaxAmount: 0, finalTotal: 0 };

describe('L41 · base del cobro (total con impuestos, sin propina ni flete)', () => {
  it('usa el total con impuestos que calculó el diálogo', () => {
    expect(baseDelCobro(CON_IVA, { total: 20000, tax_total: 0 })).toBe(23800);
  });

  it('mesa: sin impuestos calculados en el diálogo pero con impuestos en el carrito, usa cart.total', () => {
    // La mesa llega con `useMesaTaxes` ya aplicado: el diálogo no debe sumarlos otra vez.
    expect(baseDelCobro({ subtotal: 10000, totalTaxAmount: 0, finalTotal: 10000 }, { total: 11900, tax_total: 1900 })).toBe(11900);
  });

  it('productos exentos: sin impuestos en ninguno de los dos, usa el finalTotal del diálogo; sin cálculo, cart.total', () => {
    expect(baseDelCobro({ subtotal: 9000, totalTaxAmount: 0, finalTotal: 9000 }, { total: 10000, tax_total: 0 })).toBe(9000);
    expect(baseDelCobro(SIN_CALCULO, { total: 10000, tax_total: 0 })).toBe(10000);
  });
});

describe('L41 · total, falta, cambio y «se puede completar»', () => {
  it('total = base + propina + flete; sin pagos falta todo y no se puede completar', () => {
    const c = cuentasDelCobro({ calculatedTotals: CON_IVA, cart: { total: 20000, tax_total: 0 }, tipAmount: 2380, shippingFee: 5000, totalPaid: 0 });
    expect(c).toEqual({ baseTotal: 23800, cartTotal: 31180, remaining: 31180, change: 0, canComplete: false });
  });

  it('pago exacto: falta 0, cambio 0 y se completa', () => {
    const c = cuentasDelCobro({ calculatedTotals: CON_IVA, cart: { total: 20000, tax_total: 0 }, tipAmount: 0, shippingFee: 0, totalPaid: 23800 });
    expect(c).toMatchObject({ remaining: 0, change: 0, canComplete: true });
  });

  it('pago de más: el excedente es cambio, nunca «falta» negativo', () => {
    const c = cuentasDelCobro({ calculatedTotals: CON_IVA, cart: { total: 20000, tax_total: 0 }, tipAmount: 0, shippingFee: 0, totalPaid: 50000 });
    expect(c).toMatchObject({ remaining: 0, change: 26200, canComplete: true });
  });

  it('sin abono parcial (E-34): un peso menos que el total no deja completar la venta', () => {
    const c = cuentasDelCobro({ calculatedTotals: CON_IVA, cart: { total: 20000, tax_total: 0 }, tipAmount: 0, shippingFee: 0, totalPaid: 23799 });
    expect(c).toMatchObject({ remaining: 1, change: 0, canComplete: false });
  });

  it('la propina y el flete no cambian la base (sobre ella se calcula el porcentaje de propina)', () => {
    const sin = cuentasDelCobro({ calculatedTotals: CON_IVA, cart: { total: 20000, tax_total: 0 }, tipAmount: 0, shippingFee: 0, totalPaid: 0 });
    const con = cuentasDelCobro({ calculatedTotals: CON_IVA, cart: { total: 20000, tax_total: 0 }, tipAmount: 2380, shippingFee: 5000, totalPaid: 0 });
    expect(con.baseTotal).toBe(sin.baseTotal);
    expect(con.cartTotal - sin.cartTotal).toBe(7380);
  });
});
