/**
 * Botones de compra de la ficha (Figma 2779:65038): contrato del bloque `product_actions`,
 * distribuciones listas, regla de filas (frame E) y compatibilidad con `buttons_layout`.
 * La tienda tiene una copia idéntica del módulo (goadmin-websites, `npm run verify:copias`).
 */
import {
  DISTRIBUCIONES,
  DISTRIBUCIONES_FICHA,
  accionesVisibles,
  aplicarDistribucion,
  armarFilas,
  cambiarAccion,
  cantidadConEtiqueta,
  contenidoConAcciones,
  enlaceWhatsappFicha,
  leerAccionesFicha,
  mensajeWhatsappFicha,
  moverAccion,
  presetDe,
  textoCortoDeAccion,
  textoDeAccion,
  usaTextoCorto,
  type AccionFicha,
  type TipoAccionFicha,
} from '../accionesFicha';

/** Filas como tipos: [['cantidad'], ['agregar', 'favorito'], …]. */
const filas = (acciones: readonly AccionFicha[], disponibles = {}) =>
  armarFilas(accionesVisibles(acciones, disponibles)).map((f) => f.map((x) => x.tipo));

const accion = (tipo: TipoAccionFicha, tamano: AccionFicha['tamano'], extra: Partial<AccionFicha> = {}): AccionFicha => ({
  tipo,
  visible: true,
  tamano,
  estilo: 'relleno',
  ...extra,
});

describe('sin configuración: «Clásica»', () => {
  test('contenido vacío = Clásica, sin marcar como configurado', () => {
    const r = leerAccionesFicha({});
    expect(r.preset).toBe('clasica');
    expect(r.configurado).toBe(false);
    expect(filas(r.acciones)).toEqual([['cantidad'], ['agregar', 'favorito'], ['comprar']]);
  });

  test('Agregar relleno largo, corazón pequeño con borde, Comprar ahora largo con borde; WhatsApp y Compartir ocultos', () => {
    const { acciones } = leerAccionesFicha(null);
    const de = (t: TipoAccionFicha) => acciones.find((x) => x.tipo === t)!;
    expect(de('agregar')).toMatchObject({ tamano: 'largo', estilo: 'relleno', visible: true });
    expect(de('favorito')).toMatchObject({ tamano: 'pequeno', estilo: 'borde', visible: true });
    expect(de('comprar')).toMatchObject({ tamano: 'largo', estilo: 'borde', visible: true });
    expect(de('whatsapp').visible).toBe(false);
    expect(de('compartir').visible).toBe(false);
  });
});

describe('compatibilidad con «Disposición de botones»', () => {
  test('buttons_layout inline se lee como «Dos a la mitad»', () => {
    const r = leerAccionesFicha({ buttons_layout: 'inline' });
    expect(r.preset).toBe('dos_mitad');
    expect(filas(r.acciones)).toEqual([['cantidad', 'favorito'], ['agregar', 'comprar']]);
  });

  test('stacked y split se leen como «Clásica»', () => {
    expect(leerAccionesFicha({ buttons_layout: 'stacked' }).preset).toBe('clasica');
    expect(leerAccionesFicha({ buttons_layout: 'split' }).preset).toBe('clasica');
  });

  test('con `actions` guardadas, buttons_layout ya no manda', () => {
    const contenido = contenidoConAcciones({ buttons_layout: 'inline' }, DISTRIBUCIONES.comprar_primero);
    expect(leerAccionesFicha(contenido).preset).toBe('comprar_primero');
  });

  test('`preset` sin `actions` pinta esa distribución', () => {
    expect(leerAccionesFicha({ preset: 'compacta' }).preset).toBe('compacta');
    expect(leerAccionesFicha({ preset: 'otra' }).preset).toBe('clasica');
  });
});

describe('las 6 distribuciones listas', () => {
  test.each([
    ['clasica', [['cantidad'], ['agregar', 'favorito'], ['comprar']]],
    ['dos_mitad', [['cantidad', 'favorito'], ['agregar', 'comprar']]],
    ['compacta', [['cantidad', 'agregar', 'favorito'], ['comprar']]],
    ['solo_agregar', [['cantidad'], ['agregar', 'favorito']]],
    ['comprar_primero', [['cantidad'], ['comprar', 'favorito'], ['agregar']]],
    ['con_whatsapp', [['cantidad'], ['agregar', 'favorito'], ['comprar', 'whatsapp']]],
  ] as const)('%s', (d, esperado) => {
    expect(filas(DISTRIBUCIONES[d])).toEqual(esperado);
    expect(presetDe(DISTRIBUCIONES[d])).toBe(d);
  });

  test('todas traen los 6 tipos una sola vez y «Agregar» visible', () => {
    for (const d of DISTRIBUCIONES_FICHA) {
      const tipos = DISTRIBUCIONES[d].map((x) => x.tipo);
      expect(new Set(tipos).size).toBe(6);
      expect(DISTRIBUCIONES[d].find((x) => x.tipo === 'agregar')!.visible).toBe(true);
    }
  });
});

