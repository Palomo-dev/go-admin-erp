import { CLAVES_AJUSTES_VIVOS, CLAVES_ENCABEZADO, CLAVES_PIE, ajustesParaLienzo } from '../ajustesVivos';
import { normalizarOpcionShell } from '../v2/mapeoAjustes';

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
    expect(r).toMatchObject({ header_style: 'centered', footer_columns: 3, primary_color: '#000' });
    for (const k of ['shipping_flat_rate', 'analytics_id', 'custom_scripts']) expect(k in r).toBe(false);
  });

  test('una opción quitada viaja como null para que el lienzo no se quede con la guardada', () => {
    const r = ajustesParaLienzo({ header_style: 'default' });
    expect(r.logo_position).toBeNull();
    expect(r.header_layout).toBeNull();
    expect(r.first_section_offset_px).toBeNull();
    // Tema y marca no: el logo o los colores del servidor se quedan.
    expect('logo_url' in r).toBe(false);
    expect('primary_color' in r).toBe(false);
  });

  test('cambiar de menú no va en vivo (exige cargar otro menú)', () => {
    expect(CLAVES_AJUSTES_VIVOS).not.toContain('header_menu_id');
    expect(CLAVES_AJUSTES_VIVOS).not.toContain('header_mega_menu_id');
  });

  test('las columnas del pie están en las del encabezado (el guardado las reparte)', () => {
    for (const c of CLAVES_PIE) expect(CLAVES_ENCABEZADO).toContain(c);
  });

  test('las opciones nuevas del contrato (segundo botón, barra móvil, pie) van en vivo', () => {
    for (const c of ['header_cta2_text', 'header_cta2_url', 'topbar_show_branch_status', 'header_show_branch_selector', 'header_booking_bar', 'mobile_bottom_bar', 'footer_show_whatsapp', 'footer_show_map', 'footer_show_payment_methods', 'header_show_currency', 'header_text_color', 'header_sticky', 'header_divider', 'header_divider_color', 'header_hover_color', 'footer_text_color', 'footer_show_dividers', 'mobile_menu_bg_color', 'mobile_menu_text_color', 'mobile_menu_link_hover_color', 'mobile_menu_link_active_color', 'mobile_menu_title_color', 'mobile_menu_divider_color', 'mobile_menu_currency_text_color', 'mobile_menu_currency_border_color', 'mobile_menu_currency_bg_color', 'mobile_menu_login_bg_color', 'mobile_menu_login_text_color', 'mobile_menu_register_border_color', 'mobile_menu_register_text_color', 'mobile_menu_logout_color', 'header_mobile_icon_color']) {
      expect(CLAVES_AJUSTES_VIVOS).toContain(c);
    }
    expect(CLAVES_PIE).toContain('footer_show_map');
    expect(ajustesParaLienzo({ mobile_bottom_bar: ['reservar', 'llamar'] })).toMatchObject({ mobile_bottom_bar: ['reservar', 'llamar'] });
  });

  test('los colores del menú móvil rechazan CSS inyectado y aceptan un hex', () => {
    expect(normalizarOpcionShell('mobile_menu_text_color', 'red; x')).toBeNull();
    expect(normalizarOpcionShell('mobile_menu_text_color', 'expression(alert(1))')).toBeNull();
    expect(normalizarOpcionShell('header_mobile_icon_color', '#101010;background:url(//x)')).toBeNull();
    expect(normalizarOpcionShell('mobile_menu_bg_color', '#fff')).toBe('#fff');
    expect(normalizarOpcionShell('mobile_menu_logout_color', null)).toBeNull();
  });

  test('sin ajustes devuelve un objeto vacío', () => {
    expect(ajustesParaLienzo(null)).toEqual({});
  });
});
