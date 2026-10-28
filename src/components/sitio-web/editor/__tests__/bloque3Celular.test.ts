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

import {
  cambioBordeIconos,
  cambioBuscadorPantallaCompleta,
  cambioGlifoMenu,
  cambioLadoCajon,
  cambioPanel,
  cambioTarjetaMenu,
  glifoMenu,
  muestraBuscadorPantallaCompleta,
  panelMenu,
  tarjetaMenu,
} from '../inspector/celularLogica';

describe('bloque 3 · Celular completo (panel, íconos, buscador)', () => {
  it('sin nada guardado: valores de siempre y la tienda sigue con el encabezado de hoy', () => {
    expect(tarjetaMenu({})).toBe('cajon');
    expect(panelMenu({})).toMatchObject({ width: 85, background: 'color', overlay: 50, animation: 'slide' });
    expect(glifoMenu({})).toBe('lines3');
    expect(leerPresentacionMovil({})).toBeNull();
  });

  it('el valor de siempre no se guarda; otro sí y la tienda lo lee', () => {
    expect(cambioPanel({}, 'width', 85)).toEqual({ mobile_header: null });
    const c = cambioPanel({}, 'width', 92);
    expect(c).toEqual({ mobile_header: { panel: { width: 92 } } });
    expect(leerPresentacionMovil(c)?.panel?.width).toBe(92);
    const g = cambioPanel({ mobile_header: { panel: { background: 'gradient', gradient_1: '#000', gradient_2: '#fff' } } }, 'background', 'blur');
    expect(g).toEqual({ mobile_header: { panel: { background: 'blur' } } });
  });

  it('cajón lateral: la tarjeta conserva el lado y el lado cambia el estilo', () => {
    expect(cambioTarjetaMenu({ mobile_menu_style: 'drawer_left' }, 'cajon')).toEqual({});
    expect(cambioTarjetaMenu({ mobile_menu_style: 'tabs' }, 'cajon')).toEqual({ mobile_menu_style: 'drawer' });
    expect(cambioLadoCajon({}, 'izquierda')).toEqual({ mobile_menu_style: 'drawer_left' });
  });

  it('íconos: tres líneas y «como en computador» no se guardan; el círculo queda', () => {
    expect(cambioGlifoMenu({}, 'lines3')).toEqual({});
    expect(cambioGlifoMenu({}, 'dots')).toEqual({ mobile_header: { icons: { menu: 'dots' } } });
    expect(cambioGlifoMenu({ mobile_header: { icons: { menu: 'dots' } } }, 'lines3')).toEqual({ mobile_header: null });
    expect(cambioBordeIconos({}, true)).toEqual({ mobile_header: { icons: { style: 'border' } } });
    expect(cambioBordeIconos({ mobile_header: { icons: { style: 'circle' } } }, false)).toEqual({});
  });

  it('buscador: pantalla completa solo con el ícono; ya no aparece en «anteriores»', () => {
    expect(muestraBuscadorPantallaCompleta({})).toBe(true);
    expect(muestraBuscadorPantallaCompleta({ search_style: 'bar', mobile_search_style: null })).toBe(false);
    expect(cambioBuscadorPantallaCompleta({}, true)).toEqual({ mobile_header: { search: 'fullscreen' } });
    expect(cambioBuscadorPantallaCompleta({ mobile_header: { search: 'fullscreen' } }, false)).toEqual({ mobile_header: null });
    const a = { mobile_header: { search: 'fullscreen', panel: { width: 90 }, icons: { menu: 'dots' } } };
    expect(entradasAnterioresEncabezado(a, ['mobile_header'])).toEqual([]);
  });
});

describe('QA 28-oct · duplicados', () => {
  it('logo y orden del celular ya no aparecen en «anteriores»; el resto de layout sí', () => {
    expect(entradasAnterioresEncabezado({ mobile_header: { layout: { logo: 'center', arrangement: 'menu-logo-acciones' } } }, ['mobile_header'])).toEqual([]);
    // Alto, tamaño, fijo, ocultar y transparente también viven ya en «Celular».
    expect(entradasAnterioresEncabezado({ mobile_header: { layout: { logo: 'center', header_height: 70 } } }, ['mobile_header'])).toEqual([]);
  });

  it('el orden solo no cambia el encabezado de siempre en la tienda (P2)', () => {
    expect(leerPresentacionMovil({ mobile_menu_style: 'fullscreen', mobile_header: { layout: { arrangement: 'menu-logo-acciones' } } })?.usarHeaderNuevo).toBe(false);
  });
});
