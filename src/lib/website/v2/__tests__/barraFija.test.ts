/**
 * Barra fija de compra de la ficha (Figma 2836:69391, propuesta 9; nota 2859:71821): contrato del
 * bloque `product_actions`. Sin claves = lo de hoy. La tienda tiene una copia idéntica del módulo
 * (goadmin-websites, `npm run verify:copias`).
 */
import {
  CELULAR_POR_DEFECTO,
  ESCRITORIO_POR_DEFECTO,
  MAX_TEXTO_BARRA_FIJA,
  TEXTO_BARRA_FIJA,
  UMBRAL_BARRA_FIJA_PX,
  barraDebeVerse,
  barraReemplazaVisible,
  celularComoHoy,
  contenidoConBarraFija,
  empujeChatBarra,
  leerBarraFija,
  textoBarraLimpio,
  textoBotonBarra,
} from '../barraFija';

describe('leerBarraFija: sin claves = lo de hoy', () => {
  it.each([[undefined], [null], [{}], [{ sticky: 'basura' }], [{ sticky: [] }]])('%j → celular de hoy y sin barra en el computador', (c) => {
    const b = leerBarraFija(c as Record<string, unknown> | null | undefined);
    expect(b.celular).toEqual(CELULAR_POR_DEFECTO);
    expect(b.escritorio).toEqual(ESCRITORIO_POR_DEFECTO);
    expect(b.escritorio.encendida).toBe(false);
    expect(b.configurado).toBe(false);
    expect(celularComoHoy(b.celular)).toBe(true);
  });

  it('lo de hoy: plana, sin miniatura ni cantidad ni «Comprar ahora», corazón sí, 400 px, check, sin vibración', () => {
    expect(CELULAR_POR_DEFECTO).toMatchObject({
      encendida: true,
      estilo: 'flat',
      miniatura: false,
      cantidad: false,
      comprarAhora: false,
      favorito: true,
      texto: null,
      aparece: 'scroll',
      alAgregar: 'check',
      vibracion: false,
    });
    expect(UMBRAL_BARRA_FIJA_PX).toBe(400);
    expect(textoBotonBarra(null)).toBe('Agregar al carrito');
  });

  it('respeta sticky_mobile: solo `false` la apaga', () => {
    expect(leerBarraFija({ sticky_mobile: false }).celular.encendida).toBe(false);
    expect(leerBarraFija({ sticky_mobile: true }).celular.encendida).toBe(true);
    expect(leerBarraFija({ sticky_mobile: 'no' }).celular.encendida).toBe(true);
  });
});

describe('leerBarraFija: claves de la nota 2859:71821', () => {
  const contenido = {
    sticky: {
      style: 'floating',
      thumb: true,
      qty: true,
      buyNow: true,
      fav: false,
      label: '  ¡Lo   quiero!  ',
      trigger: 'pass',
      addFx: 'fly',
      haptic: true,
      desktop: { enabled: true, position: 'replace', style: 'glass', thumb: false, price: false, variant: false, qty: false, buyNow: false, fav: false, trigger: 'scroll' },
    },
  };

  it('celular', () => {
    expect(leerBarraFija(contenido).celular).toEqual({
      encendida: true,
      estilo: 'floating',
      miniatura: true,
      cantidad: true,
      comprarAhora: true,
      favorito: false,
      texto: '¡Lo quiero!',
      aparece: 'pass',
      alAgregar: 'fly',
      vibracion: true,
    });
  });

  it('computador', () => {
    expect(leerBarraFija(contenido).escritorio).toEqual({
      encendida: true,
      posicion: 'replace',
      estilo: 'glass',
      miniatura: false,
      precio: false,
      variante: false,
      cantidad: false,
      comprarAhora: false,
      favorito: false,
      aparece: 'scroll',
    });
  });

  it('valores desconocidos vuelven al de hoy (nunca lanza)', () => {
    const b = leerBarraFija({ sticky: { style: 'neon', trigger: 1, addFx: 'boom', thumb: 'si', desktop: { enabled: 'true', position: 'left' } } });
    expect(b.celular).toEqual(CELULAR_POR_DEFECTO);
    expect(b.escritorio.encendida).toBe(false);
    expect(b.escritorio.posicion).toBe('top');
    expect(b.configurado).toBe(true);
  });

  it('el computador encendido arranca como K-E2: arriba, plana, todo a la vista, al pasar el botón', () => {
    const e = leerBarraFija({ sticky: { desktop: { enabled: true } } }).escritorio;
    expect(e).toEqual({ ...ESCRITORIO_POR_DEFECTO, encendida: true });
    expect(e).toMatchObject({ posicion: 'top', estilo: 'flat', aparece: 'pass', miniatura: true, precio: true, variante: true, cantidad: true, comprarAhora: true, favorito: true });
  });

  it('cambiar cuándo aparece o la vibración no cambia cómo se ve', () => {
    expect(celularComoHoy(leerBarraFija({ sticky: { trigger: 'pass', haptic: true } }).celular)).toBe(true);
    expect(celularComoHoy(leerBarraFija({ sticky: { style: 'glass' } }).celular)).toBe(false);
    expect(celularComoHoy(leerBarraFija({ sticky: { label: 'Lo quiero' } }).celular)).toBe(false);
    expect(celularComoHoy(leerBarraFija({ sticky: { addFx: 'fly' } }).celular)).toBe(false);
  });
});

