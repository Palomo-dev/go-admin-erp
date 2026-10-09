/**
 * El cobro no debe cobrar de menos cuando el carrito ya sumó el impuesto.
 * 16.200 + 8 % = 17.496. Tratar ese precio como «impuesto incluido» deja
 * el total en 16.200, y apagar la casilla tiene que devolver 17.496.
 */
import { calculateCartTaxes, impuestoIncluidoDeLinea } from '@/lib/utils/taxCalculations';
import { cuentasDelCobro } from '@/lib/pos/venta/cobro/cuentasCobro';
import { applyTipToPrefilledPayment } from '@/components/pos/display/tipNotice';
import {
  ajusteAlAbrirCobro,
  casillaInicialImpuestosIncluidos,
  casillaSiElCajeroNoLaMovio,
  desgloseQueCuadraConElTotal,
  firmaAperturaCobro,
  totalesVisiblesDelCobro,
} from '@/lib/pos/venta/cobro/impuestosCobro';

const INC_8 = [{ id: 'inc-8', name: 'INC', rate: 8, is_default: true, is_active: true }];

function totalAPagar(precio: number, incluido: boolean): number {
  const r = calculateCartTaxes(
    [{
      quantity: 1,
      unit_price: precio,
      product_id: 1,
      discount_amount: 0,
      tax_rate: 8,
      tax_included: incluido,
    }],
    { 'inc-8': true },
    INC_8,
    incluido,
  );
  return r.finalTotal;
}

