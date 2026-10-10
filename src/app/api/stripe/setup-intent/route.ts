/**
 * API para crear Setup Intent de Stripe
 * Permite agregar método de pago durante el registro
 *
 * Ruta PÚBLICA a propósito: el paso de tarjeta del alta (/auth/signup y el
 * asistente de nueva organización) ocurre antes de que exista la cuenta, así
 * que no hay sesión que exigir. GO-sec (auditoría 2026-09-24) la deja
 * inofensiva en lugar de abierta:
 *
 * POST
 *  - Antes buscaba el cliente de Stripe EXISTENTE por correo (o aceptaba un
 *    `tempCustomerId` cualquiera) y devolvía su id y un SetupIntent sobre él:
 *    con el correo de otra persona se le colgaba una tarjeta a su cliente.
 *    Ahora SIEMPRE crea un cliente nuevo de alta (`clienteDeAlta.ts`); nunca
 *    lista clientes por correo ni acepta un id del cliente.
 *  - Límite por IP (crear objetos en Stripe cuesta y no debe poder
 *    automatizarse sin freno).
 *
 * GET ?setupIntentId=seti_…
 *  - Solo actúa sobre SetupIntents del alta (`metadata.source = signup_flow`)
 *    cuyo cliente sigue siendo un cliente de alta pendiente; si no, 404 sin
 *    tocar nada. Antes fijaba la tarjeta como predeterminada de CUALQUIER
 *    cliente dueño del SetupIntent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/server'
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit'
import { ESTADO_PENDIENTE, ORIGEN_ALTA, esClienteDeAltaPendiente, recuperarCliente } from '@/lib/stripe/clienteDeAlta'
import { parametrosSetupIntent } from '@/lib/stripe/medioDePagoSuscripcion'

export const dynamic = 'force-dynamic'

const LIMITE_POST_IP = { limit: 10, windowMs: 15 * 60 * 1000 }
const LIMITE_GET_IP = { limit: 30, windowMs: 15 * 60 * 1000 }
const CORREO_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

function demasiadas() {
  return NextResponse.json({ success: false, error: 'Demasiadas solicitudes. Intenta en unos minutos.' }, { status: 429 })
}

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ success: false, error: 'Stripe no está configurado' }, { status: 503 })
    }

    const ip = getClientIp(request)
    const rl = await checkRateLimits([{ key: `stripe:setup-intent:post:ip:${ip}`, opts: LIMITE_POST_IP }])
    if (!rl.allowed) return demasiadas()

    let body: { email?: unknown; name?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 })
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''

    if (!CORREO_RE.test(email)) {
      return NextResponse.json({ success: false, error: 'Email es requerido' }, { status: 400 })
    }

    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: { source: ORIGEN_ALTA, status: ESTADO_PENDIENTE },
    })

    const setupIntent = await stripe.setupIntents.create(
      parametrosSetupIntent(customer.id, { source: ORIGEN_ALTA }),
    )

    return NextResponse.json({
      success: true,
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
      setupIntentId: setupIntent.id,
    })
  } catch (error: unknown) {
    console.error('[stripe/setup-intent] Error creando Setup Intent:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 })
  }
}

/**
 * Verificar estado del Setup Intent
 */
export async function GET(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ success: false, error: 'Stripe no está configurado' }, { status: 503 })
    }

    const ip = getClientIp(request)
    const rl = await checkRateLimits([{ key: `stripe:setup-intent:get:ip:${ip}`, opts: LIMITE_GET_IP }])
    if (!rl.allowed) return demasiadas()

    const setupIntentId = request.nextUrl.searchParams.get('setupIntentId') ?? ''
    if (!/^seti_[A-Za-z0-9]{6,64}$/.test(setupIntentId)) {
      return NextResponse.json({ success: false, error: 'Setup Intent ID es requerido' }, { status: 400 })
    }

    const noEncontrado = NextResponse.json({ success: false, error: 'Setup Intent no encontrado' }, { status: 404 })

    let setupIntent
    try {
      setupIntent = await stripe.setupIntents.retrieve(setupIntentId)
    } catch {
      return noEncontrado
    }
    const customerId = typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer?.id
    if (setupIntent.metadata?.source !== ORIGEN_ALTA || !customerId) return noEncontrado
    if (!esClienteDeAltaPendiente(await recuperarCliente(stripe, customerId))) return noEncontrado

    let paymentMethodDetails = null
    if (setupIntent.status === 'succeeded' && setupIntent.payment_method) {
      const paymentMethodId =
        typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method.id
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)

      paymentMethodDetails = {
        id: paymentMethod.id,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expMonth: paymentMethod.card?.exp_month,
        expYear: paymentMethod.card?.exp_year,
      }

      // Predeterminada SOLO del cliente de alta que creó este mismo flujo.
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethod.id },
      })
    }

    return NextResponse.json({
      success: true,
      status: setupIntent.status,
      paymentMethod: paymentMethodDetails,
      customerId,
    })
  } catch (error: unknown) {
    console.error('[stripe/setup-intent] Error verificando Setup Intent:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 })
  }
}
