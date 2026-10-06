import { periodoSuscripcion, periodoSuscripcionISO } from '../periodoSuscripcion';

describe('periodoSuscripcion', () => {
  it('lee el periodo de items.data[0] (API «basil» y posteriores)', () => {
    const sub = { items: { data: [{ current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }] } };
    expect(periodoSuscripcionISO(sub)).toEqual({
      inicio: new Date(1_790_000_000 * 1000).toISOString(),
      fin: new Date(1_792_592_000 * 1000).toISOString(),
    });
  });

  it('cae al nivel superior en versiones anteriores de la API', () => {
    const sub = { current_period_start: 1_790_000_000, current_period_end: 1_792_592_000, items: { data: [{}] } };
    expect(periodoSuscripcion(sub).fin?.getTime()).toBe(1_792_592_000 * 1000);
  });

  it('prefiere el ítem cuando vienen los dos', () => {
    const sub = { current_period_end: 1, items: { data: [{ current_period_end: 2 }] } };
    expect(periodoSuscripcion(sub).fin?.getTime()).toBe(2000);
  });

  it('sin periodo devuelve null en vez de lanzar «Invalid time value»', () => {
    expect(periodoSuscripcionISO({})).toEqual({ inicio: null, fin: null });
    expect(periodoSuscripcionISO(null)).toEqual({ inicio: null, fin: null });
  });
});
