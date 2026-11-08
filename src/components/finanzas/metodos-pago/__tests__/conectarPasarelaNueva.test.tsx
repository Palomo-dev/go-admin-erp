/**
 * @jest-environment jsdom
 *
 * Fallo del dueño (2026-11-07, en el celular): «Configurar integración» de Mercado Pago en Métodos
 * de pago abría el formulario viejo `/conexiones/nueva` (País → ambiente → sucursal, con el logo de
 * Mastercard). Debe llevar al asistente NUEVO de Conexiones con el proveedor ya elegido y
 * `?return=` a Métodos de pago.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

const vacio = { data: [], error: null, count: 0 };
const consulta: Record<string, unknown> = {};
for (const m of ['select', 'eq', 'in', 'order', 'single', 'update', 'delete', 'maybeSingle']) consulta[m] = () => consulta;
consulta.then = (ok: (v: unknown) => unknown) => Promise.resolve(vacio).then(ok);
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => consulta, rpc: () => Promise.resolve(vacio) } }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../SucursalesMetodoPago', () => ({ SucursalesMetodoBadges: () => null }));

import PaymentMethodsList from '../PaymentMethodsList';

const mercadoPago = { code: 'mp', name: 'Mercado Pago', requires_reference: false, is_active: true, is_system: false };

afterAll(() => simularAncho(1440));

test.each([390, 1440])('ancho %ipx: «Configurar integración» de Mercado Pago abre el asistente nuevo', async (ancho) => {
  simularAncho(ancho);
  renderConIdioma(
    <PaymentMethodsList
      paymentMethods={[mercadoPago]}
      orgPaymentMethods={[
        { id: 5, organization_id: 7, payment_method_code: 'mp', is_active: true, settings: {}, payment_method: mercadoPago },
      ]}
      recommendedMethods={[]}
      countryCode="CO"
      onEdit={() => undefined}
      isLoading={false}
      onRefresh={() => undefined}
    />,
  );
  const menus = await screen.findAllByRole('button', { name: /Abrir menú/i });
  fireEvent.pointerDown(menus[0], { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.keyDown(menus[0], { key: 'Enter' });
  const enlace = (await screen.findByText(/Configurar Integración/i)).closest('a') as HTMLAnchorElement;
  expect(enlace.getAttribute('href')).toBe('/app/integraciones/conexiones?conectar=mercadopago&return=%2Fapp%2Ffinanzas%2Fmetodos-pago');
  expect(enlace.getAttribute('href')).not.toMatch(/conexiones\/nueva/);
});
