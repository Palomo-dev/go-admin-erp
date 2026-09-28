/// <reference types="jest" />
/**
 * Lo que el catálogo hace en el navegador tras el rediseño con el kit:
 * búsqueda rápida (también por código de variante), filtros que la RPC no
 * conoce, orden por columna, chips y la traducción de la URL a la RPC.
 */

import {
  CAMPOS_ORDEN,
  CLAVES_FILTRO,
  categoriaParaRpc,
  chipsFiltros,
  coincideTexto,
  estadoParaRpc,
  filtrarCatalogo,
  idsNumericos,
  margenDe,
  nivelDeCantidad,
  nivelStock,
  ordenarCatalogo,
  resumenStock,
  tieneImagen,
} from '../catalogoVista';
import type { Producto } from '../types';

const PRINCIPAL = 1;
const NORTE = 2;

function prod(parcial: Partial<Producto> & { id: number }): Producto {
  return {
    organization_id: 1,
    sku: `SKU-${parcial.id}`,
    name: `Producto ${parcial.id}`,
    description: '',
    category_id: 1,
    unit_code: 'UN',
    supplier_id: null,
    barcode: null,
    status: 'active',
    is_menu_item: false,
    track_stock: true,
    stock_sucursales: [],
    product_images: [],
    children: [],
    ...parcial,
  } as Producto;
}

const nivel = (branch_id: number, qty_on_hand: number) => ({ branch_id, qty_on_hand, qty_reserved: 0 });
const SIN_FALLIDAS: ReadonlySet<string> = new Set();

describe('nivelStock: lo que ve el usuario según la sucursal del header', () => {
  const p = prod({ id: 1, stock_sucursales: [nivel(PRINCIPAL, 12), nivel(NORTE, 2)] });

  it('todas las sucursales suman', () => {
    expect(nivelStock(p, null)).toBe('con');
  });
  it('una sucursal con poco stock es «bajo»; sin fila es «sin»', () => {
    expect(nivelStock(p, NORTE)).toBe('bajo');
    expect(nivelStock(p, 99)).toBe('sin');
  });
  it('sin seguimiento no es «sin stock»', () => {
    expect(nivelStock(prod({ id: 2, track_stock: false }), null)).toBe('sinSeguimiento');
  });
});

describe('stock bajo con el mínimo configurado (criterio de fn_notify_stock_low)', () => {
  const conMinimo = (qty: number, min: number) => ({ branch_id: PRINCIPAL, qty_on_hand: qty, qty_reserved: 0, min_level: min });

  it('con mínimo: bajo si la cantidad está EN el mínimo o por debajo', () => {
    expect(nivelDeCantidad(20, 20)).toBe('bajo');
    expect(nivelDeCantidad(21, 20)).toBe('con');
    expect(nivelStock(prod({ id: 3, stock_sucursales: [conMinimo(8, 10)] }), PRINCIPAL)).toBe('bajo');
  });
  it('un mínimo alto marca «bajo» aunque haya más de 5 unidades', () => {
    expect(nivelStock(prod({ id: 4, stock_sucursales: [conMinimo(30, 50)] }), null)).toBe('bajo');
  });
  it('un mínimo bajo NO marca «bajo» con menos de 5 unidades por encima de él', () => {
    expect(nivelDeCantidad(3, 1)).toBe('con');
  });
  it('sin mínimo se usa el corte de 5', () => {
    expect(nivelDeCantidad(4, 0)).toBe('bajo');
    expect(nivelDeCantidad(5, null)).toBe('con');
  });
  it('agotado gana siempre', () => {
    expect(nivelDeCantidad(0, 10)).toBe('sin');
  });
});

describe('búsqueda rápida', () => {
  const conVariante = prod({
    id: 1,
    name: 'Zapatilla urbana',
    brand: 'Marca Ñandú',
    children: [prod({ id: 10, sku: 'ZAP-0042-38', barcode: '7701234' })],
  });

  it('busca por nombre sin tildes ni mayúsculas, y por marca', () => {
    expect(coincideTexto(conVariante, 'ZAPATILLA')).toBe(true);
    expect(coincideTexto(conVariante, 'nandu')).toBe(true);
  });
  it('encuentra al padre por el SKU o el código de una variante (como la RPC)', () => {
    expect(coincideTexto(conVariante, 'zap-0042-38')).toBe(true);
    expect(coincideTexto(conVariante, '7701234')).toBe(true);
    expect(coincideTexto(conVariante, 'no-existe')).toBe(false);
  });
});

