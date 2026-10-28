import { cambiosEfectivos, igualesNormalizados } from '../sinCambioReal';

describe('sinCambioReal', () => {
  it('ignora orden y undefined', () => {
    expect(igualesNormalizados({ a: 1, b: { c: 2, d: undefined } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(igualesNormalizados({ a: 1 }, { a: 2 })).toBe(false);
  });
  it('limpiar lo que ya está vacío no es un cambio', () => {
    expect(cambiosEfectivos({ mobile_search_style: null, mobile_header: { icons: 1 } }, { mobile_header: { icons: 1 } })).toEqual({});
    expect(cambiosEfectivos({ search_style: 'bar' }, { search_style: 'icon' })).toEqual({ search_style: 'bar' });
  });
});
