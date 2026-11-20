/**
 * Resumen de tarifas web por tipo de domicilio (Figma 2686:57152): la misma regla que el checkout
 * de la tienda (goadmin-websites lib/shipping/opcionesDomicilio.ts).
 */
import { gruposMarcados, resumenDelTipo, resumirTarifasDomicilio, type FilaTarifaDomicilio } from '../tarifasDomicilio';

const propia = (base: number, dias: number | null, minimo = 0): FilaTarifaDomicilio => ({
  base_rate: base, min_charge: minimo, estimated_transit_days: dias, transport_carriers: { carrier_type: 'own_fleet' },
});
const tercero = (base: number, dias: number | null): FilaTarifaDomicilio => ({
  base_rate: String(base), min_charge: null, estimated_transit_days: dias, transport_carriers: [{ carrier_type: 'third_party' }],
});

describe('resumirTarifasDomicilio', () => {
  it('agrupa por el tipo de transportadora; sin transportadora cuenta como propia', () => {
    const r = resumirTarifasDomicilio([
      propia(8000, 0),
      { base_rate: 9000, min_charge: null, estimated_transit_days: 1, transport_carriers: null },
      tercero(15000, 3),
      tercero(12500, 5),
    ]);
    expect(r.own).toEqual({ cantidad: 2, desde: 8000, diasMin: 0, diasMax: 1 });
    expect(r.third_party).toEqual({ cantidad: 2, desde: 12500, diasMin: 3, diasMax: 5 });
  });

  it('el precio de referencia es la base o el cargo mínimo, el mayor', () => {
    expect(resumirTarifasDomicilio([propia(5000, null, 7000)]).own.desde).toBe(7000);
  });

  it('sin tarifas: cero y sin precio ni días', () => {
    expect(resumirTarifasDomicilio([])).toEqual({
      own: { cantidad: 0, desde: null, diasMin: null, diasMax: null },
      third_party: { cantidad: 0, desde: null, diasMin: null, diasMax: null },
    });
  });

  it('días negativos o vacíos no cuentan', () => {
    expect(resumirTarifasDomicilio([propia(1000, -1), propia(2000, null)]).own).toMatchObject({ cantidad: 2, diasMin: null, diasMax: null });
  });
});

describe('resumenDelTipo', () => {
  const t = resumirTarifasDomicilio([propia(8000, 0), tercero(15000, 3)]);

  it('con los dos domicilios marcados, cada uno ve las suyas', () => {
    const marcados = gruposMarcados(['pickup', 'delivery_own', 'delivery_third_party']);
    expect(marcados).toEqual(['own', 'third_party']);
    expect(resumenDelTipo(t, 'own', marcados)).toEqual({ cantidad: 1, desde: 8000, diasMin: 0, diasMax: 0 });
    expect(resumenDelTipo(t, 'third_party', marcados)).toEqual({ cantidad: 1, desde: 15000, diasMin: 3, diasMax: 3 });
  });

  it('con uno solo marcado, ese usa todas (como el checkout de la tienda)', () => {
    const marcados = gruposMarcados(['delivery_third_party']);
    expect(resumenDelTipo(t, 'third_party', marcados)).toEqual({ cantidad: 2, desde: 8000, diasMin: 0, diasMax: 3 });
  });
});
