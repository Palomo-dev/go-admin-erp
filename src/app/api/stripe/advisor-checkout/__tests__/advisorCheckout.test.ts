/**
 * Tests para el endpoint /api/stripe/advisor-checkout
 * Verificar que solo asesores pueden generar enlaces, que no incluyen trial,
 * y que los metadata son correctos.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

// Mock de Stripe - debe definirse ANTES de importar el módulo
const mockStripeCustomersRetrieve = jest.fn()
const mockStripeCustomersCreate = jest.fn()
const mockStripeCheckoutSessionsCreate = jest.fn()

jest.mock('@/lib/stripe/server', () => ({
  stripe: {
    customers: {
      retrieve: (...args: unknown[]) => mockStripeCustomersRetrieve(...args),
      create: (...args: unknown[]) => mockStripeCustomersCreate(...args),
    },
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockStripeCheckoutSessionsCreate(...args),
      },
    },
  },
}))

// Importar después de los mocks
import { POST } from '../route'

// Mock de Supabase
const mockSupabaseFrom = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockSupabaseFrom,
  })),
}))

// Mock de orgContext
const mockGetServerOrgContext = jest.fn()

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: (...args: unknown[]) => mockGetServerOrgContext(...args),
  OrgContextError: class OrgContextError extends Error {
    constructor(
      message: string,
      public code: string,
      public statusCode: number
    ) {
      super(message)
    }
  },
}))

describe('/api/stripe/advisor-checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock default de Supabase que devuelve datos válidos
    mockSupabaseFrom.mockImplementation((table: string) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
      }

      if (table === 'plans') {
        chain.single.mockResolvedValue({
          data: {
            id: 2,
            stripe_price_yearly_id: 'price_yearly_test',
            stripe_price_monthly_id: 'price_monthly_test',
          },
          error: null,
        })
      } else if (table === 'organizations') {
        chain.single.mockResolvedValue({
          data: {
            name: 'Organización Test',
            email: 'test@example.com',
            stripe_customer_id: 'cus_test123',
          },
          error: null,
        })
      }

      return chain
    })

    // Mock de Stripe customers
    mockStripeCustomersRetrieve.mockResolvedValue({ id: 'cus_test123' })
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_new123' })
    mockStripeCheckoutSessionsCreate.mockResolvedValue({
      id: 'cs_test123',
      url: 'https://checkout.stripe.com/test',
      expires_at: Math.floor(Date.now() / 1000) + 86400,
    })
  })

  it('rechaza requests sin sesión autenticada', async () => {
    mockGetServerOrgContext.mockRejectedValue(
      new (require('@/lib/utils/orgContext').OrgContextError)(
        'No autenticado',
        'UNAUTHENTICATED',
        401
      )
    )

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'pro',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rechaza usuarios sin rol de asesor (role_id no es 1, 2, 5 ni super admin)', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user123',
      organizationId: 100,
      membership: {
        is_super_admin: false,
        role_id: 3, // rol normal, no asesor
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'pro',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain('permisos')
  })

  it('permite a super admin generar enlaces', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user123',
      organizationId: 100,
      membership: {
        is_super_admin: true,
        role_id: 1,
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'pro',
        interval: 'year',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.url).toBeTruthy()
  })

  it('permite a vendedor (role_id 5) generar enlaces', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user456',
      organizationId: 100,
      membership: {
        is_super_admin: false,
        role_id: 5, // vendedor
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'business',
        interval: 'year',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('NO incluye trial_period_days en el checkout', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user123',
      organizationId: 100,
      membership: {
        is_super_admin: true,
        role_id: 1,
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'pro',
        interval: 'year',
      }),
    })

    await POST(req)

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        subscription_data: expect.not.objectContaining({
          trial_period_days: expect.anything(),
        }),
      })
    )
  })

  it('incluye metadata correcto en session y subscription_data', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user789',
      organizationId: 100,
      membership: {
        is_super_admin: false,
        role_id: 5,
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'ultimate',
        interval: 'year',
      }),
    })

    await POST(req)

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: expect.objectContaining({
          metadata: expect.objectContaining({
            organizationId: '120',
            planCode: 'ultimate',
            interval: 'year',
            source: 'advisor',
            created_by: 'user789',
          }),
        }),
        metadata: expect.objectContaining({
          organizationId: '120',
          planCode: 'ultimate',
          interval: 'year',
          userId: 'user789',
          source: 'advisor_checkout',
        }),
      })
    )
  })

  it('rechaza planCode inválido', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user123',
      organizationId: 100,
      membership: {
        is_super_admin: true,
        role_id: 1,
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'basic', // no permitido
        interval: 'year',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('planCode')
  })

  it('usa precio anual por defecto', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user123',
      organizationId: 100,
      membership: {
        is_super_admin: true,
        role_id: 1,
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'pro',
        // sin interval, debe usar 'year'
      }),
    })

    await POST(req)

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price: 'price_yearly_test',
          }),
        ],
      })
    )
  })

  it('acepta interval mensual explícito', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user123',
      organizationId: 100,
      membership: {
        is_super_admin: true,
        role_id: 1,
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'pro',
        interval: 'month',
      }),
    })

    await POST(req)

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price: 'price_monthly_test',
          }),
        ],
      })
    )
  })

  it('incluye custom_text con mensaje de USD', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user123',
      organizationId: 100,
      membership: {
        is_super_admin: true,
        role_id: 1,
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'pro',
        interval: 'year',
      }),
    })

    await POST(req)

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_text: expect.objectContaining({
          submit: expect.objectContaining({
            message: expect.stringContaining('dólares estadounidenses (USD)'),
          }),
        }),
      })
    )
  })

  it('establece expiración de 24 horas', async () => {
    mockGetServerOrgContext.mockResolvedValue({
      userId: 'user123',
      organizationId: 100,
      membership: {
        is_super_admin: true,
        role_id: 1,
      },
    })

    const req = new NextRequest('http://localhost/api/stripe/advisor-checkout', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: 120,
        planCode: 'pro',
        interval: 'year',
      }),
    })

    const now = Math.floor(Date.now() / 1000)
    await POST(req)

    expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_at: expect.any(Number),
      })
    )

    const callArgs = mockStripeCheckoutSessionsCreate.mock.calls[0][0] as { expires_at: number }
    const expiresIn = callArgs.expires_at - now
    expect(expiresIn).toBeGreaterThan(86000) // ~24h
    expect(expiresIn).toBeLessThan(87000)
  })
})
