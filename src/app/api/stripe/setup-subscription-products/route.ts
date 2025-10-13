/**
 * API Endpoint: Setup Subscription Products in Stripe
 * GO Admin ERP - Setup Subscription Products
 * 
 * Este endpoint crea productos y precios recurrentes en Stripe
 * para las suscripciones del sistema.
 */

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/server'

/**
 * POST /api/stripe/setup-subscription-products
 * 
 * Crea productos y precios de suscripción en Stripe
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { planCode } = body

    if (!planCode) {
      return NextResponse.json(
        { error: 'planCode es requerido' },
        { status: 400 }
      )
    }

    // Configuración de planes
    const plansConfig: Record<string, {
      name: string
      description: string
      monthlyPrice: number
      yearlyPrice: number
      metadata: Record<string, string>
    }> = {
      'basic': {
        name: 'Plan Básico - GO Admin ERP',
        description: 'Plan ideal para negocios en crecimiento. Incluye hasta 10 módulos, 5 sucursales, 50GB de almacenamiento y soporte por email.',
        monthlyPrice: 2000, // $20.00 en centavos
        yearlyPrice: 19200, // $192.00 en centavos (20% descuento)
        metadata: {
          plan_code: 'basic',
          trial_days: '15',
          max_modules: '10',
          max_branches: '5',
        },
      },
      'pro': {
        name: 'Plan Pro - GO Admin ERP',
        description: 'Plan avanzado para empresas establecidas. Incluye hasta 100 módulos, 50 sucursales, 1TB de almacenamiento y soporte prioritario 24/7.',
        monthlyPrice: 4000, // $40.00 en centavos
        yearlyPrice: 38400, // $384.00 en centavos (20% descuento)
        metadata: {
          plan_code: 'pro',
          trial_days: '15',
          max_modules: '100',
          max_branches: '50',
        },
      },
    }

    const config = plansConfig[planCode]
    if (!config) {
      return NextResponse.json(
        { error: 'Plan no encontrado' },
        { status: 404 }
      )
    }

    // Crear producto en Stripe
    const product = await stripe.products.create({
      name: config.name,
      description: config.description,
      metadata: config.metadata,
    })

    console.log('✅ Producto creado:', product.id)

    // Crear precio mensual recurrente
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: config.monthlyPrice,
      currency: 'usd',
      recurring: {
        interval: 'month',
        trial_period_days: 15,
      },
      metadata: {
        plan_code: planCode,
        billing_period: 'monthly',
      },
    })

    console.log('✅ Precio mensual creado:', monthlyPrice.id)

    // Crear precio anual recurrente
    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: config.yearlyPrice,
      currency: 'usd',
      recurring: {
        interval: 'year',
        trial_period_days: 15,
      },
      metadata: {
        plan_code: planCode,
        billing_period: 'yearly',
      },
    })

    console.log('✅ Precio anual creado:', yearlyPrice.id)

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
      },
      prices: {
        monthly: {
          id: monthlyPrice.id,
          amount: monthlyPrice.unit_amount,
        },
        yearly: {
          id: yearlyPrice.id,
          amount: yearlyPrice.unit_amount,
        },
      },
    })
  } catch (error: any) {
    console.error('❌ Error creando productos:', error)
    return NextResponse.json(
      {
        error: error.message || 'Error creando productos',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

/**
 * GET - No permitido
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Método no permitido' },
    { status: 405 }
  )
}
