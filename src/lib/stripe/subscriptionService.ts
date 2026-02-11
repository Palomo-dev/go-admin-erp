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
import { getEnterprisePricing } from '@/lib/services/pricingService'

export interface CreateSubscriptionData {
  organizationId: number
  planCode: string // 'basic' | 'pro' | 'enterprise'
  billingPeriod: 'monthly' | 'yearly'
  useTrial: boolean // true = 15 días gratis, false = pagar inmediatamente
  customerEmail: string
  customerName?: string
  paymentMethodId?: string // Requerido si useTrial = false
  existingCustomerId?: string // Customer ID creado en el paso de método de pago
  enterpriseConfig?: {
    modulesCount: number
    branchesCount: number
    usersCount: number
    aiCredits: number  // Cantidad de créditos IA a comprar
    selectedModules: string[]
  }
}

export interface SubscriptionResult {
  success: boolean
  subscriptionId?: string
  customerId?: string // ID del customer de Stripe
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
    console.log('🔍 DEBUG createSubscription - Iniciando con datos:', data);
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    console.log('🔍 DEBUG createSubscription - SUPABASE_URL:', supabaseUrl ? 'OK' : 'MISSING');
    console.log('🔍 DEBUG createSubscription - ServiceKey:', supabaseServiceKey ? 'OK' : 'MISSING');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Obtener información del plan de la base de datos
    console.log('🔍 DEBUG createSubscription - Buscando plan:', data.planCode);
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('stripe_product_id, stripe_price_monthly_id, stripe_price_yearly_id, trial_days')
      .eq('code', data.planCode)
      .single()

    console.log('🔍 DEBUG createSubscription - Plan encontrado:', plan);
    console.log('🔍 DEBUG createSubscription - Error en plan:', planError);

    if (planError || !plan) {
      console.error('❌ Plan no encontrado:', planError);
      throw new Error('Plan no encontrado en base de datos: ' + data.planCode)
    }

    let priceId: string
    let calculatedPrice: number | undefined