describe('textoBarraLimpio', () => {
  it('recorta, une espacios y corta en 28', () => {
    expect(textoBarraLimpio('   ')).toBeNull();
    expect(textoBarraLimpio(3)).toBeNull();
    expect(textoBarraLimpio(' a  b ')).toBe('a b');
    const largo = 'x'.repeat(40);
    expect(textoBarraLimpio(largo)).toHaveLength(MAX_TEXTO_BARRA_FIJA);
    expect(textoBotonBarra('Lo quiero')).toBe('Lo quiero');
    expect(TEXTO_BARRA_FIJA).toBe('Agregar al carrito');
  });
});

describe('contenidoConBarraFija (editor)', () => {
  it('lo de hoy no escribe `sticky` y conserva las demás claves', () => {
    const c = contenidoConBarraFija({ actions: [1], preset: 'clasica', sticky_mobile: true }, { celular: { estilo: 'flat' } });
    expect(c).toEqual({ actions: [1], preset: 'clasica', sticky_mobile: true });
  });

  it('apagar el celular escribe sticky_mobile: false (como el interruptor de antes)', () => {
    expect(contenidoConBarraFija({}, { celular: { encendida: false } })).toEqual({ sticky_mobile: false });
  });

  it('solo guarda lo distinto de hoy', () => {
    const c = contenidoConBarraFija({}, { celular: { estilo: 'glass', texto: '  Lo quiero ' } });
    expect(c).toEqual({ sticky: { style: 'glass', label: 'Lo quiero' } });
  });

  it('volver todo a lo de hoy quita `sticky`', () => {
    const c1 = contenidoConBarraFija({}, { celular: { estilo: 'glass' } });
    const c2 = contenidoConBarraFija(c1, { celular: { estilo: 'flat' } });
    expect(c2).toEqual({});
  });

  it('encender el computador guarda desktop.enabled; apagarlo sin opciones propias lo quita', () => {
    const c1 = contenidoConBarraFija({}, { escritorio: { encendida: true } });
    expect(c1).toEqual({ sticky: { desktop: { enabled: true } } });
    expect(contenidoConBarraFija(c1, { escritorio: { encendida: false } })).toEqual({});
  });

  it('apagar el computador CON opciones propias las conserva', () => {
    const c1 = contenidoConBarraFija({}, { escritorio: { encendida: true, posicion: 'bottom', estilo: 'glass' } });
    expect(c1).toEqual({ sticky: { desktop: { enabled: true, position: 'bottom', style: 'glass' } } });
    const c2 = contenidoConBarraFija(c1, { escritorio: { encendida: false } });
    expect(c2).toEqual({ sticky: { desktop: { enabled: false, position: 'bottom', style: 'glass' } } });
    expect(leerBarraFija(c2).escritorio).toMatchObject({ encendida: false, posicion: 'bottom', estilo: 'glass' });
  });

  it('ida y vuelta: lo escrito se lee igual', () => {
    const cambio = {
      celular: { estilo: 'floating' as const, miniatura: true, cantidad: true, comprarAhora: true, favorito: false, texto: 'Lo quiero', aparece: 'pass' as const, alAgregar: 'fly' as const, vibracion: true },
      escritorio: { encendida: true, posicion: 'replace' as const, estilo: 'glass' as const, miniatura: false, precio: false, variante: false, cantidad: false, comprarAhora: false, favorito: false, aparece: 'scroll' as const },
    };
    const leido = leerBarraFija(contenidoConBarraFija({}, cambio));
    expect(leido.celular).toEqual({ ...CELULAR_POR_DEFECTO, ...cambio.celular });
    expect(leido.escritorio).toEqual(cambio.escritorio);
  });
});

describe('cuándo se ve', () => {
  it('a los 400 px (hoy)', () => {
    expect(barraDebeVerse('scroll', { scrollY: 400, botonPasado: true })).toBe(false);
    expect(barraDebeVerse('scroll', { scrollY: 401, botonPasado: false })).toBe(true);
  });

  it('al pasar el botón: manda el botón, no el número', () => {
    expect(barraDebeVerse('pass', { scrollY: 2000, botonPasado: false })).toBe(false);
    expect(barraDebeVerse('pass', { scrollY: 50, botonPasado: true })).toBe(true);
  });

  it('al pasar el botón sin botón que medir: vuelve a los 400 px', () => {
    expect(barraDebeVerse('pass', { scrollY: 401, botonPasado: null })).toBe(true);
    expect(barraDebeVerse('pass', { scrollY: 10, botonPasado: null })).toBe(false);
  });

  it('en lugar de la cabecera: solo al bajar', () => {
    expect(barraReemplazaVisible(true, true)).toBe(true);
    expect(barraReemplazaVisible(true, false)).toBe(false);
    expect(barraReemplazaVisible(false, true)).toBe(false);
  });

  it('el chat sube el alto de la barra + 12 px, solo con la barra abajo y a la vista', () => {
    expect(empujeChatBarra(72, true, true)).toBe(84);
    expect(empujeChatBarra(72, false, true)).toBe(0);
    expect(empujeChatBarra(72, true, false)).toBe(0);
    expect(empujeChatBarra(0, true, true)).toBe(0);
  });
});
