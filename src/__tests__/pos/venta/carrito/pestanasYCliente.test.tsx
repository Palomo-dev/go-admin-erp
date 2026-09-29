/**
 * @jest-environment jsdom
 *
 * Paso 8: pestañas de carritos (Ctrl+N, Ctrl+Tab, cerrar con confirmación
 * solo con más de uno) y el selector de cliente sobre `CustomerPicker` del kit
 * (misma API: busca en el servicio, elige, quita, crea).
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { Cart, Customer } from '@/components/pos/types';

const buscarClientesPagina = jest.fn();
jest.mock('@/lib/services/posService', () => ({
  POSService: { buscarClientesPagina: (...a: unknown[]) => buscarClientesPagina(...a), usesLocalCatalog: () => false },
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', decimals: 0, locale: 'es-CO', formatear: (n: number) => `$ ${n}` }),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 1 } }), getCurrentBranchIdWithFallback: () => 3 }));
jest.mock('@/lib/supabase/config', () => {
  const vacio = { data: [], error: null };
  const cadena: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) cadena[m] = () => cadena;
  cadena.limit = async () => vacio;
  (cadena as { then: unknown }).then = (r: (v: unknown) => unknown) => Promise.resolve(vacio).then(r);
  return { supabase: { from: () => cadena } };
});
jest.mock('@/components/shared/form-dialogs', () => ({ ClienteFormDialog: ({ open }: { open: boolean }) => (open ? <div>formulario-cliente</div> : null) }));
jest.mock('@/components/pos/OfflineCustomerDialog', () => ({ OfflineCustomerDialog: () => null }));

import { CartTabs } from '@/components/pos/CartTabs';
import { CustomerSelector } from '@/components/pos/CustomerSelector';

const carrito = (id: string, extra: Partial<Cart> = {}) => ({ id, status: 'active', total: 0, items: [], ...extra }) as unknown as Cart;

describe('CartTabs', () => {
  test('Ctrl+N crea; Ctrl+Tab pasa al siguiente; la pestaña dice cliente o «Carrito N»', async () => {
    const onNew = jest.fn(async () => undefined);
    const onSelect = jest.fn();
    renderConIdioma(
      <CartTabs
        carts={[carrito('a'), carrito('b', { customer: { full_name: 'Ana Gómez' } as Customer, total: 5000, items: [{ id: 'l' }] as Cart['items'] })]}
        activeCartId="a"
        onCartSelect={onSelect}
        onNewCart={onNew}
        onRemoveCart={jest.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: /Carrito 1/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Ana/ })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'n', ctrlKey: true });
    });
    expect(onNew).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: 'Tab', ctrlKey: true });
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  test('cerrar pide confirmación y solo existe con más de un carrito', () => {
    const onRemove = jest.fn();
    const { rerender } = renderConIdioma(
      <CartTabs carts={[carrito('a'), carrito('b')]} activeCartId="a" onCartSelect={jest.fn()} onNewCart={jest.fn()} onRemoveCart={onRemove} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Carrito 2' }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar carrito' }));
    expect(onRemove).toHaveBeenCalledWith('b');
    rerender(<CartTabs carts={[carrito('a')]} activeCartId="a" onCartSelect={jest.fn()} onNewCart={jest.fn()} onRemoveCart={onRemove} />);
    expect(screen.queryByRole('button', { name: /Cerrar Carrito/ })).toBeNull();
  });
});

describe('CustomerSelector sobre CustomerPicker', () => {
  test('busca en el servicio, elige el cliente completo y lo puede quitar', async () => {
    const ana = { id: 'c1', full_name: 'Ana Gómez', email: 'ana@x.co', doc_type: 'CC', doc_number: '123' } as Customer;
    buscarClientesPagina.mockResolvedValue({ filas: [ana], total: 1 });
    const onSelect = jest.fn();
    renderConIdioma(<CustomerSelector onCustomerSelect={onSelect} open onOpenChange={jest.fn()} />);
    const opcion = await screen.findByRole('option', { name: /Ana Gómez/ });
    expect(buscarClientesPagina).toHaveBeenCalledWith(undefined, { desde: 0 });
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull();
    fireEvent.click(opcion);
    expect(onSelect).toHaveBeenCalledWith(ana);
  });

  test('más coincidencias que las mostradas: «Mostrando 20 de 57 · Ver más» trae la página siguiente', async () => {
    const pagina = (desde: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `c${desde + i}`, full_name: `Valentina ${String(desde + i).padStart(2, '0')}` }) as Customer);
    buscarClientesPagina.mockImplementation(async (_t: unknown, { desde }: { desde: number }) =>
      desde === 0 ? { filas: pagina(0, 20), total: 57 } : { filas: pagina(desde, 20), total: 57 },
    );
    renderConIdioma(<CustomerSelector onCustomerSelect={jest.fn()} open onOpenChange={jest.fn()} />);
    expect(await screen.findByText('Mostrando 20 de 57')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(await screen.findByText('Mostrando 40 de 57')).toBeTruthy();
    expect(buscarClientesPagina).toHaveBeenLastCalledWith(undefined, { desde: 20 });
    expect(screen.getAllByRole('option')).toHaveLength(40);
  });

  test('si la búsqueda falla se ve el error con «Reintentar» (no una lista vacía muda)', async () => {
    const ana = { id: 'c1', full_name: 'Ana Gómez' } as Customer;
    buscarClientesPagina.mockRejectedValueOnce(new Error('sin red')).mockResolvedValue({ filas: [ana], total: 1 });
    renderConIdioma(<CustomerSelector onCustomerSelect={jest.fn()} open onOpenChange={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('option', { name: /Ana Gómez/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  test('con cliente elegido: «Quitar» manda undefined', () => {
    const onSelect = jest.fn();
    renderConIdioma(<CustomerSelector selectedCustomer={{ id: 'c1', full_name: 'Ana Gómez' } as Customer} onCustomerSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }));
    expect(onSelect).toHaveBeenCalledWith(undefined, undefined);
  });

  test('solo el POS de venta: «Ver» y «Editar» abren la ficha del cliente en una pestaña nueva', () => {
    const abrir = jest.spyOn(window, 'open').mockImplementation(() => null);
    const ana = { id: 'c1', full_name: 'Ana Gómez' } as Customer;
    const { rerender } = renderConIdioma(<CustomerSelector selectedCustomer={ana} onCustomerSelect={jest.fn()} accionesFichaEnPestanaNueva />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver: Ana Gómez' }));
    expect(abrir).toHaveBeenLastCalledWith('/app/clientes/c1', '_blank', 'noopener');
    fireEvent.click(screen.getByRole('button', { name: 'Editar: Ana Gómez' }));
    expect(abrir).toHaveBeenLastCalledWith('/app/clientes/c1/editar', '_blank', 'noopener');

    // Un cliente creado sin conexión todavía no tiene ficha en el servidor.
    rerender(<CustomerSelector selectedCustomer={{ ...ana, pending_sync: true }} onCustomerSelect={jest.fn()} accionesFichaEnPestanaNueva />);
    expect(screen.queryByRole('button', { name: /^Ver:/ })).toBeNull();

    // PMS y mesas no pasan la prop: sin «Ver» ni «Editar».
    rerender(<CustomerSelector selectedCustomer={ana} onCustomerSelect={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /^Ver:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Editar:/ })).toBeNull();
    abrir.mockRestore();
  });

  test('«Crear cliente» abre el formulario completo', async () => {
    buscarClientesPagina.mockResolvedValue({ filas: [], total: 0 });
    renderConIdioma(<CustomerSelector onCustomerSelect={jest.fn()} open onOpenChange={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Crear cliente' }));
    await waitFor(() => expect(screen.getByText('formulario-cliente')).toBeTruthy());
  });
});
