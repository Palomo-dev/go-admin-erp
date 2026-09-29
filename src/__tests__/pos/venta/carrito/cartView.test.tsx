/**
 * @jest-environment jsdom
 *
 * CartView (paso 7): botonera con el kit, D4 (sin caja «Abrir caja para
 * cobrar · F9» solo si la organización la exige), atajos F4/F6/F7, espera y
 * deuda en `Dialogo`, y «Anular» la deuda con motivo (`DialogoMotivo`) que
 * llega a `POSService.cancelDebtWithCreditNote(cartId, motivo)`.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { Cart, Customer } from '@/components/pos/types';

const cancelDebtWithCreditNote = jest.fn();
const holdCart = jest.fn();
jest.mock('@/lib/services/posService', () => ({
  POSService: {
    getFrequentDiscounts: jest.fn(async () => []),
    cancelDebtWithCreditNote: (...a: unknown[]) => cancelDebtWithCreditNote(...a),
    holdCart: (...a: unknown[]) => holdCart(...a),
    activateCart: jest.fn(),
    updateCartTaxSettings: jest.fn(async (id: string) => ({ id })),
  },
}));
jest.mock('@/lib/services/printService', () => ({ PrintService: {} }));
jest.mock('@/lib/services/kitchenService', () => ({ __esModule: true, default: { getKitchenTickets: jest.fn(async () => []) } }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn() } }));
jest.mock('@/components/pos/TaxSummary', () => ({ TaxSummary: () => <div>resumen</div> }));
jest.mock('@/hooks/useLineasSinImpuesto', () => ({ useLineasSinImpuesto: () => ({ indices: new Set<number>() }) }));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ setTotals: jest.fn(), setMode: jest.fn() }) }));
jest.mock('@/components/finanzas/facturas-venta/detalle/DetalleFacturaVenta', () => ({ DetalleFacturaVenta: () => null }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useOrgTimezone: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', decimals: 0, locale: 'es-CO', formatear: (n: number) => `$ ${n}` }),
}));
jest.mock('@/components/pos/CachedProductImage', () => ({ CachedProductImage: () => null }));
jest.mock('@/components/pos/cocina/ChipsNotasRapidas', () => ({ ChipsNotasRapidas: () => null }));

import { CartView } from '@/components/pos/CartView';

const carrito = (extra: Partial<Cart> = {}): Cart =>
  ({
    id: 'c1',
    organization_id: 1,
    branch_id: 3,
    status: 'active',
    total: 11900,
    discount_total: 0,
    items: [{ id: 'l1', product_id: 1, product: { id: 1, name: 'Café', sku: 'C1', unit_code: 'und' }, quantity: 1, unit_price: 10000, total: 11900, tax_amount: 1900 }],
    ...extra,
  }) as unknown as Cart;

function montar(props: Partial<React.ComponentProps<typeof CartView>> = {}) {
  const p = { cart: carrito(), onCartUpdate: jest.fn(), onCheckout: jest.fn(), onHold: jest.fn(), ...props };
  renderConIdioma(<CartView {...p} />);
  return p;
}

beforeEach(() => jest.clearAllMocks());

describe('CartView · cabecera (Figma 906:115576-80)', () => {
  test('«Carrito · N productos» y, con cliente, «Cliente: X» a la derecha', () => {
    const lineas = [
      ...carrito().items,
      { id: 'l2', product_id: 2, product: { id: 2, name: 'Pan', sku: 'P1', unit_code: 'und' }, quantity: 3, unit_price: 1000, total: 3000, tax_amount: 0 },
    ] as Cart['items'];
    montar({ cart: carrito({ items: lineas, customer: { id: 'c1', full_name: 'Ana Gómez' } as Customer }) });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Carrito');
    expect(screen.getByText(/2 productos/)).toBeTruthy();
    expect(screen.getByText('Cliente: Ana Gómez')).toBeTruthy();
  });

  test('sin cliente no hay «Cliente:»; una línea va en singular; vacío no hay conteo', () => {
    const { rerender } = renderConIdioma(<CartView cart={carrito()} onCartUpdate={jest.fn()} onCheckout={jest.fn()} onHold={jest.fn()} />);
    expect(screen.getByText(/1 producto$/)).toBeTruthy();
    expect(screen.queryByText(/^Cliente:/)).toBeNull();
    rerender(<CartView cart={carrito({ items: [], total: 0 })} onCartUpdate={jest.fn()} onCheckout={jest.fn()} onHold={jest.fn()} />);
    expect(screen.queryByText(/\d+ productos?$/)).toBeNull();
  });
});

describe('CartView · cobrar y caja (D4)', () => {
  test('con caja: «Cobrar» con el total; F4 cobra', () => {
    const p = montar({ cashSessionActive: true });
    fireEvent.click(screen.getByRole('button', { name: /^Cobrar/ }));
    expect(p.onCheckout).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: 'F4' });
    expect(p.onCheckout).toHaveBeenCalledTimes(2);
  });

  test('sin caja y la organización la exige: «Abrir caja para cobrar» (y F4) abren la caja', () => {
    const onAbrirCaja = jest.fn();
    const p = montar({ cashSessionActive: false, requiereCaja: true, onAbrirCaja });
    fireEvent.click(screen.getByRole('button', { name: /Abrir caja para cobrar/ }));
    fireEvent.keyDown(document.body, { key: 'F4' });
    expect(onAbrirCaja).toHaveBeenCalledTimes(2);
    expect(p.onCheckout).not.toHaveBeenCalled();
  });

  test('sin caja y la organización NO la exige: se cobra', () => {
    const p = montar({ cashSessionActive: false, requiereCaja: false });
    fireEvent.click(screen.getByRole('button', { name: /^Cobrar/ }));
    expect(p.onCheckout).toHaveBeenCalledTimes(1);
  });

  test('con los atajos apagados (cobro abierto) F4 no hace nada', () => {
    const p = montar({ cashSessionActive: true, atajosActivos: false });
    fireEvent.keyDown(document.body, { key: 'F4' });
    expect(p.onCheckout).not.toHaveBeenCalled();
  });
});

describe('CartView · espera y deuda', () => {
  test('F6 abre «Poner el carrito en espera» y confirma con el motivo', async () => {
    holdCart.mockResolvedValue(carrito({ status: 'hold' }));
    const p = montar();
    fireEvent.keyDown(document.body, { key: 'F6' });
    fireEvent.change(await screen.findByLabelText(/Motivo/), { target: { value: 'fue por dinero' } });
    fireEvent.click(screen.getByRole('button', { name: 'Poner en espera' }));
    await waitFor(() => expect(holdCart).toHaveBeenCalledWith('c1', 'fue por dinero'));
    expect(p.onHold).toHaveBeenCalled();
  });

  test('«Deuda» sin cliente queda deshabilitada con el motivo', () => {
    montar();
    const deuda = screen.getByRole('button', { name: /^Deuda/ }) as HTMLButtonElement;
    expect(deuda.disabled).toBe(true);
    expect(deuda.title).toBe('Asigna un cliente para registrar la deuda');
  });

  test('en espera: «Reactivar» y el cobro bloqueado con su motivo', () => {
    montar({ cart: carrito({ status: 'hold' }) });
    expect(screen.getByRole('button', { name: /Reactivar/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Cobrar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('El carrito está en espera: reactívalo para cobrar')).toBeTruthy();
  });

  test('con deuda: «Anular» pide motivo y llama a la RPC con él', async () => {
    cancelDebtWithCreditNote.mockResolvedValue({ cart: carrito({ status: 'cancelled' }), creditNote: { id: 'n', number: 'NC-1' }, avisos: [] });
    const p = montar({ cart: carrito({ status: 'hold_with_debt', customer_id: 'x' }) });
    fireEvent.click(screen.getByRole('button', { name: /Anular/ }));
    const motivo = await screen.findByRole('textbox');
    fireEvent.change(motivo, { target: { value: 'cliente pagó por transferencia' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Anular deuda' }));
    });
    await waitFor(() => expect(cancelDebtWithCreditNote).toHaveBeenCalledWith('c1', expect.stringContaining('cliente pagó por transferencia')));
    expect(p.onCartUpdate).toHaveBeenCalled();
  });

  test('con deuda: «Cobrar deuda» no exige caja', () => {
    const p = montar({ cart: carrito({ status: 'hold_with_debt', customer_id: 'x' }), cashSessionActive: false });
    fireEvent.click(screen.getByRole('button', { name: /Cobrar deuda/ }));
    expect(p.onCheckout).toHaveBeenCalledTimes(1);
  });
});
