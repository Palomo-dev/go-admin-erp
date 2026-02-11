/**
 * API Endpoint: Webhook de Stripe
 * GO Admin ERP - Stripe Webhook Handler
 * 
 * Este endpoint recibe eventos de Stripe y los procesa.
 * Es llamado automáticamente por Stripe cuando ocurren eventos.
 * 
 * URL del webhook: https://app.goadmin.io/api/stripe/webhook
 */

import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/lib/stripe/server'
import { processSuccessfulPayment } from '@/lib/stripe/paymentService'
import { StripeEventType } from '@/lib/stripe/types'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

/**
 * POST /api/stripe/webhook
 * 
 * Recibe eventos de Stripe y los procesa
 */
export async function POST(request: NextRequest) {
  try {
    // Obtener el body raw (necesario para verificar la firma)
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      console.error('❌ No se recibió stripe-signature header')
      return NextResponse.json(
        { error: 'No signature header' },
        { status: 400 }
      )
    }

    // Verificar y construir el evento
    let event: Stripe.Event

    try {
      event = constructWebhookEvent(body, signature)
      console.log('✅ Webhook verificado:', event.type, '- ID:', event.id)
    } catch (error: any) {
      console.error('❌ Error verificando webhook:', error.message)
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      )
    }

    // Procesar según el tipo de evento
    switch (event.type) {
      case StripeEventType.PAYMENT_INTENT_SUCCEEDED: {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('💳 Pago exitoso:', paymentIntent.id)

        try {
          await processSuccessfulPayment(paymentIntent.id)
          console.log('✅ Pago procesado y guardado en BD')
        } catch (error: any) {
          console.error('❌ Error procesando pago exitoso:', error)
          // No retornar error a Stripe para evitar reintentos infinitos
          // El pago ya se procesó en Stripe, solo falló guardar en nuestra BD
        }
        break
      }

      case StripeEventType.PAYMENT_INTENT_FAILED: {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('❌ Pago fallido:', paymentIntent.id)
        console.log('Razón:', paymentIntent.last_payment_error?.message)

        // Aquí podrías registrar el pago fallido en tu BD
        // O enviar notificación al usuario
        break
      }

      case StripeEventType.PAYMENT_INTENT_CANCELED: {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('🚫 Pago cancelado:', paymentIntent.id)

        // Aquí podrías actualizar el estado en tu BD
        break
      }

      case StripeEventType.CHARGE_SUCCEEDED: {
        const charge = event.data.object as Stripe.Charge
        console.log('💰 Cargo exitoso:', charge.id)

        // Los cargos se procesan con payment_intent.succeeded
        // Este evento es principalmente para logging adicional
        break
      }

      case StripeEventType.CHARGE_FAILED: {
        const charge = event.data.object as Stripe.Charge
        console.log('❌ Cargo fallido:', charge.id)
        console.log('Razón:', charge.failure_message)
        break
      }

      case StripeEventType.CHARGE_REFUNDED: {
        const charge = event.data.object as Stripe.Charge
        console.log('💸 Cargo reembolsado:', charge.id)
        console.log('Monto reembolsado:', charge.amount_refunded)

        // Aquí podrías actualizar los balances en tu BD
        // y crear un registro de reembolso
        break
      }

      // Checkout Session completada (nuevo upgrade de plan)
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object as any
        console.log('🎉 Checkout Session completada:', checkoutSession.id)
        
        if (checkoutSession.mode === 'subscription') {
          await handleCheckoutSessionCompleted(checkoutSession)
        }
        break
      }

      // Eventos de suscripciones
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('📝 Suscripción creada:', subscription.id)
        await updateSubscriptionInDatabase(subscription, 'created')
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('🔄 Suscripción actualizada:', subscription.id)
        await updateSubscriptionInDatabase(subscription, 'updated')
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('🗑️ Suscripción eliminada:', subscription.id)
        await updateSubscriptionInDatabase(subscription, 'deleted')
        break
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('⏰ Trial terminando en 3 días:', subscription.id)
        // Enviar email de recordatorio al cliente
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any
        console.log('✅ Pago de factura exitoso:', invoice.id)
        if (invoice.subscription) {
          console.log('   Para suscripción:', invoice.subscription)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any
        console.log('❌ Pago de factura fallido:', invoice.id)
        if (invoice.subscription) {
          console.log('   Para suscripción:', invoice.subscription)
          // Notificar al cliente que debe actualizar su método de pago
        }
        break
      }

      default:
        console.log('ℹ️ Evento no manejado:', event.type)
    }

    // Retornar 200 OK a Stripe
    return NextResponse.json({
      received: true,
      eventId: event.id,
      eventType: event.type,
    })
  } catch (error: any) {
    console.error('❌ Error en webhook de Stripe:', error)

    // Retornar 500 para que Stripe reintente
    return NextResponse.json(
      {
        error: 'Error procesando webhook',
        message: error.message,
      },
      { status: 500 }
    )
  }
}

/**
 * Manejar checkout session completada
 * Actualiza la suscripción en Supabase y el plan de la organización
 */
