import { espacioSeccion, leerMargenPropio } from '../espacioSeccion';

describe('espacioSeccion: lo que la tienda aplica hoy', () => {
  test('sin nada guardado: relleno lg (48 celular · 64 computador) y sin margen', () => {
    const e = espacioSeccion({}, { tipo: 'features_grid' });
    expect(e.rellenoArriba).toEqual({ celular: 48, computador: 64, propio: false });
    expect(e.rellenoAbajo).toEqual({ celular: 48, computador: 64, propio: false });
    expect(e.margenArriba).toEqual({ celular: 0, computador: 0, propio: false });
  });
  test('portada de Hogar Plástico (333): margen sm = 16 y relleno 0 del cascarón', () => {
    const e = espacioSeccion({ margin_top: 'sm', margin_bottom: 'sm', padding_top: 'sm', section_background: { padding_top: 0, padding_bottom: 0 } }, { tipo: 'hero', primera: true, ajustesSitio: {} });
    expect(e.margenArriba).toEqual({ celular: 16, computador: 16, propio: true });
    expect(e.margenAbajo).toEqual({ celular: 16, computador: 16, propio: true });
    expect(e.rellenoArriba).toEqual({ celular: 0, computador: 0, propio: true });
  });
  test('escala sm: 16 celular · 24 computador (pt-4 md:pt-6)', () => {
    expect(espacioSeccion({ padding_top: 'sm', margin_top: 'sm' }, { tipo: 'hero' }).rellenoArriba).toEqual({ celular: 16, computador: 24, propio: true });
  });
  test('primera sección sin relleno propio: 0 (o el hueco del sitio)', () => {
    expect(espacioSeccion({}, { tipo: 'hero', primera: true }).rellenoArriba.computador).toBe(0);
    expect(espacioSeccion({}, { tipo: 'hero', primera: true, ajustesSitio: { first_section_offset_px: 12 } }).rellenoArriba.computador).toBe(12);
  });
  test('Estilo › Espaciado compacto rellena la escala (heredado, no propio)', () => {
    expect(espacioSeccion({}, { tipo: 'faq', espaciado: 'compacto' }).rellenoArriba).toEqual({ celular: 16, computador: 24, propio: false });
  });
  test('carta QR en la mesa: sin relleno por defecto', () => {
    expect(espacioSeccion({}, { tipo: 'table_order' }).rellenoArriba.computador).toBe(0);
  });
  test('margen px por dispositivo gana a la escala', () => {
    const e = espacioSeccion({ margin_top: 'sm', section_background: { margin_top: 40, margin_top_mobile: 8 } }, { tipo: 'hero' });
    expect(e.margenArriba).toEqual({ celular: 8, computador: 40, propio: true });
    expect(leerMargenPropio({ section_background: { margin_top: 999, margin_bottom: '12' } })).toEqual({ margin_bottom: 12 });
  });
});
