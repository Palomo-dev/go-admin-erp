/**
 * Secciones de la ficha (Figma «16 Sitio web» 2983:72501): sin claves nuevas, cada sección es la
 * de hoy; fuentes de relacionados (a mano primero, luego calculados, sin repetir); filas propias de
 * la ficha técnica. La tienda tiene la misma copia y `npm run verify:secciones-ficha` allá.
 */
import {
  CLAVES_NUEVAS_BENEFICIOS,
  CLAVES_NUEVAS_DESCRIPCION,
  CLAVES_NUEVAS_RELACIONADOS,
  CLAVES_NUEVAS_RESENAS,
  conClave,
  filasParaGuardar,
  leerFilasPropias,
  leerItemsBeneficios,
  leerOpcionesBeneficios,
  leerOpcionesDescripcion,
  leerOpcionesRelacionados,
  leerOpcionesResenas,
  ordenarResenas,
  productosCompradosJuntos,
  productosRelacionados,
  relacionadosPideDatos,
  sinClaves,
} from '../seccionesFicha';

describe('sin opciones = el aspecto de hoy', () => {
  test.each([{}, null, undefined, { items: [{ icon: 'Truck', title: 'Envío' }] }, { related_products_layout: 'grid' }, { layout: 'tabs', max_height: 300 }, { reviews_source: 'real' }])(
    '%p no enciende ninguna sección',
    (c) => {
      expect(leerOpcionesBeneficios(c as never).conOpciones).toBe(false);
      expect(leerOpcionesResenas(c as never).conOpciones).toBe(false);
      expect(leerOpcionesRelacionados(c as never).conOpciones).toBe(false);
      expect(leerOpcionesDescripcion(c as never).conOpciones).toBe(false);
    },
  );

  test('por defecto: Lista 2 columnas multicolor, Clásico, Carrusel, «Ver más» por 180 letras', () => {
    expect(leerOpcionesBeneficios({})).toMatchObject({ estilo: 'lista', columnas: 2, modoColor: 'multicolor', lineas: false, columnasCelular: null });
    expect(leerOpcionesResenas({})).toMatchObject({ estilo: 'clasico', porPagina: 10, orden: 'recent', titulo: 'Opiniones de clientes' });
    expect(leerOpcionesRelacionados({})).toMatchObject({ estilo: 'carrusel', fuente: 'category', cantidad: 8, columnas: 4 });
    expect(leerOpcionesDescripcion({})).toMatchObject({ estilo: 'ver_mas', lineas: null, letras: 180, vinetas: 'punto' });
    expect(leerOpcionesRelacionados({ related_products_layout: 'grid' }).estilo).toBe('rejilla');
  });

  test('las claves nuevas no pisan las de siempre ni empiezan por card_', () => {
    const todas = [...CLAVES_NUEVAS_BENEFICIOS, ...CLAVES_NUEVAS_RELACIONADOS, ...CLAVES_NUEVAS_DESCRIPCION];
    for (const k of ['items', 'columns', 'gap', 'title', 'max_items', 'source', 'show_arrows', 'show_dots', 'related_products_layout', 'layout', 'max_height']) {
      expect(todas).not.toContain(k);
    }
    expect([...todas, ...CLAVES_NUEVAS_RESENAS].some((k) => k.startsWith('card_'))).toBe(false);
  });

  test('valores inválidos caen al de hoy', () => {
    expect(leerOpcionesBeneficios({ benefits_style: 'x', icon_size: 'enorme', columns: 9 })).toMatchObject({ conOpciones: true, estilo: 'lista', tamano: 'md', columnas: 4 });
    expect(leerOpcionesResenas({ per_page: 7 }).porPagina).toBe(10);
    expect(leerOpcionesDescripcion({ lines_before_more: 4 }).lineas).toBeNull();
    expect(leerOpcionesDescripcion({ parts: [] }).partes).toEqual(['descripcion']);
  });

  test('restablecer quita solo las claves nuevas', () => {
    const c = conClave({ items: [], benefits_style: 'tarjetas' }, 'icon_bg', 'solido');
    expect(sinClaves(c, CLAVES_NUEVAS_BENEFICIOS)).toEqual({ items: [] });
  });
});

