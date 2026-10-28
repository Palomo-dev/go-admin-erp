import {
  breakpointCelular,
  cambioBreakpointCelular,
  cambioColorIconosCelular,
  cambioFijoCelular,
  cambioIconoVisible,
  cambioInterruptorCelular,
  cambioMedidaCelular,
  colorIconosCelular,
  fijoCelular,
  iconoVisible,
  medidaCelular,
} from '../inspector/celularLogica';
import { entradasAnterioresEncabezado } from '../inspector/anterioresLogica';
import { normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';

describe('Celular: fijo, breakpoint, medidas e íconos (una sola fuente)', () => {
  it('sin claves: lo de hoy y sin cambios al elegir lo de hoy', () => {
    const a = {};
    expect(fijoCelular(a)).toBe(true);
    expect(breakpointCelular(a)).toBe(1024);
    expect(medidaCelular(a, 'logo_size')).toBeNull();
    expect(iconoVisible(a, 'show_cart')).toBe(true);
    expect(colorIconosCelular(a)).toBeNull();
    expect(cambioFijoCelular(a, true)).toEqual({});
    expect(cambioBreakpointCelular(a, 1024)).toEqual({});
    expect(cambioIconoVisible(a, 'show_cart', true)).toEqual({});
    expect(normalizarOpcionShell('mobile_breakpoint', undefined)).toBe(1024);
    expect(normalizarOpcionShell('mobile_sticky_header', undefined)).toBeNull();
  });
  it('fijo: mobile_sticky_header manda; igual a computador = null; quita layout.sticky viejo', () => {
    expect(cambioFijoCelular({}, false)).toEqual({ mobile_sticky_header: false });
    expect(cambioFijoCelular({ mobile_sticky_header: false }, true)).toEqual({ mobile_sticky_header: null });
    expect(fijoCelular({ header_sticky: false })).toBe(false);
    expect(cambioFijoCelular({ header_sticky: false }, true)).toEqual({ mobile_sticky_header: true });
    expect(fijoCelular({ mobile_header: { layout: { sticky: false, logo_size: 40 } } })).toBe(false);
    expect(cambioFijoCelular({ mobile_header: { layout: { sticky: false, logo_size: 40 } } }, false)).toEqual({
      mobile_header: { layout: { logo_size: 40 } },
      mobile_sticky_header: false,
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
    expect(cambioInterruptorCelular({}, 'hide_on_scroll', true)).toEqual({ mobile_header: { layout: { hide_on_scroll: true } } });
    expect(cambioInterruptorCelular({ mobile_header: { layout: { transparent_hero: true } } }, 'transparent_hero', false)).toEqual({ mobile_header: null });
  });
  it('íconos: ocultar guarda false; color único en header_mobile_icon_color', () => {
    expect(cambioIconoVisible({}, 'show_account', false)).toEqual({ mobile_header: { icons: { show_account: false } } });
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
