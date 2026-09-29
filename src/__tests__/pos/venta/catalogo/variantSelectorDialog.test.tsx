/**
 * @jest-environment jsdom
 *
 * Selector de variantes del POS (`VariantSelectorDialog` sobre el kit
 * `SelectorVariantes`) con el servicio simulado: pide las variantes con la
 * sucursal que vende, abre en la primera disponible, cambia de variante al
 * tocar talla y color (también a una combinación que no existía con lo
 * elegido), muestra el stock de la sucursal, bloquea la agotada, valida el
 * grupo obligatorio y entrega variante + modificadores + cantidad. Sin
 * `sucursal` ni `conCantidad` conserva el contrato de siempre (mesas, PMS,
 * envíos, «Agregar productos»).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

const getProductVariants = jest.fn();
const getGroupsByProduct = jest.fn();
jest.mock('@/lib/services/posService', () => ({
  POSService: { getProductVariants: (...a: unknown[]) => getProductVariants(...a) },
}));
jest.mock('@/lib/services/productModifiersService', () => ({
  ProductModifiersService: { getGroupsByProduct: (...a: unknown[]) => getGroupsByProduct(...a) },
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', decimals: 0, locale: 'es-CO', formatear: (n: number) => `$ ${n}` }),
}));
jest.mock('@/components/pos/CachedProductImage', () => ({ CachedProductImage: () => null }));

import { VariantSelectorDialog } from '@/components/pos/VariantSelectorDialog';

const variante = (id: number, talla: string, color: string, extra: Record<string, unknown> = {}) => ({
  id,
  sku: `ZAP-${talla}-${color.slice(0, 3).toUpperCase()}`,
  name: `Zapatilla - Variante ${id}`,
  price: 189900,
  variant_data: { Talla: talla, Color: color },
  track_stock: true,
  stock_quantity: 4,
  is_out_of_stock: false,
  ...extra,
});

const variantes = [
  variante(1, '40', 'Negro', { is_out_of_stock: true, stock_quantity: 0 }),
  variante(2, '41', 'Negro'),
  variante(3, '41', 'Blanco', { stock_quantity: 2 }),
  variante(4, '43', 'Azul'),
];

const grupoPlantilla = {
  id: 7,
  name: 'Plantilla',
  selection_mode: 'single',
  min_selections: 0,
  max_selections: 1,
  required: true,
  product_modifiers: [
    { id: 71, name: 'Sin plantilla', extra_price: 0 },
    { id: 72, name: 'Plantilla ortopédica', extra_price: 25000 },
  ],
};

const producto = { id: 10, name: 'Zapatilla urbana Nova', sku: 'ZAP' };

beforeEach(() => {
  jest.clearAllMocks();
  simularAncho(1440);
  getProductVariants.mockResolvedValue(variantes);
  getGroupsByProduct.mockResolvedValue([grupoPlantilla]);
});

function renderPos(extra: Record<string, unknown> = {}) {
  const onSelectVariant = jest.fn();
  const onOpenChange = jest.fn();
  renderConIdioma(
    <VariantSelectorDialog
      open
      onOpenChange={onOpenChange}
      product={producto}
      onSelectVariant={onSelectVariant}
      sucursal={{ filtro: 3, nombre: 'Sucursal Centro' }}
      conCantidad
      cantidadInicial={2}
      {...extra}
    />,
  );
  return { onSelectVariant, onOpenChange };
}

test('pide las variantes con la sucursal y abre en la primera disponible con su stock', async () => {
  renderPos();
  await screen.findByText('41 · Negro · ZAP-41-NEG');
  expect(getProductVariants).toHaveBeenCalledWith(10, { branchFilter: 3 });
  expect(screen.getByText('Elige talla y color · 4 variantes')).toBeTruthy();
  expect(screen.getByText('4 disponibles en Sucursal Centro')).toBeTruthy();
  // «40» solo existe en Negro y está agotada: tachada y anunciada.
  expect(within(screen.getByRole('radiogroup', { name: 'Talla' })).getByRole('radio', { name: '40 · Agotado' })).toBeTruthy();
});

test('tocar un valor cambia de variante; una combinación que no existía salta a la que sí', async () => {
  renderPos();
  await screen.findByText('41 · Negro · ZAP-41-NEG');
  fireEvent.click(screen.getByRole('radio', { name: 'Blanco' }));
  expect(screen.getByText('41 · Blanco · ZAP-41-BLA')).toBeTruthy();
  expect(screen.getByText('2 disponibles en Sucursal Centro')).toBeTruthy();
  // «43» no existe en Blanco: salta a 43-Azul en vez de quedar inalcanzable.
  fireEvent.click(screen.getByRole('radio', { name: '43' }));
  expect(screen.getByText('43 · Azul · ZAP-43-AZU')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Azul' }).getAttribute('aria-checked')).toBe('true');
});

test('la variante agotada no se agrega y dice por qué', async () => {
  renderPos();
  await screen.findByText('41 · Negro · ZAP-41-NEG');
  fireEvent.click(screen.getByRole('radio', { name: '40 · Agotado' }));
  expect(screen.getByText('Agotado en Sucursal Centro')).toBeTruthy();
  const agregar = screen.getByRole('button', { name: /Agregar 2/ }) as HTMLButtonElement;
  expect(agregar.disabled).toBe(true);
  expect(screen.getByText('Esta variante está agotada en la sucursal: elige otra.')).toBeTruthy();
});

test('grupo obligatorio sin elegir: aviso y no entrega; elegido: variante, modificadores y cantidad', async () => {
  const { onSelectVariant, onOpenChange } = renderPos();
  await screen.findByText('41 · Negro · ZAP-41-NEG');
  fireEvent.click(screen.getByRole('button', { name: /Agregar 2 · \$\s?379\.800/ }));
  expect(screen.getByRole('alert').textContent).toBe('Selecciona una opción en «Plantilla»');
  expect(onSelectVariant).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Plantilla ortopédica' }));
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sumar una unidad' }));
  const agregar = screen.getByRole('button', { name: /Agregar 3 · \$\s?644\.700/ });
  fireEvent.click(agregar);
  expect(onSelectVariant).toHaveBeenCalledTimes(1);
  const [v, mods, cantidad] = onSelectVariant.mock.calls[0];
  expect(v).toMatchObject({ id: 2, sku: 'ZAP-41-NEG' });
  expect(mods).toEqual([{ groupId: 7, groupName: 'Plantilla', modifierId: 72, name: 'Plantilla ortopédica', extraPrice: 25000 }]);
  expect(cantidad).toBe(3);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test('el escáner abre con la variante que leyó', async () => {
  renderPos({ varianteInicialId: 3 });
  expect(await screen.findByText('41 · Blanco · ZAP-41-BLA')).toBeTruthy();
});

test('Enter en «Agregar» (foco al terminar de cargar) agrega', async () => {
  getGroupsByProduct.mockResolvedValue([]);
  const { onSelectVariant } = renderPos();
  await screen.findByText('41 · Negro · ZAP-41-NEG');
  const agregar = screen.getByRole('button', { name: /Agregar 2/ });
  await waitFor(() => expect(document.activeElement).toBe(agregar));
  fireEvent.click(agregar);
  expect(onSelectVariant.mock.calls[0][2]).toBe(2);
});

test('sin sucursal ni cantidad: contrato de siempre (sin stock, una unidad)', async () => {
  getGroupsByProduct.mockResolvedValue([]);
  const onSelectVariant = jest.fn();
  renderConIdioma(<VariantSelectorDialog open onOpenChange={jest.fn()} product={producto} onSelectVariant={onSelectVariant} />);
  await screen.findByText('41 · Negro · ZAP-41-NEG');
  expect(getProductVariants).toHaveBeenCalledWith(10, undefined);
  expect(screen.queryByText(/disponibles/)).toBeNull();
  expect(screen.queryByRole('group', { name: 'Cantidad' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Agregar · \$\s?189\.900/ }));
  expect(onSelectVariant.mock.calls[0][2]).toBe(1);
});

test('producto sin variantes con modificadores: personaliza el propio producto', async () => {
  getProductVariants.mockResolvedValue([]);
  const onSelectVariant = jest.fn();
  renderConIdioma(
    <VariantSelectorDialog
      open
      onOpenChange={jest.fn()}
      product={{ id: 5, name: 'Hamburguesa', sku: 'HAM', price: 20000 }}
      onSelectVariant={onSelectVariant}
    />,
  );
  await screen.findByText('Elige las opciones del producto');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sin plantilla' }));
  fireEvent.click(screen.getByRole('button', { name: /Agregar · \$\s?20\.000/ }));
  expect(onSelectVariant.mock.calls[0][0]).toMatchObject({ id: 5, variant_data: {} });
});

test('error al cargar: aviso con «Reintentar» que vuelve a pedir', async () => {
  getProductVariants.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(variantes);
  const errorConsola = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  renderPos();
  const reintentar = await screen.findByRole('button', { name: 'Reintentar' });
  await act(async () => {
    fireEvent.click(reintentar);
  });
  expect(await screen.findByText('41 · Negro · ZAP-41-NEG')).toBeTruthy();
  expect(getProductVariants).toHaveBeenCalledTimes(2);
  errorConsola.mockRestore();
});
