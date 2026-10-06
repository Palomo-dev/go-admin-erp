import { CLAVES_AJUSTES_VIVOS, CLAVES_ENCABEZADO, CLAVES_PIE, ajustesParaLienzo } from '../ajustesVivos';

describe('ajustes en vivo del lienzo', () => {
  test('toma solo encabezado, pie y tema; nunca operación ni integraciones', () => {
    const r = ajustesParaLienzo({
      header_style: 'centered',
      footer_columns: 3,
      primary_color: '#000',
      shipping_flat_rate: 5000,
      analytics_id: 'G-1',
      custom_scripts: '<script>',
    });
    expect(r).toEqual({ header_style: 'centered', footer_columns: 3, primary_color: '#000' });
  });

  test('cambiar de menú no va en vivo (exige cargar otro menú)', () => {
    expect(CLAVES_AJUSTES_VIVOS).not.toContain('header_menu_id');
    expect(CLAVES_AJUSTES_VIVOS).not.toContain('header_mega_menu_id');
  });

  test('las columnas del pie están en las del encabezado (el guardado las reparte)', () => {
    for (const c of CLAVES_PIE) expect(CLAVES_ENCABEZADO).toContain(c);
  });

  test('sin ajustes devuelve un objeto vacío', () => {
    expect(ajustesParaLienzo(null)).toEqual({});
  });
});
