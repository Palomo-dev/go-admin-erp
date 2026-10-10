/**
 * @jest-environment jsdom
 *
 * Al elegir el plan, «Pagar ahora» viene marcado. Los días gratis siguen ahí
 * si la persona los elige.
 */
import type { ReactElement } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import SubscriptionStep from '../SubscriptionStep';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

jest.mock('@/components/subscription/SubscriptionPlanSelector', () => {
  function Selector() {
    return <div>planes</div>;
  }
  return Selector;
});
jest.mock('../PriceSummary', () => {
  function Resumen() {
    return null;
  }
  return Resumen;
});
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { trial_days: 15, name: 'Plan Pro', price_usd_month: 30, price_usd_year: 300 } }),
        }),
      }),
    }),
  },
}));

function radios() {
  return {
    gratis: screen.getByRole('radio', { name: /Usar días gratis/ }) as HTMLInputElement,
    ahora: screen.getByRole('radio', { name: /Pagar ahora/ }) as HTMLInputElement,
  };
}

async function pintar(nodo: ReactElement) {
  await act(async () => {
    renderConIdioma(nodo);
    await Promise.resolve();
  });
}

describe('opción de cobro al elegir el plan', () => {
  it('deja «Pagar ahora» marcado cuando el alta no trae una elección', async () => {
    await pintar(
      <SubscriptionStep formData={{ subscriptionPlan: 'pro', billingPeriod: 'monthly' }} updateFormData={() => undefined} onNext={() => undefined} onBack={() => undefined} />,
    );
    const { gratis, ahora } = radios();
    expect(ahora.checked).toBe(true);
    expect(gratis.checked).toBe(false);
  });

  it('respeta los días gratis si ya venían elegidos', async () => {
    await pintar(
      <SubscriptionStep formData={{ subscriptionPlan: 'pro', billingPeriod: 'monthly', skipTrial: false }} updateFormData={() => undefined} onNext={() => undefined} onBack={() => undefined} />,
    );
    const { gratis, ahora } = radios();
    expect(gratis.checked).toBe(true);
    expect(ahora.checked).toBe(false);
  });

  it('al elegir los días gratis avisa al asistente', async () => {
    const updateFormData = jest.fn();
    await pintar(
      <SubscriptionStep formData={{ subscriptionPlan: 'pro', billingPeriod: 'monthly', skipTrial: true }} updateFormData={updateFormData} onNext={() => undefined} onBack={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Usar días gratis/ }));
    expect(updateFormData).toHaveBeenCalledWith({ skipTrial: false });
  });
});