describe('regla de filas (frame E)', () => {
  test('Largo + Pequeño → el Largo se encoge y el cuadrado va al lado', () => {
    expect(armarFilas([accion('agregar', 'largo'), accion('favorito', 'pequeno')]).length).toBe(1);
  });

  test('Mitad + Mitad → 50 % y 50 %; una Mitad sola se estira', () => {
    expect(armarFilas([accion('agregar', 'mitad'), accion('comprar', 'mitad')]).length).toBe(1);
    expect(armarFilas([accion('agregar', 'mitad'), accion('comprar', 'largo')]).length).toBe(2);
    expect(armarFilas([accion('agregar', 'mitad'), accion('comprar', 'mitad'), accion('whatsapp', 'mitad')]).map((f) => f.length)).toEqual([2, 1]);
  });

  test('Pequeño al comienzo: el siguiente se le pega', () => {
    expect(armarFilas([accion('favorito', 'pequeno'), accion('agregar', 'largo')]).length).toBe(1);
  });

  test('«Compartir fila» une cantidad + Largo + Pequeño', () => {
    const lista = [accion('cantidad', 'largo', { compartirFila: true }), accion('agregar', 'largo'), accion('favorito', 'pequeno')];
    expect(armarFilas(lista).length).toBe(1);
    // Sin la marca, la cantidad va sola.
    expect(armarFilas([accion('cantidad', 'largo'), accion('agregar', 'largo')]).length).toBe(2);
  });

  test('máximo 3 por fila: el cuarto empieza fila nueva', () => {
    const lista = [accion('agregar', 'largo'), accion('favorito', 'pequeno'), accion('compartir', 'pequeno'), accion('whatsapp', 'pequeno')];
    expect(armarFilas(lista).map((f) => f.length)).toEqual([3, 1]);
  });

  test('Enlace ocupa la fila como un Largo', () => {
    expect(armarFilas([accion('comprar', 'mitad', { estilo: 'enlace' }), accion('whatsapp', 'mitad')]).length).toBe(2);
  });

  test('ocultos o no disponibles no cuentan: sin corazón, Agregar ocupa toda la fila', () => {
    expect(filas(DISTRIBUCIONES.clasica, { favorito: false })).toEqual([['cantidad'], ['agregar'], ['comprar']]);
    expect(filas(DISTRIBUCIONES.con_whatsapp, { whatsapp: false })).toEqual([['cantidad'], ['agregar', 'favorito'], ['comprar']]);
  });

  test('celular: texto corto solo cuando comparte fila con otro botón de texto', () => {
    const [, mitades] = armarFilas(accionesVisibles(DISTRIBUCIONES.dos_mitad));
    expect(mitades.every((x) => usaTextoCorto(mitades, x))).toBe(true);
    const [, agregarYCorazon] = armarFilas(accionesVisibles(DISTRIBUCIONES.clasica));
    expect(usaTextoCorto(agregarYCorazon, agregarYCorazon[0])).toBe(false);
    const [compacta] = armarFilas(accionesVisibles(DISTRIBUCIONES.compacta));
    expect(usaTextoCorto(compacta, compacta[1])).toBe(true);
    expect(cantidadConEtiqueta(compacta)).toBe(false);
    expect(cantidadConEtiqueta(armarFilas(accionesVisibles(DISTRIBUCIONES.dos_mitad))[0])).toBe(true);
  });
});

