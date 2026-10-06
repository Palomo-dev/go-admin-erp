/**
 * @jest-environment jsdom
 *
 * «Añadir sección» (Figma 05 Editor: 1732:878609, 1891:918129, 1891:918403, 1897:919594).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));
// Escritorio: diálogo con la lista de propósitos.
jest.mock('@/components/kit/useEsEscritorio', () => ({ useEsEscritorio: () => true }));

import AddSectionDialog from '../AddSectionDialog';

const contexto = { pagina: 'Inicio', despuesDe: 'Carta destacada', nombreSitio: 'Principal', enBorrador: true };

function abrir(props: Partial<React.ComponentProps<typeof AddSectionDialog>> = {}) {
  const onAdd = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <AddSectionDialog
      open
      onOpenChange={onOpenChange}
      onAdd={onAdd}
      branchType="restaurant"
      contexto={contexto}
      conteos={{ tipos_habitacion: 0, productos: 12 }}
      {...props}
    />,
  );
  return { onAdd, onOpenChange };
}

describe('AddSectionDialog', () => {
  // jsdom no implementa scrollIntoView.
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  test('muestra las recomendadas del tipo de la sede y todos los grupos', () => {
    abrir();
    expect(screen.getByText(/Se añade después de «Carta destacada» en Inicio/)).toBeTruthy();
    const recomendadas = screen.getByRole('region', { name: 'Recomendadas para tu negocio' });
    expect(within(recomendadas).getByRole('button', { name: /Carta completa/ })).toBeTruthy();
    // Un restaurante también ve Hospedaje: nada queda oculto.
    expect(screen.getByRole('region', { name: 'Hospedaje' })).toBeTruthy();
  });

  test('una sección sin datos se marca, avisa con acción y se añade de todas formas', () => {
    const { onAdd } = abrir();
    const hospedaje = screen.getByRole('region', { name: 'Hospedaje' });
    expect(within(hospedaje).getByText('Faltan datos')).toBeTruthy();
    fireEvent.click(within(hospedaje).getByRole('button', { name: /Habitaciones/ }));
    expect(screen.getByText('Habitaciones necesita habitaciones creadas en Hotel')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ir a Hotel/ }).getAttribute('href')).toBe('/app/pms/tipos-espacio');
    fireEvent.click(screen.getByRole('button', { name: /Añadir de todas formas/ }));
    expect(onAdd).toHaveBeenCalledWith('room_types', expect.any(String));
  });

  test('mientras los conteos cargan no marca «Faltan datos»', () => {
    abrir({ conteos: null });
    expect(screen.queryByText('Faltan datos')).toBeNull();
  });

  test('búsqueda sin resultados: mensaje, contador 0 de N y «Limpiar búsqueda»', () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Buscar sección'), { target: { value: 'piscina' } });
    expect(screen.getByText('Ninguna sección coincide con «piscina»')).toBeTruthy();
    expect(screen.getByText(/^0 de \d+ secciones coinciden$/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Añadir sección/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar búsqueda' })[0]);
    expect(screen.queryByText(/Ninguna sección coincide/)).toBeNull();
  });

  test('en una sede: título, chip «Solo esta sede» y botón a esa sede', () => {
    abrir({ contexto: { ...contexto, sede: 'Sede Norte' } });
    expect(screen.getByRole('heading', { name: /Añadir sección a Sede Norte/ })).toBeTruthy();
    expect(screen.getAllByText('Solo esta sede').length).toBeGreaterThan(0);
    expect(screen.getByText(/El sitio principal y las demás sedes no cambian/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Añadir sección a Sede Norte/ })).toBeTruthy();
  });
});