describe('filtros del navegador', () => {
  const conImagen = prod({ id: 1, product_images: [{ id: 1, product_id: 1, storage_path: 'products/a.jpg', is_primary: true }] });
  const servicio = prod({ id: 2, product_type: 'service', track_stock: false });
  const sinStock = prod({ id: 3, stock_sucursales: [nivel(PRINCIPAL, 0)] });
  const conVariantes = prod({ id: 4, children: [prod({ id: 40 })], modifier_groups_count: 2, stock_sucursales: [nivel(PRINCIPAL, 3)] });
  const todos = [conImagen, servicio, sinStock, conVariantes];
  const filtrar = (filtros: Record<string, string>, fallidas = SIN_FALLIDAS) =>
    filtrarCatalogo(todos, { filtros, branchFilter: null, imagenesFallidas: fallidas }).map((p) => p.id);

  it('imagen: una URL que falló cuenta como «sin imagen»', () => {
    expect(filtrar({ imagen: 'con' })).toEqual([1]);
    expect(filtrar({ imagen: 'con' }, new Set(['1']))).toEqual([]);
    expect(filtrar({ imagen: 'sin' }, new Set(['1']))).toEqual([1, 2, 3, 4]);
    expect(tieneImagen(conImagen, SIN_FALLIDAS)).toBe(true);
  });

  it('tipo, variantes y modificadores', () => {
    expect(filtrar({ tipo: 'servicio' })).toEqual([2]);
    expect(filtrar({ tipo: 'producto' })).toEqual([1, 3, 4]);
    expect(filtrar({ variantes: 'si' })).toEqual([4]);
    expect(filtrar({ modificadores: 'si' })).toEqual([4]);
  });

  it('stock: «con stock» incluye el bajo; «sin seguimiento» aparte', () => {
    expect(filtrar({ stock: 'sin' })).toEqual([1, 3]);
    expect(filtrar({ stock: 'bajo' })).toEqual([4]);
    expect(filtrar({ stock: 'con' })).toEqual([4]);
    expect(filtrar({ stock: 'sinSeguimiento' })).toEqual([2]);
  });

  it('el resumen del subtítulo no cuenta los «sin seguimiento»', () => {
    expect(resumenStock(todos, null)).toEqual({ sinStock: 2, bajo: 1 });
  });
});

describe('orden por columna', () => {
  const a = prod({ id: 1, name: 'Árbol', price: 300, cost: 100, stock_sucursales: [nivel(PRINCIPAL, 5)], created_at: '2026-01-01' });
  const b = prod({ id: 2, name: 'banco', price: 100, cost: 95, stock_sucursales: [nivel(PRINCIPAL, 1)], created_at: '2026-03-01' });
  const c = prod({ id: 3, name: 'Casa', price: 0, track_stock: false, created_at: '2026-02-01' });
  const lista = [c, b, a];
  const ids = (campo: string, direccion: 'asc' | 'desc') => ordenarCatalogo(lista, { campo, direccion }, null).map((p) => p.id);

  it('nombre ignora tildes y mayúsculas', () => {
    expect(ids('nombre', 'asc')).toEqual([1, 2, 3]);
    expect(ids('nombre', 'desc')).toEqual([3, 2, 1]);
  });
  it('stock deja «sin seguimiento» al final en los dos sentidos', () => {
    expect(ids('stock', 'asc')).toEqual([2, 1, 3]);
    expect(ids('stock', 'desc')).toEqual([1, 2, 3]);
  });
  it('margen deja los productos sin precio al final', () => {
    expect(margenDe(a)).toBeCloseTo(66.67, 1);
    expect(margenDe(c)).toBeNull();
    expect(ids('margen', 'asc')).toEqual([2, 1, 3]);
    expect(ids('margen', 'desc')).toEqual([1, 2, 3]);
  });
  it('más recientes primero', () => {
    expect(ids('creado', 'desc')).toEqual([2, 3, 1]);
  });
  it('no muta la lista original', () => {
    ordenarCatalogo(lista, { campo: 'nombre', direccion: 'asc' }, null);
    expect(lista.map((p) => p.id)).toEqual([3, 2, 1]);
  });
});

describe('URL → RPC y chips', () => {
  it('solo pasan estados y categorías válidos (lo de la URL termina en la RPC)', () => {
    expect(estadoParaRpc('deleted')).toBe('deleted');
    expect(estadoParaRpc("active'; drop")).toBeNull();
    expect(estadoParaRpc(undefined)).toBeNull();
    expect(categoriaParaRpc('12')).toBe(12);
    expect(categoriaParaRpc('-1')).toBeNull();
    expect(categoriaParaRpc('abc')).toBeNull();
  });

  it('las listas blancas cubren los filtros y columnas del catálogo', () => {
    expect(CLAVES_FILTRO).toEqual(['categoria', 'estado', 'imagen', 'tipo', 'stock', 'variantes', 'modificadores']);
    expect(CAMPOS_ORDEN).toContain('stock');
    expect(CAMPOS_ORDEN).toContain('margen');
  });

  it('chips en el orden del panel, con el nombre de la categoría', () => {
    const chips = chipsFiltros(
      { estado: 'active', categoria: '7', imagen: 'sin', stock: 'bajo', variantes: 'si' },
      (id) => (id === '7' ? 'Calzado' : undefined),
    );
    expect(chips.map((c) => c.etiqueta)).toEqual([
      'Categoría: Calzado',
      'Estado: Activo',
      'Sin imagen',
      'Stock bajo',
      'Con variantes',
    ]);
  });

  it('con traductor, los chips salen de productos.filtros; un valor desconocido se muestra tal cual', () => {
    const t = (clave: string, valores?: Record<string, string>) => `[${clave}${valores ? JSON.stringify(valores) : ''}]`;
    const chips = chipsFiltros({ estado: 'active', stock: 'raro', variantes: 'si' }, () => undefined, t);
    expect(chips.map((c) => c.etiqueta)).toEqual([
      '[chips.estado{"valor":"[estados.active]"}]',
      'raro',
      '[chips.variantes]',
    ]);
  });

  it('la selección de la tabla (texto) pasa a ids numéricos para los servicios masivos', () => {
    expect(idsNumericos(new Set(['3', '10', 'nuevo', '0']))).toEqual([3, 10]);
  });
});
