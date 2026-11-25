/**
 * @jest-environment jsdom
 *
 * «Planes de membresía» › Planes que se muestran (Figma «16 Sitio web» E1/E2, 3286-101346): la
 * lista de los planes reales con orden, estrella «Popular» y ojo, los inactivos apagados y, sin
 * planes activos, el aviso con el enlace para crear el primero. Textos reales de messages/*.json.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma as render, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { EditorPlanesMembresia } from '../EditorPlanesMembresia';
import { listaEditor, moverPlan, planesDesdeFilas, type FilaPlanEditor } from '../planesMembresiaLogica';
import { leerAjustesPlanes } from '@/lib/website/contrato/paginaMembresias';

const filas: FilaPlanEditor[] = [
  { id: 1, name: 'Club Anual', is_active: true, product_id: 11, products: { status: 'active', product_prices: [{ price: 159900, effective_from: '2026-01-01T00:00:00Z', effective_to: null }] } },
  { id: 2, name: 'Club Esencial', is_active: true, product_id: 12, products: { status: 'active', product_prices: [{ price: 19900, effective_from: '2026-01-01T00:00:00Z', effective_to: null }] } },
  { id: 3, name: 'Club Corporativo', is_active: true, product_id: null, products: null },
  { id: 4, name: 'Club Verano', is_active: false, product_id: 14, products: { status: 'active', product_prices: [] } },
  { id: 5, name: 'Club Pausa', is_active: true, product_id: 15, products: { status: 'inactive', product_prices: [{ price: 5000, effective_from: '2026-01-01T00:00:00Z', effective_to: null }] } },
];

let respuesta: { data: FilaPlanEditor[] | null; error: unknown } = { data: filas, error: null };
const eq = jest.fn(async () => respuesta);
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: jest.fn(() => ({ select: jest.fn(() => ({ eq: (...a: unknown[]) => eq(...(a as [])) })) })) },
  getProjectRef: jest.fn(() => 'test'),
}));

describe('lógica', () => {
  const planes = planesDesdeFilas(filas, new Date('2026-11-25T12:00:00Z'));

  test('estado y precio como los ve la tienda, en el orden de siempre', () => {
    expect(planes.map((p) => [p.id, p.estado, p.price])).toEqual([
      [5, 'pausado', 5000],
      [2, 'en_linea', 19900],
      [1, 'en_linea', 159900],
      [3, 'consulta', null],
      [4, 'consulta', null],
    ]);
  });

  test('activos en el orden de la sección; inactivos aparte', () => {
    const { activos, inactivos } = listaEditor(planes, leerAjustesPlanes({ plan_order: [1, 3] }));
    expect(activos.map((p) => p.id)).toEqual([1, 3, 5, 2]);
    expect(inactivos.map((p) => p.id)).toEqual([4]);
  });

  test('mover un paso', () => {
    expect(moverPlan([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moverPlan([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('componente (%s)', (idioma) => {
  beforeEach(() => {
    respuesta = { data: filas, error: null };
    eq.mockClear();
  });

  test('lista con estrella y ojo; escribe solo el contenido de la sección', async () => {
    const onCambiar = jest.fn();
    render(<EditorPlanesMembresia organizationId={120} contenido={{ title: 'T' }} onCambiarContenido={onCambiar} />, { idioma });
    await waitFor(() => expect(document.querySelector('[data-editor-planes-membresia="lista"]')).not.toBeNull());
    expect(eq).toHaveBeenCalledWith('organization_id', 120);
    expect(document.querySelectorAll('li[data-plan]').length).toBe(4);
    expect(document.querySelector('[data-plan-inactivo="4"]')).not.toBeNull();
    const estrellas = screen.getAllByRole('button', { pressed: false }).filter((b) => b.querySelector('svg.lucide-star'));
    fireEvent.click(estrellas[0]);
    expect(onCambiar).toHaveBeenLastCalledWith({ title: 'T', popular_plan_id: 5 });
    const ojo = document.querySelector('li[data-plan="2"] button[aria-pressed="true"]') as HTMLButtonElement;
    fireEvent.click(ojo);
    expect(onCambiar).toHaveBeenLastCalledWith({ title: 'T', hidden_plan_ids: [2] });
    const bajar = document.querySelectorAll('li[data-plan="5"] button')[1] as HTMLButtonElement;
    fireEvent.click(bajar);
    expect(onCambiar).toHaveBeenLastCalledWith({ title: 'T', plan_order: [2, 5, 1, 3] });
  });

  test('sin planes activos: aviso, crear plan y la página no se ve', async () => {
    respuesta = { data: [filas[3]], error: null };
    render(<EditorPlanesMembresia organizationId={120} contenido={{}} onCambiarContenido={jest.fn()} />, { idioma });
    await waitFor(() => expect(document.querySelector('[data-editor-planes-membresia="vacio"]')).not.toBeNull());
    const crear = document.querySelector('a[href="/app/membresias/planes"]');
    expect(crear).not.toBeNull();
    expect(document.querySelector('[data-plan-inactivo="4"]')).not.toBeNull();
  });
});
