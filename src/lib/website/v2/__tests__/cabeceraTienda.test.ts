import {
  CARRITO_HOY,
  TEXTOS_BOTON_CARRITO_HOY,
  avanceEnvioGratis,
  botonCarritoDesdeLegacy,
  contadorCarrito,
  datosMoneda,
  estiloIconosEfectivo,
  mensajeEnvioGratis,
  monedaInicial,
  monedaPermitida,
  monedasVisibles,
  opcionesCarrito,
  opcionesIconos,
  opcionesMoneda,
  partirMensajeMonto,
  segmentoMonedas,
  textoBotonCarrito,
  textoIcono,
  textosBotonLimpios,
} from '../cabeceraTienda';
import { OPCIONES_SHELL, COLUMNAS_NUEVAS_SHELL, COLUMNAS_IMPORTADAS } from '../mapeoAjustes';
import { CLAVES_AJUSTES_VIVOS, ajustesParaLienzo } from '../../ajustesVivos';

describe('cabecera de la tienda · sin configuración nueva = la tienda de hoy', () => {
  test('sin ajustes: íconos, moneda y carrito no están configurados y valen lo de hoy', () => {
    for (const a of [null, undefined, {}, { header_iconos: null, header_moneda: null, header_carrito: null }]) {
      const i = opcionesIconos(a);
      expect(i.configurado).toBe(false);
      expect(i).toMatchObject({ estilo: 'icono', tamano: null, trazo: null, mostrarTexto: false, contador: 'numero', favoritos: false });
      const m = opcionesMoneda(a);
      expect(m).toEqual({ configurado: false, estilo: null, flecha: true, visibles: null, alEntrar: 'pais', movil: 'hoja' });
      const c = opcionesCarrito(a);
      expect(c.configurado).toBe(false);
      expect(c.boton).toEqual({ modo: 'al_abrir', textos: [...TEXTOS_BOTON_CARRITO_HOY], orden: 'azar' });
      expect(c.titulo).toBe('Tu Carrito');
      expect(c.seguirComprando).toBe('Continuar Comprando');
      expect(c.enlace).toEqual({ mostrar: true, texto: 'Ver carrito completo', estilo: 'borde' });
      expect(c.envioGratis.mensaje).toBe('¡Te faltan {monto} para envío gratis!');
    }
  });

  test('las claves viejas dan el estilo: círculo de acento o caja en círculo = «Círculo»; si no, «Solo ícono»', () => {
    expect(estiloIconosEfectivo({ header_icons_circle: true })).toBe('circulo');
    expect(estiloIconosEfectivo({ header_icons_circle: false })).toBe('icono');
    expect(estiloIconosEfectivo({ header_icons_box: { shape: 'circle', scope: 'all' } })).toBe('circulo');
    expect(estiloIconosEfectivo({ header_icons_box: { shape: 'rounded', scope: 'all' }, header_icons_circle: true })).toBe('icono');
    expect(estiloIconosEfectivo({ header_builder: { icon_container: { shape: 'circle' } } })).toBe('circulo');
    // Las claves viejas solas no «configuran» nada nuevo: la tienda sigue por su camino de hoy.
    expect(opcionesIconos({ header_icons_circle: true }).configurado).toBe(false);
    expect(opcionesIconos({ header_icons_circle: true }).estilo).toBe('circulo');
  });

  test('el estilo nuevo manda sobre el viejo; uno inválido se ignora', () => {
    expect(estiloIconosEfectivo({ header_icons_circle: true, header_iconos: { estilo: 'pildora' } })).toBe('pildora');
    expect(estiloIconosEfectivo({ header_icons_circle: true, header_iconos: { estilo: 'circulo' } })).toBe('circulo');
    expect(estiloIconosEfectivo({ header_iconos: { estilo: 'rarisimo' } })).toBe('icono');
    expect(opcionesIconos({ header_iconos: { estilo: 'rarisimo' } }).configurado).toBe(false);
  });
});

describe('íconos', () => {
  test('los estilos con texto lo muestran salvo que se apague', () => {
    expect(opcionesIconos({ header_iconos: { estilo: 'texto' } }).mostrarTexto).toBe(true);
    expect(opcionesIconos({ header_iconos: { estilo: 'pildora', mostrarTexto: false } }).mostrarTexto).toBe(false);
    expect(opcionesIconos({ header_iconos: { mostrarTexto: true } }).mostrarTexto).toBe(false); // Solo ícono no lleva texto
  });

  test('textos propios recortados; vacío = el de siempre; la moneda usa su código', () => {
    const op = opcionesIconos({ header_iconos: { estilo: 'texto', textos: { cuenta: '  Hola  ', carrito: '   ', favoritos: 7 } } });
    expect(textoIcono(op, 'cuenta')).toBe('Hola');
    expect(textoIcono(op, 'carrito')).toBe('Carrito');
    expect(textoIcono(op, 'favoritos')).toBe('Favoritos');
    expect(textoIcono(op, 'moneda', 'COP')).toBe('COP');
  });

  test('contador: número con 99+, punto u oculto; sin unidades, nada', () => {
    expect(contadorCarrito(3, 'numero')).toEqual({ tipo: 'numero', texto: '3' });
    expect(contadorCarrito(140, 'numero')).toEqual({ tipo: 'numero', texto: '99+' });
    expect(contadorCarrito(2, 'punto')).toEqual({ tipo: 'punto' });
    expect(contadorCarrito(2, 'oculto')).toBeNull();
    expect(contadorCarrito(0, 'numero')).toBeNull();
  });
});

