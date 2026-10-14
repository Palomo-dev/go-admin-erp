/**
 * @jest-environment jsdom
 *
 * Al verificar la tarjeta con «Pagar ahora», el alta sigue con ese medio.
 * En móvil los botones de la fila no pueden usar flex-1: basis 0% en columna
 * dejaba en altura cero todos menos «Anterior».
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import PaymentMethodStep from '../PaymentMethodStep';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const confirmar = jest.fn();

jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn(async () => ({})) }));
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: function Elements({ children }: { children: React.ReactNode }) {
    return children;
  },
  CardElement: function CardElement({ onChange }: { onChange?: (e: { complete: boolean }) => void }) {
    return (
      <button type="button" onClick={() => onChange?.({ complete: true })}>
        completar tarjeta
      </button>
    );
  },
  useStripe: () => ({ confirmCardSetup: confirmar }),
  useElements: () => ({ getElement: () => ({}) }),
}));
jest.mock('../PriceSummary', () => {
  function Resumen() {
    return null;
  }
  return Resumen;
});

const formulario = {
  email: 'alta@example.com',
  firstName: 'Ana',
  lastName: 'Pérez',
  subscriptionPlan: 'pro',
  billingPeriod: 'monthly' as const,
  skipTrial: true,
};

function mockFetch() {
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return { json: async () => ({ success: true, clientSecret: 'seti_secret', customerId: 'cus_alta' }) };
    }
    return {
      json: async () => ({
        success: true,
        paymentMethod: { id: 'pm_alta', brand: 'visa', last4: '4242', expMonth: 11, expYear: 2028 },
      }),
    };
  }) as unknown as typeof fetch;
}

describe('paso de tarjeta del alta', () => {
  beforeEach(() => {
    confirmar.mockReset();
    confirmar.mockResolvedValue({ setupIntent: { id: 'seti_1', status: 'succeeded' } });
    mockFetch();
  });

  it('con pagar ahora, al verificar la tarjeta cierra el alta con ese medio', async () => {
    const onNext = jest.fn();
    renderConIdioma(
      <PaymentMethodStep
        formData={formulario}
        updateFormData={jest.fn()}
        onNext={onNext}
        onBack={jest.fn()}
        onSkip={jest.fn()}
        loading={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Omitir por ahora' })).toBeNull();
    const anterior = screen.getByRole('button', { name: 'Anterior' });
    expect(anterior.className).toContain('w-full');
    expect(anterior.className).not.toContain('flex-1');

    fireEvent.click(screen.getByRole('button', { name: 'completar tarjeta' }));
    const pagar = await waitFor(() => {
      const boton = screen.getByRole('button', { name: 'Pagar ahora' }) as HTMLButtonElement;
      expect(boton.disabled).toBe(false);
      return boton;
    });
    fireEvent.click(pagar);

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledWith({ customerId: 'cus_alta', paymentMethodId: 'pm_alta' });
    });
    const seguir = screen.getByRole('button', { name: 'Continuar' });
    expect(seguir.className).toContain('w-full');
    expect(seguir.className).not.toContain('flex-1');
  });

  it('con días gratis no cierra el alta al verificar y deja omitir', async () => {
    const onNext = jest.fn();
    renderConIdioma(
      <PaymentMethodStep
        formData={{ ...formulario, skipTrial: false }}
        updateFormData={jest.fn()}
        onNext={onNext}
        onBack={jest.fn()}
        onSkip={jest.fn()}
        loading={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Omitir por ahora' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'completar tarjeta' }));
    const verificar = await waitFor(() => {
      const boton = screen.getByRole('button', { name: 'Verificar Tarjeta' }) as HTMLButtonElement;
      expect(boton.disabled).toBe(false);
      return boton;
    });
    fireEvent.click(verificar);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
    });
    expect(onNext).not.toHaveBeenCalled();
  });
});