describe('casilla de impuestos del cobro', () => {
  it('sin líneas marcadas arranca apagada, aunque el carrito traiga el flag', () => {
    expect(casillaInicialImpuestosIncluidos([{ tax_included: undefined }])).toBe(false);
    expect(casillaInicialImpuestosIncluidos([{ tax_included: null }])).toBe(false);
    expect(casillaInicialImpuestosIncluidos([])).toBe(false);
  });

  it('arranca encendida solo si todas las líneas que llevan impuesto ya lo traen', () => {
    expect(casillaInicialImpuestosIncluidos([{ tax_included: true }, { tax_included: true }])).toBe(true);
    expect(casillaInicialImpuestosIncluidos([{ tax_included: true }, { tax_included: false }])).toBe(false);
    expect(casillaInicialImpuestosIncluidos([{ tax_excluded: true, tax_included: true }])).toBe(false);
  });

  it('17.496 no baja a 16.200: la casilla apagada suma el 8 % si la línea no dice nada', () => {
    const incluido = impuestoIncluidoDeLinea({ tax_included: undefined }, false);
    expect(incluido).toBe(false);
    expect(totalAPagar(16200, incluido)).toBe(17496);
  });

  it('apagar la casilla no le suma el impuesto a un producto que ya lo trae en el precio', () => {
    const incluido = { tax_included: true as const, tax_rate: 8 };
    const encima = { tax_included: false as const, tax_rate: 8 };
    expect(impuestoIncluidoDeLinea(incluido, false)).toBe(true);
    expect(impuestoIncluidoDeLinea(encima, false)).toBe(false);
    expect(totalAPagar(16200, true)).toBe(16200);
    // Mixto: 16.200 ya con impuesto + 10.000 con el 8 % encima = 27.000, no 29.296.
    const aplicados = { 'inc-8': true };
    const mixto = calculateCartTaxes(
      [
        { quantity: 1, unit_price: 16200, product_id: 1, discount_amount: 0, ...incluido },
        { quantity: 1, unit_price: 10000, product_id: 2, discount_amount: 0, ...encima },
      ],
      aplicados,
      INC_8,
      false,
    );
    expect(mixto.finalTotal).toBe(27000);
  });

  it('una línea marcada «incluido» sigue sacando el impuesto de dentro aunque la casilla esté apagada', () => {
    expect(impuestoIncluidoDeLinea({ tax_included: true }, false)).toBe(true);
    expect(totalAPagar(16200, true)).toBe(16200);
  });

  it('cerrar y volver a abrir no hereda la casilla ni el total de la venta anterior', () => {
    expect(firmaAperturaCobro(false, 'carrito-1')).not.toBe(firmaAperturaCobro(true, 'carrito-1'));
    expect(firmaAperturaCobro(true, 'carrito-1')).not.toBe(firmaAperturaCobro(true, 'carrito-2'));

    const lineasNuevas = [{ tax_included: undefined }];
    const ajuste = ajusteAlAbrirCobro(lineasNuevas);
    expect(ajuste.taxIncluded).toBe(false);
    expect(ajuste.casillaMovida).toBe(false);
    expect(ajuste.calculatedTotals).toEqual({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0 });

    // La venta anterior dejó 16.200. Al abrir, ese cálculo se vacía y, hasta
    // que responda el de esta venta, se ve el total del carrito (17.496).
    const visibles = totalesVisiblesDelCobro(
      ajuste.calculatedTotals,
      { subtotal: 16200, tax_total: 1296, total: 17496 },
    );
    expect(visibles.finalTotal).toBe(17496);
    expect(casillaSiElCajeroNoLaMovio(true, false, lineasNuevas)).toBe(false);
  });

  it('con «Impuestos incluidos» en el carrito, el cobro muestra 18.000 y el pago combinado cierra', () => {
    const lineas = [{ tax_included: true as const }];
    expect(casillaSiElCajeroNoLaMovio(false, false, lineas)).toBe(true);
    expect(ajusteAlAbrirCobro(lineas).taxIncluded).toBe(true);

    const carrito = { subtotal: 18000, tax_total: 1333.33, total: 18000 };
    const antesDelCalculo = totalesVisiblesDelCobro(
      { subtotal: 0, totalTaxAmount: 0, finalTotal: 0 },
      carrito,
    );
    expect(antesDelCalculo.finalTotal).toBe(18000);
    const calculado = totalesVisiblesDelCobro(
      { subtotal: 16666.67, totalTaxAmount: 1333.33, finalTotal: 18000 },
      carrito,
    );
    expect(calculado.finalTotal).toBe(18000);

    const efectivo = 10000;
    const tarjeta = 8000;
    const cuentas = cuentasDelCobro({
      calculatedTotals: calculado,
      cart: { total: carrito.total, tax_total: carrito.tax_total },
      tipAmount: 0,
      shippingFee: 0,
      totalPaid: efectivo + tarjeta,
    });
    expect(cuentas.cartTotal).toBe(18000);
    expect(cuentas.canComplete).toBe(true);
    expect(cuentas.remaining).toBe(0);

    const pagos = [
      { id: 'efectivo', method: 'cash', amount: efectivo },
      { id: 'tarjeta', method: 'card', amount: tarjeta },
    ];
    expect(applyTipToPrefilledPayment(pagos, new Set(['efectivo']), 18000)).toBe(pagos);
  });

  it('el cálculo de esta apertura manda cuando ya llegó, también si suma un IVA que el carrito no traía', () => {
    const carrito = { subtotal: 23800, tax_total: 0, total: 23800 };
    const conIva = { subtotal: 23800, totalTaxAmount: 4522, finalTotal: 28322 };
    expect(totalesVisiblesDelCobro(conIva, carrito).finalTotal).toBe(28322);
    expect(casillaSiElCajeroNoLaMovio(false, true, [{ tax_included: true }])).toBe(false);
  });

  it('casilla apagada y línea sin marca: 24.000 + 8 % = 25.600, y el desglose cuadra con ese impuesto', () => {
    const carrito = { subtotal: 24000, tax_total: 1600, total: 25600 };
    const lineasSinMarca = [{ tax_included: undefined }];
    expect(ajusteAlAbrirCobro(lineasSinMarca).taxIncluded).toBe(false);
    expect(casillaSiElCajeroNoLaMovio(true, false, lineasSinMarca)).toBe(false);
    expect(impuestoIncluidoDeLinea(lineasSinMarca[0], false)).toBe(false);
    // 20.000 con 8 % encima + 4.000 exento = 25.600. No 24.000.
    const cuenta = calculateCartTaxes(
      [
        { quantity: 1, unit_price: 20000, product_id: 1, discount_amount: 0, tax_rate: 8 },
        { quantity: 1, unit_price: 4000, product_id: 2, discount_amount: 0, tax_rate: 0, tax_included: false, tasaDecidida: true },
      ],
      { 'inc-8': true },
      INC_8,
      false,
    );
    expect(cuenta.finalTotal).toBe(25600);

    const calculado = { subtotal: 24000, totalTaxAmount: 1600, finalTotal: 25600 };
    expect(totalesVisiblesDelCobro(calculado, carrito).finalTotal).toBe(25600);
    expect(desgloseQueCuadraConElTotal([{ name: 'INC', amount: 1600 }], calculado.totalTaxAmount)).toEqual([
      { name: 'INC', amount: 1600 },
    ]);
    // Un desglose de otro cálculo (1.200) no se pinta junto a un total que trae 1.600.
    expect(desgloseQueCuadraConElTotal([{ name: 'INC', amount: 1200 }], calculado.totalTaxAmount)).toBeNull();
  });

  it('un cálculo ya hecho no se reemplaza por el total del carrito', () => {
    const carrito = { subtotal: 24000, tax_total: 1600, total: 25600 };
    const calculado = { subtotal: 22400, totalTaxAmount: 1600, finalTotal: 24000 };
    expect(totalesVisiblesDelCobro(calculado, carrito)).toEqual(calculado);
  });

  it('la mesa cobra 46.120, no los 43.000 del precio, y desmarcar la casilla lo devuelve', () => {
    const aplicados = { 'inc-8': true };
    const lineas = [
      { quantity: 1, unit_price: 39000, product_id: 1, discount_amount: 0, tax_rate: 8, tax_included: false, tasaDecidida: true },
      { quantity: 1, unit_price: 4000, product_id: 2, discount_amount: 0, tax_rate: 0, tax_included: false, tasaDecidida: true },
    ];
    const total = (casilla: boolean) => Math.round(lineas.reduce((suma, item) => {
      const r = calculateCartTaxes([item], aplicados, INC_8, casilla);
      return suma + r.finalTotal;
    }, 0) * 100) / 100;

    expect(casillaInicialImpuestosIncluidos(lineas)).toBe(false);
    expect(total(false)).toBe(46120);
    // Prender la casilla no le saca el impuesto a una línea que lo tiene encima.
    expect(impuestoIncluidoDeLinea(lineas[0], true)).toBe(false);
    expect(total(true)).toBe(46120);

    // Parte o saldo: el importe ya trae el impuesto. Apagar la casilla no se lo suma.
    const parte = calculateCartTaxes(
      [{ quantity: 1, unit_price: 31000, product_id: 0, discount_amount: 0, tax_rate: 0, tax_included: true, tasaDecidida: true }],
      aplicados,
      INC_8,
      false,
    );
    expect(parte.finalTotal).toBe(31000);
    expect(parte.totalTaxAmount).toBe(0);

    // Una línea de mostrador con tasa 0 sigue tomando el impuesto de la organización.
    const sinDecision = calculateCartTaxes(
      [{ quantity: 1, unit_price: 4000, product_id: 2, discount_amount: 0, tax_rate: 0, tax_included: false }],
      aplicados,
      INC_8,
      false,
    );
    expect(sinDecision.finalTotal).toBe(4320);
  });

  it('un cálculo todavía en cero no reemplaza el total del carrito', () => {
    const carrito = { subtotal: 18000, tax_total: 1333.33, total: 18000 };
    const visibles = totalesVisiblesDelCobro({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0 }, carrito);
    expect(visibles.finalTotal).toBe(18000);
  });
});
