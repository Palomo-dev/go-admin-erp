/**
 * @jest-environment jsdom
 *
 * Plan: si no hay tarjeta (el alta no la guardó, o el cliente de Stripe nunca
 * se escribió), se puede vincular desde la propia tarjeta del kit. No se
 * prepara el formulario hasta que la persona lo pide, y confirmar no manda
 * el id del medio: lo lee el servidor del SetupIntent.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import PaymentMethodCard from '../PaymentMethodCard';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const confirmar = jest.fn();

jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn(async () => ({})) }));
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: function Elements({ children }: { children: React.ReactNode }) {
    return children;
  },
  CardElement: function CardElement({ onChange }: { onChange?: (e: { complete: boolean; error?: { message?: string } }) => void }) {
    return (
      <button type="button" onClick={() => onChange?.({ complete: true })}>
        completar tarjeta
      </button>
    );
  },
  useStripe: () => ({ confirmCardSetup: confirmar }),
  useElements: () => ({ getElement: () => ({}) }),
}));

const TARJETA = { id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, isDefault: true };

function mockFetch(metodos: unknown[] = []) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as { action?: string }) : null;
    if (body?.action === 'create-setup-intent') {
      return { ok: true, json: async () => ({ success: true, clientSecret: 'seti_secret' }) };
    }
    if (body?.action === 'confirmar-tarjeta') {
      return { ok: true, json: async () => ({ success: true }) };
    }
    if (String(url).includes('/api/subscriptions/payment-methods')) {
      return { ok: true, json: async () => ({ paymentMethods: metodos }) };
    }
    return { ok: false, json: async () => ({ error: 'no' }) };
  }) as jest.Mock;
}

describe('vincular tarjeta en Plan', () => {
  beforeEach(() => {
    confirmar.mockReset();
    confirmar.mockResolvedValue({ setupIntent: { id: 'seti_plan_ok', status: 'succeeded' } });
  });

  test('sin cliente de Stripe no pide nada hasta vincular, y al confirmar no manda el medio', async () => {
    mockFetch([TARJETA]);
    const onPaymentMethodUpdated = jest.fn();
    renderConIdioma(<PaymentMethodCard stripeCustomerId={null} organizationId={7} onPaymentMethodUpdated={onPaymentMethodUpdated} />);

    expect(screen.getByText('Vincula una tarjeta para los próximos cobros. Guardarla no cobra nada.')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Vincular tarjeta' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Queda como predeterminada de la suscripción. Ahora no se hace ningún cobro.')).toBeTruthy();

    await waitFor(() => {
      const llamadas = (global.fetch as jest.Mock).mock.calls.filter((c) => {
        const cuerpo = c[1]?.body ? (JSON.parse(String(c[1].body)) as { action?: string }) : null;
        return cuerpo?.action === 'create-setup-intent';
      });
      expect(llamadas).toHaveLength(1);
      expect(JSON.parse(String(llamadas[0][1].body))).toEqual({ organizationId: 7, action: 'create-setup-intent' });
    });

    const primario = within(dialogo).getByRole('button', { name: 'Vincular tarjeta' }) as HTMLButtonElement;
    expect(primario.disabled).toBe(true);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'completar tarjeta' }));
    await waitFor(() => expect(primario.disabled).toBe(false));
    fireEvent.click(primario);

    await waitFor(() => expect(onPaymentMethodUpdated).toHaveBeenCalledTimes(1));
    const confirmacion = (global.fetch as jest.Mock).mock.calls.find((c) => String(c[1]?.body ?? '').includes('confirmar-tarjeta'));
    expect(JSON.parse(String(confirmacion[1].body))).toEqual({
      organizationId: 7,
      action: 'confirmar-tarjeta',
      setupIntentId: 'seti_plan_ok',
    });
    expect(screen.getByText(/4242/)).toBeTruthy();
    expect(screen.getByText('Predeterminada')).toBeTruthy();
  });

  test('con cliente y sin tarjetas ofrece vincular, no el portal', async () => {
    mockFetch([]);
    renderConIdioma(<PaymentMethodCard stripeCustomerId="cliente" organizationId={7} />);
    expect(await screen.findByRole('button', { name: 'Vincular tarjeta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gestionar Facturación' })).toBeNull();
  });

  test('con una tarjeta vinculada sigue el portal y no vuelve a pedir vincular', () => {
    mockFetch([]);
    renderConIdioma(
      <PaymentMethodCard
        stripeCustomerId="cliente"
        organizationId={7}
        initialPaymentMethods={[{ id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 11, expYear: 2028, isDefault: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Gestionar Facturación' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vincular tarjeta' })).toBeNull();
    expect(screen.getByText('Predeterminada')).toBeTruthy();
  });
});