describe('moneda', () => {
  const disponibles = [{ code: 'USD' }, { code: 'EUR' }, { code: 'COP' }, { code: 'MXN' }];

  test('monedas visibles: la base primero, solo las marcadas y la base siempre', () => {
    expect(monedasVisibles(disponibles, null, 'COP').map((m) => m.code)).toEqual(['COP', 'EUR', 'MXN', 'USD']);
    expect(monedasVisibles(disponibles, ['USD'], 'COP').map((m) => m.code)).toEqual(['COP', 'USD']);
    expect(disponibles.map((m) => m.code)).toEqual(['USD', 'EUR', 'COP', 'MXN']); // no muta
  });

  test('visibles se normalizan: mayúsculas, sin repetidos, solo códigos de 3 letras', () => {
    expect(opcionesMoneda({ header_moneda: { visibles: ['usd', 'USD', 'pesos', 3, 'eur'] } }).visibles).toEqual(['USD', 'EUR']);
    expect(opcionesMoneda({ header_moneda: { visibles: [] } }).visibles).toBeNull();
  });

  test('moneda al entrar: país visible, o la base', () => {
    expect(monedaInicial('USD', 'COP', { alEntrar: 'pais', visibles: null })).toBe('USD');
    expect(monedaInicial('USD', 'COP', { alEntrar: 'base', visibles: null })).toBe('COP');
    expect(monedaInicial('MXN', 'COP', { alEntrar: 'pais', visibles: ['USD'] })).toBe('COP');
    expect(monedaInicial(null, 'COP', { alEntrar: 'pais', visibles: null })).toBe('COP');
    expect(monedaPermitida('EUR', 'COP', ['USD'])).toBe(false);
    expect(monedaPermitida('COP', 'COP', ['USD'])).toBe(true);
  });

  test('segmento: dos a la vista (la elegida entra) y el resto en «+N»', () => {
    const lista = monedasVisibles(disponibles, null, 'COP');
    expect(segmentoMonedas(lista, 'COP').vista.map((m) => m.code)).toEqual(['COP', 'EUR']);
    const conUsd = segmentoMonedas(lista, 'USD');
    expect(conUsd.vista.map((m) => m.code)).toEqual(['COP', 'USD']);
    expect(conUsd.resto.map((m) => m.code)).toEqual(['EUR', 'MXN']);
  });

  test('catálogo: euro con bandera de la Unión Europea; una moneda desconocida sin bandera', () => {
    expect(datosMoneda('EUR').bandera).toBe('EU');
    expect(datosMoneda('xyz', 'Moneda rara')).toEqual({ nombre: 'Moneda rara', simbolo: '$', bandera: null });
  });
});

