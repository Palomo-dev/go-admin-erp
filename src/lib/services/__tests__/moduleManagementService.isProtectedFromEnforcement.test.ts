/**
 * Tests unitarios para isProtectedFromEnforcement (GO-156)
 * 
 * Verifica que la protección contra enforcement se aplique correctamente
 * según el tipo de suscripción.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { moduleManagementService } from '../moduleManagementService';

// Mock de Supabase client
const createMockSupabaseClient = (subscriptionData: any) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: subscriptionData, error: null })
      })
    })
  })
} as any);

describe('moduleManagementService.isProtectedFromEnforcement', () => {
  it('debe proteger suscripción activa mensual de pago', async () => {
    const mockClient = createMockSupabaseClient({
      status: 'active',
      billing_period: 'monthly',
      metadata: {},
      plans: {
        price_usd_month: '30.00',
        price_usd_year: '300.00'
      }
    });

    const isProtected = await moduleManagementService.isProtectedFromEnforcement(
      123,
      mockClient
    );

    expect(isProtected).toBe(true);
  });

  it('NO debe proteger suscripción trialing sin pago anual', async () => {
    const mockClient = createMockSupabaseClient({
      status: 'trialing',
      billing_period: 'monthly',
      metadata: {},
      plans: {
        price_usd_month: '30.00',
        price_usd_year: '300.00'
      }
    });

    const isProtected = await moduleManagementService.isProtectedFromEnforcement(
      123,
      mockClient
    );

    expect(isProtected).toBe(false);
  });

  it('debe proteger suscripción trialing con pago anual vigente', async () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);

    const mockClient = createMockSupabaseClient({
      status: 'trialing',
      billing_period: 'monthly',
      metadata: {
        pago_anual: {
          pagado_hasta: futureDate.toISOString()
        }
      },
      plans: {
        price_usd_month: '30.00',
        price_usd_year: '300.00'
      }
    });

    const isProtected = await moduleManagementService.isProtectedFromEnforcement(
      123,
      mockClient
    );

    expect(isProtected).toBe(true);
  });

  it('NO debe proteger suscripción trialing con pago anual expirado', async () => {
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 1);

    const mockClient = createMockSupabaseClient({
      status: 'trialing',
      billing_period: 'monthly',
      metadata: {
        pago_anual: {
          pagado_hasta: pastDate.toISOString()
        }
      },
      plans: {
        price_usd_month: '30.00',
        price_usd_year: '300.00'
      }
    });

    const isProtected = await moduleManagementService.isProtectedFromEnforcement(
      123,
      mockClient
    );

    expect(isProtected).toBe(false);
  });

  it('NO debe proteger suscripción canceled', async () => {
    const mockClient = createMockSupabaseClient({
      status: 'canceled',
      billing_period: 'monthly',
      metadata: {},
      plans: {
        price_usd_month: '30.00',
        price_usd_year: '300.00'
      }
    });

    const isProtected = await moduleManagementService.isProtectedFromEnforcement(
      123,
      mockClient
    );

    expect(isProtected).toBe(false);
  });

  it('debe proteger suscripción anual activa', async () => {
    const mockClient = createMockSupabaseClient({
      status: 'active',
      billing_period: 'yearly',
      metadata: {},
      plans: {
        price_usd_month: '30.00',
        price_usd_year: '300.00'
      }
    });

    const isProtected = await moduleManagementService.isProtectedFromEnforcement(
      123,
      mockClient
    );

    expect(isProtected).toBe(true);
  });

  it('NO debe proteger si no hay suscripción', async () => {
    const mockClient = createMockSupabaseClient(null);

    const isProtected = await moduleManagementService.isProtectedFromEnforcement(
      123,
      mockClient
    );

    expect(isProtected).toBe(false);
  });
});
