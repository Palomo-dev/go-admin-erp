/**
 * Servicio de Suscripciones con Stripe
 * GO Admin ERP - Stripe Subscription Service
 * 
 * Maneja toda la lógica de suscripciones incluyendo:
 * - Crear suscripciones con trial de 15 días
 * - Crear suscripciones con pago inmediato (sin trial)
 * - Actualizar suscripciones
 * - Cancelar suscripciones
 */

import { stripe } from './server'
import { createClient } from '@supabase/supabase-js'

export interface CreateSubscriptionData {
  organizationId: number
  planCode: string // 'basic' | 'pro' | 'enterprise'
  billingPeriod: 'monthly' | 'yearly'
  useTrial: boolean // true = 15 días gratis, false = pagar inmediatamente
  customerEmail: string
  customerName?: string
  paymentMethodId?: string // Requerido si useTrial = false
}

export interface SubscriptionResult {
  success: boolean
  subscriptionId?: string
  clientSecret?: string // Para confirmar pago si useTrial = false
  trialEnd?: Date
  error?: string
}

/**
 * Crear suscripción en Stripe
 */
export async function createSubscription(
  data: CreateSubscriptionData
): Promise<SubscriptionResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Obtener información del plan de la base de datos
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('stripe_product_id, stripe_price_monthly_id, stripe_price_yearly_id, trial_days')
      .eq('code', data.planCode)
      .single()

    if (planError || !plan) {
      throw new Error('Plan no encontrado en base de datos')
    }

    // Verificar que el plan tenga los IDs de Stripe configurados
    if (!plan.stripe_product_id) {
      throw new Error(`Plan ${data.planCode} no tiene producto de Stripe configurado`)
    }

    const priceId = data.billingPeriod === 'monthly' 
      ? plan.stripe_price_monthly_id 
      : plan.stripe_price_yearly_id

    if (!priceId) {
      throw new Error(`Plan ${data.planCode} no tiene precio ${data.billingPeriod} configurado en Stripe`)
    }

    // 1. Crear o obtener customer en Stripe
    let customerId: string
    
    // Buscar si ya existe un customer con este email
    const existingCustomers = await stripe.customers.list({
      email: data.customerEmail,
      limit: 1,
    })

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id
      console.log('✅ Customer existente encontrado:', customerId)
    } else {
      const customer = await stripe.customers.create({
        email: data.customerEmail,
        name: data.customerName,
        metadata: {
          organizationId: data.organizationId.toString(),
          planCode: data.planCode,
        },
      })
      customerId = customer.id
      console.log('✅ Customer creado:', customerId)
    }

    // 2. Crear suscripción según si usa trial o no
    let subscription: any

    if (data.useTrial) {
      // CON TRIAL: 15 días gratis, no requiere payment method inmediato
      subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: plan.trial_days || 15,
        payment_behavior: 'default_incomplete', // Permitir suscripción sin payment method durante trial
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        metadata: {
          organizationId: data.organizationId.toString(),
          planCode: data.planCode,
          billingPeriod: data.billingPeriod,
          usedTrial: 'true',
        },
      })

      console.log('✅ Suscripción con trial creada:', subscription.id)

      // Guardar suscripción en base de datos
      await saveSubscriptionToDatabase(supabase, {
        organizationId: data.organizationId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        planCode: data.planCode,
        status: 'trialing',
        trialEnd: new Date(subscription.trial_end! * 1000),
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      })

      return {
        success: true,
        subscriptionId: subscription.id,
        trialEnd: new Date(subscription.trial_end! * 1000),
      }
    } else {
      // SIN TRIAL: Pago inmediato requerido
      if (!data.paymentMethodId) {
        throw new Error('Payment method es requerido para suscripciones sin trial')
      }

      // Adjuntar payment method al customer
      await stripe.paymentMethods.attach(data.paymentMethodId, {
        customer: customerId,
      })

      // Establecer como default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: data.paymentMethodId,
        },
      })

      // Crear suscripción sin trial
      subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: data.paymentMethodId,
        payment_behavior: 'error_if_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          organizationId: data.organizationId.toString(),
          planCode: data.planCode,
          billingPeriod: data.billingPeriod,
          usedTrial: 'false',
        },
      })

      console.log('✅ Suscripción sin trial creada:', subscription.id)

      // Guardar suscripción en base de datos
      await saveSubscriptionToDatabase(supabase, {
        organizationId: data.organizationId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        planCode: data.planCode,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      })

      // Obtener client secret si requiere acción adicional
      const latestInvoice: any = subscription.latest_invoice
      const paymentIntent = latestInvoice?.payment_intent

      return {
        success: true,
        subscriptionId: subscription.id,
        clientSecret: paymentIntent?.client_secret,
      }
    }
  } catch (error: any) {
    console.error('❌ Error creando suscripción:', error)
    return {
      success: false,
      error: error.message || 'Error creando suscripción',
    }
  }
}

/**
 * Guardar suscripción en base de datos
 */
async function saveSubscriptionToDatabase(
  supabase: any,
  data: {
    organizationId: number
    stripeSubscriptionId: string
    stripeCustomerId: string
    planCode: string
    status: string
    trialEnd?: Date
    currentPeriodStart: Date
    currentPeriodEnd: Date
  }
) {
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      organization_id: data.organizationId,
      stripe_subscription_id: data.stripeSubscriptionId,
      stripe_customer_id: data.stripeCustomerId,
      plan_code: data.planCode,
      status: data.status,
      trial_end: data.trialEnd?.toISOString(),
      current_period_start: data.currentPeriodStart.toISOString(),
      current_period_end: data.currentPeriodEnd.toISOString(),
      cancel_at_period_end: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'stripe_subscription_id',
    })

  if (error) {
    console.error('❌ Error guardando suscripción en BD:', error)
    throw new Error('Error guardando suscripción en base de datos')
  }

  console.log('✅ Suscripción guardada en BD')
}

/**
 * Cancelar suscripción
 */
export async function cancelSubscription(subscriptionId: string, immediate: boolean = false) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: !immediate,
    })

    if (immediate) {
      await stripe.subscriptions.cancel(subscriptionId)
    }

    console.log('✅ Suscripción cancelada:', subscriptionId)
    
    return {
      success: true,
      subscriptionId: subscription.id,
      canceledAt: immediate ? new Date() : new Date((subscription as any).current_period_end * 1000),
    }
  } catch (error: any) {
    console.error('❌ Error cancelando suscripción:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Actualizar payment method de suscripción
 */
export async function updateSubscriptionPaymentMethod(
  subscriptionId: string,
  paymentMethodId: string
) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: subscription.customer as string,
    })

    await stripe.customers.update(subscription.customer as string, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    })

    console.log('✅ Payment method actualizado para suscripción:', subscriptionId)
    
    return {
      success: true,
      subscriptionId,
    }
  } catch (error: any) {
    console.error('❌ Error actualizando payment method:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}
