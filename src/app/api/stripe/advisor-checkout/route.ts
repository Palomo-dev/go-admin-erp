/**
 * API Endpoint: Crear Stripe Checkout Session para Asesores de Ventas
 * GO Admin ERP - Checkout Session anual sin período de prueba
 * 
 * Permite SOLO a personal interno de GO Admin generar enlaces de pago Stripe
 * para organizaciones clientes, sin período de prueba.
 *
 * Seguridad (IDOR mitigado): Requiere sesión autenticada Y que el usuario sea:
 *   - Super admin (is_super_admin = true), O
 *   - Miembro con role_id 1/2/5 de la organización interna de GO Admin
 *     (cuyo ID se lee de GOADMIN_INTERNAL_ORG_ID).
 * 
 * Si GOADMIN_INTERNAL_ORG_ID no está definida, solo super admin puede usar este endpoint.
 * Los admins de organizaciones clientes NO pueden generar checkouts para otras organizaciones.
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
const GOADMIN_INTERNAL_ORG_ID = process.env.GOADMIN_INTERNAL_ORG_ID
  ? parseInt(process.env.GOADMIN_INTERNAL_ORG_ID, 10)
  : null

function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Verificar si el usuario es personal interno de GO Admin con permisos de asesor.
 * 
 * Requiere:
 *  - is_super_admin = true, O
 *  - Membresía con role_id 1/2/5 en la organización interna de GO Admin
 * 
 * Si GOADMIN_INTERNAL_ORG_ID no está configurada, solo super admin tiene acceso.
 */
async function isInternalAdvisor(
  userId: string,
  currentMembership: { is_super_admin: boolean | null; role_id: number | null; organization_id: number }
): Promise<boolean> {
  // Super admin siempre tiene acceso
  if (currentMembership.is_super_admin === true) return true

  // Si no hay organización interna configurada, solo super admin
  if (!GOADMIN_INTERNAL_ORG_ID) return false

  // Verificar que el usuario tenga membresía activa con role 1/2/5 en la org interna
  const supabase = createSupabaseClient()
  const { data: internalMembership } = await supabase
    .from('organization_members')
    .select('role_id, is_super_admin')
    .eq('user_id', userId)
    .eq('organization_id', GOADMIN_INTERNAL_ORG_ID)
    .eq('is_active', true)
    .maybeSingle()

  if (!internalMembership) return false
  if (internalMembership.is_super_admin === true) return true
  if (internalMembership.role_id && [1, 2, 5].includes(internalMembership.role_id)) return true

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

    // Verificar sesión y permisos (debe ser personal interno de GO Admin)
    let userId: string = 'unknown'
    try {
      const ctx = await getServerOrgContext()
      userId = ctx.userId

      // Verificar que el usuario sea personal interno de GO Admin
      const hasAccess = await isInternalAdvisor(userId, ctx.membership)
      if (!hasAccess) {
        console.warn('[advisor-checkout] Usuario sin acceso (no es personal interno):', {
          userId,
          organizationId: ctx.organizationId,
          roleId: ctx.membership.role_id,
        })
        return NextResponse.json(
          { error: 'Acceso denegado. Solo personal interno de GO Admin puede generar enlaces de pago.' },
          { status: 403 }
        )
      }

      // Prevenir generar checkout para la organización interna misma
      if (GOADMIN_INTERNAL_ORG_ID && organizationId === GOADMIN_INTERNAL_ORG_ID) {
        return NextResponse.json(
          { error: 'No se puede generar un checkout para la organización interna de GO Admin' },
          { status: 400 }
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
          billingPeriod: interval === 'year' ? 'yearly' : 'monthly',
          source: 'advisor',
          created_by: userId,
        },
      },
      metadata: {
        organizationId: organizationId.toString(),
        planCode: planCode,
        billingPeriod: interval === 'year' ? 'yearly' : 'monthly',
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

    // Log en servidor (sin URL completa por seguridad)
    console.log('✅ Enlace de pago generado por asesor:', {
      userId,
      targetOrgId: organizationId,
      planCode,
      interval,
      sessionId: checkoutSession.id,
    })

    return NextResponse.json({
      success: true,
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
      expiresAt: new Date(checkoutSession.expires_at! * 1000).toISOString(),
    })

  } catch (error: unknown) {
    // No exponer detalles de error de Stripe al cliente
    console.error('❌ Error creando checkout de asesor:', {
      userId: userId || 'unknown',
      organizationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: 'Error generando el enlace de pago. Contacta a soporte técnico.' },
      { status: 500 }
    )
  }
}
