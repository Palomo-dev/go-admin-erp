/**
 * Contrato de los modos del botón del carrito y de los favoritos de la tienda (Figma «16 Sitio web»
 * 2762:61067 y 2773:62797–2777:64932, aprobados el 2026-11-22). El mismo archivo vive copiado en
 * goadmin-websites (`npm run verify:copias`), así que estas pruebas cubren a los dos.
 */
import {
  SEGUNDOS_BOTON_CARRITO,
  TEXTOS_BOTON_CARRITO_HOY,
  TEXTOS_FAVORITOS_POR_DEFECTO,
  TEXTOS_REGLAS_BOTON_CARRITO,
  botonCarritoDelDocumento,
  contadorFavoritos,
  indiceAlAbrir,
  mensajeEnvioGratis,
  opcionesCarrito,
  opcionesFavoritos,
  reglaBotonCarrito,
  segundosBotonCarrito,
  textoBotonCarrito,
  textoRegla,
  transicionBotonCarrito,
  type BotonCarrito,
} from '../cabeceraTienda';
import { COLUMNAS_IMPORTADAS, COLUMNAS_NUEVAS_SHELL, OPCIONES_SHELL } from '../mapeoAjustes';
import { CLAVES_AJUSTES_VIVOS } from '../../ajustesVivos';

const lista = ['A', 'B', 'C', 'D'];
const boton = (parte: Partial<BotonCarrito>): BotonCarrito => ({ modo: 'al_abrir', textos: lista, ...parte });

describe('botón del carrito · compatibilidad con lo guardado', () => {
  test('la forma vieja `{ modo, textos, orden?, texto? }` se lee igual', () => {
    expect(botonCarritoDelDocumento({ modo: 'al_abrir', textos: ['X', 'Y'], orden: 'azar' })).toEqual({ modo: 'al_abrir', textos: ['X', 'Y'], orden: 'azar' });
    expect(botonCarritoDelDocumento({ modo: 'fijo', textos: ['X'], texto: 'Pagar' })).toEqual({ modo: 'fijo', textos: ['X'], texto: 'Pagar' });
  });

  test('un modo desconocido cae a la fila legacy (el comportamiento de hoy)', () => {
    const op = opcionesCarrito({ cart_button_mode: 'fixed', cart_button_texts: ['Pagar ya'], header_carrito: { boton: { modo: 'por_hora', textos: ['Z'] } } });
    expect(op.boton.modo).toBe('fijo');
    expect(op.boton.textos).toEqual(['Pagar ya']);
    expect(op.configurado).toBe(false);
  });

  test('sin nada: dinámico con los 4 textos de hoy y /carrito como hoy (sin botón propio)', () => {
    const op = opcionesCarrito({});
    expect(op.boton).toMatchObject({ modo: 'al_abrir', textos: TEXTOS_BOTON_CARRITO_HOY });
    expect(op.botonPagina).toBeNull();
    expect(op.usarEnPagina).toBe(true);
  });

  test('campos nuevos: segundos 2–10 (redondeados), transición, pausar y reglas; lo inválido se descarta', () => {
    const b = botonCarritoDelDocumento({ modo: 'mientras_abierto', textos: lista, segundos: 25, transicion: 'rebote', pausar: false, reglas: { oferta: '', faltaEnvio: 7 } });
    expect(b).toEqual({ modo: 'mientras_abierto', textos: lista, segundos: 10, pausar: false, reglas: { oferta: '' } });
    expect(botonCarritoDelDocumento({ modo: 'mientras_abierto', textos: lista, segundos: 1.4 })?.segundos).toBe(SEGUNDOS_BOTON_CARRITO.min);
    expect(botonCarritoDelDocumento({ modo: 'mientras_abierto', textos: lista, segundos: '5' })?.segundos).toBeUndefined();
  });
});

