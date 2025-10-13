/**
 * API Endpoint: Crear Payment Intent de Stripe
 * GO Admin ERP - Create Payment Intent
 * 
 * Este endpoint crea un Payment Intent en Stripe para procesar un pago.
 * Se llama desde el frontend antes de mostrar el formulario de pago.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createPaymentIntent } from '@/lib/stripe/paymentService'
import { CreatePaymentIntentData } from '@/lib/stripe/types'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * POST /api/stripe/create-payment-intent
 * 
 * Body esperado:
 * {
 *   amount: number,
 *   currency: string,
 *   customerId?: string,
 *   organizationId: number,
 *   branchId: number,
 *   description?: string,
 *   metadata?: object,
 *   saleId?: string,
 *   invoiceId?: string,
 *   accountReceivableId?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Crear cliente de Supabase con sesión
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const cookieStore = await cookies()
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    
    // Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      )
    }

    // Obtener datos del body
    const body = await request.json()

    // Validar campos requeridos
    if (!body.amount || !body.currency || !body.organizationId || !body.branchId) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: amount, currency, organizationId, branchId' },
        { status: 400 }
      )
    }

    // Verificar que el usuario pertenezca a la organización
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', body.organizationId)
      .single()

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: 'No tienes acceso a esta organización' },
        { status: 403 }
      )
    }

    // Preparar datos para crear Payment Intent
    const paymentData: CreatePaymentIntentData = {
      amount: body.amount,
      currency: body.currency,
      organizationId: body.organizationId,
      branchId: body.branchId,
      customerId: body.customerId,
      description: body.description,
      metadata: body.metadata,
      saleId: body.saleId,
      invoiceId: body.invoiceId,
      accountReceivableId: body.accountReceivableId,
    }

    // Crear Payment Intent
    const paymentIntent = await createPaymentIntent(paymentData)

    // Log de auditoría
    console.log('✅ Payment Intent creado por usuario:', user.id, '- PI:', paymentIntent.paymentIntentId)

    // Retornar client secret
    return NextResponse.json({
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.paymentIntentId,
    })
  } catch (error: any) {
    console.error('❌ Error en /api/stripe/create-payment-intent:', error)

    return NextResponse.json(
      {
        error: error.message || 'Error creando Payment Intent',
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
