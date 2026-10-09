/**
 * El cobro no debe cobrar de menos cuando el carrito ya sumó el impuesto.
 * 16.200 + 8 % = 17.496. Tratar ese precio como «impuesto incluido» deja
 * el total en 16.200, y apagar la casilla tiene que devolver 17.496.
 */
import { calculateCartTaxes } from '@/lib/utils/taxCalculations';
import {
  casillaInicialImpuestosIncluidos,
  impuestoIncluidoDeLinea,
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

  it('17.496 no baja a 16.200: la casilla apagada suma el 8 %', () => {
    const incluido = impuestoIncluidoDeLinea({ tax_included: undefined }, false, false);
    expect(incluido).toBe(false);
    expect(totalAPagar(16200, incluido)).toBe(17496);
  });

  it('encender la casilla cobra 16.200 y apagarla devuelve 17.496', () => {
    const linea = { tax_included: true as const };
    expect(totalAPagar(16200, impuestoIncluidoDeLinea(linea, true, true))).toBe(16200);
    expect(totalAPagar(16200, impuestoIncluidoDeLinea(linea, false, true))).toBe(17496);
  });

  it('sin mover la casilla, una línea marcada «incluido» sigue sacando el impuesto de dentro', () => {
    expect(impuestoIncluidoDeLinea({ tax_included: true }, false, false)).toBe(true);
    expect(totalAPagar(16200, true)).toBe(16200);
  });
});
