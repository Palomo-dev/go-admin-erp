/**
 * @jest-environment jsdom
 *
 * Cobro del POS · paso 11 del rediseño (POS-PLAN §4): `CheckoutDialog` sobre
 * `CobroPanel` (PanelAdaptable 1120) con los servicios simulados. Se prueba
 * el contenedor, no la lógica (que tiene sus pruebas puras): abre, elige
 * método, agrega pago, «Falta», «Completar venta» llama a `POSService.checkout`
 * una sola vez aunque se pulse dos veces, Esc cierra, Enter solo completa con
 * el pago cubierto y el error llega como aviso sin tocar el carrito.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { Cart, Sale } from '@/components/pos/types';

const mockCheckout = jest.fn();
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };

jest.mock('sonner', () => ({ toast: mockToast }));
jest.mock('@/lib/services/posService', () => ({
  POSService: {
    getPaymentMethods: jest.fn(async () => [
      { id: 'cash', code: 'cash', name: 'Efectivo', type: 'cash', is_active: true },
      { id: 'card', code: 'card', name: 'Tarjeta', type: 'card', is_active: true },
      { id: 'transfer', code: 'transfer', name: 'Transferencia', type: 'transfer', is_active: true },
    ]),
    getBaseCurrency: jest.fn(async () => ({ code: 'USD', name: 'Dólar', symbol: '$' })),
    getOrganizationTaxes: jest.fn(async () => []),
    getOrganizationMembers: jest.fn(async () => []),
    getProductTaxes: jest.fn(async () => []),
    checkout: (...args: unknown[]) => mockCheckout(...args),
  },
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => {
  const { contextoMoneda } = jest.requireActual('@/lib/utils/moneda') as typeof import('@/lib/utils/moneda');
  const ctx = contextoMoneda('USD', { decimals: 0, locale: 'es-CO' });
  const valor = { ...ctx, resuelta: true, formatear: (n: number) => String(n), paraDocumento: () => ctx };
  return { useMonedaOrganizacion: () => valor };
});
jest.mock('@/lib/hooks/useCommissionRate', () => ({ useCommissionRate: () => ({ resolveRate: jest.fn(async () => null) }) }));
jest.mock('@/lib/hooks/useElectronicInvoicePreference', () => ({ useElectronicInvoicePreference: () => ({ alwaysEnabled: false }) }));
jest.mock('@/hooks/useMobileNative', () => ({ useMobileNative: () => ({ hapticNotification: jest.fn(), hapticImpact: jest.fn() }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useOrgTimezone: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('@/hooks/useLineasSinImpuesto', () => ({ useLineasSinImpuesto: () => ({ sinImpuesto: [] }) }));
jest.mock('@/components/shared/AvisoSinImpuesto', () => ({ AvisoSinImpuesto: () => null }));
jest.mock('@/components/finanzas/facturacion-electronica', () => ({ ElectronicInvoiceToggle: () => null }));
jest.mock('@/lib/services/electronicInvoicingService', () => ({ electronicInvoicingService: {} }));
jest.mock('@/components/pos/cajas/CajasService', () => ({ CajasService: { getActiveSession: jest.fn(async () => ({ id: 1 })) } }));
jest.mock('@/components/pos/configuracion/configuracionService', () => ({
  ConfiguracionService: { getRequireCashSessionConfig: jest.fn(async () => ({ require_cash_session: false })) },
}));
jest.mock('@/components/pos/SerialSelectorDialog', () => ({ SerialSelectorDialog: () => null }));
jest.mock('@/components/shared/QrPaymentDialog', () => ({ QrPaymentDialog: () => null }));
jest.mock('@/components/pos/display/TipFromDisplayNotice', () => ({ TipFromDisplayNotice: () => null }));
jest.mock('@/components/pos/display/useCustomerDisplayPresence', () => ({ useCustomerDisplayPresence: () => ({ connected: false, emitting: false }) }));
jest.mock('@/lib/pos/display/posDisplay', () => {
  const emisor = { setPayment: jest.fn(), setTipBase: jest.fn(), setMode: jest.fn(), skipTip: jest.fn(), onUp: jest.fn(() => () => undefined) };
  return { getPosDisplayEmitter: () => emisor };
});
jest.mock('@/lib/services/compositeStockValidation', () => ({ validateCompositeStock: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/services/printService', () => ({ PrintService: { printTicket: jest.fn(), getBusinessAndBranch: jest.fn(async () => ({})) } }));
jest.mock('@/lib/services/printJobsService', () => ({
  PrintJobsService: { enqueueSaleTicket: jest.fn(async () => ({ enqueued: 1 })), enqueueElectronicInvoice: jest.fn(async () => ({ enqueued: 0 })) },
}));
jest.mock('@/lib/services/cashDrawerService', () => ({ CashDrawerService: { open: jest.fn(async () => undefined) } }));
jest.mock('@/lib/services/transportService', () => ({ transportService: { getDrivers: jest.fn(async () => []) } }));
jest.mock('@/lib/utils/desktop', () => ({ ...jest.requireActual('@/lib/utils/desktop'), isDesktop: () => false }));

import { CheckoutDialog } from '@/components/pos/CheckoutDialog';
import { accionAtajoMetodo, enterCompletaVenta } from '@/components/pos/venta/cobro/teclasCobro';
import { SelectorMetodoPago } from '@/components/kit/SelectorMetodoPago';

describe('SelectorMetodoPago · «Otro» con atajo y menú controlado (props aditivas del paso 11)', () => {
  test('con seis métodos y cinco botones: cuatro + «Otro · Alt+5», que la pantalla abre', () => {
    const metodos = ['cash', 'card', 'transfer', 'nequi', 'wompi', 'bono'].map((c) => ({ codigo: c, nombre: c.toUpperCase() }));
    const onMenu = jest.fn();
    const { rerender } = renderConIdioma(
      <SelectorMetodoPago metodos={metodos} valor="cash" onValorChange={jest.fn()} maxBotones={5} atajos menuAbierto={false} onMenuAbiertoChange={onMenu} />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    const otro = screen.getByRole('button', { name: 'Otro' });
    expect(otro.getAttribute('aria-keyshortcuts')).toBe('Alt+5');
    rerender(<SelectorMetodoPago metodos={metodos} valor="cash" onValorChange={jest.fn()} maxBotones={5} atajos menuAbierto onMenuAbiertoChange={onMenu} />);
    expect(screen.getByRole('menuitemradio', { name: 'BONO' })).toBeTruthy();
  });
});

describe('teclas del cobro (sin React)', () => {
  test('Enter: vale desde el monto o el fondo; no desde botones, radios, menús ni otros campos', () => {
    document.body.innerHTML = '<div role="dialog"><input data-cobro-monto="" /><input id="dir" /><button>x</button><div role="radio">r</div><span id="s">t</span></div>';
    expect(enterCompletaVenta(document.querySelector('[data-cobro-monto]'))).toBe(true);
    expect(enterCompletaVenta(document.getElementById('s'))).toBe(true);
    expect(enterCompletaVenta(document.body)).toBe(true);
    expect(enterCompletaVenta(null)).toBe(true);
    expect(enterCompletaVenta(document.getElementById('dir'))).toBe(false);
    expect(enterCompletaVenta(document.querySelector('button'))).toBe(false);
    expect(enterCompletaVenta(document.querySelector('[role="radio"]'))).toBe(false);
    document.body.innerHTML = '';
  });

  test('Alt+n por posición; la tecla siguiente al último botón abre «Otro» si lo hay', () => {
    const visibles = [{ codigo: 'cash' }, { codigo: 'card' }, { codigo: 'transfer' }, { codigo: 'nequi' }];
    expect(accionAtajoMetodo(0, visibles, true)).toEqual({ tipo: 'elegir', codigo: 'cash' });
    expect(accionAtajoMetodo(4, visibles, true)).toEqual({ tipo: 'otro' });
    expect(accionAtajoMetodo(4, visibles, false)).toBeNull();
    expect(accionAtajoMetodo(3, visibles.slice(0, 2), false)).toBeNull();
    expect(accionAtajoMetodo(-1, visibles, true)).toBeNull();
  });
});

const CARRITO = {
  id: 'carrito-1',
  organization_id: 120,
  branch_id: 3,
  items: [
    { id: 'l1', product_id: 7, product: { id: 7, name: 'Café' }, quantity: 2, unit_price: 11900, total: 23800, discount_amount: 0 },
  ],
  subtotal: 23800,
  tax_total: 0,
  discount_total: 0,
  total: 23800,
  tax_included: false,
  status: 'active',
} as unknown as Cart;

const VENTA = { id: 'venta-000000001', organization_id: 120, total: 23800 } as unknown as Sale;

async function abrirCobro(props: Partial<Parameters<typeof CheckoutDialog>[0]> = {}) {
  const onOpenChange = jest.fn();
  const onCheckoutComplete = jest.fn();
  renderConIdioma(<CheckoutDialog cart={CARRITO} open onOpenChange={onOpenChange} onCheckoutComplete={onCheckoutComplete} {...props} />);
  // Métodos de la organización cargados y primer pago agregado por el total.
  await screen.findByRole('radio', { name: /Tarjeta/ });
  await waitFor(() => expect(completar().disabled).toBe(false));
  return { onOpenChange, onCheckoutComplete };
}

const completar = () => screen.getByRole('button', { name: /Completar venta/ }) as HTMLButtonElement;
const monto = () => screen.getByLabelText(/Monto del pago/) as HTMLInputElement;

beforeEach(() => {
  mockCheckout.mockReset();
  Object.values(mockToast).forEach((f) => f.mockReset());
});

describe('Cobro · contenedor (paso 11)', () => {
  test('abre como diálogo con el total, los métodos de la organización con Alt+n y el primer pago por el total', async () => {
    await abrirCobro();
    const dialogo = screen.getByRole('dialog', { name: 'Procesar pago' });
    expect(within(dialogo).getByTestId('cobro-total-a-pagar').textContent).toContain('23.800');
    const efectivo = screen.getByRole('radio', { name: /Efectivo/ });
    expect(efectivo.getAttribute('aria-checked')).toBe('true');
    expect(efectivo.getAttribute('aria-keyshortcuts')).toBe('Alt+1');
    expect(screen.getByRole('radio', { name: /Transferencia/ }).getAttribute('aria-keyshortcuts')).toBe('Alt+3');
    expect(monto().value).toBe('23800');
    expect(completar().getAttribute('aria-keyshortcuts')).toBe('Enter');
    // El foco inicial queda en el monto (no en la «×»): se teclea y Enter completa.
    expect(document.activeElement).toBe(monto());
  });

  test('elegir método cambia el del pago que se edita (clic y Alt+2)', async () => {
    await abrirCobro();
    fireEvent.click(screen.getByRole('radio', { name: /Tarjeta/ }));
    expect(screen.getByRole('radio', { name: /Tarjeta/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: /Editar el pago 1: Tarjeta/ })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: '3', code: 'Digit3', altKey: true });
    expect(screen.getByRole('button', { name: /Editar el pago 1: Transferencia/ })).toBeTruthy();
  });

  test('«Falta» deshabilita «Completar venta» con el motivo; «Agregar» cubre lo que falta', async () => {
    await abrirCobro();
    fireEvent.change(monto(), { target: { value: '10000' } });
    expect(completar().disabled).toBe(true);
    expect(screen.getByText(/Falta .*13\.800/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Agregar$/ }));
    // El pago nuevo entra por lo que falta y pasa a ser el que se edita.
    expect(monto().value).toBe('13800');
    expect(screen.getByRole('button', { name: /Editar el pago 2/ }).getAttribute('aria-pressed')).toBe('true');
    expect(completar().disabled).toBe(false);
  });

  test('«Exacto · Alt+E» pone lo que falta para el pago que se edita (D8)', async () => {
    await abrirCobro();
    fireEvent.change(monto(), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Agregar$/ }));
    fireEvent.change(monto(), { target: { value: '1' } });
    fireEvent.keyDown(document.body, { key: 'e', code: 'KeyE', altKey: true });
    expect(monto().value).toBe('13800');
    expect(screen.getByRole('button', { name: /Exacto/ }).getAttribute('aria-keyshortcuts')).toBe('Alt+E');
  });

  test('dos clics en «Completar venta» ⇒ un solo POSService.checkout; luego la post-venta', async () => {
    mockCheckout.mockResolvedValue(VENTA);
    await abrirCobro();
    await act(async () => {
      fireEvent.click(completar());
      fireEvent.click(completar());
    });
    await screen.findByText('¡Venta Completada!');
    expect(mockCheckout).toHaveBeenCalledTimes(1);
    expect(mockCheckout.mock.calls[0][0]).toMatchObject({ total_paid: 23800, payments: [{ method: 'cash', amount: 23800 }] });
  });

  test('Enter completa SOLO con el pago cubierto (y una sola vez aunque se repita)', async () => {
    mockCheckout.mockResolvedValue(VENTA);
    await abrirCobro();
    fireEvent.change(monto(), { target: { value: '10000' } });
    fireEvent.keyDown(monto(), { key: 'Enter' });
    expect(mockCheckout).not.toHaveBeenCalled();
    fireEvent.change(monto(), { target: { value: '30000' } });
    await act(async () => {
      fireEvent.keyDown(monto(), { key: 'Enter' });
      fireEvent.keyDown(monto(), { key: 'Enter' });
    });
    await screen.findByText('¡Venta Completada!');
    expect(mockCheckout).toHaveBeenCalledTimes(1);
  });

  test('Enter con el foco en un botón no completa (el botón hace lo suyo)', async () => {
    mockCheckout.mockResolvedValue(VENTA);
    await abrirCobro();
    const agregar = screen.getByRole('button', { name: /^Agregar$/ });
    agregar.focus();
    fireEvent.keyDown(agregar, { key: 'Enter' });
    expect(mockCheckout).not.toHaveBeenCalled();
  });

  test('Esc y «Cancelar · Esc» cierran el cobro sin cobrar', async () => {
    const { onOpenChange } = await abrirCobro();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const cancelar = screen.getByRole('button', { name: /Cancelar/ });
    expect(cancelar.getAttribute('aria-keyshortcuts')).toBe('Escape');
    fireEvent.click(cancelar);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(mockCheckout).not.toHaveBeenCalled();
  });

  test('si la RPC falla: aviso (no alert) y el cobro sigue abierto para reintentar; la venta no se entrega', async () => {
    mockCheckout.mockRejectedValue(new Error('sin conexión con el servidor'));
    const { onCheckoutComplete, onOpenChange } = await abrirCobro();
    await act(async () => {
      fireEvent.click(completar());
    });
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('No se pudo procesar el pago', { description: 'sin conexión con el servidor' }));
    expect(onCheckoutComplete).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await waitFor(() => expect(completar().disabled).toBe(false));
  });

  test('en inglés: título, botón y métodos de la organización', async () => {
    renderConIdioma(<CheckoutDialog cart={CARRITO} open onOpenChange={jest.fn()} onCheckoutComplete={jest.fn()} />, { idioma: 'en' });
    await screen.findByRole('radio', { name: /Tarjeta/ });
    expect(screen.getByRole('dialog', { name: 'Process payment' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Complete sale/ })).toBeTruthy();
  });
});
