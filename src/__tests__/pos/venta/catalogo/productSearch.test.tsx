/**
 * @jest-environment jsdom
 *
 * Buscador y grilla del POS (paso 4) con el servicio simulado: primera
 * página, scroll infinito, vuelta a la página 1 al buscar, vista recordada,
 * agotado, variantes, favorito, Enter sobre la tarjeta enfocada, «3*» y
 * escaneo con el cobro abierto.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const productos = (desde: number, n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: desde + i,
    name: `Producto ${desde + i}`,
    sku: `SKU-${desde + i}`,
    price: 1000,
    status: 'active',
    variant_count: 0,
    has_modifiers: false,
    is_out_of_stock: false,
    ...extra,
  }));

const getProductsPaginated = jest.fn();
const toggleProductFavorite = jest.fn();
jest.mock('@/lib/services/posService', () => ({
  POSService: {
    getProductsPaginated: (...a: unknown[]) => getProductsPaginated(...a),
    getCategories: jest.fn(async () => [{ id: 1, name: 'Bebidas', display_order: 1 }]),
    getCategoryRanking: jest.fn(async () => ({})),
    getProductByBarcode: jest.fn(async () => null),
    toggleProductFavorite: (...a: unknown[]) => toggleProductFavorite(...a),
    toggleCategoryFavorite: jest.fn(async () => true),
  },
}));
jest.mock('@/components/pos/configuracion/configuracionService', () => ({
  ConfiguracionService: { getCategoriesDisplayConfig: jest.fn(async () => ({ mode: 'buttons', orderBy: 'display_order' })) },
  defaultCategoriesDisplayConfig: { mode: 'buttons', orderBy: 'display_order' },
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: 3, branches: [], isLoading: false }) }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', decimals: 0, locale: 'es-CO', formatear: (n: number) => `$ ${n}` }),
}));
jest.mock('@/components/pos/CachedProductImage', () => ({ CachedProductImage: () => null }));
jest.mock('@/components/pos/LocalCatalogNotice', () => ({ LocalCatalogNotice: () => null }));
jest.mock('@/components/ui/barcode-scanner', () => ({ BarcodeScanner: () => null }));
jest.mock('@/lib/services/recipeService', () => ({ recipeService: { getRecipeById: jest.fn() } }));
jest.mock('@/components/pos/VariantSelectorDialog', () => ({
  VariantSelectorDialog: ({ open, product }: { open: boolean; product: { name: string } }) =>
    open ? <div role="dialog" data-state="open">variantes de {product.name}</div> : null,
}));
const toastError = jest.fn();
const toastInfo = jest.fn();
jest.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), info: (...a: unknown[]) => toastInfo(...a), success: jest.fn() } }));

// IntersectionObserver controlable: la prueba decide cuándo asoma el centinela.
let intersectar: (() => void) | null = null;
class IO {
  constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
  observe() {
    intersectar = () => this.cb([{ isIntersecting: true }]);
  }
  disconnect() {}
  unobserve() {}
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;

import { ProductSearch } from '@/components/pos/ProductSearch';

function pagina(data: unknown[], page: number, totalPages: number) {
  return { data, total: totalPages * 16, page, limit: 16, totalPages };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  intersectar = null;
});

describe('ProductSearch (grilla del POS)', () => {
  test('carga la página 1 una sola vez y la 2 al asomar el final (un pedido en vuelo)', async () => {
    let resolver2: (v: unknown) => void = () => undefined;
    getProductsPaginated
      .mockResolvedValueOnce(pagina(productos(1, 16), 1, 3))
      .mockImplementationOnce(() => new Promise((r) => (resolver2 = r)));
    renderConIdioma(<ProductSearch onProductSelect={jest.fn()} />);
    await screen.findByRole('button', { name: 'Elegir Producto 1' });
    expect(getProductsPaginated).toHaveBeenCalledTimes(1);
    expect(getProductsPaginated.mock.calls[0][0]).toMatchObject({ page: 1, limit: 16, branchFilter: 3 });
    act(() => intersectar?.());
    act(() => intersectar?.());
    expect(getProductsPaginated).toHaveBeenCalledTimes(2);
    await act(async () => resolver2(pagina(productos(17, 16), 2, 3)));
    expect(await screen.findByRole('button', { name: 'Elegir Producto 20' })).toBeTruthy();
  });

  test('buscar vuelve a la página 1 a los 300 ms', async () => {
    jest.useFakeTimers();
    getProductsPaginated.mockResolvedValue(pagina(productos(1, 4), 1, 1));
    renderConIdioma(<ProductSearch onProductSelect={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'coca' } });
    await act(async () => { jest.advanceTimersByTime(299); });
    expect(getProductsPaginated).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(2); });
    expect(getProductsPaginated).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'coca' }));
    jest.useRealTimers();
  });

  test('la vista Lista se recuerda en el dispositivo y pide páginas de 20', async () => {
    getProductsPaginated.mockResolvedValue(pagina(productos(1, 4), 1, 1));
    renderConIdioma(<ProductSearch onProductSelect={jest.fn()} />);
    await screen.findByRole('button', { name: 'Elegir Producto 1' });
    fireEvent.click(screen.getByRole('radio', { name: 'Lista' }));
    expect(window.localStorage.getItem('pos_vista_productos')).toBe('lista');
    await waitFor(() => expect(getProductsPaginated).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 20 })));
  });

  test('simple se agrega; agotado avisa y no agrega; con variantes abre el diálogo', async () => {
    getProductsPaginated.mockResolvedValue(
      pagina([...productos(1, 1), ...productos(2, 1, { is_out_of_stock: true }), ...productos(3, 1, { variant_count: 2, has_variants: true })], 1, 1),
    );
    const onSelect = jest.fn();
    renderConIdioma(<ProductSearch onProductSelect={onSelect} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir Producto 1' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getByRole('button', { name: /Producto 2$/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith('Producto agotado', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Elegir Producto 3' }));
    expect(screen.getByText('variantes de Producto 3')).toBeTruthy();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test('la estrella marca favorito sin agregar al carrito', async () => {
    getProductsPaginated.mockResolvedValue(pagina(productos(1, 1), 1, 1));
    toggleProductFavorite.mockResolvedValue(true);
    const onSelect = jest.fn();
    renderConIdioma(<ProductSearch onProductSelect={onSelect} />);
    await screen.findByRole('button', { name: 'Elegir Producto 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Marcar Producto 1 como favorita' }));
    await waitFor(() => expect(toggleProductFavorite).toHaveBeenCalledWith(1));
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('«3*» y elegir: agrega 3 y limpia la cantidad', async () => {
    getProductsPaginated.mockResolvedValue(pagina(productos(1, 1), 1, 1));
    const onSelect = jest.fn();
    renderConIdioma(<ProductSearch onProductSelect={onSelect} />);
    await screen.findByRole('button', { name: 'Elegir Producto 1' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '3*' } });
    expect(screen.getByText('Se agregarán 3 unidades del producto que elijas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir Producto 1' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), undefined, 3);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });

  test('flechas mueven el foco y Enter agrega el producto enfocado', async () => {
    getProductsPaginated.mockResolvedValue(pagina(productos(1, 3), 1, 1));
    const onSelect = jest.fn();
    renderConIdioma(<ProductSearch onProductSelect={onSelect} />);
    const primera = await screen.findByRole('button', { name: 'Elegir Producto 1' });
    primera.focus();
    fireEvent.keyDown(primera, { key: 'ArrowRight' });
    const segunda = screen.getByRole('button', { name: /Producto 2$/ });
    expect(document.activeElement).toBe(segunda);
    fireEvent.keyDown(segunda, { key: 'Enter' });
    fireEvent.click(segunda);
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 2 }));
  });

  test('con el cobro abierto un escaneo avisa y no agrega', async () => {
    getProductsPaginated.mockResolvedValue(pagina(productos(1, 1), 1, 1));
    const onSelect = jest.fn();
    renderConIdioma(<ProductSearch onProductSelect={onSelect} bloqueado />);
    await screen.findByRole('button', { name: 'Elegir Producto 1' });
    for (const key of [...'7701234567890'.split(''), 'Enter']) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('Cierra el cobro para agregar productos'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
