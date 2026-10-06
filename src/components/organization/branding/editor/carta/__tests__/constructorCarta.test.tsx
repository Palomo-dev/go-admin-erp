/**
 * @jest-environment jsdom
 *
 * Constructor de la carta (menu_full): orden y ocultos van al contenido de la sección; lo de la
 * sede se guarda con la ruta de siempre (carta-sede) y antes se ve en el lienzo.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../../fields/FieldRenderer', () => ({ __esModule: true, default: () => <div data-testid="campo" /> }));
jest.mock('@/lib/website/carta/inventarioCarta', () => ({
  categoriasDeInventario: jest.fn(async () => [
    { id: 10, name: 'Entradas', parent_id: null },
    { id: 20, name: 'Postres', parent_id: null },
  ]),
  platosDeCategorias: jest.fn(async () => [
    { id: 1, name: 'Tiradito', sku: null, category_id: 10, description: 'De pesca del día' },
    { id: 2, name: 'Ceviche', sku: null, category_id: 10, description: null },
    { id: 3, name: 'Tarta', sku: null, category_id: 20, description: null },
  ]),
  buscarPlatos: jest.fn(async () => []),
}));
const guardarCartaDeSede = jest.fn(async () => ({ guardados: 1 }));
jest.mock('@/lib/website/carta/clienteCartaSede', () => ({
  leerCartaDeSede: jest.fn(async () => ({
    productos: new Map([
      [1, { id: 1, name: 'Tiradito', sku: '', category_id: 10, precio_vigente: 38000, precio_origen: 'sede', ajuste: null }],
      [2, { id: 2, name: 'Ceviche', sku: '', category_id: 10, precio_vigente: 30000, precio_origen: 'general', ajuste: null }],
    ]),
    puedeEditar: true,
    hoy: '2026-10-06',
  })),
  guardarCartaDeSede: (...args: unknown[]) => guardarCartaDeSede(...(args as [])),
}));

import ConstructorCarta from '../ConstructorCarta';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';

const seccion = (content: Record<string, unknown> = {}): WebsitePageSection =>
  ({
    id: 's1',
    page_id: 'p1',
    organization_id: 120,
    section_type: 'menu_full',
    section_variant: 'anchors',
    content: { selected_category_ids: [10, 20], ...content },
    settings: {},
    sort_order: 0,
    is_visible: true,
    created_at: '',
    updated_at: '',
  }) as unknown as WebsitePageSection;

async function montar(props: Partial<React.ComponentProps<typeof ConstructorCarta>> = {}) {
  const onCambiarContenido = jest.fn();
  const onCambiosSede = jest.fn();
  renderConIdioma(
    <ConstructorCarta
      abierto
      onAbiertoChange={jest.fn()}
      organizationId={120}
      section={seccion()}
      onCambiarContenido={onCambiarContenido}
      onCambiarVariante={jest.fn()}
      sede={null}
      onCambiosSede={onCambiosSede}
      {...props}
    />,
  );
  await screen.findByRole('button', { name: 'Tiradito' });
  return { onCambiarContenido, onCambiosSede };
}

describe('ConstructorCarta', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  test('pinta la carta en el orden guardado', async () => {
    await montar({ section: seccion({ carta_platos: { orden: { '10': [2, 1] } } }) });
    const nombres = Array.from(document.querySelectorAll('[data-plato]')).map((li) => li.getAttribute('data-plato'));
    expect(nombres).toEqual(['2', '1', '3']);
  });

  test('ocultar un plato lo escribe en carta_platos del contenido', async () => {
    const { onCambiarContenido } = await montar();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ocultar de la carta' })[0]);
    expect(onCambiarContenido).toHaveBeenCalledWith(
      expect.objectContaining({ selected_category_ids: [10, 20], carta_platos: expect.objectContaining({ ocultos: [1] }) }),
    );
  });

  test('quitar una sección la saca de selected_category_ids', async () => {
    const { onCambiarContenido } = await montar();
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[1]);
    expect(onCambiarContenido).toHaveBeenCalledWith(expect.objectContaining({ selected_category_ids: [10] }));
  });

  test('el plato que llega del lienzo queda elegido', async () => {
    await montar({ platoInicial: 2 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ceviche' }).getAttribute('aria-pressed')).toBe('true'));
  });

  test('en una sede: agotado va al lienzo en vivo y se guarda con carta-sede', async () => {
    const { onCambiosSede } = await montar({ sede: { branchId: 7, nombre: 'Sede Norte' }, platoInicial: 1 });
    fireEvent.click(await screen.findByRole('switch', { name: /Agotado/ }));
    expect(onCambiosSede).toHaveBeenLastCalledWith(7, [{ product_id: 1, is_sold_out: true }]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de la sede' }));
    });
    expect(guardarCartaDeSede).toHaveBeenCalledWith(7, [{ product_id: 1, is_sold_out: true }]);
  });
});
