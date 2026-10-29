import { aplicarPresetDiseno, cascaronTemaDisponible, tokensDisenoDisponibles } from '@/lib/website/v2/tokensEstilo';
import { variablesDeTokens } from '@/lib/website/v2/tokensDiseno';
import { PRESETS_DISENO, presetDisenoPorId } from '@/lib/website/v2/presetsDiseno';
import { resolverIconoEncabezado } from '@/lib/website/v2/iconosEncabezado';
import { estiloDeHeaderLayout, normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';
import { validarDocumentoSitio, valorPropio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    tema: { colores: {}, tipografia: {} },
    shell: { header: { composicion: 'default', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [] } },
    menus: [],
    paginas: [],
  });
  if (!r.ok) throw new Error('documento');
  return r.documento;
}

describe('perillas y encabezado', () => {
  const env = process.env.NEXT_PUBLIC_WEBSITE_TOKENS_DISENO;

  afterEach(() => {
    process.env.NEXT_PUBLIC_WEBSITE_TOKENS_DISENO = env;
  });

  it('sin perillas no hay variables nuevas', () => {
    expect(variablesDeTokens(undefined)).toEqual({});
    expect(variablesDeTokens(null)).toEqual({});
  });

  it('un radio elegido emite la variable y el actual no escribe nada', () => {
    expect(variablesDeTokens({ radio: { mode: 'value', value: 'suave' } })['--gw-radius-card']).toBe('8px');
    expect(presetDisenoPorId('actual').tokens).toEqual({});
    expect(PRESETS_DISENO.map((p) => p.id)).toContain('comercio_vibrante');
  });

  it('el estilo global de encabezados no se escribe hasta que el sitio lo acepte', () => {
    const env = process.env.NEXT_PUBLIC_WEBSITE_CASCARON;
    delete process.env.NEXT_PUBLIC_WEBSITE_CASCARON;
    expect(cascaronTemaDisponible()).toBe(false);
    process.env.NEXT_PUBLIC_WEBSITE_CASCARON = '1';
    expect(cascaronTemaDisponible()).toBe(true);
    if (env === undefined) delete process.env.NEXT_PUBLIC_WEBSITE_CASCARON;
    else process.env.NEXT_PUBLIC_WEBSITE_CASCARON = env;
  });

  it('con el flag apagado el preset no se escribe', () => {
    process.env.NEXT_PUBLIC_WEBSITE_TOKENS_DISENO = '';
    expect(tokensDisenoDisponibles()).toBe(false);
    const base = documento();
    expect(aplicarPresetDiseno(base, 'editorial')).toBe(base);
  });

  it('con el flag prendido el preset escribe tokens y al volver a hoy los quita', () => {
    process.env.NEXT_PUBLIC_WEBSITE_TOKENS_DISENO = '1';
    const base = documento();
    const aplicado = aplicarPresetDiseno(base, 'editorial');
    expect(aplicado.tema.tokens?.radio).toEqual({ mode: 'value', value: 'ninguno' });
    expect(aplicado.shell.header.opciones.header_layout).toBe('logo_centro_menu_abajo');
    const vuelto = aplicarPresetDiseno(aplicado, 'actual');
    expect(vuelto.tema.tokens).toBeUndefined();
    expect(vuelto.shell.header.opciones.header_layout).toBeUndefined();
  });

  it('el icono propio gana, y la forma no pisa un icono distinto', () => {
    expect(resolverIconoEncabezado('cart', { cart_icon: 'gift', header_cart_glyph: 'carrito' }).nombre).toBe('gift');
    expect(resolverIconoEncabezado('cart', { cart_icon: 'shopping-bag', header_cart_glyph: 'carrito' }).nombre).toBe('shopping-cart');
    expect(resolverIconoEncabezado('search', {}).nombre).toBe('search');
    expect(resolverIconoEncabezado('search', { header_icons: { search: { iconoUrl: 'https://cdn.ejemplo/lupa.svg', icono: 'search' } } }).url).toBe('https://cdn.ejemplo/lupa.svg');
    expect(resolverIconoEncabezado('account', { auth_icon: 'user-circle' }).nombre).toBe('user-circle');
  });

  it('íconos nuevos de carrito, cuenta y moneda; sin configurar, la moneda sigue en globe', () => {
    expect(resolverIconoEncabezado('currency', null).nombre).toBe('globe');
    expect(resolverIconoEncabezado('currency', {}).nombre).toBe('globe');
    expect(resolverIconoEncabezado('currency', { currency_icon: 'languages' }).nombre).toBe('languages');
    expect(resolverIconoEncabezado('currency', { currency_icon: 'coins', header_icons: { currency: { icono: 'circle-dollar-sign' } } }).nombre).toBe('circle-dollar-sign');
    expect(resolverIconoEncabezado('cart', { cart_icon: 'shopping-basket', header_cart_glyph: 'carrito' }).nombre).toBe('shopping-basket');
    expect(resolverIconoEncabezado('cart', { cart_icon: 'store' }).nombre).toBe('store');
    expect(resolverIconoEncabezado('account', { auth_icon: 'circle-user-round' }).nombre).toBe('circle-user-round');
    expect(resolverIconoEncabezado('account', { auth_icon: 'log-in' }).nombre).toBe('log-in');
  });

  it('sin layout nuevo se conserva el header_style', () => {
    expect(estiloDeHeaderLayout(null)).toBeNull();
    expect(estiloDeHeaderLayout(undefined)).toBeNull();
    expect(normalizarOpcionShell('header_scroll', undefined)).toBe('fijo');
    expect(estiloDeHeaderLayout('comercio')).toBe('comercio');
    expect(valorPropio('suave').mode).toBe('value');
  });
});
