/**
 * @jest-environment jsdom
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { documentoTexto } from '@/components/finanzas/documento/documentoTexto';
import { ThirdPartyPicker } from '../ThirdPartyPicker';
import type { TerceroElegido, TerceroLista } from '../terceroPickerLogica';

const juan: TerceroLista = {
  tipo: 'cliente',
  id: 'c1',
  nit: null,
  dv: null,
  nombre: 'Juan Pérez',
  email: 'juan@example.com',
  documento: null,
};

const proveedor: TerceroLista = {
  tipo: 'proveedor',
  id: '9',
  nit: '900123456',
  dv: '8',
  nombre: 'Juan Proveedor',
  email: 'compras@example.com',
  documento: documentoTexto('nit', '900123456', '8'),
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function buscarJuan(texto: string) {
  if (texto === 'Juan') return { items: [juan, proveedor], total: 2 };
  return { items: [] as TerceroLista[], total: 0 };
}

describe('ThirdPartyPicker', () => {
  it('escribir no llama onCambiar; elegir sí, y muestra badge, documento y correo', async () => {
    const onCambiar = jest.fn();
    const buscar = jest.fn(async (texto: string) => buscarJuan(texto));
    renderConIdioma(<ThirdPartyPicker valor={null} onCambiar={onCambiar} abierto buscar={buscar} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre, NIT o email'), { target: { value: 'Juan' } });
    await act(async () => {
      jest.advanceTimersByTime(249);
    });
    expect(buscar).not.toHaveBeenCalledWith('Juan', expect.anything(), expect.anything(), 0);
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByText('Juan Pérez').textContent).toBe('Juan Pérez');
    expect(screen.getByText('Cliente').textContent).toBe('Cliente');
    expect(screen.getByText('Proveedor').textContent).toBe('Proveedor');
    expect(screen.getByText('juan@example.com').textContent).toBe('juan@example.com');
    expect(screen.getByText(documentoTexto('nit', '900123456', '8')!).textContent).toContain('900');

    fireEvent.click(screen.getByRole('option', { name: /Juan Pérez/ }));
    expect(onCambiar).toHaveBeenCalledWith({ tipo: 'cliente', id: 'c1', nit: null, dv: null, nombre: 'Juan Pérez' });
  });

  it('un DV inválido no se elige; uno válido pide el nombre y no usa el texto de búsqueda', async () => {
    const onCambiar = jest.fn();
    const buscar = jest.fn(async () => ({ items: [] as TerceroLista[], total: 0 }));
    renderConIdioma(<ThirdPartyPicker valor={null} onCambiar={onCambiar} abierto buscar={buscar} />);
    await act(async () => {
      await Promise.resolve();
    });
    const input = screen.getByPlaceholderText('Buscar por nombre, NIT o email');

    fireEvent.change(input, { target: { value: '900123456-7' } });
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });
    const rechazado = screen.getByRole('option', { name: /Usar NIT/ });
    expect(rechazado.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(rechazado);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nombre')).toBeNull();

    fireEvent.change(input, { target: { value: '900123456' } });
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('option', { name: /Usar NIT/ }));
    const nombre = screen.getByLabelText('Nombre') as HTMLInputElement;
    expect(nombre.value).toBe('');
    fireEvent.change(nombre, { target: { value: 'Ana Ruiz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar este NIT' }));

    const elegido: TerceroElegido = onCambiar.mock.calls[0][0];
    expect(elegido).toEqual({ tipo: 'nit', id: null, nit: '900123456', dv: '8', nombre: 'Ana Ruiz' });
    expect(elegido.nombre).not.toBe('900123456');
  });

  it('una respuesta vieja no pisa a la nueva', async () => {
    const pendientes: { texto: string; resolve: (v: { items: TerceroLista[]; total: number }) => void }[] = [];
    const buscar = jest.fn(
      (texto: string) =>
        new Promise<{ items: TerceroLista[]; total: number }>((resolve) => {
          pendientes.push({ texto, resolve });
        }),
    );
    renderConIdioma(<ThirdPartyPicker valor={null} onCambiar={jest.fn()} abierto buscar={buscar} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre, NIT o email'), { target: { value: 'Juan' } });
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    const vieja = pendientes.find((p) => p.texto === '');
    const nueva = pendientes.find((p) => p.texto === 'Juan');
    await act(async () => {
      nueva?.resolve({ items: [juan], total: 1 });
      vieja?.resolve({
        items: [{ tipo: 'empleado', id: 'u9', nit: null, dv: null, nombre: 'Registro viejo', email: null, documento: null }],
        total: 1,
      });
      await Promise.resolve();
    });

    expect(screen.getByText('Juan Pérez').textContent).toBe('Juan Pérez');
    expect(screen.queryByText('Registro viejo')).toBeNull();
  });

  it('muestra el error con Reintentar', async () => {
    const buscar = jest.fn(async () => {
      throw new Error('red');
    });
    renderConIdioma(<ThirdPartyPicker valor={null} onCambiar={jest.fn()} abierto buscar={buscar} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' }).textContent).toBe('Reintentar');
  });
});
