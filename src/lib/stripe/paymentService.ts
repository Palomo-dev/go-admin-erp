/**
 * Servicio de Pagos con Stripe
 * GO Admin ERP - Stripe Payment Service
 * 
 * Este servicio maneja toda la lógica de negocio relacionada con pagos de Stripe
 * incluyendo la creación de Payment Intents, procesamiento de pagos,
 * y sincronización con la base de datos.
 */

import { stripe, convertToCents, getStripeErrorMessage, isValidAmount } from './server'
import {
  CreatePaymentIntentData,
  PaymentIntentResponse,
  ProcessedPayment,
  PaymentStatus,
  RefundOptions,
  RefundResult,
} from './types'
import { createClient } from '@supabase/supabase-js'

/**
 * Crear un Payment Intent de Stripe
 * 
 * @param data - Datos del pago
 * @returns Payment Intent creado
 */
export async function createPaymentIntent(
  data: CreatePaymentIntentData
): Promise<PaymentIntentResponse> {
  try {
    // Validar monto
    if (!isValidAmount(data.amount, data.currency)) {
      throw new Error(
        `Monto inválido: ${data.amount} ${data.currency.toUpperCase()}. ` +
        'El monto debe ser mayor que el mínimo permitido por Stripe.'
      )
    }

    // Convertir monto a centavos
    const amountInCents = convertToCents(data.amount, data.currency)

    // Preparar metadata
    const metadata: Record<string, string> = {
      organizationId: data.organizationId.toString(),
      branchId: data.branchId.toString(),
      ...data.metadata,
    }

    if (data.customerId) {
      metadata.customerId = data.customerId
    }

    if (data.saleId) {
      metadata.saleId = data.saleId
    }

    if (data.invoiceId) {
      metadata.invoiceId = data.invoiceId
    }

    if (data.accountReceivableId) {
      metadata.accountReceivableId = data.accountReceivableId
    }

    // Crear Payment Intent en Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: data.currency.toLowerCase(),
      description: data.description || 'Pago GO Admin ERP',
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    })

    console.log('✅ Payment Intent creado:', paymentIntent.id)

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      currency: data.currency,
    }
  } catch (error: any) {
    console.error('❌ Error creando Payment Intent:', error)
    throw new Error(getStripeErrorMessage(error))
  }
}

/**
 * Procesar un pago exitoso y guardarlo en la base de datos
 * 
 * @param paymentIntentId - ID del Payment Intent de Stripe
 * @returns Pago procesado
 */
export async function processSuccessfulPayment(
  paymentIntentId: string
): Promise<ProcessedPayment> {
  try {
    // Obtener detalles del Payment Intent de Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status !== 'succeeded') {
      throw new Error('El pago no ha sido completado exitosamente')
    }

    // Crear cliente de Supabase (servidor)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Extraer metadata
    const metadata = paymentIntent.metadata
    const organizationId = parseInt(metadata.organizationId || '0')
    const branchId = parseInt(metadata.branchId || '0')

    // Preparar datos del pago
    const paymentData = {
      organization_id: organizationId,
      branch_id: branchId,
      amount: paymentIntent.amount / 100, // Convertir de centavos
      payment_method: 'card', // Stripe siempre es tarjeta
      source: metadata.saleId ? 'invoice_sales' : (metadata.accountReceivableId ? 'account_receivable' : 'manual'),
      source_id: metadata.saleId || metadata.invoiceId || metadata.accountReceivableId,
      reference: paymentIntentId, // Guardar ID de Stripe como referencia
      status: 'completed' as const,
      notes: `Pago procesado con Stripe - ${paymentIntent.id}`,
      created_by: (await supabase.auth.getUser()).data.user?.id || null,
    }

    // Guardar pago en la base de datos
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert(paymentData)
      .select()
      .single()

    if (paymentError) {
      console.error('❌ Error guardando pago en BD:', paymentError)
      throw new Error('Error guardando el pago en la base de datos')
    }

    console.log('✅ Pago guardado en BD:', payment.id)

    // Si hay sale_id, actualizar la venta
    if (metadata.saleId) {
      await updateSaleBalance(metadata.saleId, paymentIntent.amount / 100)
    }

    // Si hay invoice_id, actualizar la factura
    if (metadata.invoiceId) {
      await updateInvoiceBalance(metadata.invoiceId, paymentIntent.amount / 100)
    }

    // Si hay account_receivable_id, el trigger de la BD se encargará

    return {
      id: payment.id,
      stripePaymentIntentId: paymentIntentId,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: PaymentStatus.SUCCEEDED,
      customerId: metadata.customerId,
      organizationId,
      branchId,
      saleId: metadata.saleId,
      invoiceId: metadata.invoiceId,
      accountReceivableId: metadata.accountReceivableId,
      createdAt: new Date(paymentIntent.created * 1000),
      metadata: paymentIntent.metadata,
    }
  } catch (error: any) {
    console.error('❌ Error procesando pago exitoso:', error)
    throw error
  }
}

