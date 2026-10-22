/**
 * La ficha acepta el id numérico o el uuid, siempre dentro de la organización
 * de la sesión. Un segmento inválido no se consulta (antes Postgres fallaba
 * al recibir un número en la columna uuid y la pantalla mostraba un error
 * genérico).
 */
import { supabase } from '@/lib/supabase/config';
import { idProductoPorUuid } from '../../formulario/cargarCatalogos';
import { cargarProductoDetalle } from '../cargarProducto';
import { claveProducto } from '../identProducto';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));

const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ORG = 120;

function consulta(resultado: { data: unknown; error: unknown }) {
  const eqs: Array<[string, unknown]> = [];
  const api = {
    select: () => api,
    eq: (campo: string, valor: unknown) => {
      eqs.push([campo, valor]);
      return api;
    },
    maybeSingle: () => Promise.resolve(resultado),
  };
  (supabase.from as jest.Mock).mockReturnValue(api);
  return eqs;
}

describe('claveProducto', () => {
  it('separa id numérico, uuid y el resto', () => {
    expect(claveProducto('108626')).toEqual({ campo: 'id', valor: 108626 });
    expect(claveProducto(UUID)).toEqual({ campo: 'uuid', valor: UUID });
    expect(claveProducto(UUID.toUpperCase())).toEqual({ campo: 'uuid', valor: UUID.toUpperCase() });
    expect(claveProducto('')).toBeNull();
    expect(claveProducto('108626a')).toBeNull();
    expect(claveProducto('no-es-uuid')).toBeNull();
    expect(claveProducto(`${UUID} `)).toBeNull();
  });
});

describe('cargarProductoDetalle', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('resuelve por id numérico dentro de la organización', async () => {
    const eqs = consulta({ data: { id: 108626, uuid: UUID, organization_id: ORG }, error: null });
    const p = await cargarProductoDetalle(ORG, '108626');
    expect(p).toMatchObject({ id: 108626, uuid: UUID });
    expect(supabase.from).toHaveBeenCalledWith('products');
    expect(eqs).toEqual([
      ['organization_id', ORG],
      ['id', 108626],
    ]);
  });

  it('resuelve por uuid dentro de la organización', async () => {
    const eqs = consulta({ data: { id: 7, uuid: UUID, organization_id: ORG }, error: null });
    const p = await cargarProductoDetalle(ORG, UUID);
    expect(p).toMatchObject({ id: 7, uuid: UUID });
    expect(eqs).toEqual([
      ['organization_id', ORG],
      ['uuid', UUID],
    ]);
  });

  it('un valor inválido devuelve null sin consultar', async () => {
    await expect(cargarProductoDetalle(ORG, 'sku-cb')).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('un producto de otra organización devuelve null', async () => {
    const eqs = consulta({ data: null, error: null });
    await expect(cargarProductoDetalle(ORG, '108626')).resolves.toBeNull();
    expect(eqs).toContainEqual(['organization_id', ORG]);
    expect(eqs).toContainEqual(['id', 108626]);
  });

  it('un error de la consulta se propaga', async () => {
    consulta({ data: null, error: { message: 'fallo' } });
    await expect(cargarProductoDetalle(ORG, UUID)).rejects.toMatchObject({ message: 'fallo' });
  });
});

describe('idProductoPorUuid (editar y duplicar)', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('resuelve el id numérico de la URL sin tratarlo como uuid', async () => {
    const eqs = consulta({ data: { id: 108626 }, error: null });
    await expect(idProductoPorUuid(ORG, '108626')).resolves.toBe(108626);
    expect(eqs).toEqual([
      ['organization_id', ORG],
      ['id', 108626],
    ]);
  });

  it('resuelve un uuid', async () => {
    const eqs = consulta({ data: { id: 7 }, error: null });
    await expect(idProductoPorUuid(ORG, UUID)).resolves.toBe(7);
    expect(eqs).toEqual([
      ['organization_id', ORG],
      ['uuid', UUID],
    ]);
  });

  it('un valor inválido devuelve null sin consultar', async () => {
    await expect(idProductoPorUuid(ORG, 'abc')).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('un producto de otra organización devuelve null', async () => {
    consulta({ data: null, error: null });
    await expect(idProductoPorUuid(ORG, UUID)).resolves.toBeNull();
  });
});