describe('carrito', () => {
  test('sin botón en el documento se lee la fila legacy (lo que cada tienda ya configuró)', () => {
    expect(opcionesCarrito({ cart_button_mode: 'fixed', cart_button_texts: ['Pagar ya', 'Otro'] }).boton).toEqual({ modo: 'fijo', textos: ['Pagar ya', 'Otro'], orden: 'azar' });
    expect(opcionesCarrito({ cart_button_mode: 'dynamic', cart_button_texts: [] }).boton.textos).toEqual([...TEXTOS_BOTON_CARRITO_HOY]);
    expect(botonCarritoDesdeLegacy(undefined, undefined).modo).toBe('al_abrir');
  });

  test('el botón del documento manda sobre la fila legacy', () => {
    const c = opcionesCarrito({
      cart_button_mode: 'fixed',
      cart_button_texts: ['Legacy'],
      header_carrito: { boton: { modo: 'al_abrir', textos: ['A', 'B'], orden: 'orden' } },
    });
    expect(c.boton).toEqual({ modo: 'al_abrir', textos: ['A', 'B'], orden: 'orden' });
    // Un modo desconocido (de una versión futura) no rompe: vuelve a la fila legacy.
    expect(opcionesCarrito({ cart_button_mode: 'fixed', cart_button_texts: ['Legacy'], header_carrito: { boton: { modo: 'cada_n_segundos' } } }).boton.modo).toBe('fijo');
  });

  test('modos del botón: fijo usa su texto, el primero de la lista o «Comprar ahora»; al abrir elige uno', () => {
    expect(textoBotonCarrito({ modo: 'fijo', textos: ['A', 'B'], texto: 'Finalizar compra' })).toBe('Finalizar compra');
    expect(textoBotonCarrito({ modo: 'fijo', textos: ['A', 'B'] })).toBe('A');
    expect(textoBotonCarrito({ modo: 'fijo', textos: [] })).toBe('Comprar Ahora');
    const lista = ['A', 'B', 'C', 'D'];
    expect(textoBotonCarrito({ modo: 'al_abrir', textos: lista }, () => 0)).toBe('A');
    expect(textoBotonCarrito({ modo: 'al_abrir', textos: lista }, () => 0.6)).toBe('C');
    expect(textoBotonCarrito({ modo: 'al_abrir', textos: lista }, () => 0.9999)).toBe('D');
    expect(textoBotonCarrito({ modo: 'al_abrir', textos: lista }, () => 1)).toBe('D');
  });

  test('hoy (legacy fixed) se ve igual: el primer texto', () => {
    const boton = opcionesCarrito({ cart_button_mode: 'fixed', cart_button_texts: ['Comprar Ahora', 'Otro'] }).boton;
    expect(textoBotonCarrito(boton, () => 0.99)).toBe('Comprar Ahora');
  });

  test('textos del botón: recortados, sin vacíos ni repetidos, hasta 8 de 30 letras', () => {
    expect(textosBotonLimpios([' Comprar ', 'comprar', '', 'X'.repeat(40), 5, ...'abcdefghij'.split('')])).toEqual([
      'Comprar',
      'X'.repeat(30),
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });

  test('{monto} se reemplaza; sin marcador el monto va al final', () => {
    expect(mensajeEnvioGratis('¡Te faltan {monto} para el envío gratis!', '$ 45.000')).toBe('¡Te faltan $ 45.000 para el envío gratis!');
    expect(partirMensajeMonto('Faltan {monto}')).toEqual({ antes: 'Faltan ', despues: '' });
    expect(mensajeEnvioGratis('Te falta poco', '$ 1')).toBe('Te falta poco $ 1');
    expect(mensajeEnvioGratis('{monto} y {monto}', '$ 2')).toBe('$ 2 y ');
    expect(mensajeEnvioGratis(CARRITO_HOY.envioGratis.mensaje, '$ 3')).toBe('¡Te faltan $ 3 para envío gratis!');
  });

  test('textos del cajón: propios recortados; vacíos = los de hoy', () => {
    const c = opcionesCarrito({ header_carrito: { titulo: ' Mi bolsa ', seguirComprando: '', enlace: { mostrar: false, estilo: 'enlace' }, envioGratis: { barra: false } } });
    expect(c.titulo).toBe('Mi bolsa');
    expect(c.seguirComprando).toBe('Continuar Comprando');
    expect(c.enlace).toEqual({ mostrar: false, texto: 'Ver carrito completo', estilo: 'enlace' });
    expect(c.envioGratis.barra).toBe(false);
    expect(c.configurado).toBe(true);
  });

  test('avance de la barra de envío gratis', () => {
    expect(avanceEnvioGratis(50, 100)).toBe(0.5);
    expect(avanceEnvioGratis(150, 100)).toBe(1);
    expect(avanceEnvioGratis(50, 0)).toBe(0);
  });
});

describe('contrato', () => {
  test('las tres claves viven en shell.header.opciones, sin columna (no entran al importador)', () => {
    for (const clave of ['header_iconos', 'header_moneda', 'header_carrito']) {
      expect(OPCIONES_SHELL[clave]).toMatchObject({ zona: 'header', porDefecto: null, nueva: true });
      expect(COLUMNAS_NUEVAS_SHELL).toContain(clave);
      expect(COLUMNAS_IMPORTADAS).not.toContain(clave);
    }
  });

  test('vista previa en vivo: las claves nuevas y el botón legacy del carrito viajan al lienzo', () => {
    for (const clave of ['header_iconos', 'header_moneda', 'header_carrito', 'cart_button_mode', 'cart_button_texts']) {
      expect(CLAVES_AJUSTES_VIVOS).toContain(clave);
    }
    // El botón legacy no se pisa con null si los ajustes no lo traen.
    const vivos = ajustesParaLienzo({ header_carrito: { titulo: 'X' } });
    expect(vivos.header_carrito).toEqual({ titulo: 'X' });
    expect('cart_button_mode' in vivos).toBe(false);
    expect(vivos.header_iconos).toBeNull();
  });
});
