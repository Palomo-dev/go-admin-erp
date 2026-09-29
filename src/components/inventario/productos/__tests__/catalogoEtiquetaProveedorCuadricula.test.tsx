/**
 * @jest-environment jsdom
 *
 * B7 — catálogo de productos (INVENTARIO-PLAN §5.8; auditoría de componentes §4.7):
 *
 * - `?etiqueta=` y `?proveedor=` (los enlazan Etiquetas y Proveedores de B6b):
 *   se resuelven dentro de la organización a ids de producto y viajan a
 *   `catalogo_productos_lote` como `p_product_ids`; con los dos, la
 *   intersección; sin resolver, el catálogo no se pide sin filtro.
 * - Chips «Etiqueta: …» y «Proveedor: …».
 * - Vista «Tarjetas» (Figma 120:13625): cuadrícula con selección, menú, estado,
 *   precio y comparación; la preferencia vive en el dispositivo.
 */
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { Eye } from 'lucide-react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { chipsFiltros, CLAVES_FILTRO } from '../catalogoVista';
import { interseccionIds } from '../catalogoLotes';
import type { Producto } from '../types';

const rpc = jest.fn();
const consultas: { tabla: string; filtros: [string, unknown][] }[] = [];
const respuestas: Record<string, unknown> = {};

function consulta(tabla: string) {
  const registro = { tabla, filtros: [] as [string, unknown][] };
  consultas.push(registro);
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      registro.filtros.push([col, val]);
      return q;
    },
    maybeSingle: () => Promise.resolve({ data: respuestas[tabla] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: respuestas[tabla] ?? [], error: null }).then(res),
  };
  return q;
}

const canal = { on: jest.fn(), subscribe: jest.fn() };
canal.on.mockReturnValue(canal);
canal.subscribe.mockReturnValue(canal);
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (t: string) => consulta(t),
    channel: () => canal,
    removeChannel: jest.fn(),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }) },
  },
}));

let params = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/inventario/productos',
  useSearchParams: () => params,
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 7 }, isLoading: false }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: null, branches: [{ id: 1, name: 'Principal' }] }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-09-29' }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useOrgCurrency: () => ({ code: 'COP' }),
  formatMonedaSinDecimales: (v: number) => `$ ${v}`,
}));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));
jest.mock('../ProductosPageHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../FiltrosProductos', () => ({ __esModule: true, default: () => null }));
jest.mock('../bulk/AccionesMasivas', () => ({ __esModule: true, default: () => null }));
jest.mock('../FacebookFeedDialog', () => ({ FacebookFeedDialog: () => null }));
jest.mock('../etiquetas/ImprimirEtiquetasDialog', () => ({ ImprimirEtiquetasDialog: () => null }));
jest.mock('../etiquetas/GenerarCodigosDialog', () => ({ GenerarCodigosDialog: () => null }));

import CatalogoProductos from '../CatalogoProductos';
import ProductosTable from '../ProductosTable';

beforeEach(() => {
  jest.clearAllMocks();
  canal.on.mockReturnValue(canal);
  canal.subscribe.mockReturnValue(canal);
  consultas.length = 0;
  for (const k of Object.keys(respuestas)) delete respuestas[k];
  params = new URLSearchParams();
  rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
});

