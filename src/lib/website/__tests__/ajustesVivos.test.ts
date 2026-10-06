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

  test('las opciones nuevas del contrato (segundo botón, barra móvil, pie) van en vivo', () => {
    for (const c of ['header_cta2_text', 'header_cta2_url', 'topbar_show_branch_status', 'header_show_branch_selector', 'header_booking_bar', 'mobile_bottom_bar', 'footer_show_whatsapp', 'footer_show_map', 'footer_show_payment_methods']) {
      expect(CLAVES_AJUSTES_VIVOS).toContain(c);
    }
    expect(CLAVES_PIE).toContain('footer_show_map');
    expect(ajustesParaLienzo({ mobile_bottom_bar: ['reservar', 'llamar'] })).toEqual({ mobile_bottom_bar: ['reservar', 'llamar'] });
  });

  test('sin ajustes devuelve un objeto vacío', () => {
    expect(ajustesParaLienzo(null)).toEqual({});
  });
});
