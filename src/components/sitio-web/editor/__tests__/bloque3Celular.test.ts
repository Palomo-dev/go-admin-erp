import {
  cambioItemsMenuInferior,
  cambioLogoCelular,
  cambioMenuCelular,
  cambioMenuInferiorActivo,
  cambioOrdenCelular,
  itemConTipo,
  itemNuevo,
  logoCelular,
  menuCelular,
  menuInferior,
  ordenCelular,
} from '../inspector/celularLogica';
import { entradasAnterioresEncabezado } from '../inspector/anterioresLogica';
import { leerPresentacionMovil } from '@/lib/website/menuMovil';

describe('Bloque 3: celular del encabezado', () => {
  it('sin claves: lo de hoy (cajón derecho, logo como computador, orden de siempre, menú inferior apagado)', () => {
    const a = {};
    expect(menuCelular(a)).toBe('drawer');
    expect(logoCelular(a)).toBe('inherit');
    expect(ordenCelular(a)).toBe('logo-acciones-menu');
    expect(menuInferior(a).activo).toBe(false);
    expect(leerPresentacionMovil(a)).toBeNull();
  });
  it('menú: cajón derecho es el drawer de siempre; drawer_right se lee igual; los demás se guardan', () => {
    expect(cambioMenuCelular({}, 'drawer')).toEqual({});
    expect(menuCelular({ mobile_menu_style: 'drawer_right' })).toBe('drawer');
    for (const v of ['drawer_left', 'bottom_sheet', 'top_dropdown', 'fullscreen', 'tabs', 'none'] as const) {
      expect(cambioMenuCelular({}, v)).toEqual({ mobile_menu_style: v });
    }
    // Los nuevos los pinta el encabezado configurable; hoja, pantalla completa y pestañas, el de hoy.
    for (const v of ['drawer_left', 'top_dropdown', 'none'] as const) expect(leerPresentacionMovil({ mobile_menu_style: v })?.estilo).toBe(v);
  });
  it('logo: con el encabezado de hoy va a mobile_logo_position; con layout nuevo, a layout.logo', () => {
    expect(cambioLogoCelular({}, 'center')).toEqual({ mobile_logo_position: 'center' });
    expect(cambioLogoCelular({ mobile_logo_position: 'center' }, 'inherit')).toEqual({ mobile_logo_position: null });
    const nuevo = { mobile_header: { layout: { sticky: false } } };
    expect(cambioLogoCelular(nuevo, 'right')).toEqual({ mobile_header: { layout: { sticky: false, logo: 'right' } }, mobile_logo_position: 'right' });
    expect(logoCelular({ mobile_header: { layout: { logo: 'center' } } })).toBe('center');
  });
  it('orden: el de siempre no se guarda (no activa el encabezado nuevo)', () => {
    const c = cambioOrdenCelular({}, 'menu-logo-acciones');
    expect(c).toEqual({ mobile_header: { layout: { arrangement: 'menu-logo-acciones' } } });
    expect(leerPresentacionMovil(c)?.layout?.arrangement).toBe('menu-logo-acciones');
    expect(cambioOrdenCelular({ mobile_header: { layout: { arrangement: 'menu-logo-acciones' } } }, 'logo-acciones-menu')).toEqual({ mobile_header: null });
  });
  it('menú inferior: opcional, editable y la tienda lo pinta sin cambiar el encabezado', () => {
    const on = cambioMenuInferiorActivo({}, true);
    const p = leerPresentacionMovil(on);
    expect(p?.barra?.items.map((i) => i.kind)).toEqual(['home', 'search', 'cart', 'account']);
    expect(p?.usarHeaderNuevo).toBe(false);
    const { items } = menuInferior(on);
    const editado = cambioItemsMenuInferior(on, [{ ...items[0], label: 'Casa', icon: 'heart', show_label: false }, ...items.slice(1), itemNuevo(items)]);
    const b = leerPresentacionMovil(editado)!.barra!;
    expect(b.items[0]).toMatchObject({ label: 'Casa', icon: 'heart', showLabel: false });
    expect(b.items).toHaveLength(5);
    expect(itemConTipo(items[0], 'whatsapp')).toMatchObject({ id: 'home', kind: 'whatsapp', icon: 'whatsapp' });
    const off = cambioMenuInferiorActivo(editado, false);
    expect(leerPresentacionMovil(off)).toBeNull();
    expect((off.mobile_header as { bottom_nav: { items: unknown[] } }).bottom_nav.items).toHaveLength(5);
  });
  it('sin duplicar: el menú inferior y el logo del celular ya no salen en «Ajustes de versiones anteriores»', () => {
    const a = { mobile_logo_position: 'center', mobile_header: { bottom_nav: { enabled: true } } };
    const ids = entradasAnterioresEncabezado(a, ['mobile_header', 'mobile_menu_style']).map((e) => e.id);
    expect(ids).not.toContain('mobile_header__bottom_nav');
  });
});