describe('editor', () => {
  test('elegir una distribución conserva los textos escritos', () => {
    const conTexto = cambiarAccion(DISTRIBUCIONES.clasica, 'comprar', { texto: 'Comprar ya', textoCorto: 'Ya' });
    const r = aplicarDistribucion(conTexto, 'dos_mitad');
    expect(r.find((x) => x.tipo === 'comprar')).toMatchObject({ texto: 'Comprar ya', textoCorto: 'Ya', tamano: 'mitad' });
    expect(presetDe(r)).toBe('dos_mitad');
  });

  test('cambiar textos no cambia la distribución; mover algo la vuelve «Personalizada»', () => {
    const conTexto = cambiarAccion(DISTRIBUCIONES.clasica, 'agregar', { texto: 'Lo quiero' });
    expect(presetDe(conTexto)).toBe('clasica');
    expect(presetDe(moverAccion(conTexto, 'comprar', 'agregar'))).toBe('personalizada');
  });

  test('«Agregar al carrito» no se puede ocultar', () => {
    const r = cambiarAccion(DISTRIBUCIONES.clasica, 'agregar', { visible: false });
    expect(r.find((x) => x.tipo === 'agregar')!.visible).toBe(true);
    const leido = leerAccionesFicha({ actions: [{ tipo: 'agregar', visible: false, tamano: 'largo', estilo: 'relleno' }] });
    expect(leido.acciones.find((x) => x.tipo === 'agregar')!.visible).toBe(true);
  });

  test('textos vacíos se quitan al guardar; el texto por defecto vuelve', () => {
    const r = cambiarAccion(cambiarAccion(DISTRIBUCIONES.clasica, 'comprar', { texto: 'Ya' }), 'comprar', { texto: '   ' });
    const comprar = r.find((x) => x.tipo === 'comprar')!;
    expect('texto' in comprar).toBe(false);
    expect(textoDeAccion(comprar)).toBe('Comprar ahora');
    expect(textoCortoDeAccion(comprar)).toBe('Comprar');
  });

  test('guardar escribe `actions` y `preset` sin tocar las demás claves', () => {
    const c = contenidoConAcciones({ sticky_mobile: false, show_price_in_button: true }, DISTRIBUCIONES.compacta);
    expect(c).toMatchObject({ sticky_mobile: false, show_price_in_button: true, preset: 'compacta' });
    expect((c.actions as AccionFicha[]).length).toBe(6);
  });
});

describe('datos guardados raros', () => {
  test('descarta tipos desconocidos y repetidos, completa los que faltan (ocultos)', () => {
    const r = leerAccionesFicha({
      actions: [
        { tipo: 'comprar', visible: true, tamano: 'gigante', estilo: 'relleno' },
        { tipo: 'comprar', visible: false, tamano: 'mitad', estilo: 'borde' },
        { tipo: 'otro' },
        'basura',
      ],
    });
    expect(r.configurado).toBe(true);
    expect(r.acciones.map((x) => x.tipo)).toEqual(['comprar', 'cantidad', 'agregar', 'favorito', 'whatsapp', 'compartir']);
    expect(r.acciones[0]).toMatchObject({ tamano: 'largo', visible: true });
    expect(r.acciones.filter((x) => x.visible).map((x) => x.tipo)).toEqual(['comprar', 'agregar']);
    expect(r.preset).toBe('personalizada');
  });

  test('una lista vacía o sin nada reconocible = como si no hubiera nada', () => {
    expect(leerAccionesFicha({ actions: [] }).configurado).toBe(false);
    expect(leerAccionesFicha({ actions: [{ tipo: 'x' }] }).preset).toBe('clasica');
  });

  test('textos largos se recortan', () => {
    const r = leerAccionesFicha({ actions: [{ tipo: 'agregar', texto: 'x'.repeat(80), textoCorto: 'y'.repeat(50) }] });
    const agregar = r.acciones.find((x) => x.tipo === 'agregar')!;
    expect(agregar.texto!.length).toBe(40);
    expect(agregar.textoCorto!.length).toBe(20);
  });
});

describe('WhatsApp', () => {
  test('mensaje con producto, variante y enlace; 10 dígitos llevan el 57', () => {
    const mensaje = mensajeWhatsappFicha('Audífonos  X200', 'Color: Negro', 'https://tienda.test/productos/1');
    expect(mensaje).toBe('Hola, me interesa Audífonos X200 (Color: Negro). https://tienda.test/productos/1');
    expect(enlaceWhatsappFicha('300 123 4567', mensaje)).toBe(`https://wa.me/573001234567?text=${encodeURIComponent(mensaje)}`);
  });

  test('sin número válido no hay enlace (el botón no sale)', () => {
    expect(enlaceWhatsappFicha('', 'hola')).toBeNull();
    expect(enlaceWhatsappFicha('12', 'hola')).toBeNull();
    expect(enlaceWhatsappFicha(null, 'hola')).toBeNull();
  });
});