describe('beneficios', () => {
  test('ítems: color propio válido o null, ícono por defecto Star, máximo 8', () => {
    const items = leerItemsBeneficios({ items: [{ icon: 'Lock', title: 'Pago', color: '#2563EB' }, { title: 'x', color: 'rojo' }, ...Array(10).fill({ title: 'y' })] });
    expect(items).toHaveLength(8);
    expect(items[0]).toEqual({ icon: 'Lock', title: 'Pago', description: '', color: '#2563EB' });
    expect(items[1]).toMatchObject({ icon: 'Star', color: null });
  });
});

describe('reseñas', () => {
  const r = (id: number, rating: number, likes: number, date: string) => ({ id, rating, likes, date });
  test('orden', () => {
    const lista = [r(1, 3, 9, '2026-01-01'), r(2, 5, 1, '2026-03-01'), r(3, 4, 5, '2026-02-01')];
    expect(ordenarResenas(lista, 'recent').map((x) => x.id)).toEqual([2, 3, 1]);
    expect(ordenarResenas(lista, 'helpful').map((x) => x.id)).toEqual([1, 3, 2]);
    expect(ordenarResenas(lista, 'highest').map((x) => x.id)).toEqual([2, 3, 1]);
    expect(ordenarResenas(lista, 'lowest').map((x) => x.id)).toEqual([1, 3, 2]);
  });
});

describe('relacionados', () => {
  const p = (id: number) => ({ id });
  const siempre = [p(1), p(2), p(3)];
  test('fuente categoría = la lista de siempre', () => {
    expect(productosRelacionados('category', { siempre }, 9, 8)).toEqual(siempre);
  });
  test('a mano primero, sin repetir y sin el producto de la ficha', () => {
    expect(productosRelacionados('manual', { siempre: [p(9), ...siempre], manuales: [p(7), p(2)] }, 9, 8).map((x) => x.id)).toEqual([7, 2, 1, 3]);
  });
  test('comprados juntos: a mano, luego calculados; sin datos, la lista de siempre', () => {
    expect(productosRelacionados('bought_together', { siempre, juntosManuales: [p(5)], juntosCalculados: [p(6), p(5)] }, 9, 8).map((x) => x.id)).toEqual([5, 6]);
    expect(productosRelacionados('bought_together', { siempre }, 9, 8)).toEqual(siempre);
    expect(productosCompradosJuntos({ siempre: [], juntosCalculados: [p(1), p(2), p(3), p(4)] }, 9)).toHaveLength(3);
  });
  test('qué datos pide la sección', () => {
    expect(relacionadosPideDatos({})).toEqual({ manual: false, juntos: false });
    expect(relacionadosPideDatos({ source: 'manual' })).toEqual({ manual: true, juntos: false });
    expect(relacionadosPideDatos({ related_style: 'juntos' })).toEqual({ manual: false, juntos: true });
  });
});

describe('ficha técnica propia', () => {
  test('solo filas completas; vacío se guarda null', () => {
    expect(leerFilasPropias([{ nombre: ' Voltaje ', valor: '110  V' }, { nombre: '', valor: 'x' }, 3, null])).toEqual([{ nombre: 'Voltaje', valor: '110 V' }]);
    expect(leerFilasPropias('no')).toEqual([]);
    expect(filasParaGuardar([{ nombre: ' ', valor: '' }])).toBeNull();
    expect(filasParaGuardar([{ nombre: 'Capacidad', valor: '251 L' }])).toEqual([{ nombre: 'Capacidad', valor: '251 L' }]);
  });
});