describe('botón del carrito · modos', () => {
  test('al abrir, en orden: 1.º, 2.º… y vuelve a empezar', () => {
    const b = boton({ orden: 'orden' });
    const vistos: number[] = [];
    let anterior: number | null = null;
    for (let i = 0; i < 6; i++) vistos.push((anterior = indiceAlAbrir(b, anterior)));
    expect(vistos).toEqual([0, 1, 2, 3, 0, 1]);
  });

  test('al abrir, al azar: nunca repite el de la vez anterior (y con un solo texto, ese)', () => {
    const b = boton({ orden: 'azar' });
    for (const r of [0, 0.2, 0.5, 0.74, 0.99]) {
      for (let anterior = 0; anterior < lista.length; anterior++) {
        const i = indiceAlAbrir(b, anterior, () => r);
        expect(i).not.toBe(anterior);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(lista.length);
      }
    }
    expect(indiceAlAbrir(boton({ textos: ['Solo'] }), 0, () => 0.9)).toBe(0);
  });

  test('textoBotonCarrito sigue sirviendo para todos los modos', () => {
    expect(textoBotonCarrito(boton({ modo: 'fijo', texto: 'Finalizar compra' }))).toBe('Finalizar compra');
    expect(textoBotonCarrito(boton({}), () => 0.6)).toBe('C');
    expect(textoBotonCarrito(boton({ modo: 'mientras_abierto' }))).toBe('A');
    expect(textoBotonCarrito(boton({ modo: 'segun_carrito' }))).toBe(TEXTOS_REGLAS_BOTON_CARRITO.porDefecto);
    expect(textoBotonCarrito(boton({ modo: 'segun_carrito', reglas: { porDefecto: '' } }))).toBe('Comprar ahora');
  });

  test('mientras está abierto: 4 s y fundido por defecto; «reducir movimiento» = sin efecto', () => {
    expect(segundosBotonCarrito(boton({ modo: 'mientras_abierto' }))).toBe(4);
    expect(transicionBotonCarrito(boton({ modo: 'mientras_abierto' }), false)).toBe('fundido');
    expect(transicionBotonCarrito(boton({ modo: 'mientras_abierto', transicion: 'deslizar' }), false)).toBe('deslizar');
    expect(transicionBotonCarrito(boton({ modo: 'mientras_abierto', transicion: 'deslizar' }), true)).toBe('ninguna');
  });

  test('según el carrito: prioridades 1 falta envío › 2 oferta › 3 envío gratis › por defecto', () => {
    const b = boton({ modo: 'segun_carrito' });
    const falta = reglaBotonCarrito(b, { subtotal: 255_000, topeEnvioGratis: 300_000, hayOferta: true });
    expect(falta).toEqual({ regla: 'faltaEnvio', plantilla: TEXTOS_REGLAS_BOTON_CARRITO.faltaEnvio, monto: 45_000 });
    expect(mensajeEnvioGratis(falta.plantilla, '$ 45.000')).toBe('Te faltan $ 45.000 para envío gratis');
    expect(reglaBotonCarrito(b, { subtotal: 10, topeEnvioGratis: 0, hayOferta: true }).regla).toBe('oferta');
    expect(reglaBotonCarrito(b, { subtotal: 400_000, topeEnvioGratis: 300_000, hayOferta: true }).regla).toBe('oferta');
    expect(reglaBotonCarrito(b, { subtotal: 400_000, topeEnvioGratis: 300_000, hayOferta: false }).regla).toBe('envioGratis');
    expect(reglaBotonCarrito(b, { subtotal: 10, topeEnvioGratis: 0, hayOferta: false })).toEqual({ regla: 'porDefecto', plantilla: 'Comprar ahora', monto: null });
  });

  test('según el carrito: un texto vacío salta a la siguiente regla; textos propios', () => {
    const b = boton({ modo: 'segun_carrito', reglas: { faltaEnvio: '', oferta: 'Llévalo con descuento' } });
    expect(reglaBotonCarrito(b, { subtotal: 10, topeEnvioGratis: 100, hayOferta: true }).plantilla).toBe('Llévalo con descuento');
    expect(reglaBotonCarrito(b, { subtotal: 10, topeEnvioGratis: 100, hayOferta: false }).regla).toBe('porDefecto');
    expect(textoRegla(b, 'envioGratis')).toBe(TEXTOS_REGLAS_BOTON_CARRITO.envioGratis);
  });
});

