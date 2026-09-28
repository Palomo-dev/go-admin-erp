/**
 * L27 (docs/implementacion/POS-PLAN.md §2.3): filas del «Resumen» del carrito.
 * Nombres REALES de los impuestos (nunca «IVA» fijo) y «No hay impuestos
 * configurados…» sin desglose. Solo presentación: el cálculo sigue en
 * `TaxSummary.tsx` y lo fijan `impuestosLineaCarrito.test.ts` e
 * `impuestosCobroSobre.test.ts` (sin tocar). `resumenImpuestos`,
 * `impuestosAplicadosIniciales` y `etiquetaSelectorImpuestos` son la
 * extracción literal de `src/components/pos/TaxSummary.tsx`.
 */
import { etiquetaSelectorImpuestos, impuestosAplicadosIniciales, resumenImpuestos } from '@/lib/pos/venta/resumenImpuestos';

const inc = { taxId: 't-inc', name: 'Impuesto al consumo', rate: 8, baseAmount: 50000, taxAmount: 4000 };
const iva5 = { taxId: 't-5', name: 'IVA 5%', rate: 5, baseAmount: 20000, taxAmount: 1000 };

describe('resumen de impuestos (L27)', () => {
  it('cada impuesto con su nombre y tasa configurados; subtotal BRUTO (neto + descuento) para que cuadre con el descuento', () => {
    const r = resumenImpuestos({ subtotal: 180990, totalTaxAmount: 5000, finalTotal: 185990, discountTotal: 2010, taxBreakdown: [inc, iva5] });
    expect(r.impuestos).toEqual([
      { taxId: 't-inc', etiqueta: 'Impuesto al consumo (8%)', importe: 4000 },
      { taxId: 't-5', etiqueta: 'IVA 5% (5%)', importe: 1000 },
    ]);
    expect(r).toMatchObject({ subtotalBruto: 183000, mostrarTotalImpuestos: true, totalImpuestos: 5000, mostrarDescuento: true, descuento: 2010, total: 185990, sinImpuestosConfigurados: false });
  });

  it('sin desglose: aviso de impuestos sin configurar, sin fila de total de impuestos ni de descuento', () => {
    const r = resumenImpuestos({ subtotal: 20000, totalTaxAmount: 0, finalTotal: 20000, discountTotal: 0, taxBreakdown: [] });
    expect(r).toMatchObject({ impuestos: [], sinImpuestosConfigurados: true, mostrarTotalImpuestos: false, mostrarDescuento: false, subtotalBruto: 20000 });
  });

  it('impuestos marcados al abrir: los del carrito (aunque sea lista vacía) o, si nunca eligió, los predeterminados, que se guardan', () => {
    const taxes = [
      { id: 'a', name: 'INC', rate: 8, is_default: true },
      { id: 'b', name: 'IVA', rate: 19, is_default: false },
    ];
    expect(impuestosAplicadosIniciales(taxes, undefined)).toEqual({ aplicados: { a: true, b: false }, predeterminadosAGuardar: ['a'] });
    expect(impuestosAplicadosIniciales(taxes, [])).toEqual({ aplicados: { a: false, b: false }, predeterminadosAGuardar: null });
    expect(impuestosAplicadosIniciales(taxes, ['b'])).toEqual({ aplicados: { a: false, b: true }, predeterminadosAGuardar: null });
  });

  it('el selector dice «ninguno», el nombre real del único elegido, o cuántos', () => {
    const taxes = [{ id: 'a', name: 'INC', rate: 8, is_default: true }, { id: 'b', name: 'IVA', rate: 19, is_default: false }];
    expect(etiquetaSelectorImpuestos({}, taxes)).toEqual({ tipo: 'ninguno' });
    expect(etiquetaSelectorImpuestos({ a: true, b: false }, taxes)).toEqual({ tipo: 'uno', nombre: 'INC', tasa: 8 });
    expect(etiquetaSelectorImpuestos({ a: true, b: true }, taxes)).toEqual({ tipo: 'varios', cantidad: 2 });
  });
});
