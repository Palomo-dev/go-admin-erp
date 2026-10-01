/**
 * Tests del webhook de Stripe - Protección de cortesías
 * Verifica que suscripciones con metadata.cortesia no se modifiquen
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type Stripe from 'stripe';

// Mock de NextResponse
vi.mock('next/server', () => {
  const mockJson = (body: unknown, opts?: { status?: number }) => ({
    json: async () => body,
    status: opts?.status || 200,
    body,
  });

  return {
    NextRequest: vi.fn(),
    NextResponse: {
      json: mockJson,
    },
  };
});

// Mock de Stripe webhook verification
vi.mock('@/lib/stripe/server', () => ({
  constructWebhookEvent: vi.fn(),
  stripe: null,
}));

// Mock de tipos de Stripe
vi.mock('@/lib/stripe/types', () => ({
  StripeEventType: {
    PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
    PAYMENT_INTENT_FAILED: 'payment_intent.payment_failed',
    PAYMENT_INTENT_CANCELED: 'payment_intent.canceled',
    CHARGE_SUCCEEDED: 'charge.succeeded',
    CHARGE_FAILED: 'charge.failed',
    CHARGE_REFUNDED: 'charge.refunded',
  },
  PaymentStatus: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELED: 'canceled',
    REFUNDED: 'refunded',
  },
}));

// Mock de paymentService
vi.mock('@/lib/stripe/paymentService', () => ({
  processSuccessfulPayment: vi.fn().mockResolvedValue(undefined),
}));

// Mock de aplicarCheckoutDePlan
vi.mock('@/lib/stripe/aplicarCheckoutDePlan', () => ({
  aplicarCheckoutDePlan: vi.fn().mockResolvedValue({ estado: 'invalido', motivo: 'test' }),
}));

// Mock de getServiceClient
vi.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: vi.fn().mockReturnValue({
    from: vi.fn(),
  }),
}));

// Mock de createClient de Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

// Importar después de los mocks
import { POST } from '../route';

// Obtener referencias a los mocks ya creados
const { constructWebhookEvent } = await import('@/lib/stripe/server');
const { createClient } = await import('@supabase/supabase-js');

const mockConstructWebhookEvent = vi.mocked(constructWebhookEvent);
const mockCreateClient = vi.mocked(createClient);

// Spy en console.warn para verificar logs de protección
let consoleWarnSpy: any;

describe('Webhook Stripe - Protección de cortesías', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('customer.subscription.deleted con cortesía: retorna 200, no actualiza status', async () => {
    // Simular evento de Stripe
    const subscription: Partial<Stripe.Subscription> = {
      id: 'sub_test_cortesia',
      customer: 'cus_test_cortesia',
      status: 'canceled',
      canceled_at: Math.floor(Date.now() / 1000),
      current_period_start: Math.floor(Date.now() / 1000) - 86400,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: {
        organizationId: '143',
        planCode: 'ultimate',
      },
    };

    const event = {
      id: 'evt_cortesia_deleted',
      type: 'customer.subscription.deleted',
      data: { object: subscription },
    };

    mockConstructWebhookEvent.mockReturnValue(event as any);

    // Mock de Supabase - tracking de llamadas
    const updateCalls: any[] = [];
    const mockUpdate = vi.fn((data) => {
      updateCalls.push(data);
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    // Primera búsqueda por stripe_subscription_id retorna null (org 143 no tiene)
    // Segunda búsqueda por organization_id encuentra la cortesía
    let callCount = 0;
    const mockMaybeSingle = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // Primera llamada: búsqueda por stripe_subscription_id
        return Promise.resolve({ data: null, error: null });
      } else {
        // Segunda llamada: búsqueda por organization_id
        return Promise.resolve({
          data: {
            id: 'sub_local_143',
            organization_id: 143,
            status: 'active',
            current_period_end: '2027-09-29T00:00:00.000Z',
            metadata: {
              cortesia: true, // Cortesía activa - DEBE proteger
            },
          },
          error: null,
        });
      }
    });

    const mockSupabaseClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        update: mockUpdate,
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: mockMaybeSingle,
      })),
    };

    mockCreateClient.mockReturnValue(mockSupabaseClient as any);

    const request = {
      text: async () => JSON.stringify(event),
      headers: {
        get: (name: string) => (name === 'stripe-signature' ? 'test-signature' : null),
      },
    } as any;

    const response = await POST(request);
    const responseBody = await response.json();

    // Verificar respuesta 200
    expect(responseBody).toEqual({
      received: true,
      eventId: 'evt_cortesia_deleted',
      eventType: 'customer.subscription.deleted',
    });

    // CRÍTICO: Verificar que se logueó la protección
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('PROTECCIÓN CANCELACIÓN')
    );

    // CRÍTICO: Verificar que NO se actualizó el status a 'canceled' (protección activa)
    // Solo debe haber actualizado cancel_at/cancel_at_period_end, NO status
    const statusUpdates = updateCalls.filter(call => call && call.status === 'canceled');
    expect(statusUpdates.length).toBe(0); // NO debe haber actualizado status a canceled
  });

  it('invoice.payment_failed con cortesía: retorna 200, no notifica', async () => {
    const invoice = {
      id: 'in_test_cortesia',
      subscription: 'sub_test_cortesia',
      total_paid_amount: 10000,
      amount_paid: 0,
    };

    const event = {
      id: 'evt_cortesia_payment_failed',
      type: 'invoice.payment_failed',
      data: { object: invoice },
    };

    mockConstructWebhookEvent.mockReturnValue(event as any);

    // Mock de notificaciones - tracking
    const insertCalls: any[] = [];
    const mockInsert = vi.fn((data) => {
      insertCalls.push(data);
      return Promise.resolve({ error: null });
    });

    const mockSupabaseClient = {
      from: vi.fn((table) => {
        if (table === 'subscriptions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                organization_id: 143,
                metadata: {
                  cortesia: true, // Cortesía - NO debe notificar
                },
                current_period_end: '2027-09-29T00:00:00.000Z',
              },
              error: null,
            }),
          };
        }
        if (table === 'notifications') {
          return { insert: mockInsert };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      }),
    };

    mockCreateClient.mockReturnValue(mockSupabaseClient as any);

    const request = {
      text: async () => JSON.stringify(event),
      headers: {
        get: (name: string) => (name === 'stripe-signature' ? 'test-signature' : null),
      },
    } as any;

    const response = await POST(request);
    const responseBody = await response.json();

    // Verificar respuesta 200
    expect(responseBody).toEqual({
      received: true,
      eventId: 'evt_cortesia_payment_failed',
      eventType: 'invoice.payment_failed',
    });

    // Verificar que se logueó la protección
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('PROTECCIÓN')
    );

    // CRÍTICO: NO debe haber insertado notificaciones (protección activa)
    expect(insertCalls.length).toBe(0);
  });

  it('customer.subscription.deleted sin cortesía: actualiza normalmente a canceled', async () => {
    const subscription: Partial<Stripe.Subscription> = {
      id: 'sub_test_normal',
      customer: 'cus_test_normal',
      status: 'canceled',
      canceled_at: Math.floor(Date.now() / 1000),
      current_period_start: Math.floor(Date.now() / 1000) - 86400,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: {
        organizationId: '145',
        planCode: 'pro',
      },
    };

    const event = {
      id: 'evt_normal_deleted',
      type: 'customer.subscription.deleted',
      data: { object: subscription },
    };

    mockConstructWebhookEvent.mockReturnValue(event as any);

    // Mock - tracking de updates
    const updateCalls: any[] = [];
    const mockUpdate = vi.fn((data) => {
      updateCalls.push(data);
      return { 
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ error: null, data: [] }),
      };
    });

    const mockSupabaseClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        update: mockUpdate,
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'sub_local_145',
            organization_id: 145,
            status: 'active',
            current_period_end: '2026-11-15T00:00:00.000Z',
            metadata: null, // Sin cortesía - debe cancelar
          },
          error: null,
        }),
      })),
    };

    mockCreateClient.mockReturnValue(mockSupabaseClient as any);

    const request = {
      text: async () => JSON.stringify(event),
      headers: {
        get: (name: string) => (name === 'stripe-signature' ? 'test-signature' : null),
      },
    } as any;

    const response = await POST(request);
    const responseBody = await response.json();

    // Verificar respuesta 200
    expect(responseBody).toEqual({
      received: true,
      eventId: 'evt_normal_deleted',
      eventType: 'customer.subscription.deleted',
    });

    // DEBE haber actualizado status a 'canceled' (sin protección)
    const statusUpdates = updateCalls.filter(call => call && call.status === 'canceled');
    expect(statusUpdates.length).toBeGreaterThan(0);
  });
});