describe('botón «Comprar» de /carrito', () => {
  test('encendido (por defecto) comparte el botón del cajón', () => {
    const op = opcionesCarrito({ header_carrito: { boton: { modo: 'mientras_abierto', textos: lista, segundos: 3 } } });
    expect(op.botonPagina).toEqual(op.boton);
  });

  test('apagado usa el propio; sin uno válido, el de hoy', () => {
    const propio = opcionesCarrito({ header_carrito: { boton: { modo: 'mientras_abierto', textos: lista }, usarEnPagina: false, botonPagina: { modo: 'fijo', textos: ['X'], texto: 'Pagar' } } });
    expect(propio.usarEnPagina).toBe(false);
    expect(propio.botonPagina).toEqual({ modo: 'fijo', textos: ['X'], texto: 'Pagar' });
    expect(propio.configurado).toBe(true);
    expect(opcionesCarrito({ header_carrito: { usarEnPagina: false } }).botonPagina).toBeNull();
  });

  test('con solo la fila legacy, /carrito sigue como hoy', () => {
    expect(opcionesCarrito({ cart_button_mode: 'fixed', cart_button_texts: ['Pagar'] }).botonPagina).toBeNull();
  });
});

describe('favoritos', () => {
  test('sin `header_favoritos`: panel, contador, aviso, compartir, sugerencias por categoría y textos del diseño', () => {
    for (const a of [null, {}, { header_favoritos: null }, { header_favoritos: 'x' }]) {
      const op = opcionesFavoritos(a);
      expect(op.configurado).toBe(false);
      expect(op).toMatchObject({
        alTocar: 'panel',
        contador: true,
        avisoSesion: true,
        compartir: true,
        corazonTarjetas: true,
        corazonFicha: true,
        sugerencias: { mostrar: true, fuente: 'categorias' },
        textos: TEXTOS_FAVORITOS_POR_DEFECTO,
      });
    }
  });

  test('opciones propias; lo inválido se descarta y los textos se recortan', () => {
    const op = opcionesFavoritos({
      header_favoritos: {
        alTocar: 'pagina',
        contador: false,
        sugerencias: { mostrar: false, fuente: 'mas_vendidos' },
        textos: { tituloPanel: '  Mi   lista ', botonPrincipal: '', vacioTexto: 9 },
        compartir: 'no',
      },
    });
    expect(op.configurado).toBe(true);
    expect(op.alTocar).toBe('pagina');
    expect(op.contador).toBe(false);
    expect(op.compartir).toBe(true);
    expect(op.sugerencias).toEqual({ mostrar: false, fuente: 'mas_vendidos' });
    expect(op.textos.tituloPanel).toBe('Mi lista');
    expect(op.textos.botonPrincipal).toBe(TEXTOS_FAVORITOS_POR_DEFECTO.botonPrincipal);
    expect(op.textos.vacioTexto).toBe(TEXTOS_FAVORITOS_POR_DEFECTO.vacioTexto);
    expect(opcionesFavoritos({ header_favoritos: { alTocar: 'cajon', sugerencias: { fuente: 'azar' } } }).configurado).toBe(false);
  });

  test('contador del corazón: 99+ y nada sin favoritos o apagado', () => {
    expect(contadorFavoritos(0, true)).toBeNull();
    expect(contadorFavoritos(6, true)).toBe('6');
    expect(contadorFavoritos(150, true)).toBe('99+');
    expect(contadorFavoritos(6, false)).toBeNull();
  });

  test('`header_favoritos` vive en shell.header.opciones, sin columna, y viaja a la vista previa en vivo', () => {
    expect(OPCIONES_SHELL.header_favoritos).toEqual({ zona: 'header', porDefecto: null, nueva: true });
    expect(COLUMNAS_NUEVAS_SHELL).toContain('header_favoritos');
    expect(COLUMNAS_IMPORTADAS).not.toContain('header_favoritos');
    expect(CLAVES_AJUSTES_VIVOS).toContain('header_favoritos');
  });
});
