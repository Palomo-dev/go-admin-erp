/** @jest-environment jsdom */
/**
 * El POS recuerda «Impuestos incluidos» y los impuestos elegidos por
 * organización y sucursal para que un carrito nuevo arranque igual.
 */
import { guardarPreferenciaImpuestos, impuestosDePreferencia, leerPreferenciaImpuestos } from '@/lib/pos/venta/preferenciaImpuestos';

beforeEach(() => window.localStorage.clear());

describe('preferencia de impuestos del POS', () => {
  it('guarda y lee por organización y sucursal, sin mezclar sedes', () => {
    guardarPreferenciaImpuestos(120, 1, { incluidos: true });
    guardarPreferenciaImpuestos(120, 1, { impuestos: ['iva19'] });
    expect(leerPreferenciaImpuestos(120, 1)).toEqual({ incluidos: true, impuestos: ['iva19'] });
    expect(leerPreferenciaImpuestos(120, 2)).toBeNull();
    expect(leerPreferenciaImpuestos(121, 1)).toBeNull();
  });

  it('desactivar también queda guardado', () => {
    guardarPreferenciaImpuestos(120, 1, { incluidos: true });
    guardarPreferenciaImpuestos(120, 1, { incluidos: false });
    expect(leerPreferenciaImpuestos(120, 1)?.incluidos).toBe(false);
  });

  it('sin organización o sucursal no guarda nada', () => {
    guardarPreferenciaImpuestos(undefined, 1, { incluidos: true });
    guardarPreferenciaImpuestos(120, undefined, { incluidos: true });
    expect(window.localStorage.length).toBe(0);
  });

  it('un valor corrupto se ignora', () => {
    window.localStorage.setItem('pos:impuestos:120:1', '{no es json');
    expect(leerPreferenciaImpuestos(120, 1)).toBeNull();
    window.localStorage.setItem('pos:impuestos:120:1', JSON.stringify({ incluidos: 'si', impuestos: [1] }));
    expect(leerPreferenciaImpuestos(120, 1)).toEqual({});
  });

  it('solo aplica impuestos que siguen existiendo; lista vacía = sin impuestos', () => {
    expect(impuestosDePreferencia({ impuestos: ['a', 'borrado'] }, ['a', 'b'])).toEqual(['a']);
    expect(impuestosDePreferencia({ impuestos: [] }, ['a'])).toEqual([]);
    expect(impuestosDePreferencia({ incluidos: true }, ['a'])).toBeNull();
    expect(impuestosDePreferencia(null, ['a'])).toBeNull();
  });
});
