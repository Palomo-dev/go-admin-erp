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
const mockEstadoFactura = jest.fn(async (): Promise<string | null> => null);
jest.mock('@/lib/pos/venta/cobro/facturaElectronicaCobro', () => ({
  ...jest.requireActual('@/lib/pos/venta/cobro/facturaElectronicaCobro'),
  leerEstadoFacturaElectronica: () => mockEstadoFactura(),
}));

import { CheckoutDialog } from '@/components/pos/CheckoutDialog';
import { POSService } from '@/lib/services/posService';
import { getPosDisplayEmitter } from '@/lib/pos/display/posDisplay';
import { PrintJobsService } from '@/lib/services/printJobsService';
import { PrintService } from '@/lib/services/printService';
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
    await screen.findByText('¡Venta completada!');
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
    await screen.findByText('¡Venta completada!');
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

describe('Post-venta (paso 13)', () => {
  async function vender(venta: Sale = VENTA) {
    mockCheckout.mockResolvedValue(venta);
    const props = await abrirCobro({ currentUser: { name: 'Cajera' } });
    await act(async () => {
      fireEvent.click(completar());
    });
    return props;
  }

  test('ResultadoOperacion con cifras, «Nueva venta · Enter» con el foco y el aviso del recibo enviado (sin badge «Nuevo»)', async () => {
    const { onCheckoutComplete, onOpenChange } = await vender();
    await screen.findByText('¡Venta completada!');
    expect(screen.getByText('Venta #00000001 registrada.')).toBeTruthy();
    const nueva = screen.getByRole('button', { name: /Nueva venta/ });
    expect(nueva.getAttribute('aria-keyshortcuts')).toBe('Enter');
    expect(document.activeElement).toBe(nueva);
    expect(screen.getByRole('button', { name: /Reimprimir/ }).getAttribute('aria-keyshortcuts')).toBe('P');
    // Sin CUFE no se ofrece la factura electrónica.
    expect(screen.queryByRole('button', { name: /Factura electrónica/ })).toBeNull();
    await screen.findByText('Recibo enviado a la impresora de caja.');
    expect(screen.queryByText('Nuevo')).toBeNull();
    fireEvent.click(nueva);
    expect(onCheckoutComplete).toHaveBeenCalledTimes(1);
    expect(onCheckoutComplete).toHaveBeenCalledWith(VENTA);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('«P» reimprime con el ticket de siempre (PrintService); Esc entrega la venta y cierra', async () => {
    (PrintService.printTicket as jest.Mock).mockClear();
    const { onCheckoutComplete } = await vender();
    await screen.findByText('¡Venta completada!');
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'p', code: 'KeyP' });
    });
    await waitFor(() => expect(PrintService.printTicket).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onCheckoutComplete).toHaveBeenCalledTimes(1);
  });

  test('sin impresora de caja: el aviso lo dice en la post-venta (no un toast)', async () => {
    (PrintJobsService.enqueueSaleTicket as jest.Mock).mockResolvedValueOnce({ enqueued: 0 });
    await vender();
    await screen.findByText(/No hay impresora de caja configurada para esta sucursal/);
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  test('sin conexión: «Pendiente de sincronizar · OFF-…» con el tono de advertencia', async () => {
    await vender({ ...VENTA, pending_sync: true, receipt_number_local: 'OFF-3F2A' } as Sale);
    await screen.findByText('Venta guardada sin conexión');
    expect(screen.getByText('Pendiente de sincronizar · OFF-3F2A')).toBeTruthy();
    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('OFF-3F2A'));
  });

  test('en portugués', async () => {
    mockCheckout.mockResolvedValue(VENTA);
    renderConIdioma(<CheckoutDialog cart={CARRITO} open onOpenChange={jest.fn()} onCheckoutComplete={jest.fn()} />, { idioma: 'pt' });
    await screen.findByRole('radio', { name: /Tarjeta/ });
    const concluir = screen.getByRole('button', { name: /Concluir venda/ }) as HTMLButtonElement;
    await waitFor(() => expect(concluir.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(concluir);
    });
    expect(await screen.findByText('Venda concluída!')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nova venda/ })).toBeTruthy();
  });
});

