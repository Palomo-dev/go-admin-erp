/**
 * Contrato compartido de la cabecera (lib/website/v2/cabeceraTienda.ts, copia idéntica en la
 * tienda): íconos en un solo lugar (Figma 2830:73206) e iniciar sesión (Figma 2834:68670).
 * - `header_iconos.movil` y `header_iconos.por_icono`, con lo guardado de hoy intacto.
 * - Trazo unificado: relleno gana sobre `header_iconos.trazo`.
 * - `header_cuenta`: sin valor = «Página», como hoy.
 */
import {
  destinoVistaAcceso,
  estiloDeIcono,
  estiloEnPantalla,
  formasPorIcono,
  mensajeRecuperar,
  opcionesCuenta,
  opcionesIconos,
  rutaAcceso,
  saludoCuenta,
  trazoUnificado,
} from '../cabeceraTienda';
import {
  cambioCuenta,
  cambioFormaIcono,
  cambioIconosEnCelular,
  cambioTrazoUnificado,
} from '@/components/sitio-web/editor/inspector/cabeceraTiendaLogica';

describe('header_iconos: movil y por_icono', () => {
  test('lo guardado de hoy se lee igual: sin claves nuevas no hay configuración nueva', () => {
    const hoy = { header_icons_circle: true, header_icons_weight: 'contorno', header_cart_glyph: 'bolsa' };
    const op = opcionesIconos(hoy);
    expect(op.configurado).toBe(false);
    expect(op.estilo).toBe('circulo');
    expect(op.movil).toBe('auto');
    expect(op.porIcono).toEqual({});
  });

  test('lee movil y las formas propias válidas; descarta lo que no cumple', () => {
    const op = opcionesIconos({
      header_iconos: { movil: 'texto', por_icono: { carrito: { estilo: 'relleno' }, cuenta: { estilo: 'pildora' }, moneda: { estilo: 'xx' }, otro: { estilo: 'icono' }, buscar: 'circulo' } },
    });
    expect(op.configurado).toBe(true);
    expect(op.movil).toBe('texto');
    expect(op.porIcono).toEqual({ carrito: 'relleno', cuenta: 'pildora' });
    expect(formasPorIcono(null)).toEqual({});
    expect(opcionesIconos({ header_iconos: { movil: 'raro' } }).movil).toBe('auto');
    // «Automático» guardado no cuenta como configuración nueva (es lo de hoy).
    expect(opcionesIconos({ header_iconos: { movil: 'auto' } }).configurado).toBe(false);
  });

  test('estilo de cada ícono: el propio o el general', () => {
    const op = opcionesIconos({ header_iconos: { por_icono: { carrito: { estilo: 'relleno' } } } });
    expect(estiloDeIcono(op, 'carrito')).toBe('relleno');
    expect(estiloDeIcono(op, 'cuenta')).toBe('icono');
    // Una forma propia con texto enciende «Mostrar texto» aunque el general sea solo ícono.
    expect(op.mostrarTexto).toBe(true);
    expect(opcionesIconos({ header_iconos: { por_icono: { carrito: { estilo: 'relleno' } }, mostrarTexto: false } }).mostrarTexto).toBe(false);
  });

  test('en el celular, píldora y relleno pasan a la forma de «En el celular»; auto = lo de hoy', () => {
    expect(estiloEnPantalla('pildora', false, 'texto', 'icono')).toBe('pildora');
    expect(estiloEnPantalla('pildora', true, 'auto', 'circulo')).toBe('circulo');
    expect(estiloEnPantalla('relleno', true, 'auto', 'icono')).toBe('icono');
    expect(estiloEnPantalla('relleno', true, 'texto', 'icono')).toBe('texto');
    expect(estiloEnPantalla('texto_lado', true, 'circulo', 'icono')).toBe('circulo');
    // Solo ícono, Círculo y Con texto no cambian en el celular.
    expect(estiloEnPantalla('texto', true, 'circulo', 'icono')).toBe('texto');
    expect(estiloEnPantalla('icono', true, 'circulo', 'circulo')).toBe('icono');
  });
});