async function handleCheckoutSessionCompleted(checkoutSession: any) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const organizationId = parseInt(checkoutSession.metadata?.organizationId || '0')
    const planCode = checkoutSession.metadata?.planCode
    const billingPeriod = checkoutSession.metadata?.billingPeriod
    const subscriptionId = checkoutSession.subscription
    const customerId = checkoutSession.customer

    if (!organizationId || !planCode) {
      console.error('❌ Checkout session sin metadata necesaria:', checkoutSession.id)
      return
    }

    console.log(`📦 Procesando upgrade para org ${organizationId} a plan ${planCode}`)

    // Obtener el plan de la base de datos
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, code, name, max_modules, max_branches')
      .eq('code', planCode)
      .single()

    if (planError || !plan) {
      console.error('❌ Plan no encontrado:', planCode)
      return
    }

    // Obtener detalles de la suscripción de Stripe
    const { stripe } = await import('@/lib/stripe/server')
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId) as any

    // Buscar suscripción existente de la organización
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('organization_id', organizationId)
      .single()

    // Crear o actualizar suscripción
    const subscriptionData = {
      organization_id: organizationId,
      plan_id: plan.id,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      status: stripeSubscription.status,
      billing_period: billingPeriod,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      trial_start: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000).toISOString() : null,
      trial_end: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000).toISOString() : null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    }

    if (existingSub) {
      // Actualizar suscripción existente
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update(subscriptionData)
        .eq('id', existingSub.id)

      if (updateError) {
        console.error('❌ Error actualizando suscripción:', updateError)
      } else {
        console.log('✅ Suscripción actualizada en BD')
      }
    } else {
      // Crear nueva suscripción
      const { error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          ...subscriptionData,
          created_at: new Date().toISOString(),
        })

      if (insertError) {
        console.error('❌ Error creando suscripción:', insertError)
      } else {
        console.log('✅ Nueva suscripción creada en BD')
      }
    }

    // Actualizar plan_id en la organización
    const { error: orgError } = await supabase
      .from('organizations')
      .update({
        plan_id: plan.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId)

    if (orgError) {
      console.error('❌ Error actualizando organización:', orgError)
    } else {
      console.log('✅ Organización actualizada con nuevo plan')
    }

    // Activar módulos core para la organización si no existen
    const { data: coreModules } = await supabase
      .from('modules')
      .select('code')
      .eq('is_core', true)

    if (coreModules) {
      for (const module of coreModules) {
        await supabase
          .from('organization_modules')
          .upsert({
            organization_id: organizationId,
            module_code: module.code,
            is_active: true,
            enabled_at: new Date().toISOString(),
          }, {
            onConflict: 'organization_id,module_code'
          })
      }
      console.log('✅ Módulos core activados')
    }

    console.log(`🎉 Upgrade completado: Org ${organizationId} ahora tiene ${plan.name}`)

  } catch (error: any) {
    console.error('❌ Error en handleCheckoutSessionCompleted:', error)
  }
}

/**
 * Actualizar suscripción en base de datos
 */
async function updateSubscriptionInDatabase(
  subscription: Stripe.Subscription,
  action: 'created' | 'updated' | 'deleted'
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Obtener organization_id del metadata
    const organizationId = parseInt(subscription.metadata?.organizationId || '0')
    
    if (!organizationId) {
      console.warn('⚠️ Suscripción sin organizationId en metadata:', subscription.id)
      return
    }

    if (action === 'deleted' || subscription.status === 'canceled') {
      // Actualizar como cancelada
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          cancel_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id)

      if (error) {
        console.error('❌ Error actualizando suscripción cancelada:', error)
      } else {
        console.log('✅ Suscripción marcada como cancelada en BD')
      }
    } else {
      // Obtener plan_id basado en planCode del metadata
      const planCode = subscription.metadata?.planCode
      let planId: number | null = null
      
      if (planCode) {
        const { data: planData } = await supabase
          .from('plans')
          .select('id')
          .eq('code', planCode)
          .single()
        
        planId = planData?.id || null
      }

      // Buscar suscripción existente por organization_id o stripe_subscription_id
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .or(`organization_id.eq.${organizationId},stripe_subscription_id.eq.${subscription.id}`)
        .limit(1)
        .single()

      const subscriptionData = {
        organization_id: organizationId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        plan_id: planId,
        status: subscription.status,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
        current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }

      let error
      if (existingSub) {
        // Actualizar suscripción existente
        const result = await supabase
          .from('subscriptions')
          .update(subscriptionData)
          .eq('id', existingSub.id)
        error = result.error
      } else {
        // Crear nueva suscripción
        const result = await supabase
          .from('subscriptions')
          .insert({
            ...subscriptionData,
            created_at: new Date().toISOString(),
          })
        error = result.error
      }

      if (error) {
        console.error('❌ Error actualizando suscripción en BD:', error)
      } else {
        console.log('✅ Suscripción actualizada en BD')
      }

      // También actualizar plan_id en la organización si tenemos planId
      if (planId) {
        const { error: orgError } = await supabase
          .from('organizations')
          .update({ plan_id: planId, updated_at: new Date().toISOString() })
          .eq('id', organizationId)
        
        if (orgError) {
          console.error('❌ Error actualizando organización:', orgError)
        } else {
          console.log('✅ Organización actualizada con plan_id:', planId)
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Error en updateSubscriptionInDatabase:', error)
  }
}

/**
 * GET - No permitido
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Método no permitido',
      message: 'Este endpoint solo acepta POST requests de Stripe',
    },
    { status: 405 }
  )
}

/**
 * Configuración de Next.js para deshabilitar el parsing del body
 * Necesario para poder leer el body raw y verificar la firma
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
