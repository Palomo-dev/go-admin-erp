import { filasDesdeMatriz, mapearCabeceras, aRevision } from '../importarCategoriasLogica';
import { aPermisosCatalogo, SIN_PERMISOS } from '../usePermisosCatalogo';
import { segunPermisos } from '../accionesCategoria';
import type { AccionFila } from '@/components/kit';

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 2 }));
jest.mock('@/lib/services/categoryService', () => ({ ErrorCategoria: class extends Error {} }));

describe('permisos de catálogo resueltos en el servidor', () => {
  it('solo `true` explícito concede', () => {
    expect(aPermisosCatalogo({ crear: true, editar: 'true', eliminar: 1 })).toEqual({ crear: true, editar: false, eliminar: false, resueltos: true });
    expect(aPermisosCatalogo(null)).toEqual({ crear: false, editar: false, eliminar: false, resueltos: true });
  });
  it('mientras cargan, nada se ofrece', () => {
    expect(SIN_PERMISOS).toEqual({ crear: false, editar: false, eliminar: false, resueltos: false });
  });
  it('el menú de una categoría oculta lo que el permiso no deja hacer', () => {
    const icono = (() => null) as unknown as AccionFila['icono'];
    const acciones: AccionFila[] = ['editar', 'subcategoria', 'mover', 'raiz', 'duplicar', 'productos', 'estado', 'eliminar'].map((id) => ({
      id,
      etiqueta: id,
      icono,
      onSelect: () => undefined,
    }));
    const visibles = (p: { crear: boolean; editar: boolean; eliminar: boolean }) =>
      segunPermisos(acciones, p)
        .filter((a) => !a.oculta)
        .map((a) => a.id);
    expect(visibles({ crear: false, editar: false, eliminar: false })).toEqual(['productos']);
    expect(visibles({ crear: true, editar: false, eliminar: false })).toEqual(['subcategoria', 'duplicar', 'productos']);
    expect(visibles({ crear: false, editar: true, eliminar: true })).toEqual(['editar', 'mover', 'raiz', 'productos', 'estado', 'eliminar']);
  });
});

describe('importar categorías: del archivo a las filas de fn_categorias_importar', () => {
  it('reconoce cabeceras sin tildes ni mayúsculas', () => {
    expect(mapearCabeceras(['Nombre', 'Categoría Padre', 'ESTACIÓN', 'Requiere preparación'])).toEqual({
      name: 0,
      parent_name: 1,
      station: 2,
      requires_preparation: 3,
    });
  });
  it('traduce estación y booleanos, conserva el número de fila y salta filas vacías', () => {
    const filas = filasDesdeMatriz([
      ['Nombre', 'Categoría padre', 'Estación', 'Activa', 'Orden'],
      ['Bebidas', null, 'Barra', 'Sí', '2'],
      [null, null, null, null, null],
      ['Gaseosas', 'Bebidas', 'Cocina fría', 'no', ''],
      ['', 'Bebidas', null, null, null],
    ]);
    expect(filas).toHaveLength(3);
    expect(filas[0]).toMatchObject({ fila: 2, name: 'Bebidas', station: 'bar', is_active: true, display_order: 2 });
    expect(filas[1]).toMatchObject({ fila: 4, name: 'Gaseosas', parent_name: 'Bebidas', station: 'cold_kitchen', is_active: false });
    // Sin nombre también viaja: el servidor la marca con su motivo y su fila.
    expect(filas[2]).toMatchObject({ fila: 5, name: '' });
  });
  it('una estación desconocida no viaja (el CHECK de la base la rechazaría)', () => {
    const [f] = filasDesdeMatriz([['Nombre', 'Estación'], ['Postres', 'Pastelería']]);
    expect(f.station).toBeUndefined();
  });
  it('lee la revisión del servidor', () => {
    const r = aRevision({
      total: 3,
      validas: 2,
      con_error: 1,
      subcategorias: 1,
      filas: [
        { fila: 2, nombre: 'A', padre: null, accion: 'crear', motivo: null },
        { fila: 3, nombre: 'B', padre: 'X', accion: 'error', motivo: 'padre_no_existe' },
      ],
    });
    expect(r).toMatchObject({ validas: 2, con_error: 1, subcategorias: 1, creadas: 0 });
    expect(r.filas[1]).toEqual({ fila: 3, nombre: 'B', padre: 'X', accion: 'error', motivo: 'padre_no_existe' });
  });
});