describe('trazo unificado', () => {
  test('relleno gana al leer; sin nada, null (se ve Normal)', () => {
    expect(trazoUnificado({})).toBeNull();
    expect(trazoUnificado({ header_iconos: { trazo: 'fino' } })).toBe('fino');
    expect(trazoUnificado({ header_icons_weight: 'relleno', header_iconos: { trazo: 'fino' } })).toBe('relleno');
    // La tienda tampoco aplica el grosor guardado si el glifo es relleno.
    expect(opcionesIconos({ header_icons_weight: 'relleno', header_iconos: { trazo: 'fino' } }).trazo).toBeNull();
    expect(opcionesIconos({ header_icons_weight: 'contorno', header_iconos: { trazo: 'fino' } }).trazo).toBe('fino');
  });

  test('Fino y Normal guardan el grosor y ponen contorno; Relleno limpia el grosor', () => {
    expect(cambioTrazoUnificado({}, 'fino')).toEqual({ header_iconos: { trazo: 'fino' }, header_icons_weight: 'contorno' });
    expect(cambioTrazoUnificado({ header_icons_weight: 'relleno' }, 'normal')).toEqual({ header_iconos: { trazo: 'normal' }, header_icons_weight: 'contorno' });
    expect(cambioTrazoUnificado({ header_iconos: { trazo: 'fino', tamano: 'l' } }, 'relleno')).toEqual({ header_iconos: { tamano: 'l' }, header_icons_weight: 'relleno' });
    expect(cambioTrazoUnificado({ header_iconos: { trazo: 'fino' } }, 'relleno')).toEqual({ header_iconos: null, header_icons_weight: 'relleno' });
  });

  test('forma propia y celular: «como los demás» y «automático» no se guardan', () => {
    const a = { header_iconos: { estilo: 'pildora' } };
    expect(cambioFormaIcono(a, 'carrito', 'relleno')).toEqual({ header_iconos: { estilo: 'pildora', por_icono: { carrito: { estilo: 'relleno' } } } });
    expect(cambioFormaIcono({ header_iconos: { estilo: 'pildora', por_icono: { carrito: { estilo: 'relleno' } } } }, 'carrito', null)).toEqual({ header_iconos: { estilo: 'pildora' } });
    expect(cambioIconosEnCelular(a, 'circulo')).toEqual({ header_iconos: { estilo: 'pildora', movil: 'circulo' } });
    expect(cambioIconosEnCelular({ header_iconos: { movil: 'circulo' } }, 'auto')).toEqual({ header_iconos: null });
  });
});

describe('header_cuenta', () => {
  test('sin valor = «Página», como hoy', () => {
    const op = opcionesCuenta({});
    expect(op).toEqual({
      configurado: false,
      modo: 'pagina',
      titulo: 'Ingresa a tu cuenta',
      boton: 'Ingresar',
      beneficios: true,
      ventanaDestino: 'panel',
      despues: 'quedarse',
    });
    expect(opcionesCuenta({ header_cuenta: { modo: 'otro' } }).modo).toBe('pagina');
  });

  test('lee modo, textos recortados y opciones', () => {
    const op = opcionesCuenta({ header_cuenta: { modo: 'ventana', titulo: '  Hola   de nuevo ', boton: '', beneficios: false, ventanaDestino: 'pagina', despues: 'cuenta' } });
    expect(op).toMatchObject({ configurado: true, modo: 'ventana', titulo: 'Hola de nuevo', boton: 'Ingresar', beneficios: false, ventanaDestino: 'pagina', despues: 'cuenta' });
  });

  test('desde la ventana, crear cuenta y recuperar abren el panel o la página', () => {
    expect(destinoVistaAcceso({ modo: 'ventana', ventanaDestino: 'panel' }, 'registro')).toBe('panel');
    expect(destinoVistaAcceso({ modo: 'ventana', ventanaDestino: 'pagina' }, 'recuperar')).toBe('pagina');
    expect(destinoVistaAcceso({ modo: 'ventana', ventanaDestino: 'pagina' }, 'ingresar')).toBe('ventana');
    expect(destinoVistaAcceso({ modo: 'dialogo', ventanaDestino: 'pagina' }, 'registro')).toBe('dialogo');
    expect(rutaAcceso('registro')).toBe('/auth?tab=register');
    expect(rutaAcceso('ingresar')).toBe('/auth');
  });

  test('saludo y mensaje de recuperar sin pistas', () => {
    expect(saludoCuenta('Ana María', 'ana@correo.com')).toBe('Hola, Ana');
    expect(saludoCuenta(null, 'ana.gomez@correo.com')).toBe('Hola, ana.gomez');
    expect(saludoCuenta('', '')).toBe('Hola');
    expect(mensajeRecuperar('a@b.co')).toContain('Si a@b.co tiene una cuenta');
  });

  test('el editor no guarda los valores por defecto', () => {
    expect(cambioCuenta({}, { modo: 'panel' })).toEqual({ header_cuenta: { modo: 'panel' } });
    expect(cambioCuenta({ header_cuenta: { modo: 'panel' } }, { modo: 'pagina' })).toEqual({ header_cuenta: null });
    expect(cambioCuenta({ header_cuenta: { modo: 'dialogo' } }, { beneficios: false, despues: 'cuenta', titulo: '   ' })).toEqual({
      header_cuenta: { modo: 'dialogo', beneficios: false, despues: 'cuenta' },
    });
  });
});
