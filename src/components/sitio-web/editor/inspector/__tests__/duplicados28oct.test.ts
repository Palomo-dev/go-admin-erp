import { cambioIconoAccion, iconoAccionEncabezado, OPCIONES_ICONO_ACCION, ICONOS_LUCIDE_ENCABEZADO } from '../iconosAccionesLogica';
import { entradasAnterioresSeccion, campoCubiertoPorEstilo, campoUnicoPortada, cambioUnicoPortada, valorUnicoPortada } from '../espaciadoSeccion';

describe('íconos del encabezado', () => {
  test('muestra lo que pinta la tienda (misma precedencia)', () => {
    expect(iconoAccionEncabezado({}, 'cart')).toBe('shopping-bag');
    expect(iconoAccionEncabezado({ cart_icon: 'gift' }, 'cart')).toBe('gift');
    expect(iconoAccionEncabezado({ cart_icon: 'shopping-bag', header_cart_glyph: 'carrito' }, 'cart')).toBe('shopping-cart');
    expect(iconoAccionEncabezado({ auth_icon: 'user-round', header_icons: { account: { icono: 'circle-user' } } }, 'account')).toBe('circle-user');
  });
  test('elegir escribe la columna y limpia lo que la pisaría', () => {
    expect(cambioIconoAccion({}, 'search', 'scan-search')).toEqual({ search_icon: 'scan-search' });
    expect(cambioIconoAccion({ header_cart_glyph: 'bolsa' }, 'cart', 'package')).toEqual({ cart_icon: 'package', header_cart_glyph: null });
    expect(cambioIconoAccion({ header_icons: { account: { icono: 'x' }, cart: { icono: 'gift' } } }, 'account', 'user')).toEqual({ auth_icon: 'user', header_icons: { cart: { icono: 'gift' } } });
    const a = { header_cart_glyph: 'carrito' };
    expect(iconoAccionEncabezado({ ...a, ...cambioIconoAccion(a, 'cart', 'gift') }, 'cart')).toBe('gift');
  });
  test('todas las opciones tienen ícono', () => {
    for (const lista of Object.values(OPCIONES_ICONO_ACCION)) for (const n of lista) expect(ICONOS_LUCIDE_ENCABEZADO[n]).toBeTruthy();
  });
});

describe('portada: un solo radio y una sola sombra', () => {
  test('Contenido ya no los muestra; Avanzado sí, unificado en el carrusel', () => {
    expect(campoCubiertoPorEstilo({ key: 'border_radius', type: 'range', group: 'content' }, 'hero')).toBe(true);
    expect(campoCubiertoPorEstilo({ key: 'shadow_intensity', type: 'range', group: 'content' }, 'hero')).toBe(true);
    expect(campoCubiertoPorEstilo({ key: 'border_radius', type: 'range', group: 'content' }, 'cta')).toBe(false);
    expect(campoUnicoPortada('hero', 'slider', 'radius')).toBe(true);
    expect(campoUnicoPortada('hero', 'split', 'radius')).toBe(false);
    expect(campoUnicoPortada('products_grid', 'slider', 'shadow')).toBe(false);
  });
  test('lectura con respaldo', () => {
    expect(valorUnicoPortada({ radius: 30, border_radius: 0 }, 'radius')).toBe(30);
    expect(valorUnicoPortada({ radius: 30, border_radius: 12 }, 'radius')).toBe(12);
    expect(valorUnicoPortada({}, 'radius')).toBe(0);
    expect(valorUnicoPortada({ shadow: 'md' }, 'shadow')).toBe('md');
    expect(valorUnicoPortada({ shadow: 'md', shadow_intensity: 30 }, 'shadow')).toBe('lg');
    expect(valorUnicoPortada({}, 'shadow')).toBe('none');
  });
  test('al editar escribe en el carrusel y quita el de la sección', () => {
    expect(cambioUnicoPortada({ radius: 30, title: 'x' }, 'radius', 16)).toEqual({ radius: 0, border_radius: 16, title: 'x' });
    expect(cambioUnicoPortada({ radius: 30, border_radius: 8 }, 'radius', 0)).toEqual({ radius: 0 });
    expect(cambioUnicoPortada({ shadow: 'sm' }, 'shadow', 'lg')).toEqual({ shadow: 'none', shadow_intensity: 24 });
    expect(cambioUnicoPortada({ shadow_intensity: 10 }, 'shadow', 'none')).toEqual({});
    // Mismo escalón que ya se ve: no se reescribe (7 sigue en 7).
    const siete = { shadow_intensity: 7 };
    expect(cambioUnicoPortada(siete, 'shadow', 'sm')).toBe(siete);
  });
  it('Margen en px: la escala anterior no sale repetida en «versiones anteriores» y no se borra', () => {
    const c = { margin_top: 'sm', margin_bottom: 'md', section_background: { margin_top_mobile: 8 } };
    const ids = entradasAnterioresSeccion(c, 'hero').map((e) => e.id);
    expect(ids).not.toContain('seccion_margin_top');
    expect(ids).toContain('seccion_margin_bottom');
    expect(c.margin_top).toBe('sm');
  });
});