    // Si es Enterprise con configuración, crear precio dinámico
    if (data.planCode === 'enterprise' && data.enterpriseConfig) {
      console.log('🔍 DEBUG createSubscription - Creando precio dinámico Enterprise:', data.enterpriseConfig);
      
      // Obtener precios desde la base de datos
      const pricing = await getEnterprisePricing();
      
      const additionalModules = Math.max(0, data.enterpriseConfig.modulesCount - 6);
      const modulesPrice = additionalModules * pricing.moduleUnitPrice;
      const branchesPrice = data.enterpriseConfig.branchesCount * pricing.branchUnitPrice;
      const usersPrice = data.enterpriseConfig.usersCount * pricing.userUnitPrice;
      const aiCreditsPrice = (data.enterpriseConfig.aiCredits || 0) * (pricing.aiCreditUnitPrice / 100); // Convertir centavos a dólares
      
      // Calcular precio mensual base
      const monthlyPrice = pricing.basePrice + modulesPrice + branchesPrice + usersPrice + aiCreditsPrice;
      
      // Aplicar descuento anual (2 meses gratis = precio mensual × 10)
      const isYearly = data.billingPeriod === 'yearly';
      calculatedPrice = isYearly ? Math.round(monthlyPrice * 10) : Math.round(monthlyPrice);
      
      console.log(`💰 Cotización Enterprise (${data.billingPeriod}):
        - Base: $${pricing.basePrice}
        - Módulos (${additionalModules} × $${pricing.moduleUnitPrice}): $${modulesPrice}
        - Sucursales (${data.enterpriseConfig.branchesCount} × $${pricing.branchUnitPrice}): $${branchesPrice}
        - Usuarios (${data.enterpriseConfig.usersCount} × $${pricing.userUnitPrice}): $${usersPrice}
        - Créditos IA (${data.enterpriseConfig.aiCredits || 0} × $${(pricing.aiCreditUnitPrice/100).toFixed(2)}): $${aiCreditsPrice.toFixed(2)}
        - Mensual: $${monthlyPrice}/mes
        - ${isYearly ? 'Anual (descuento 2 meses): $' + calculatedPrice + '/año' : 'Total: $' + calculatedPrice + '/mes'}`);
      
      // Crear producto en Stripe
      const product = await stripe.products.create({
        name: `Enterprise ${isYearly ? 'Anual' : 'Mensual'} - Org ${data.organizationId}`,
        description: `${data.enterpriseConfig.modulesCount} módulos, ${data.enterpriseConfig.branchesCount} sucursales, ${data.enterpriseConfig.usersCount} usuarios, ${data.enterpriseConfig.aiCredits || 0} créditos IA`,
        metadata: {
          organization_id: String(data.organizationId),
          modules_count: String(data.enterpriseConfig.modulesCount),
          branches_count: String(data.enterpriseConfig.branchesCount),
          users_count: String(data.enterpriseConfig.usersCount),
          ai_credits: String(data.enterpriseConfig.aiCredits || 0),
          billing_period: data.billingPeriod,
          is_dynamic: 'true',
        },
      })
      
      // Crear precio
      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(calculatedPrice * 100),
        currency: 'usd',
        recurring: { 
          interval: isYearly ? 'year' : 'month',
          interval_count: 1 
        },
      })
      
      priceId = stripePrice.id
      console.log('✅ Precio dinámico creado:', priceId, '- Precio:', calculatedPrice, '- Período:', data.billingPeriod);
    } else {
      // Usar precio fijo del plan
      if (!plan.stripe_product_id) {
        throw new Error(`Plan ${data.planCode} no tiene producto de Stripe configurado`)
      }

      priceId = data.billingPeriod === 'monthly' 
        ? plan.stripe_price_monthly_id 
        : plan.stripe_price_yearly_id

      if (!priceId) {
        throw new Error(`Plan ${data.planCode} no tiene precio ${data.billingPeriod} configurado en Stripe`)
      }
    }

    console.log('🔍 DEBUG createSubscription - priceId:', priceId);

    // 1. Crear o obtener customer en Stripe
    let customerId: string
    
    console.log('🔍 DEBUG createSubscription - customerEmail:', data.customerEmail);
    
    // Si ya existe un customer ID (del paso de método de pago), usarlo
    if (data.existingCustomerId) {
      customerId = data.existingCustomerId
      console.log('✅ Usando customer existente del registro:', customerId)
      
      // Actualizar metadata del customer con la organización
      await stripe.customers.update(customerId, {
        metadata: {
          organizationId: data.organizationId.toString(),
          planCode: data.planCode,
          status: 'active',
        },
      })
    } else {
      // Buscar si ya existe un customer con este email
      console.log('🔍 DEBUG createSubscription - Buscando customer existente...');
      const existingCustomers = await stripe.customers.list({
        email: data.customerEmail,
        limit: 1,
      })

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id
        console.log('✅ Customer existente encontrado:', customerId)
      } else {
        console.log('🔍 DEBUG createSubscription - Creando nuevo customer...');
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
        metadata: data.enterpriseConfig ? {
          custom_config: {
            modules_count: data.enterpriseConfig.modulesCount,
            branches_count: data.enterpriseConfig.branchesCount,
            users_count: data.enterpriseConfig.usersCount,
            ai_credits: data.enterpriseConfig.aiCredits || 0,
            selected_modules: data.enterpriseConfig.selectedModules,
            billing_period: data.billingPeriod,
          },
          is_enterprise_custom: true,
        } : {},
      })

      return {
        success: true,
        subscriptionId: subscription.id,
        customerId: customerId,
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
        metadata: data.enterpriseConfig ? {
          custom_config: {
            modules_count: data.enterpriseConfig.modulesCount,
            branches_count: data.enterpriseConfig.branchesCount,
            users_count: data.enterpriseConfig.usersCount,
            selected_modules: data.enterpriseConfig.selectedModules,
          },
          is_enterprise_custom: true,
        } : {},
      })

      // Obtener client secret si requiere acción adicional
      const latestInvoice: any = subscription.latest_invoice
      const paymentIntent = latestInvoice?.payment_intent

      return {
        success: true,
        subscriptionId: subscription.id,
        customerId: customerId,
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
    metadata?: any // <-- Agregar metadata opcional
  }
) {
  console.log('🔍 DEBUG saveSubscriptionToDatabase - Iniciando para orgId:', data.organizationId);

  // Crear cliente con service role key explícitamente para ignorar RLS
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseServiceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY no está configurado');
    throw new Error('Service role key no configurado');
  }
  
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Obtener el plan_id a partir del plan_code
  console.log('🔍 DEBUG saveSubscriptionToDatabase - Buscando plan_id para planCode:', data.planCode);
  const { data: planData, error: planError } = await serviceClient
    .from('plans')
    .select('id')
    .eq('code', data.planCode)
    .single();

  if (planError || !planData) {
    console.error('❌ Error obteniendo plan_id:', planError);
    throw new Error('No se pudo obtener el plan_id para el plan_code: ' + data.planCode);
  }

  const planId = planData.id;
  console.log('🔍 DEBUG saveSubscriptionToDatabase - plan_id obtenido:', planId);

  // Primero intentar actualizar la suscripción existente por organization_id
  const { data: existingSubs, error: queryError } = await serviceClient
    .from('subscriptions')
    .select('id, stripe_customer_id, stripe_subscription_id')
    .eq('organization_id', data.organizationId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (queryError) {
    console.error('❌ Error consultando suscripción existente:', queryError);
    throw new Error('Error consultando suscripción existente');
  }

  const existingSub = existingSubs?.[0];
  console.log('🔍 DEBUG saveSubscriptionToDatabase - Suscripción existente:', existingSub);

  if (existingSub) {
    // Actualizar suscripción existente
    console.log('🔍 DEBUG saveSubscriptionToDatabase - Actualizando suscripción existente:', existingSub.id);
    const { data: updateData, error } = await serviceClient
      .from('subscriptions')
      .update({
        stripe_subscription_id: data.stripeSubscriptionId,
        stripe_customer_id: data.stripeCustomerId,
        plan_id: planId,
        status: data.status,
        trial_end: data.trialEnd?.toISOString(),
        current_period_start: data.currentPeriodStart.toISOString(),
        current_period_end: data.currentPeriodEnd.toISOString(),
        cancel_at_period_end: false,
        metadata: data.metadata || {}, // <-- Guardar metadata
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingSub.id)
      .select();

    if (error) {
      console.error('❌ Error actualizando suscripción en BD:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      throw new Error('Error actualizando suscripción en base de datos: ' + (error.message || JSON.stringify(error)));
    }
    console.log('✅ Suscripción actualizada en BD:', updateData);
  } else {
    // Crear nueva suscripción
    console.log('🔍 DEBUG saveSubscriptionToDatabase - Creando nueva suscripción');
    const { data: insertData, error } = await serviceClient
      .from('subscriptions')
      .insert({
        organization_id: data.organizationId,
        stripe_subscription_id: data.stripeSubscriptionId,
        stripe_customer_id: data.stripeCustomerId,
        plan_id: planId,
        status: data.status,
        trial_end: data.trialEnd?.toISOString(),
        current_period_start: data.currentPeriodStart.toISOString(),
        current_period_end: data.currentPeriodEnd.toISOString(),
        cancel_at_period_end: false,
        metadata: data.metadata || {}, // <-- Guardar metadata
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error('❌ Error creando suscripción en BD:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      throw new Error('Error creando suscripción en base de datos: ' + (error.message || JSON.stringify(error)));
    }
    console.log('✅ Nueva suscripción creada en BD:', insertData);
  }

  console.log('✅ Suscripción guardada en BD completado');
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

/**
 * Cambiar plan de suscripción en Stripe
 */
export async function changeSubscriptionPlan(
  stripeSubscriptionId: string,
  newPlanCode: string,
  billingPeriod: 'monthly' | 'yearly'
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Obtener el nuevo plan
    const { data: newPlan, error: planError } = await supabase
      .from('plans')
      .select('id, stripe_price_monthly_id, stripe_price_yearly_id')
      .eq('code', newPlanCode)
      .single()

    if (planError || !newPlan) {
      throw new Error('Plan no encontrado')
    }

    const newPriceId = billingPeriod === 'monthly' 
      ? newPlan.stripe_price_monthly_id 
      : newPlan.stripe_price_yearly_id

    if (!newPriceId) {
      throw new Error(`Plan ${newPlanCode} no tiene precio configurado para ${billingPeriod}`)
    }

    // Obtener la suscripción actual
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
    
    // Actualizar la suscripción con el nuevo precio
    const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId,
      }],
      proration_behavior: 'create_prorations',
      metadata: {
        ...subscription.metadata,
        planCode: newPlanCode,
        billingPeriod,
      },
    })

    console.log('✅ Plan actualizado en Stripe:', updatedSubscription.id)

    // Actualizar en Supabase
    await supabase
      .from('subscriptions')
      .update({
        plan_id: newPlan.id,
        billing_period: billingPeriod,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', stripeSubscriptionId)

    return {
      success: true,
      subscriptionId: updatedSubscription.id,
      newPlanCode,
      billingPeriod,
    }
  } catch (error: any) {
    console.error('❌ Error cambiando plan:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Obtener portal de facturación de Stripe
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })

    return {
      success: true,
      url: session.url,
    }
  } catch (error: any) {
    console.error('❌ Error creando sesión del portal:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Obtener facturas de un cliente
 */
export async function getCustomerInvoices(customerId: string, limit: number = 10) {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit,
    })

    return {
      success: true,
      invoices: invoices.data.map(inv => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount: inv.amount_due,
        currency: inv.currency,
        created: new Date(inv.created * 1000),
        dueDate: inv.due_date ? new Date(inv.due_date * 1000) : null,
        paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : null,
        invoicePdf: inv.invoice_pdf,
        hostedInvoiceUrl: inv.hosted_invoice_url,
      })),
    }
  } catch (error: any) {
    console.error('❌ Error obteniendo facturas:', error)
    return {
      success: false,
      error: error.message,
      invoices: [],
    }
  }
}

