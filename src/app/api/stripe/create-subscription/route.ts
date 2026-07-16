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
    // Obtener datos del body primero
    const body = await request.json()

    // Crear cliente de Supabase con service role para permitir operaciones sin sesión
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    if (!supabaseServiceKey) {
      console.error('❌ No hay ninguna key de Supabase configurada');
      return NextResponse.json(
        { error: 'Error de configuración del servidor - faltan credenciales de Supabase' },
        { status: 500 }
      )
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    
    // Intentar obtener usuario de la sesión si existe
    const cookieStore = await cookies()
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    // Si hay userId en el body y no hay sesión, verificar que el usuario exista
    let customerEmail = user?.email
    let customerName = user?.user_metadata?.first_name 
      ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
      : undefined

    console.log('🔍 DEBUG API - user de sesión:', user?.id);
    console.log('🔍 DEBUG API - userId del body:', body.userId);
    console.log('🔍 DEBUG API - email del body:', body.email);
    console.log('🔍 DEBUG API - customerEmail de sesión:', customerEmail);

    // Usar email del body si se proporciona (desde el signup)
    if (!customerEmail && body.email) {
      customerEmail = body.email;
      customerName = body.customerName;
      console.log('🔍 DEBUG API - Usando email del body:', customerEmail);
    }

    // Si no hay email todavía, buscar en BD
    if (!customerEmail && body.userId) {
      // Obtener datos del usuario desde la base de datos
      console.log('🔍 DEBUG API - Buscando usuario en BD con ID:', body.userId);
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', body.userId)
        .single()
      
      console.log('🔍 DEBUG API - Resultado de profiles:', userData, 'Error:', userError);
      
      if (userData) {
        customerEmail = userData.email
        customerName = userData.first_name 
          ? `${userData.first_name} ${userData.last_name || ''}`.trim()
          : undefined
      }
    }

    // Validar campos requeridos
    if (!body.organizationId || !body.planCode || !body.billingPeriod) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: organizationId, planCode, billingPeriod' },
        { status: 400 }
      )
    }

    if (!customerEmail) {
      console.error('❌ API - No se pudo determinar el email. userId:', body.userId, 'user:', user?.id, 'email body:', body.email);
      return NextResponse.json(
        { error: 'No se pudo determinar el email del usuario' },
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
    // Solo verificar si hay una sesión activa (no durante signup)
    if (user?.id) {
      const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', body.organizationId)
        .single()

      if (membershipError || !membership) {
        console.error('❌ API - Error de membresía:', membershipError, 'userId:', user.id, 'orgId:', body.organizationId);
        return NextResponse.json(
          { error: 'No tienes acceso a esta organización' },
          { status: 403 }
        )
      }
    } else {
      console.log('🔍 DEBUG API - Skip verificación membresía (signup sin sesión)');
    }

    // Preparar datos para crear suscripción
    const subscriptionData: CreateSubscriptionData = {
      organizationId: body.organizationId,
      planCode: body.planCode,
      billingPeriod: body.billingPeriod,
      useTrial: body.useTrial !== false, // Default true si no se especifica
      customerEmail: customerEmail,
      customerName: body.customerName || (user?.user_metadata?.first_name 
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
        : undefined),
      paymentMethodId: body.paymentMethodId,
      existingCustomerId: body.existingCustomerId,
      enterpriseConfig: body.enterpriseConfig, // <-- Agregar configuración Enterprise
      couponCode: body.couponCode, // <-- Código de cupón de descuento
    }

    // Crear suscripción
    console.log('🔍 DEBUG API - Creando suscripción con datos:', subscriptionData);
    const result = await createSubscription(subscriptionData)
    console.log('🔍 DEBUG API - Resultado de createSubscription:', result);

    if (!result.success) {
      console.error('❌ API - Error en createSubscription:', result.error);
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    // Log de auditoría
    console.log('✅ Suscripción creada por usuario:', user?.id || body.userId, '- Sub:', result.subscriptionId, '- Customer:', result.customerId)

    // Retornar resultado
    const response = {
      success: true,
      subscriptionId: result.subscriptionId,
      customerId: result.customerId,
      clientSecret: result.clientSecret,
      trialEnd: result.trialEnd,
    };
    console.log('🔍 DEBUG API - Respuesta:', response);
    return NextResponse.json(response);
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
