/**
 * Encabezado píldora, botón principal y menú inferior flotante (Figma «Editor · Encabezado
 * píldora, menú inferior y botones», 2026-11-07): qué clave escribe cada control, que el valor de
 * hoy borra la clave y que lo fuera de rango no se guarda. Lógica pura, datos ficticios (org 120).
 */
import { leerMenuInferior, MAX_BOTONES, VARIANTES_MENU } from '@/lib/website/menuInferior';
import {
  ALTO_TAMANO,
  FORMAS_BOTON,
  PILDORA_SIN_CLAVE,
  altoMostrado,
  cambioAlto,
  cambioAncho,
  cambioEstiloBoton,
  cambioFormaBoton,
  cambioIconoBoton,
  cambioLadoIcono,
  cambioMayusculas,
  cambioModoAncho,
  cambioPildora,
  cambioRellenoX,
  cambioSeparacion,
  cambioSombra,
  cambioTamanoBoton,
  estiloBoton,
  formaBoton,
  iconoBoton,
  ladoAplica,
  ladoIcono,
  mayusculasBoton,
  radioDeHoy,
  rellenoX,
  separacionPildora,
  sombraBoton,
  valorPildora,
} from '../inspector/pildoraLogica';
import { cambioMenuV2, conEstiloFlotante, conVariante, estiloFlotante, menuDelEditor, usaCentro } from '../inspector/menuInferiorLogica';

describe('grupo «Píldora» (P1)', () => {
  test('sin claves muestra lo que el sitio pinta hoy', () => {
    expect(valorPildora({}, 'header_pill_style')).toBe('vidrio');
    expect(valorPildora({}, 'header_pill_glass_opacity')).toBe(10);
    expect(valorPildora({}, 'header_pill_blur')).toBe(24);
    expect(valorPildora({}, 'header_pill_border')).toBe(true);
    expect(valorPildora({}, 'header_pill_on_scroll')).toBe('fondo_tema');
    expect(valorPildora({}, 'header_pill_text_case')).toBe('versalitas');
    expect(valorPildora({}, 'header_pill_position')).toBe('arriba');
    expect(separacionPildora({})).toBeNull();
  });

  test('lee lo guardado y descarta lo inválido', () => {
    const a = { header_pill_style: 'solido', header_pill_glass_opacity: 30, header_pill_border: false, header_pill_position: 'ambas', header_float_offset: 12 };
    expect(valorPildora(a, 'header_pill_style')).toBe('solido');
    expect(valorPildora(a, 'header_pill_glass_opacity')).toBe(30);
    expect(valorPildora(a, 'header_pill_border')).toBe(false);
    expect(valorPildora(a, 'header_pill_position')).toBe('ambas');
    expect(separacionPildora(a)).toBe(12);
    expect(valorPildora({ header_pill_style: 'isla', header_pill_blur: 90 }, 'header_pill_style')).toBe('vidrio');
    expect(valorPildora({ header_pill_blur: 90 }, 'header_pill_blur')).toBe(24);
    expect(separacionPildora({ header_float_offset: 99 })).toBeNull();
  });

  test('cada control escribe su clave', () => {
    expect(cambioPildora('header_pill_style', 'contorno')).toEqual({ header_pill_style: 'contorno' });
    expect(cambioPildora('header_pill_glass_opacity', 25)).toEqual({ header_pill_glass_opacity: 25 });
    expect(cambioPildora('header_pill_blur', 8)).toEqual({ header_pill_blur: 8 });
    expect(cambioPildora('header_pill_border', false)).toEqual({ header_pill_border: false });
    expect(cambioPildora('header_pill_on_scroll', 'igual')).toEqual({ header_pill_on_scroll: 'igual' });
    expect(cambioPildora('header_pill_text_case', 'normal')).toEqual({ header_pill_text_case: 'normal' });
    expect(cambioPildora('header_pill_position', 'abajo')).toEqual({ header_pill_position: 'abajo' });
    expect(cambioSeparacion(20)).toEqual({ header_float_offset: 20 });
  });

  test('elegir el valor de hoy borra la clave (null)', () => {
    for (const [clave, hoy] of Object.entries(PILDORA_SIN_CLAVE)) {
      expect(cambioPildora(clave as keyof typeof PILDORA_SIN_CLAVE, hoy as never)).toEqual({ [clave]: null });
    }
    expect(cambioSeparacion(null)).toEqual({ header_float_offset: null });
  });

  test('fuera de rango: se lleva al borde y se redondea; lo que no es número o no está en la lista, null', () => {
    expect(cambioPildora('header_pill_glass_opacity', 55)).toEqual({ header_pill_glass_opacity: 40 });
    expect(cambioPildora('header_pill_glass_opacity', -3)).toEqual({ header_pill_glass_opacity: 0 });
    expect(cambioPildora('header_pill_blur', 12.6)).toEqual({ header_pill_blur: 13 });
    // 23,6 redondea a 24, que es lo de hoy: no se guarda.
    expect(cambioPildora('header_pill_blur', 23.6)).toEqual({ header_pill_blur: null });
    expect(cambioPildora('header_pill_blur', Number.NaN)).toEqual({ header_pill_blur: null });
    expect(cambioSeparacion(40)).toEqual({ header_float_offset: 32 });
    expect(cambioSeparacion(-1)).toEqual({ header_float_offset: 0 });
    expect(cambioPildora('header_pill_style', 'isla' as never)).toEqual({ header_pill_style: null });
  });
});

