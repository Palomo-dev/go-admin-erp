/**
 * L42 y L43 (POS-PLAN §2.6): pagos del cobro y montos rápidos, extraídos
 * literal de `CheckoutDialog.tsx` a `src/lib/pos/venta/cobro/pagosCobro.ts` y
 * `montosRapidos.ts`. Pruebas de caracterización: fijan lo que hace HOY.
 *
 * Lo que marca una entrada como «tocada» (`touchedIds`) sigue en el diálogo y
 * lo vigilan las pruebas de `__tests__/pos-display/` (tester-f2c-r*).
 */

import {
  actualizarEntradaPago,
  entradaDePagoNueva,
  hayPagoEnEfectivo,
  pagosDelSobre,
  pagosParaImpresion,
  puedeQuitarPagos,
  quitarEntradaPago,
  type EntradaPago,
} from '@/lib/pos/venta/cobro/pagosCobro';
import { faltaParaEntrada, formatQuickLabel, generateQuickAmounts, montosDeEntrada, muestraMontosRapidos } from '@/lib/pos/venta/cobro/montosRapidos';

const EFECTIVO: EntradaPago = { id: 'p1', method: 'cash', amount: 10000 };
const TARJETA: EntradaPago = { id: 'p2', method: 'card', amount: 13800 };

describe('L42 · pago mixto', () => {
  it('la entrada nueva va en efectivo por el importe pendiente (la primera, por el total)', () => {
    expect(entradaDePagoNueva({ id: 'x', amount: 23800 })).toEqual({ id: 'x', method: 'cash', amount: 23800 });
  });

  it('el importe tecleado se guarda como número (texto inválido → 0) y solo cambia esa entrada', () => {
    const lista = [EFECTIVO, TARJETA];
    const tecleado = actualizarEntradaPago(lista, 'p1', 'amount', '15000');
    expect(tecleado).toEqual([{ ...EFECTIVO, amount: 15000 }, TARJETA]);
    expect(tecleado[1]).toBe(TARJETA);
    expect(actualizarEntradaPago(lista, 'p1', 'amount', 'abc')[0].amount).toBe(0);
    expect(actualizarEntradaPago(lista, 'p2', 'method', 'breb_qr')[1]).toEqual({ ...TARJETA, method: 'breb_qr' });
  });

  it('siempre queda una entrada: con una sola, quitar devuelve la MISMA lista', () => {
    const una = [EFECTIVO];
    expect(puedeQuitarPagos(una)).toBe(false);
    expect(quitarEntradaPago(una, 'p1')).toBe(una);
    expect(puedeQuitarPagos([EFECTIVO, TARJETA])).toBe(true);
    expect(quitarEntradaPago([EFECTIVO, TARJETA], 'p1')).toEqual([TARJETA]);
  });

  it('el sobre lleva medio e importe (sin el id local); el ticket omite los ceros y nombra el medio de la organización', () => {
    const lista = [EFECTIVO, TARJETA, { id: 'p3', method: 'nequi', amount: 0 }, { id: 'p4', method: 'bono', amount: 500 }];
    expect(pagosDelSobre(lista)).toEqual([
      { method: 'cash', amount: 10000 },
      { method: 'card', amount: 13800 },
      { method: 'nequi', amount: 0 },
      { method: 'bono', amount: 500 },
    ]);
    const medios = [{ code: 'cash', name: 'Efectivo' }, { code: 'card', name: 'Tarjeta' }];
    expect(pagosParaImpresion(lista, medios)).toEqual([
      { method: 'cash', methodName: 'Efectivo', amount: 10000 },
      { method: 'card', methodName: 'Tarjeta', amount: 13800 },
      // Un medio que ya no está en la lista de la organización sale con su código.
      { method: 'bono', methodName: 'bono', amount: 500 },
    ]);
  });

  it('el cajón solo cuenta efectivo con importe', () => {
    expect(hayPagoEnEfectivo([TARJETA, { id: 'p5', method: 'cash', amount: 0 }])).toBe(false);
    expect(hayPagoEnEfectivo([TARJETA, EFECTIVO])).toBe(true);
  });
});

describe('L43 · «Exacto» y billetes rápidos', () => {
  it('solo en entradas de efectivo', () => {
    expect(muestraMontosRapidos('cash')).toBe(true);
    expect(muestraMontosRapidos('card')).toBe(false);
    expect(muestraMontosRapidos('breb_qr')).toBe(false);
  });

  it('D8 (paso 11): se calculan sobre LO QUE FALTA para la entrada, no sobre el total: con 23.800 y 10.000 en otra entrada, «Exacto» es 13.800', () => {
    // Antes del paso 11 esta prueba fijaba «sobre el total» (E-07): el diálogo
    // llamaba generateQuickAmounts(cartTotal). El dueño decidió D8 (POS-PLAN
    // §5.3): la base es lo que falta tras las OTRAS entradas (faltaParaEntrada).
    const pagos: EntradaPago[] = [EFECTIVO, { id: 'p2', method: 'cash', amount: 23800 }];
    expect(faltaParaEntrada(pagos, 'p2', 23800)).toBe(13800);
    // La entrada que se edita no cuenta: lo tecleado en ella no reduce su propio «Exacto».
    expect(faltaParaEntrada([{ id: 'p2', method: 'cash', amount: 99999 }], 'p2', 23800)).toBe(23800);
    // Las otras ya cubren el total: nada que cobrar (nunca negativo).
    expect(faltaParaEntrada([{ ...EFECTIVO, amount: 30000 }, TARJETA], 'p2', 23800)).toBe(0);
    const { exacto, billetes } = montosDeEntrada(13800);
    expect(exacto).toBe(13800);
    expect(billetes.map((b) => b.value)).toEqual([15000, 20000, 30000, 40000, 50000]);
    expect(montosDeEntrada(0)).toEqual({ exacto: 0, billetes: [] });
    // Con una sola entrada lo que falta ES el total: los mismos botones de siempre.
    expect(generateQuickAmounts(23800)).toEqual([
      { label: 'Exacto', value: 23800 },
      { label: '25k', value: 25000 },
      { label: '30k', value: 30000 },
      { label: '40k', value: 40000 },
      { label: '50k', value: 50000 },
      { label: '60k', value: 60000 },
    ]);
  });

  it('un total redondo no repite botón; importes pequeños redondean a 500/1.000; sin total solo «Exacto» en 0', () => {
    expect(generateQuickAmounts(20000).map((b) => b.label)).toEqual(['Exacto', '30k', '40k', '50k']);
    expect(generateQuickAmounts(1250).map((b) => b.value)).toEqual([1250, 1500, 2000, 3000, 4000, 5000]);
    expect(generateQuickAmounts(1250)[1].label).toBe('1.5k');
    expect(generateQuickAmounts(0)).toEqual([{ label: 'Exacto', value: 0 }]);
    expect(formatQuickLabel(1500000)).toBe('1.5M');
    expect(formatQuickLabel(800)).toBe('800');
  });
});
