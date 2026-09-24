/**
 * POST /api/stripe/confirm-plan-change — confirma en la base un cambio de plan
 * pagado con Stripe Checkout, sin esperar al webhook.
 *
 * GO-sec (auditoría 2026-09-24). Antes no tenía autenticación (y
 * `/api/stripe/` está fuera del middleware), usaba service role y tomaba la
 * organización del BODY por encima de la metadata del Checkout
 * (`organizationId || metadata.organizationId`): con un Checkout pagado propio
 * cualquiera cambiaba el plan de otra organización.
 *
 * Ahora, en este orden:
 *  1. Sesión y organización activa (`getServerOrgContext`) → 401/403.
 *  2. Permiso de facturación en ESA organización (admin o
 *     `billing_management`, resuelto en el servidor) → 403.
 *  3. Una organización en el body o la query distinta de la de la sesión →
 *     403 + registro (`readOrgBody`). El body ya no decide nada.
 *  4. El Checkout se lee de Stripe y su `metadata.organizationId` (puesta por
 *     el servidor en `create-checkout-session`) debe ser la organización de la
 *     sesión → si no, 403 + registro.
 *  5. Solo Checkouts de plan (`mode: subscription`, no addons) y completados.
 *  6. `aplicarCheckoutDePlan` (el mismo que usa el webhook), idempotente:
 *     repetir la llamada o que llegue también el webhook no escribe dos veces.
 *
 * Llamadores: ninguno en este repositorio ni en go-admin-super ni en
 * go-admin-sellers (verificado 2026-09-24); el webhook `checkout.session.
 * completed` hace el mismo trabajo. Se conserva endurecida porque el retorno
 * del Checkout (`?checkout=success&session_id=…`) puede usarla.
 */

import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getServerOrgContext, OrgContextError, readOrgBody } from '@/lib/utils/orgContext';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { exigirPermisoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { aplicarCheckoutDePlan, organizacionDelCheckout } from '@/lib/stripe/aplicarCheckoutDePlan';

const RUTA = 'stripe/confirm-plan-change';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoDeFacturacion(ctx, RUTA);

    const body = (await readOrgBody<Record<string, unknown> | null>(ctx, request)) ?? {};

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!/^cs_[A-Za-z0-9_]{8,255}$/.test(sessionId)) {
      return NextResponse.json({ error: 'sessionId inválido' }, { status: 400 });
    }
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 503 });
    }

    const checkout = await stripe.checkout.sessions.retrieve(sessionId);

    const orgDelCheckout = organizacionDelCheckout(checkout);
    if (orgDelCheckout !== ctx.organizationId) {
      console.warn('[stripe/confirm-plan-change] el Checkout es de otra organización → 403', {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        checkoutOrganizationId: orgDelCheckout || null,
      });
      throw new OrgContextError('Ese pago no es de tu organización', 403, 'FOREIGN_ORGANIZATION');
    }

    if (checkout.mode !== 'subscription' || checkout.metadata?.type === 'addon_subscription') {
      return NextResponse.json({ error: 'El Checkout no es un cambio de plan' }, { status: 400 });
    }
    if (checkout.status !== 'complete') {
      return NextResponse.json({ error: 'Checkout no completado', status: checkout.status }, { status: 409 });
    }

    const resultado = await aplicarCheckoutDePlan(getServiceClient(), stripe, checkout);
    if (resultado.estado === 'invalido') {
      return NextResponse.json({ error: resultado.motivo }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      alreadyApplied: resultado.estado === 'ya_aplicado',
      plan: resultado.plan,
    });
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
