/**
 * @jest-environment jsdom
 *
 * El texto de búsqueda no es el NIT. Se guarda el documento al elegir una
 * fila, o el NIT escrito cuando no hay resultados y se confirma.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { SelectorTercero } from '@/components/finanzas/movimientos/SelectorTercero';

const mockBuscar = jest.fn();
const mockLimit = jest.fn();

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 140,
}));

jest.mock('@/lib/services/customers/busquedaClientesService', () => ({
  buscarClientes: (...args: unknown[]) => mockBuscar(...args),
}));

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            or: () => ({
              limit: () => mockLimit(),
            }),
          }),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  mockBuscar.mockReset();
  mockLimit.mockReset();
  mockLimit.mockResolvedValue({ data: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

function montar(onChange = jest.fn(), nit = '', nombre = '') {
  render(
    <SelectorTercero
      nit={nit}
      nombre={nombre}
      onChange={onChange}
      placeholder="Buscar"
      usarNit={(documento) => `Usar NIT ${documento}`}
      sinResultados="Sin resultados"
    />,
  );
  return onChange;
}

test('escribir un nombre no lo guarda como NIT', async () => {
  mockBuscar.mockResolvedValue({ filas: [] });
  const onChange = montar();
  fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'Ana Pérez' } });
  expect(onChange).not.toHaveBeenCalled();
  expect(await screen.findByText('Sin resultados')).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});

test('elegir un resultado guarda el NIT del tercero, no el texto buscado', async () => {
  mockBuscar.mockResolvedValue({
    filas: [{ identification_number: '900111222', full_name: 'Ana Pérez' }],
  });
  const onChange = montar();
  fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'Ana' } });
  fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith({ nit: '900111222', nombre: 'Ana Pérez' });
});

test('sin resultados ofrece usar el NIT escrito', async () => {
  mockBuscar.mockResolvedValue({ filas: [] });
  const onChange = montar();
  fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: '900333444' } });
  expect(await screen.findByText('Sin resultados')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Usar NIT 900333444' }));
  expect(onChange).toHaveBeenCalledWith({ nit: '900333444', nombre: '' });
});

test('cambiar el texto suelta el NIT ya elegido', () => {
  mockBuscar.mockResolvedValue({ filas: [] });
  const onChange = montar(jest.fn(), '900111222', 'Ana Pérez');
  fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'Otro' } });
  expect(onChange).toHaveBeenCalledWith({ nit: '', nombre: '' });
});

test('no muestra «sin resultados» mientras la búsqueda sigue en curso', () => {
  jest.useFakeTimers();
  mockBuscar.mockReturnValue(new Promise(() => undefined));
  montar();
  fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'Ana' } });
  jest.advanceTimersByTime(249);
  expect(screen.queryByText('Sin resultados')).toBeNull();
  expect(screen.queryByRole('button', { name: /Usar NIT/ })).toBeNull();
});
