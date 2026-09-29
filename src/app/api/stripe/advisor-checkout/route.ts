/**
 * API Endpoint: Crear Stripe Checkout Session para Asesores de Ventas
 * GO Admin ERP - Checkout Session anual sin período de prueba
 * 
 * Permite a asesores de ventas (super admin o rol 5) generar un enlace de pago
 * Stripe para planes anuales sin período de prueba, destinado a ventas directas
 * en reuniones con clientes.
 *
 * Seguridad: Requiere sesión autenticada y que el usuario tenga role_id 5
 * (vendedor), role_id 1/2 (admin) o is_super_admin = true.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe/server'
import {
  getServerOrgContext,
  OrgContextError,
} from '@/lib/utils/orgContext'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Verificar si el usuario tiene permisos de asesor de ventas
 * (super admin, admin organizacional o vendedor - roles 1, 2 o 5)
 */
function isAdvisorOrAdmin(membership: { is_super_admin: boolean | null; role_id: number | null }): boolean {
  if (membership.is_super_admin === true) return true
  if (membership.role_id && [1, 2, 5].includes(membership.role_id)) return true
  return false
}

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe no está configurado. Verifica STRIPE_SECRET_KEY.' },
        { status: 500 }
      )
    }

    const {
      organizationId,
      planCode,
      interval = 'year',
    } = await request.json()

    if (!organizationId || !planCode) {
      return NextResponse.json(
        { error: 'Parámetros faltantes: organizationId y planCode son requeridos' },
        { status: 400 }
      )
    }

    if (!['year', 'month'].includes(interval)) {
      return NextResponse.json(
        { error: 'interval debe ser "year" o "month"' },
        { status: 400 }
      )
    }

    if (!['pro', 'business', 'ultimate'].includes(planCode)) {
      return NextResponse.json(
        { error: 'planCode debe ser pro, business o ultimate' },
        { status: 400 }
      )
    }

    // Verificar sesión y permisos (debe ser asesor o admin)
    let userId: string
    try {
      const ctx = await getServerOrgContext()
      userId = ctx.userId

      // Verificar que el usuario sea asesor o admin en GO Admin (organización interna)
      // Los asesores pueden crear enlaces para CUALQUIER organización cliente
      if (!isAdvisorOrAdmin(ctx.membership)) {
        console.warn('[advisor-checkout] Usuario sin permisos de asesor:', { userId, roleId: ctx.membership.role_id })
        return NextResponse.json(
          { error: 'No tienes permisos para generar enlaces de pago. Requiere rol de asesor o administrador.' },
          { status: 403 }
        )
      }
    } catch (err) {
      if (err instanceof OrgContextError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode })
      }
      throw err
    }

    const supabase = createSupabaseClient()

    // Obtener el plan y su precio desde la BD
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, stripe_price_yearly_id, stripe_price_monthly_id')
      .eq('code', planCode)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return NextResponse.json(
        { error: 'Plan no encontrado o inactivo' },
        { status: 404 }
      )
    }

    const priceId = interval === 'year' 
      ? plan.stripe_price_yearly_id 
      : plan.stripe_price_monthly_id

    if (!priceId) {
      return NextResponse.json(
        { error: `Plan ${planCode} no tiene precio ${interval}al configurado en Stripe` },
        { status: 400 }
      )
    }

    // Obtener datos de la organización cliente
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('name, email, stripe_customer_id')
      .eq('id', organizationId)
      .single()

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organización no encontrada' },
        { status: 404 }
      )
    }

    // Reutilizar o crear el Stripe customer
    let customerId = org.stripe_customer_id

    if (customerId) {
      // Verificar que el customer existe en el entorno actual de Stripe
      try {
        await stripe.customers.retrieve(customerId)
      } catch (retrieveErr: unknown) {
        console.warn('⚠️ Stripe customer no encontrado, creando uno nuevo:', retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr))
        customerId = null
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.email || `org-${organizationId}@placeholder.com`,
        name: org.name,
        metadata: {
          organizationId: organizationId.toString(),
          source: 'advisor_checkout',
        },
      })
      customerId = customer.id

      // Guardar el customer_id en la organización
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', organizationId)
    }

    // Crear Checkout Session SIN trial_period_days
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const successUrl = `${baseUrl}/app/organizacion/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/app/organizacion/plan?checkout=canceled`

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // NO se incluye trial_period_days: pago inmediato
      subscription_data: {
        metadata: {
          organizationId: organizationId.toString(),
          planCode: planCode,
          plan_id: plan.id.toString(),
          interval: interval,
          source: 'advisor',
          created_by: userId,
        },
      },
      metadata: {
        organizationId: organizationId.toString(),
        planCode: planCode,
        plan_id: plan.id.toString(),
        interval: interval,
        userId: userId,
        source: 'advisor_checkout',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false,
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      payment_method_collection: 'always',
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 horas
      custom_text: {
        submit: {
          message: 'El cobro se realiza en dólares estadounidenses (USD).',
        },
      },
    })

    // Log en servidor (en producción podrías usar una tabla de audit logs)
    console.log('✅ Enlace de pago generado por asesor:', {
      userId,
      organizationId,
      planCode,
      interval,
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    })

    return NextResponse.json({
      success: true,
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
      expiresAt: new Date(checkoutSession.expires_at! * 1000).toISOString(),
    })

  } catch (error: unknown) {
    console.error('❌ Error creando checkout de asesor:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