/**
 * Actualizar el balance de una venta
 * 
 * @param saleId - ID de la venta
 * @param paymentAmount - Monto del pago
 */
async function updateSaleBalance(saleId: string, paymentAmount: number): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Obtener venta actual
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select('balance, total')
    .eq('id', saleId)
    .single()

  if (saleError || !sale) {
    console.error('❌ Error obteniendo venta:', saleError)
    return
  }

  // Calcular nuevo balance
  const newBalance = Math.max(0, sale.balance - paymentAmount)
  const newStatus = newBalance === 0 ? 'paid' : 'partial'

  // Actualizar venta
  const { error: updateError } = await supabase
    .from('sales')
    .update({
      balance: newBalance,
      status: newStatus,
    })
    .eq('id', saleId)

  if (updateError) {
    console.error('❌ Error actualizando balance de venta:', updateError)
  } else {
    console.log('✅ Balance de venta actualizado:', saleId)
  }
}

/**
 * Actualizar el balance de una factura
 * 
 * @param invoiceId - ID de la factura
 * @param paymentAmount - Monto del pago
 */
async function updateInvoiceBalance(invoiceId: string, paymentAmount: number): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Obtener factura actual
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoice_sales')
    .select('balance, total')
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    console.error('❌ Error obteniendo factura:', invoiceError)
    return
  }

  // Calcular nuevo balance
  const newBalance = Math.max(0, invoice.balance - paymentAmount)
  const newStatus = newBalance === 0 ? 'paid' : 'partial'

  // Actualizar factura
  const { error: updateError } = await supabase
    .from('invoice_sales')
    .update({
      balance: newBalance,
      status: newStatus,
    })
    .eq('id', invoiceId)

  if (updateError) {
    console.error('❌ Error actualizando balance de factura:', updateError)
  } else {
    console.log('✅ Balance de factura actualizado:', invoiceId)
  }
}

/**
 * Procesar un reembolso
 * 
 * @param options - Opciones del reembolso
 * @returns Resultado del reembolso
 */
export async function processRefund(options: RefundOptions): Promise<RefundResult> {
  try {
    // Crear reembolso en Stripe
    const refund = await stripe.refunds.create({
      payment_intent: options.paymentIntentId,
      amount: options.amount ? convertToCents(options.amount, 'usd') : undefined,
      reason: options.reason,
      metadata: options.metadata,
    })

    console.log('✅ Reembolso creado:', refund.id)

    // Aquí podrías guardar el reembolso en tu base de datos
    // y actualizar los balances correspondientes

    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status ?? undefined,
    }
  } catch (error: any) {
    console.error('❌ Error procesando reembolso:', error)
    return {
      success: false,
      error: getStripeErrorMessage(error),
    }
  }
}

/**
 * Obtener información de un Payment Intent
 * 
 * @param paymentIntentId - ID del Payment Intent
 * @returns Payment Intent de Stripe
 */
export async function getPaymentIntent(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    return paymentIntent
  } catch (error: any) {
    console.error('❌ Error obteniendo Payment Intent:', error)
    throw new Error(getStripeErrorMessage(error))
  }
}

/**
 * Cancelar un Payment Intent
 * 
 * @param paymentIntentId - ID del Payment Intent
 * @returns Payment Intent cancelado
 */
export async function cancelPaymentIntent(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId)
    console.log('✅ Payment Intent cancelado:', paymentIntentId)
    return paymentIntent
  } catch (error: any) {
    console.error('❌ Error cancelando Payment Intent:', error)
    throw new Error(getStripeErrorMessage(error))
  }
}
