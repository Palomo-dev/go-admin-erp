/**
 * @jest-environment jsdom
 *
 * El plan y el pago del alta siguen el tema (tokens), en claro y en oscuro.
 * Una tarjeta blanca fija dejaba el nombre y el precio en blanco sobre blanco.
 */
import { screen, waitFor } from '@testing-library/react';
import SubscriptionPlanSelector from '@/components/subscription/SubscriptionPlanSelector';
import SubscriptionStep from '../SubscriptionStep';
import PaymentMethodStep from '../PaymentMethodStep';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { SubscriptionPlan } from '@/components/subscription/SubscriptionPlanSelector';

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { trial_days: 15, name: 'Plan Pro', price_usd_month: 30, price_usd_year: 300 } }),
          order: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn(async () => ({})) }));
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: function Elements({ children }: { children: React.ReactNode }) {
    return children;
  },
  CardElement: function CardElement() {
    return <span>campo tarjeta</span>;
  },
  useStripe: () => null,
  useElements: () => ({ getElement: () => null }),
}));

const planes: SubscriptionPlan[] = [
  {
    id: 'pro',
    name: 'Plan Pro',
    description: 'Para emprendedores y pequeños negocios',
    price: 30,
    billingPeriod: 'monthly',
    features: ['Hasta 13 módulos'],
    isPopular: true,
    trialDays: 15,
  },
  {
    id: 'business',
    name: 'Plan Business',
    description: 'Para negocios en crecimiento',
    price: 60,
    billingPeriod: 'monthly',
    features: ['Hasta 17 módulos'],
    trialDays: 30,
  },
];

describe('tema del alta', () => {
  it('pinta el plan elegido con tokens, no con blanco fijo', () => {
    renderConIdioma(
      <SubscriptionPlanSelector
        selectedPlan="pro"
        onSelectPlan={() => undefined}
        plans={planes}
        billingPeriod="monthly"
        onChangeBillingPeriod={() => undefined}
        enColumnas
      />,
    );

    const pro = screen.getByRole('button', { name: /Plan Pro/ });
    expect(pro.className).toContain('bg-brand-tint');
    expect(pro.className).not.toContain('bg-white');
    expect(screen.getByText('Plan Pro').className).toContain('text-fg');
    expect(screen.getByRole('button', { name: /Plan Business/ }).className).toContain('bg-canvas');
  });

  it('marca «Pagar ahora» con el tinte de éxito del tema', async () => {
    renderConIdioma(
      <SubscriptionStep
        formData={{ subscriptionPlan: 'pro', billingPeriod: 'monthly', skipTrial: true }}
        updateFormData={() => undefined}
        onNext={() => undefined}
        onBack={() => undefined}
        encabezado={false}
      />,
    );

    const ahora = screen.getByRole('radio', { name: /Pagar ahora/ });
    expect(ahora.closest('label')?.className).toContain('bg-success-subtle');
    expect(ahora.closest('label')?.className).not.toContain('bg-green-50');
    expect(screen.queryByRole('heading', { name: 'Selecciona un plan' })).toBeNull();
  });

  it('el campo de la tarjeta sigue el modo oscuro', async () => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.setProperty('--text-primary', '248 250 252');
    global.fetch = jest.fn(async () => ({ json: async () => ({ success: false }) })) as unknown as typeof fetch;

    renderConIdioma(
      <PaymentMethodStep
        formData={{
          email: 'alta@example.com',
          firstName: 'Ana',
          lastName: 'Pérez',
          subscriptionPlan: 'pro',
          billingPeriod: 'monthly',
          skipTrial: true,
        }}
        updateFormData={() => undefined}
        onNext={() => undefined}
        onBack={() => undefined}
        onSkip={() => undefined}
        loading={false}
        encabezado={false}
      />,
    );

    const campo = screen.getByText('campo tarjeta').parentElement as HTMLElement;
    expect(campo.className).toContain('bg-surface');
    expect(campo.className).not.toContain('bg-white');
    await waitFor(() => {
      expect(campo.style.colorScheme).toBe('dark');
    });
    document.documentElement.classList.remove('dark');
  });
});
