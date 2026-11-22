import {
  cambioBotonCarrito,
  cambioCarrito,
  cambioEstiloIconos,
  cambioIconos,
  cambioMoneda,
  cambioMonedaVisible,
  cambioTextoIcono,
  columnasLegacyBoton,
  moverTexto,
} from '../cabeceraTiendaLogica';
import { opcionesCarrito, opcionesIconos, textoBotonCarrito } from '@/lib/website/v2/cabeceraTienda';

describe('Encabezado › Íconos', () => {
  test('un estilo nuevo se guarda en header_iconos y no toca el círculo ni la caja', () => {
    expect(cambioEstiloIconos({ header_icons_circle: true }, 'pildora')).toEqual({ header_iconos: { estilo: 'pildora' } });
  });

  test('«Solo ícono» y «Círculo» reutilizan el círculo de acento y quitan el estilo nuevo', () => {
    const circulo = cambioEstiloIconos({ header_iconos: { estilo: 'relleno', tamano: 's' } }, 'circulo');
    expect(circulo.header_iconos).toEqual({ tamano: 's' });
    expect(circulo.header_icons_circle).toBe(true);
    const solo = cambioEstiloIconos({ header_iconos: { estilo: 'relleno' }, header_icons_circle: true }, 'icono');
    expect(solo.header_iconos).toBeNull();
    expect(solo.header_icons_circle).toBe(false);
    expect(opcionesIconos({ ...solo }).estilo).toBe('icono');
  });

  test('vaciar todo deja la clave en null (la tienda de hoy)', () => {
    expect(cambioIconos({ header_iconos: { tamano: 'l' } }, { tamano: null })).toEqual({ header_iconos: null });
  });

  test('texto propio: vacío lo quita', () => {
    const a = { header_iconos: { estilo: 'texto', textos: { cuenta: 'Hola' } } };
    expect(cambioTextoIcono(a, 'carrito', 'Bolsa')).toEqual({ header_iconos: { estilo: 'texto', textos: { cuenta: 'Hola', carrito: 'Bolsa' } } });
    expect(cambioTextoIcono(a, 'cuenta', '  ')).toEqual({ header_iconos: { estilo: 'texto' } });
  });
});

describe('Encabezado › Selector de moneda', () => {
  const todas = ['COP', 'USD', 'EUR'];
  test('desmarcar una moneda guarda la lista; volver a marcarlas todas guarda «todas» (null)', () => {
    const sinEur = cambioMonedaVisible({}, 'EUR', false, todas, 'COP');
    expect(sinEur).toEqual({ header_moneda: { visibles: ['COP', 'USD'] } });
    expect(cambioMonedaVisible(sinEur, 'EUR', true, todas, 'COP')).toEqual({ header_moneda: null });
  });

  test('la base no se desmarca', () => {
    expect(cambioMonedaVisible({}, 'COP', false, todas, 'COP')).toEqual({});
  });

  test('las demás opciones se mezclan con lo guardado', () => {
    expect(cambioMoneda({ header_moneda: { estilo: 'bandera' } }, { movil: 'barra' })).toEqual({ header_moneda: { estilo: 'bandera', movil: 'barra' } });
  });
});

describe('Encabezado › Carrito', () => {
  test('en el borrador V2 el botón va al documento y la fila legacy no se toca', () => {
    const c = cambioBotonCarrito({}, { modo: 'fijo', textos: ['A'], texto: 'Finalizar compra' }, true);
    expect(c).toEqual({ header_carrito: { boton: { modo: 'fijo', textos: ['A'], texto: 'Finalizar compra' } } });
    expect(textoBotonCarrito(opcionesCarrito(c).boton)).toBe('Finalizar compra');
  });

  test('forma extensible: modo, textos y orden (no un booleano)', () => {
    const c = cambioBotonCarrito({}, { modo: 'al_abrir', textos: ['A', 'B'], orden: 'azar' }, true);
    expect(c.header_carrito).toEqual({ boton: { modo: 'al_abrir', textos: ['A', 'B'], orden: 'azar' } });
  });

  test('sin borrador también escribe las columnas de siempre (el fijo va primero)', () => {
    const c = cambioBotonCarrito({}, { modo: 'fijo', textos: ['A', 'Pagar'], texto: 'Pagar ' }, false);
    expect(c.cart_button_mode).toBe('fixed');
    expect(c.cart_button_texts).toEqual(['Pagar', 'A']);
    expect(columnasLegacyBoton({ modo: 'al_abrir', textos: ['A', 'B'] })).toEqual({ cart_button_mode: 'dynamic', cart_button_texts: ['A', 'B'] });
  });

  test('un texto vacío del cajón vuelve al de hoy', () => {
    const a = { header_carrito: { titulo: 'Mi bolsa', enlace: { texto: 'Ver todo' } } };
    expect(cambioCarrito(a, { titulo: null })).toEqual({ header_carrito: { enlace: { texto: 'Ver todo' } } });
  });

  test('ordenar textos', () => {
    expect(moverTexto(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moverTexto(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});
