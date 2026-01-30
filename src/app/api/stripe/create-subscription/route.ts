/**
 * API Endpoint: Crear Suscripción de Stripe
 * GO Admin ERP - Create Subscription
 * 
 * Este endpoint crea una suscripción en Stripe con o sin trial
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSubscription, CreateSubscriptionData } from '@/lib/stripe/subscriptionService'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * POST /api/stripe/create-subscription
 * 
 * Body esperado:
 * {
 *   organizationId: number,
 *   planCode: string, // 'basic' | 'pro' | 'enterprise'
 *   billingPeriod: 'monthly' | 'yearly',
 *   useTrial: boolean, // true = 15 días gratis, false = pagar ahora
 *   paymentMethodId?: string // Requerido si useTrial = false
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
    if (!body.organizationId || !body.planCode || !body.billingPeriod) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: organizationId, planCode, billingPeriod' },
        { status: 400 }
      )
    }

    // Si no usa trial, el payment method es requerido
    if (body.useTrial === false && !body.paymentMethodId) {
      return NextResponse.json(
        { error: 'Payment method es requerido para suscripciones sin trial' },
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

    // Preparar datos para crear suscripción
    const subscriptionData: CreateSubscriptionData = {
      organizationId: body.organizationId,
      planCode: body.planCode,
      billingPeriod: body.billingPeriod,
      useTrial: body.useTrial !== false, // Default true si no se especifica
      customerEmail: user.email!,
      customerName: user.user_metadata?.first_name 
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
        : undefined,
      paymentMethodId: body.paymentMethodId,
      existingCustomerId: body.existingCustomerId, // Customer creado en el paso de método de pago
    }

    // Crear suscripción
    const result = await createSubscription(subscriptionData)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    // Log de auditoría
    console.log('✅ Suscripción creada por usuario:', user.id, '- Sub:', result.subscriptionId)

    // Retornar resultado
    return NextResponse.json({
      success: true,
      subscriptionId: result.subscriptionId,
      clientSecret: result.clientSecret,
      trialEnd: result.trialEnd,
    })
  } catch (error: any) {
    console.error('❌ Error en /api/stripe/create-subscription:', error)

    return NextResponse.json(
      {
        error: error.message || 'Error creando suscripción',
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