describe('filtros por etiqueta y proveedor', () => {
  it('son claves admitidas en la URL y tienen chip con el nombre', () => {
    expect(CLAVES_FILTRO).toEqual(expect.arrayContaining(['etiqueta', 'proveedor']));
    const chips = chipsFiltros({ etiqueta: '5', proveedor: '9' }, () => undefined, undefined, { etiqueta: 'Temporada', proveedor: null });
    expect(chips).toEqual([
      { clave: 'etiqueta', etiqueta: 'Etiqueta: Temporada' },
      { clave: 'proveedor', etiqueta: 'Proveedor: #9' },
    ]);
  });

  it('con los dos filtros se cruzan los productos', () => {
    expect(interseccionIds([[3, 1, 2, 2], [2, 3, 9]])).toEqual([2, 3]);
    expect(interseccionIds([[4]])).toEqual([4]);
    expect(interseccionIds([])).toEqual([]);
  });

  it('?etiqueta= pide el catálogo solo con los productos de la etiqueta de la organización', async () => {
    params = new URLSearchParams('etiqueta=5');
    respuestas.product_tags = { id: 5, name: 'Temporada', product_tag_relations: [{ product_id: 40 }, { product_id: 41 }] };
    renderConIdioma(<CatalogoProductos />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const etiqueta = consultas.find((c) => c.tabla === 'product_tags');
    expect(etiqueta?.filtros).toEqual([
      ['organization_id', 7],
      ['id', 5],
    ]);
    expect(rpc.mock.calls.every((c) => JSON.stringify(c[1].p_product_ids) === '[40,41]')).toBe(true);
  });

  it('?proveedor= de otra organización no muestra el catálogo entero', async () => {
    params = new URLSearchParams('proveedor=9');
    respuestas.suppliers = null;
    renderConIdioma(<CatalogoProductos />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(consultas.find((c) => c.tabla === 'suppliers')?.filtros).toEqual([
      ['organization_id', 7],
      ['id', 9],
    ]);
    expect(consultas.some((c) => c.tabla === 'product_suppliers')).toBe(false);
    expect(rpc.mock.calls.every((c) => Array.isArray(c[1].p_product_ids) && c[1].p_product_ids.length === 0)).toBe(true);
  });

  it('sin filtros no manda ids (y no pide dos veces al montar)', async () => {
    renderConIdioma(<CatalogoProductos />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0][1].p_product_ids).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('vista Tarjetas', () => {
  const producto = (id: number, extra: Partial<Producto> = {}): Producto =>
    ({
      id,
      uuid: `u${id}`,
      name: `Producto ${id}`,
      sku: `SKU-${id}`,
      status: 'active',
      price: 45000,
      compare_price: 50000,
      track_stock: true,
      stock: 3,
      category: { id: 1, name: 'Ropa' },
      children: [],
      product_images: [],
      ...extra,
    }) as unknown as Producto;

  it('pinta una tarjeta por producto con estado, precio tachado y selección', () => {
    const onSel = jest.fn();
    const onVer = jest.fn();
    renderConIdioma(
      <ProductosTable
        vista="tarjetas"
        productos={[producto(1), producto(2, { price: null as unknown as number, compare_price: null as unknown as number })]}
        acciones={() => [{ id: 'ver', etiqueta: 'Ver', icono: Eye, onSelect: jest.fn() }]}
        onVer={onVer}
        branchFilter={null}
        branches={[{ id: 1, name: 'Principal' }]}
        onImagenFallida={jest.fn()}
        estado="listo"
        seleccion={new Set(['2'])}
        onSeleccionChange={onSel}
        pie={<p>pie de página</p>}
      />,
    );
    const lista = document.querySelector('ul.grid') as HTMLElement;
    expect(lista).toBeTruthy();
    const cuadricula = within(lista);
    expect(cuadricula.getAllByRole('listitem')).toHaveLength(2);
    expect(cuadricula.getByText('SKU-1 · Ropa')).toBeTruthy();
    expect(cuadricula.getByText('$ 50000').className).toContain('line-through');
    expect(cuadricula.getByText('Sin precio')).toBeTruthy();
    fireEvent.click(cuadricula.getByRole('checkbox', { name: 'Seleccionar Producto 1' }));
    expect(onSel).toHaveBeenCalledWith(new Set(['2', '1']));
    expect(screen.getAllByText('pie de página').length).toBeGreaterThan(0);
  });

  it('cargando, vacío o error: los pinta la tabla (sin cuadrícula)', () => {
    renderConIdioma(
      <ProductosTable
        vista="tarjetas"
        productos={[]}
        acciones={() => []}
        onVer={jest.fn()}
        branchFilter={null}
        branches={[]}
        onImagenFallida={jest.fn()}
        estado="cargando"
      />,
    );
    expect(document.querySelector('ul.grid')).toBeNull();
  });
});