describe('vista «Botón principal» (P2)', () => {
  test('Forma: 4 tarjetas en el orden del diseño; sin clave respeta el radio guardado', () => {
    expect(FORMAS_BOTON).toEqual(['pill', 'rounded', 'square', 'circle']);
    expect(formaBoton({})).toBeNull();
    expect(radioDeHoy({})).toBe(8);
    expect(radioDeHoy({ cta_border_radius: 0 })).toBe(0);
    expect(formaBoton({ header_cta_shape: 'circle' })).toBe('circle');
    expect(formaBoton({ header_cta_shape: 'triangulo' })).toBeNull();
    expect(cambioFormaBoton('square')).toEqual({ header_cta_shape: 'square' });
    expect(cambioFormaBoton(null)).toEqual({ header_cta_shape: null });
    // Elegir forma no toca cta_border_radius (lo siguen usando el segundo botón y el del celular).
    expect(Object.keys(cambioFormaBoton('pill'))).toEqual(['header_cta_shape']);
  });

  test('Tamaño S/M/L y «Como hoy»; un alto igual al del tamaño nuevo sobra', () => {
    expect(ALTO_TAMANO).toEqual({ sm: 36, md: 44, lg: 50 });
    expect(cambioTamanoBoton({}, 'lg')).toEqual({ header_cta_size: 'lg' });
    expect(cambioTamanoBoton({ header_cta_size: 'lg' }, null)).toEqual({ header_cta_size: null });
    expect(cambioTamanoBoton({ header_cta_height: 44 }, 'md')).toEqual({ header_cta_size: 'md', header_cta_height: null });
    expect(cambioTamanoBoton({}, 'xl' as never)).toEqual({ header_cta_size: null });
  });

  test('Ancho automático o fijo (60–280) y alto (28–80, manda sobre el tamaño)', () => {
    expect(cambioModoAncho({}, 'fijo')).toEqual({ header_cta_width: 120 });
    expect(cambioModoAncho({ header_cta_width: 200 }, 'fijo')).toEqual({ header_cta_width: 200 });
    expect(cambioModoAncho({ header_cta_width: 200 }, 'auto')).toEqual({ header_cta_width: null });
    expect(cambioAncho(300)).toEqual({ header_cta_width: 280 });
    expect(cambioAncho(10)).toEqual({ header_cta_width: 60 });
    expect(cambioAlto({}, 50)).toEqual({ header_cta_height: 50 });
    expect(cambioAlto({}, 100)).toEqual({ header_cta_height: 80 });
    expect(cambioAlto({}, 2)).toEqual({ header_cta_height: 28 });
    expect(cambioAlto({ header_cta_size: 'lg' }, 50)).toEqual({ header_cta_height: null });
    expect(cambioAlto({ header_cta_height: 60 }, null)).toEqual({ header_cta_height: null });
    expect(altoMostrado({})).toBe(40);
    expect(altoMostrado({ header_cta_size: 'sm' })).toBe(36);
    expect(altoMostrado({ header_cta_size: 'sm', header_cta_height: 70 })).toBe(70);
  });

  test('Relleno horizontal (cta_padding_x existente, 0–40)', () => {
    expect(rellenoX({})).toBe(16);
    expect(rellenoX({ cta_padding_x: 24 })).toBe(24);
    expect(cambioRellenoX(20)).toEqual({ cta_padding_x: 20 });
    expect(cambioRellenoX(55)).toEqual({ cta_padding_x: 40 });
    expect(cambioRellenoX(-4)).toEqual({ cta_padding_x: 0 });
  });

  test('Estilo: sin clave es «Sólido» (hoy); elegir «Sólido» borra la clave', () => {
    expect(estiloBoton({})).toBe('solido');
    expect(cambioEstiloBoton('vidrio')).toEqual({ header_cta_style: 'vidrio' });
    expect(cambioEstiloBoton('tema')).toEqual({ header_cta_style: 'tema' });
    expect(cambioEstiloBoton('solido')).toEqual({ header_cta_style: null });
    expect(cambioEstiloBoton('neon' as never)).toEqual({ header_cta_style: null });
  });

  test('Ícono (ninguno por defecto) y lado: izquierda, encima en el círculo', () => {
    expect(iconoBoton({})).toBeNull();
    expect(cambioIconoBoton('calendar-days')).toEqual({ header_cta_icon: 'calendar-days' });
    expect(cambioIconoBoton(null)).toEqual({ header_cta_icon: null });
    expect(cambioIconoBoton('x'.repeat(41))).toEqual({ header_cta_icon: null });
    expect(ladoIcono({})).toBe('izquierda');
    expect(ladoIcono({ header_cta_shape: 'circle' })).toBe('encima');
    expect(cambioLadoIcono({}, 'derecha')).toEqual({ header_cta_icon_side: 'derecha' });
    expect(cambioLadoIcono({}, 'izquierda')).toEqual({ header_cta_icon_side: null });
    expect(cambioLadoIcono({ header_cta_shape: 'circle' }, 'encima')).toEqual({ header_cta_icon_side: null });
    expect(ladoAplica({})).toBe(false);
    expect(ladoAplica({ header_cta_icon: 'phone' })).toBe(true);
    expect(ladoAplica({ header_cta_shape: 'circle' })).toBe(true);
  });

  test('Mayúsculas: como el sitio (null), sí o no; sombra con cta_shadow existente', () => {
    expect(mayusculasBoton({})).toBe('sitio');
    expect(mayusculasBoton({ header_cta_uppercase: false })).toBe('no');
    expect(cambioMayusculas('si')).toEqual({ header_cta_uppercase: true });
    expect(cambioMayusculas('no')).toEqual({ header_cta_uppercase: false });
    expect(cambioMayusculas('sitio')).toEqual({ header_cta_uppercase: null });
    expect(sombraBoton({})).toBe('none');
    expect(sombraBoton({ cta_shadow: 'xl' })).toBe('none');
    expect(cambioSombra('md')).toEqual({ cta_shadow: 'md' });
  });
});

