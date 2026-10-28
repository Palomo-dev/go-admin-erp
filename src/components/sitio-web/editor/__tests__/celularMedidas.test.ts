import {
  breakpointCelular,
  cambioBreakpointCelular,
  cambioColorIconosCelular,
  cambioIconoVisible,
  cambioMedidaCelular,
  colorIconosCelular,
  iconoVisible,
  medidaCelular,
  ajustesDistintosCelular,
  cambioIgualarCelular,
} from '../inspector/celularLogica';
import { entradasAnterioresEncabezado } from '../inspector/anterioresLogica';
import { normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';

import { leerPresentacionMovil } from '@/lib/website/menuMovil';

describe('Ninguna opción suelta cambia el encabezado del celular (QA 28-oct)', () => {
  const sueltas: Record<string, Record<string, unknown>> = {
    tamano: cambioMedidaCelular({}, 'logo_size', 48),
    alto: cambioMedidaCelular({}, 'header_height', 70),
    sinCarrito: cambioIconoVisible({}, 'show_cart', false),
    sinBuscar: cambioIconoVisible({}, 'show_search', false),
    sinMenu: cambioIconoVisible({}, 'show_menu', false),
    cuenta: cambioIconoVisible({}, 'show_account', true),
    color: cambioColorIconosCelular({}, '#ff0000'),
    breakpoint: cambioBreakpointCelular({}, 768),
    igualar: cambioIgualarCelular({ mobile_sticky_header: false, mobile_header: { layout: { sticky: false } } }),
    fijoViejo: { mobile_header: { layout: { sticky: false } } },
    ocultarViejo: { mobile_header: { layout: { hide_on_scroll: true } } },
    transparenteViejo: { mobile_header: { layout: { transparent_hero: true } } },
    colorViejo: { mobile_header: { icons: { color: '#ff0000' } } },
  };
  for (const estilo of ['drawer', 'fullscreen', 'bottom_sheet', 'tabs']) {
    for (const [nombre, cambio] of Object.entries(sueltas)) {
      it(`${estilo} + ${nombre}: sigue el encabezado de la plantilla`, () => {
        expect(leerPresentacionMovil({ mobile_menu_style: estilo, ...cambio })?.usarHeaderNuevo ?? false).toBe(false);
      });
    }
  }
});

describe('Celular: fijo, breakpoint, medidas e íconos (una sola fuente)', () => {
  it('sin claves: lo de hoy y sin cambios al elegir lo de hoy', () => {
    const a = {};
    expect(ajustesDistintosCelular(a)).toEqual([]);
    expect(breakpointCelular(a)).toBe(1024);
    expect(medidaCelular(a, 'logo_size')).toBeNull();
    expect(iconoVisible(a, 'show_cart')).toBe(true);
    expect(colorIconosCelular(a)).toBeNull();
    expect(cambioIgualarCelular(a)).toEqual({});
    expect(cambioBreakpointCelular(a, 1024)).toEqual({});
    expect(cambioIconoVisible(a, 'show_cart', true)).toEqual({});
    expect(normalizarOpcionShell('mobile_breakpoint', undefined)).toBe(1024);
    expect(normalizarOpcionShell('mobile_sticky_header', undefined)).toBeNull();
  });
  it('fijo, ocultar y transparente: una opción con computador; lo distinto guardado se avisa y se iguala', () => {
    expect(ajustesDistintosCelular({ mobile_sticky_header: true })).toEqual([]);
    expect(ajustesDistintosCelular({ mobile_sticky_header: false })).toEqual(['fijo']);
    expect(ajustesDistintosCelular({ header_sticky: false, mobile_header: { layout: { sticky: true } } })).toEqual(['fijo']);
    expect(ajustesDistintosCelular({ mobile_header: { layout: { hide_on_scroll: true } } })).toEqual(['ocultar']);
    expect(ajustesDistintosCelular({ header_scroll: 'ocultar_al_bajar', mobile_header: { layout: { hide_on_scroll: true } } })).toEqual([]);
    expect(ajustesDistintosCelular({ mobile_header: { layout: { transparent_hero: true } } })).toEqual(['transparente']);
    expect(ajustesDistintosCelular({ header_transparent_over_hero: true, mobile_header: { layout: { transparent_hero: true } } })).toEqual([]);
    expect(cambioIgualarCelular({ mobile_sticky_header: false, mobile_header: { layout: { sticky: false, hide_on_scroll: true, transparent_hero: true, logo_size: 40 } } })).toEqual({
      mobile_sticky_header: null,
      mobile_header: { layout: { logo_size: 40 } },
    });
  });
  it('breakpoint: 640/768 se guardan; 1024 vuelve a null', () => {
    expect(cambioBreakpointCelular({}, 768)).toEqual({ mobile_breakpoint: 768 });
    expect(breakpointCelular({ mobile_breakpoint: 640 })).toBe(640);
    expect(cambioBreakpointCelular({ mobile_breakpoint: 640 }, 1024)).toEqual({ mobile_breakpoint: null });
  });
  it('medidas y conmutadores van a mobile_header.layout; fuera de rango no se guarda', () => {
    expect(cambioMedidaCelular({}, 'logo_size', 48)).toEqual({ mobile_header: { layout: { logo_size: 48 } } });
    expect(cambioMedidaCelular({}, 'logo_size', 6)).toEqual({});
    expect(cambioMedidaCelular({ mobile_header: { layout: { header_height: 64 } } }, 'header_height', null)).toEqual({ mobile_header: null });
  });
  it('íconos: ocultar guarda false; color único en header_mobile_icon_color', () => {
    expect(cambioIconoVisible({}, 'show_cart', false)).toEqual({ mobile_header: { icons: { show_cart: false } } });
    expect(iconoVisible({}, 'show_account')).toBe(false);
    expect(cambioIconoVisible({}, 'show_account', true)).toEqual({ mobile_header: { icons: { show_account: true } } });
    expect(colorIconosCelular({ mobile_header: { icons: { color: '#ff0000' } } })).toBe('#ff0000');
    expect(cambioColorIconosCelular({ mobile_header: { icons: { color: '#ff0000' } } }, '#00ff00')).toEqual({ mobile_header: null, header_mobile_icon_color: '#00ff00' });
    expect(cambioColorIconosCelular({}, null)).toEqual({ header_mobile_icon_color: null });
  });
  it('anteriores ya no ofrece nada del celular que vive en Celular', () => {
    const a = {
      header_mobile_icon_color: '#ffffff',
      mobile_header: { layout: { logo_size: 40, header_height: 60, sticky: false, hide_on_scroll: true, transparent_hero: true }, icons: { show_cart: false, color: '#fff' } },
    };
    const ids = entradasAnterioresEncabezado(a, ['mobile_header']).map((e: { id: string }) => e.id);
    expect(ids).not.toContain('header_mobile_icon_color');
    expect(ids).not.toContain('mobile_header__layout');
    expect(ids).not.toContain('mobile_header__icons');
  });
});
