/**
 * Grilla del catálogo del POS (paso 4): vista recordada por dispositivo,
 * cantidad rápida «3*», foco con flechas, páginas del scroll infinito sin
 * repetidos y un solo pedido en vuelo (R6).
 */
import {
  CLAVE_VISTA,
  TAMANO_PAGINA,
  aProductoTarjeta,
  categoriaDeValor,
  columnasDeGrilla,
  crearControlPedidos,
  fusionarPaginas,
  guardarVista,
  hayMasPaginas,
  interpretarBuscador,
  leerVista,
  modoBarraCategorias,
  moverFocoGrilla,
} from '@/lib/pos/venta/catalogoGrilla';
import type { PosGridProduct } from '@/lib/pos/venta/catalogo';

function almacen(inicial: Record<string, string> = {}) {
  const datos = { ...inicial };
  return { getItem: (k: string) => datos[k] ?? null, setItem: (k: string, v: string) => void (datos[k] = v), datos };
}

describe('vista del catálogo', () => {
  test('tarjetas por defecto; lista si se guardó; lo desconocido vuelve a tarjetas', () => {
    expect(leerVista(almacen())).toBe('tarjetas');
    expect(leerVista(almacen({ [CLAVE_VISTA]: 'lista' }))).toBe('lista');
    expect(leerVista(almacen({ [CLAVE_VISTA]: 'compacta' }))).toBe('tarjetas');
    expect(leerVista(null)).toBe('tarjetas');
  });

  test('guardar no revienta sin almacenamiento (ventana privada)', () => {
    const a = almacen();
    guardarVista(a, 'lista');
    expect(a.datos[CLAVE_VISTA]).toBe('lista');
    const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(() => guardarVista(roto, 'lista')).not.toThrow();
    expect(leerVista(roto)).toBe('tarjetas');
  });

  test('páginas de 16 en tarjetas y 20 en lista', () => {
    expect(TAMANO_PAGINA).toEqual({ tarjetas: 16, lista: 20 });
  });
});

describe('cantidad rápida «3*»', () => {
  test('al principio y de 1 a 999; lo demás se busca tal cual', () => {
    expect(interpretarBuscador('3*')).toEqual({ cantidad: 3, termino: '' });
    expect(interpretarBuscador('3*coca')).toEqual({ cantidad: 3, termino: 'coca' });
    expect(interpretarBuscador(' 12 * pan')).toEqual({ cantidad: 12, termino: 'pan' });
    expect(interpretarBuscador('0*pan')).toEqual({ cantidad: null, termino: '0*pan' });
    expect(interpretarBuscador('1000*')).toEqual({ cantidad: null, termino: '1000*' });
    expect(interpretarBuscador('A*1')).toEqual({ cantidad: null, termino: 'A*1' });
  });
});

describe('foco de la grilla', () => {
  test('flechas de una en una y de fila en fila, sin salirse', () => {
    expect(moverFocoGrilla(0, 'ArrowRight', 10, 3)).toBe(1);
    expect(moverFocoGrilla(0, 'ArrowLeft', 10, 3)).toBe(0);
    expect(moverFocoGrilla(1, 'ArrowDown', 10, 3)).toBe(4);
    expect(moverFocoGrilla(8, 'ArrowDown', 10, 3)).toBe(8);
    expect(moverFocoGrilla(4, 'ArrowUp', 10, 3)).toBe(1);
    expect(moverFocoGrilla(4, 'End', 10, 3)).toBe(9);
    expect(moverFocoGrilla(4, 'a', 10, 3)).toBeNull();
  });

  test('columnas desde el grid calculado', () => {
    expect(columnasDeGrilla('248px 248px 248px')).toBe(3);
    expect(columnasDeGrilla('none')).toBe(1);
  });
});

describe('scroll infinito', () => {
  test('una página nueva no repite productos que el ranking movió', () => {
    expect(fusionarPaginas([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(hayMasPaginas(1, 3)).toBe(true);
    expect(hayMasPaginas(3, 3)).toBe(false);
  });

  test('un solo pedido en vuelo; la respuesta de una búsqueda vieja se descarta', () => {
    const c = crearControlPedidos();
    const g1 = c.reiniciar();
    c.turnoPrimera();
    expect(c.turnoSiguiente()).toBeNull();
    const g2 = c.reiniciar();
    expect(c.terminar(g1)).toBe(false);
    expect(c.turnoSiguiente()).toBe(g2);
    expect(c.turnoSiguiente()).toBeNull();
    expect(c.terminar(g2)).toBe(true);
    expect(c.enVuelo()).toBe(false);
  });
});

describe('filas del servicio → piezas del kit', () => {
  const base = { id: 7, name: 'Camisa', sku: 'C-1', price: 50000, image: null } as unknown as PosGridProduct;

  test('precio, favorito, stock y agotado desde la fila', () => {
    const t = aProductoTarjeta({ ...base, is_favorite: true, track_stock: true, stock_quantity: 3 } as PosGridProduct);
    expect(t).toMatchObject({ id: 7, nombre: 'Camisa', precio: 50000, favorito: true, stock: { cantidad: 3 } });
    expect(aProductoTarjeta({ ...base, track_stock: false } as PosGridProduct).stock).toBe('sinSeguimiento');
    expect(aProductoTarjeta({ ...base, price: 0 } as PosGridProduct).precio).toBeNull();
  });

  test('modo de categorías y valor de la barra', () => {
    expect(modoBarraCategorias('images')).toBe('imagenes');
    expect(modoBarraCategorias('searchselect')).toBe('combobox');
    expect(modoBarraCategorias(undefined)).toBe('chips');
    expect(categoriaDeValor(null)).toBeNull();
    expect(categoriaDeValor('favoritas')).toBeNull();
    expect(categoriaDeValor(4)).toBe(4);
  });
});