describe('menú inferior · píldora flotante (P4)', () => {
  const base = () => menuDelEditor({ mobile_menu_style: 'tabs' }).menu;

  test('variante del contrato con 5 botones y destacado en centerId, como pestañas', () => {
    expect(VARIANTES_MENU).toContain('floating');
    expect(MAX_BOTONES.floating).toBe(5);
    expect(usaCentro('floating')).toBe(true);
    expect(usaCentro('tabs')).toBe(true);
    expect(usaCentro('actions')).toBe(false);
    const conCentro = { ...base(), style: { ...base().style, centerId: 'search' } };
    const flotante = conVariante(conCentro, 'floating');
    expect(flotante.variant).toBe('floating');
    expect(flotante.items).toHaveLength(5);
    expect(flotante.style.centerId).toBe('search');
    expect(conVariante(flotante, 'actions').style.centerId).toBeUndefined();
  });

  test('sin claves: vidrio, 16 px, ancho del contenido, relleno', () => {
    expect(estiloFlotante(conVariante(base(), 'floating'))).toEqual({ glass: true, offset: 16, width: 'content', indicator: 'fill' });
  });

  test('cada opción escribe su clave de style; el valor de hoy la quita; fuera de rango se corrige', () => {
    const m = conVariante(base(), 'floating');
    const s = conEstiloFlotante(m, { glass: false, offset: 24, width: 'full', indicator: 'dot' }).style;
    expect(s).toMatchObject({ glass: false, offset: 24, width: 'full', indicator: 'dot' });
    const deVuelta = conEstiloFlotante({ ...m, style: s }, { glass: true, offset: 16, width: 'content', indicator: 'fill' }).style;
    for (const k of ['glass', 'offset', 'width', 'indicator']) expect(deVuelta).not.toHaveProperty(k);
    expect(conEstiloFlotante(m, { offset: 50 }).style.offset).toBe(32);
    expect(conEstiloFlotante(m, { offset: -2 }).style.offset).toBe(0);
    expect(conEstiloFlotante(m, { offset: 7.4 }).style.offset).toBe(7);
    expect(conEstiloFlotante(m, { width: 'enorme' as never }).style).not.toHaveProperty('width');
    expect(conEstiloFlotante(m, { indicator: 'raya' as never }).style).not.toHaveProperty('indicator');
  });

  test('guardar y leer: style.glass/offset/width/indicator viajan en mobile_header.bottom_nav v:2', () => {
    const m = conEstiloFlotante({ ...conVariante(base(), 'floating'), enabled: true }, { glass: false, offset: 8, width: 'full', indicator: 'line' });
    const leido = leerMenuInferior(cambioMenuV2({}, m))!;
    expect(leido.variant).toBe('floating');
    expect(leido.enabled).toBe(true);
    expect(leido.style).toMatchObject({ glass: false, offset: 8, width: 'full', indicator: 'line' });
    expect(estiloFlotante(leido)).toEqual({ glass: false, offset: 8, width: 'full', indicator: 'line' });
  });

  test('salir de la píldora flotante quita sus opciones (no se guarda de más)', () => {
    const m = conEstiloFlotante(conVariante(base(), 'floating'), { glass: false, offset: 8 });
    const tabs = conVariante(m, 'tabs');
    expect(tabs.style).not.toHaveProperty('glass');
    expect(tabs.style).not.toHaveProperty('offset');
    const guardado = (cambioMenuV2({}, tabs).mobile_header as { bottom_nav: { style: Record<string, unknown> } }).bottom_nav.style;
    expect(guardado).not.toHaveProperty('glass');
  });
});
