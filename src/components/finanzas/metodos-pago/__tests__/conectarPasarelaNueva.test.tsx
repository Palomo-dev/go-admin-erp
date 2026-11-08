/**
 * @jest-environment jsdom
 *
 * Fallo del dueño (2026-11-07, en el celular): «Configurar integración» de Mercado Pago en Métodos
 * de pago abría el formulario viejo `/conexiones/nueva` (País → ambiente → sucursal, con el logo de
 * Mastercard). Debe llevar al asistente NUEVO de Conexiones con el proveedor ya elegido y
 * `?return=` a Métodos de pago.
 *
 * Desde la lista según Figma (2026-11-08) la opción vive en el «⋯» del kit (menú en escritorio,
 * hoja de acciones en el celular) y navega con el router en lugar de un enlace.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

const vacio = { data: [], error: null, count: 0 };
const consulta: Record<string, unknown> = {};
for (const m of ['select', 'eq', 'in', 'order', 'single', 'update', 'delete', 'maybeSingle']) consulta[m] = () => consulta;
consulta.then = (ok: (v: unknown) => unknown) => Promise.resolve(vacio).then(ok);
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => consulta, rpc: () => Promise.resolve(vacio) } }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../SucursalesMetodoPago', () => ({ SucursalesMetodoBadges: () => null }));
jest.mock('@/components/pos/configuracion/configuracionService', () => ({
  ConfiguracionService: { getRequireCashSessionConfig: () => Promise.resolve({ require_cash_session: true }) },
}));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));

import PaymentMethodsList from '../PaymentMethodsList';

const mercadoPago = { code: 'mp', name: 'Mercado Pago', requires_reference: false, is_active: true, is_system: false };

beforeEach(() => {
  mockPush.mockReset();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ porMetodo: {} }) })) as unknown as typeof fetch;
});
afterAll(() => simularAncho(1440));

test.each([390, 1440])('ancho %ipx: «Configurar integración» de Mercado Pago abre el asistente nuevo', async (ancho) => {
  simularAncho(ancho);
  renderConIdioma(
    <PaymentMethodsList
      organizationId={7}
      paymentMethods={[mercadoPago]}
      orgPaymentMethods={[
        { id: 5, organization_id: 7, payment_method_code: 'mp', is_active: true, settings: {}, payment_method: mercadoPago },
      ]}
      onEdit={() => undefined}
      isLoading={false}
      onRefresh={() => undefined}
      puedeGestionar
    />,
  );
  const contenedor =
    ancho < 1024
      ? screen.getByRole('list', { name: 'Métodos de pago de la organización' })
      : screen.getByRole('table', { name: 'Métodos de pago de la organización' });
  const menu = await within(contenedor).findByRole('button', { name: 'Acciones de Mercado Pago' });
  fireEvent.pointerDown(menu, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.keyDown(menu, { key: 'Enter' });
  fireEvent.click(menu);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Configurar integración' }));
  // La hoja móvil ejecuta la acción al cerrarse.
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith('/app/integraciones/conexiones?conectar=mercadopago&return=%2Fapp%2Ffinanzas%2Fmetodos-pago'),
  );
  expect(mockPush.mock.calls[0][0]).not.toMatch(/conexiones\/nueva/);
});
