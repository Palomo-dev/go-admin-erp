/**
 * API Endpoint: Crear Suscripción de Stripe
 * GO Admin ERP - Create Subscription
 *
 * POST /api/stripe/create-subscription
 *
 * Body:
 * {
 *   organizationId: number,
 *   planCode: string,
 *   billingPeriod: 'monthly' | 'yearly',
 *   useTrial?: boolean,            // por defecto true
 *   paymentMethodId?: string,      // requerido si useTrial = false
 *   existingCustomerId?: string,   // cliente creado en el paso de tarjeta del alta
 *   customerName?: string,
 *   enterpriseConfig?: object,
 *   couponCode?: string
 * }
 *
 * GO-sec (auditoría 2026-09-24). Antes: `/api/stripe/` está fuera del
 * middleware y la ruta «intentaba» leer la sesión con un cliente SIN cookies
 * (siempre vacía), así que se saltaba la comprobación de pertenencia («signup
 * sin sesión»): cualquiera creaba suscripciones sobre cualquier organización,
 * con el correo, el `userId` y el `existingCustomerId` que mandara (este
 * último podía ser el cliente de Stripe de otra persona, con su tarjeta).
 *
 * Ahora:
 *  - Sesión + membresía activa en la organización + admin o
 *    `billing_management` (`contextoDeFacturacion`) → 401/403. Los dos
 *    llamadores (alta en /auth/signup y el asistente de nueva organización)
 *    ya tienen sesión cuando llaman: el alta solo crea los datos con sesión
 *    activa y el cliente guarda la sesión también en cookies.
 *  - El correo sale de la SESIÓN; `userId` y `email` del body se ignoran.
 *  - `existingCustomerId` solo se acepta si es un cliente creado por el paso
 *    de tarjeta del alta (`metadata.source = signup_flow`, aún
 *    `pending_verification`) y con el correo del usuario de la sesión. Si no,
 *    403 y se registra.
 *  - Sin GET (Next responde 405).
 */

import { NextResponse } from 'next/server'
import { createSubscription, type CreateSubscriptionData } from '@/lib/stripe/subscriptionService'
import { stripe } from '@/lib/stripe/server'
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion'
import { clienteDeAltaReclamable } from '@/lib/stripe/clienteDeAlta'
import { routeErrorResponse } from '@/lib/security/orgGuards'
import { OrgContextError } from '@/lib/utils/orgContext'
import { getServiceClient } from '@/lib/supabase/server-service'
import { sendConversionEvent } from '@/lib/marketing/conversionTracking'

const RUTA = 'stripe/create-subscription'

type Body = {
  organizationId?: unknown
  planCode?: unknown
  billingPeriod?: unknown
  useTrial?: unknown
  paymentMethodId?: unknown
  existingCustomerId?: unknown
  customerName?: unknown
  enterpriseConfig?: CreateSubscriptionData['enterpriseConfig']
  couponCode?: unknown
}

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export async function POST(request: Request) {
  try {
    let body: Body
    try {
      body = (await request.json()) as Body
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const ctx = await contextoDeFacturacion(body.organizationId, RUTA)

    const planCode = texto(body.planCode)
    const billingPeriod = body.billingPeriod === 'yearly' ? 'yearly' : body.billingPeriod === 'monthly' ? 'monthly' : null
    if (!planCode || !billingPeriod) {
      return NextResponse.json({ error: 'Faltan campos requeridos: planCode, billingPeriod' }, { status: 400 })
    }

    const customerEmail = ctx.userEmail
    if (!customerEmail) {
      return NextResponse.json({ error: 'La sesión no tiene correo' }, { status: 400 })
    }

    const useTrial = body.useTrial !== false
    const paymentMethodId = texto(body.paymentMethodId)
    if (!useTrial && !paymentMethodId) {
      return NextResponse.json({ error: 'Payment method es requerido para suscripciones sin trial' }, { status: 400 })
    }

    const existingCustomerId = texto(body.existingCustomerId)
    if (existingCustomerId) {
      if (!stripe) return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 503 })
      if (!(await clienteDeAltaReclamable(stripe, existingCustomerId, customerEmail))) {
        console.warn('[stripe/create-subscription] existingCustomerId no reclamable → 403', {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        })
        throw new OrgContextError('Ese cliente de pago no es tuyo', 403, 'STRIPE_CUSTOMER_FORBIDDEN')
      }
    }

    const subscriptionData: CreateSubscriptionData = {
      organizationId: ctx.organizationId,
      planCode,
      billingPeriod,
      useTrial,
      customerEmail,
      customerName: texto(body.customerName),
      paymentMethodId,
      existingCustomerId,
      enterpriseConfig: body.enterpriseConfig,
      couponCode: texto(body.couponCode),
    }

    const result = await createSubscription(subscriptionData)
    if (!result.success) {
      console.error('[stripe/create-subscription] createSubscription falló:', result.error)
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    console.log('[stripe/create-subscription] suscripción creada', {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      subscriptionId: result.subscriptionId,
    })

    // E7: Enviar evento StartTrial a Meta CAPI y GA4 MP
    // Solo se envía si marketing_consent = true y useTrial = true
    if (useTrial && result.subscriptionId) {
      try {
        // Obtener el valor mensual del plan
        const supabase = getServiceClient()
        const { data: plan } = await supabase
          .from('plans')
          .select('monthly_price_usd')
          .eq('code', planCode)
          .single()

        const monthlyValue = plan?.monthly_price_usd || 0

        if (monthlyValue > 0) {
          console.log('[stripe/create-subscription] Enviando evento StartTrial...')
          await sendConversionEvent(
            {
              eventName: 'StartTrial',
              eventId: result.subscriptionId,
              eventSourceUrl: 'https://app.goadmin.io/auth/signup',
              actionSource: 'website',
              userData: {
                email: customerEmail,
                externalId: ctx.userId,
              },
              customData: {
                value: monthlyValue,
                currency: 'USD',
                predictedLtv: monthlyValue * 12,
              },
            },
            supabase
          )
          console.log('[stripe/create-subscription] Evento StartTrial enviado')
        }
      } catch (err) {
        console.warn('[stripe/create-subscription] Error enviando StartTrial (no crítico):', err)
      }
    }

    return NextResponse.json({
      success: true,
      subscriptionId: result.subscriptionId,
      customerId: result.customerId,
      clientSecret: result.clientSecret,
      trialEnd: result.trialEnd,
    })
  } catch (err) {
    return routeErrorResponse(RUTA, err)
  }
}
