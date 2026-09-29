import {
  claveError,
  esSinPermiso,
  etiquetaFormato,
  filtrosActivos,
  formatoTamano,
  motivoRechazo,
  nombreDeRuta,
  nombreSeguro,
  parametrosListado,
  pestanaDe,
  rutaBiblioteca,
} from '../imagenesLogica';

const archivo = (name: string, type: string, size: number) => ({ name, type, size });

describe('qué archivo se acepta en la biblioteca', () => {
  it('JPG, PNG y WEBP de hasta 5 MB', () => {
    expect(motivoRechazo(archivo('a.jpg', 'image/jpeg', 1000))).toBeNull();
    expect(motivoRechazo(archivo('a.png', 'image/png', 5 * 1024 * 1024))).toBeNull();
    expect(motivoRechazo(archivo('a.webp', '', 1000))).toBeNull(); // navegador sin tipo: por extensión
  });
  it('rechaza HEIC, GIF y archivos pesados o vacíos con su motivo', () => {
    expect(motivoRechazo(archivo('foto-cel.heic', 'image/heic', 1000))).toBe('formato');
    expect(motivoRechazo(archivo('a.gif', 'image/gif', 1000))).toBe('formato');
    expect(motivoRechazo(archivo('a.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1))).toBe('tamano');
    expect(motivoRechazo(archivo('a.jpg', 'image/jpeg', 0))).toBe('tamano');
  });
});

describe('ruta en el storage', () => {
  it('sanea el nombre: sin tildes, espacios ni símbolos, con su extensión', () => {
    expect(nombreSeguro('Botín Cuero Café (1).JPG')).toBe('botin-cuero-cafe-1.jpg');
    expect(nombreSeguro('###.png')).toBe('imagen.png');
    expect(nombreSeguro('../../etc/passwd')).toBe('etc-passwd');
  });
  it('queda dentro de la carpeta de la organización', () => {
    expect(rutaBiblioteca(145, 'Banner temporada.webp', 'AB-12_cd')).toBe('145/ab12cd-banner-temporada.webp');
  });
  it('el nombre de una imagen de producto es el último tramo de su ruta', () => {
    expect(nombreDeRuta('products/55910/scraped_1_0.jpg')).toBe('scraped_1_0.jpg');
    expect(nombreDeRuta('products/1/caf%C3%A9.png?x=1')).toBe('café.png');
  });
});

describe('formato para mostrar', () => {
  it('peso en el idioma activo', () => {
    expect(formatoTamano(0, 'es-CO')).toBe('—');
    expect(formatoTamano(412 * 1024, 'es-CO')).toBe('412 KB');
    expect(formatoTamano(1.1 * 1024 * 1024, 'es-CO')).toBe('1,1 MB');
    expect(formatoTamano(1.1 * 1024 * 1024, 'en-US')).toBe('1.1 MB');
  });
  it('formato por MIME o por ruta', () => {
    expect(etiquetaFormato('image/jpeg')).toBe('JPG');
    expect(etiquetaFormato(null, 'x/y.jpeg')).toBe('JPG');
    expect(etiquetaFormato('', 'x/y.webp')).toBe('WEBP');
  });
});

describe('filtros de la URL → fn_imagenes_listado', () => {
  const estado = (filtros: Record<string, string>, extra: Partial<{ busqueda: string; pagina: number; tamano: number }> = {}) => ({
    busqueda: extra.busqueda ?? '',
    filtros,
    pagina: extra.pagina ?? 1,
    tamano: extra.tamano ?? 20,
    orden: null,
  });

  it('biblioteca por defecto, página y tamaño a offset/limit', () => {
    const p = parametrosListado(estado({}, { pagina: 3, tamano: 20, busqueda: '  botín ' }));
    expect(p).toMatchObject({ p_origen: 'biblioteca', p_busqueda: 'botín', p_offset: 40, p_limit: 20, p_orden: 'recientes' });
  });
  it('solo manda valores de la lista blanca', () => {
    const p = parametrosListado(estado({ uso: 'sin_usar', visibilidad: 'x', formato: 'webp', tamano: 'grande', producto: 'abc' }));
    expect(p).toMatchObject({ p_uso: 'sin_usar', p_visibilidad: null, p_formato: 'webp', p_tamano: 'grande', p_producto_id: null });
  });
  it('«De productos» ignora uso, visibilidad y tamaño aunque sigan en la URL', () => {
    const f = { vista: 'productos', uso: 'en_uso', visibilidad: 'publicas', tamano: 'grande', formato: 'jpg_png', producto: '44' };
    expect(pestanaDe(f)).toBe('productos');
    expect(parametrosListado(estado(f))).toMatchObject({ p_origen: 'productos', p_uso: null, p_visibilidad: null, p_tamano: null, p_formato: 'jpg_png', p_producto_id: 44 });
    expect(filtrosActivos(f)).toEqual(['formato', 'producto']);
  });
  it('la pestaña no cuenta como filtro', () => {
    expect(filtrosActivos({ vista: 'productos' })).toEqual([]);
    expect(filtrosActivos({ uso: 'en_uso', visibilidad: 'privadas' })).toEqual(['uso', 'visibilidad']);
  });
});

describe('errores de las RPC', () => {
  it('42501 es «sin permiso» (otra organización o sin permiso de catálogo)', () => {
    expect(claveError({ code: '42501', message: 'sin_permiso' })).toBe('sinPermiso');
    expect(esSinPermiso({ code: '42501' })).toBe(true);
  });
  it('los hint conocidos se traducen; el resto es genérico', () => {
    expect(claveError({ code: 'P0002', hint: 'IMAGEN_NO_ENCONTRADA' })).toBe('noEncontrada');
    expect(claveError({ code: '22023', hint: 'IMAGEN_TAMANO' })).toBe('tamano');
    expect(claveError(new Error('red'))).toBe('generico');
    expect(claveError(null)).toBe('generico');
  });
});