/**
 * Reactivar suscripción cancelada
 */
export async function reactivateSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    })

    console.log('✅ Suscripción reactivada:', subscriptionId)
    
    return {
      success: true,
      subscriptionId: subscription.id,
    }
  } catch (error: any) {
    console.error('❌ Error reactivando suscripción:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Obtener métodos de pago de un cliente
 */
export async function getCustomerPaymentMethods(customerId: string) {
  try {
    console.log('🔍 DEBUG getCustomerPaymentMethods - customerId:', customerId);
    
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    })
    
    console.log('🔍 DEBUG getCustomerPaymentMethods - Stripe response:', paymentMethods.data.length, 'métodos encontrados');
    console.log('🔍 DEBUG getCustomerPaymentMethods - Data:', paymentMethods.data);

    return {
      success: true,
      paymentMethods: paymentMethods.data.map(pm => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
        isDefault: false, // Se establece después
      })),
    }
  } catch (error: any) {
    console.error('❌ Error obteniendo métodos de pago:', error)
    return {
      success: false,
      error: error.message,
      paymentMethods: [],
    }
  }
}

/**
 * Eliminar método de pago
 */
export async function deletePaymentMethod(paymentMethodId: string) {
  try {
    await stripe.paymentMethods.detach(paymentMethodId)
    
    return { success: true }
  } catch (error: any) {
    console.error('❌ Error eliminando método de pago:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Crear Setup Intent para agregar método de pago
 */
export async function createSetupIntent(customerId: string) {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    })

    return {
      success: true,
      clientSecret: setupIntent.client_secret,
    }
  } catch (error: any) {
    console.error('❌ Error creando setup intent:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}
