/**
 * API Endpoint: Crear Payment Intent de Stripe
 * GO Admin ERP - Create Payment Intent
 *
 * Este endpoint crea un Payment Intent en Stripe para procesar un pago.
 * Se llama desde el frontend antes de mostrar el formulario de pago.
 *
 * POST /api/stripe/create-payment-intent
 *
 * Body esperado:
 * {
 *   amount: number,
 *   currency: string,
 *   customerId?: string,
 *   organizationId?: number,   // si viene, debe ser la de la sesión (403 si no)
 *   branchId: number,          // debe ser de la organización de la sesión (404 si no)
 *   description?: string,
 *   metadata?: object,
 *   saleId?: string,
 *   invoiceId?: string,
 *   accountReceivableId?: string
 * }
 *
 * GO-sec (auditoría 2026-09-24): la ruta creaba un cliente de Supabase SIN
 * cookies y le pedía el usuario, así que respondía 401 siempre (y
 * `/api/stripe/` está fuera del middleware). Ahora la sesión es la real
 * (`getServerOrgContext`), la organización sale de ella y no del body
 * (`readOrgBody`: 403 + registro si el body trae otra) y la sucursal se
 * comprueba contra esa organización. Sin GET (Next responde 405).
 */

import { NextResponse } from 'next/server'
import { createPaymentIntent } from '@/lib/stripe/paymentService'
import type { CreatePaymentIntentData } from '@/lib/stripe/types'
import { getServerOrgContext, readOrgBody } from '@/lib/utils/orgContext'
import { assertRecordOfOrg, routeErrorResponse } from '@/lib/security/orgGuards'

const RUTA = 'stripe/create-payment-intent'

type Body = Partial<Omit<CreatePaymentIntentData, 'organizationId'>> & { organizationId?: unknown }

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request)
    const body = (await readOrgBody<Body | null>(ctx, request)) ?? {}

    if (!body.amount || !body.currency || !body.branchId) {
      return NextResponse.json({ error: 'Faltan campos requeridos: amount, currency, branchId' }, { status: 400 })
    }

    await assertRecordOfOrg(ctx, 'branches', body.branchId, 'Sucursal no encontrada')

    const paymentData: CreatePaymentIntentData = {
      amount: body.amount,
      currency: body.currency,
      organizationId: ctx.organizationId,
      branchId: body.branchId,
      customerId: body.customerId,
      description: body.description,
      metadata: body.metadata,
      saleId: body.saleId,
      invoiceId: body.invoiceId,
      accountReceivableId: body.accountReceivableId,
    }

    const paymentIntent = await createPaymentIntent(paymentData)

    console.log('[stripe/create-payment-intent] creado', {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      paymentIntentId: paymentIntent.paymentIntentId,
    })

    return NextResponse.json({
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.paymentIntentId,
    })
  } catch (err) {
    return routeErrorResponse(RUTA, err)
  }
}
