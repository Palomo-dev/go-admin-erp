/**
 * API para crear Setup Intent de Stripe
 * Permite agregar método de pago durante el registro
 */

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, tempCustomerId } = body

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email es requerido' },
        { status: 400 }
      )
    }

    let customerId = tempCustomerId

    // Si no hay customer temporal, crear uno nuevo o buscar existente
    if (!customerId) {
      // Buscar si ya existe un customer con este email
      const existingCustomers = await stripe.customers.list({
        email: email,
        limit: 1,
      })

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id
        console.log('✅ Customer existente encontrado:', customerId)
      } else {
        // Crear customer temporal
        const customer = await stripe.customers.create({
          email: email,
          name: name || undefined,
          metadata: {
            source: 'signup_flow',
            status: 'pending_verification',
          },
        })
        customerId = customer.id
        console.log('✅ Customer temporal creado:', customerId)
      }
    }

    // Crear Setup Intent para verificar el método de pago
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session', // Para cobros futuros
      metadata: {
        source: 'signup_flow',
      },
    })

    console.log('✅ Setup Intent creado:', setupIntent.id)

    return NextResponse.json({
      success: true,
      clientSecret: setupIntent.client_secret,
      customerId: customerId,
      setupIntentId: setupIntent.id,
    })

  } catch (error: any) {
    console.error('❌ Error creando Setup Intent:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

/**
 * Verificar estado del Setup Intent
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const setupIntentId = searchParams.get('setupIntentId')

    if (!setupIntentId) {
      return NextResponse.json(
        { success: false, error: 'Setup Intent ID es requerido' },
        { status: 400 }
      )
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)

    // Obtener información del método de pago si está confirmado
    let paymentMethodDetails = null
    if (setupIntent.status === 'succeeded' && setupIntent.payment_method) {
      const paymentMethod = await stripe.paymentMethods.retrieve(
        setupIntent.payment_method as string
      )
      
      paymentMethodDetails = {
        id: paymentMethod.id,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expMonth: paymentMethod.card?.exp_month,
        expYear: paymentMethod.card?.exp_year,
      }

      // Establecer como método de pago por defecto del customer
      if (setupIntent.customer) {
        await stripe.customers.update(setupIntent.customer as string, {
          invoice_settings: {
            default_payment_method: paymentMethod.id,
          },
        })
        console.log('✅ Método de pago establecido como default')
      }
    }

    return NextResponse.json({
      success: true,
      status: setupIntent.status,
      paymentMethod: paymentMethodDetails,
      customerId: setupIntent.customer,
    })

  } catch (error: any) {
    console.error('❌ Error verificando Setup Intent:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