describe('Cobro · secciones plegables (paso 12)', () => {
  const seccion = (nombre: RegExp) => screen.getByRole('button', { name: nombre });

  beforeEach(() => {
    mockEstadoFactura.mockReset();
    mockEstadoFactura.mockResolvedValue(null);
  });

  test('cerradas al abrir, con su resumen y su atajo; Alt+D y Alt+P las abren', async () => {
    await abrirCobro();
    const entrega = seccion(/Entrega/);
    expect(entrega.getAttribute('aria-expanded')).toBe('false');
    expect(entrega.getAttribute('aria-keyshortcuts')).toBe('Alt+D');
    expect(entrega.textContent).toContain('Recoger en tienda');
    expect(seccion(/Propina/).textContent).toContain('Sin propina');
    expect(seccion(/Comisión de vendedor/).textContent).toContain('Sin vendedor');
    expect(seccion(/Comisión de vendedor/).getAttribute('aria-keyshortcuts')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'd', code: 'KeyD', altKey: true });
    expect(seccion(/Entrega/).getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'p', code: 'KeyP', altKey: true });
    expect(seccion(/Propina/).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Envío propio/ }));
    expect(seccion(/Entrega/).textContent).toContain('Envío propio');
  });

  test('propina 5 % y 10 % ANTES de impuestos, «otro valor» topado al 10 % y la misma base a la pantalla (D7)', async () => {
    (POSService.getOrganizationTaxes as jest.Mock).mockResolvedValueOnce([{ id: 'iva', name: 'IVA', rate: 19, is_default: true, is_active: true }]);
    // Sin abrirCobro(): con IVA el primer pago (precargado con el total del carrito) no cubre el total calculado.
    renderConIdioma(<CheckoutDialog cart={CARRITO} open onOpenChange={jest.fn()} onCheckoutComplete={jest.fn()} />);
    await screen.findByRole('radio', { name: /Tarjeta/ });
    // Subtotal 23.800 + IVA 19 % (4.522) = 28.322 a pagar.
    await waitFor(() => expect(screen.getByTestId('cobro-total-a-pagar').textContent).toContain('28.322'));
    fireEvent.keyDown(document.body, { key: 'p', code: 'KeyP', altKey: true });
    const botones = within(screen.getByRole('group', { name: 'Propina sugerida' })).getAllByRole('button');
    expect(botones.map((b) => b.textContent)).toEqual([expect.stringContaining('5 %'), expect.stringContaining('10 %')]);
    fireEvent.click(botones[1]);
    // 10 % de 23.800 (sin IVA) = 2.380, no 2.832 (10 % del total con IVA).
    expect(seccion(/Propina/).textContent).toMatch(/10 % · US\$\s2\.380/);
    expect(screen.getByTestId('cobro-total-a-pagar').textContent).toContain('30.702');
    expect(getPosDisplayEmitter().setTipBase).toHaveBeenLastCalledWith(23800);
    const otro = screen.getByLabelText('Otro valor') as HTMLInputElement;
    fireEvent.change(otro, { target: { value: '9000' } });
    expect(otro.value).toBe('2380');
    expect(screen.getByText(/Máximo .*2\.380 \(10 % antes de impuestos\)/)).toBeTruthy();
  });

  test('factura electrónica no configurada: deshabilitada con el motivo y Alt+F no la abre (E-30)', async () => {
    mockEstadoFactura.mockResolvedValue('noConfigurada');
    await abrirCobro();
    await waitFor(() => expect(seccion(/Factura electrónica/).getAttribute('aria-disabled')).toBe('true'));
    expect(screen.getByText(/No configurada: la organización no tiene activo/)).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'f', code: 'KeyF', altKey: true });
    expect(seccion(/Factura electrónica/).getAttribute('aria-expanded')).toBe('false');
  });

  test('factura electrónica activa: Alt+F la abre y el resumen dice si se envía', async () => {
    mockEstadoFactura.mockResolvedValue('activa');
    await abrirCobro();
    expect(seccion(/Factura electrónica/).textContent).toContain('Desactivada');
    fireEvent.keyDown(document.body, { key: 'f', code: 'KeyF', altKey: true });
    expect(seccion(/Factura electrónica/).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: /Enviar a la DIAN/ }));
    expect(seccion(/Factura electrónica/).textContent).toContain('Activada');
  });
});
